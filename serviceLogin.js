// index.js
const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ 1. เชื่อมต่อ MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ใช้ `async/await` เพื่อเชื่อมต่อและ query ฐานข้อมูล
async function testConnection() {
  try {
    // ไม่ต้องใช้ db.connect() เนื่องจากการใช้ connection pool จะเชื่อมต่อให้เอง
    const [rows, fields] = await pool.query("SELECT 1 + 1 AS solution");
    console.log("✅ Connection successful, result:", rows[0].solution); // ควรได้ 2
  } catch (err) {
    console.error("❌ Failed to connect:", err);
  }
}

testConnection();

// ✅ 2. Register API
// app.post("/register", async (req, res) => {
//   try {
//     const { service_ref, service_firstname, service_lastname, username, email, password, role } = req.body;

//     if (!password) {
//       return res.status(400).json({ error: "Password is required" });
//     }

//     const hashed = await bcrypt.hash(password, 10);

//     const sql = "INSERT INTO service (service_ref, service_firstname, service_lastname, username, email, password, role ) VALUES (?, ?, ?, ?, ?, ?, ?)";
//     db.query(sql, [service_ref, service_firstname, service_lastname, username, email, hashed, role], (err, result) => {
//       if (err) {
//         console.error("DB Error:", err);
//         if (err.code === "ER_DUP_ENTRY") {
//           return res.status(400).json({ error: "Username or email exists" });
//         }
//         return res.status(500).json({ error: "DB Error" });
//       }
//       res.status(201).json({ message: "Registered successfully" });
//     });
//   } catch (error) {
//     console.error("Server error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// });

// app.post("/register", async (req, res) => {
//   const { username, serviceRef, email, password, role } = req.body;
//   const hashed = await bcrypt.hash(password, 10);

//   const sql = "INSERT INTO users (username, serviceRef, email, password, role) VALUES (?, ?, ?, ?)";
//   db.query(sql, [username, serviceRef, email, hashed, role], (err, result) => {
//     if (err) {
//       if (err.code === "ER_DUP_ENTRY") {
//         return res.status(400).json({ error: "Username or email exists" });
//       }
//       return res.status(500).json({ error: "DB Error" });
//     }
//     res.status(201).json({ message: "Registered successfully" });
//   });
// });

// app.post("/register", async (req, res) => {
//   const {
//     serviceRef,
//     service_firstname,
//     service_lastname,
//     service_old,
//     username,
//     email,
//     password,
//     line_id,
//     image,
//     phone,
//     role,
//   } = req.body;
//   const hashed = await bcrypt.hash(password, 10);

//   const sql =
//     "INSERT INTO service (serviceRef, service_firstname, service_lastname, service_old, username, " +
//     "email, password, line_id, image, phone, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
//   db.query(
//     sql,
//     [
//       serviceRef,
//       service_firstname,
//       service_lastname,
//       service_old,
//       username,
//       email,
//       hashed,
//       line_id,
//       image,
//       phone,
//       role,
//     ],
//     (err, result) => {
//       if (err) {
//         if (err.code === "ER_DUP_ENTRY") {
//           return res.status(400).json({ error: "Username or email exists" });
//         }
//         return res.status(500).json({ error: "DB Error" });
//       }
//       res.status(201).json({ message: "Registered successfully" });
//     }
//   );
// });

// app.post("/register", async (req, res) => {
//   const { serviceRef, email, password, role } = req.body;
//   const hashed = await bcrypt.hash(password, 10);

//   const sql =
//     "INSERT INTO service (serviceRef, email, password, role) VALUES (?, ?, ?, ?)";
//   db.query(sql, [serviceRef, email, hashed, role], (err, result) => {
//     if (err) {
//       if (err.code === "ER_DUP_ENTRY") {
//         return res.status(400).json({ error: "Username or email exists" });
//       }
//       return res.status(500).json({ error: "DB Error" });
//     }
//     res.status(201).json({ message: "Registered successfully" });
//   });
// });

app.post("/register", async (req, res) => {
  // ดึงข้อมูลที่ส่งมาจาก body
  const { serviceRef, username, email, password, role } = req.body;

  // เพิ่มการ log เพื่อตรวจสอบข้อมูลที่ได้รับ
  console.log("Request body:", req.body);

  // ขั้นที่ 1: การตรวจสอบข้อมูลเบื้องต้น
  if (!serviceRef || !username || !email || !password || !role) {
    return res.status(400).json({ error: "โปรดกรอกข้อมูลให้ครบถ้วน" });
  }

  try {
    // ขั้นที่ 2: ตรวจสอบข้อมูลซ้ำในฐานข้อมูล
    const checkSql =
      "SELECT serviceRef, email FROM service WHERE serviceRef = ? OR email = ?";

    // เพิ่มการ log เพื่อตรวจสอบ SQL query ที่จะรัน
    console.log("Running query:", checkSql);

    const [checkResult] = await pool.query(checkSql, [serviceRef, email]);

    // เพิ่มการ log เพื่อตรวจสอบผลลัพธ์จาก query
    console.log("Check result:", checkResult);

    if (checkResult.length > 0) {
      // ถ้าพบข้อมูลซ้ำ
      const existingRecord = checkResult[0];
      if (existingRecord.serviceRef === serviceRef) {
        return res
          .status(400)
          .json({ error: "รหัสอ้างอิงบริการ (serviceRef) มีอยู่ในระบบแล้ว" });
      }
      if (existingRecord.email === email) {
        return res.status(400).json({ error: "อีเมลนี้มีผู้ใช้งานแล้ว" });
      }
    }

    // ขั้นที่ 3: เข้ารหัสรหัสผ่านและเพิ่มข้อมูลลงฐานข้อมูล
    const hashedPassword = await bcrypt.hash(password, 10);
    const insertSql =
      "INSERT INTO service (serviceRef, username , email, password, role) VALUES (?, ?, ?, ?, ?)";

    // เพิ่มการ log เพื่อตรวจสอบ SQL query ที่จะรันสำหรับการ insert ข้อมูล
    console.log("Running insert query:", insertSql);

    const [insertResult] = await pool.query(insertSql, [
      serviceRef,
      username,
      email,
      hashedPassword,
      role,
    ]);

    // เพิ่มการ log เพื่อตรวจสอบผลลัพธ์จากการ insert ข้อมูล
    console.log("Insert result:", insertResult);

    res.status(201).json({ message: "ลงทะเบียนสำเร็จ" });
  } catch (error) {
    // จัดการข้อผิดพลาดที่อาจเกิดขึ้นจากการเข้ารหัสหรือ query
    console.error("General error:", error);
    res.status(500).json({ error: "เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์" });
  }
});

// ✅ 3. Login API
// app.post("/login", (req, res) => {
//   const identifier = req.body.email || req.body.serviceRef;
//   const { password } = req.body;
//   const sql = "SELECT * FROM service WHERE email = ? OR serviceRef = ?";

//   // Log 1: ตรวจสอบข้อมูลที่ได้รับจาก Frontend
//   console.log("------------------- Login Attempt -------------------");
//   console.log("Identifier (email/username) received:", identifier);
//   console.log("Password received:", password);
//   console.log("-----------------------------------------------------");

//   db.query(sql, [identifier, identifier], async (err, results) => {
//     if (err) return res.status(500).json({ error: "DB Error" });
//     if (results.length === 0)
//       return res.status(401).json({ error: "Invalid credentials" });

//     const user = results[0];

//     // Log 2: ตรวจสอบรหัสผ่านที่ดึงมาจากฐานข้อมูล
//     console.log("Hashed password retrieved from DB:", user.password);
//     console.log("Plain password sent by user:", password);

//     const match = await bcrypt.compare(password, user.password);

//     // Log 3: ตรวจสอบผลลัพธ์การเปรียบเทียบ
//     console.log("Result of bcrypt.compare():", match);

//     if (!match) return res.status(401).json({ error: "Invalid credentials" });

//     if (!user.serviceRef) {
//       return res
//         .status(400)
//         .json({ error: "User does not have serviceRef assigned" });
//     }

//     const token = jwt.sign(
//       { id: user.id, role: user.role, serviceRef: user.serviceRef },
//       "secret123",
//       { expiresIn: "1h" }
//     );

//     const insertLogSql = `
//       INSERT INTO service_action (jobRef, status, statusJob, serviceRef)
//       VALUES (?, ?, ?, ?)
//     `;

//     db.query(insertLogSql, ["-", 1, null, user.serviceRef], (logErr) => {
//       if (logErr) {
//         console.error("Failed to insert login action log:", logErr);
//       }
//       res.json({
//         token,
//         user: {
//           id: user.id,
//           username: user.username,
//           role: user.role,
//           serviceRef: user.serviceRef,
//         },
//       });
//     });
//   });
// });

app.post("/login", async (req, res) => {
  const identifier = req.body.email || req.body.serviceRef;
  const { password } = req.body;

  const sql = "SELECT * FROM service WHERE email = ? OR serviceRef = ?";

  // Log 1: ตรวจสอบข้อมูลที่ได้รับจาก Frontend
  console.log("------------------- Login Attempt -------------------");
  console.log("Identifier (email/serviceRef) received:", identifier);
  console.log("Password received:", password);
  console.log("-----------------------------------------------------");

  try {
    // ใช้ pool.promise().query() เพื่อทำงานแบบ async/await
    const [results] = await pool.query(sql, [identifier, identifier]);

    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = results[0];

    // Log 2: ตรวจสอบรหัสผ่านที่ดึงมาจากฐานข้อมูล
    console.log("Hashed password retrieved from DB:", user.password);
    console.log("Plain password sent by user:", password);

    // เปรียบเทียบรหัสผ่านที่กรอกมา
    const match = await bcrypt.compare(password, user.password);

    // Log 3: ตรวจสอบผลลัพธ์การเปรียบเทียบ
    console.log("Result of bcrypt.compare():", match);

    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.serviceRef) {
      return res
        .status(400)
        .json({ error: "User does not have serviceRef assigned" });
    }

    // สร้าง JWT token
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        serviceRef: user.serviceRef,
        username: user.username,
        firstName: user.service_firstname,
        lastName: user.service_lastname,
        email: user.email,
      },
      process.env.JWT_SECRET || "secret123", // ใช้ JWT_SECRET จาก .env หรือ fallback เป็น 'secret123'
      { expiresIn: "1h" }
    );

    // Insert log ข้อมูลการเข้าสู่ระบบ
    const insertLogSql = `
      INSERT INTO service_action (jobRef, status, statusJob, serviceRef)
      VALUES (?, ?, ?, ?)
    `;

    // รัน query เพื่อบันทึกข้อมูลการเข้าสู่ระบบ
    await pool.query(insertLogSql, ["-", 1, null, user.serviceRef]);

    // ส่ง response กลับไปที่ frontend พร้อมกับ token และข้อมูล user
    res.json({
      token, // ส่ง token ที่สร้างให้ frontend
      user: {
        id: user.id,
        username: user.username,
        firstName: user.service_firstname,
        lastName: user.service_lastname,
        email: user.email,
        serviceRef: user.serviceRef,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Error during login process:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Middleware สำหรับตรวจสอบ token
const authenticateToken = (req, res, next) => {
  // ดึง token จาก Authorization header
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // จะแยก "Bearer <token>" และใช้แค่ <token>
  console.log("Headers token:", authHeader); // log header เพื่อดีบัก
  console.log("token:", token); // log token เพื่อดีบัก

  // ถ้าไม่มี token ให้ส่ง status 401 Unauthorized
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  let decoded;
  try {
    // ตรวจสอบความถูกต้องของ token ด้วย `jwt.verify`
    decoded = jwt.verify(token, process.env.JWT_SECRET || "secret123"); // 'secret123' คือ secret key ที่ใช้ sign token
    console.log("Decoded JWT:", decoded); // log ข้อมูลที่ decoded ออกมา (ข้อมูลจาก payload ของ token)

    req.user = decoded; // เก็บข้อมูลที่ decoded ลงใน req.user เพื่อใช้ใน routes ถัดไป
    next(); // ถ้า token ถูกต้องให้ดำเนินการต่อ
  } catch (err) {
    // ถ้าเกิดข้อผิดพลาดในการ verify จะส่ง status 403 Forbidden
    console.error("JWT verification failed:", err);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

// app.get("/profile", verifyToken, (req, res) => {
//   console.log("[GET /profile] Endpoint ถูกเรียกใช้งาน");
//   console.log("[GET /profile] ข้อมูลที่ได้รับจาก Token (req.user):", req.user);
//   pool
//     .query(`SELECT * FROM service WHERE serviceRef = ?`, [req.user.serviceRef])
//     .then(([rows, fields]) => {
//       // 💡 แก้ไขตรงนี้: ส่งเฉพาะอ็อบเจกต์แรกกลับไป
//       const userProfile = rows[0];

//       if (userProfile) {
//         res.json({
//           message: "Profile data retrieved successfully",
//           user: userProfile,
//         });
//       } else {
//         res.status(404).json({ error: "User not found" });
//       }
//     })
//     .catch((err) => {
//       console.error("Error executing query:", err);
//       res.status(500).json({ error: "Internal Server Error" });
//     });
// });

app.get("/profile", authenticateToken, (req, res) => {
  // ใช้ข้อมูลใน req.user ที่ได้จาก decoded token
  if (!req.user) {
    return res.status(400).json({ error: "User data not available" });
  }

  res.json({
    message: "Profile data retrieved successfully",
    user: req.user, // ข้อมูลที่ได้จาก token (เช่น id, role, serviceRef ฯลฯ)
  });
});

app.put("/profile", authenticateToken, (req, res) => {
  const { firstName, lastName, email, phone, lineId, role, birthDate } =
    req.body;
  const serviceRef = req.user.serviceRef; // ใช้ serviceRef จาก token ที่ยืนยันตัวตน

  const updateQuery = `
    UPDATE service
    SET service_firstname = ?, service_lastname = ?, email = ?, phone = ?, line_id = ?, role = ?, birth_date = ?
    WHERE serviceRef = ?;
  `;

  pool
    .query(updateQuery, [
      firstName,
      lastName,
      email,
      phone,
      lineId,
      role,
      birthDate,
      serviceRef,
    ])
    .then(([result]) => {
      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ error: "User not found or no changes made." });
      }
      res.json({ message: "Profile updated successfully" });
    })
    .catch((err) => {
      console.error("Error updating profile:", err);
      res.status(500).json({ error: "Failed to update profile" });
    });
});

// app.get("/profile", authenticateToken, async (req, res) => {
//   console.log("--- Request Reached Profile Endpoint ---");
//   console.log("Service Reference from Token:", req.user.serviceRef);
//   console.log(req.body.serviceRef);
//   try {
//     const serviceRef = req.body.serviceRef;

//     const [rows] = await pool.query(
//       `SELECT * FROM service WHERE serviceRef = ?`,
//       [serviceRef]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({ error: "Service not found for this user" });
//     }

//     res.json(rows[0]);
//     console.log(
//       `Profile for service reference ${serviceRef} retrieved successfully.`
//     );
//   } catch (err) {
//     console.error("Error executing query:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// app.get("/profile", authenticateToken, async (req, res) => {
//   console.log(req.service.serviceRef);
//   try {
//     // ดึง userId จาก Token ที่ถอดรหัสแล้ว
//     const serviceRef = req.service.serviceRef;

//     // **สำคัญ:** ดึงข้อมูลเฉพาะผู้ใช้คนนั้นจากตาราง user
//     const [rows] = await pool.query(
//       `SELECT * FROM service WHERE serviceRef = ?`,
//       [serviceRef]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     // ส่งข้อมูลผู้ใช้กลับไป
//     res.json(rows[0]);
//     console.log(`Profile for user ${serviceRef} retrieved successfully.`);
//   } catch (err) {
//     console.error("Error executing query:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// });

// app.post("/login", (req, res) => {
//   const identifier = req.body.email || req.body.username;
//   const { password } = req.body;
//   const sql = "SELECT * FROM users WHERE email = ? OR username = ?";

//   db.query(sql, [identifier, identifier], async (err, results) => {
//     if (err) return res.status(500).json({ error: "DB Error" });
//     if (results.length === 0)
//       return res.status(401).json({ error: "Invalid credentials" });

//     const user = results[0];
//     const match = await bcrypt.compare(password, user.password);
//     if (!match) return res.status(401).json({ error: "Invalid credentials" });

//     if (!user.serviceRef) {
//       return res
//         .status(400)
//         .json({ error: "User does not have serviceRef assigned" });
//     }

//     const token = jwt.sign(
//       { id: user.id, role: user.role, serviceRef: user.serviceRef },
//       "secret123",
//       { expiresIn: "1h" }
//     );

//     const insertLogSql = `
//       INSERT INTO service_action (jobRef, status, statusJob, serviceRef)
//       VALUES (?, ?, ?, ?)
//     `;

//     db.query(insertLogSql, ["-", 1, null, user.serviceRef], (logErr) => {
//       if (logErr) {
//         console.error("Failed to insert login action log:", logErr);
//         // ไม่ต้อง return error เพราะ login ยังสำเร็จอยู่
//       }
//       res.json({
//         token,
//         user: {
//           id: user.id,
//           username: user.username,
//           role: user.role,
//           serviceRef: user.serviceRef,
//         },
//       });
//     });
//   });
// });

// app.post("/login", (req, res) => {
//   // ใช้ค่า email หรือ username ที่มาก็ได้ใน key 'email' หรือ 'username'
//   const identifier = req.body.email || req.body.username;
//   const { password } = req.body;
//   const sql = "SELECT * FROM users WHERE email = ? OR username = ?";
//   db.query(sql, [identifier, identifier], async (err, results) => {
//     if (err) return res.status(500).json({ error: "DB Error" });
//     if (results.length === 0) return res.status(401).json({ error: "Invalid credentials" });

//     const user = results[0];
//     const match = await bcrypt.compare(password, user.password);
//     if (!match) return res.status(401).json({ error: "Invalid credentials" });

//     const token = jwt.sign({ id: user.id, role: user.role }, "secret123", { expiresIn: "1h" });

//     res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
//   });
// });

// app.post("/login", (req, res) => {
//   const { email, password } = req.body;
//   const sql = "SELECT * FROM users WHERE email = ? OR username = ?";
//   db.query(sql, [email, email], async (err, results) => {
//     if (err) return res.status(500).json({ error: "DB Error" });
//     if (results.length === 0) return res.status(401).json({ error: "Invalid credentials" });

//     const user = results[0];
//     const match = await bcrypt.compare(password, user.password);
//     if (!match) return res.status(401).json({ error: "Invalid credentials" });

//     const token = jwt.sign({ id: user.id, role: user.role }, "secret123", { expiresIn: "1h" });

//     res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
//   });
// });

// ✅ 4. Protected route (optional)
app.get("/profile", verifyToken, (req, res) => {
  res.json({ message: "This is protected", user: req.user });
});

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Token required" });

  const token = authHeader.split(" ")[1];
  jwt.verify(token, "secret123", (err, decoded) => {
    if (err) return res.status(403).json({ error: "Invalid token" });
    req.user = decoded;
    next();
  });
}

// ✅ 5. เริ่มรัน Server
app.listen(5000, () => {
  console.log("🚀 Server is running on http://localhost:5000");
});

// const express = require('express');
// const cors = require('cors');
// const dotenv = require('dotenv');
// const authRoutes = require('./routes/authRoutes');

// dotenv.config();
// const app = express();

// app.use(cors());
// app.use(express.json());

// app.use(authRoutes);

// app.listen(5000, () => {
//   console.log('🚀 Server running on http://localhost:5000');
// });
