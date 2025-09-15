const express = require("express");
const multer = require("multer");
const mysql = require("mysql2/promise");
const path = require("path");
const dotenv = require("dotenv");
const core = require("cors");

// --- 1. ตั้งค่า Express App ---
dotenv.config();
const app = express();
const port = 3303;

// ทำให้โฟลเดอร์ 'uploads' เป็นแบบ public เพื่อให้เข้าถึงไฟล์รูปได้ผ่าน URL
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(core());

// --- 2. ตั้งค่าการเชื่อมต่อฐานข้อมูล (Database Connection) ---
// !!! อย่าลืมเปลี่ยนค่าเหล่านี้ให้ตรงกับฐานข้อมูลของคุณ !!!
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};

// --- 3. ตั้งค่า Multer สำหรับการอัปโหลดไฟล์ ---
const storage = multer.diskStorage({
  // กำหนดโฟลเดอร์ที่จะบันทึกไฟล์
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  // กำหนดชื่อไฟล์ใหม่ (เพื่อป้องกันชื่อซ้ำกัน)
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// --- 4. สร้าง Route สำหรับอัปโหลด (Endpoint) ---
// ใช้ متد .single('imageFile') โดย 'imageFile' คือชื่อของ input field ในฟอร์ม HTML
// app.post("/upload", upload.single("imageFile"), async (req, res) => {
//   try {
//     // ตรวจสอบว่ามีไฟล์ถูกอัปโหลดมาหรือไม่
//     if (!req.file) {
//       return res
//         .status(400)
//         .json({ message: "กรุณาเลือกไฟล์ที่ต้องการอัปโหลด" });
//     }

//     // ดึงชื่อไฟล์ที่ถูกบันทึกโดย multer
//     // const filename = req.file.filename;
//     // console.log("ไฟล์ที่อัปโหลด:", filename);
//     const fileUrl = `http://localhost:3302/uploads/${req.file.filename}`;

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

app.post("/upload", upload.single("imageFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "กรุณาเลือกไฟล์ที่ต้องการอัปโหลด" });
    } // Get the filename directly from req.file

    const filename = req.file.filename;
    console.log("ไฟล์ที่อัปโหลด:", filename); // Construct the full URL for the frontend

    const fileUrl = `http://localhost:3303/uploads/${filename}`; // Connect to the database

    const connection = await mysql.createConnection(dbConfig); // Insert the filename into the images table

    const [result] = await connection.execute(
      "INSERT INTO images (image_name) VALUES (?)",
      [filename]
    );

    await connection.end();

    console.log("บันทึกข้อมูลลงฐานข้อมูลสำเร็จ ID:", result.insertId); // Send the full URL and filename back to the client

    res.status(200).json({
      message: "อัปโหลดไฟล์และบันทึกข้อมูลสำเร็จ!",
      filename: filename,
      url: fileUrl, // <--- Send the full URL
    });
  } catch (error) {
    console.error("เกิดข้อผิดพลาด:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาดบนเซิร์ฟเวอร์" });
  }
});
// --- 5. เริ่มรันเซิร์ฟเวอร์ ---
app.listen(port, () => {
  console.log(`เซิร์ฟเวอร์กำลังรันที่ http://localhost:${port}`);
  // console.log(`host: ${dbConfig.host}`);
  // console.log(`user: ${dbConfig.user}`);
  // console.log(`database: ${dbConfig.database}`);
});
