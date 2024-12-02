const express = require('express');
const authenticate = require('../middleware/authMiddleware');
const router = express.Router();

router.get('/protected', authenticate, (req, res) => {
  res.status(200).json({ message: 'Access granted!', user: req.user });
});

module.exports = router;
