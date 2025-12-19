const axios = require('axios');
const SocialAccount = require('../models/socialAccount');

/**
 * Instagram Service
 * Handles Instagram Graph API integration for posting and account management
 * 
 * Instagram posting requires:
 * 1. Facebook App with Instagram Graph API permissions
 * 2. Instagram Business/Creator Account connected to Facebook Page
 * 3. Page Access Token with instagram_content_publish permission
 */
class InstagramService {
  constructor() {
    this.graphApiVersion = 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.graphApiVersion}`;
  }

  /**
   * Get OAuth URL for connecting Instagram account
   */
  getOAuthUrl(redirectUri, state) {
    const clientId = process.env.FACEBOOK_APP_ID;
    const scopes = [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights',
      'pages_show_list',
      'pages_read_engagement',
    ].join(',');

    return `https://www.facebook.com/${this.graphApiVersion}/dialog/oauth?` +
      `client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scopes}&state=${state}&response_type=code`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code, redirectUri) {
    try {
      const response = await axios.get(`${this.baseUrl}/oauth/access_token`, {
        params: {
          client_id: process.env.FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET,
          redirect_uri: redirectUri,
          code,
        },
      });

      return response.data;
    } catch (error) {
      console.error('❌ [INSTAGRAM] Token exchange failed:', error.response?.data || error.message);
      throw new Error('Failed to exchange code for token');
    }
  }

  /**
   * Get long-lived access token (valid for 60 days)
   */
  async getLongLivedToken(shortLivedToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: process.env.FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET,
          fb_exchange_token: shortLivedToken,
        },
      });

      return response.data;
    } catch (error) {
      console.error('❌ [INSTAGRAM] Long-lived token failed:', error.response?.data || error.message);
      throw new Error('Failed to get long-lived token');
    }
  }

  /**
   * Get Facebook Pages connected to user's account
   */
  async getPages(accessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/me/accounts`, {
        params: { access_token: accessToken },
      });

      return response.data.data || [];
    } catch (error) {
      console.error('❌ [INSTAGRAM] Get pages failed:', error.response?.data || error.message);
      throw new Error('Failed to get Facebook pages');
    }
  }

  /**
   * Get Instagram Business Account connected to a Facebook Page
   */
  async getInstagramAccount(pageId, pageAccessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/${pageId}`, {
        params: {
          fields: 'instagram_business_account{id,username,profile_picture_url,followers_count}',
          access_token: pageAccessToken,
        },
      });

      return response.data.instagram_business_account || null;
    } catch (error) {
      console.error('❌ [INSTAGRAM] Get IG account failed:', error.response?.data || error.message);
      throw new Error('Failed to get Instagram account');
    }
  }

  /**
   * Connect Instagram account - full OAuth flow completion
   */
  async connectAccount(userId, code, redirectUri) {
    console.log('🔗 [INSTAGRAM] Connecting account for user:', userId);

    // Step 1: Exchange code for short-lived token
    const tokenData = await this.exchangeCodeForToken(code, redirectUri);

    // Step 2: Get long-lived token
    const longLivedData = await this.getLongLivedToken(tokenData.access_token);

    // Step 3: Get Facebook pages
    const pages = await this.getPages(longLivedData.access_token);

    if (pages.length === 0) {
      throw new Error('No Facebook pages found. Please connect a Facebook Page first.');
    }

    // Step 4: Get Instagram account from first page (or let user choose)
    const page = pages[0];
    const igAccount = await this.getInstagramAccount(page.id, page.access_token);

    if (!igAccount) {
      throw new Error('No Instagram Business Account connected to this Facebook Page.');
    }

    // Step 5: Save to database
    const account = await SocialAccount.findOneAndUpdate(
      { userId, platform: 'instagram', platformUserId: igAccount.id },
      {
        userId,
        platform: 'instagram',
        platformUserId: igAccount.id,
        platformUsername: igAccount.username,
        accessToken: longLivedData.access_token,
        tokenExpiresAt: new Date(Date.now() + (longLivedData.expires_in || 5184000) * 1000),
        instagramBusinessAccountId: igAccount.id,
        facebookPageId: page.id,
        facebookPageAccessToken: page.access_token,
        profilePictureUrl: igAccount.profile_picture_url,
        followersCount: igAccount.followers_count,
        isActive: true,
        lastSyncedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log('✅ [INSTAGRAM] Account connected:', igAccount.username);
    return account;
  }

  /**
   * Post a single image to Instagram
   * Two-step process: 1) Create container 2) Publish container
   */
  async postImage(socialAccountId, imageUrl, caption) {
    const account = await SocialAccount.findOne({ accountId: socialAccountId, platform: 'instagram' });

    if (!account || !account.isActive) {
      throw new Error('Instagram account not found or inactive');
    }

    const igAccountId = account.instagramBusinessAccountId;
    const accessToken = account.facebookPageAccessToken || account.accessToken;

    console.log('📸 [INSTAGRAM] Creating media container...');

    // Step 1: Create media container
    const containerResponse = await axios.post(
      `${this.baseUrl}/${igAccountId}/media`,
      null,
      {
        params: {
          image_url: imageUrl,
          caption: caption,
          access_token: accessToken,
        },
      }
    );

    const containerId = containerResponse.data.id;
    console.log('📦 [INSTAGRAM] Container created:', containerId);

    // Step 2: Wait for container to be ready (Instagram processes the image)
    await this.waitForContainerReady(containerId, accessToken);

    // Step 3: Publish the container
    console.log('🚀 [INSTAGRAM] Publishing post...');
    const publishResponse = await axios.post(
      `${this.baseUrl}/${igAccountId}/media_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: accessToken,
        },
      }
    );

    const mediaId = publishResponse.data.id;
    console.log('✅ [INSTAGRAM] Post published! Media ID:', mediaId);

    // Get permalink
    const mediaInfo = await this.getMediaInfo(mediaId, accessToken);

    return {
      success: true,
      mediaId,
      permalink: mediaInfo.permalink,
      timestamp: mediaInfo.timestamp,
    };
  }

  /**
   * Wait for media container to be ready
   */
  async waitForContainerReady(containerId, accessToken, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      const response = await axios.get(`${this.baseUrl}/${containerId}`, {
        params: {
          fields: 'status_code',
          access_token: accessToken,
        },
      });

      const status = response.data.status_code;

      if (status === 'FINISHED') {
        return true;
      } else if (status === 'ERROR') {
        throw new Error('Instagram media processing failed');
      }

      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    throw new Error('Instagram media processing timeout');
  }

  /**
   * Get media info after posting
   */
  async getMediaInfo(mediaId, accessToken) {
    const response = await axios.get(`${this.baseUrl}/${mediaId}`, {
      params: {
        fields: 'id,permalink,timestamp,like_count,comments_count',
        access_token: accessToken,
      },
    });

    return response.data;
  }

  /**
   * Post carousel (multiple images)
   */
  async postCarousel(socialAccountId, imageUrls, caption) {
    const account = await SocialAccount.findOne({ accountId: socialAccountId, platform: 'instagram' });

    if (!account || !account.isActive) {
      throw new Error('Instagram account not found or inactive');
    }

    const igAccountId = account.instagramBusinessAccountId;
    const accessToken = account.facebookPageAccessToken || account.accessToken;

    console.log('🎠 [INSTAGRAM] Creating carousel with', imageUrls.length, 'images');

    // Step 1: Create child containers for each image
    const childContainerIds = [];
    for (const imageUrl of imageUrls) {
      const response = await axios.post(
        `${this.baseUrl}/${igAccountId}/media`,
        null,
        {
          params: {
            image_url: imageUrl,
            is_carousel_item: true,
            access_token: accessToken,
          },
        }
      );
      childContainerIds.push(response.data.id);
    }

    // Wait for all children to be ready
    for (const childId of childContainerIds) {
      await this.waitForContainerReady(childId, accessToken);
    }

    // Step 2: Create carousel container
    const carouselResponse = await axios.post(
      `${this.baseUrl}/${igAccountId}/media`,
      null,
      {
        params: {
          media_type: 'CAROUSEL',
          children: childContainerIds.join(','),
          caption: caption,
          access_token: accessToken,
        },
      }
    );

    const carouselContainerId = carouselResponse.data.id;
    await this.waitForContainerReady(carouselContainerId, accessToken);

    // Step 3: Publish carousel
    const publishResponse = await axios.post(
      `${this.baseUrl}/${igAccountId}/media_publish`,
      null,
      {
        params: {
          creation_id: carouselContainerId,
          access_token: accessToken,
        },
      }
    );

    const mediaId = publishResponse.data.id;
    console.log('✅ [INSTAGRAM] Carousel published! Media ID:', mediaId);

    const mediaInfo = await this.getMediaInfo(mediaId, accessToken);

    return {
      success: true,
      mediaId,
      permalink: mediaInfo.permalink,
      timestamp: mediaInfo.timestamp,
    };
  }

  /**
   * Post a Reel (video) to Instagram
   * Uses the Reels API for video content
   * Video must be accessible via public URL
   */
  async postReel(socialAccountId, videoUrl, caption, options = {}) {
    const account = await SocialAccount.findOne({ accountId: socialAccountId, platform: 'instagram' });

    if (!account || !account.isActive) {
      throw new Error('Instagram account not found or inactive');
    }

    const igAccountId = account.instagramBusinessAccountId;
    const accessToken = account.facebookPageAccessToken || account.accessToken;

    console.log('🎬 [INSTAGRAM] Creating Reel container...');
    console.log('📹 [INSTAGRAM] Video URL:', videoUrl);

    // Step 1: Create video container for Reel
    const containerParams = {
      video_url: videoUrl,
      media_type: 'REELS',
      caption: caption,
      access_token: accessToken,
      share_to_feed: options.shareToFeed !== false, // Default: true
    };

    // Optional: Add cover image
    if (options.coverUrl) {
      containerParams.cover_url = options.coverUrl;
    }

    // Optional: Add thumbnail time offset (in ms)
    if (options.thumbOffset) {
      containerParams.thumb_offset = options.thumbOffset;
    }

    const containerResponse = await axios.post(
      `${this.baseUrl}/${igAccountId}/media`,
      null,
      { params: containerParams }
    );

    const containerId = containerResponse.data.id;
    console.log('📦 [INSTAGRAM] Reel container created:', containerId);

    // Step 2: Wait for video processing (videos take longer than images)
    await this.waitForContainerReady(containerId, accessToken, 30); // 30 attempts = ~60 seconds max

    // Step 3: Publish the Reel
    console.log('🚀 [INSTAGRAM] Publishing Reel...');
    const publishResponse = await axios.post(
      `${this.baseUrl}/${igAccountId}/media_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: accessToken,
        },
      }
    );

    const mediaId = publishResponse.data.id;
    console.log('✅ [INSTAGRAM] Reel published! Media ID:', mediaId);

    // Get permalink
    const mediaInfo = await this.getMediaInfo(mediaId, accessToken);

    return {
      success: true,
      mediaId,
      permalink: mediaInfo.permalink,
      timestamp: mediaInfo.timestamp,
      type: 'reel',
    };
  }

  /**
   * Post a Story (image or video)
   */
  async postStory(socialAccountId, mediaUrl, isVideo = false) {
    const account = await SocialAccount.findOne({ accountId: socialAccountId, platform: 'instagram' });

    if (!account || !account.isActive) {
      throw new Error('Instagram account not found or inactive');
    }

    const igAccountId = account.instagramBusinessAccountId;
    const accessToken = account.facebookPageAccessToken || account.accessToken;

    console.log('📖 [INSTAGRAM] Creating Story container...');

    const containerParams = {
      media_type: 'STORIES',
      access_token: accessToken,
    };

    if (isVideo) {
      containerParams.video_url = mediaUrl;
    } else {
      containerParams.image_url = mediaUrl;
    }

    const containerResponse = await axios.post(
      `${this.baseUrl}/${igAccountId}/media`,
      null,
      { params: containerParams }
    );

    const containerId = containerResponse.data.id;
    console.log('📦 [INSTAGRAM] Story container created:', containerId);

    // Wait for processing
    await this.waitForContainerReady(containerId, accessToken, isVideo ? 30 : 10);

    // Publish
    console.log('🚀 [INSTAGRAM] Publishing Story...');
    const publishResponse = await axios.post(
      `${this.baseUrl}/${igAccountId}/media_publish`,
      null,
      {
        params: {
          creation_id: containerId,
          access_token: accessToken,
        },
      }
    );

    const mediaId = publishResponse.data.id;
    console.log('✅ [INSTAGRAM] Story published! Media ID:', mediaId);

    return {
      success: true,
      mediaId,
      type: 'story',
    };
  }

  /**
   * Get engagement metrics for a post
   */
  async getPostInsights(mediaId, accessToken) {
    try {
      const response = await axios.get(`${this.baseUrl}/${mediaId}/insights`, {
        params: {
          metric: 'engagement,impressions,reach,saved',
          access_token: accessToken,
        },
      });

      const metrics = {};
      for (const item of response.data.data || []) {
        metrics[item.name] = item.values[0]?.value || 0;
      }

      return metrics;
    } catch (error) {
      console.error('❌ [INSTAGRAM] Get insights failed:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * Get user's connected Instagram accounts
   */
  async getConnectedAccounts(userId) {
    return SocialAccount.find({ userId, platform: 'instagram', isActive: true });
  }

  /**
   * Disconnect Instagram account
   */
  async disconnectAccount(userId, accountId) {
    const account = await SocialAccount.findOneAndUpdate(
      { userId, accountId },
      { isActive: false },
      { new: true }
    );

    return account;
  }

  /**
   * Refresh access token (should be done before expiry)
   */
  async refreshToken(accountId) {
    const account = await SocialAccount.findOne({ accountId });

    if (!account) {
      throw new Error('Account not found');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: process.env.FACEBOOK_APP_ID,
          client_secret: process.env.FACEBOOK_APP_SECRET,
          fb_exchange_token: account.accessToken,
        },
      });

      account.accessToken = response.data.access_token;
      account.tokenExpiresAt = new Date(Date.now() + (response.data.expires_in || 5184000) * 1000);
      await account.save();

      console.log('🔄 [INSTAGRAM] Token refreshed for:', account.platformUsername);
      return account;
    } catch (error) {
      console.error('❌ [INSTAGRAM] Token refresh failed:', error.response?.data || error.message);
      account.connectionError = {
        message: 'Token refresh failed',
        code: error.response?.data?.error?.code,
        occurredAt: new Date(),
      };
      await account.save();
      throw error;
    }
  }
}

module.exports = InstagramService;

