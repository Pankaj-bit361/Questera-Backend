/**
 * Simple Video Agent using Google Veo 3.1
 * Supports: prompt-to-video, start/end frames, reference images, video extension
 */
const { GoogleGenAI } = require("@google/genai");

class VideoAgent {
  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
    this.model = "veo-3.1-generate-preview";
    this.pollInterval = 10000; // 10 seconds
  }

  /**
   * Wait for video generation to complete
   */
  async waitForCompletion(operation) {
    while (!operation.done) {
      console.log("Waiting for video generation...");
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      operation = await this.ai.operations.getVideosOperation({ operation });
    }
    return operation;
  }

  /**
   * Generate video from prompt only
   */
  async generateFromPrompt(prompt, options = {}) {
    const { numberOfVideos = 1, resolution = "720p" } = options;

    let operation = await this.ai.models.generateVideos({
      model: this.model,
      prompt,
      config: { number_of_videos: numberOfVideos, resolution }
    });

    operation = await this.waitForCompletion(operation);
    return operation.response.generatedVideos;
  }

  /**
   * Generate video with starting frame
   */
  async generateWithStartFrame(prompt, startImage, options = {}) {
    const { numberOfVideos = 1, resolution = "720p" } = options;

    let operation = await this.ai.models.generateVideos({
      model: this.model,
      prompt,
      image: {
        imageBytes: startImage.imageBytes,
        mimeType: startImage.mimeType || "image/png"
      },
      config: { number_of_videos: numberOfVideos, resolution }
    });

    operation = await this.waitForCompletion(operation);
    return operation.response.generatedVideos;
  }

  /**
   * Generate video with start and end frames (interpolation)
   */
  async generateWithFrames(prompt, startImage, endImage, options = {}) {
    const { numberOfVideos = 1, resolution = "720p" } = options;

    let operation = await this.ai.models.generateVideos({
      model: this.model,
      prompt,
      image: {
        imageBytes: startImage.imageBytes,
        mimeType: startImage.mimeType || "image/png"
      },
      config: {
        last_frame: {
          imageBytes: endImage.imageBytes,
          mimeType: endImage.mimeType || "image/png"
        },
        number_of_videos: numberOfVideos,
        resolution
      }
    });

    operation = await this.waitForCompletion(operation);
    return operation.response.generatedVideos;
  }

  /**
   * Generate video with reference images (max 3)
   */
  async generateWithReferences(prompt, referenceImages, options = {}) {
    const { numberOfVideos = 1, resolution = "720p" } = options;

    // Limit to 3 reference images
    const refs = referenceImages.slice(0, 3).map(img => ({
      image: {
        imageBytes: img.imageBytes,
        mimeType: img.mimeType || "image/png"
      },
      reference_type: img.referenceType || "asset"
    }));

    let operation = await this.ai.models.generateVideos({
      model: this.model,
      prompt,
      config: {
        reference_images: refs,
        number_of_videos: numberOfVideos,
        resolution
      }
    });

    operation = await this.waitForCompletion(operation);
    return operation.response.generatedVideos;
  }

  /**
   * Extend an existing video
   */
  async extendVideo(previousVideo, prompt, options = {}) {
    const { numberOfVideos = 1, resolution = "720p" } = options;

    let operation = await this.ai.models.generateVideos({
      model: this.model,
      video: previousVideo,
      prompt,
      config: { number_of_videos: numberOfVideos, resolution }
    });

    operation = await this.waitForCompletion(operation);
    return operation.response.generatedVideos;
  }

  /**
   * Download generated video
   */
  async downloadVideo(video, downloadPath) {
    await this.ai.files.download({
      file: video.video,
      downloadPath
    });
    return downloadPath;
  }
}

module.exports = VideoAgent;

