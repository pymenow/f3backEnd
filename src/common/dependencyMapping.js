// Define dependency mapping
const analysisDependencies = {
  scriptInfo: ["script"],
  brandAnalysis: ["script"],
  scriptSummary: ["script"],
  rating: ["script"],
  emotionAnalysis: ["script"],
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
  emotionAnalysis: "Sentiment Analysis Agent Output",
  sceneAnalysis: "Scene Analysis Agent Output",
  shotList: "Shot List Analysis Agent Output",
  promptGenerator: "Image Prompt Generator Output",
  script: "Script Content",
  storyPlot: "Story Plot Analysis Agent Output",
};

// Define instructions for each dependency based on analysis type
const instructionMapping = {
  scriptInfo: {
    script:
      "Analyze the script content to extract structural elements for script info.",
  },
  brandAnalysis: {
    script:
      "Analyze the script to identify branding opportunities and integration.",
  },
  scriptSummary: {
    script: "Summarize the script to capture key story elements and themes.",
  },
  rating: {
    script:
      "Evaluate the script for appropriate content rating and audience suitability.",
  },
  emotionAnalysis: {
    script: "Analyze emotional tones and sentiments in the script content.",
  },
  sceneAnalysis: {
    script: "Break down the script into scenes for detailed analysis.",
    scriptSummary: "Use the summary to provide context for scene breakdown.",
  },
  shotList: {
    sceneAnalysis: "Generate a shot list based on scene analysis details.",
    scriptSummary: "Utilize script summary to refine shot planning.",
    script: "Ensure alignment of shots with the original script content.",
  },
  promptGenerator: {
    shotList: "Collect information from the ShotList Analysis below",
    sceneAnalysis: "Collect information from the Scene Analysis below",
    script:
      "Ensure all scenes and all shots within the scene are captured accurately. The prompts that are generated is to be used to feed into an Image generation model , for cinematic Image generation.",
  },
  storyPlot: {
    script: "Analyze the script to develop a coherent story plot.",
  },
};

module.exports = { analysisDependencies, dependencyLabels, instructionMapping };
