// // /controllers/authController.js
// const pool = require("../config/database");
// const bcrypt = require("bcrypt");
// const jwt = require("jsonwebtoken");
// const JWT_SECRET = process.env.JWT_SECRET || "my_secret_key";

// const loginUser = (req, res) => {
//   const { usernameOrEmail, password } = req.body;

//   if (!usernameOrEmail || !password) {
//     return res.status(400).json({ error: "กรุณาป้อนชื่อผู้ใช้และรหัสผ่าน" });
//   }

//   const sql = `
//     SELECT id, username, password, email, permission FROM login
//     WHERE (username = ? OR email = ?)
//   `;

//   pool.query(sql, [usernameOrEmail, usernameOrEmail], async (err, results) => {
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
//       const isMatch = await bcrypt.compare(password, user.password);

//       if (!isMatch) {
//         return res
//           .status(401)
//           .json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
//       }

//       const token = jwt.sign(
//         { id: user.id, username: user.username, permission: user.permission },
//         JWT_SECRET,
//         { expiresIn: "1h" }
//       );

//       console.log(
//         `User "${user.username}" (ID: ${user.id}) successfully logged in.`
//       );

//       res.json({
//         tokenKey: token,
//         user: {
//           id: user.id,
//           username: user.username,
//           permission: user.permission,
//         },
//       });
//     } catch (error) {
//       console.error("Error comparing passwords:", error);
//       res.status(500).send("Internal server error");
//     }
//   });
// };

// module.exports = {
//   loginUser,
// };
