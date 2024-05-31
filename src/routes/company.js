// routes/users.js
const express = require("express");
const path = require("path");
const multer = require("multer");
const router = express.Router();
const { generateInsertSQL, generateUpdateSQL } = require("../utils/dbUtils");
const { middlewareVerifyToken } = require("../utils/middlewareVerifyToken");
const fs = require("fs");
const csvParse = require("csv-parser");
const { promisify } = require("util");
const readFileAsync = promisify(fs.readFile);
require("dotenv").config();

const uploadPath = path.join(
  __dirname,
  "..",
  "..",
  "tsul",
  "public",
  "assets",
  "images",
  "uploads"
); // Obter o caminho absoluto para o diretório de uploads

const uploadPath2 = path.join(
  __dirname,
  "..",
  "..",
  "tsul",
  "public",
  "assets",
  "excel"
); // Obter o caminho absoluto para o diretório de uploads

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Extrair a extensão do nome do arquivo original
    const fileExtension = path.extname(file.originalname);

    // Usar a extensão do arquivo no nome do arquivo salvo
    cb(null, Date.now() + "-logo-company" + fileExtension);
  },
});

const storageCSV = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath2);
  },
  filename: function (req, file, cb) {
    // Extrair a extensão do nome do arquivo original
    const fileExtension = path.extname(file.originalname);

    // Usar a extensão do arquivo no nome do arquivo salvo
    cb(null, Date.now() + "-excel" + fileExtension);
  },
});

const upload = multer({ storage: storage });
const uploadCSV = multer({
  storage: storageCSV,
  limits: {
    fields: 5,
    fieldNameSize: 50, // TODO: Check if this size is enough
    fieldSize: 20000, //TODO: Check if this size is enough
    // TODO: Change this line after compression
    fileSize: 5000, // 150 KB for a 1080x1080 JPG 90
  },
  fileFilter: (req, file, cb) => {
    if ("text/csv" != file.mimetype) {
      cb(new Error("Tipo do arquivo invalido!"));
    }
    cb(null, true);
  },
});

// Função de middleware para verificar a chave de API
function verificaAPIKey(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  if (
    apiKey === "DZSZ021B9CiOEB7W" &&
    secretKey ===
      "X7lrN0IHdGkWATT3K4QMhCq2rEoN8vAqPAb3hmA22b7pBdcCiacOiSINNKx7zlCZ"
  ) {
    // A chave de API é válida, prossiga para a próxima rota ou middleware
    next();
  } else {
    // A chave de API é inválida, retorne uma resposta 401 (Unauthorized)
    // Uma das chaves é inválida, retorne uma resposta 401 (Unauthorized)

    // Log de cabeçalhos e corpo da requisição no arquivo "algarlog.log"
    const logMessage = `Data/Hora: ${new Date()}\nHeaders: ${JSON.stringify(
      req.headers
    )}\nBody: ${JSON.stringify(req.body)}\n\n`;

    fs.appendFile("algarlog.log", logMessage, (err) => {
      if (err) {
        console.error("Erro ao escrever no arquivo de log:", err);
      }
    });
    res.status(401).json({ message: "Acesso não autorizado" });
  }
}
const fetch = require("node-fetch");
const { rejects } = require("assert");
const { count } = require("console");

// Função para fazer a requisição HTTP
async function sendRequest(url, apiKey, secretKey, requestBody) {
  // Cabeçalhos da requisição
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    "X-Secret-Key": secretKey,
  };

  // Configuração da requisição
  const requestOptions = {
    method: "POST",
    headers: headers,
    body: JSON.stringify(requestBody),
  };

  try {
    // Realiza a requisição usando fetch
    const response = await fetch(url, requestOptions);
    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
}

function validarCPF(cpf) {
  cpf = String(cpf).replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }
  let result = true;
  [9, 10].forEach((j) => {
    let soma = 0,
      r;
    cpf
      .split("")
      .splice(0, j)
      .forEach((e, i) => {
        soma += parseInt(e) * (j + 2 - (i + 1));
      });
    r = soma % 11;
    r = r < 2 ? 0 : 11 - r;
    if (r !== parseInt(cpf.substring(j, j + 1))) {
      result = false;
    }
  });
  return result;
}

async function validarCabecalhoDoArquivo(file) {
  try {
    const primeiraLinha = (await readFileAsync(file.path, "utf-8"))
      .split("\n")[0]
      .trim();

    if (primeiraLinha === "cpf;nome;email;telefone;genero;plano;departamento") {
      return file;
    }

    throw {
      message: "O cabeçalho está incorreto",
      linhas: 0,
      errosPacientes: null,
    };
  } catch (error) {
    throw error;
  }
}

async function validarLinhasDoArquivo(file) {
  try {
    const stream = fs.createReadStream(file.path);
    const parseFile = csvParse({ separator: ";", from_line: 4 });
    stream.pipe(parseFile);

    const pacientesError = [];
    let numeroDeLinhas = 0;

    parseFile.on("data", (row) => {
      numeroDeLinhas++;

      if (row.nome && row.nome.trim().split(" ").length < 2) {
        pacientesError.push({ paciente: row.nome, erro: "nome inválido" });
      }

      if (!validarCPF(row.cpf)) {
        pacientesError.push({ paciente: row.nome, erro: "CPF inválido" });
      }

      if (row.email) {
        const emailRegexp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegexp.test(row.email)) {
          pacientesError.push({ paciente: row.nome, erro: "email inválido" });
        }
      }

      if (row.telefone) {
        const telefone = row.telefone.replace(/[^0-9]/g, "");
        const telefoneRegexp = /^[1-9]{2}9[0-9]{8}$/;

        if (!telefoneRegexp.test(telefone)) {
          pacientesError.push({
            paciente: row.nome,
            erro: "telefone inválido",
          });
        }
      }
    });

    await new Promise((resolve, reject) => {
      parseFile.on("end", () => resolve());
      parseFile.on("error", (err) => reject(err));
    });

    return { erros: pacientesError, linhas: numeroDeLinhas };
  } catch (error) {
    throw error;
  }
}

router.post(
  "/excelimport",
  uploadCSV.single("excelimport"),
  async (req, res) => {
    try {
      const file = req.file;

      if (!file) {
        throw new Error("Arquivo não encontrado");
      }

      await validarCabecalhoDoArquivo(file);
      const resultadoValidacaoLinhas = await validarLinhasDoArquivo(file);

      if (resultadoValidacaoLinhas.erros.length > 0) {
        return res.status(400).json({
          message: "Arquivo não processado linhas errados",
          linhas: resultadoValidacaoLinhas.linhas || 0,
          errosPacientes: resultadoValidacaoLinhas.erros || [],
          status: 400,
        });
      }

      /// envio para a api de criacao de licencas
      axios;

      return res.status(201).json({
        message: "Arquivo enviado com sucesso!",
        linhas: resultadoValidacaoLinhas.linhas,
        errosPacientes: [],
        status: 201,
      });
    } catch (error) {
      return res.status(400).json({
        message: "Arquivo não processado",
        linhas: error.linhas || 0,
        errosPacientes: error.errosPacientes || [],
        status: 400,
      });
    }
  }
);

router.post("/create-company", verificaAPIKey, async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  const {
    name,
    country_code,
    has_epharma,
    has_activation_code_notifications,
    identifier,
    email_admin,
    number_of_licenses,
  } = req.body;

  // URL do endpoint
  const url = "https://sdk.mediquo.com/v1/organizations";

  // Dados do corpo da requisição
  const requestBody = {
    name,
    country_code,
    has_epharma,
    has_activation_code_notifications,
  };

  try {
    // Chama a função sendRequest para fazer a requisição
    const responseData = await sendRequest(url, apiKey, secretKey, requestBody);

    console.log(responseData);

    res.status(200).json({
      message: "Requisição enviada com sucesso!",
      status: 200,
      responseData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao processar a requisição" });
  }
});

router.post(
  "/register",
  middlewareVerifyToken,
  upload.single("company_img"),
  async (req, res) => {
    const db = req.db;
    try {
      const {
        company_name,
        company_document,
        max_licenses,
        epharma,
        company_prefix,
      } = req.body;
      if (!company_name || !company_document || !max_licenses) {
        return res.status(429).json({
          message: "Está faltando dados para realizar o cadastro!",
          status: 429,
        });
      }

      const resultUser = await db.query(
        "SELECT company_id FROM users where user_id = $1",
        [req.userId]
      );

      const [company] = resultUser.rows;

      const resultCompanies = await db.query(
        "SELECT x_api_key, x_secret_key FROM companies where company_id = $1",
        [company.company_id]
      );
      console.log(resultCompanies.rows);
      const [companyKeys] = resultCompanies.rows;

      var has_epharma = epharma === "0" ? false : true;
      var axios = require("axios").default;
      const nameCompany = company_name + " - " + company_document;
      var options = {
        method: "POST",
        url: "https://sdk.mediquo.com/v1/organizations",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": companyKeys.x_api_key,
          "x-secret-key": companyKeys.x_secret_key,
        },
        data: { name: nameCompany, country_code: "br", has_epharma },
      };

      const responseAxios = await axios.request(options);

      const dataCompanyMediquo = responseAxios.data;
      const company_img = req.file ? req.file.filename : null;
      const objectInsert = {
        company_name,
        company_document,
        x_api_key: dataCompanyMediquo.data.api_key,
        x_secret_key: dataCompanyMediquo.data.secret_key,
        max_licenses,
        company_img,
        epharma: has_epharma,
        prefix: company_prefix,
        reference_company: company.company_id,
      };
      const { sql, values } = generateInsertSQL("companies", objectInsert);

      await db.query(sql, values);

      return res.json({ message: "Empresa cadastrada com sucesso!" });
    } catch (error) {
      res.status(500).send("Erro interno do servidor");
    }
  }
);

router.put(
  "/edit/:id",
  middlewareVerifyToken,
  upload.single("company_img"),
  async (req, res) => {
    const { id } = req.params;
    const { company_name, company_document, max_licenses } = req.body;
    if (!company_name || !company_document || !max_licenses) {
      return res.status(429).json({
        message: "Está faltando dados para realizar o cadastro!",
        status: 429,
      });
    }

    const objectEdit = {
      company_name,
      company_document,
      max_licenses,
    };
    if (req.file) {
      objectEdit.company_img = req.file.filename;
    }

    const { sql, values } = generateUpdateSQL(
      "companies",
      objectEdit,
      id,
      "company_id"
    );

    const db = req.db;

    db.query(sql, values, (err, result) => {
      if (err) {
        res.status(500).send("Erro interno do servidor");
      }
    });
    res.json({ message: "Empresa editado com sucesso!" });
  }
);

router.get("/", middlewareVerifyToken, async (req, res) => {
  const db = req.db;
  const user_id = req.userId;
  const resultCompanies = await db.query(
    "SELECT company_id FROM users where user_id = $1",
    [user_id]
  );

  const [usercomp] = resultCompanies.rows;

  const company = usercomp.company_id;

  const resultCompaniesAdmin = await db.query(
    "SELECT company_id, master_company, reference_company FROM companies where company_id = $1",
    [company]
  );

  const [companyAdmin] = resultCompaniesAdmin.rows;

  let arrayWhere = [companyAdmin.reference_company];
  let concatWhere = ``;
  if (companyAdmin.master_company == false) {
    concatWhere = " AND company_id = $2";
    arrayWhere.push(company);
  }

  const companies = await db.query(
    `SELECT company_id, company_name, company_document, company_img, number_of_active_licenses, number_of_disabled_licenses, max_licenses, epharma, prefix, created_at FROM companies WHERE reference_company = $1 ${concatWhere} ORDER BY company_id`,
    arrayWhere
  );

  return res.json(companies.rows);

  db.query(
    "SELECT company_id FROM users where user_id = $1",
    [user_id],
    async (err, resultCompany) => {
      if (err) {
        return res.status(500).json({ message: "Erro interno do servidor." });
      }
      const [usercomp] = resultCompany.rows;
      const company = usercomp.company_id;
      let arrayWhere = [];
      let concatWhere = ``;
      if (company != 0) {
        concatWhere = " AND company_id = $1";
        arrayWhere.push(company);
      }
      db.query(
        `SELECT company_id, company_name, company_document, company_img, number_of_active_licenses, number_of_disabled_licenses, max_licenses, epharma, prefix, created_at FROM companies WHERE company_id <> 0 ${concatWhere} ORDER BY company_id`,
        arrayWhere,
        (err, result) => {
          if (err) {
            res.status(500).send("Erro interno do servidor");
          }
          const dataResponse = result.rows;
          res.json(dataResponse);
        }
      );
    }
  );
});

router.get("/dash", middlewareVerifyToken, async (req, res) => {
  const db = req.db;
  const userId = req.userId; // Supondo que o req.userId contém o ID do usuário

  try {
    const queryUserResult = await db.query(
      "SELECT company_id FROM users WHERE user_id = $1",
      [userId]
    );

    const { company_id } = queryUserResult.rows[0];

    if (company_id === 0) {
      const queryResult = await db.query(
        "SELECT sum(b.number_of_active_licenses) as number_of_active_licenses, sum(b.number_of_disabled_licenses) as number_of_disabled_licenses, sum(b.max_licenses) as max_licenses FROM companies b ",
        []
      );

      // Extrair os valores do resultado da consulta
      const {
        number_of_active_licenses,
        number_of_disabled_licenses,
        max_licenses,
      } = queryResult.rows[0];

      // Retornar os valores como um objeto JSON na resposta
      const number_of_licenses_created =
        Number(number_of_active_licenses) + Number(number_of_disabled_licenses);
      const number_of_licenses_available =
        max_licenses - number_of_active_licenses;
      res.json({
        number_of_active_licenses,
        number_of_disabled_licenses,
        number_of_licenses_available,
        number_of_licenses_created,
      });
    } //if company_id===0
    // Retornar os valores como um objeto JSON na resposta

    if (company_id > 0) {
      const queryResult = await db.query(
        "SELECT b.number_of_active_licenses, b.number_of_disabled_licenses, b.max_licenses FROM users a INNER JOIN companies b ON a.company_id = b.company_id WHERE a.user_id = $1",
        [userId]
      );

      // Extrair os valores do resultado da consulta
      const {
        number_of_active_licenses,
        number_of_disabled_licenses,
        max_licenses,
      } = queryResult.rows[0];

      // Retornar os valores como um objeto JSON na resposta
      const number_of_licenses_created =
        number_of_active_licenses + number_of_disabled_licenses;
      const number_of_licenses_available =
        max_licenses - number_of_active_licenses;
      res.json({
        number_of_active_licenses,
        number_of_disabled_licenses,
        number_of_licenses_available,
        number_of_licenses_created,
      });
    } //if company_id<>0
  } catch (err) {
    res.status(500).json(err);
  }
});

router.get("/:id", middlewareVerifyToken, async (req, res) => {
  const db = req.db;
  const { id } = req.params;
  db.query(
    "SELECT * FROM companies WHERE company_id = $1",
    [id],
    (err, result) => {
      if (err) {
        res.status(500).send("Erro interno do servidor");
      }
      const dataResponse = result.rows[0];
      res.json(dataResponse);
    }
  );
});

module.exports = router;
