const mysql = require("mysql2");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
dotenv.config();

const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
});

const saltRounds = 10;

async function hashAndUpdatePasswords() {
  pool.getConnection(async (err, connection) => {
    if (err) {
      console.error("Error getting connection:", err);
      return;
    }

    try {
      // 1. ดึงข้อมูลผู้ใช้ทั้งหมดจากฐานข้อมูล
      const [rows] = await connection
        .promise()
        .query("SELECT id, password FROM login");

      for (const user of rows) {
        // 2. เข้ารหัสรหัสผ่านแต่ละอัน
        const hashedPassword = await bcrypt.hash(user.password, saltRounds);

        // 3. อัปเดตข้อมูลในฐานข้อมูลด้วยรหัสผ่านที่ถูก hash แล้ว
        await connection
          .promise()
          .query("UPDATE login SET password = ? WHERE id = ?", [
            hashedPassword,
            user.id,
          ]);
        console.log(`Updated user ID ${user.id}`);
      }
      console.log("All passwords have been successfully hashed and updated!");
    } catch (error) {
      console.error("Error during password hashing:", error);
    } finally {
      connection.release();
      pool.end();
    }
  });
}

hashAndUpdatePasswords();
// app.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });
