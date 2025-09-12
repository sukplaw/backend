const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();

const port = 3302;

app.use(cors());
app.use(express.json({limit:"50mb"}));
app.use(express.urlencoded({ extended: true, limit:"50mb" }));

const pool = mysql
  .createPool({
    host: 'hospro.net',
    user: 'hosp_servicev1',
    password: '5lq9lg%VMr?N7jbj',
    database: 'hosp_servicev1',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "local",
    dateStrings: true,
  })
  .promise();

app.get("/get-detail/:jobRef", async (req, res) => {
  const jobRef = req.params.jobRef;
  console.log("🔎 Request jobRef:", jobRef); // ดูค่า jobRef ที่รับมา

  try {
    // 🔍 Query หลักจาก job, customer, product, job_active
    const [jobRows] = await pool.query(`
      SELECT j.jobRef, j.serialNumber, j.createAt, ja.updateAt, ja.jobStatus,
             j.expected_completion_date, j.customer_contact,
             c.*, p.*
      FROM job AS j
      JOIN customer AS c ON c.customerRef = j.customerRef
      JOIN product AS p ON p.productRef = j.productRef
      JOIN job_active AS ja ON ja.jobRef = j.jobRef
      WHERE j.jobRef = ?
      ORDER BY ja.updateAt;
    `, [jobRef]);

    console.log("📄 jobRows data:", jobRows); // ดูข้อมูล job + customer + product + job_active

    if (jobRows.length === 0) {
      console.log(`No details found for jobRef: ${jobRef}`);
      return res.status(404).json({ error: "Details not found" });
    }

    // 🖼️ ดึงรูปจาก job_image
    const [imageRows] = await pool.query(`
      SELECT imageUrl FROM job_image WHERE jobRef = ?
    `, [jobRef]);

    console.log("🖼️ imageRows data:", imageRows); // ดูข้อมูลรูปภาพที่ได้

    const imageUrls = imageRows.map(img => img.imageUrl);

    // 🧩 รวมผลลัพธ์ทั้งหมด
    const result = {
      ...jobRows[0],
      images: imageUrls
    };

    console.log("🚀 Response result:", result); // ดูข้อมูลที่ส่งกลับ

    res.json(result);

  } catch (err) {
    console.error("❌ Error executing query:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});