// routes/users.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { generateInsertSQL, generateUpdateSQL } = require("../utils/dbUtils");
const { middlewareVerifyToken } = require("../utils/middlewareVerifyToken");
const { getUserByID } = require("../modules/user");
require("dotenv").config();

router.post("/register", async (req, res) => {
  const {
    first_name,
    last_name,
    user_document,
    phone,
    company_id,
    email,
    password,
  } = req.body;
  if (
    !first_name ||
    !last_name ||
    !user_document ||
    !phone ||
    !company_id ||
    !email ||
    !password
  ) {
    return res.status(429).json({
      message: "Está faltando dados para realizar o cadastro!",
      status: 429,
    });
  }
  const hashedPassword = await bcrypt.hash(password, 8);
  const objectInsert = {
    first_name,
    last_name,
    user_document,
    phone,
    company_id,
    email,
    password: hashedPassword,
  };
  const { sql, values } = generateInsertSQL("users", objectInsert);

  const db = req.db;

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Erro ao executar a consulta:", err);
      res.status(500).send("Erro interno do servidor");
    }
  });
  res.json({ message: "Usuário cadastrado com sucesso!" });
});

router.get("/logout", middlewareVerifyToken, (req, res) => {
  res.clearCookie("token");
  return res.json({ message: "Desconectado com sucesso!", status: 200 });
});

router.get("/xteste", (req, res) => {
  res.clearCookie("token");
  return res.json({ message: "Desconectado com sucesso!", status: 200 });
});

router.post("/edit/:id", async (req, res) => {
  const {
    first_name,
    last_name,
    user_document,
    phone,
    company_id,
    email,
    password,
  } = req.body;
  if (
    !first_name ||
    !last_name ||
    !user_document ||
    !phone ||
    !company_id ||
    !email
  ) {
    return res.status(429).json({
      message: "Está faltando dados para realizar o cadastro!",
      status: 429,
    });
  }
  const { id } = req.params;
  const objectEdit = {
    first_name,
    last_name,
    user_document,
    phone,
    company_id,
    email,
  };
  if (password) {
    const hashedPassword = await bcrypt.hash(password, 8);
    objectEdit.password = hashedPassword;
  }
  const { sql, values } = generateUpdateSQL("users", objectEdit, id, "user_id");

  const db = req.db;

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Erro ao executar a consulta:", err);
      res.status(500).send("Erro interno do servidor");
    }
  });
  res.json({ message: "Usuário cadastrado com sucesso!" });
});

// Rota para fazer login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verifica se o e-mail e a senha foram fornecidos
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "E-mail e senha são obrigatórios." });
    }
    const db = req.db;
    // Consulta o usuário pelo e-mail no banco de dados
    db.query(
      "SELECT * FROM users WHERE email = $1",
      [email],
      async (err, result) => {
        if (err) {
          console.error("Erro ao executar a consulta:", err);
          return res.status(500).json({ message: "Erro interno do servidor." });
        }

        const user = result.rows[0];

        // Verifica se o usuário existe
        if (!user) {
          return res.status(429).json({ message: "Credenciais inválidas." });
        }

        // Verifica a senha usando bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
          return res.status(401).json({ message: "Credenciais inválidas." });
        }

        // Gera o token JWT
        const secretKey = process.env.JWT_SECRET;
        const token = jwt.sign({ email, userId: user.user_id }, secretKey, {
          expiresIn: "30m",
        });
        res.cookie("token", token);
        res.json({ message: "Login bem-sucedido!", token });
      }
    );
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    res.status(500).json({ message: "Erro interno do servidor." });
  }
});

router.get("/", middlewareVerifyToken, async (req, res) => {
  const db = req.db;
  const user_id = req.userId;
  try {
    const resultUsers = await db.query(
      "SELECT company_id FROM users where user_id = $1",
      [user_id]
    );
    const [usercomp] = resultUsers.rows;
    const company = usercomp.company_id;
    const resultCompanies = await db.query(
      "SELECT master_company, reference_company FROM companies where company_id = $1",
      [company]
    );
    const [companyUser] = resultCompanies.rows;
    let arrayWhere = [];
    let concatWhere = ``;
    if (companyUser.master_company == false) {
      concatWhere = " AND a.company_id = $1";
      arrayWhere.push(company);
    }

    const resultUser2 = await db.query(
      `SELECT a.first_name, a.last_name, a.email, a.phone, a.user_document, a.company_id, a.user_id, b.company_name, b.master_company FROM users a INNER JOIN companies b ON a.company_id = b.company_id WHERE a.company_id <> 0${concatWhere}`,
      arrayWhere
    );
    const user = resultUser2.rows;
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: "Erro interno do servidor." });
  }
});

// Rota protegida por autenticação
router.get("/getuser", middlewareVerifyToken, async (req, res) => {
  console.log(req.userId);
  const db = req.db;
  // Consulta o usuário pelo e-mail no banco de dados
  const result = await db.query(
    "SELECT a.first_name, a.last_name, a.email, a.phone, a.user_document, a.company_id, b.company_name, b.company_img, b.access_level, b.prefix, b.master_company FROM users a INNER JOIN companies b ON a.company_id = b.company_id WHERE a.user_id = $1",
    [req.userId]
  );
  const [user] = result.rows;
  return res.json(user);
});

router.get("/:id", middlewareVerifyToken, (req, res) => {
  const db = req.db;
  const { id } = req.params;
  // Consulta o usuário pelo e-mail no banco de dados
  db.query(
    "SELECT a.first_name, a.last_name, a.email, a.phone, a.user_document, a.company_id, a.user_id FROM users a WHERE a.user_id = $1",
    [id],
    async (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Erro interno do servidor." });
      }
      const [user] = result.rows;
      res.json(user);
    }
  );
});

module.exports = router;
