const express = require("express");
const mysql = require("mysql2");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
dotenv.config();

const port = 3302;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const pool = mysql
  .createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: "local",
    dateStrings: true,
  })
  .promise();

app.get("/get-customers", (req, res) => {
  pool
    .query("SELECT * FROM customerTest")
    .then(([rows, fields]) => {
      console.log("Query result:", rows);
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});
app.get("/get-job", (req, res) => {
  pool
    .query(
      `
      SELECT
        j.jobRef, j.serialNumber, j.createAt,
        latest_ja.updateAt AS latestUpdateAt, j.jobStatus,
        latest_ja.updateBy AS latestUpdateBy,
        j.expected_completion_date, j.customer_contact, j.serviceRef,
        c.username, p.product_name, p.sku
      FROM job AS j
      JOIN customer AS c ON c.customerRef = j.customerRef
      JOIN product AS p ON p.productRef = j.productRef
      JOIN (
        SELECT jobRef, updateAt, jobStatus, updateBy
        FROM (
          SELECT
            jobRef, updateAt, jobStatus, updateBy,
            ROW_NUMBER() OVER(PARTITION BY jobRef ORDER BY updateAt DESC) AS rn
          FROM job_active
        ) AS subquery
        WHERE subquery.rn = 1
      ) AS latest_ja ON j.jobRef = latest_ja.jobRef
      ORDER BY latest_ja.updateAt DESC;
      `
    )
    .then(([rows, fields]) => {
      console.log("Filtered result:", rows);
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});
// app.get("/get-job", (req, res) => {
//   pool
//     .query(
//       `SELECT ja.jobRef, j.serialNumber, j.createAt, ja.updateAt, ja.jobStatus,
//              j.expected_completion_date, j.customer_contact, ja.updateBy, j.serviceRef,
//              c.*, p.*
//       FROM job AS j
//       JOIN customer AS c ON c.customerRef = j.customerRef
//       JOIN product AS p ON p.productRef = j.productRef
//       JOIN job_active AS ja ON ja.jobRef = j.jobRef
//       ORDER BY ja.updateAt;`
//     )
//     .then(([rows, fields]) => {
//       console.log("Query result:", rows);
//       res.json(rows);
//     })
//     .catch((err) => {
//       console.error("Error executing query:", err);
//       res.status(500).json({ error: "Internal Server Error" });
//     });
// });

app.get("/get-job/:jobStatus", (req, res) => {
  const sqlQuery = `SELECT
        j.jobRef, j.serialNumber, j.createAt,
        latest_ja.updateAt AS latestUpdateAt, j.jobStatus,
        latest_ja.updateBy AS latestUpdateBy,
        j.expected_completion_date, j.customer_contact, j.serviceRef,
        c.username, p.product_name, p.sku
      FROM job AS j
      JOIN customer AS c ON c.customerRef = j.customerRef
      JOIN product AS p ON p.productRef = j.productRef
      JOIN (
        SELECT jobRef, updateAt, jobStatus, updateBy
        FROM (
          SELECT
            jobRef, updateAt, jobStatus, updateBy,
            ROW_NUMBER() OVER(PARTITION BY jobRef ORDER BY updateAt DESC) AS rn
          FROM job_active
        ) AS subquery
        WHERE subquery.rn = 1
      ) AS latest_ja ON j.jobRef = latest_ja.jobRef
      WHERE j.jobStatus = ? ORDER BY latest_ja.updateAt DESC `;
  const jobStatus = req.params.jobStatus;
  pool
    .query(sqlQuery, [jobStatus])
    .then(([rows, fields]) => {
      if (rows.length === 0) {
        console.log(`No details found for jobStatus: ${jobStatus}`);
        return res.status(404).json({ error: "Details not found" });
      }
      console.log("Query result:", rows);
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});

app.get("/get-home", (req, res) => {
  pool
    .query(
      `SELECT ja.jobRef,p.product,j.serialNumber,p.sku,ja.jobRef
FROM job AS j 
JOIN customer AS c ON j.customerRef = c.customerRef
JOIN job_active AS ja ON j.productRef = ja.productRef
JOIN product AS p ON j.productRef = p.productRef;`
    )
    .then(([rows, fields]) => {
      console.log("Query result:", rows);
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});

app.get("/get-dashboard", (req, res) => {
  pool
    .query(
      `SELECT DISTINCT ja.jobRef,c.username,ja.unit,p.category,j.createAt,ja.updateAt,ja.jobStatus,p.sku FROM job_active AS ja
JOIN job AS j ON j.jobRef = ja.jobRef
JOIN product AS p ON p.productRef = j.productRef
JOIN customer AS c ON c.customerRef = j.customerRef`
    )
    .then(([rows, fields]) => {
      console.log("Query result:", rows);
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});

app.post("/create-job", async (req, res) => {
  const {
    jobRef,
    serialNumber,
    productRef,
    serviceRef,
    jobStatus,
    expected_completion_date,
    customer_contact,
    customerRef,
    items,
    claimImage, // ✅ array ของรูป (URL)
  } = req.body;

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // ✅ Insert ข้อมูลลงตาราง job
    const insertJobQuery = `
      INSERT INTO job (
        jobRef,
        serialNumber,
        productRef,
        serviceRef,
        action_status,
        jobStatus,
        expected_completion_date,
        customer_contact,
        customerRef,
        error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [jobResult] = await connection.query(insertJobQuery, [
      jobRef,
      serialNumber,
      productRef,
      serviceRef,
      0,
      jobStatus,
      expected_completion_date,
      customer_contact,
      customerRef,
      null,
    ]);

    // ✅ เพิ่มรูปเข้า job_image
    if (claimImage && Array.isArray(claimImage)) {
      const imageValues = claimImage.map((url) => [jobRef, url, jobStatus]);

      const insertImagesQuery = `
    INSERT INTO job_image (jobRef, imageUrl, job_image_status)
    VALUES ?
  `;

      await connection.query(insertImagesQuery, [imageValues]);
    }

    // ✅ เพิ่ม job_active ถ้ามี
    if (items && Array.isArray(items) && items.length > 0) {
      const itemValues = items.map((item) => [
        item.jobRef,
        item.productRef,
        item.serialNumber,
        item.pcs,
        item.unit,
        new Date(),
        new Date(),
        1,
        item.jobStatus,
        item.serviceRef,
      ]);

      const insertItemsQuery = `
        INSERT INTO job_active (
          jobRef,
          productRef,
          serialNumber,
          pcs,
          unit,
          createAt,
          updateAt,
          status,
          jobStatus,
          createBy
        ) VALUES ?
      `;
      await connection.query(insertItemsQuery, [itemValues]);
    }

    const insertServiceActionQuery = `
      INSERT INTO service_action (jobRef, status, serviceRef)
      VALUES (?, 1, ?)
    `;
    await connection.query(insertServiceActionQuery, [jobRef, serviceRef]);

    await connection.commit();
    res.status(200).json({ message: "Job created successfully", jobRef });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Error creating job:", error);
    res.status(500).json({ message: "Failed to create job", error });
  } finally {
    if (connection) connection.release();
  }
});

////////////////////////////customer////////////////////////////////////////////////

app.post("/create-customers", async (req, res) => {
  console.log("Received data:", req.body);

  if (!req.body.customer_firstname) {
    return res.status(400).json({ error: "Missing customer_firstname" });
  }

  try {
    const sql = `
      INSERT INTO customer 
      (customerRef, customer_firstname, customer_lastname, customer_old, username, email, line_id, phone, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      req.body.customerRef,
      req.body.customer_firstname,
      req.body.customer_lastname,
      req.body.customer_old,
      req.body.username,
      req.body.email,
      req.body.line_id,
      req.body.phone,
      req.body.address,
    ];

    const [rows, fields] = await pool.query(sql, values);

    console.log("Query successful, inserted ID:", rows.insertId);
    res.status(201).json({
      message: "Customer created successfully!",
      customerId: rows.insertId,
    });
  } catch (error) {
    console.error("Database query failed:", error);
    res
      .status(500)
      .json({ error: "Failed to create customer", details: error.message });
  }
});

app.post("/create-product", async (req, res) => {
  console.log("Received data:", req.body);

  try {
    const sql = `INSERT INTO product (productRef,product_name,sku,pcs,category,brand,description,image)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [
      req.body.productRef,
      req.body.product_name,
      req.body.sku,
      req.body.pcs,
      req.body.category,
      req.body.brand,
      req.body.description,
      req.body.image,
    ];

    const [row, fields] = await pool.query(sql, values);

    console.log("Query successful, inserted ID:", row.insertId);
    res.status(201).json({
      message: "Product created successfully!",
      productId: row.insertId,
    });
  } catch (error) {
    console.error("Database query failed:", error);
    res
      .status(500)
      .json({ error: "Failed to create product", details: error.message });
  }
});

////////////////////////////////////////// category //////////////////////////

app.get("/get-category", (req, res) => {
  pool
    .query("SELECT * FROM type_product")
    .then(([row, fields]) => {
      console.log("Query result:", row);
      res.json(row);
    })
    .catch((err) => {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});

app.post("/create-category", async (req, res) => {
  console.log("Received data:", req.body);
  try {
    const sql = `INSERT INTO type_product (category) VALUES (?)`;
    const values = [req.body.category];
    const [rows, fields] = await pool.query(sql, values);

    console.log("Query successful, inserted ID:", rows.insertId);
    res.status(201).json({
      message: "category created successfully!",
      categoryId: rows.insertId,
    });
  } catch (error) {
    console.error("Database query failed:", error);
    res
      .status(500)
      .json({ error: "Failed to create category", details: error.message });
  }
});

app.get("/get-product", (req, res) => {
  pool
    .query("SELECT * FROM product")
    .then(([rows, fields]) => {
      console.log("Query result:", rows);
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});

app.get("/get-customer", (req, res) => {
  pool
    .query("SELECT * FROM customer")
    .then(([rows, fields]) => {
      console.log("Query result:", rows);
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});

app.post("/create-customerTest", async (req, res) => {
  console.log("Received data:", req.body);

  try {
    const sql = `INSERT INTO customertest (name)
    VALUES (?)`;
    const values = [req.body.name];

    const [row, fields] = await pool.query(sql, values);

    console.log("Query successful, inserted ID:", row.insertId);
    res.status(201).json({
      message: "Product created successfully!",
      productId: row.insertId,
    });
  } catch (error) {
    console.error("Database query failed:", error);
    res
      .status(500)
      .json({ error: "Failed to create product", details: error.message });
  }
});

app.get("/get-chart", (req, res) => {
  pool
    .query(
      `SELECT *
FROM job AS j 
JOIN product AS p ON j.productRef = p.productRef`
    )
    .then(([rows, fields]) => {
      console.log("Query result:", rows);
      res.json(rows);
    })
    .catch((err) => {
      console.error("Error executing query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});

// ///////////////////////ShowDetail//////////////////////////////////////////

app.get("/get-detail/:jobRef", async (req, res) => {
  const jobRef = req.params.jobRef;
  console.log("🔎 Request jobRef:", jobRef);

  try {
    // 🔍 Query หลักจาก job, customer, product, job_active
    const [jobRows] = await pool.query(
      `
      SELECT j.jobRef, j.serialNumber, j.createAt, ja.updateAt, ja.jobStatus,
             j.expected_completion_date, j.customer_contact, ja.updateBy, j.serviceRef,
             ji.imageUrl,ja.remark,ja.unit,
             c.*, p.*
      FROM job AS j
      JOIN customer AS c ON c.customerRef = j.customerRef
      JOIN product AS p ON p.productRef = j.productRef
      JOIN job_active AS ja ON ja.jobRef = j.jobRef
      JOIN job_image AS ji ON ji.jobRef = j.jobRef
      WHERE j.jobRef = ?
      ORDER BY ja.updateAt;
    `,
      [jobRef]
    );

    if (jobRows.length === 0) {
      console.log(`No details found for jobRef: ${jobRef}`);
      return res.status(404).json({ error: "Details not found" });
    }

    // 🖼️ ดึงรูปแบบรวมเป็น JSON array
    const [imgAggRows] = await pool.query(
      `
      SELECT
    COALESCE(
        JSON_ARRAYAGG(
            JSON_OBJECT(
                'imageUrl', ji.imageUrl,
                'status', ji.job_image_status
            )
        ),
        JSON_ARRAY()
    ) AS images
FROM job_image AS ji WHERE ji.jobRef = ? ORDER BY ji.id;
    `,
      [jobRef]
    );

    let images = [];
    try {
      images =
        typeof imgAggRows[0].images === "string"
          ? JSON.parse(imgAggRows[0].images)
          : imgAggRows[0].images || [];
    } catch (err) {
      console.error("❌ Error parsing images JSON:", err);
      images = [];
    }

    // 🧩 รวมผลลัพธ์ทั้งหมด
    const result = jobRows.map((row) => ({
      ...row,
      images,
    }));

    console.log("🚀 Response result:", result);
    res.json(result);
  } catch (err) {
    console.error("❌ Error executing query:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//test-code
app.put("/update-status/:jobRef", async (req, res) => {
  // Log ข้อมูลที่เข้ามาทั้งหมดก่อน
  console.log("Received PUT /update-status");
  console.log("Params:", req.params);
  console.log("Body:", req.body);
  console.log("Headers:", req.headers);

  const jobRef = req.params.jobRef;
  const newStatus = req.body.jobStatus;

  // ✅ ดึงข้อมูล user จาก JWT (ที่ frontend เก็บใน localStorage และส่งมาใน headers: Authorization: Bearer <token>)
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // แยก "Bearer <token>" และใช้ <token>
  console.log("Headers token:", authHeader);
  console.log("token:", token);

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Token is missing" });
  }

  let decoded;
  try {
    // ตรวจสอบความถูกต้องของ token ด้วย `jwt.verify`
    decoded = jwt.verify(token, process.env.JWT_SECRET || "secret123");
    console.log("Decoded JWT:", decoded); // ✅ ต้องมีค่าถูกต้องที่นี่
  } catch (err) {
    console.error("JWT verification failed:", err); // 🔥 สำคัญมาก
    return res.status(403).json({ error: "Invalid token" });
  }

  const serviceRef = decoded.serviceRef; // ✅ เอามาเก็บเป็น updatedBy และ service_action

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const updateStatusQuery = `UPDATE job SET jobStatus = ? WHERE jobRef = ?`;
    const [updateResult] = await connection.execute(updateStatusQuery, [
      newStatus,
      jobRef,
    ]);

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({
        message: "Job not found or no changes were made.",
      });
    }

    const selectQuery = `
      SELECT j.jobRef,p.productRef,j.serialNumber,p.pcs,ja.unit,j.createAt,
        j.jobStatus  
      FROM job AS j 
      JOIN customer AS c ON j.customerRef = c.customerRef
      JOIN job_active AS ja ON j.productRef = ja.productRef
      JOIN product AS p ON j.productRef = p.productRef 
      WHERE j.jobRef = ?
    `;

    const [rows] = await connection.execute(selectQuery, [jobRef]);
    const jobData = rows[0];

    if (!jobData) {
      throw new Error("Job not found after update.");
    }

    // ✅ Insert ลง job_active พร้อม updatedBy
    const logQuery = `
      INSERT INTO job_active (
        jobRef,productRef,serialNumber,pcs,unit,createAt,
        status,jobStatus,updateBy
      ) VALUE (?,?,?,?,?,?,?,?,?)
    `;

    const logValues = [
      jobData.jobRef,
      jobData.productRef,
      jobData.serialNumber,
      jobData.pcs,
      jobData.unit,
      jobData.createAt,
      1,
      jobData.jobStatus,
      serviceRef,
    ];
    await connection.execute(logQuery, logValues);

    // ✅ Insert/Update ลง service_action
    const insertServiceActionQuery = `
      INSERT INTO service_action (jobRef, status, statusJob, serviceRef)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        statusJob = VALUES(statusJob),
        serviceRef = VALUES(serviceRef)
    `;

    await connection.execute(insertServiceActionQuery, [
      jobRef,
      1,
      newStatus,
      serviceRef,
    ]);

    await connection.commit();
    res
      .status(200)
      .json({ message: "Job status updated and log created successfully." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Failed to update job status or create log:", error);
    res
      .status(500)
      .json({ message: "Error updating job status and creating log." });
  } finally {
    if (connection) connection.release();
  }
});

app.put("/update-remark/:jobRef", async (req, res) => {
  // Log ข้อมูลที่เข้ามาทั้งหมด
  console.log("[PUT /update-remark] Endpoint ถูกเรียกใช้งาน");
  console.log("Body:", req.body);
  console.log("Params:", req.params);

  const { jobRef } = req.params;
  const { remark, images, jobStatus } = req.body;

  // ตรวจสอบข้อมูลที่จำเป็น
  if (!remark || !jobStatus) {
    return res.status(400).json({
      message: "Missing required fields: remark or jobStatus.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. ค้นหาแถวที่ล่าสุดใน job_active เพื่ออัปเดต remark
    const findLatestJobActiveQuery = `
      SELECT job_active_id FROM job_active 
      WHERE jobRef = ? 
      ORDER BY updateAt DESC 
      LIMIT 1;
    `;
    const [rows] = await connection.execute(findLatestJobActiveQuery, [jobRef]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        message: "Job not found in job_active.",
      });
    }

    const latestJobActiveId = rows[0].job_active_id;
    const updateRemarkQuery = `
      UPDATE job_active SET remark = ? WHERE job_active_id = ?;
    `;
    const [updateResult] = await connection.execute(updateRemarkQuery, [
      remark,
      latestJobActiveId,
    ]);

    // 2. บันทึกภาพลงในตาราง job_image
    if (images && images.length > 0) {
      const insertJobImageQuery = `
            INSERT INTO job_image (jobRef, imageUrl, job_image_status)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE job_image_status = VALUES(job_image_status);
        `;
      for (const imageUrl of images) {
        console.log("Inserting image:", imageUrl);
        await connection.execute(insertJobImageQuery, [
          jobRef,
          imageUrl,
          jobStatus,
        ]);
      }
    }

    await connection.commit();
    res.status(200).json({
      message: "Job remark and images added successfully.",
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Failed to update job remark or add images:", error);
    res.status(500).json({
      message: "Error updating job remark and adding images.",
    });
  } finally {
    if (connection) connection.release();
  }
});

// server.js
app.delete("/delete-job/:jobRef", (req, res) => {
  const jobRef = req.params.jobRef;
  const sqlQuery = `DELETE FROM job WHERE jobRef = ?`;

  pool
    .query(sqlQuery, [jobRef])
    .then(([result]) => {
      // result.affectedRows tells you how many rows were deleted
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Job not found." });
      }
      res.status(200).json({ message: "Job deleted successfully." });
    })
    .catch((err) => {
      console.error("Error deleting job:", err);
      res.status(500).json({ error: "Internal Server Error" });
    });
});

// server.js
app.delete("/delete-job/:jobRef", async (req, res) => {
  const { jobRef } = req.params;

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const sqlActive = `DELETE FROM job_active WHERE jobRef = ?`;
    const [resultActive] = await connection.query(sqlActive, [jobRef]);

    const sqlJob = `DELETE FROM job WHERE jobRef = ?`;
    const [resultJob] = await connection.query(sqlJob, [jobRef]);

    if (resultActive.affectedRows === 0 && resultJob.affectedRows === 0) {
      await connection.rollback();
      return res
        .status(404)
        .json({ message: "Job not found in either table." });
    }
    await connection.commit();
    res
      .status(200)
      .json({ message: "Job and associated data deleted successfully." });
  } catch (err) {
    if (connection) {
      await connection.rollback();
    }
    console.error("Error deleting job with transaction:", err);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

app.put("/update-customer/:customerRef", async (req, res) => {
  const customerRef = req.params.customerRef;
  const {
    customer_firstname,
    customer_lastname,
    customer_old,
    username,
    email,
    line_id,
    phone,
    address,
    customer_contact, // <-- เพิ่มตัวแปรนี้เข้ามา
  } = req.body;

  try {
    const updateCustomerQuery = `
      UPDATE customer
      SET
        customer_firstname = ?,
        customer_lastname = ?,
        customer_old = ?,
        username = ?,
        email = ?,
        line_id = ?,
        phone = ?,
        address = ?
      WHERE customerRef = ?
    `;

    const updateJobContactQuery = `
      UPDATE job
      SET customer_contact = ?
      WHERE customerRef = ?
    `;

    // อัปเดตตาราง 'customer'
    const [customerUpdateResult] = await pool.execute(updateCustomerQuery, [
      customer_firstname,
      customer_lastname,
      customer_old,
      username,
      email,
      line_id,
      phone,
      address,
      customerRef,
    ]);

    // แก้ไขตรงนี้: ส่งตัวแปร 'customer_contact' เข้าไปแทน 'phone'
    await pool.execute(updateJobContactQuery, [customer_contact, customerRef]);

    if (customerUpdateResult.affectedRows === 0) {
      return res.status(404).json({
        message: "ไม่พบลูกค้าหรือไม่มีการเปลี่ยนแปลงข้อมูล",
      });
    }

    res.status(200).json({
      message: "อัปเดตข้อมูลลูกค้าและข้อมูลงานที่เกี่ยวข้องสำเร็จแล้ว",
    });
  } catch (error) {
    console.error("การอัปเดตข้อมูลล้มเหลว:", error);
    res
      .status(500)
      .json({ message: "เกิดข้อผิดพลาดในการอัปเดตข้อมูลลูกค้าและข้อมูลงาน" });
  }
});

app.put("/update-product/:productRef", async (req, res) => {
  const productRef = req.params.productRef;
  const { product_name, sku, pcs, category, brand, description, image } =
    req.body;

  try {
    // The query is updated to set jobStatus, productRef, and pcs.
    const updateStatusQuery = `UPDATE product SET product_name = ?, sku = ?, pcs = ?, 
    category = ?, brand = ?, description = ?, image = ? WHERE productRef = ?`;
    const [updateResult] = await pool.execute(updateStatusQuery, [
      product_name,
      sku,
      pcs,
      category,
      brand,
      description,
      image,
      productRef,
    ]);

    // Check if any rows were affected. If not, the customerRef was not found.
    if (updateResult.affectedRows === 0) {
      return res.status(404).json({
        message: "Product not found or no changes were made.",
      });
    }

    // Respond with a success message since the update was successful.
    res.status(200).json({ message: "product  updated successfully." });
  } catch (error) {
    // Log the error and send a 500 status code on failure.
    console.error("Failed to update product:", error);
    res.status(500).json({ message: "Error updating product." });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
