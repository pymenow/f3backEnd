// Import necessary utilities
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();
const { getAnalysisResult } = require("../firebase/scriptStore");
const {
  analysisDependencies,
  dependencyLabels,
  instructionMapping,
} = require("./dependencyMapping");

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
    throw new Error(
      "Invalid dependency configuration. 'script' must be included."
    );
  }

  let combinedInput = "";

  for (const dependency of dependencies) {
    let content = "";
    let instruction = "";

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
    console.log("LABEL", label);
    instruction =
      instructionMapping[analysisType]?.[dependency] ||
      "No specific instructions provided.";
    console.log("Instructions:", instruction, dependency);
    combinedInput += `
${instruction}
${label}:
${content}
`;
  }
  console.log(combinedInput);

  return combinedInput.trim();
};

module.exports = handleDynamicAnalysisChaining;
