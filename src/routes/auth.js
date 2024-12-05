const express = require("express");
const { auth } = require("../firebase/firebaseConfig");
const {
  createUserDetails,
  createExtendedDetails,
} = require("../firebase/fireStore");
const axios = require("axios");
const { getFirestore } = require("firebase-admin/firestore");
const { refreshToken } = require("firebase-admin/app");
const db = getFirestore();
require("dotenv").config();

const router = express.Router();
const apiKey = process.env.FIREBASE_API_KEY;

// Default GET route for /auth
router.get("/", (req, res) => {
  res.status(200).json({ message: "Auth service is running." });
});

// Register a new user
router.post("/register", async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    phoneNumber,
    displayName,
    profilePic,
    banner,
  } = req.body;

  // Validate mandatory fields
  if (!firstName || !lastName || !email || !password) {
    return res
      .status(400)
      .json({
        error: "First Name, Last Name, Email, and Password are required.",
      });
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
    if (profilePic) {
      try {
        new URL(profilePic); // Validate if it's a valid URL
        userDetails.profilePic = profilePic;
      } catch {
        return res
          .status(400)
          .json({ error: "Invalid profilePic. It must be a valid URL." });
      }
    }

    // Create user in Firebase Authentication
    const userRecord = await auth.createUser(userDetails);

    // Store additional user data in Firestore using createUserDetails
    await createUserDetails(userRecord.uid, {
      firstName,
      lastName,
      email,
      phoneNumber,
      displayName: userDetails.displayName,
      profilePic,
      banner,
    });

    res
      .status(201)
      .json({
        message: "User registered successfully!",
        userId: userRecord.uid,
      });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/login", async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required." });
  }

  try {
    // Verify the ID token with Firebase Admin SDK
    const decodedToken = await auth.verifyIdToken(token);

    // Optionally, fetch user details from Firebase
    const user = await auth.getUser(decodedToken.uid);

    res.status(200).json({
      message: "User authenticated successfully!",
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        phoneNumber: user.phoneNumber || null,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({ error: "Invalid or expired token." });
  }
});

// Retrieve token using email and password
router.post("/getToken", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const data = {
    email,
    password,
    returnSecureToken: true,
  };

  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      data,
      { headers: { "Content-Type": "application/json" } }
    );

    res.status(200).json({
      message: "Token retrieved successfully!",
      displayName: response.data.displayName,
      token: response.data.idToken,
      refreshToken: response.data.refreshToken,
      expiresIN: response.data.expiresIN,
    });
  } catch (error) {
    console.error(
      "Error fetching token:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to retrieve token." });
  }
});

// Refresh token using Firebase secure token endpoint
router.post("/refreshToken", async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token is required." });
  }

  const data = {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  };

  try {
    const response = await axios.post(
      `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
      data,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    res.status(200).json({
      message: "Token refreshed successfully!",
      token: response.data.id_token,
      refreshToken: response.data.refresh_token,
      expiresIN: response.data.expires_in,
    });
  } catch (error) {
    console.error(
      "Error refreshing token:",
      error.response?.data || error.message
    );
    res.status(500).json({ error: "Failed to refresh token." });
  }
});

module.exports = router;
