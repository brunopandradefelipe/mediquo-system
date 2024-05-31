// routes/users.js
const express = require("express");
const router = express.Router();
const { middlewareVerifyToken } = require("../utils/middlewareVerifyToken");
require("dotenv").config();
const axios = require("axios");

router.post("/activation-codes", middlewareVerifyToken, async (req, res) => {
  try {
    const dataRequest = req.body;
    const dataFirstname = dataRequest["first_name"] || "null";
    const dataLastname = dataRequest["last_name"] || "null";
    const dataPhoneprefix = dataRequest["phone_prefix"] || "null";
    const dataPhonenumber = dataRequest["phone_number"] || "null";
    const dataEmail = dataRequest["email"] || "null";
    const dataDepartament = dataRequest["departament"] || "null";
    const tag = Buffer.from(
      `${dataFirstname}-${dataLastname}-${dataPhoneprefix}-${dataPhonenumber}-${dataEmail}-${dataDepartament}`
    ).toString("base64");

    const dataPost = {
      code: dataRequest["code"],
      meta: tag,
      duration: "forever",
      first_name: dataRequest["first_name"],
      last_name: dataRequest["last_name"],
    };

    const dataPostSend = {
      name: `${dataRequest["first_name"]} ${dataRequest["last_name"]}`,
      prefix: dataPhoneprefix,
      phone: dataPhonenumber,
      email: dataEmail,
      language: "pt",
    };

    const db = req.db;

    // Consulta o usuário pelo e-mail no banco de dados
    db.query(
      "SELECT b.x_api_key, b.x_secret_key, b.company_id, b.number_of_active_licenses, b.max_licenses FROM users a INNER JOIN companies b ON a.company_id = b.company_id WHERE a.user_id = $1",
      [req.userId],
      async (err, result) => {
        if (err) {
          return res.status(500).json({ message: "Erro interno do servidor." });
        }
        const [dataConfigEnterprise] = result.rows;
        if (
          Number(dataConfigEnterprise.number_of_active_licenses) + 1 >
          dataConfigEnterprise.max_licenses
        ) {
          return res
            .status(400)
            .json({ message: "Limite de liceças atingido!" });
        }
        const endPoint = process.env.ENDPOINT_MEDIQUO;
        try {
          const response = await axios.post(
            `${endPoint}/v1/activation-codes`,
            dataPost,
            {
              headers: {
                "Content-Type": "application/json",
                "X-API-Key": dataConfigEnterprise.x_api_key,
                "X-Secret-Key": dataConfigEnterprise.x_secret_key,
              },
            }
          );

          if (dataEmail !== "null" && dataPhonenumber !== "null") {
            const data = {
              name: dataFirstname,
              identifier: "0000",
              license_number: dataRequest["code"],
              email_notify: dataEmail,
            };

            const headers = {
              "Content-Type": "application/json",
              "X-API-Key": "DZSZ021B9CiOEB7W",
              "X-Secret-Key":
                "X7lrN0IHdGkWATT3K4QMhCq2rEoN8vAqPAb3hmA22b7pBdcCiacOiSINNKx7zlCZ",
            };

            // Execute the POST request
            const emailRequest = axios
              .post(
                "https://woli.mediquo.net/api/algarApi/notify-customer",
                data,
                { headers: headers }
              )
              .then((response) => {
                console.log("Response:", response.data);
              })
              .catch((error) => {
                console.error("Error:", error);
              });

            const responseBody = response.data;

            /// envia o SMS
            const smsRequest = axios.get(
              "http://api.sms.eai.net.br/v1/message",
              {
                params: {
                  recipient: dataPhoneprefix + dataPhonenumber,
                  text:
                    "Bem-vindo a Mediquo. Seu App de telemedicina. Seu codigo de ativacao e " +
                    dataRequest["code"],
                  key: "zBnvZWpnAUfNDBeJPWJuSbW7qWRCaZ3A",
                },
              }
            );

            Promise.allSettled([emailRequest, smsRequest]).then((results) => {
              results.forEach((result, index) => {
                if (result.status === "fulfilled") {
                  console.log(
                    `Request ${index + 1} successful:`,
                    result.value.data
                  );
                } else {
                  console.error(`Request ${index + 1} failed:`, result.reason);
                }
              });
            });
          }

          db.query(
            "UPDATE companies SET number_of_active_licenses = number_of_active_licenses + 1 WHERE company_id = $1",
            [dataConfigEnterprise.company_id],
            async (err, result) => {
              return res.json({
                message: "Codigo de ativação gerado com sucesso!",
              });
            }
          );
        } catch (error) {
          if (error.response) {
            console.log(error);
            const httpCode = error.response.status;
            const errorMessage = error.response.data.message;
            return res.status(httpCode).json({ message: errorMessage });
          } else {
            return res.status(500).json({ message: "Erro desconhecido" });
          }
        }
      }
    );
  } catch (error) {
    if (error.response) {
      const httpCode = error.response.status;
      const errorMessage = error.response.data;
      return res.status(httpCode).json({ error: errorMessage });
    } else {
      return res.status(500).json({ error: "Erro desconhecido" });
    }
  }
});

router.put(
  "/activation-codes/:code/activate",
  middlewareVerifyToken,
  async (req, res) => {
    const db = req.db;
    const { code } = req.params;
    const { first_name, last_name, phone_prefix, phone_number, email } =
      req.body;

    const dataPostSend = {
      name: `${first_name} ${last_name}`,
      prefix: phone_prefix,
      phone: phone_number,
      email: email,
      language: "pt",
    };
    // Consulta o usuário pelo e-mail no banco de dados
    db.query(
      "SELECT b.x_api_key, b.x_secret_key, b.company_id FROM users a INNER JOIN companies b ON a.company_id = b.company_id WHERE a.user_id = $1",
      [req.userId],
      async (err, result) => {
        if (err) {
          return res.status(500).json({ message: "Erro interno do servidor." });
        }
        const [dataConfigEnterprise] = result.rows;
        const endPoint = process.env.ENDPOINT_MEDIQUO;
        try {
          db.query(
            "UPDATE companies SET number_of_active_licenses = number_of_active_licenses + 1, number_of_disabled_licenses = number_of_disabled_licenses - 1 WHERE company_id = $1",
            [dataConfigEnterprise.company_id],
            async (err, result) => {
              const response = await axios.put(
                `${endPoint}/v1/activation-codes/${code}/activate`,
                {},
                {
                  headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": dataConfigEnterprise.x_api_key,
                    "X-Secret-Key": dataConfigEnterprise.x_secret_key,
                  },
                }
              );
              const responseSend = await axios.put(
                `${endPoint}/v1/activation-codes/${code}/send`,
                dataPostSend,
                {
                  headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": dataConfigEnterprise.x_api_key,
                    "X-Secret-Key": dataConfigEnterprise.x_secret_key,
                  },
                }
              );
              return res.json({ message: "Código ativado com sucesso!" });
            }
          );
        } catch (error) {
          console.log(error);
          if (error.response) {
            const httpCode = error.response.status;
            const errorMessage = error.response.data;
            return res.status(httpCode).json({ error: errorMessage });
          } else {
            return res.status(500).json({ error: "Erro desconhecido" });
          }
        }
      }
    );
  }
);

router.put(
  "/activation-codes/:code/deactivate",
  middlewareVerifyToken,
  async (req, res) => {
    const db = req.db;
    const { code } = req.params;
    // Consulta o usuário pelo e-mail no banco de dados
    db.query(
      "SELECT b.x_api_key, b.x_secret_key, b.company_id FROM users a INNER JOIN companies b ON a.company_id = b.company_id WHERE a.user_id = $1",
      [req.userId],
      async (err, result) => {
        if (err) {
          return res.status(500).json({ message: "Erro interno do servidor." });
        }
        const [dataConfigEnterprise] = result.rows;
        const endPoint = process.env.ENDPOINT_MEDIQUO;
        try {
          db.query(
            "UPDATE companies SET number_of_active_licenses = number_of_active_licenses - 1, number_of_disabled_licenses = number_of_disabled_licenses + 1 WHERE company_id = $1",
            [dataConfigEnterprise.company_id],
            async (err, result) => {
              const response = await axios.put(
                `${endPoint}/v1/activation-codes/${code}/deactivate`,
                {},
                {
                  headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": dataConfigEnterprise.x_api_key,
                    "X-Secret-Key": dataConfigEnterprise.x_secret_key,
                  },
                }
              );
            }
          );
          return res.json({ message: "Código desativado com sucesso!" });
        } catch (error) {
          console.log(error);
          if (error.response) {
            const httpCode = error.response.status;
            const errorMessage = error.response.data;
            return res.status(httpCode).json({ error: errorMessage });
          } else {
            return res.status(500).json({ error: "Erro desconhecido" });
          }
        }
      }
    );
  }
);

router.get(
  "/activation-codes/:typeParam/:searchParam/:company_id_admin?",
  middlewareVerifyToken,
  async (req, res) => {
    try {
      const db = req.db;
      const { typeParam, searchParam, company_id_admin } = req.params;
      let valuesWhere = [];
      let query;
      const user_id = req.userId;
      db.query(
        `SELECT company_id FROM users WHERE user_id = $1`,
        [user_id],
        async (err, resultUser) => {
          db.query(
            `SELECT master_company FROM companies WHERE company_id = $1`,
            [resultUser.rows[0].company_id],
            async (err, resultCompany) => {
              const master_company = resultCompany.rows[0].master_company;
              if (master_company == true && company_id_admin) {
                query = `SELECT b.x_api_key, b.x_secret_key FROM companies b WHERE b.company_id = $1`;
                valuesWhere = [company_id_admin];
              } else {
                query = `SELECT b.x_api_key, b.x_secret_key FROM users a INNER JOIN companies b ON a.company_id = b.company_id WHERE a.user_id = $1`;
                valuesWhere = [user_id];
              }
              // Consulta o usuário pelo e-mail no banco de dados
              console.log(query, valuesWhere);
              db.query(query, valuesWhere, async (err, result) => {
                if (err) {
                  return res
                    .status(500)
                    .json({ message: "Erro interno do servidor." });
                }
                const [dataConfigEnterprise] = result.rows;
                const endPoint = process.env.ENDPOINT_MEDIQUO;
                let urlAxios = `${endPoint}/v1/activation-codes`;
                if (typeParam && searchParam) {
                  urlAxios += `?${typeParam}=${searchParam}`;
                }
                try {
                  const response = await axios.get(urlAxios, {
                    headers: {
                      "Content-Type": "application/json",
                      "X-API-Key": dataConfigEnterprise.x_api_key,
                      "X-Secret-Key": dataConfigEnterprise.x_secret_key,
                    },
                  });

                  const responseBody = response.data.data;
                  const arrayResponse = [];
                  function isBase64(str) {
                    if (str) {
                      // Expressão regular para verificar se a string é base64
                      const base64Regex = /^[A-Za-z0-9+/=]+$/;

                      // Verifica se a string tem um comprimento múltiplo de 4 e possui caracteres válidos de base64
                      return base64Regex.test(str) && str.length % 4 === 0;
                    }
                    return false;
                  }
                  responseBody.forEach((element) => {
                    if (isBase64(element.tag) || isBase64(element.meta)) {
                      const base64ToDecoded = isBase64(element.tag)
                        ? element.tag
                        : element.meta;
                      const decodedBuffer = Buffer.from(
                        base64ToDecoded,
                        "base64"
                      );
                      const tagDecoded = decodedBuffer.toString("utf-8");
                      const tagArray = tagDecoded.split("-");
                      const dataResp = {
                        code: element.code,
                        first_name: tagArray[0],
                        last_name: tagArray[1],
                        phone_prefix: tagArray[2],
                        phone_number: tagArray[3],
                        email: tagArray[4],
                        departament: tagArray[5],
                        status: element.active,
                        redemption:
                          element.redemptions && element.redemptions.length > 0
                            ? "Sim"
                            : "Não",
                      };
                      arrayResponse.push(dataResp);
                    }
                  });
                  return res.json({
                    data: arrayResponse,
                    pages: response.data.meta.last_page,
                    current_page: response.data.meta.current_page,
                    from_page: response.data.meta.from,
                    to_page: response.data.meta.to,
                    total_licencas: response.data.meta.total,
                  });
                } catch (error) {
                  console.log(error);
                  if (error.response) {
                    const httpCode = error.response.status;
                    const errorMessage = error.response.data;
                    return res.status(httpCode).json({ error: errorMessage });
                  } else {
                    return res.status(500).json({ error: "Erro desconhecido" });
                  }
                }
              });
            }
          );
        }
      );
    } catch (error) {
      if (error.response) {
        const httpCode = error.response.status;
        const errorMessage = error.response.data;
        return res.status(httpCode).json({ error: errorMessage });
      } else {
        return res.status(500).json({ error: "Erro desconhecido" });
      }
    }
  }
);

module.exports = router;
