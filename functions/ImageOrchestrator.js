const { GoogleGenAI } = require('@google/genai');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const ContentJob = require('../models/contentJob');
const ContentEngine = require('./ContentEngine');

/**
 * Image Generation Orchestrator
 * Handles actual image generation, quality scoring, and result storage
 */
class ImageOrchestrator {
  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });
    this.imageModel = 'gemini-3-pro-image-preview';
    this.contentEngine = new ContentEngine();

    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucketName = process.env.AWS_S3_BUCKET_NAME;
  }

  async uploadToS3(buffer, mimeType) {
    const extension = mimeType?.split('/')[1] || 'png';
    const fileName = `generated/${uuidv4()}.${extension}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: mimeType,
    }));

    return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
  }

  /**
   * Generate a single image from a prompt
   */
  async generateSingleImage(prompt, referenceImages = [], options = {}) {
    const { aspectRatio = '1:1', style = 'photorealistic' } = options;

    const config = {
      responseModalities: ['Text', 'Image'],
      temperature: 1,
      topP: 0.95,
    };

    // Build parts array with prompt and reference images
    const parts = [{ text: prompt }];

    // Add reference images if provided
    for (const ref of referenceImages) {
      if (ref.data) {
        parts.push({
          inlineData: {
            mimeType: ref.mimeType || 'image/jpeg',
            data: ref.data,
          },
        });
      }
    }

    const contents = [{ role: 'user', parts }];

    console.log('🖼️ [IMAGE-ORCH] Generating image with prompt:', prompt.slice(0, 100) + '...');

    const response = await this.ai.models.generateContentStream({
      model: this.imageModel,
      config,
      contents,
    });

    let imageUrl = null;
    let textResponse = '';

    for await (const chunk of response) {
      if (chunk.candidates?.[0]?.content?.parts) {
        for (const part of chunk.candidates[0].content.parts) {
          if (part.text) {
            textResponse += part.text;
          }
          if (part.inlineData?.data) {
            const buffer = Buffer.from(part.inlineData.data, 'base64');
            imageUrl = await this.uploadToS3(buffer, part.inlineData.mimeType);
            console.log('✅ [IMAGE-ORCH] Image uploaded:', imageUrl);
          }
        }
      }
    }

    return { imageUrl, textResponse, prompt };
  }

  /**
   * Execute a content job - generate all images in the job
   */
  async executeJob(jobId, referenceImages = []) {
    const job = await ContentJob.findOne({ jobId });
    if (!job) {
      throw new Error('Job not found');
    }

    console.log('🚀 [IMAGE-ORCH] Executing job:', jobId, 'with', job.prompts.length, 'prompts');

    job.status = 'running';
    await job.save();

    const results = [];

    for (let i = 0; i < job.prompts.length; i++) {
      const prompt = job.prompts[i];
      
      try {
        console.log(`📷 [IMAGE-ORCH] Generating image ${i + 1}/${job.prompts.length}`);
        
        const result = await this.generateSingleImage(prompt, referenceImages, {
          aspectRatio: job.inputBrief?.targetAspectRatio,
          style: job.inputBrief?.styleDirection,
        });

        if (result.imageUrl) {
          // Score the image quality
          const score = await this.contentEngine.scoreImageQuality(result.imageUrl);

          const outputAsset = {
            url: result.imageUrl,
            promptUsed: prompt,
            score: score.overall,
            style: job.inputBrief?.styleDirection,
            aspectRatio: job.inputBrief?.targetAspectRatio,
            generatedAt: new Date(),
          };

          job.outputAssets.push(outputAsset);
          job.progress.completed += 1;
          results.push(outputAsset);
        } else {
          job.progress.failed += 1;
        }

        await job.save();
      } catch (error) {
        console.error(`❌ [IMAGE-ORCH] Error generating image ${i + 1}:`, error.message);
        job.progress.failed += 1;
        await job.save();
      }
    }

    // Update final status
    job.status = job.progress.failed === job.progress.total ? 'failed' : 'completed';
    await job.save();

    console.log('✅ [IMAGE-ORCH] Job completed:', jobId, 
      `Success: ${job.progress.completed}, Failed: ${job.progress.failed}`);

    return { job, results };
  }
}

module.exports = ImageOrchestrator;