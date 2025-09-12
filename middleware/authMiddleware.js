const jwt = require("jsonwebtoken");
require("dotenv").config();

/**
 * Middleware สำหรับยืนยัน Token และสิทธิ์การเข้าถึงของผู้ใช้
 * จะทำการตรวจสอบว่า Token ที่ส่งมาใน Header นั้นถูกต้องหรือไม่
 * และจะนำข้อมูลผู้ใช้ที่ถอดรหัสได้ (รวมถึง permission) ใส่ไว้ใน req.user
 */
const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // ใส่ข้อมูลผู้ใช้ที่ถอดรหัสได้ลงใน request
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid token.",
    });
  }
};

/**
 * Middleware สำหรับตรวจสอบสิทธิ์การเข้าถึง (Permission)
 * จะคืนค่าฟังก์ชันที่รับสิทธิ์ที่จำเป็นเป็นพารามิเตอร์
 */
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    const userPermission = req.user.permission;
    if (userPermission === requiredPermission) {
      next();
    } else {
      res.status(403).json({
        success: false,
        message: "Forbidden. You do not have the required permission.",
      });
    }
  };
};

module.exports = { authenticateToken, checkPermission };

// // /middleware/authMiddleware.js
// const jwt = require("jsonwebtoken");
// const JWT_SECRET = process.env.JWT_SECRET || "my_secret_key";

// const authenticateToken = (req, res, next) => {
//   const authHeader = req.headers["authorization"];
//   const token = authHeader && authHeader.split(" ")[1];

//   if (token == null) {
//     return res.status(401).json({ error: "Unauthorized: Token missing." });
//   }

//   jwt.verify(token, JWT_SECRET, (err, user) => {
//     if (err) {
//       console.error("Token verification failed:", err);
//       return res.status(403).json({ error: "Forbidden: Invalid token." });
//     }
//     req.user = user;
//     next();
//   });
// };

// const checkPermission = (requiredPermission) => {
//   return (req, res, next) => {
//     if (req.user && req.user.permission === requiredPermission) {
//       next();
//     } else {
//       res
//         .status(403)
//         .json({
//           error: "Forbidden: You do not have the required permissions.",
//         });
//     }
//   };
// };

// module.exports = {
//   authenticateToken,
//   checkPermission,
// };
