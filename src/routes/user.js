const express = require("express");
const { authenticate } = require("../middleware/authMiddleware");
const {
  updateUserDetails,
  getUserDetails,
  createOrUpdateExtendedDetails,
} = require("../firebase/fireStore");

const router = express.Router();

// Profile Update Route
router.put("/profileUpdate", authenticate, async (req, res) => {
  const { firstName, lastName, phoneNumber, displayName, profilePic, banner } =
    req.body;

  if (!req.user || !req.user.uid) {
    return res.status(400).json({ error: "User authentication failed." });
  }

  const userId = req.user.uid;

  try {
    const updatedDetails = {};
    if (firstName) updatedDetails.firstName = firstName;
    if (lastName) updatedDetails.lastName = lastName;
    if (phoneNumber) updatedDetails.phoneNumber = phoneNumber;
    if (displayName) updatedDetails.displayName = displayName;
    if (profilePic) {
      try {
        new URL(profilePic);
        updatedDetails.profilePic = profilePic;
      } catch {
        return res
          .status(400)
          .json({ error: "Invalid profilePic. It must be a valid URL." });
      }
    }
    if (banner) {
      try {
        new URL(banner);
        updatedDetails.banner = banner;
      } catch {
        return res
          .status(400)
          .json({ error: "Invalid banner. It must be a valid URL." });
      }
    }

    await updateUserDetails(userId, updatedDetails);

    res.status(200).json({ message: "Profile updated successfully!" });
  } catch (error) {
    console.error("Error updating profile:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve User Details
router.get("/profile", authenticate, async (req, res) => {
  const userId = req.user.uid; // Get the authenticated user's ID from the token

  try {
    const userDetails = await getUserDetails(userId); // Call the helper function

    if (!userDetails) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json({
      message: "User details retrieved successfully.",
      data: userDetails,
    });
  } catch (error) {
    console.error("Error retrieving user details:", error.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

//Extended Profile updates
router.put("/extendedInfo", authenticate, async (req, res) => {
  const userId = req.user.uid; // Get authenticated user's ID from token
  const { address, preferences, genre, expertise } = req.body;

  try {
    await createOrUpdateExtendedDetails(userId, {
      address,
      preferences,
      genre,
      expertise,
    });
    res.status(200).json({ message: "Extended details updated successfully." });
  } catch (error) {
    console.error("Error updating extended details:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
