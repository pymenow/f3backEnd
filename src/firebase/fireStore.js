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

const createOrUpdateExtendedDetails = async (userId, extendedDetails) => {
  const { address, preferences, genre, expertise } = extendedDetails;

  try {
    // Write or update extended details in Firestore
    await db
      .collection("users")
      .doc(userId)
      .collection("extendedInfo")
      .doc("details")
      .set(
        {
          address: address || {
            street: "",
            city: "",
            state: "",
            country: "",
            postalCode: "",
          }, // Default address structure
          preferences: preferences || { theme: "light", language: "en" }, // Default preferences
          genre: genre || [], // Default to empty array
          expertise: expertise || [], // Default to empty array
        },
        { merge: true } // Use merge to update existing fields or create new ones
      );
    console.log(`Extended details created or updated for userId: ${userId}`);
  } catch (error) {
    console.error(
      "Error creating or updating extended details:",
      error.message
    );
    throw error;
  }
};

const updateUserDetails = async (userId, updatedDetails) => {
  try {
    // Ensure only non-email fields are updated
    if (updatedDetails.email) {
      throw new Error("Email updates are not allowed through this endpoint.");
    }

    // Update Firestore document
    await db
      .collection("users")
      .doc(userId)
      .update({
        ...updatedDetails,
        updatedAt: new Date(), // Track update time
      });
    console.log(`User details updated for userId: ${userId}`);
  } catch (error) {
    console.error("Error updating user details:", error.message);
    throw error;
  }
};

const getUserDetails = async (userId) => {
  try {
    // Fetch the main user document
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      console.log(`User with ID ${userId} not found.`);
      return null; // Return null if the user does not exist
    }

    // Fetch the extendedInfo subcollection
    const extendedInfoSnapshot = await db
      .collection("users")
      .doc(userId)
      .collection("extendedInfo")
      .get();

    const extendedInfo = {};
    extendedInfoSnapshot.forEach((doc) => {
      extendedInfo[doc.id] = doc.data();
    });

    // Combine the main user details with extended info
    return {
      ...userDoc.data(),
      extendedInfo,
    };
  } catch (error) {
    console.error(
      `Error fetching user details and extended info for ID ${userId}:`,
      error.message
    );
    throw error; // Propagate the error to the caller
  }
};

// Export Functions
module.exports = {
  createUserDetails,
  createOrUpdateExtendedDetails,
  updateUserDetails,
  getUserDetails,
};
