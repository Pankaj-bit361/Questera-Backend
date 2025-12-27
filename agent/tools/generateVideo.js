/**
 * Generate Video Tool
 * Simple video generation using Google Veo 3.1
 */
const VideoAgent = require("../VideoAgent");

const videoAgent = new VideoAgent();

const generateVideoTool = {
  name: "generate_video",
  description: `Generate AI video using Google Veo 3.1. Creates short video clips from text or images.

WHEN TO USE:
- User explicitly asks for a VIDEO, not an image
- User says "create a video", "generate video", "make a video clip"
- User wants animated content, motion graphics, or moving visuals
- User wants to turn an image into a video
- User wants to extend an existing video
- User wants video for Reels, TikTok, or video content

WHEN NOT TO USE:
- User wants a static IMAGE → use generate_image instead
- User wants to edit an image → use edit_image instead
- User wants GIFs (not supported) → use generate_image for static
- User hasn't specified they want video (default to image)
- User just wants to post to Instagram feed → use image tools

GENERATION MODES:

1. "prompt" - Text to Video
   - Basic mode: describe what you want in the video
   - No images needed, pure AI generation
   - Best for: abstract concepts, scenes, animations

2. "start_frame" - Image to Video
   - Starts from a specific image and animates it
   - Great for: animating product shots, portraits
   - Requires: startImage object

3. "interpolation" - Frame to Frame
   - Generates video between two images
   - Creates smooth transition/morphing
   - Requires: startImage AND endImage
   - Great for: before/after, transformations

4. "references" - Guided Generation
   - Uses reference images to guide style/content
   - Up to 3 reference images
   - Great for: maintaining character/style consistency

5. "extend" - Continue Video
   - Extends an existing video with more content
   - Requires: previousVideo object
   - Great for: making videos longer

PROMPTING TIPS FOR VIDEO:
- Describe MOTION and ACTION, not just static scenes
- Include camera movements: "slow zoom in", "pan left", "tracking shot"
- Specify duration feel: "slow motion", "timelapse", "quick cuts"
- Describe transitions if relevant
- Be specific about what MOVES and HOW

EXAMPLES:
- "A coffee cup with steam rising, slow zoom in" → prompt mode
- "Animate this product image with subtle movement" → start_frame mode
- "Create a transition from day to night" → interpolation mode
- "Make a video keeping my brand style" + refs → references mode
- "Continue this video with more content" → extend mode

RESOLUTION OPTIONS:
- "720p": Faster generation, good for drafts/previews (default)
- "1080p": Higher quality, slower generation, for final content

IMAGE FORMAT FOR startImage/endImage/referenceImages:
{
  imageBytes: "base64 encoded image data",
  mimeType: "image/jpeg" or "image/png",
  referenceType: "style" or "subject" (for references only)
}

IMPORTANT:
- Video generation takes longer than image generation
- Default resolution is 720p (use 1080p for high quality)
- Maximum 3 reference images for references mode
- Start with simple prompts, add detail as needed
- Videos are short clips (a few seconds)`,

  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Detailed prompt describing the video. Include motion, camera movement, and action.",
        example: "A golden retriever running through a field of sunflowers, slow motion, tracking shot, warm golden hour lighting"
      },
      mode: {
        type: "string",
        enum: ["prompt", "start_frame", "interpolation", "references", "extend"],
        description: "Generation mode: prompt (text-only), start_frame (animate image), interpolation (between 2 images), references (style-guided), extend (continue video)",
        example: "prompt"
      },
      startImage: {
        type: "object",
        description: "Starting frame for start_frame/interpolation modes. Format: { imageBytes: 'base64...', mimeType: 'image/jpeg' }",
        example: { imageBytes: "base64data...", mimeType: "image/jpeg" }
      },
      endImage: {
        type: "object",
        description: "Ending frame for interpolation mode only. Same format as startImage.",
        example: { imageBytes: "base64data...", mimeType: "image/jpeg" }
      },
      referenceImages: {
        type: "array",
        description: "Reference images for references mode. Max 3. Format: [{ imageBytes, mimeType, referenceType: 'style'|'subject' }]",
        example: [{ imageBytes: "base64...", mimeType: "image/jpeg", referenceType: "style" }]
      },
      previousVideo: {
        type: "object",
        description: "Previous video object to extend. Only for extend mode.",
        example: { videoData: "..." }
      },
      resolution: {
        type: "string",
        enum: ["720p", "1080p"],
        default: "720p",
        description: "Output resolution. 720p is faster, 1080p is higher quality.",
        example: "1080p"
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

