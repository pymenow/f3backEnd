const express = require('express');
const { auth } = require('../firebase/firebaseConfig');
const { getFirestore } = require('firebase-admin/firestore');
const db = getFirestore();

const router = express.Router();

// Default GET route for /auth
router.get('/', (req, res) => {
  res.status(200).json({ message: 'Auth service is running.' });
});

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new user
 *     security:
 *       - BearerAuth: [] # This adds the Bearer token to the endpoint
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *                 description: User's first name
 *               lastName:
 *                 type: string
 *                 description: User's last name
 *               email:
 *                 type: string
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 description: User's password
 *               phoneNumber:
 *                 type: string
 *                 description: User's phone number (optional)
 *               displayName:
 *                 type: string
 *                 description: User's display name (optional)
 *               photoURL:
 *                 type: string
 *                 description: URL of the user's profile picture (optional)
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Internal server error
 */

// Register a new user
router.post('/register', async (req, res) => {
  const { firstName, lastName, email, password, phoneNumber, displayName, photoURL } = req.body;

  // Validate mandatory fields
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ error: 'First Name, Last Name, Email, and Password are required.' });
  }

  try {
    // Build user details for Firebase Authentication
    const userDetails = {
      email,
      password,
      displayName: displayName || `${firstName} ${lastName}`, // Default to full name if displayName is not provided
      phoneNumber: phoneNumber || null,
    };

    // Validate and add photoURL if provided
    if (photoURL) {
      try {
        new URL(photoURL); // Validate if it's a valid URL
        userDetails.photoURL = photoURL;
      } catch {
        return res.status(400).json({ error: 'Invalid photoURL. It must be a valid URL.' });
      }
    }

    // Create user in Firebase Authentication
    const userRecord = await auth.createUser(userDetails);

    // Store additional user data in Firestore
    await db.collection('users').doc(userRecord.uid).set({
      firstName,
      lastName,
      email,
      phoneNumber: phoneNumber || null,
      displayName: userDetails.displayName,
      photoURL: photoURL || null,
      createdAt: new Date(),
    });

    res.status(201).json({ message: 'User registered successfully!', userId: userRecord.uid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Authenticate user with ID token
 *     security:
 *       - BearerAuth: [] # This adds the Bearer token to the endpoint
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 description: Firebase ID token
 *     responses:
 *       200:
 *         description: User authenticated successfully
 *       401:
 *         description: Invalid or expired token
 *       500:
 *         description: Internal server error
 */

router.post('/login', async (req, res) => {
    const { token } = req.body;
  
    if (!token) {
      return res.status(400).json({ error: 'Token is required.' });
    }
  
    try {
      // Verify the ID token with Firebase Admin SDK
      const decodedToken = await auth.verifyIdToken(token);
  
      // Optionally, fetch user details from Firebase
      const user = await auth.getUser(decodedToken.uid);
  
      res.status(200).json({
        message: 'User authenticated successfully!',
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
          phoneNumber: user.phoneNumber || null,
        },
      });
    } catch (error) {
      console.error('Token verification error:', error);
      res.status(401).json({ error: 'Invalid or expired token.' });
    }
  });
  
module.exports = router;
