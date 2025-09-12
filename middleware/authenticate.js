const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(403).json({ message: "Invalid token" });
  }
};
