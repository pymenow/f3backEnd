const express = require("express");
const { getFirestore } = require("firebase-admin/firestore");
const { auth } = require("../firebase/firebaseConfig"); // Firebase Admin SDK
const { addScript, addAnalysis } = require("../firebase/scriptStore");

const loadMarkdown = require("../common/loadMarkdown");
const sentimentInstructions = loadMarkdown(
  "../AI/google/system_instructions/sentiment.md"
);
const scriptInfoInstructions = loadMarkdown(
  "../AI/google/system_instructions/scriptInfo.md"
);
const brandAnalysisInstructions = loadMarkdown(
  "../AI/google/system_instructions/brandAnalysis.md"
);
const scriptSummaryInstructions = loadMarkdown(
  "../AI/google/system_instructions/scriptSummary.md"
);

const storyPlotInstructions = loadMarkdown(
  "../AI/google/system_instructions/storyPlot.md"
);
const axios = require("axios");
const { authenticate } = require("../middleware/authMiddleware");
const router = express.Router();
const { LanguageServiceClient } = require("@google-cloud/language").v2;
const handleVertexAnalysis = require("../common/vertexAiHandler");

const db = getFirestore();
const languageClient = new LanguageServiceClient();

router.post("/presampling", authenticate, async (req, res) => {
  const { title, description, script } = req.body;

  // Validate input
  if (!title || !description || !script) {
    return res.status(400).json({
      error:
        "Invalid input. Ensure title, description, and script are provided.",
    });
  }

  if (script.length < 20 || script.length > 2000) {
    return res.status(400).json({
      error: "Script length must be between 20 and 2000 characters.",
    });
  }

  try {
    const userId = req.user.uid; // Get the authenticated user's ID

    // Add the script and its first version to Firestore
    const { scriptId, versionId } = await addScript(
      userId,
      title, // Mapped to scriptTitle
      description, // Mapped to description
      script // Mapped to scriptContent
    );

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

    // Add analyses to Firestore
    await addAnalysis(
      userId,
      scriptId,
      versionId,
      "moderation",
      moderationResult
    );
    await addAnalysis(
      userId,
      scriptId,
      versionId,
      "categories",
      classificationResult
    );
    await addAnalysis(userId, scriptId, versionId, "entities", entityResult);

    console.log("Presampling analysis completed and stored.");

    // Respond with the Script ID & Analysis Results
    return res.status(200).json({
      message: "Presampling completed successfully!",
      scriptId,
      versionId,
      analysisResults: {
        moderation: moderationResult,
        categories: classificationResult,
        entities: entityResult,
      },
    });
  } catch (error) {
    console.error("Error during presampling:", error.message);

    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

router.post("/emotion-analysis", authenticate, (req, res) => {
  const isStream = req.query.stream;
  handleVertexAnalysis(sentimentInstructions, "emotionAnalysis", {
    stream: isStream,
  })(req, res);
});

router.post(
  "/info",
  authenticate,
  handleVertexAnalysis(scriptInfoInstructions, "scriptInfo")
);

router.post("/brand-analysis", authenticate, (req, res) => {
  const isStream = req.query.stream;
  handleVertexAnalysis(brandAnalysisInstructions, "brandAnalysis", {
    stream: isStream,
  })(req, res);
});

router.post("/script-summary", authenticate, (req, res) => {
  const isStream = req.query.stream;
  handleVertexAnalysis(scriptSummaryInstructions, "scriptSummary", {
    stream: isStream,
  })(req, res);
});

router.post("/story-plot", authenticate, (req, res) => {
  const isStream = req.query.stream;
  handleVertexAnalysis(storyPlotInstructions, "storyPlot", {
    stream: isStream,
  })(req, res);
});


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
