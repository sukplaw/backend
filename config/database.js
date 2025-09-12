// /config/db.js
const mysql = require("mysql2");
const dotenv = require("dotenv");

dotenv.config();

const pool = mysql.createConnection({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool.connect((err) => {
  if (err) {
    console.error("Error connecting to database:", err.stack);
    return;
  }
  console.log("Connected to database as ID " + pool.threadId);
});

module.exports = pool;
