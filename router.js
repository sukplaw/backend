const express = require("express");
const { route } = require("../react-sidebar/backend/router");
const router = express.Router();

router.use("/", require("./routes/Login"));
router.use("/", require("./routes/Home"));
router.use("/", require("./routes/product"));
router.use("/", require("./routes/customer"));
router.use("/", require("./routes/Job.js"));

module.exports = router;
