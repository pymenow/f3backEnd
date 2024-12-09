// Import necessary utilities
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();
const { getAnalysisResult } = require("../firebase/scriptStore");

// Define dependency mapping
const analysisDependencies = {
  scriptInfo: ["script"],
  brandAnalysis: ["script"],
  scriptSummary: ["script"],
  rating: ["script"],
  sentimentAnalysis: ["script"],
  sceneAnalysis: ["scriptSummary", "script"],
  shotList: ["sceneAnalysis", "scriptSummary", "script"],
  promptGenerator: ["shotList", "sceneAnalysis", "script"],
  storyPlot: ["script"],
};

// Define labels for each dependency
const dependencyLabels = {
  scriptInfo: "Script Info Agent Output",
  brandAnalysis: "Brand Analysis Agent Output",
  scriptSummary: "Script Summary Agent Output",
  rating: "Script Rating Analysis Agent Output",
  sentimentAnalysis: "Sentiment Analysis Agent Output",
  sceneAnalysis: "Scene Analysis Agent Output",
  shotList: "Shot List Analysis Agent Output",
  promptGenerator: "Image Prompt Generator Output",
  script: "Script Content",
  storyPlot: "Story Plot Analysis Agent Output"
};

/**
 * Dynamically handles analysis dependencies and combines inputs for processing.
 * @param {string} userId - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID.
 * @param {string} analysisType - The analysis type to process.
 * @param {string} script - The original script content.
 * @returns {Promise<string>} - The combined input for the specified analysis type.
 * @throws {Error} - Throws an error if any dependency is missing.
 */
const handleDynamicAnalysisChaining = async (
  userId,
  scriptId,
  versionId,
  analysisType,
  script
) => {
  const dependencies = analysisDependencies[analysisType];

  if (!dependencies || !dependencies.includes("script")) {
    throw new Error("Invalid dependency configuration. 'script' must be included.");
  }

  let combinedInput = "";

  for (const dependency of dependencies) {
    let content = "";

    if (dependency === "script") {
      // Use the script content directly
      content = script;
    } else {
      // Fetch the result of the required analysis
      const result = await getAnalysisResult(
        userId,
        scriptId,
        versionId,
        dependency
      );

      if (!result) {
        throw new Error(
          `${analysisType} requires ${dependency} to be completed first.`
        );
      }

      content = JSON.stringify(result, null, 2);
    }

    // Append the labeled content
    const label = dependencyLabels[dependency] || `${dependency} Result`;
    combinedInput += `
${label}:
${content}
`;
  }

  return combinedInput.trim();
};

module.exports = handleDynamicAnalysisChaining;
