const fs = require("fs");
const path = require("path");

// Path to the Markdown file
const sentimentFilePath = path.resolve(__dirname, "./sentiment.md");

let sentimentInstructions = null;

try {
  // Read the entire file content as a single string
  sentimentInstructions = fs.readFileSync(sentimentFilePath, "utf-8").trim();
} catch (error) {
  console.error("Error loading sentiment instructions:", error.message);
}

module.exports = sentimentInstructions;
