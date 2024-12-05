// Required Imports
const { getFirestore } = require("firebase-admin/firestore"); // Firestore instance from Firebase Admin SDK
const { auth } = require("./firebaseConfig"); // Assuming admin is exported from firebaseConfig.js
// Firestore instance
const db = getFirestore();

require("dotenv").config(); // To use environment variables

const createUserDetails = async (userId, userDetails) => {
  const {
    firstName,
    lastName,
    email,
    phoneNumber,
    displayName,
    profilePic,
    banner,
  } = userDetails;

  // Validate mandatory fields
  if (!firstName || !lastName || !email) {
    throw new Error("First Name, Last Name, and Email are required.");
  }

  try {
    // Write user details to Firestore
    await db
      .collection("users")
      .doc(userId)
      .set({
        firstName,
        lastName,
        email,
        phoneNumber: phoneNumber || null,
        displayName: displayName || `${firstName} ${lastName}`,
        profilePic: profilePic || null,
        banner: banner || null,
        createdAt: new Date(),
        role: "user",
      });
    console.log(`User details added for userId: ${userId}`);
  } catch (error) {
    console.error("Error creating user details:", error.message);
    throw error;
  }
};

const createExtendedDetails = async (userId, extendedDetails) => {
  const { phoneNumber, displayName, address, preferences, genre, expertise } =
    extendedDetails;

  try {
    // Write extended details to Firestore
    await db
      .collection("users")
      .doc(userId)
      .collection("extendedInfo")
      .doc("details")
      .set({
        phoneNumber: phoneNumber || null,
        displayName: displayName || null,
        address: address || null, // Object with `street`, `city`, `state`, `postalCode`
        preferences: preferences || { theme: "light", language: "en" }, // Default preferences
        genre: genre || [], // Default to empty array
        expertise: expertise || [], // Default to empty array
      });
    console.log(`Extended details added for userId: ${userId}`);
  } catch (error) {
    console.error("Error creating extended details:", error.message);
    throw error;
  }
};

// Export Functions
module.exports = { createUserDetails, createExtendedDetails };
