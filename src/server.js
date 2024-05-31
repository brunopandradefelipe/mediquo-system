const express = require("express");
const db = require("./connectdb");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const app = express();
const port = 3203;

app.use(express.json());
app.use(cors());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..", "tsul", "public")));
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});
app.use((req, res, next) => {
  req.db = db;
  next();
});

app.use("/", require("./routes/view"));
app.use("/api/users", require("./routes/users"));
app.use("/api/mediquo", require("./routes/mediquo"));
app.use("/api/company", require("./routes/company"));
app.use("/api/algarApi", require("./routes/algarApi"));

app.listen(port, () => {
  console.log(`Server is running on ${port}`);
});
