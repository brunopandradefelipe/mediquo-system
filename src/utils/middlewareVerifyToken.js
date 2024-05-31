const jwt = require('jsonwebtoken');
require('dotenv').config();

// Function to generate the token JWT
function generateToken(userId) {
    const secretKey = process.env.JWT_SECRET;
    const token = jwt.sign({ userId }, secretKey, { expiresIn: '30m' }); // New token with an expiration of 30 minutes
    return token;
}

function middlewareVerifyToken(req, res, next) {
    const { token } = req.cookies;

    if (!token) {
        return res.status(401).json({ message: "Token invalido!" })
    }
    const secretKey = process.env.JWT_SECRET;
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: "Token invalido!" })
        } else {
            req.userId = decoded.userId;
            const token = jwt.sign({ email: decoded.email, userId: decoded.userId }, secretKey, { expiresIn: '30m' });
            res.cookie('token', token);
        }

        next();
    });
}

function middlewareVerifyTokenView(req, res, next) {
    const { token } = req.cookies;

    if (!token) {
        return res.redirect('/');
    }

    const secretKey = process.env.JWT_SECRET;
    jwt.verify(token, secretKey, (err, decoded) => {
        if (err) {
            return res.redirect('/');
        } else {
            req.userId = decoded.userId;
            const token = jwt.sign({ email: decoded.email, userId: decoded.userId }, secretKey, { expiresIn: '30m' });
            res.cookie('token', token);
        }

        next();
    });
}

module.exports = { middlewareVerifyToken, middlewareVerifyTokenView };
