const express = require("express");
const { getFirestore } = require("firebase-admin/firestore");
const { auth } = require("../firebase/firebaseConfig"); // Firebase Admin SDK
const {
  addScript,
  addAnalysis,
  getAnalyses,
  getScript,
  addVersionToScript
} = require("../firebase/scriptStore");
const { generateAndSaveImage } = require("../AI/flux/imageGeneration");
const { generateAndSaveImageWithFAL } = require("../AI/flux/imageGenerationFal");

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

const ratingInstructions = loadMarkdown(
  "../AI/google/system_instructions/rating.md"
);

const sceneAnalysisInstructions = loadMarkdown(
  "../AI/google/system_instructions/sceneAnalysis.md"
);

const shotListInstructions = loadMarkdown(
  "../AI/google/system_instructions/shotList.md"
);

const promptGeneratorInstructions = loadMarkdown(
  "../AI/google/system_instructions/promptGenerator.md"
);

const axios = require("axios");
const { authenticate } = require("../middleware/authMiddleware");
const router = express.Router();
const { LanguageServiceClient } = require("@google-cloud/language").v2;
const handleVertexAnalysis = require("../common/vertexAiHandler");
const { streamFileFromGCS, synthesizeSpeechAndSave, streamMultipleFilesFromGCS } = require("../common/gCloudStorage");


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

router.post("/add-version", authenticate, async (req, res) => {
  try {
    const { scriptId, scriptContent, fileURL } = req.body;
    const userId = req.user.uid; // Authenticated user's UID

    // Validate required parameters
    if (!scriptId) {
      return res.status(400).json({
        error: "Missing required parameter: scriptId.",
      });
    }

    if (!scriptContent && !fileURL) {
      return res.status(400).json({
        error: "Either scriptContent or fileURL must be provided.",
      });
    }

    if (
      scriptContent &&
      (scriptContent.length < 20 || scriptContent.length > 2000)
    ) {
      return res.status(400).json({
        error: "Script length must be between 20 and 2000 characters.",
      });
    }

    // Add a new version to the script
    const { versionId, versionNumber } = await addVersionToScript(
      userId,
      scriptId,
      scriptContent,
      fileURL
    );

    if (!scriptContent) {
      return res.status(201).json({
        message:
          "New version added successfully. No analyses performed as scriptContent is empty.",
        versionId,
        versionNumber,
      });
    }

    // Google Cloud Natural Language API configuration
    const document = {
      content: scriptContent,
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

    // Perform analyses
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

    console.log("Analysis completed and stored for the new version.");

    // Respond with the Version ID, Number, and Analysis Results
    res.status(201).json({
      message: "New version added successfully with analyses.",
      versionId,
      versionNumber,
      analysisResults: {
        moderation: moderationResult,
        categories: classificationResult,
        entities: entityResult,
      },
    });
  } catch (error) {
    console.error(
      "Error adding new version and performing analyses:",
      error.message
    );

    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error. Please try again later.",
      });
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

router.post("/rating", authenticate, (req, res) => {
  const isStream = req.query.stream;
  handleVertexAnalysis(ratingInstructions, "rating", {
    stream: isStream,
  })(req, res);
});

router.post("/scene-analysis", authenticate, async (req, res) => {
  const isStream = req.query.stream;
  try {
    // Handle scene analysis
    await handleVertexAnalysis(sceneAnalysisInstructions, "sceneAnalysis", {
      stream: isStream,
    })(req, res);

  } catch (error) {
    console.error("Error in scene-analysis route:", error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error." });
    }
  }
});

router.post("/shot-list", authenticate, (req, res) => {
  const isStream = req.query.stream;
  handleVertexAnalysis(shotListInstructions, "shotList", {
    stream: isStream,
  })(req, res);
});

router.post("/prompt-generator", authenticate, (req, res) => {
  const isStream = req.query.stream;
  handleVertexAnalysis(promptGeneratorInstructions, "promptGenerator", {
    stream: isStream,
  })(req, res);
});

/**
 * POST /fram3AIImage
 * Generate an image using the Flux API or FAL API and save it to Google Cloud Storage.
 */
router.post("/fram3AIImage", authenticate, async (req, res) => {
  const {
    scriptId,
    versionId,
    prompt,
    artifactType,
    apiPath,
    width,
    height,
    prod = false, // Default to false
  } = req.body;

  // Validate input
  if (!scriptId || !versionId || !prompt) {
    return res.status(400).json({
      error:
        "Missing required fields: scriptId, versionId, and prompt are mandatory.",
    });
  }

  try {
    const uid = req.user.uid; // Authenticated user ID

    console.log(`Using ${prod ? "generateAndSaveImage" : "generateAndSaveImageWithFAL"}`);

    // Choose the appropriate function based on `prod`
    const generateImageFunction = prod
      ? generateAndSaveImage // Use Flux API
      : generateAndSaveImageWithFAL; // Use FAL API

    // Generate and save the image
    const signedUrl = await generateImageFunction(
      uid,
      scriptId,
      versionId,
      prompt,
      artifactType,
      {
        apiPath,
        width,
        height,
      }
    );

    res.status(200).json({
      message: "Image generated and saved successfully!",
      signedUrl,
    });
  } catch (error) {
    console.error("Error generating and saving image:", error.message);
    res
      .status(500)
      .json({ error: `Failed to generate and save image: ${error.message}` });
  }
});


router.get("/get-analysis", authenticate, async (req, res) => {
  const { scriptId, versionId, analysisType } = req.query;

  try {
    // Validate required parameters
    if (!scriptId || !versionId) {
      return res.status(400).json({
        error: "Missing required query parameters: scriptId and versionId.",
      });
    }

    const userId = req.user.uid; // Get authenticated user's UID

    // Call getAnalyses function
    const analyses = await getAnalyses(
      userId,
      scriptId,
      versionId,
      analysisType
    );

    if (!analyses || analyses.length === 0) {
      return res.status(404).json({
        message: "No analyses found for the given parameters.",
      });
    }

    res.status(200).json({
      message: "Analyses retrieved successfully.",
      analyses,
    });
  } catch (error) {
    console.error("Error retrieving analyses:", error.message);
    res
      .status(500)
      .json({ error: `Failed to retrieve analyses: ${error.message}` });
  }
});

router.get("/get-script", authenticate, async (req, res) => {
  const { scriptId, versionId, includeDetails } = req.query;

  try {
    // Validate required parameters
    if (!scriptId) {
      return res.status(400).json({
        error: "Missing required query parameter: scriptId.",
      });
    }

    const userId = req.user.uid; // Get authenticated user's UID

    // Call getScript function
    const scriptData = await getScript(
      userId,
      scriptId,
      versionId,
      includeDetails
    );

    res.status(200).json({
      message: "Script retrieved successfully.",
      script: scriptData,
    });
  } catch (error) {
    console.error("Error retrieving script:", error.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/stream-audio", async (req, res) => {
  const { filePath } = req.query;

  if (!filePath) {
    return res.status(400).json({ error: "Missing required parameter: filePath" });
  }

  try {
    await streamFileFromGCS(filePath, res);
  } catch (error) {
    if (error.message === "File not found") {
      return res.status(404).json({ error: "File not found" });
    }
    console.error("Error streaming audio:", error.message);
    res.status(500).json({ error: "Internal server error." });
  }
});

router.get("/stream-audio-list", async (req, res) => {
  const { filePaths } = req.query;

  if (!filePaths) {
    return res.status(400).json({ error: "Missing required parameter: filePaths" });
  }

  try {
    const filesArray = JSON.parse(filePaths); // Parse JSON string into array
    if (!Array.isArray(filesArray) || filesArray.length === 0) {
      return res.status(400).json({ error: "filePaths must be a non-empty array." });
    }

    await streamMultipleFilesFromGCS(filesArray, res);
  } catch (error) {
    console.error("Error streaming audio files:", error.message);
    res.status(500).json({ error: "Internal server error." });
  }
});


router.post("/synthesize-audio", authenticate, async (req, res) => {
  const { text, scriptId, versionId, gender } = req.body;

  try {
    // Validate required parameters
    if (!text || !scriptId || !versionId) {
      return res.status(400).json({
        error: "Missing required body parameters: text, scriptId, and versionId.",
      });
    }

    const userId = req.user.uid; // Get authenticated user's UID

    // Call synthesizeSpeechAndSave function
    const gcsFilePath = await synthesizeSpeechAndSave(
      text,
      userId,
      scriptId,
      versionId,
      gender || "MALE"
    );

    res.status(200).json({
      message: "Audio synthesized and saved successfully.",
      gcsFilePath,
    });
  } catch (error) {
    console.error("Error synthesizing audio:", error.message);
    res.status(500).json({ error: `Failed to synthesize audio: ${error.message}` });
  }
});

module.exports = router;
