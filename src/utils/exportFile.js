const csvParse = require('csv-parser');
const {promisify} = require("util");
const fs = require("fs");
const readFileAsync = promisify(fs.readFile);
const axios = require('axios');
const FormData = require('form-data');
require("dotenv").config();
async function validaArquivo(file) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!file) {
        throw new Error('Arquivo não encontrado');
      }

      await validarCabecalhoDoArquivo(file);
      const resultadoValidacaoLinhas = await validarLinhasDoArquivo(file);

      if (resultadoValidacaoLinhas.erros.length > 0) {
        reject({
          message: 'Arquivo não processado linhas errados',
          linhas: resultadoValidacaoLinhas.linhas || 0,
          errosPacientes: resultadoValidacaoLinhas.erros || [],
          status: 400,
        });
      }
      resolve({
        message: 'Arquivo enviado com sucesso!',
        linhas: resultadoValidacaoLinhas.linhas,
        errosPacientes: [],
        status: 201,
      });
    } catch (error) {
      reject({
        message: error.message || 'Arquivo não processado',
        linhas: error.linhas || 0,
        errosPacientes: error.errosPacientes || [],
        status: 400,
      });
    }
  });
}

function validarCPF(cpf) {
  cpf = String(cpf).replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
    return false;
  }
  let result = true;
  [9, 10].forEach((j) => {
    let soma = 0, r;
    cpf.split('').splice(0, j).forEach((e, i) => {
      soma += parseInt(e) * ((j + 2) - (i + 1));
    });
    r = soma % 11;
    r = (r < 2) ? 0 : 11 - r;
    if (r !== parseInt(cpf.substring(j, j + 1))) {
      result = false;
    }
  });
  return result;
}

async function validarCabecalhoDoArquivo(file) {
  try {
    const content = await readFileAsync(file.path, 'utf-8');
    const primeiraLinha = content.split('\n')[0].trim();

    if (primeiraLinha === 'cpf;nome;email;telefone;genero;plano;departamento') {
      return file;
    }

    throw new Error('O cabeçalho está incorreto');
  } catch (error) {
    throw new Error(`Erro ao validar cabeçalho do arquivo: ${error.message}`);
  }
}

async function validarLinhasDoArquivo(file) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(file.path);
    const parseFile = csvParse({ separator: ';', from_line: 4 });
    stream.pipe(parseFile);

    const pacientesError = [];
    let numeroDeLinhas = 0;

    parseFile.on('data', (row) => {
      numeroDeLinhas++;

      if (row.nome && row.nome.trim().split(' ').length < 2) {
        pacientesError.push({ paciente: row.nome, erro: 'Nome deve conter pelo menos dois termos' });
      }

      if (!validarCPF(row.cpf)) {
        pacientesError.push({ paciente: row.nome, erro: 'CPF inválido' });
      }

      if (row.email) {
        const emailRegexp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegexp.test(row.email)) {
          pacientesError.push({ paciente: row.nome, erro: 'Email inválido' });
        }
      }

      if (row.telefone) {
        const telefone = row.telefone.replace(/[^0-9]/g, '');
        const telefoneRegexp = /^[1-9]{2}9[0-9]{8}$/;

        if (!telefoneRegexp.test(telefone)) {
          pacientesError.push({ paciente: row.nome, erro: 'Telefone inválido' });
        }
      }
    });

    parseFile.on('end', () => {
      resolve({ erros: pacientesError, linhas: numeroDeLinhas })});
    parseFile.on('error', (err) => reject({ message: `Erro ao analisar o arquivo: ${err.message}`, erros: pacientesError, linhas: numeroDeLinhas }));
  });
}


async function sendArquivo(file, empresa, prefixo, secret_key, apk_key, acao) {
  return new Promise((resolve, reject) => {
    const filePath = file.path;
    const base64String = encodeFileToBase64(filePath);

    const data = JSON.stringify({
      "fileBase64": "data:@file/csv;base64," + base64String,
      "apk_key": apk_key,
      "secret_key": secret_key,
      "prefixo": prefixo,
      "empresa": empresa,
      "acao": acao
    });

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: process.env.CSV_UPLOAD_HOST,
      headers: {
        'Content-Type': 'application/json'
      },
      data: data
    };

    axios.request(config)
        .then((response) => {
          resolve();
        })
        .catch((error) => {
          reject(error.message);
        });
  });
}


function encodeFileToBase64(filePath) {
  // Read the file content
  const fileContent = fs.readFileSync(filePath);

  // Encode the file content to Base64
  const base64Encoded = fileContent.toString('base64');

  return base64Encoded;
}
module.exports = {
  validaArquivo,
  sendArquivo
};