const { processScriptWithVertexAI } = require("../AI/google/vertex");

// Utility functions for validating input, authorizing requests, fetching scripts, and processing data
const validateInput = (userID, scriptID) => {
  if (!userID || !scriptID) {
    throw { status: 400, message: "User ID and Script ID are required." };
  }
};

const authorizeRequest = (authenticatedUserID, requestUserID) => {
  if (authenticatedUserID !== requestUserID) {
    throw { status: 403, message: "Unauthorized request." };
  }
};

const fetchScript = async (db, scriptID, userID) => {
  const scriptRef = db.collection("scripts").doc(scriptID);
  const scriptDoc = await scriptRef.get();

  if (!scriptDoc.exists || scriptDoc.data().userId !== userID) {
    throw { status: 404, message: "Script not found or unauthorized access." };
  }

  return { scriptRef, script: scriptDoc.data().script };
};

const processAggregatedData = (vertexResponse) => {
  // Ensure vertexResponse has the expected structure
  if (!vertexResponse || !Array.isArray(vertexResponse.candidates)) {
    throw new Error(
      "Invalid Vertex AI response format: Missing 'candidates' array"
    );
  }

  // Standardized output structure
  const processedData = {
    usageMetadata: vertexResponse.usageMetadata || {},
    modelVersion: vertexResponse.modelVersion || "unknown",
  };

  vertexResponse.candidates.forEach((candidate) => {
    const contentParts = candidate.content?.parts || []; // Ensure content.parts exists
    const aggregatedText = contentParts.map((part) => part.text).join("");

    // Clean up Markdown formatting
    const cleanedText = aggregatedText
      .replace(/```json/g, "") // Remove JSON code block markers
      .replace(/```/g, "") // Remove any leftover backticks
      .trim();

    // Attempt to parse JSON from the cleaned text
    try {
      const parsedContent = JSON.parse(cleanedText);

      // Merge Lines if present in the parsed content
      if (parsedContent.Lines && Array.isArray(parsedContent.Lines)) {
        processedData.Lines.push(...parsedContent.Lines);
      }

      // Merge other keys directly into processedData
      Object.keys(parsedContent).forEach((key) => {
        if (key !== "Lines") {
          processedData[key] = parsedContent[key];
        }
      });
    } catch (error) {
      console.warn("Failed to parse JSON content:", cleanedText);
    }
  });

  return processedData;
};

const processAndSaveAnalysis = async (
  script,
  systemPrompt,
  scriptRef,
  fieldName
) => {
  const vertexResponse = await processScriptWithVertexAI(script, systemPrompt);
  console.log("Vertex AI Response:", vertexResponse);

  // Process the response data to extract required fields
  const processedData = processAggregatedData(vertexResponse);
  console.log(processedData);

  // Save the final output to Firestore under the specified field name
  const updateData = {};
  updateData[fieldName] = processedData;
  await scriptRef.update(updateData);

  return processedData;
};

module.exports = {
  validateInput,
  authorizeRequest,
  fetchScript,
  processAndSaveAnalysis,
};
