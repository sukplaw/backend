// app.put("/update-status/:jobRef", async (req, res) => {
//   let connection;
//   try {
//     const { jobRef } = req.params;
//     const { jobStatus: newStatus } = req.body;

//     connection = await pool.getConnection();
//     await connection.beginTransaction();

//     // Corrected UPDATE query execution with `await connection.execute`
//     const updateStatusQuery = `UPDATE job SET jobStatus = ? WHERE jobRef = ?`;
//     const [updateResult] = await connection.execute(updateStatusQuery, [
//       newStatus,
//       jobRef,
//     ]);

//     if (updateResult.affectedRows === 0) {
//       await connection.rollback();
//       return res.status(404).json({
//         message: "Job not found or no changes were made.",
//       });
//     }

//     // SELECT query to get the updated job data for logging
//     const selectQuery = `
//       SELECT
//         j.jobRef, p.productRef, j.serialNumber, p.pcs, ja.unit, j.createAt,
//         j.jobStatus
//       FROM job AS j
//       JOIN customer AS c ON j.customerRef = c.customerRef
//       JOIN job_active AS ja ON j.productRef = ja.productRef
//       JOIN product AS p ON j.productRef = p.productRef
//       WHERE j.jobRef = ?
//     `;
//     const [rows] = await connection.execute(selectQuery, [jobRef]);
//     const jobData = rows[0];

//     if (!jobData) {
//       await connection.rollback();
//       throw new Error("Job not found after update.");
//     }

//     // INSERT query for job_active log
//     const logQuery = `
//       INSERT INTO job_active (
//         jobRef, productRef, serialNumber, pcs, unit, createAt,
//         status, jobStatus
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//     `;
//     const logValues = [
//       jobData.jobRef,
//       jobData.productRef,
//       jobData.serialNumber,
//       jobData.pcs,
//       jobData.unit,
//       jobData.createAt,
//       1, // Hardcoded value for 'status'
//       jobData.jobStatus,
//     ];
//     await connection.execute(logQuery, logValues);

//     await connection.commit();
//     res.status(200).json({
//       message: "Job status updated and log created successfully.",
//     });
//   } catch (error) {
//     if (connection) {
//       await connection.rollback();
//     }
//     console.error("Transaction failed:", error);
//     res.status(500).json({
//       message: "Error updating job status and creating log.",
//     });
//   } finally {
//     if (connection) {
//       connection.release();
//     }
//   }
// });

const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors"); // เพิ่ม CORS เพื่อให้ Frontend สามารถเรียกใช้งานได้

const app = express();
const port = 3302;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ตั้งค่าการเชื่อมต่อฐานข้อมูล
const connection = mysql.createConnection({
  host: "localhost",
  user: "your_username", // เปลี่ยนเป็น username ของคุณ
  password: "your_password", // เปลี่ยนเป็น password ของคุณ
  database: "your_database_name", // เปลี่ยนเป็นชื่อฐานข้อมูลของคุณ
});

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to the database:", err.stack);
    return;
  }
  console.log("Connected to the database as id " + connection.threadId);
});

// API Endpoint สำหรับอัปเดตสถานะและสร้าง Job Log
app.put("/update-status/:jobRef", async (req, res) => {
  const { jobRef } = req.params;
  const { jobStatus } = req.body;

  try {
    // ใช้ Transaction เพื่อให้แน่ใจว่าทั้งสองคำสั่งสำเร็จพร้อมกัน
    await connection.beginTransaction();

    // 1. อัปเดต jobStatus ในตาราง 'job'
    const updateQuery = `
      UPDATE job SET jobStatus = ?, updateAt = NOW() WHERE jobRef = ?
    `;
    await connection.execute(updateQuery, [jobStatus, jobRef]);

    // 2. ดึงข้อมูลทั้งหมดของ Job ที่เพิ่งอัปเดต
    // นี่คือส่วนที่สำคัญ คุณต้อง JOIN เพื่อดึงข้อมูลที่เกี่ยวข้องทั้งหมด
    const selectQuery = `
      SELECT
        j.*,
        c.username,
        p.product_name,
        p.serialNumber,
        p.sku,
        p.expected_completion_date
      FROM job AS j
      JOIN customer AS c ON j.customer_id = c.customer_id
      JOIN product AS p ON j.product_id = p.product_id
      WHERE j.jobRef = ?
    `;
    const [rows] = await connection.execute(selectQuery, [jobRef]);
    const jobData = rows[0];

    if (!jobData) {
      throw new Error("Job not found after update.");
    }

    // 3. บันทึกข้อมูลทั้งหมดลงในตาราง 'job_log'
    const logQuery = `
      INSERT INTO job_log (
        jobRef,
        jobStatus,
        username,
        product_name,
        serialNumber,
        sku,
        createdBy,
        createAt,
        expected_completion_date,
        updateAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const logValues = [
      jobData.jobRef,
      jobData.jobStatus,
      jobData.username,
      jobData.product_name,
      jobData.serialNumber,
      jobData.sku,
      jobData.createdBy,
      jobData.createAt,
      jobData.expected_completion_date,
    ];

    await connection.execute(logQuery, logValues);

    await connection.commit(); // ยืนยัน Transaction ทั้งหมด

    res
      .status(200)
      .json({ message: "Job status updated and log created successfully." });
  } catch (error) {
    await connection.rollback(); // Rollback หากมีข้อผิดพลาด
    console.error("Failed to update job status or create log:", error);
    res
      .status(500)
      .json({ message: "Error updating job status and creating log." });
  }
});

// // API Endpoint สำหรับดึงข้อมูล Job ทั้งหมด (ใช้สำหรับแสดงในตาราง)
// app.get("/get-job", (req, res) => {
//   const query = `
//     SELECT
//       j.*,
//       c.username,
//       p.product_name,
//       p.serialNumber,
//       p.sku,
//       p.expected_completion_date
//     FROM job AS j
//     JOIN customer AS c ON j.customer_id = c.customer_id
//     JOIN product AS p ON j.product_id = p.product_id
//   `;
//   connection.query(query, (err, results) => {
//     if (err) {
//       res.status(500).json({ error: err.message });
//       return;
//     }
//     res.json(results);
//   });
// });

// app.listen(port, () => {
//   console.log(`Server is running on http://localhost:${port}`);
// });

// const express = require("express");
// const mysql = require("mysql");
// const bodyParser = require("body-parser");
// const cors = require("cors");

// const app = express();
// const port = 5000;

// // Middleware
// app.use(cors());
// app.use(bodyParser.json());

// // Database connection setup
// const db = mysql.createConnection({
//   host: "localhost",
//   user: "your_username",
//   password: "your_password",
//   database: "your_database_name",
// });

// db.connect((err) => {
//   if (err) {
//     console.error("Error connecting to the database:", err);
//     return;
//   }
//   console.log("Connected to MySQL database!");
// });

// // --- API Endpoints ---

// // POST endpoint to create a new job and its items
// app.post("/api/jobs", (req, res) => {
//   const { jobName, items } = req.body;
//   let newJobId;

//   // Start a transaction
//   db.beginTransaction((err) => {
//     if (err) {
//       return res
//         .status(500)
//         .send({ success: false, message: "Transaction failed" });
//     }

//     // 1. Insert into jobs table with a default status of 0
//     const insertJobQuery =
//       "INSERT INTO jobs (job_name, job_date, status) VALUES (?, CURDATE(), 0)";
//     db.query(insertJobQuery, [jobName], (error, result) => {
//       if (error) {
//         return db.rollback(() => {
//           console.error("Error inserting initial job:", error);
//           res
//             .status(500)
//             .send({ success: false, message: "Failed to create job" });
//         });
//       }

//       newJobId = result.insertId;
//       const itemValues = items.map((item) => [
//         newJobId,
//         item.productId,
//         item.quantity,
//       ]);

//       // 2. Insert into job_items table
//       const insertItemsQuery =
//         "INSERT INTO job_items (job_id, product_id, quantity) VALUES ?";
//       db.query(insertItemsQuery, [itemValues], (error) => {
//         let status = 1; // Assume success
//         let errorMessage = null;

//         if (error) {
//           // 3. If there is an error, capture it and set the status
//           console.error("Error inserting job items:", error);
//           status = 0;
//           errorMessage = error.message;
//         }

//         // 4. Update the jobs table with the final status and error message
//         const updateStatusQuery =
//           "UPDATE jobs SET status = ?, error_message = ? WHERE job_id = ?";
//         db.query(
//           updateStatusQuery,
//           [status, errorMessage, newJobId],
//           (updateError) => {
//             if (updateError) {
//               return db.rollback(() => {
//                 console.error("Error updating job status:", updateError);
//                 res.status(500).send({
//                   success: false,
//                   message: "Failed to update job status",
//                 });
//               });
//             }

//             // 5. Commit or Rollback the transaction based on the outcome
//             if (status === 1) {
//               db.commit((err) => {
//                 if (err) {
//                   return db.rollback(() => {
//                     res.status(500).send({
//                       success: false,
//                       message: "Transaction commit failed",
//                     });
//                   });
//                 }
//                 res.status(201).send({
//                   success: true,
//                   message: "Job and items created successfully",
//                 });
//               });
//             } else {
//               db.rollback(() => {
//                 res.status(500).send({
//                   success: false,
//                   message:
//                     "Failed to create job items. Transaction rolled back.",
//                 });
//               });
//             }
//           }
//         );
//       });
//     });
//   });
// });

// // GET endpoint to get category counts by date
// app.get("/api/category-counts", (req, res) => {
//   const query = `
//         SELECT
//             DATE(j.job_date) AS date,
//             p.category,
//             SUM(ji.quantity) AS total_count
//         FROM
//             jobs AS j
//         JOIN
//             job_items AS ji ON j.job_id = ji.job_id
//         JOIN
//             products AS p ON ji.product_id = p.product_id
//         GROUP BY
//             date, p.category
//         ORDER BY
//             date DESC;
//     `;

//   db.query(query, (error, results) => {
//     if (error) {
//       console.error("Error fetching category counts:", error);
//       return res.status(500).send("Error fetching data");
//     }
//     res.status(200).json(results);
//   });
// });

// app.listen(port, () => {
//   console.log(`Server is running on http://localhost:${port}`);
// });

// // const express = require("express");
// // const mysql = require("mysql");
// // const bodyParser = require("body-parser");
// // const cors = require("cors");

// // const app = express();
// // const port = 5000;

// // // Middleware (ส่วนเสริมของ Express เพื่อจัดการคำขอ)
// // app.use(cors()); // อนุญาตให้ Front-end เรียก API ข้ามโดเมนได้
// // app.use(bodyParser.json()); // แปลงข้อมูลที่ส่งมาเป็น JSON

// // // ตั้งค่าการเชื่อมต่อฐานข้อมูล MySQL
// // const db = mysql.createConnection({
// //   host: "localhost",
// //   user: "ชื่อผู้ใช้ของคุณ",
// //   password: "รหัสผ่านของคุณ",
// //   database: "ชื่อฐานข้อมูลของคุณ",
// // });

// // db.connect((err) => {
// //   if (err) {
// //     console.error("เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล:", err);
// //     return;
// //   }
// //   console.log("เชื่อมต่อฐานข้อมูล MySQL สำเร็จ!");
// // });

// // // --- API Endpoints ---

// // // Endpoint สำหรับการสร้างงานใหม่ (POST)
// // app.post("/api/jobs", (req, res) => {
// //   const { jobName, items } = req.body;

// //   // เริ่มต้น Transaction เพื่อให้แน่ใจว่าการ Insert ทั้งสองตารางสำเร็จพร้อมกัน
// //   db.beginTransaction((err) => {
// //     if (err) {
// //       return res.status(500).send("เกิดข้อผิดพลาดในการทำ Transaction");
// //     }

// //     // 1. เพิ่มข้อมูลลงในตาราง jobs
// //     const insertJobQuery =
// //       "INSERT INTO jobs (job_name, job_date) VALUES (?, CURDATE())";
// //     db.query(insertJobQuery, [jobName], (error, result) => {
// //       if (error) {
// //         return db.rollback(() => {
// //           console.error("เกิดข้อผิดพลาดในการสร้างงาน:", error);
// //           res.status(500).send("ไม่สามารถสร้างงานได้");
// //         });
// //       }

// //       const newJobId = result.insertId; // ดึง Job ID ที่ถูกสร้างขึ้นมา
// //       const itemValues = items.map((item) => [
// //         newJobId,
// //         item.productId,
// //         item.quantity,
// //       ]);

// //       // 2. เพิ่มข้อมูลลงในตาราง job_items
// //       const insertItemsQuery =
// //         "INSERT INTO job_items (job_id, product_id, quantity) VALUES ?";
// //       db.query(insertItemsQuery, [itemValues], (error) => {
// //         if (error) {
// //           return db.rollback(() => {
// //             console.error("เกิดข้อผิดพลาดในการสร้างรายการสินค้า:", error);
// //             res.status(500).send("ไม่สามารถสร้างรายการสินค้าได้");
// //           });
// //         }

// //         // 3. ยืนยัน Transaction (บันทึกข้อมูลทั้งหมด)
// //         db.commit((err) => {
// //           if (err) {
// //             return db.rollback(() => {
// //               res.status(500).send("ยืนยัน Transaction ไม่สำเร็จ");
// //             });
// //           }
// //           res.status(201).send({ message: "สร้างงานสำเร็จ", jobId: newJobId });
// //         });
// //       });
// //     });
// //   });
// // });

// // // Endpoint สำหรับดึงข้อมูลการนับประเภทสินค้า (GET)
// // app.get("/api/category-counts", (req, res) => {
// //   const query = `
// //         SELECT
// //             DATE(j.job_date) AS date,
// //             p.category,
// //             SUM(ji.quantity) AS total_count
// //         FROM
// //             jobs AS j
// //         JOIN
// //             job_items AS ji ON j.job_id = ji.job_id
// //         JOIN
// //             products AS p ON ji.product_id = p.product_id
// //         GROUP BY
// //             date, p.category
// //         ORDER BY
// //             date DESC;
// //     `;

// //   db.query(query, (error, results) => {
// //     if (error) {
// //       console.error("เกิดข้อผิดพลาดในการดึงข้อมูล:", error);
// //       return res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูล");
// //     }
// //     res.status(200).json(results);
// //   });
// // });

// // app.listen(port, () => {
// //   console.log(`เซิร์ฟเวอร์กำลังทำงานบน http://localhost:${port}`);
// // });
// // ต้องใช้ mysql2 package เพื่อรองรับ Promises
// // npm install mysql2

// app.post("/create-job", async (req, res) => {
//   // ดึงข้อมูลจาก request body
//   const {
//     jobRef, // jobName ในโค้ดเดิม
//     serialNumber,
//     productRef,
//     jobStatus,
//     expected_completion_date,
//     customer_contact,
//     customerRef,
//     items, // เปลี่ยนชื่อจาก 'item' เป็น 'items' เพื่อให้สื่อความหมายมากขึ้น
//   } = req.body;

//   // รับการเชื่อมต่อจาก Pool
//   const connection = await pool.getConnection();

//   try {
//     // 1. เริ่มต้น Transaction
//     await connection.beginTransaction();

//     // 2. Insert ข้อมูลหลักลงในตาราง 'job'
//     // แก้ไขจำนวนคอลัมน์และค่าที่ส่งให้ตรงกัน
//     const insertJobQuery = `
//       INSERT INTO job (
//         jobRef,
//         serialNumber,
//         productRef,
//         jobStatus,
//         expected_completion_date,
//         customer_contact,
//         customerRef,
//         status,           -- เพิ่มคอลัมน์สถานะ
//         error_message
//       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//     `;
//     const [jobResult] = await connection.query(insertJobQuery, [
//       jobRef,
//       serialNumber,
//       productRef,
//       jobStatus,
//       expected_completion_date,
//       customer_contact,
//       customerRef,
//       0, // ตั้งสถานะเริ่มต้นเป็น 0 (ไม่สำเร็จ)
//       null,
//     ]);

//     const newJobId = jobResult.insertId;

//     // 3. Insert ข้อมูลรายการสินค้าลงในตาราง 'job_active'
//     // ตรวจสอบว่า `items` เป็น array และมีข้อมูล
//     if (items && Array.isArray(items) && items.length > 0) {
//       const itemValues = items.map((item) => [
//         newJobId,
//         item.productRef, // ใช้ชื่อที่ตรงกับ column
//         item.serialNumber,
//         item.pcs,
//         item.unit,
//         new Date(), // createAt
//         new Date(), // updateAt
//         1, // ตั้งสถานะเป็น 1 (สำเร็จ)
//         jobStatus,
//       ]);

//       const insertItemsQuery = `
//         INSERT INTO job_active (
//           job_ref,
//           productRef,
//           serialNumber,
//           pcs,
//           unit,
//           createAt,
//           updateAt,
//           status,
//           jobStatus
//         ) VALUES ?
//       `;
//       await connection.query(insertItemsQuery, [itemValues]);
//     }

//     // 4. ถ้าทุกอย่างสำเร็จ ให้ Commit Transaction
//     await connection.commit();

//     // 5. ส่งสถานะสำเร็จกลับไป
//     res.status(201).send({
//       success: true,
//       message: "สร้างงานและรายการสินค้าสำเร็จ",
//       jobId: newJobId,
//     });
//   } catch (err) {
//     // หากมีข้อผิดพลาด
//     console.error("เกิดข้อผิดพลาดในการสร้างงาน:", err);

//     // 6. Rollback Transaction เพื่อยกเลิกทุกอย่าง
//     await connection.rollback();

//     // 7. ส่งข้อความผิดพลาดกลับไป
//     res.status(500).send({
//       success: false,
//       message: "ไม่สามารถสร้างงานได้",
//       error: err.message, // ส่งข้อความ error เพื่อให้ debug ได้ง่ายขึ้น
//     });
//   } finally {
//     // 8. ปิดการเชื่อมต่อเสมอ ไม่ว่าจะสำเร็จหรือล้มเหลว
//     connection.release();
//   }
// });
