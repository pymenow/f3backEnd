// Import necessary utilities
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();
const {
  getScript,
  checkIfAnalysisExists,
  getAnalysisResult,
} = require("../firebase/scriptStore");
const handleDynamicAnalysisChaining = require("./chainHandler");

const {
  validateInput,
  authorizeRequest,
  fetchScript,
  processAndSaveAnalysis,
} = require("./utilityFunctions");
const { audioProcessing } = require("./backGround");

const handleAnalysis = (
  systemPrompt,
  analysisType,
  options = { stream: false }
) => {
  return async (req, res) => {
    const { userId, scriptId, versionId } = req.body;

    try {
      // Validate and authorize
      validateInput(userId, scriptId);
      const authenticatedUserId = req.user.uid;
      authorizeRequest(authenticatedUserId, userId);
      const exists = await checkIfAnalysisExists(
        userId,
        scriptId,
        versionId,
        analysisType
      );

      if (exists) {
        return res.status(400).json({
          error: `Analysis of type ${analysisType} already exists for versionId: ${versionId}.`,
        });
      }

      // Fetch script and specific version
      const scriptData = await getScript(userId, scriptId, versionId);
      if (!scriptData.version) {
        throw new Error(
          `Version ${versionId || "current"} not found for script ${scriptId}.`
        );
      }
      let script = scriptData.version.content;

      if (!script) {
        throw new Error("Script content is missing or invalid.");
      }
      try {
        // Dynamically handle dependencies and combine the script for the specified analysis type
        script = await handleDynamicAnalysisChaining(
          userId,
          scriptId,
          versionId,
          analysisType,
          script
        );
      } catch (error) {
        // Return a 400 error response if the chaining fails
        return res.status(400).json({
          error: error.message,
        });
      }

      if (options.stream) {
        // Streaming mode
        res.setHeader("Content-Type", "application/x-ndjson");

        // Stream content from Vertex AI to the client
        await processAndSaveAnalysis(
          script,
          systemPrompt,
          userId,
          scriptId,
          versionId || scriptData.currentVersion,
          analysisType,
          res
        );
        if (analysisType == "sceneAnalysis") {
          audioProcessing(userId, scriptId, versionId);
        }

        // Update Firestore with the processed status in a background task
      } else {
        // Non-streaming mode
        const finalOutput = await processAndSaveAnalysis(
          script,
          systemPrompt,
          userId,
          scriptId,
          versionId || scriptData.currentVersion,
          analysisType
        );
        if (analysisType == "sceneAnalysis") {
          audioProcessing(userId, scriptId, versionId);
        }

        // Respond with the final output
        return res.status(200).json({
          message: "Analysis completed!",
          finalOutput,
        });
      }
    } catch (error) {
      console.error("Error during analysis:", error);

      if (!res.headersSent) {
        const status = error.status || 500;
        res
          .status(status)
          .json({ error: error.message || "Internal server error." });
      }
    }
  };
};

module.exports = handleAnalysis;
