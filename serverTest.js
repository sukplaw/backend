// server.js
import express from "express";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
app.use(express.json());

// Security headers (ง่าย ๆ แต่ได้ผล)
app.use(
  helmet({
    contentSecurityPolicy: false, // ปิด default CSP ไว้ก่อน ถ้ารู้โดเมน asset ค่อยเปิด
  })
);

// CORS (กำหนด origin ที่อนุญาต)
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:5173"],
    credentials: true,
  })
);

// Login rate limit กัน brute-force
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 นาที
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// ===== MySQL Pool =====
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "auth_min_rbac",
  waitForConnections: true,
  connectionLimit: 10,
});

// ===== Helpers =====
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || "dev_secret", {
    expiresIn: "1h",
  });
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token)
    return res.status(401).json({ error: "Unauthorized: missing token" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    req.user = payload; // { id, email, roles, permissions }
    return next();
  } catch {
    return res
      .status(401)
      .json({ error: "Unauthorized: invalid/expired token" });
  }
}

function requirePermission(permissionName) {
  return (req, res, next) => {
    const perms = req.user?.permissions || [];
    if (!perms.includes(permissionName)) {
      return res
        .status(403)
        .json({ error: "Forbidden: insufficient permission" });
    }
    next();
  };
}

// โหลด roles/permissions ของผู้ใช้
async function getUserRolesAndPerms(userId) {
  const [roles] = await pool.query(
    `SELECT r.name AS role
     FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ?`,
    [userId]
  );
  const roleNames = roles.map((r) => r.role);

  const [perms] = await pool.query(
    `SELECT DISTINCT p.name AS perm
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = ?`,
    [userId]
  );
  const permNames = perms.map((p) => p.perm);

  return { roles: roleNames, permissions: permNames };
}

// ===== Routes =====

// สมัคร (ใช้ง่าย: email+password + roles optional)
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, roles = ["user"] } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "email & password required" });
    if (password.length < 8)
      return res.status(400).json({ error: "password must be >= 8 chars" });

    const [dup] = await pool.query("SELECT id FROM users WHERE email=?", [
      email,
    ]);
    if (dup.length)
      return res.status(409).json({ error: "email already exists" });

    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES (?,?)",
      [email, hash]
    );
    const userId = result.insertId;

    // map roles
    const [roleRows] = await pool.query(
      "SELECT id, name FROM roles WHERE name IN (?)",
      [roles]
    );
    for (const r of roleRows) {
      await pool.query(
        "INSERT INTO user_roles (user_id, role_id) VALUES (?,?)",
        [userId, r.id]
      );
    }

    res.status(201).json({ message: "registered", user_id: userId });
  } catch (e) {
    res.status(500).json({ error: "server error" });
  }
});

// ล็อกอิน (เช็ครหัสผ่าน + ออก JWT + แนบสิทธิ์ลง payload)
app.post("/auth/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ error: "email & password required" });

    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email=? AND is_active=1",
      [email]
    );
    if (!rows.length)
      return res.status(401).json({ error: "invalid credentials" });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const { roles, permissions } = await getUserRolesAndPerms(user.id);
    const token = signToken({
      id: user.id,
      email: user.email,
      roles,
      permissions,
    });

    res.json({ access_token: token, roles, permissions });
  } catch (e) {
    res.status(500).json({ error: "server error" });
  }
});

// ตรวจ token + ดูข้อมูลตัวเอง
app.get("/me", requireAuth, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, email, is_active, created_at FROM users WHERE id=?",
    [req.user.id]
  );
  res.json({
    user: rows[0],
    roles: req.user.roles,
    permissions: req.user.permissions,
  });
});

// ตัวอย่าง endpoint ที่ต้องมีสิทธิ์ 'user:read'
app.get(
  "/admin/users",
  requireAuth,
  requirePermission("user:read"),
  async (_req, res) => {
    const [rows] = await pool.query(
      "SELECT id, email, is_active, created_at FROM users ORDER BY id DESC LIMIT 50"
    );
    res.json({ data: rows });
  }
);

app.get("/", (_req, res) => res.json({ ok: true }));

// บังคับ HTTPS แบบง่ายเมื่ออยู่หลัง proxy (เช่น Nginx/Cloudflare)
if (process.env.NODE_ENV === "production") {
  app.enable("trust proxy");
  app.use((req, res, next) => {
    if (req.secure || req.headers["x-forwarded-proto"] === "https")
      return next();
    return res.status(400).json({ error: "HTTPS required" });
  });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server on http://localhost:" + PORT));

// // server.js
// const express = require("express");
// const bodyParser = require("body-parser");
// const cors = require("cors");
// const authRoutes = require("./routes/authRoutes");
// const {
//   authenticateToken,
//   checkPermission,
// } = require("./middleware/authMiddleware");

// // เพื่อให้การเชื่อมต่อฐานข้อมูลทำงาน
// require("./config/database");

// const app = express();
// const port = 3303;

// app.use(cors());
// app.use(bodyParser.json());

// // ใช้ authRoutes
// app.use("/api", authRoutes);

// // ตัวอย่าง API ที่ต้องการการยืนยันตัวตนและสิทธิ์
// app.post(
//   "/api/admin/create-user",
//   authenticateToken,
//   checkPermission("full_admin"),
//   (req, res) => {
//     // Logic การสร้างผู้ใช้ใหม่ที่นี่
//     res.json({ message: "User created successfully by admin." });
//   }
// );

// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });

// const express = require("express");
// const bodyParser = require("body-parser");
// const cors = require("cors");
// const authRoutes = require("./routes/authRoutes");
// const {
//   authenticateToken,
//   checkPermission,
// } = require("./middleware/authMiddleware");
// const db = require("./config/database");

// const app = express();
// const port = 3303;

// // Middleware setup
// app.use(cors());
// app.use(bodyParser.json());

// // Use the authentication routes for /api
// app.use("/api", authRoutes);

// // Example protected endpoint that requires authentication and specific permission.
// // This endpoint is used to update a user's permission.
// app.post(
//   "/api/admin/update-permission",
//   authenticateToken,
//   checkPermission("full_admin"),
//   async (req, res) => {
//     const { username, permission } = req.body;

//     if (!username || !permission) {
//       return res.status(400).json({ error: "Username and permission are required." });
//     }

//     try {
//       // Use parameterized query to prevent SQL injection
//       const [result] = await db.query(
//         "UPDATE login SET permission = ? WHERE username = ?",
//         [permission, username]
//       );

//       if (result.affectedRows === 0) {
//         return res.status(404).json({ message: "User not found." });
//       }

//       res.json({ message: `Permission updated for user: ${username}` });
//     } catch (err) {
//       console.error("Database update failed:", err);
//       res.status(500).json({ error: "Database update failed" });
//     }
//   }
// );

// // Start the server
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });

// const express = require("express");
// const mysql = require("mysql2");
// const dotenv = require("dotenv");
// const bodyParser = require("body-parser");
// const cors = require("cors");
// const jwt = require("jsonwebtoken"); // เพิ่มการเรียกใช้ jwt
// const bcrypt = require("bcrypt"); // เพิ่มการเรียกใช้ bcrypt เพื่อความปลอดภัยของรหัสผ่าน

// const app = express();
// dotenv.config();
// const port = 3303;

// app.use(cors()); // แก้ไข core() เป็น cors()
// app.use(bodyParser.json());

// const JWT_SECRET = process.env.JWT_SECRET || "my_secret_key";
// // const SALT_ROUNDS = 10;

// let pool;

// function handleDisconnect() {
//   pool = mysql.createConnection({
//     host: process.env.HOST,
//     user: process.env.USER,
//     password: process.env.PASSWORD,
//     database: process.env.DATABASE,
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0,
//   });

//   pool.connect((err) => {
//     if (err) {
//       console.error("Error connecting to database:", err);
//       setTimeout(handleDisconnect, 2000);
//     } else {
//       console.log("Connected to database");
//     }
//   });

//   pool.on("error", (err) => {
//     console.error("Database error:", err);
//     if (err.code === "PROTOCOL_CONNECTION_LOST") {
//       handleDisconnect();
//     } else {
//       throw err;
//     }
//   });
// }
// handleDisconnect();

// app.post("/api/login", (req, res) => {
//   const { usernameOrEmail, password } = req.body;

//   if (!usernameOrEmail || !password) {
//     return res.status(400).json({ error: "กรุณาป้อนชื่อผู้ใช้และรหัสผ่าน" });
//   }

//   const sql = `
//     SELECT * FROM login
//     WHERE (username = ? OR email = ?)
//   `;

//   pool.query(sql, [usernameOrEmail, usernameOrEmail], async (err, results) => {
//     // แก้ db เป็น pool
//     if (err) {
//       console.error("Error fetching user:", err);
//       return res.status(500).send("Error fetching user");
//     }

//     if (results.length === 0) {
//       return res
//         .status(401)
//         .json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
//     }

//     const user = results[0];

//     try {
//       // เปรียบเทียบรหัสผ่านที่ถูก hash แล้ว
//       const isMatch = await bcrypt.compare(password, user.password);

//       if (!isMatch) {
//         return res
//           .status(401)
//           .json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
//       }

//       // สร้าง JWT token
//       const token = jwt.sign(
//         { id: user.id, username: user.username },
//         JWT_SECRET,
//         { expiresIn: "1h" }
//       );

//       console.log(
//         `User "${user.username}" (ID: ${user.id}) successfully logged in.`
//       );

//       // ส่ง token และข้อมูลผู้ใช้กลับไปยัง frontend
//       res.json({
//         tokenKey: token,
//         user: {
//           id: user.id,
//           username: user.username,
//           // permission: user.permission,
//         },
//       });
//     } catch (error) {
//       console.error("Error comparing passwords:", error);
//       res.status(500).send("Internal server error");
//     }
//   });
// });

// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });

// const sql = `
//   SELECT id, username, password, email, permission FROM login
//   WHERE (username = ? OR email = ?)
// `;

// // ... ในส่วนของ jwt.sign
// const token = jwt.sign(
//   { id: user.id, username: user.username, permission: user.permission },
//   JWT_SECRET,
//   { expiresIn: "1h" }
// );

// // ... ส่งข้อมูล permission กลับไป
// res.json({
//   tokenKey: token,
//   user: {
//     id: user.id,
//     username: user.username,
//     permission: user.permission, // เพิ่ม permission ที่นี่
//   },
// });

// const express = require("express");
// const mysql = require("mysql2");
// const cors = require("cors");
// const dotenv = require("dotenv");
// const bcrypt = require("bcrypt");

// const app = express();
// dotenv.config();

// const PORT = 3002;

// app.use(cors());
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// const db = mysql.createConnection({
//   host: process.env.HOST,
//   user: process.env.USER,
//   password: process.env.PASSWORD,
//   database: process.env.DATABASE,
// });

// db.connect((err) => {
//   if (err) {
//     console.error("Error connecting to", err);
//     return;
//   }
//   console.log("Connected database success");
// });

// app.post("/api/login", async (req, res) => {
//   const { usernameOrEmail, password } = req.body;

//   console.log("--- New Login Attempt ---");
//   console.log("Received usernameOrEmail:", usernameOrEmail);
//   console.log("Received password (plaintext):", password);

//   try {
//     const [rows] = await db
//       .promise()
//       .query("SELECT * FROM login WHERE username = ? OR email = ?", [
//         usernameOrEmail,
//         usernameOrEmail,
//       ]);

//     console.log("DB Query Result (rows found):", rows.length);

//     if (rows.length === 0) {
//       console.log("User not found in DB.");
//       return res.status(401).json({
//         success: false,
//         message: "ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง",
//       });
//     }

//     const user = rows[0];
//     const storedHashedPassword = user.password;

//     console.log("User found:", user.username || user.email);
//     console.log("Stored hashed password from DB:", storedHashedPassword);

//     const isPasswordValid = await bcrypt.compare(
//       password,
//       storedHashedPassword
//     );

//     console.log(
//       "Password comparison result (isPasswordValid):",
//       isPasswordValid
//     );

//     if (!isPasswordValid) {
//       console.log("Password mismatch.");
//       return res.status(401).json({
//         success: false,
//         message: "ชื่อผู้ใช้/อีเมล หรือรหัสผ่านไม่ถูกต้อง",
//       });
//     }
//     console.log("Login successful!");
//     res.status(200).json({
//       success: true,
//       message: "เข้าสู่ระบบสำเร็จ!",
//     });
//   } catch (error) {
//     console.error("Caught error during login process:", error);
//     res
//       .status(500)
//       .json({ success: false, message: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
//   } finally {
//     console.log("--- End Login Attempt ---");
//   }
// });

// // ✅ ส่วนสำหรับการลงทะเบียน (Register) หรือการอัปเดตข้อมูลผู้ใช้
// // เพื่อ HASH รหัสผ่านก่อนบันทึกลงฐานข้อมูล
// /*
// app.post('/api/register', async (req, res) => {
//     const { username, email, password } = req.body;

//     // ✅ Debug Log: แสดงข้อมูลที่ได้รับสำหรับการลงทะเบียน
//     console.log('--- New Registration Attempt ---');
//     console.log('Registering username:', username);
//     console.log('Registering email:', email);
//     console.log('Registering password (plaintext):', password); // ควรระมัดระวังเมื่อ log รหัสผ่านใน Production

//     try {
//         // HASH รหัสผ่านก่อนบันทึกลงฐานข้อมูล
//         const saltRounds = 10; // กำหนดค่า saltRounds
//         const hashedPassword = await bcrypt.hash(password, saltRounds);
//         console.log('Generated hashed password:', hashedPassword); // แสดงค่า Hash ที่สร้างขึ้น

//         const sql = "INSERT INTO test (username, email, password) VALUES (?, ?, ?)";
//         await db.promise().query(sql, [username, email, hashedPassword]);

//         console.log('Registration successful for user:', username);
//         res.status(201).json({ success: true, message: 'ลงทะเบียนสำเร็จ!' });
//     } catch (error) {
//         console.error('Registration error:', error);
//         res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
//     } finally {
//         console.log('--- End Registration Attempt ---');
//     }
// });
// */

// app.listen(PORT, () => {
//   console.log(`Server is running on http://localhost:${PORT}`);
// });

// const express = require("express");
// const multer = require("multer");
// const mysql = require("mysql2/promise");
// const path = require("path");

// // --- 1. ตั้งค่า Express App ---
// const app = express();
// const port = 3008;

// // ทำให้โฟลเดอร์ 'uploads' เป็นแบบ public เพื่อให้เข้าถึงไฟล์รูปได้ผ่าน URL
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// app.use(core());

// // --- 2. ตั้งค่าการเชื่อมต่อฐานข้อมูล (Database Connection) ---
// // !!! อย่าลืมเปลี่ยนค่าเหล่านี้ให้ตรงกับฐานข้อมูลของคุณ !!!
// const dbConfig = {
//   host: "localhost",
//   user: "root",
//   password: "your_password", // <-- ใส่รหัสผ่านของคุณ
//   database: "mydatabase", // <-- ใส่ชื่อฐานข้อมูลของคุณ
// };

// // --- 3. ตั้งค่า Multer สำหรับการอัปโหลดไฟล์ ---
// const storage = multer.diskStorage({
//   // กำหนดโฟลเดอร์ที่จะบันทึกไฟล์
//   destination: function (req, file, cb) {
//     cb(null, "uploads/");
//   },
//   // กำหนดชื่อไฟล์ใหม่ (เพื่อป้องกันชื่อซ้ำกัน)
//   filename: function (req, file, cb) {
//     const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
//     cb(
//       null,
//       file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
//     );
//   },
// });

// const upload = multer({ storage: storage });

// // --- 4. สร้าง Route สำหรับอัปโหลด (Endpoint) ---
// // ใช้ متد .single('imageFile') โดย 'imageFile' คือชื่อของ input field ในฟอร์ม HTML
// app.post("/upload", upload.single("imageFile"), async (req, res) => {
//   try {
//     // ตรวจสอบว่ามีไฟล์ถูกอัปโหลดมาหรือไม่
//     if (!req.file) {
//       return res
//         .status(400)
//         .json({ message: "กรุณาเลือกไฟล์ที่ต้องการอัปโหลด" });
//     }

//     // ดึงชื่อไฟล์ที่ถูกบันทึกโดย multer
//     const filename = req.file.filename;
//     console.log("ไฟล์ที่อัปโหลด:", filename);

//     // เชื่อมต่อฐานข้อมูล
//     const connection = await mysql.createConnection(dbConfig);

//     // เพิ่มชื่อไฟล์ลงในตาราง images
//     const [result] = await connection.execute(
//       "INSERT INTO images (image_name) VALUES (?)",
//       [filename]
//     );

//     await connection.end(); // ปิดการเชื่อมต่อ

//     console.log("บันทึกข้อมูลลงฐานข้อมูลสำเร็จ ID:", result.insertId);

//     // ส่งข้อมูลกลับไปให้ client
//     res.status(200).json({
//       message: "อัปโหลดไฟล์และบันทึกข้อมูลสำเร็จ!",
//       filename: filename,
//       path: `/uploads/${filename}`, // URL สำหรับเข้าถึงไฟล์
//     });
//   } catch (error) {
//     console.error("เกิดข้อผิดพลาด:", error);
//     res.status(500).json({ message: "เกิดข้อผิดพลาดบนเซิร์ฟเวอร์" });
//   }
// });

// // --- 5. เริ่มรันเซิร์ฟเวอร์ ---
// app.listen(port, () => {
//   console.log(`เซิร์ฟเวอร์กำลังรันที่ http://localhost:${port}`);
// });
