/**
 * Generate Video Tool
 * Simple video generation using Veo 3.1
 */
const VideoAgent = require("../VideoAgent");

const videoAgent = new VideoAgent();

const generateVideoTool = {
  name: "generate_video",
  description: `Generate AI video using Google Veo 3.1.
Supports:
- Text prompt to video
- Start frame image (optional)
- End frame image for interpolation (optional)
- Reference images up to 3 (optional)
- Extend existing video (optional)`,

  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Detailed prompt describing the video to generate"
      },
      mode: {
        type: "string",
        enum: ["prompt", "start_frame", "interpolation", "references", "extend"],
        description: "Generation mode"
      },
      startImage: {
        type: "object",
        description: "Starting frame image { imageBytes, mimeType }"
      },
      endImage: {
        type: "object",
        description: "Ending frame for interpolation { imageBytes, mimeType }"
      },
      referenceImages: {
        type: "array",
        description: "Reference images array (max 3) [{ imageBytes, mimeType, referenceType }]"
      },
      previousVideo: {
        type: "object",
        description: "Previous video object to extend"
      },
      resolution: {
        type: "string",
        enum: ["720p", "1080p"],
        default: "720p"
      }
    },
    required: ["prompt", "mode"]
  },

  execute: async (params) => {
    const { prompt, mode, startImage, endImage, referenceImages, previousVideo, resolution = "720p" } = params;

    try {
      let videos;
      const options = { resolution };

      switch (mode) {
        case "prompt":
          videos = await videoAgent.generateFromPrompt(prompt, options);
          break;

        case "start_frame":
          if (!startImage) throw new Error("startImage required for start_frame mode");
          videos = await videoAgent.generateWithStartFrame(prompt, startImage, options);
          break;

        case "interpolation":
          if (!startImage || !endImage) throw new Error("Both startImage and endImage required for interpolation");
          videos = await videoAgent.generateWithFrames(prompt, startImage, endImage, options);
          break;

        case "references":
          if (!referenceImages?.length) throw new Error("referenceImages required for references mode");
          if (referenceImages.length > 3) throw new Error("Maximum 3 reference images allowed");
          videos = await videoAgent.generateWithReferences(prompt, referenceImages, options);
          break;

        case "extend":
          if (!previousVideo) throw new Error("previousVideo required for extend mode");
          videos = await videoAgent.extendVideo(previousVideo, prompt, options);
          break;

        default:
          throw new Error(`Unknown mode: ${mode}`);
      }

      return {
        success: true,
        videos: videos,
        count: videos.length
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};

module.exports = generateVideoTool;

