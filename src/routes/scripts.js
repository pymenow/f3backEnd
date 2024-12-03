const express = require("express");
const { getFirestore } = require("firebase-admin/firestore");
const { auth } = require("../firebase/firebaseConfig"); // Firebase Admin SDK
const { processScriptWithVertexAI, processScriptWithVertexAIStream } = require("../AI/google/vertex");
const sentimentInstructions = require("../AI/google/system_instructions/sentiment"); // Default import
const axios = require("axios");
const { authenticate } = require("../middleware/authMiddleware");
const router = express.Router();
const { LanguageServiceClient } = require('@google-cloud/language').v2;

const db = getFirestore();
const languageClient = new LanguageServiceClient();

router.post('/presampling', authenticate, async (req, res) => {
  const { type, region, identity, brand, script, title } = req.body;

  // Validate input
  if (!type || !region || !identity || !script || !title || script.length < 20 || script.length > 2000) {
    return res.status(400).json({
      error: 'Invalid input. Ensure all required fields are provided, title is included, and script length is between 20 and 2000 words.',
    });
  }

  try {
    const userId = req.user.uid; // Get the authenticated user's ID

    // Store script metadata in Firestore
    const scriptRef = db.collection('scripts').doc();
    const scriptData = {
      userId,
      type,
      region,
      identity,
      brand: brand || null,
      script,
      title,
      version: 1, // Default version
      status: 'pending',
      createdAt: new Date(),
    };

    await scriptRef.set(scriptData);

    // Google Cloud Natural Language API configuration
    const document = {
      content: script,
      type: 'PLAIN_TEXT',
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
      encodingType: 'UTF8',
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

    console.log('Cloud Natural Language Analysis Result:', analysisResult);

    // Save the analysis result in Firestore under the 'presampling' column
    await scriptRef.update({
      presampling: analysisResult,
      status: 'processed',
    });

    // Respond with the Script ID & Analysis Result
    return res.status(200).json({
      message: 'Presampling completed!',
      scriptId: scriptRef.id, // Return the ID of the saved script
      data: analysisResult
    });
  } catch (error) {
    console.error('Error during presampling:', error);

    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
});

router.post('/emotion-analysis', authenticate, async (req, res) => {
  const { userID, scriptID } = req.body;

  // Validate input
  if (!userID || !scriptID) {
    return res.status(400).json({ error: 'User ID and Script ID are required.' });
  }

  try {
    const userId = req.user.uid;

    // Authorize the request
    if (userId !== userID) {
      return res.status(403).json({ error: 'Unauthorized request.' });
    }

    // Fetch the script from Firestore
    const scriptRef = db.collection('scripts').doc(scriptID);
    const scriptDoc = await scriptRef.get();

    if (!scriptDoc.exists || scriptDoc.data().userId !== userId) {
      return res.status(404).json({ error: 'Script not found or unauthorized access.' });
    }

    const { script } = scriptDoc.data();

    // Process the script with Vertex AI
    const vertexResponse = await processScriptWithVertexAI(script, sentimentInstructions);
    console.log('Vertex AI Response:', vertexResponse);

    // Post-process the Vertex AI response into the desired structure
    const finalOutput = processAggregatedData(vertexResponse);

    // Save the analysis result in Firestore under the 'emotionAnalysis' column
    await scriptRef.update({
      emotionAnalysis: finalOutput,
    });

    // Respond with the processed data
    return res.status(200).json({
      message: 'Emotion analysis completed!',
      finalOutput,
    });
  } catch (error) {
    console.error('Error during emotion analysis:', error);

    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error.' });
    }
  }
});


router.post("/emotion-analysis-stream", authenticate, async (req, res) => {
  const { userID, scriptID } = req.body;

  // Validate input
  if (!userID || !scriptID) {
    return res.status(400).json({
      error: "Invalid input. Ensure userID and scriptID are provided.",
    });
  }

  try {
    const userId = req.user.uid; // Get the authenticated user's ID

    // Ensure the user is authorized to access the script
    if (userID !== userId) {
      return res.status(403).json({
        error: "Unauthorized request. User does not own the script.",
      });
    }

    // Retrieve the script from Firestore
    const scriptRef = db.collection("scripts").doc(scriptID);
    const scriptDoc = await scriptRef.get();

    if (!scriptDoc.exists) {
      return res.status(404).json({
        error: "Script not found.",
      });
    }

    const scriptData = scriptDoc.data();

    // Set proper headers for JSONL streaming
    res.setHeader("Content-Type", "application/x-ndjson");

    // Stream content from Vertex AI to the client
    await processScriptWithVertexAIStream(scriptData.script, sentimentInstructions, res);

    // Update Firestore with the processed status in a background task
    scriptRef.update({ status: "processed" }).catch((updateError) => {
      console.error("Failed to update Firestore after streaming:", updateError);
    });
  } catch (error) {
    console.error("Error processing script:", error);

    // Ensure headers are not sent again
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
