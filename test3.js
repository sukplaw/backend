app.put("/update-remark/:jobRef", async (req, res) => {
  // const token =
  //   req.headers.authorization?.split(" ")[1] || req.body.token;

  // if (!token) return res.status(401).json({ error: "Unauthorized" });

  // let decoded;
  // try {
  //   decoded = jwt.verify(token, "secret123");
  //   console.log("Decoded JWT:", decoded);
  // } catch (err) {
  //   console.error("JWT verification failed:", err);
  //   return res.status(403).json({ error: "Invalid token" });
  // }

  // const serviceRef = decoded.serviceRef;
  const jobRef = req.params.jobRef;
  const { remark, images: claimImage, jobStatus } = req.body;
  console.log("Received jobRef:", jobRef);
  console.log("Received remark:", remark);
  console.log("Received images:", claimImage);
  console.log("Received jobStatus:", jobStatus);
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // อัปเดต remark ใน row ล่าสุดของ jobRef
    const updateRemarkQuery = `
      UPDATE job_active 
      SET remark = ? 
      WHERE jobRef = ? 
      ORDER BY updateAt DESC 
      LIMIT 1
    `;
    await connection.execute(updateRemarkQuery, [remark, jobRef]);

    // บันทึกรูปภาพ
    if (claimImage && Array.isArray(claimImage)) {
      const imageValues = claimImage.map((url) => [
        jobRef,
        url,
        jobStatus || "ไม่ทราบสถานะ",
        // serviceRef,
      ]);

      const insertImagesQuery = `
        INSERT INTO job_image (jobRef, imageUrl, status)
        VALUES ?
      `;
      await connection.query(insertImagesQuery, [imageValues]);
    }

    await connection.commit();
    res.status(200).json({ message: "Remark & Images updated successfully." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Failed to update remark or images:", error);
    res
      .status(500)
      .json({ message: "Error updating remark and saving images." });
  } finally {
    if (connection) connection.release();
  }
});