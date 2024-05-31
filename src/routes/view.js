// routes/users.js
const express = require('express');
const router = express.Router();
const path = require('path');
const { middlewareVerifyTokenView } = require('../utils/middlewareVerifyToken');

const urlView = path.join(
    __dirname,
    '..',
    '..',
    'tsul',
    'view',
);
router.get('/', (req, res) => {
    res.sendFile(path.join(urlView, 'login.html'));
});

router.get('/dashboard', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'dashboard.html'));
});

router.get('/users', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'users.html'));
});

router.get('/new-license', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'new-license.html'));
});

router.get('/companies', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'companies.html'));
});

router.get('/companiesinsert', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'insert_companies.html'));
});

router.get('/companiesedit', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'edit_companies.html'));
});

router.get('/customers', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'customers.html'));
});

router.get('/customersinsert', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'insert_customers.html'));
});

router.get('/customersedit', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'edit_customers.html'));
});
router.get('/ativacaolicensas', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'ativacao_licensas.html'));
});
router.get('/desativacaolicensas', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'desativacao_licensas.html'));
});
router.get('/uploadlicensas', middlewareVerifyTokenView, (req, res) => {
    res.sendFile(path.join(urlView, 'upload_licensas.html'));
});


module.exports = router;
