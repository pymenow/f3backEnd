const express = require("express");
const { getFirestore } = require("firebase-admin/firestore");
const { auth } = require("../firebase/firebaseConfig"); // Firebase Admin SDK
const { processScriptWithVertexAI } = require("../AI/google/vertex");
const sentimentInstructions = require("../AI/google/system_instructions/sentiment"); // Default import
const axios = require("axios");
const authenticate = require("../middleware/authMiddleware");
const router = express.Router();

const db = getFirestore();

router.post("/emotion-analysis", authenticate, async (req, res) => {
  const { type, region, identity, brand, script } = req.body;

  // Validate input
  if (
    !type ||
    !region ||
    !identity ||
    !script ||
    script.length < 20 ||
    script.length > 2000
  ) {
    return res
      .status(400)
      .json({
        error:
          "Invalid input. Ensure all required fields are provided and script length is between 20 and 2000 words.",
      });
  }

  try {
    const userId = req.user.uid; // Get the authenticated user's ID

    // Store script metadata in Firestore
    const scriptRef = db.collection("scripts").doc();
    const scriptData = {
      userId,
      type,
      region,
      identity,
      brand: brand || null,
      script,
      status: "pending",
      createdAt: new Date(),
    };

    await scriptRef.set(scriptData);

    // Process the script with Vertex AI to get the final response
    const vertexResponse = await processScriptWithVertexAI(
      script,
      sentimentInstructions
    );
    console.log("Vertex AI Response:", vertexResponse);

    // Post-process the Vertex AI response into the desired structure
    const finalOutput = processAggregatedData(vertexResponse);

    // Save the final output in Firestore
    await scriptRef.update({
      vertexResponse: finalOutput,
      status: "processed",
    });

    // Respond with the final output
    return res.status(200).json({
      message: "Processing completed!",
      finalOutput,
    });
  } catch (error) {
    console.error("Error processing script:", error);

    // Only send the response if headers are not already sent
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

const processAggregatedData = (vertexResponse) => {
  const processedData = { Lines: [] };

  // Ensure vertexResponse has the expected structure
  if (!vertexResponse || !Array.isArray(vertexResponse.candidates)) {
    throw new Error("Invalid Vertex AI response format");
  }

  vertexResponse.candidates.forEach((candidate) => {
    const contentParts = candidate.content?.parts || [];
    const aggregatedText = contentParts.map((part) => part.text).join("");

    // Clean up Markdown formatting
    const cleanedText = aggregatedText
      .replace(/```json/g, "") // Remove JSON code block markers
      .replace(/```/g, "") // Remove any leftover backticks
      .trim();

    // Attempt to parse JSON from the cleaned text
    try {
      const parsedContent = JSON.parse(cleanedText);
      if (parsedContent && Array.isArray(parsedContent.Lines)) {
        processedData.Lines.push(...parsedContent.Lines);
      }
    } catch (error) {
      console.warn("Failed to parse JSON:", cleanedText);
    }
  });

  return processedData;
};

router.get("/emotion-analysis", authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Query Firestore for scripts created by the authenticated user
    const snapshot = await db
      .collection("scripts")
      .where("userId", "==", userId)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json({ message: "No scripts found for the user." });
    }

    const scripts = [];
    snapshot.forEach((doc) => {
      scripts.push({ id: doc.id, ...doc.data() });
    });

    res
      .status(200)
      .json({ message: "Scripts retrieved successfully.", scripts });
  } catch (error) {
    console.error("Error retrieving scripts:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

module.exports = router;
