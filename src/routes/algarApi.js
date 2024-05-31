// routes/users.js
const express = require("express");
const path = require("path");
const multer = require("multer");
const router = express.Router();
const { generateInsertSQL, generateUpdateSQL } = require("../utils/dbUtils");
const { middlewareVerifyToken } = require("../utils/middlewareVerifyToken");
const fs = require("fs");
const bcrypt = require("bcrypt");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

require("dotenv").config();

const { Pool } = require("pg");

// Configuração do pool de conexões
const pool = new Pool({
  user: "postgrestsul",
  host: "algar-servidor-bd.cc3iki3lycx6.sa-east-1.rds.amazonaws.com",
  database: "teste",
  password: "hcsXMUKw3JJX9s9jcyI0",
  port: 5432, // Porta padrão do PostgreSQL
  max: 20, // Número máximo de conexões no pool
  idleTimeoutMillis: 30000, // Tempo em milissegundos para uma conexão ficar inativa antes de ser encerrada
  ssl: {
    rejectUnauthorized: false,
  },
});

function formatarDataParaString(data) {
  const opcoesDeFormato = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  };

  const formato = new Intl.DateTimeFormat("pt-BR", opcoesDeFormato);
  return formato.format(data);
}

//Gerador de senha inicial para o usuario criado
function generateRandomString(length) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let randomString = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    randomString += characters.charAt(randomIndex);
  }

  return randomString;
}

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

// Função para verificar se um identificador já existe na tabela companies
async function checkIfIdentifierExists(client, identifier, contractNumber) {
  const query =
    "SELECT COUNT(*) as count FROM public.companies WHERE company_document = $1 and contract_number= $2";
  const values = [identifier, contractNumber];

  const result = await client.query(query, values);

  const count = parseInt(result.rows[0].count, 10);
  return count > 0; // Retorna true se o identificador já existe, caso contrário, retorna false.
}

const verificarLicencasDecrease = async (
  pool,
  identifier,
  contractNumber,
  number_of_licenses,
  max_licenses_epharma,
  max_licenses_standard,
  max_licenses_health_checks
) => {
  const maxLicensesEpharma = parseInt(max_licenses_epharma, 10);
  const maxLicensesStandard = parseInt(max_licenses_standard, 10);
  const maxLicensesHealthChecks = parseInt(max_licenses_health_checks, 10);

  const query = `
    SELECT company_id, company_name, company_document, number_of_active_licenses, 
    max_licenses, status, contract_number, max_licenses_epharma, 
    max_licenses_standard, max_licenses_health_checks 
    FROM public.companies 
    WHERE company_document = $1 AND contract_number = $2
  `;

  const result = await pool.query(query, [identifier, contractNumber]);

  if (result.rows.length === 0) {
    return "Empresa ou Contrato não existente";
  }
  console.log(result.rows[0]);
  const companyData = result.rows[0];

  const companyMaxLicenses = parseInt(companyData.max_licenses, 10);
  const companyLicensesStandard = parseInt(
    companyData.max_licenses_standard,
    10
  );
  const companyLicensesEpharma = parseInt(companyData.max_licenses_epharma, 10);

  if (companyData.status != "1") {
    return "Falha: Empresa nao está Ativa";
  }

  if (
    maxLicensesEpharma + maxLicensesStandard + maxLicensesHealthChecks >
    companyData.max_licenses
  ) {
    return (
      "Falha: Inconsistência no numero total de licenças" +
      companyData.max_licenses +
      "-" +
      (maxLicensesEpharma + maxLicensesStandard + maxLicensesHealthChecks)
    );
  }

  if (maxLicensesStandard > companyLicensesStandard) {
    return "Falha: Inconsistência na informações dos numeros de licenças: Padrão";
  }

  if (maxLicensesEpharma > companyLicensesEpharma) {
    return "Falha: Inconsistência na informações dos numeros de licenças: E-Pharma";
  }

  return "StatusOK";
};

async function desativarCodigo(apiKey, secretKey, codigo, company_id) {
  const baseUrl = "https://sdk.mediquo.com/v1/activation-codes";
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    "X-Secret-Key": secretKey,
    Cookie:
      "AWSALBTG=VuETKlEmvA0Fa54YLyUsS3F4Dsm7XGlo2OiS2M3xSwkYuxc075p5SbmMJvDsZyeFyN10uxH5Y1Uvxm2%2B95jgpbJ4W%2BfRBkI6crDkPL6nUJlhTwgfc8rJ8UpXFppNA1WsfqG9I71Lo6Po2moP%2BUeUjEbtNKY2JavnyRvGsowA8f8B; AWSALBTGCORS=VuETKlEmvA0Fa54YLyUsS3F4Dsm7XGlo2OiS2M3xSwkYuxc075p5SbmMJvDsZyeFyN10uxH5Y1Uvxm2%2B95jgpbJ4W%2BfRBkI6crDkPL6nUJlhTwgfc8rJ8UpXFppNA1WsfqG9I71Lo6Po2moP%2BUeUjEbtNKY2JavnyRvGsowA8f8B",
  };

  const url = `${baseUrl}/${codigo}/deactivate`;

  try {
    const response = await axios.put(url, null, { headers });
    // Inserir no banco de dados
    const insercaoQuery = {
      text: "INSERT INTO public.suspended_licences (company_id, code, created_at, status) VALUES ($1, $2, $3, $4)",
      values: [company_id, codigo, new Date(), 0],
    };

    await pool.query(insercaoQuery);

    console.log(
      `Código ${codigo} desativado com sucesso. Resposta:`,
      response.data
    );
  } catch (error) {
    console.error(`Erro ao desativar o código ${codigo}. Erro:`, error.message);
  }
}

async function obterCodigos(apiKey, secretKey, company_id) {
  const baseUrl = "https://sdk.mediquo.com/v1/activation-codes";
  const headers = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    "X-Secret-Key": secretKey,
  };

  let pagina = 1;

  do {
    const url = `${baseUrl}?page=${pagina}`;
    try {
      const response = await axios.get(url, { headers });
      const codigos = response.data.data;

      for (const codigoInfo of codigos) {
        const codigo = codigoInfo.code;
        await desativarCodigo(apiKey, secretKey, codigo, company_id);
      }

      // Verificar se há mais páginas
      if (response.data.links.next) {
        pagina++;
      } else {
        break;
      }
    } catch (error) {
      console.error(
        `Erro ao obter códigos da página ${pagina}. Erro:`,
        error.message
      );
      break;
    }
  } while (true);
}

const verificarLicencasIncrease = async (
  pool,
  identifier,
  contractNumber,
  number_of_licenses,
  max_licenses_epharma,
  max_licenses_standard,
  max_licenses_health_checks
) => {
  const numberOfLicenses = parseInt(number_of_licenses, 10);
  const maxLicensesEpharma = parseInt(max_licenses_epharma, 10);
  const maxLicensesStandard = parseInt(max_licenses_standard, 10);
  const maxLicensesHealthChecks = parseInt(max_licenses_health_checks, 10);

  const query = `
    SELECT company_id, company_name, company_document, number_of_active_licenses, 
    max_licenses, status, contract_number, max_licenses_epharma, 
    max_licenses_standard, max_licenses_health_checks 
    FROM public.companies 
    WHERE company_document = $1 AND contract_number = $2
  `;

  const result = await pool.query(query, [identifier, contractNumber]);

  if (result.rows.length === 0) {
    return "Empresa ou Contrato não existente";
  }

  const companyData = result.rows[0];

  const companyMaxLicenses = parseInt(companyData.max_licenses, 10);
  const companyLicensesStandard = parseInt(
    companyData.max_licenses_standard,
    10
  );
  const companyLicensesEpharma = parseInt(companyData.max_licenses_epharma, 10);

  if (companyData.status != "1") {
    return "Falha: Empresa nao está Ativa";
  }

  if (
    maxLicensesEpharma + maxLicensesStandard + maxLicensesHealthChecks !=
    numberOfLicenses
  ) {
    return (
      "Falha: Inconsistência no numero total de licenças" +
      numberOfLicenses +
      "-" +
      (maxLicensesEpharma + maxLicensesStandard + maxLicensesHealthChecks)
    );
  }

  return "StatusOK";
};

// Função para criar um registro de usuário em uma empresa
async function createUserCompany(
  pool,
  name,
  user_document,
  phone,
  company_id,
  email,
  password
) {
  // Divida o nome em first_name e last_name
  const [first_name, last_name] = name.split(" ");

  // Hash da senha usando bcrypt
  const hashedPassword = await bcrypt.hash(password, 8);

  // Consulta SQL para inserir o registro do usuário
  const query = `
    INSERT INTO public.users
    (first_name, last_name, user_document, phone, company_id, email, "password")
    VALUES
    ($1, $2, $3, $4, $5, $6, $7)
    RETURNING user_id;
  `;

  // Parâmetros da consulta SQL
  const values = [
    first_name,
    last_name,
    user_document,
    phone,
    company_id,
    email,
    hashedPassword,
  ];

  // Execute a consulta SQL usando a conexão do pool
  const client = await pool.connect();
  try {
    const { rows } = await client.query(query, values);

    // rows[0] conterá o user_id recém-inserido na tabela users
    const user_id_inserido = rows[0].user_id;

    console.log("Usuário inserido com o user_id:", user_id_inserido);

    return hashedPassword;
  } finally {
    // Libere a conexão de volta para o pool
    client.release();
  }
}

// Função para inserir um registro na tabela companies
async function insertCompanyRecord(
  client,
  company_id,
  name,
  identifier,
  contract_number,
  apiKey,
  secretKey,
  imageUrl,
  accessLevel,
  numberOfLicenses,
  status,
  hasEpharma,
  max_licenses_epharma,
  max_licenses_standard,
  max_licenses_health_checks,
  api_key_epharma,
  api_secret_key_epharma
) {
  const query = `
    INSERT INTO public.companies
    (company_name, company_document, contract_number, x_api_key, x_secret_key, company_img, access_level, number_of_active_licenses, number_of_disabled_licenses, max_licenses,
    status, epharma, max_licenses_epharma, max_licenses_standard, max_licenses_health_checks, x_api_key_epharma,
    x_secret_key_epharma) 
    VALUES
    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING company_id;
  `;

  // Parâmetros da consulta SQL
  const values = [
    name,
    identifier,
    contract_number,
    apiKey,
    secretKey,
    imageUrl,
    accessLevel,
    "0",
    "0", // Valor padrão para number_of_disabled_licenses
    numberOfLicenses, // Valor padrão para max_licenses
    status,
    hasEpharma,
    max_licenses_epharma,
    max_licenses_standard,
    max_licenses_health_checks,
    api_key_epharma,
    api_secret_key_epharma,
  ];

  // Execute a consulta SQL usando a conexão do pool
  const clientDB = await pool.connect();
  try {
    const { rows } = await clientDB.query(query, values);

    // rows[0] conterá o company_id recém-inserido na tabela companies
    const company_id_inserido = rows[0].company_id;

    console.log("Registro inserido com o company_id:", company_id_inserido);

    return company_id_inserido;
  } finally {
    // Libere a conexão de volta para o pool
    clientDB.release();
  }
}

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

function enviarEmail(recipient, subject, user, transactionId, data, type) {
  // Configurar as credenciais da AWS
  const awsAccessKeyId = "";
  const awsSecretAccessKey = "";
  const awsRegion = "sa-east-1"; // por exemplo, 'us-east-1'
  const emailImages = "https://mediquo.com.br/faq/imagens/mediquo/";

  data = formatarDataParaString(data);

  // Configurar o cliente SES
  const sesClient = new SESClient({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });

  // Criar o corpo do e-mail usando a template com imagem

  let emailBody;
  console.log("tipo " + type);
  if (type === "welcome") {
    emailBody = `
    <html>
    <head>
      <style>
        /* Adicione estilos CSS conforme necessário */
      </style>
    </head>
    <body>
  
    <!-- Cabeçalho com Logomarca -->
    <header>
        <img src="https://sua-url.com/logo.jpg" alt="Logomarca da Empresa">
        <h1>Boas-vindas Testes</h1>
    </header>
  
    <!-- Corpo do E-mail -->
    <p>Olá ${user},</p>
  
    <p>Gostaríamos de informar que a transação com o ID ${transactionId} foi processada com sucesso em ${data}.</p>
  
    <p>Agradecemos pela sua confiança em nossos serviços.</p>
  
    <p>Atenciosamente, [Seu Nome]</p>
  
    </body>
    </html>
  `;
  } else if (type === "suspended") {
    emailBody = `
    <html>
    <head>
      <style>
        /* Adicione estilos CSS conforme necessário */
      </style>
    </head>
    <body>
  
    <!-- Cabeçalho com Logomarca -->
    <header>
        <img src="https://sua-url.com/logo.jpg" alt="Logomarca da Empresa">
        <h1>Teste de Envio de Email</h1>
    </header>
  
    <!-- Corpo do E-mail -->
    <p>Olá ${user},</p>
  
    <p>Gostaríamos de informar que o contrato de número ${transactionId} foi suspenso em ${data}.</p>
  
    <p>Agradecemos pela sua confiança em nossos serviços.</p>
  
    <p>Atenciosamente, [Seu Nome]</p>
  
    </body>
    </html>
  `;
  } else if (type === "changeContract") {
    emailBody = `
    <html>
    <head>
      <style>
        /* Adicione estilos CSS conforme necessário */
      </style>
    </head>
    <body>
  
    <!-- Cabeçalho com Logomarca -->
    <header>
        <img src="https://sua-url.com/logo.jpg" alt="Logomarca da Empresa">
        <h1>Alteração de Contrato - Teste</h1>
    </header>
  
    <!-- Corpo do E-mail -->
    <p>Olá ${user},</p>
  
    <p>Gostaríamos de informar que o contrato de número ${transactionId} foi alterado com sucesso em ${data}.</p>
  
    <p>Agradecemos pela sua confiança em nossos serviços.</p>
  
    <p>Atenciosamente, [Seu Nome]</p>
  
    </body>
    </html>
  `;
  } else if (type === "reactivated") {
    emailBody = `
    <html>
    <head>
      <style>
        /* Adicione estilos CSS conforme necessário */
      </style>
    </head>
    <body>
  
    <!-- Cabeçalho com Logomarca -->
    <header>
        <img src="https://sua-url.com/logo.jpg" alt="Logomarca da Empresa">
        <h1>Teste de Envio de Email</h1>
    </header>
  
    <!-- Corpo do E-mail -->
    <p>Olá ${user},</p>
  
    <p>Gostaríamos de informar que o contrato de número ${transactionId} foi reativado em ${data}.</p>
  
    <p>Agradecemos pela sua confiança em nossos serviços.</p>
  
    <p>Atenciosamente, [Seu Nome]</p>
  
    </body>
    </html>
  `;
  } else if (type === "notify") {
    emailBody = `
  <html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><title></title></head><body style="color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; font-size:14px; line-height:1.5; margin:0">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title></title> <style type="text/css">@media only screen and (max-width: 640px) {    .sp-hidden-mob {        display: none !important        }    }</style><style type="text/css"> table,td{border-collapse:collapse}img{height:auto;line-height:100%;outline:0;-ms-interpolation-mode:bicubic}a,img{text-decoration:none}h1,h2,h3,h4,h5,p{line-height:1.5;margin:0 0 10px}ul>li{mso-special-format:bullet}h1,h2,h3,h4,h5{line-height:1.2;font-weight:400}h1{font-size:36px}h2{font-size:30px}h3{font-size:24px}h4{font-size:20px}h5,p{font-size:14px}hr{margin:0}th.social_element,th.tc{font-weight:400;text-align:left}td,th,tr{border-color:transparent}.content-cell{vertical-align:top}.content-cell table.social,.content-cell table.social table,.content-cell table.social td,.content-cell table.social th,.content-cell table.sp-button,.content-cell table.sp-button table,.content-cell table.sp-button td,.content-cell table.sp-button th,img{border:0}#outlook a,.content-cell table.social td,.content-cell table.social th,.content-cell table.sp-button td,.content-cell table.sp-button th{padding:0}.content-cell .sp-button table td,.content-cell table.social{line-height:1}.content-cell>center>.sp-button{margin-left:auto;margin-right:auto}.content-cell .social,.content-cell .social_element,.content-cell .sp-button-side-padding,.content-cell .sp-button-text{border-color:transparent;border-width:0;border-style:none}.content-cell .sp-button-side-padding{width:21px}.content-cell .sp-button-text a{text-decoration:none;display:block}.content-cell .sp-button-text a img,.sp-video img{max-width:100%}.content-cell em,.content-cell span[style*=color]>a,.email-text .data_text em,.email-text em,.email-wrapper span[style*=color]>a{color:inherit}.content-cell>div>.sp-img,.content-cell>div>a>.sp-img,body{margin:0}.content-cell .link_img,.content-cell table.social .social_element img.social,.social_element img.social,.sp-video a{display:block}.content-cell .sp-button-img td{display:table-cell!important;width:initial!important}.content-cell>p,.email-text .data_text>p,.email-text>p{line-height:inherit;color:inherit;font-size:inherit}.content-cell>table,.content-cell>table>tbody>tr>td,.content-cell>table>tbody>tr>th,.content-cell>table>tr>td,.content-cell>table>tr>th,.email-text .data_text>table,.email-text .data_text>table>tbody>tr>td,.email-text .data_text>table>tbody>tr>th,.email-text .data_text>table>tr>td,.email-text .data_text>table>tr>th,.email-text>table,.email-text>table>tbody>tr>td,.email-text>table>tbody>tr>th,.email-text>table>tr>td,.email-text>table>tr>th{border-color:#ddd;border-width:1px;border-style:solid}.content-cell>table td,.content-cell>table th,.email-text .data_text>table td,.email-text .data_text>table th,.email-text>table td,.email-text>table th{padding:3px}.content-cell table.social .social_element,.social_element{padding:2px 5px;font-size:13px;font-family:Arial,sans-serif;line-height:32px}.content-cell table.social .social_element_t_3 img.social,.content-cell table.social .social_element_t_4 img.social,.content-cell table.social .social_element_t_5 img.social,.content-cell table.social .social_element_v_i_t img.social{display:inline}.email-text table th{text-align:center}.email-text pre{background-color:transparent;border:0;color:inherit;padding:0;margin:1em 0}.sp-video a{overflow:auto}@media only screen and (max-width:640px){.sp-hidden-mob{display:none!important} }body{padding:0}*{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}.ExternalClass,.ReadMsgBody{width:100%}.ExternalClass *{line-height:100%}table{margin-bottom:0!important;border-color:transparent}u~div .gmail-hide{display:none}u~div .gmail-show{display:block!important}@media yahoo {.yahoo-hide{display:none}.yahoo-show{display:block!important} }.im{color:inherit!important}td[class^=xfmc]{width:inherit!important}@media only screen and (max-width:640px){.wrapper-table{min-width:296px}.sp-demo-label-link{display:block}td,th{margin-bottom:0;height:inherit!important}td.content-cell,th.content-cell{padding:15px!important}table.email-checkout.email-checkout-yandex,td.content-cell .social,td.no-responsive p>a,th.content-cell .social,th.no-responsive p>a{width:auto!important}td.content-cell .share th,td.content-cell .social td .share td,td.content-cell .social th,th.content-cell .share th,th.content-cell .social td .share td,th.content-cell .social th{display:inline-block!important}td,td.content-cell .share th.social_element_t_3,td.content-cell .share th.social_element_t_4,td.content-cell .social td .share td.social_element_t_3,td.content-cell .social td .share td.social_element_t_4,td.content-cell .social th.social_element_t_3,td.content-cell .social th.social_element_t_4,th,th.content-cell .share th.social_element_t_3,th.content-cell .share th.social_element_t_4,th.content-cell .social td .share td.social_element_t_3,th.content-cell .social td .share td.social_element_t_4,th.content-cell .social th.social_element_t_3,th.content-cell .social th.social_element_t_4{display:block!important}td.content-cell .share th a>img,td.content-cell .social td .share td a>img,td.content-cell .social th a>img,th.content-cell .share th a>img,th.content-cell .social td .share td a>img,th.content-cell .social th a>img{width:32px!important;height:32px!important}td.content-cell>td,th.content-cell>td{width:100%}.tc.responsive,td.content-cell>p,th.content-cell>p{width:100%!important}td.content-cell.padding-lr-0,th.content-cell.padding-lr-0{padding-left:0!important;padding-right:0!important}td.content-cell.padding-top-0,th.content-cell.padding-top-0{padding-top:0!important}td.content-cell.padding-bottom-0,th.content-cell.padding-bottom-0{padding-bottom:0!important}.sp-video{padding-left:15px!important;padding-right:15px!important}.wrapper-table>tbody>tr>td{padding:0}.block-divider{padding:2px 15px!important}.social_share{width:16px!important;height:16px!important}.sp-button td{width:initial!important}.sp-button td.sp-button-side-padding{width:21px!important}input{max-width:100%!important}table{border-width:1px}.sp-button td,.tc.no-responsive,table.origin-table td{display:table-cell!important}.inline-item,table.smallImg td.smallImg{display:inline!important}table.origin-table{width:95%!important}table.origin-table td{padding:0!important}.p100_img{width:100%!important;max-width:100%!important;height:auto!important}table.social{width:initial!important} }@media only screen and (max-width:640px) and screen and (-ms-high-contrast:active),only screen and (max-width:640px) and (-ms-high-contrast:none){td,th{float:left;width:100%;clear:both}.content-cell img,img:not(.p100_img){width:auto;height:auto;max-width:269px!important;margin-right:auto;display:block!important;margin-left:auto} }.content-cell{word-break:break-word}.content-cell *{-webkit-box-sizing:border-box;box-sizing:border-box}.rollover{font-size:0}@media only screen and (max-width:640px){.rollover img.sp-img.desktop,.rollover img.sp-img.desktop.rollover-first,.rollover img.sp-img.desktop.rollover-second,img.sp-img.desktop{display:none!important}img.sp-img.mobile{display:block!important} }@media only screen and (min-width:641px){.rollover img.sp-img.mobile,.rollover img.sp-img.mobile.rollover-first,.rollover img.sp-img.mobile.rollover-second{display:none!important} } .rollover:hover .desktop.rollover-first, .rollover:hover .mobile.rollover-first{ max-height: 0 !important; display: none !important; } .rollover .desktop.rollover-second, .rollover .mobile.rollover-second { max-height: 0 !important; display: none !important; } .rollover:hover .desktop.rollover-second, .rollover:hover .mobile.rollover-second { max-height: none !important; display: block !important; object-fit: cover; } td.content-cell .social th{ display: inline-block !important; } @media only screen and (max-width:640px){ table { width: 100% !important; } table,hr { width: 100%; max-width: 100% !important; } td,div { width: 100% !important; height: auto !important; box-sizing: border-box; } td,th { display: block !important; margin-bottom: 0; height: inherit !important; } } </style> 
<div style="display:none;width:0;max-height:0;overflow:hidden;mso-hide:all;height:0;font-size:0;line-height:0;margin:0 auto;">
    <!--[if !mso]-->
    <table style="width: 100%" width="100%">
        <tbody><tr style="line-height: 0">
            <td>&nbsp;</td>
            <td align="center" width="1" style="text-align: center; width: 1px;">
                <img width="1" height="1" style="width: 1px; height: 1px;" src="${emailImages}/cdcfe447714696b08ff41a2fdacad1b0" alt="-">
            </td>
            <td>&nbsp;</td>
        </tr>
    </tbody></table>
    <!--[endif]-->
</div>
<div style="font-size:14px; line-height:1.5; background-color:#fff" bgcolor="#ffffff"><table class="wrapper-table" cellpadding="5" cellspacing="0" width="100%" border="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; background-repeat:no-repeat" background="./747991a0e145ac2bbe69f063a9402e69"><!--[if gte mso 9]><v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t"><v:fill type="frame" color="#ffffff"/>        </v:background><![endif]--><tbody><tr style="border-color:transparent"><td align="center" style="border-collapse:collapse; border-color:transparent"><table cellpadding="0" cellspacing="0" width="500px" id="bodyTable" border="0" bgcolor="#ffffff" style="border-collapse:collapse; font-size:14px; line-height:1.5"><tbody><tr style="border-color:transparent"><td border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><td style="border-collapse:collapse; border-color:transparent; padding-left:0; padding-right:0; padding-top:0; padding-bottom:0; vertical-align:top" border="0" cellpadding="0" cellspacing="0" valign="top"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><th width="500" style="border-color:transparent; font-weight:400; text-align:left; vertical-align:top" cellpadding="0" cellspacing="0" class="tc responsive " align="left" valign="top"><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="w" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; background-color:#fff; font-weight:normal; margin:0; overflow:hidden" bgcolor="#ffffff"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:30px; padding-right:0; padding-top:15px; padding-bottom:15px" valign="top"><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table></th></tr></tbody></table></td></tr></tbody></table><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><td style="border-collapse:collapse; border-color:transparent; padding-left:0; padding-right:0; padding-top:0; padding-bottom:0; vertical-align:top" border="0" cellpadding="0" cellspacing="0" valign="top"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><th width="500" style="border-color:transparent; font-weight:400; text-align:left; vertical-align:top" cellpadding="0" cellspacing="0" class="tc responsive " align="left" valign="top"><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_25_element_0" style="border-collapse:separate; font-size:14px; line-height:1.5; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><div id="wout_block_25_element_0" style="font-size:14px; line-height:1.5; width:100%; height:46; display:block" width="100%" height="46"><img border="0" width="470" height="auto" class="desktop  sp-img " align="left" alt="mediquo_-_cabealho" src="${emailImages}/mediquo_-_cabealho.png" iout_block_25_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; margin:0; display:block; -ms-interpolation-mode:bicubic"><!--[if !mso]><!--><div style="font-size:14px; line-height:1.5; mso-hide:all"><img border="0" width="100%" height="auto" class="mobile  sp-img " align="left" alt="mediquo_-_cabealho" src="${emailImages}/mediquo_-_cabealho.png" iout_block_25_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; -ms-interpolation-mode:bicubic; display:none; width:100%; max-width:100% !important"></div><!--<![endif]--></div><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table></th></tr></tbody></table></td></tr></tbody></table><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><td style="border-collapse:collapse; border-color:transparent; padding-left:0; padding-right:0; padding-top:0; padding-bottom:0; vertical-align:top" border="0" cellpadding="0" cellspacing="0" valign="top"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><th width="500" style="border-color:transparent; font-weight:400; text-align:left; vertical-align:top" cellpadding="0" cellspacing="0" class="tc responsive " align="left" valign="top"><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_25_element_0" style="border-collapse:separate; font-size:14px; line-height:1.5; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><div id="wout_block_25_element_0" style="font-size:14px; line-height:1.5; width:100%; height:115; display:block" width="100%" height="115"><img border="0" width="470" height="auto" class="desktop  sp-img " align="left" alt="QR_Code_FAQ" src="${emailImages}/QR_Code_FAQ.png" iout_block_25_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; margin:0; display:block; -ms-interpolation-mode:bicubic"><!--[if !mso]><!--><div style="font-size:14px; line-height:1.5; mso-hide:all"><img border="0" width="100%" height="auto" class="mobile  sp-img " align="left" alt="QR_Code_FAQ" src="${emailImages}/QR_Code_FAQ.png" iout_block_25_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; -ms-interpolation-mode:bicubic; display:none; width:100%; max-width:100% !important"></div><!--<![endif]--></div><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="w" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell padding-lr-0 padding-top-0 padding-bottom-0" width="500" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:0; padding-right:0; padding-top:0; padding-bottom:0" valign="top"><h2 style="line-height:1.2; margin:0 0 10px; font-weight:normal; font-size:30px; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center" align="center"><span style="color: #808080;"><strong>Bem-vindo ao MediQuo!&nbsp;</strong></span></h2><h4 style="line-height:1.2; margin:0 0 10px; font-weight:normal; font-size:20px; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center" align="center"><span style="font-size: 16px;">A sua saúde a um clique de distância!</span></h4><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table></th></tr></tbody></table></td></tr></tbody></table><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><td style="border-collapse:collapse; border-color:transparent; padding-left:0; padding-right:0; padding-top:0; padding-bottom:0; vertical-align:top" border="0" cellpadding="0" cellspacing="0" valign="top"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><th width="500" style="border-color:transparent; font-weight:400; text-align:left; vertical-align:top" cellpadding="0" cellspacing="0" class="tc responsive " align="left" valign="top"><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_26" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; font-weight:normal; padding:0">Olá,</p><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; font-weight:normal; padding:0">Estamos muito felizes em tê-lo como nosso cliente no aplicativo de telemedicina mais utilizado na Europa e que agora ganha cada vez mais o Brasil!</p><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; font-weight:normal; padding:0">Você contará com atendimento de saúde de qualquer lugar e em qualquer horário. Para iniciarmos vamos te passar 5 passos para começar a usar!</p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table></th></tr></tbody></table></td></tr></tbody></table><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><td style="border-collapse:collapse; border-color:transparent; padding-left:0; padding-right:0; padding-top:0; padding-bottom:0; vertical-align:top" border="0" cellpadding="0" cellspacing="0" valign="top"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><th width="250" style="border-color:transparent; font-weight:400; text-align:left; vertical-align:top" cellpadding="0" cellspacing="0" class="tc responsive " align="left" valign="top"><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_27_element_0" style="border-collapse:separate; font-size:14px; line-height:1.5; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="220" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><div id="wout_block_27_element_0" style="font-size:14px; line-height:1.5; width:100%; height:150; display:block; text-align:center" width="100%" height="150" align="center"><center><a href='https://play.google.com/store/apps/details?id=com.mediquo.main&hl=pt_BR&gl=US'></a><a href='https://lite.mediquo.com/'><img border="0" width="110" height="auto" class="desktop  sp-img small_img smallImg " align="center" alt="Android_MediQuo" src="${emailImages}/Android_MediQuo.png" iout_block_27_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; display:block; -ms-interpolation-mode:bicubic"><!--[if !mso]><!--><div style="font-size:14px; line-height:1.5; mso-hide:all"><img border="0" width="100%" height="auto" class="mobile  sp-img small_img smallImg " align="center" alt="Android_MediQuo" src="${emailImages}/Android_MediQuo.png" iout_block_27_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; -ms-interpolation-mode:bicubic; display:none; width:100%; max-width:229px !important"></div><!--<![endif]--></center></div><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table></th><th width="250" style="border-color:transparent; font-weight:400; text-align:left; vertical-align:top" cellpadding="0" cellspacing="0" class="tc responsive " align="left" valign="top"><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_28_element_0" style="border-collapse:separate; font-size:14px; line-height:1.5; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="220" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><div id="wout_block_28_element_0" style="font-size:14px; line-height:1.5; width:100%; height:156; display:block; text-align:center" width="100%" height="156" align="center"><center><a href='https://lite.mediquo.com/'><img border="0" width="110" height="auto" class="desktop  sp-img small_img smallImg " align="center" alt="Iphone_MediQuo" src="${emailImages}/Iphone_MediQuo.png" iout_block_28_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; display:block; -ms-interpolation-mode:bicubic"><!--[if !mso]><!--><div style="font-size:14px; line-height:1.5; mso-hide:all"></a><a href='https://lite.mediquo.com/'><img border="0" width="100%" height="auto" class="mobile  sp-img small_img smallImg " align="center" alt="Iphone_MediQuo" src="${emailImages}/Iphone_MediQuo.png" iout_block_28_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; -ms-interpolation-mode:bicubic; display:none; width:100%; max-width:228px !important"></div><!--<![endif]--></a></center></div><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table></th></tr></tbody></table></td></tr></tbody></table><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><td style="border-collapse:collapse; border-color:transparent; padding-left:0; padding-right:0; padding-top:0; padding-bottom:0; vertical-align:top" border="0" cellpadding="0" cellspacing="0" valign="top"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><th width="500" style="border-color:transparent; font-weight:400; text-align:left; vertical-align:top" cellpadding="0" cellspacing="0" class="tc responsive " align="left" valign="top"><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_20_element_0" style="border-collapse:separate; font-size:14px; line-height:1.5; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><div id="wout_block_20_element_0" style="font-size:14px; line-height:1.5; width:100%; height:78; display:block; text-align:center" width="100%" height="78" align="center"><center><img border="0" width="69" height="auto" class="desktop  sp-img small_img smallImg " align="center" alt="1" src="${emailImages}/1.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; display:block; -ms-interpolation-mode:bicubic"><!--[if !mso]><!--><div style="font-size:14px; line-height:1.5; mso-hide:all"><img border="0" width="100%" height="auto" class="mobile  sp-img small_img smallImg " align="center" alt="1" src="${emailImages}/1.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; -ms-interpolation-mode:bicubic; display:none; width:100%; max-width:174px !important"></div><!--<![endif]--></center></div><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_14" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span style="font-size: 20px;"> <strong> Baixe o Aplicativo</strong></span></p><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center">Acesse&nbsp; QR Code acima e faça donwload do App para seu Smartphone.</p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_20_element_0" style="border-collapse:separate; font-size:14px; line-height:1.5; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><div id="wout_block_20_element_0" style="font-size:14px; line-height:1.5; width:100%; height:78; display:block; text-align:center" width="100%" height="78" align="center"><center><img border="0" width="69" height="auto" class="desktop  sp-img small_img smallImg " align="center" alt="2" src="${emailImages}/2.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; display:block; -ms-interpolation-mode:bicubic"><!--[if !mso]><!--><div style="font-size:14px; line-height:1.5; mso-hide:all"><img border="0" width="100%" height="auto" class="mobile  sp-img small_img smallImg " align="center" alt="2" src="${emailImages}/2.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; -ms-interpolation-mode:bicubic; display:none; width:100%; max-width:174px !important"></div><!--<![endif]--></center></div><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_14" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span style="font-size: 20px;"> <strong> Ative o código</strong></span></p><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center">Após baixar o App, clique em “Ativar código Premium”, coloque o código que você recebeu e ative.</p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_20_element_0" style="border-collapse:separate; font-size:14px; line-height:1.5; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><div id="wout_block_20_element_0" style="font-size:14px; line-height:1.5; width:100%; height:78; display:block; text-align:center" width="100%" height="78" align="center"><center><img border="0" width="69" height="auto" class="desktop  sp-img small_img smallImg " align="center" alt="3" src="${emailImages}/3.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; display:block; -ms-interpolation-mode:bicubic"><!--[if !mso]><!--><div style="font-size:14px; line-height:1.5; mso-hide:all"><img border="0" width="100%" height="auto" class="mobile  sp-img small_img smallImg " align="center" alt="3" src="${emailImages}/3.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; -ms-interpolation-mode:bicubic; display:none; width:100%; max-width:174px !important"></div><!--<![endif]--></center></div><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_14" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span style="font-size: 20px;"> <strong> Leia nossa F.A.Q.</strong></span></p><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center">Disponibilizamos uma F.A.Q. que são as perguntas mais frequentes para o uso de nosso aplicativo. A F.A.Q. pode ser acessada pelo: faq.mediquo.com.br ou pelo QR Code no início deste e-mail.</p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_20_element_0" style="border-collapse:separate; font-size:14px; line-height:1.5; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><div id="wout_block_20_element_0" style="font-size:14px; line-height:1.5; width:100%; height:78; display:block; text-align:center" width="100%" height="78" align="center"><center><img border="0" width="69" height="auto" class="desktop  sp-img small_img smallImg " align="center" alt="4" src="${emailImages}/4.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; display:block; -ms-interpolation-mode:bicubic"><!--[if !mso]><!--><div style="font-size:14px; line-height:1.5; mso-hide:all"><img border="0" width="100%" height="auto" class="mobile  sp-img small_img smallImg " align="center" alt="4" src="${emailImages}/4.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; -ms-interpolation-mode:bicubic; display:none; width:100%; max-width:174px !important"></div><!--<![endif]--></center></div><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_14" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span style="font-size: 20px;"> <strong> Comece a usar pelo Chat</strong></span></p><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center">Você pode iniciar seu atendimento pelo chat do aplicativo. Simples como uma conversa de whatsapp, se necessário o atendimento se estenderá para ligação ou vídeo.</p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_20_element_0" style="border-collapse:separate; font-size:14px; line-height:1.5; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><div id="wout_block_20_element_0" style="font-size:14px; line-height:1.5; width:100%; height:78; display:block; text-align:center" width="100%" height="78" align="center"><center><img border="0" width="69" height="auto" class="desktop  sp-img small_img smallImg " align="center" alt="5" src="${emailImages}/5.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; display:block; -ms-interpolation-mode:bicubic"><!--[if !mso]><!--><div style="font-size:14px; line-height:1.5; mso-hide:all"><img border="0" width="100%" height="auto" class="mobile  sp-img small_img smallImg " align="center" alt="5" src="${emailImages}/5.png" iout_block_20_element_0="" style="height:auto; line-height:100%; outline:0; text-decoration:none; border:0; -ms-interpolation-mode:bicubic; display:none; width:100%; max-width:174px !important"></div><!--<![endif]--></center></div><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_14" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span style="font-size: 20px;"> <strong> Acesse o SAC</strong></span></p><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center">Sempre que precisar tirar uma dúvida, relatar um problema técnico ou de atendimento, você tem a liberdade para nos chamar pelo nosso SAC no próprio aplicativo.</p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_16" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"></p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_14" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span>1. Crie sua conta e ative o plano premium&nbsp;</span></p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_14" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span>2. Para ativar seu código único de ativação, use o código abaixo</span></p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_14" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span style="font-size: 20px;"> <strong> Ative o código</strong></span></p><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center">Após baixar o App, clique em “Ativar código Premium”, coloque o código que você recebeu e ative.</p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table></th></tr></tbody></table></td></tr></tbody></table><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><td style="border-collapse:collapse; border-color:transparent; padding-left:0; padding-right:0; padding-top:0; padding-bottom:0; vertical-align:top" border="0" cellpadding="0" cellspacing="0" valign="top"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><th width="500" style="border-color:transparent; font-weight:400; text-align:left; vertical-align:top" cellpadding="0" cellspacing="0" class="tc responsive " align="left" valign="top"><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_17" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span style="font-size: 20px;"> <strong> Código de ativação</strong></span></p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_17" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span style="font-size: 20px; color: #808080;"><strong>${transactionId}</strong></span></p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><div class="block-divider" style="font-size:14px; line-height:1.5; padding-left:30px; padding-right:30px; padding-top:30px; padding-bottom:30px"><hr id="style" margin:0="" border-top-style:solid="" border-top-width:3px="" border-top-color:="" border-bottom:0="" border-left:0="" border-right:0=""></div></td></tr></tbody></table></th></tr></tbody></table></td></tr></tbody></table><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><td style="border-collapse:collapse; border-color:transparent; padding-left:0; padding-right:0; padding-top:0; padding-bottom:0; vertical-align:top" border="0" cellpadding="0" cellspacing="0" valign="top"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; width:100%" border="0" width="100%"><tbody><tr style="border-color:transparent"><th width="500" style="border-color:transparent; font-weight:400; text-align:left; vertical-align:top" cellpadding="0" cellspacing="0" class="tc responsive " align="left" valign="top"><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="wout_block_out_block_32" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="470" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:15px; padding-right:15px; padding-top:15px; padding-bottom:15px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"><span style="font-size: 20px; color: #333399;"> <strong> Deu algum problema com o seu código?</strong></span></p><p align="center" style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; font-weight:normal; padding:0"><span> Nos chame pelo Whatsapp!</span></p><p align="center" style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; font-weight:normal; padding:0"><a href="https://api.whatsapp.com/send?phone=553433523778&text=Olá%20preciso%20de%20ajuda!" target="_blank">
  <img src="https://png.pngtree.com/element_our/sm/20180626/sm_5b321c98efaa6.jpg" alt="WhatsApp" style="width: 24px; height: 24px; vertical-align: middle;">
  (34) 33523778
</a></p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table><table border="0" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse; font-size:14px; line-height:1.5; border-top-right-radius:0; border-top-left-radius:0; border-bottom-left-radius:0; border-bottom-right-radius:0"><tbody><tr style="border-color:transparent"><td cellpadding="0" cellspacing="0" style="border-collapse:collapse; border-color:transparent; vertical-align:top" valign="top"><table width="100%" cellpadding="0" cellspacing="0" id="w" style="border-collapse:separate; font-size:14px; line-height:1.5; text-color:black; font-weight:normal; margin:0; overflow:hidden"><tbody><tr class="content-row" style="border-color:transparent; color:#333; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif"><td class="content-cell" width="440" style="border-collapse:collapse; border-color:transparent; vertical-align:top; padding-left:30px; padding-right:30px; padding-top:30px; padding-bottom:30px" valign="top"><p style="line-height:inherit; margin:0 0 10px; font-size:inherit; color:inherit; font-family:Arial, &quot;Helvetica Neue&quot;, Helvetica, sans-serif; text-align:center; font-weight:normal; padding:0" align="center"></p><div style="font-size:14px; line-height:1.5; clear:both"></div></td></tr></tbody></table></td></tr></tbody></table></th></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table><table width="500px" style="border-collapse:collapse; font-size:14px; line-height:1.5"><tbody><tr style="border-color:transparent"><td style="border-collapse:collapse; border-color:transparent; text-align:center" align="center"><div align="center" style="font-size:14px; line-height:1.5; padding-top:8px; padding-bottom:8px">    <p style="line-height:1.5; margin:0; font-size:11px; color:#777; font-family:Verdana, Arial, sans-serif">Enviado por</p></div></td></tr></tbody></table></td></tr></tbody></table></div><div style="display:none;width:0;max-height:0;overflow:hidden;mso-hide:all;height:0;font-size:0;line-height:0;margin:0 auto;">
    <!--[if mso]-->
    <table style="width: 100%" width="100%"><tbody><tr style="line-height: 0">
            <td>&nbsp;</td>
            <td align="center" width="1" style="text-align: center; width: 1px;">
                <img width="1" height="1" style="width: 1px; height: 1px;" src="${emailImages}/cdcfe447714696b08ff41a2fdacad1b0" alt="-">
            </td>
            <td>&nbsp;</td>
        </tr>
    </tbody></table>
    <!--[endif]-->
</div>


</body></html>
  `;
  }
  // Parâmetros para enviar o e-mail
  const sendEmailParams = {
    Destination: { ToAddresses: [recipient] },
    Message: {
      Body: {
        Html: { Data: emailBody },
      },
      Subject: { Data: subject },
    },
    Source: "naoresponda@mediquo.com.br",
  };

  // Enviar o e-mail
  return sesClient.send(new SendEmailCommand(sendEmailParams));
}

router.post("/create-company", verificaAPIKey, async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  const {
    name,
    country_code,
    has_activation_code_notifications,
    identifier,
    contract_number,
    email_admin,
    number_of_licenses,
    max_licenses_epharma,
    max_licenses_standard,
    max_licenses_health_checks,
  } = req.body;
  let api_key_epharma = null;
  let api_secret_key_epharma = null;
  // Verifique se max_licenses_epharma é maior que 0
  const has_epharma = max_licenses_epharma > 0;

  const identifierExists = await checkIfIdentifierExists(
    pool,
    identifier,
    contract_number
  );

  if (identifierExists) {
    res
      .status(400)
      .json({
        message:
          "Não foi possível criar a organização! Identificador já existe.",
      });
    return; // Retorna a resposta e encerra a função
  }
  // URL do endpoint
  const url = "https://sdk.mediquo.com/v1/organizations";

  const environment = "sandbox";

  // Dados do corpo da requisição
  const requestBody = {
    name,
    country_code,
    has_epharma,
    has_activation_code_notifications,
    environment,
  };

  try {
    // Realiza a requisição usando fetch

    if (has_epharma) {
      const responseData = await sendRequest(
        url,
        apiKey,
        secretKey,
        requestBody
      );
      console.log(responseData);
      api_key_epharma = responseData.data.api_key;
      // api-key
      api_secret_key_epharma = responseData.data.secret_key;
    } else {
      api_key_epharma = null;
      api_secret_key_epharma = null;
    }

    const responseData = await sendRequest(url, apiKey, secretKey, requestBody);
    const api_key_normal = responseData.data.api_key;
    const api_secret_key_normal = responseData.data.secret_key;
    console.log(responseData);

    const company_id_inserido = await insertCompanyRecord(
      pool,
      responseData.data.id, // Obtido da resposta da API
      name,
      identifier,
      contract_number,
      api_key_normal,
      api_secret_key_normal,
      "mediquo.png",
      "0",
      number_of_licenses,
      "1",
      has_epharma,
      max_licenses_epharma,
      max_licenses_standard,
      max_licenses_health_checks,
      api_key_epharma,
      api_secret_key_epharma
    );

    console.log("Registro inserido com o company_id:", company_id_inserido);

    const senha_usuario = generateRandomString(8);
    console.log(senha_usuario);

    // Crie o usuário após a empresa
    const user_id_password = await createUserCompany(
      pool, // Substitua pelo seu cliente de banco de dados
      name, // O nome do usuário
      identifier, // O identificador da empresa
      "99999999", // Substitua pelo valor apropriado
      company_id_inserido, // O company_id inserido na tabela companies
      email_admin, // O email do usuário
      senha_usuario // A senha gerada
    );

    console.log("Usuário inserido com o user_id:", user_id_password);

    // Adicione as informações de email e senha / api_key_epharma  ao responseData
    responseData.email = email_admin;
    responseData.password = senha_usuario;
    responseData.api_key_epharma = api_key_epharma;
    responseData.api_secret_key_epharma = api_secret_key_epharma;

    const dataAtual = new Date();
    // Envio o Email de boas vindas
    enviarEmail(
      email_admin,
      "Seja Bem=vindo",
      name,
      contract_number,
      dataAtual,
      "welcome"
    )
      .then((data) => {
        console.log("E-mail enviado com sucesso:", data);
      })
      .catch((err) => {
        console.error("Erro ao enviar e-mail:", err);
      });

    res.status(200).json({
      message: "Requisição enviada com sucesso!",
      status: 201,
      responseData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao processar a requisição" });
  }
});

// aumento do numero de licencas
router.post("/increase-licenses", verificaAPIKey, async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  const {
    name,
    identifier,
    number_of_licenses,
    contract_number,
    max_licenses_epharma,
    max_licenses_standard,
    max_licenses_health_checks,
    email_notify,
  } = req.body;
  const contractNumber = contract_number;
  const verificationResult = await verificarLicencasIncrease(
    pool,
    identifier,
    contract_number,
    number_of_licenses,
    max_licenses_epharma,
    max_licenses_standard,
    max_licenses_health_checks
  );

  console.log("Resultado:" + verificationResult);

  if (verificationResult != "StatusOK") {
    // Retorne a mensagem de falha
    res.status(400).json({ error: verificationResult });
    return; // Retorna a resposta e encerra a função
  }

  try {
    // Consulta SQL para atualizar a coluna max_licenca
    const query = `
        UPDATE public.companies
        SET max_licenses = max_licenses + $1,
        max_licenses_epharma = max_licenses_epharma + $2,
        max_licenses_standard = max_licenses_standard + $3
        WHERE company_document = $4 and contract_number= $5
        RETURNING company_document, max_licenses, max_licenses_epharma, max_licenses_standard, contract_number ;
      `;

    // Parâmetros da consulta SQL
    const values = [
      number_of_licenses,
      max_licenses_epharma,
      max_licenses_standard,
      identifier,
      contractNumber,
    ];

    // Execute a consulta SQL usando a conexão do pool
    const client = await pool.connect();
    const result = await client.query(query, values);
    client.release();

    if (result.rowCount === 0) {
      res
        .status(400)
        .json({
          message:
            "Não foi possível realizar a operação! Identificador não encontrado.",
        });
      return;
    }

    const company_id = result.rows[0].company_document;
    const contract_number = result.rows[0].contract_number;
    const max_licenca_atualizado = result.rows[0].max_licenses;
    const max_epharma_atualizado = result.rows[0].max_licenses_epharma;
    const max_standard_atualizado = result.rows[0].max_licenses_standard;

    const dataAtual = new Date();
    // Envio o Email de boas vindas
    enviarEmail(
      email_notify,
      "Seja Bem=vindo",
      name,
      contract_number,
      dataAtual,
      "changeContract"
    )
      .then((data) => {
        console.log("E-mail enviado com sucesso:", data);
      })
      .catch((err) => {
        console.error("Erro ao enviar e-mail:", err);
      });

    res.status(200).json({
      message: "Operação realizada com sucesso!",
      status: 200,
      company_id,
      contract_number,
      max_licenca_atualizado,
      max_epharma_atualizado,
      max_standard_atualizado,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao processar a requisição" });
  }
});

// aumento do numero de licencas
router.post("/modify-contract", verificaAPIKey, async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  const {
    name,
    identifier,
    number_of_licenses,
    contract_number,
    max_licenses_epharma,
    max_licenses_standard,
    max_licenses_health_checks,
    email_notify,
  } = req.body;
  const contractNumber = contract_number;
  const verificationResult = await verificarLicencasIncrease(
    pool,
    identifier,
    contract_number,
    number_of_licenses,
    max_licenses_epharma,
    max_licenses_standard,
    max_licenses_health_checks
  );

  console.log("Resultado:" + verificationResult);

  if (verificationResult != "StatusOK") {
    // Retorne a mensagem de falha
    res.status(400).json({ error: verificationResult });
    return; // Retorna a resposta e encerra a função
  }

  try {
    // Consulta SQL para atualizar a coluna max_licenca
    const query = `
      UPDATE public.companies
      SET max_licenses =  $1,
      max_licenses_epharma =  $2,
      max_licenses_standard = $3
      WHERE company_document = $4 and contract_number= $5
      RETURNING company_document, max_licenses, max_licenses_epharma, max_licenses_standard, contract_number ;
    `;

    // Parâmetros da consulta SQL
    const values = [
      number_of_licenses,
      max_licenses_epharma,
      max_licenses_standard,
      identifier,
      contractNumber,
    ];

    // Execute a consulta SQL usando a conexão do pool
    const client = await pool.connect();
    const result = await client.query(query, values);
    client.release();

    if (result.rowCount === 0) {
      res
        .status(400)
        .json({
          message:
            "Não foi possível realizar a operação! Identificador não encontrado.",
        });
      return;
    }

    const company_id = result.rows[0].company_document;
    const contract_number = result.rows[0].contract_number;
    const max_licenca_atualizado = result.rows[0].max_licenses;
    const max_epharma_atualizado = result.rows[0].max_licenses_epharma;
    const max_standard_atualizado = result.rows[0].max_licenses_standard;

    const dataAtual = new Date();
    // Envio o Email de boas vindas
    enviarEmail(
      email_notify,
      "Alteração de Contrato Algar - Mediquo",
      name,
      contract_number,
      dataAtual,
      "changeContract"
    )
      .then((data) => {
        console.log("E-mail enviado com sucesso:", data);
      })
      .catch((err) => {
        console.error("Erro ao enviar e-mail:", err);
      });

    res.status(200).json({
      message: "Operação realizada com sucesso!",
      status: 200,
      company_id,
      contract_number,
      max_licenca_atualizado,
      max_epharma_atualizado,
      max_standard_atualizado,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao processar a requisição" });
  }
});

// diminiução de licensas
router.post("/decrease-licenses", verificaAPIKey, async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  const {
    name,
    identifier,
    number_of_licenses,
    contract_number,
    email_notify,
    max_licenses_epharma,
    max_licenses_standard,
    max_licenses_health_checks,
  } = req.body;

  const verificationResult = await verificarLicencasDecrease(
    pool,
    identifier,
    contract_number,
    number_of_licenses,
    max_licenses_epharma,
    max_licenses_standard,
    max_licenses_health_checks
  );

  const contractNumber = contract_number;

  if (verificationResult != "StatusOK") {
    // Retorne a mensagem de falha
    res.status(400).json({ error: verificationResult });
    return; // Retorna a resposta e encerra a função
  }

  try {
    // Consulta SQL para atualizar a coluna max_licenca
    const query = `
        UPDATE public.companies
        SET max_licenses = max_licenses - $1,
        max_licenses_epharma = max_licenses_epharma - $2,
        max_licenses_standard = max_licenses_standard - $3
        WHERE company_document = $4 and contract_number= $5
        RETURNING company_document, max_licenses, max_licenses_epharma, max_licenses_standard, contract_number ;
      `;

    // Parâmetros da consulta SQL
    const values = [
      number_of_licenses,
      max_licenses_epharma,
      max_licenses_standard,
      identifier,
      contractNumber,
    ];

    // Execute a consulta SQL usando a conexão do pool
    const client = await pool.connect();
    const result = await client.query(query, values);
    client.release();

    if (result.rowCount === 0) {
      res
        .status(400)
        .json({
          message:
            "Não foi possível realizar a operação! Identificador não encontrado.",
        });
      return;
    }

    const company_id = result.rows[0].company_document;
    const contract_number = result.rows[0].contract_number;
    const max_licenca_atualizado = result.rows[0].max_licenses;
    const max_epharma_atualizado = result.rows[0].max_licenses_epharma;
    const max_standard_atualizado = result.rows[0].max_licenses_standard;

    const dataAtual = new Date();
    // Envio o Email de boas vindas
    enviarEmail(
      email_notify,
      "Seja Bem=vindo",
      name,
      contract_number,
      dataAtual,
      "changeContract"
    )
      .then((data) => {
        console.log("E-mail enviado com sucesso:", data);
      })
      .catch((err) => {
        console.error("Erro ao enviar e-mail:", err);
      });

    res.status(200).json({
      message: "Operação realizada com sucesso!",
      status: 200,
      company_id,
      contract_number,
      max_licenca_atualizado,
      max_epharma_atualizado,
      max_standard_atualizado,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao processar a requisição" });
  }
});

// suspender as organizacoes
router.post("/suspend-company", verificaAPIKey, async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  const { name, identifier, contract_number, email_notify } = req.body;

  const identifierExists = await checkIfIdentifierExists(
    pool,
    identifier,
    contract_number
  );

  if (!identifierExists) {
    res
      .status(400)
      .json({
        message:
          "Não foi possível realizar a operação! Identificador não encontrado.",
      });
    return; // Retorna a resposta e encerra a função
  }

  try {
    // Consulta SQL para atualizar a coluna max_licenca
    const query = `
      UPDATE public.companies
      SET status = $1
      WHERE company_document = $2 status='1'
      RETURNING company_document, status, x_api_key, x_secret_key, x_api_key_epharma, x_secret_key_epharma;
    `;

    // Parâmetros da consulta SQL
    const values = ["2", identifier];

    // Execute a consulta SQL usando a conexão do pool
    const client = await pool.connect();
    const result = await client.query(query, values);
    client.release();

    if (result.rowCount === 0) {
      res
        .status(400)
        .json({
          message:
            "Não foi possível realizar a operação! Identificador não encontrado.",
        });
      return;
    }

    const company_id = result.rows[0].company_document;
    const status_atualizado = result.rows[0].status;
    const x_api_key = result.rows[0].x_api_key;
    const x_secret_key = result.rows[0].x_secret_key;
    const x_api_key_epharma = result.rows[0].x_api_key_epharma;
    const x_secret_key_epharma = result.rows[0].x_secret_key_epharma;

    const dataAtual = new Date();

    //destivar as licencas standart
    obterCodigos(x_api_key, x_secret_key, company_id);

    //destivar as licencas standart
    obterCodigos(x_api_key_epharma, x_secret_key_epharma, company_id);

    enviarEmail(
      email_notify,
      "Suspenção de Contrato",
      name,
      contract_number,
      dataAtual,
      "suspended"
    )
      .then((data) => {
        console.log("E-mail enviado com sucesso: Suspeicao", data);
      })
      .catch((err) => {
        console.error("Erro ao enviar e-mail:", err);
      });

    res.status(200).json({
      message: "Suspensao realizada com sucesso!",
      status: 200,
      company_id,
      status_atualizado,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao processar a requisição" });
  }
});

// Fazer distrato do contrato
router.post("/termination-contract", verificaAPIKey, async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  const { name, identifier, contract_number, email_notify } = req.body;

  const identifierExists = await checkIfIdentifierExists(
    pool,
    identifier,
    contract_number
  );

  if (!identifierExists) {
    res
      .status(400)
      .json({
        message:
          "Não foi possível realizar a operação! Identificador não encontrado.",
      });
    return; // Retorna a resposta e encerra a função
  }

  try {
    // Consulta SQL para atualizar a coluna max_licenca
    const query = `
      UPDATE public.companies
      SET status = $1
      WHERE company_document = $2
      RETURNING company_document, status, x_api_key, x_secret_key, x_api_key_epharma, x_secret_key_epharma;
    `;

    // Parâmetros da consulta SQL
    const values = ["3", identifier];

    // Execute a consulta SQL usando a conexão do pool
    const client = await pool.connect();
    const result = await client.query(query, values);
    client.release();

    if (result.rowCount === 0) {
      res
        .status(400)
        .json({
          message:
            "Não foi possível realizar a operação! Identificador não encontrado.",
        });
      return;
    }

    const company_id = result.rows[0].company_document;
    const status_atualizado = result.rows[0].status;
    const x_api_key = result.rows[0].x_api_key;
    const x_secret_key = result.rows[0].x_secret_key;
    const x_api_key_epharma = result.rows[0].x_api_key_epharma;
    const x_secret_key_epharma = result.rows[0].x_secret_key_epharma;

    const dataAtual = new Date();

    //destivar as licencas standart
    obterCodigos(x_api_key, x_secret_key, company_id);

    //destivar as licencas standart
    obterCodigos(x_api_key_epharma, x_secret_key_epharma, company_id);

    enviarEmail(
      email_notify,
      "Suspenção de Contrato",
      name,
      contract_number,
      dataAtual,
      "suspended"
    )
      .then((data) => {
        console.log("E-mail enviado com sucesso: Suspeicao", data);
      })
      .catch((err) => {
        console.error("Erro ao enviar e-mail:", err);
      });

    res.status(200).json({
      message: "Termino de contrato realizada com sucesso!",
      status: 200,
      company_id,
      status_atualizado,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao processar a requisição" });
  }
});

router.post("/notify-customer", verificaAPIKey, async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  const { name, license_number, email_notify } = req.body;

  try {
    const dataAtual = new Date();
    enviarEmail(
      email_notify,
      "Bem-vindo a Mediquo",
      name,
      license_number,
      dataAtual,
      "notify"
    )
      .then((data) => {
        console.log("E-mail enviado com sucesso: Notify", data);
      })
      .catch((err) => {
        console.error("Erro ao enviar e-mail:", err);
      });

    const company_id = "0001";

    res.status(200).json({
      message: "Email enviado com sucesso!",
      status: 200,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao processar a requisição" });
  }
});

// suspender as organizacoes
router.post("/unsuspend-company", verificaAPIKey, async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const secretKey = req.headers["x-secret-key"];
  const { name, identifier, contract_number, email_notify } = req.body;

  const identifierExists = await checkIfIdentifierExists(
    pool,
    identifier,
    contract_number
  );

  if (!identifierExists) {
    res
      .status(400)
      .json({
        message:
          "Não foi possível realizar a operação! Identificador não encontrado. " +
          identifier +
          " " +
          contract_number,
      });
    return; // Retorna a resposta e encerra a função
  }

  try {
    // Consulta SQL para atualizar a coluna max_licenca
    const query = `
      UPDATE public.companies
      SET status = $1
      WHERE company_document = $2 and status='2'
      RETURNING company_document, status;
    `;

    // Parâmetros da consulta SQL
    const values = ["1", identifier];

    // Execute a consulta SQL usando a conexão do pool
    const client = await pool.connect();
    const result = await client.query(query, values);
    client.release();

    if (result.rowCount === 0) {
      res
        .status(400)
        .json({
          message:
            "Não foi possível realizar a operação! Identificador não encontrado.",
        });
      return;
    }

    const company_id = result.rows[0].company_document;
    const status_atualizado = result.rows[0].status;

    const dataAtual = new Date();

    enviarEmail(
      email_notify,
      "Reativação de Contrato",
      name,
      contract_number,
      dataAtual,
      "reactivated"
    )
      .then((data) => {
        console.log("E-mail enviado com sucesso: Suspeicao");
      })
      .catch((err) => {
        console.error("Erro ao enviar e-mail:", err);
      });

    res.status(200).json({
      message: "Cancelamento de Suspensao realizada com sucesso!",
      status: 200,
      company_id,
      status_atualizado,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erro ao processar a requisição" });
  }
});

module.exports = router;
