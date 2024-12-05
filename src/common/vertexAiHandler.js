// Import necessary utilities
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();
const { getScript } = require("../firebase/scriptStore");

const {
  validateInput,
  authorizeRequest,
  fetchScript,
  processAndSaveAnalysis,
} = require("./utilityFunctions");

const handleAnalysis = (
  systemPrompt,
  fieldName,
  options = { stream: false }
) => {
  return async (req, res) => {
    const { userId, scriptId, versionId } = req.body;


    try {
      // Validate and authorize
      validateInput(userId, scriptId);
      const authenticatedUserId = req.user.uid;
      authorizeRequest(authenticatedUserId, userId);

      // Fetch script and specific version
      const scriptData = await getScript(userId, scriptId, versionId);
      if (!scriptData.version) {
        throw new Error(`Version ${versionId || "current"} not found for script ${scriptId}.`);
      }
      const script = scriptData.version.content;

      if (!script) {
        throw new Error("Script content is missing or invalid.");
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
          fieldName,
          res
        );

        // Update Firestore with the processed status in a background task
      } else {
        // Non-streaming mode
        const finalOutput = await processAndSaveAnalysis(
          script,
          systemPrompt,
          userId,
          scriptId,
          versionId || scriptData.currentVersion,
          fieldName
        );

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
