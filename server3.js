app.post("/api/login", (req, res) => {
  const { usernameOrEmail, password } = req.body;

  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: "กรุณาป้อนชื่อผู้ใช้และรหัสผ่าน" });
  }

  const sql = `
    SELECT * FROM login
    WHERE (username = ? OR email = ?)
  `;

  pool.query(sql, [usernameOrEmail, usernameOrEmail], async (err, results) => {
    if (err) {
      console.error("Error fetching user:", err);
      return res.status(500).send("Error fetching user");
    }

    if (results.length === 0) {
      return res
        .status(401)
        .json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    const user = results[0];

    try {
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res
          .status(401)
          .json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: "1h" }
      );

      // Add a success message to the terminal
      console.log(
        `User '${user.username}' (ID: ${user.id}) successfully logged in.`
      );

      res.json({
        tokenKey: token,
        user: {
          id: user.id,
          username: user.username,
          permission: user.permission,
        },
      });
    } catch (error) {
      console.error("Error during login process:", error);
      res.status(500).send("Internal server error");
    }
  });
});

/////////////แก้ไขโค้ดให้ตรวจสอบแบบปกติ
// ในไฟล์ app.js
// ...
// app.post("/api/login", (req, res) => {
//   const { usernameOrEmail, password } = req.body;

//   // ตรวจสอบว่ามีการส่งข้อมูลครบถ้วนหรือไม่
//   if (!usernameOrEmail || !password) {
//     return res.status(400).json({ error: "กรุณาป้อนชื่อผู้ใช้และรหัสผ่าน" });
//   }

//   // ดึงข้อมูลผู้ใช้จากฐานข้อมูล
//   const sql = `
//     SELECT * FROM login
//     WHERE (username = ? OR email = ?)
//   `;

//   // แก้ไข db เป็น pool
//   pool.query(sql, [usernameOrEmail, usernameOrEmail], (err, results) => {
//     if (err) {
//       console.error("Error fetching user:", err);
//       return res.status(500).send("Error fetching user");
//     }

//     if (results.length === 0) {
//       return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
//     }

//     const user = results[0];

//     // **แก้ไขส่วนนี้**
//     // ตรวจสอบรหัสผ่านโดยตรงจากฐานข้อมูล (วิธีที่ไม่ปลอดภัย)
//     if (password !== user.password) {
//       return res.status(401).json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
//     }
//     // ... โค้ดส่วนที่เหลือจะเหมือนเดิม
//   });
// });
// const express = require("express");
// const app = express();
// const cors = require("cors");
// const bodyParser = require("body-parser");
// const mysql = require("mysql2");

// app.use(
//   cors(),
//   bodyParser.json({
//     limit: "50mb",
//   }),
//   bodyParser.urlencoded({
//     extended: true,
//   }),
//   require("./router.js")
// );

// app.get("/", function (req, res) {
//   res.send(["api work!"]);
// });

// let port = app.listen(3006, function () {
//   console.log(`server running on port ${port.address().port}`);
// });
