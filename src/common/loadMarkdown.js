const fs = require("fs");
const path = require("path");

const loadMarkdown = (relativePath) => {
  const absolutePath = path.resolve(__dirname, relativePath);
  try {
    // Read the file content and return it as a trimmed string
    return fs.readFileSync(absolutePath, "utf-8").trim();
  } catch (error) {
    console.error(`Error loading Markdown file at ${relativePath}:`, error.message);
    throw error; // Re-throw the error for the caller to handle
  }
};

module.exports = loadMarkdown;
