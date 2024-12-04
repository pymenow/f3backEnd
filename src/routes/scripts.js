const express = require("express");
const { getFirestore } = require("firebase-admin/firestore");
const { auth } = require("../firebase/firebaseConfig"); // Firebase Admin SDK
const {
  processScriptWithVertexAI
} = require("../AI/google/vertex");

const loadMarkdown = require("../common/loadMarkdown");
const sentimentInstructions = loadMarkdown("../AI/google/system_instructions/sentiment.md");
const scriptInfoInstructions = loadMarkdown("../AI/google/system_instructions/scriptInfo.md");
const axios = require("axios");
const { authenticate } = require("../middleware/authMiddleware");
const router = express.Router();
const { LanguageServiceClient } = require("@google-cloud/language").v2;
const handleVertexAnalysis = require("../common/vertexAiHandler");

const db = getFirestore();
const languageClient = new LanguageServiceClient();

router.post("/presampling", authenticate, async (req, res) => {
  const { type, region, identity, brand, script, title } = req.body;

  // Validate input
  if (
    !type ||
    !region ||
    !identity ||
    !script ||
    !title ||
    script.length < 20 ||
    script.length > 2000
  ) {
    return res.status(400).json({
      error:
        "Invalid input. Ensure all required fields are provided, title is included, and script length is between 20 and 2000 words.",
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
      title,
      version: 1, // Default version
      status: "pending",
      createdAt: new Date(),
    };

    await scriptRef.set(scriptData);

    // Google Cloud Natural Language API configuration
    const document = {
      content: script,
      type: "PLAIN_TEXT",
    };

    const features = {
      extractSyntax: true,
      extractEntities: true,
      extractDocumentSentiment: true,
      extractEntitySentiment: true,
    };

    const request = {
      document,
      features,
      encodingType: "UTF8",
    };

    // Call Google Cloud Natural Language API
    const [moderationResult] = await languageClient.moderateText(request);
    const [classificationResult] = await languageClient.classifyText(request);
    const [entityResult] = await languageClient.analyzeEntities(request);
    const analysisResult = {
      moderationResult: moderationResult,
      classificationResult: classificationResult,
      entityResult: entityResult,
    };

    console.log("Cloud Natural Language Analysis Result:", analysisResult);

    // Save the analysis result in Firestore under the 'presampling' column
    await scriptRef.update({
      presampling: analysisResult,
      status: "processed",
    });

    // Respond with the Script ID & Analysis Result
    return res.status(200).json({
      message: "Presampling completed!",
      scriptId: scriptRef.id, // Return the ID of the saved script
      data: analysisResult,
    });
  } catch (error) {
    console.error("Error during presampling:", error);

    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

router.post(
  "/emotion-analysis",
  authenticate,
  handleVertexAnalysis(sentimentInstructions, "emotionAnalysis")
);

router.post(
  "/info",
  authenticate,
  handleVertexAnalysis(scriptInfoInstructions, "scriptInfo")
);

router.post(
  "/emotion-analysis-stream",
  authenticate,
  handleVertexAnalysis(sentimentInstructions, "emotionAnalysis", { stream: true })
);

router.get("/get-emotion-analysis", authenticate, async (req, res) => {
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
