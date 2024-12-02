const { auth } = require('../firebase/firebaseConfig');
const basicAuth = require('express-basic-auth');
require('dotenv').config();

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]; // Expecting "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = decodedToken; // Attach user information to the request
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const swaggerAuth = basicAuth({
  users: { [process.env.SWAGGER_USER]: process.env.SWAGGER_PASS }, // Replace with your username and password
  challenge: true, // Displays the login prompt in the browser
  unauthorizedResponse: (req) => 'Unauthorized', // Custom unauthorized message
});

module.exports = {
  authenticate,
  swaggerAuth,
};