const { processScriptWithVertexAI } = require("../AI/google/vertex");
const { addAnalysis } = require("../firebase/scriptStore");

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
  // Validate the response structure
  if (!vertexResponse?.candidates?.length) {
    throw new Error(
      "Invalid Vertex AI response format: Missing 'candidates' array"
    );
  }

  const {
    candidates,
    usageMetadata = {},
    modelVersion = "unknown",
  } = vertexResponse;

  const processedData = {
    usageMetadata,
    modelVersion,
    data: null, // This will hold the parsed data
  };

  try {
    // Process the first candidate (assuming only one candidate is relevant)
    const firstCandidate = candidates[0];

    if (!firstCandidate.content?.parts?.length) {
      throw new Error("Candidate content or parts missing");
    }

    // Parse the JSON from the text key in the parts array
    const partText = firstCandidate.content.parts[0].text;

    try {
      const parsedContent = JSON.parse(partText);

      // Ensure the parsed content has a `data` key
      if (!parsedContent.data) {
        throw new Error("Parsed content does not contain 'data' key");
      }

      processedData.data = parsedContent.data; // Update processed data
    } catch (error) {
      throw new Error(`Failed to parse JSON content: ${error.message}`);
    }
  } catch (error) {
    throw new Error(`Error processing Vertex AI response: ${error.message}`);
  }

  return processedData;
};

const mergeAggregatedData = (aggregatedData) => {
  // Combine contentParts into a single text
  const combinedContent = aggregatedData.contentParts
    .map((part) => part.text) // Extract text from each part
    .join(""); // Join them into a single string

  // Structure the final merged data
  const mergedData = {
    candidates: [
      {
        content: { parts: [{ text: combinedContent }] }, // Wrap in the expected structure
        finishReason: aggregatedData.finishReason || null,
        index: 0, // Assuming a single candidate
      },
    ],
    usageMetadata: aggregatedData.usageMetadata || {},
    modelVersion: aggregatedData.modelVersion || "unknown",
  };

  return mergedData;
};

const processAndSaveAnalysis = async (
  script,
  systemPrompt,
  userId,
  scriptId,
  versionId,
  analysisType, // This corresponds to analysisType
  res = null
) => {
  const saveToFirestore = async (processedData) => {
    try {
      // Use addAnalysis to save the data
      const analysisDocId = await addAnalysis(
        userId,
        scriptId,
        versionId,
        analysisType,
        processedData
      );
      console.log(`Analysis saved for type: ${analysisType} ${analysisDocId}`);
    } catch (error) {
      console.error(
        `Error saving analysis for type: ${analysisType}`,
        error.message
      );
      throw error;
    }
  };

  // Helper function to aggregate streamed data
  const aggregateStreamedData = (accumulatedChunks) => {
    const aggregatedData = accumulatedChunks.reduce(
      (acc, chunk) => {
        const content = chunk.candidates?.[0]?.content || {};
        const usageMetadata = chunk.usageMetadata || null;

        // Combine content parts if they exist
        if (content.parts) {
          acc.contentParts.push(...content.parts);
        }

        // Preserve metadata and finishReason from the final chunk
        if (usageMetadata) {
          acc.usageMetadata = usageMetadata;
        }
        if (chunk.candidates?.[0]?.finishReason) {
          acc.finishReason = chunk.candidates[0].finishReason;
        }

        return acc;
      },
      { contentParts: [], usageMetadata: null, finishReason: null }
    );
    aggregatedData.modelVersion =
      accumulatedChunks[0]?.modelVersion || "unknown";
    return mergeAggregatedData(aggregatedData);
  };

  if (res) {
    // Streaming mode
    res.setHeader("Content-Type", "application/x-ndjson");
    const accumulatedChunks = await processScriptWithVertexAI(
      script,
      systemPrompt,
      res
    );

    const mergedData = aggregateStreamedData(accumulatedChunks);
    const processedData = processAggregatedData(mergedData);
    processedData.streamed = true;
    await saveToFirestore(processedData);
    return; // Exit early for streaming mode
  }

  // Non-streaming mode
  const vertexResponse = await processScriptWithVertexAI(script, systemPrompt);
  const processedData = processAggregatedData(vertexResponse);
  processedData.streamed = false;

  await saveToFirestore(processedData);
  return processedData;
};

module.exports = {
  validateInput,
  authorizeRequest,
  fetchScript,
  processAndSaveAnalysis,
};
