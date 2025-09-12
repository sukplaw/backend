// /routes/authRoutes.js
// Authentication routes for user registration and login.
// This file handles user management and JWT token generation.

const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("../config/database");
const { SECRET_KEY } = require("../middleware/authMiddleware");

const router = express.Router();
const SALT_ROUNDS = 10;

// User registration route
router.post("/register", async (req, res) => {
  const { username, password, permission } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Default permission for new users
    const userPermission = permission || "user";

    // Use parameterized query to prevent SQL injection
    const [result] = await db.query(
      "INSERT INTO login (username, password, permission) VALUES (?, ?, ?)",
      [username, hashedPassword, userPermission]
    );

    res.status(201).json({ message: "User registered successfully." });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Username already exists." });
    }
    console.error("Registration failed:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// User login route
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required." });
  }

  try {
    const [rows] = await db.query("SELECT * FROM login WHERE username = ?", [
      username,
    ]);

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    // Create a JWT token
    const token = jwt.sign(
      { username: user.username, permission: user.permission },
      SECRET_KEY,
      { expiresIn: "1h" }
    );

    res.json({ token, permission: user.permission });
  } catch (err) {
    console.error("Login failed:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

module.exports = router;
