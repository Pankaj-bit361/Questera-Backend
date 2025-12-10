const Profile = require('../models/profile');
const Memory = require('../models/memory');
const ReferenceAsset = require('../models/referenceAsset');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');

class MemoryService {
  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucketName = process.env.AWS_S3_BUCKET_NAME;
  }

  /**
   * Get the active profile for a user
   */
  async getActiveProfile(userId) {
    let profile = await Profile.findOne({ userId, isActive: true });

    // Auto-create default profile if none exists
    if (!profile) {
      profile = await Profile.create({
        userId,
        type: 'personal',
        name: 'My Profile',
        isActive: true,
      });
    }

    return profile;
  }

  /**
   * Get or create profile with optional initial data
   */
  async getOrCreateProfile(userId, initialData = {}) {
    let profile = await Profile.findOne({ userId, isActive: true });

    if (!profile) {
      profile = await Profile.create({
        userId,
        type: initialData.type || 'personal',
        name: initialData.name || 'My Profile',
        description: initialData.description,
        niche: initialData.niche,
        goals: initialData.goals || [],
        toneOfVoice: initialData.toneOfVoice || [],
        visualStyle: initialData.visualStyle || {},
        platforms: initialData.platforms || ['instagram'],
        isActive: true,
      });
    }

    return profile;
  }

  /**
   * Update profile from chat insights
   */
  async updateProfileFromChat(userId, insights) {
    const profile = await this.getActiveProfile(userId);

    if (insights.niche) profile.niche = insights.niche;
    if (insights.goals?.length) profile.goals = [...new Set([...profile.goals, ...insights.goals])];
    if (insights.toneOfVoice?.length) profile.toneOfVoice = [...new Set([...profile.toneOfVoice, ...insights.toneOfVoice])];
    if (insights.visualStyle) {
      profile.visualStyle = {
        keywords: [...new Set([...(profile.visualStyle?.keywords || []), ...(insights.visualStyle.keywords || [])])],
        colors: [...new Set([...(profile.visualStyle?.colors || []), ...(insights.visualStyle.colors || [])])],
        mood: [...new Set([...(profile.visualStyle?.mood || []), ...(insights.visualStyle.mood || [])])],
      };
    }
    if (insights.platforms?.length) profile.platforms = [...new Set([...profile.platforms, ...insights.platforms])];

    await profile.save();
    return profile;
  }

  /**
   * Get all memories for a user, optionally filtered
   */
  async getMemories(userId, options = {}) {
    const query = { userId };
    if (options.profileId) query.profileId = options.profileId;
    if (options.type) query.type = options.type;
    if (options.minImportance) query.importance = { $gte: options.minImportance };

    const memories = await Memory.find(query)
      .sort({ importance: -1, updatedAt: -1 })
      .limit(options.limit || 50);

    return memories;
  }

  /**
   * Add or update a memory
   */
  async addMemory(userId, memoryData) {
    const { type, key, importance = 3, profileId, source = 'chat' } = memoryData;

    // Ensure value is always a string (AI sometimes returns arrays)
    let value = memoryData.value;
    if (Array.isArray(value)) {
      value = value.join(', ');
    } else if (typeof value !== 'string') {
      value = String(value);
    }

    // Check if similar memory exists
    let memory = await Memory.findOne({ userId, type, key });

    if (memory) {
      memory.value = value;
      memory.importance = Math.max(memory.importance, importance);
      memory.useCount += 1;
      memory.lastUsedAt = new Date();
      await memory.save();
    } else {
      memory = await Memory.create({
        userId,
        profileId,
        type,
        key,
        value,
        importance,
        source,
      });
    }

    return memory;
  }

  /**
   * Batch add memories extracted from chat
   */
  async addMemoriesFromChat(userId, profileId, memories) {
    const results = [];
    for (const mem of memories) {
      const result = await this.addMemory(userId, { ...mem, profileId, source: 'chat' });
      results.push(result);
    }
    return results;
  }

  /**
   * Upload and attach reference image
   */
  async uploadToS3(buffer, mimeType, folder = 'references') {
    const extension = mimeType?.split('/')[1] || 'png';
    const fileName = `${folder}/${uuidv4()}.${extension}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: mimeType,
    }));

    return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
  }

  /**
   * Attach reference images to user profile
   */
  async attachReferenceImages(userId, images, options = {}) {
    const profile = await this.getActiveProfile(userId);
    const results = [];

    for (const image of images) {
      let url = image.url;

      // If base64 data provided, upload to S3
      if (image.data) {
        const buffer = Buffer.from(image.data, 'base64');
        url = await this.uploadToS3(buffer, image.mimeType);
      }

      const asset = await ReferenceAsset.create({
        userId,
        profileId: profile.profileId,
        type: image.type || options.type || 'face',
        url,
        tags: image.tags || options.tags || [],
        meta: {
          filename: image.filename,
          mimeType: image.mimeType,
          description: image.description,
        },
        isPrimary: image.isPrimary || false,
      });

      // Update profile with primary image if applicable
      if (asset.isPrimary) {
        if (asset.type === 'face') {
          profile.primaryFaceImageUrl = url;
        } else if (asset.type === 'product') {
          profile.primaryProductImageUrl = url;
        }
        await profile.save();
      }

      results.push(asset);
    }

    return results;
  }

  /**
   * Get reference assets for a user
   */
  async getReferenceAssets(userId, options = {}) {
    const query = { userId, isActive: true };
    if (options.type) query.type = options.type;
    if (options.profileId) query.profileId = options.profileId;

    return await ReferenceAsset.find(query).sort({ isPrimary: -1, createdAt: -1 });
  }

  /**
   * Get primary reference image (face or product)
   */
  async getPrimaryReferenceImage(userId, type = 'face') {
    return await ReferenceAsset.findOne({
      userId,
      type,
      isActive: true,
      isPrimary: true,
    });
  }

  /**
   * Build context string for LLM from memories and profile
   * @param {string} userId
   * @param {object} options - { includeMemories: true, onlyPreferences: false }
   */
  async buildContextForLLM(userId, options = {}) {
    const { includeMemories = true, onlyPreferences = false } = options;
    const profile = await this.getActiveProfile(userId);

    let context = '';

    // Profile context (always include basic profile info)
    if (profile) {
      context += `\n## User Profile\n`;
      context += `Type: ${profile.type}\n`;
      if (profile.name) context += `Name: ${profile.name}\n`;
      if (profile.niche) context += `Niche: ${profile.niche}\n`;
      if (profile.goals?.length) context += `Goals: ${profile.goals.join(', ')}\n`;
      if (profile.toneOfVoice?.length) context += `Tone: ${profile.toneOfVoice.join(', ')}\n`;
      if (profile.visualStyle?.keywords?.length) context += `Visual Style: ${profile.visualStyle.keywords.join(', ')}\n`;
      if (profile.visualStyle?.mood?.length) context += `Mood: ${profile.visualStyle.mood.join(', ')}\n`;
      if (profile.platforms?.length) context += `Platforms: ${profile.platforms.join(', ')}\n`;
    }

    // Memory context - optionally include and filter
    if (includeMemories) {
      const memories = await this.getMemories(userId, { minImportance: 2, limit: 30 });

      // If onlyPreferences, filter to only preference/style type memories (not facts/context)
      const filteredMemories = onlyPreferences
        ? memories.filter(m => ['preference', 'style', 'goal'].includes(m.type))
        : memories;

      if (filteredMemories.length > 0) {
        context += `\n## Known Preferences & Facts\n`;
        const groupedMemories = {};
        for (const mem of filteredMemories) {
          if (!groupedMemories[mem.type]) groupedMemories[mem.type] = [];
          groupedMemories[mem.type].push(`${mem.key}: ${mem.value}`);
        }
        for (const [type, items] of Object.entries(groupedMemories)) {
          context += `\n### ${type.charAt(0).toUpperCase() + type.slice(1)}s\n`;
          items.forEach(item => context += `- ${item}\n`);
        }
      }
    }

    return context;
  }
}

module.exports = MemoryService;