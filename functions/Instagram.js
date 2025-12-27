const Instagram = require('../models/instagram');
const axios = require('axios');

class InstagramController {
  constructor() {
    this.appId = process.env.INSTAGRAM_APP_ID;
    this.appSecret = process.env.INSTAGRAM_APP_SECRET;
    this.redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
    this.apiVersion = 'v20.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Wait for media container to be ready
   * Instagram processes media async, so we need to poll for status
   */
  async waitForContainerReady(containerId, accessToken, maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(
          `${this.baseUrl}/${containerId}?fields=status_code&access_token=${accessToken}`
        );
        const data = await response.json();

        const status = data.status_code;
        // Log full response on first attempt or if undefined
        if (i === 0 || status === undefined) {
          console.log(`📦 [INSTAGRAM] Container ${containerId} full response:`, JSON.stringify(data));
        }
        console.log(`📦 [INSTAGRAM] Container ${containerId} status: ${status} (attempt ${i + 1}/${maxAttempts})`);

        if (status === 'FINISHED') {
          return true;
        } else if (status === 'ERROR') {
          throw new Error('Instagram media processing failed');
        }

        // Wait 2 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err) {
        console.log(`⚠️ [INSTAGRAM] Error checking container status:`, err.message);
        // Continue trying
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error('Instagram media processing timeout');
  }

  /**
   * Get OAuth URL for user to connect Instagram
   * Uses Meta Graph API via Facebook OAuth (full features, requires FB Page)
   */
  getOAuthUrl(req, res) {
    try {
      const state = `graph_${Math.random().toString(36).substring(7)}`;

      // Meta Graph API via Facebook OAuth (full features)
      const scope = 'pages_show_list,instagram_basic,instagram_manage_comments,instagram_content_publish,pages_read_engagement,business_management,instagram_manage_insights';
      const oauthUrl = `https://www.facebook.com/${this.apiVersion}/dialog/oauth?` +
        `client_id=${this.appId}` +
        `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
        `&scope=${scope}` +
        `&response_type=code` +
        `&state=${state}`;

      console.log('🔐 [INSTAGRAM] Generated Graph API OAuth URL');

      return { status: 200, json: { success: true, oauthUrl, state, type: 'graph' } };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error generating OAuth URL:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Handle OAuth callback and exchange code for token
   * Uses Facebook Graph API flow
   */
  async handleCallback(req, res) {
    try {
      const { code, state, userId } = req.body;

      if (!code || !userId) {
        return { status: 400, json: { error: 'Code and userId are required' } };
      }

      console.log('🔐 [INSTAGRAM] Exchanging code for access token (Graph API)...');

      // Step 1: Exchange code for short-lived access token via Facebook Graph API
      const tokenUrl = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?` +
        `client_id=${this.appId}` +
        `&redirect_uri=${encodeURIComponent(this.redirectUri)}` +
        `&client_secret=${this.appSecret}` +
        `&code=${code}`;

      const tokenResponse = await fetch(tokenUrl);
      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token) {
        console.error('❌ [INSTAGRAM] Token exchange failed:', tokenData);
        return { status: 400, json: { error: 'Failed to get access token', details: tokenData } };
      }

      console.log('✅ [INSTAGRAM] Got short-lived access token');

      // Step 2: Exchange for long-lived token
      const longLivedUrl = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${this.appId}` +
        `&client_secret=${this.appSecret}` +
        `&fb_exchange_token=${tokenData.access_token}`;

      const longLivedResponse = await fetch(longLivedUrl);
      const longLivedData = await longLivedResponse.json();
      const accessToken = longLivedData.access_token || tokenData.access_token;

      console.log('✅ [INSTAGRAM] Got long-lived access token');

      // Step 3: Get Facebook Pages the user manages
      const pagesResponse = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/me/accounts?access_token=${accessToken}`
      );
      const pagesData = await pagesResponse.json();

      console.log('📄 [INSTAGRAM] Raw pages response:', JSON.stringify(pagesData, null, 2));

      if (!pagesData.data || pagesData.data.length === 0) {
        return { status: 400, json: { error: 'No Facebook Pages found. You need a Facebook Page linked to your Instagram Business account.' } };
      }

      console.log('✅ [INSTAGRAM] Found Facebook Pages:', pagesData.data.length);
      console.log('📄 [INSTAGRAM] Page names:', pagesData.data.map(p => p.name).join(', '));

      // Step 4: Find ALL Pages that have IG Business Accounts linked
      const igLinkedPages = [];

      for (const page of pagesData.data) {
        console.log(`🔍 [INSTAGRAM] Checking page: ${page.name} (ID: ${page.id})`);

        const pageData = await fetch(
          `https://graph.facebook.com/${this.apiVersion}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
        ).then(res => res.json());

        console.log(`🔍 [INSTAGRAM] Page ${page.name} IG data:`, JSON.stringify(pageData));

        if (pageData.instagram_business_account?.id) {
          igLinkedPages.push({
            ...page,
            igId: pageData.instagram_business_account.id
          });
          console.log(`✅ [INSTAGRAM] Found IG-linked Page: ${page.name} (ID: ${page.id}) → IG: ${pageData.instagram_business_account.id}`);
        } else {
          console.log(`⏭️ [INSTAGRAM] Skipping Page: ${page.name} - No IG Business Account`);
        }
      }

      console.log(`📊 [INSTAGRAM] Total IG-linked pages found: ${igLinkedPages.length}`);

      if (igLinkedPages.length === 0) {
        return {
          status: 400,
          json: {
            error: 'No Instagram Business Account connected to any of your Facebook Pages. Please connect your Instagram Business account to a Facebook Page first.'
          }
        };
      }

      // Connect ALL IG-linked pages (not just the first one)
      let userDoc = await Instagram.findOne({ userId });
      const connectedAccounts = [];

      for (const selectedPage of igLinkedPages) {
        const pageAccessToken = selectedPage.access_token;
        const igBusinessAccountId = selectedPage.igId;

        console.log('📌 [INSTAGRAM] Processing Page:', selectedPage.name);
        console.log('📌 [INSTAGRAM] IG Business Account ID:', igBusinessAccountId);

        // Step 5: Get Instagram account details
        const igDetailsResponse = await fetch(
          `https://graph.facebook.com/${this.apiVersion}/${igBusinessAccountId}?fields=id,username,name,profile_picture_url&access_token=${pageAccessToken}`
        );
        const igDetails = await igDetailsResponse.json();

        console.log('✅ [INSTAGRAM] Got IG account details:', igDetails.username);

        // Build account object
        const newAccount = {
          instagramBusinessAccountId: igBusinessAccountId,
          facebookPageId: selectedPage.id,
          facebookPageName: selectedPage.name,
          accessToken: pageAccessToken,
          instagramUsername: igDetails.username,
          instagramName: igDetails.name || igDetails.username,
          profilePictureUrl: igDetails.profile_picture_url,
          isConnected: true,
          connectedAt: new Date(),
        };

        connectedAccounts.push(newAccount);
      }

      // Step 6: Save ALL accounts to database
      console.log('📦 [INSTAGRAM] Existing userDoc:', userDoc ? 'Found' : 'Not found');
      console.log('📦 [INSTAGRAM] Existing accounts array:', userDoc?.accounts?.length || 0);
      console.log('📦 [INSTAGRAM] New accounts to add:', connectedAccounts.length);

      if (!userDoc) {
        // Create new document with all accounts
        console.log('📦 [INSTAGRAM] Creating new user document with', connectedAccounts.length, 'accounts...');
        userDoc = await Instagram.create({
          userId,
          accounts: connectedAccounts,
          // Also save legacy fields with first account for backward compatibility
          ...connectedAccounts[0],
          lastTokenRefresh: new Date(),
        });
      } else {
        // Initialize accounts array if it doesn't exist (legacy data migration)
        if (!userDoc.accounts || !Array.isArray(userDoc.accounts)) {
          console.log('📦 [INSTAGRAM] Initializing accounts array (legacy migration)...');
          userDoc.accounts = [];

          // If there's legacy data, migrate it to accounts array
          if (userDoc.instagramBusinessAccountId) {
            console.log('📦 [INSTAGRAM] Migrating legacy account:', userDoc.instagramUsername);
            userDoc.accounts.push({
              instagramBusinessAccountId: userDoc.instagramBusinessAccountId,
              facebookPageId: userDoc.facebookPageId,
              facebookPageName: userDoc.facebookPageName,
              accessToken: userDoc.accessToken,
              instagramUsername: userDoc.instagramUsername,
              instagramName: userDoc.instagramName,
              profilePictureUrl: userDoc.profilePictureUrl,
              isConnected: userDoc.isConnected,
              connectedAt: userDoc.connectedAt || new Date(),
            });
          }
        }

        // Add or update each account
        for (const newAccount of connectedAccounts) {
          const existingIdx = userDoc.accounts.findIndex(
            acc => acc.instagramBusinessAccountId === newAccount.instagramBusinessAccountId
          );

          if (existingIdx >= 0) {
            // Update existing account
            userDoc.accounts[existingIdx] = newAccount;
            console.log('✅ [INSTAGRAM] Updated existing account:', newAccount.instagramUsername);
          } else {
            // Add new account
            userDoc.accounts.push(newAccount);
            console.log('✅ [INSTAGRAM] Added new account:', newAccount.instagramUsername);
          }
        }

        // Update legacy fields with the first new account for backward compatibility
        const firstAccount = connectedAccounts[0];
        userDoc.instagramBusinessAccountId = firstAccount.instagramBusinessAccountId;
        userDoc.facebookPageId = firstAccount.facebookPageId;
        userDoc.facebookPageName = firstAccount.facebookPageName;
        userDoc.accessToken = firstAccount.accessToken;
        userDoc.instagramUsername = firstAccount.instagramUsername;
        userDoc.instagramName = firstAccount.instagramName;
        userDoc.profilePictureUrl = firstAccount.profilePictureUrl;
        userDoc.isConnected = true;
        userDoc.lastTokenRefresh = new Date();

        await userDoc.save();
      }

      console.log('✅ [INSTAGRAM] Instagram accounts connected for user:', userId);
      console.log('✅ [INSTAGRAM] Total accounts:', userDoc.accounts.length);
      console.log('✅ [INSTAGRAM] All usernames:', userDoc.accounts.map(a => a.instagramUsername).join(', '));

      return {
        status: 200,
        json: {
          success: true,
          message: `${connectedAccounts.length} Instagram account(s) connected successfully`,
          connectedAccounts: connectedAccounts.map(a => ({
            username: a.instagramUsername,
            name: a.instagramName,
            profilePictureUrl: a.profilePictureUrl,
          })),
          totalAccounts: userDoc.accounts.length,
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error in callback:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Get all connected Instagram accounts for a user
   */
  async getInstagramInfo(req) {
    try {
      const { userId } = req.params;

      console.log('📋 [INSTAGRAM] Getting info for user:', userId);

      const instagram = await Instagram.findOne({ userId });

      if (!instagram) {
        console.log('📋 [INSTAGRAM] No document found for user');
        return { status: 404, json: { error: 'Instagram account not connected' } };
      }

      console.log('📋 [INSTAGRAM] Document found, accounts:', instagram.accounts?.length || 0);

      // Handle legacy data - if no accounts array but has legacy fields
      let accounts = [];

      if (instagram.accounts && Array.isArray(instagram.accounts) && instagram.accounts.length > 0) {
        accounts = instagram.accounts
          .filter(acc => acc.isConnected)
          .map(acc => ({
            id: acc.instagramBusinessAccountId,
            username: acc.instagramUsername,
            name: acc.instagramName,
            profilePictureUrl: acc.profilePictureUrl,
            facebookPageName: acc.facebookPageName,
            connectedAt: acc.connectedAt,
            // Include connection type for feature gating
            connectionType: acc.connectionType || 'graph', // Default to 'graph' for legacy accounts
          }));
      } else if (instagram.instagramBusinessAccountId && instagram.isConnected) {
        // Legacy data - return as single account
        console.log('📋 [INSTAGRAM] Using legacy data for account');
        accounts = [{
          id: instagram.instagramBusinessAccountId,
          username: instagram.instagramUsername,
          name: instagram.instagramName,
          profilePictureUrl: instagram.profilePictureUrl,
          facebookPageName: instagram.facebookPageName,
          connectedAt: instagram.connectedAt,
          connectionType: 'graph', // Legacy accounts are always Graph API
        }];
      }

      if (accounts.length === 0) {
        console.log('📋 [INSTAGRAM] No connected accounts found');
        return { status: 404, json: { error: 'Instagram account not connected' } };
      }

      console.log('📋 [INSTAGRAM] Returning accounts:', accounts.map(a => a.username).join(', '));

      return {
        status: 200,
        json: {
          success: true,
          accounts,
          // Legacy single account (for backward compatibility)
          instagram: {
            username: instagram.instagramUsername,
            name: instagram.instagramName,
            profilePictureUrl: instagram.profilePictureUrl,
            isConnected: instagram.isConnected,
            connectedAt: instagram.connectedAt,
          },
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error getting info:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Disconnect a specific Instagram account or all accounts
   */
  async disconnectInstagram(req) {
    try {
      const { userId } = req.params;
      const { accountId } = req.body || {}; // Optional: specific account to disconnect

      const instagram = await Instagram.findOne({ userId });

      if (!instagram) {
        return { status: 404, json: { error: 'No Instagram accounts found' } };
      }

      if (accountId) {
        // Disconnect specific account
        const accIdx = instagram.accounts.findIndex(
          acc => acc.instagramBusinessAccountId === accountId
        );

        if (accIdx >= 0) {
          instagram.accounts[accIdx].isConnected = false;
          await instagram.save();
          console.log('✅ [INSTAGRAM] Account disconnected:', accountId);
        }

        // Check if any accounts are still connected
        const hasConnected = instagram.accounts.some(acc => acc.isConnected);
        if (!hasConnected) {
          instagram.isConnected = false;
          await instagram.save();
        }
      } else {
        // Disconnect all accounts
        instagram.accounts.forEach(acc => { acc.isConnected = false; });
        instagram.isConnected = false;
        await instagram.save();
        console.log('✅ [INSTAGRAM] All accounts disconnected for user:', userId);
      }

      return { status: 200, json: { success: true, message: 'Instagram disconnected' } };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error disconnecting:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Publish image to Instagram
   * Supports multi-account: specify accountId to publish to a specific account
   */
  async publishImage(req) {
    try {
      const { userId, imageUrl, caption, accountId } = req.body;

      if (!userId || !imageUrl) {
        return { status: 400, json: { error: 'userId and imageUrl are required' } };
      }

      // Get Instagram credentials
      const instagram = await Instagram.findOne({ userId });

      console.log('📸 [INSTAGRAM] Looking for userId:', userId);
      console.log('📸 [INSTAGRAM] Instagram doc found:', instagram ? 'Yes' : 'No');

      if (!instagram) {
        return { status: 404, json: { error: 'Instagram account not connected' } };
      }

      console.log('📸 [INSTAGRAM] Accounts array:', instagram.accounts?.length || 0);
      console.log('📸 [INSTAGRAM] Accounts data:', JSON.stringify(instagram.accounts?.map(a => ({
        id: a.instagramBusinessAccountId,
        username: a.instagramUsername,
        isConnected: a.isConnected,
      })), null, 2));

      let account;

      if (accountId) {
        console.log('📸 [INSTAGRAM] Looking for specific accountId:', accountId);
        // Find specific account
        account = instagram.accounts.find(
          acc => acc.instagramBusinessAccountId === accountId && acc.isConnected
        );
      } else {
        console.log('📸 [INSTAGRAM] Looking for first connected account...');
        // Use first connected account
        account = instagram.accounts.find(acc => acc.isConnected);
      }

      console.log('📸 [INSTAGRAM] Account found:', account ? account.instagramUsername : 'None');

      if (!account) {
        // Fallback: try legacy data
        if (instagram.isConnected && instagram.instagramBusinessAccountId) {
          console.log('📸 [INSTAGRAM] Using legacy data as fallback');
          account = {
            instagramBusinessAccountId: instagram.instagramBusinessAccountId,
            accessToken: instagram.accessToken,
            instagramUsername: instagram.instagramUsername,
          };
        } else {
          return { status: 404, json: { error: 'No connected Instagram account found' } };
        }
      }

      const { instagramBusinessAccountId, accessToken, instagramUsername } = account;

      console.log('📸 [INSTAGRAM] Publishing image to Instagram...');
      console.log('📸 [INSTAGRAM] Image URL:', imageUrl);
      console.log('📸 [INSTAGRAM] Account ID:', instagramBusinessAccountId);

      // Facebook Graph API flow
      const baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
      console.log('📸 [INSTAGRAM] Using Facebook Graph API via', baseUrl);

      // Step 1: Create media container
      const containerUrl = `${baseUrl}/${instagramBusinessAccountId}/media`;
      const containerParams = new URLSearchParams({
        image_url: imageUrl,
        caption: caption || 'Created with Velos AI ✨',
        access_token: accessToken,
      });

      console.log('📸 [INSTAGRAM] Container URL:', containerUrl);

      const containerResponse = await fetch(`${containerUrl}?${containerParams}`, {
        method: 'POST',
      });
      const containerData = await containerResponse.json();

      if (containerData.error) {
        console.error('❌ [INSTAGRAM] Container creation failed:', containerData.error);
        return { status: 400, json: { error: containerData.error.message, details: containerData.error } };
      }

      const containerId = containerData.id;
      console.log('✅ [INSTAGRAM] Media container created:', containerId);

      // Step 2: Wait for container to be ready
      let ready = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!ready && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        const statusUrl = `${baseUrl}/${containerId}?fields=status_code&access_token=${accessToken}`;
        const statusResponse = await fetch(statusUrl);
        const statusData = await statusResponse.json();

        console.log('📸 [INSTAGRAM] Container status:', statusData.status_code);

        if (statusData.status_code === 'FINISHED') {
          ready = true;
        } else if (statusData.status_code === 'ERROR') {
          return { status: 400, json: { error: 'Media processing failed' } };
        }

        attempts++;
      }

      if (!ready) {
        return { status: 400, json: { error: 'Media processing timed out' } };
      }

      // Step 3: Publish the container
      const publishUrl = `${baseUrl}/${instagramBusinessAccountId}/media_publish`;
      const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      });

      const publishResponse = await fetch(`${publishUrl}?${publishParams}`, {
        method: 'POST',
      });
      const publishData = await publishResponse.json();

      if (publishData.error) {
        console.error('❌ [INSTAGRAM] Publish failed:', publishData.error);
        return { status: 400, json: { error: publishData.error.message, details: publishData.error } };
      }

      console.log('✅ [INSTAGRAM] Image published! Media ID:', publishData.id);

      // Fetch the permalink for the published media
      let permalink = null;
      try {
        const mediaInfoUrl = `${baseUrl}/${publishData.id}?fields=permalink&access_token=${accessToken}`;
        const mediaInfoResponse = await fetch(mediaInfoUrl);
        const mediaInfo = await mediaInfoResponse.json();
        if (mediaInfo.permalink) {
          permalink = mediaInfo.permalink;
          console.log('✅ [INSTAGRAM] Permalink:', permalink);
        }
      } catch (e) {
        console.log('⚠️ [INSTAGRAM] Could not fetch permalink:', e.message);
      }

      return {
        status: 200,
        json: {
          success: true,
          message: 'Image published to Instagram!',
          mediaId: publishData.id,
          permalink: permalink,
          username: instagramUsername,
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error publishing:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Publish a carousel (multiple images) to Instagram
   */
  async publishCarousel(req) {
    try {
      const { userId, imageUrls, caption, accountId } = req.body;

      if (!userId || !imageUrls || !Array.isArray(imageUrls) || imageUrls.length < 2) {
        return { status: 400, json: { error: 'userId and at least 2 imageUrls are required for carousel' } };
      }

      console.log('🎠 [INSTAGRAM] Publishing Carousel with', imageUrls.length, 'images...');
      console.log('🎠 [INSTAGRAM] All image URLs:');
      imageUrls.forEach((url, i) => console.log(`   ${i + 1}. ${url}`));

      const instagram = await Instagram.findOne({ userId });
      if (!instagram) {
        return { status: 404, json: { error: 'No Instagram accounts found for this user' } };
      }

      // Find the account - check multiple formats
      let account;
      if (instagram.accounts?.length > 0) {
        if (accountId) {
          console.log('🎠 [INSTAGRAM] Looking for specific account:', accountId);
          // Try to find by instagramBusinessAccountId first
          account = instagram.accounts.find(
            acc => acc.instagramBusinessAccountId === accountId && acc.isConnected
          );
          // If not found, try to find by matching connected account (for sa-XXX format)
          if (!account) {
            console.log('🎠 [INSTAGRAM] Account not found by ID, trying first connected...');
            account = instagram.accounts.find(acc => acc.isConnected);
          }
        } else {
          console.log('🎠 [INSTAGRAM] Looking for first connected account...');
          account = instagram.accounts.find(acc => acc.isConnected);
        }
      }

      console.log('🎠 [INSTAGRAM] Account found:', account ? account.instagramUsername : 'None');

      if (!account) {
        // Fallback: try legacy data
        if (instagram.isConnected && instagram.instagramBusinessAccountId) {
          console.log('🎠 [INSTAGRAM] Using legacy data as fallback');
          account = {
            instagramBusinessAccountId: instagram.instagramBusinessAccountId,
            accessToken: instagram.accessToken,
            instagramUsername: instagram.instagramUsername,
          };
        } else {
          return { status: 404, json: { error: 'No connected Instagram account found' } };
        }
      }

      const { instagramBusinessAccountId, accessToken, instagramUsername } = account;
      const baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

      // Step 0: Validate all image URLs are accessible
      console.log('🔍 [INSTAGRAM] Validating image URLs...');
      const validImageUrls = [];
      for (const imageUrl of imageUrls) {
        try {
          const checkResponse = await fetch(imageUrl, { method: 'HEAD' });
          if (checkResponse.ok) {
            validImageUrls.push(imageUrl);
            console.log('✅ [INSTAGRAM] Image valid:', imageUrl.slice(-50));
          } else {
            console.warn('⚠️ [INSTAGRAM] Image not accessible (skipping):', imageUrl.slice(-50));
          }
        } catch (err) {
          console.warn('⚠️ [INSTAGRAM] Image check failed (skipping):', imageUrl.slice(-50), err.message);
        }
      }

      if (validImageUrls.length < 2) {
        return {
          status: 400,
          json: {
            error: `Only ${validImageUrls.length} valid images found. Instagram carousels require at least 2 images.`,
            validUrls: validImageUrls,
            originalCount: imageUrls.length
          }
        };
      }
      console.log(`🎠 [INSTAGRAM] ${validImageUrls.length}/${imageUrls.length} images are valid`);

      // Step 1: Create child containers for each image
      console.log('🎠 [INSTAGRAM] Creating child containers...');
      const childContainerIds = [];

      for (const imageUrl of validImageUrls) {
        const containerUrl = `${baseUrl}/${instagramBusinessAccountId}/media`;
        const containerParams = new URLSearchParams({
          image_url: imageUrl,
          is_carousel_item: 'true',
          access_token: accessToken,
        });

        const containerResponse = await fetch(`${containerUrl}?${containerParams}`, {
          method: 'POST',
        });
        const containerData = await containerResponse.json();

        if (containerData.error) {
          console.error('❌ [INSTAGRAM] Child container creation failed:', containerData.error);
          // Continue with other images instead of failing completely
          console.warn('⚠️ [INSTAGRAM] Skipping this image and continuing...');
          continue;
        }

        childContainerIds.push(containerData.id);
        console.log('📦 [INSTAGRAM] Child container created:', containerData.id);
      }

      if (childContainerIds.length < 2) {
        return {
          status: 400,
          json: {
            error: `Only ${childContainerIds.length} child containers created. Instagram carousels require at least 2.`,
            successfulContainers: childContainerIds.length
          }
        };
      }

      // Wait for all children to be ready
      for (const childId of childContainerIds) {
        await this.waitForContainerReady(childId, accessToken, 20);
      }

      // Step 2: Create carousel container
      console.log('🎠 [INSTAGRAM] Creating carousel container...');
      console.log('🎠 [INSTAGRAM] Child container IDs:', childContainerIds);

      // Instagram API expects parameters as URL query params, NOT form body
      const carouselParams = new URLSearchParams({
        media_type: 'CAROUSEL',
        children: childContainerIds.join(','),
        caption: caption || 'Created with Velos AI ✨',
        access_token: accessToken,
      });

      const carouselUrl = `${baseUrl}/${instagramBusinessAccountId}/media?${carouselParams}`;

      console.log('🎠 [INSTAGRAM] Carousel URL (without token):', `${baseUrl}/${instagramBusinessAccountId}/media?media_type=CAROUSEL&children=${childContainerIds.join(',')}`);

      const carouselResponse = await fetch(carouselUrl, {
        method: 'POST',
      });
      const carouselData = await carouselResponse.json();

      console.log('📦 [INSTAGRAM] Carousel API response:', JSON.stringify(carouselData));
      console.log('📦 [INSTAGRAM] Carousel API response status:', carouselResponse.status);

      if (carouselData.error) {
        console.error('❌ [INSTAGRAM] Carousel container creation failed:', carouselData.error);
        return { status: 400, json: { error: carouselData.error.message, details: carouselData.error } };
      }

      const carouselContainerId = carouselData.id;
      console.log('📦 [INSTAGRAM] Carousel container ID:', carouselContainerId, 'type:', typeof carouselContainerId);

      // Check for invalid/zero ID - Instagram sometimes returns "0" when there's an issue
      // Also check for numeric 0 and string "0"
      const isInvalidId = !carouselContainerId ||
                          carouselContainerId === '0' ||
                          carouselContainerId === 0 ||
                          String(carouselContainerId) === '0';

      console.log('📦 [INSTAGRAM] Is invalid ID?', isInvalidId);

      if (isInvalidId) {
        console.error('❌ [INSTAGRAM] Invalid carousel container ID returned:', carouselData);
        return {
          status: 400,
          json: {
            error: 'Instagram API returned invalid carousel container ID (0). This usually means there was an issue with the request. Check that the access token has proper permissions.',
            details: carouselData,
            childContainerIds: childContainerIds
          }
        };
      }
      console.log('📦 [INSTAGRAM] Carousel container created:', carouselContainerId);

      // Wait for carousel to be ready
      await this.waitForContainerReady(carouselContainerId, accessToken, 30);

      // Step 3: Publish the carousel
      console.log('🚀 [INSTAGRAM] Publishing carousel...');
      const publishUrl = `${baseUrl}/${instagramBusinessAccountId}/media_publish`;
      const publishParams = new URLSearchParams({
        creation_id: carouselContainerId,
        access_token: accessToken,
      });

      const publishResponse = await fetch(`${publishUrl}?${publishParams}`, {
        method: 'POST',
      });
      const publishData = await publishResponse.json();

      if (publishData.error) {
        console.error('❌ [INSTAGRAM] Carousel publish failed:', publishData.error);
        return { status: 400, json: { error: publishData.error.message, details: publishData.error } };
      }

      console.log('✅ [INSTAGRAM] Carousel published! Media ID:', publishData.id);

      // Fetch permalink
      let permalink = null;
      try {
        const mediaInfoUrl = `${baseUrl}/${publishData.id}?fields=permalink&access_token=${accessToken}`;
        const mediaInfoResponse = await fetch(mediaInfoUrl);
        const mediaInfo = await mediaInfoResponse.json();
        if (mediaInfo.permalink) {
          permalink = mediaInfo.permalink;
          console.log('✅ [INSTAGRAM] Permalink:', permalink);
        }
      } catch (e) {
        console.log('⚠️ [INSTAGRAM] Could not fetch permalink:', e.message);
      }

      return {
        status: 200,
        json: {
          success: true,
          message: 'Carousel published to Instagram!',
          mediaId: publishData.id,
          permalink: permalink,
          username: instagramUsername,
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error publishing carousel:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Post a comment on Instagram media
   * Used for "first comment" feature
   */
  async postComment(req) {
    try {
      const { userId, mediaId, comment, accountId } = req.body;

      if (!userId || !mediaId || !comment) {
        return { status: 400, json: { error: 'userId, mediaId, and comment are required' } };
      }

      console.log('💬 [INSTAGRAM] Posting comment on media:', mediaId);

      const instagram = await Instagram.findOne({ userId });
      if (!instagram) {
        return { status: 404, json: { error: 'No Instagram accounts found for this user' } };
      }

      // Find the account - check multiple formats
      let account;
      if (instagram.accounts?.length > 0) {
        if (accountId) {
          console.log('💬 [INSTAGRAM] Looking for specific account:', accountId);
          account = instagram.accounts.find(
            acc => acc.instagramBusinessAccountId === accountId && acc.isConnected
          );
          if (!account) {
            console.log('💬 [INSTAGRAM] Account not found by ID, trying first connected...');
            account = instagram.accounts.find(acc => acc.isConnected);
          }
        } else {
          account = instagram.accounts.find(acc => acc.isConnected);
        }
      }

      if (!account) {
        // Fallback: try legacy data
        if (instagram.isConnected && instagram.accessToken) {
          console.log('💬 [INSTAGRAM] Using legacy data as fallback');
          account = {
            instagramBusinessAccountId: instagram.instagramBusinessAccountId,
            accessToken: instagram.accessToken,
          };
        } else {
          return { status: 404, json: { error: 'No connected Instagram account found' } };
        }
      }

      const { accessToken } = account;
      const baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

      // Post comment using Graph API
      const commentUrl = `${baseUrl}/${mediaId}/comments`;
      const commentParams = new URLSearchParams({
        message: comment,
        access_token: accessToken,
      });

      const commentResponse = await fetch(`${commentUrl}?${commentParams}`, {
        method: 'POST',
      });
      const commentData = await commentResponse.json();

      if (commentData.error) {
        console.error('❌ [INSTAGRAM] Comment failed:', commentData.error);
        return { status: 400, json: { error: commentData.error.message, details: commentData.error } };
      }

      console.log('✅ [INSTAGRAM] Comment posted! Comment ID:', commentData.id);

      return {
        status: 200,
        json: {
          success: true,
          message: 'Comment posted successfully!',
          commentId: commentData.id,
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error posting comment:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Publish a video as Instagram Reel
   * Reels require media_type: 'REELS' and video_url
   */
  async publishReel(req) {
    try {
      const { userId, videoUrl, caption, accountId } = req.body;

      if (!userId || !videoUrl) {
        return { status: 400, json: { error: 'userId and videoUrl are required' } };
      }

      console.log('🎬 [INSTAGRAM] Publishing Reel...');
      console.log('🎬 [INSTAGRAM] Video URL:', videoUrl);

      const instagram = await Instagram.findOne({ userId });
      if (!instagram) {
        return { status: 404, json: { error: 'No Instagram accounts found for this user' } };
      }

      // Find the account
      let account;
      if (accountId) {
        account = instagram.accounts?.find(acc => acc.instagramBusinessAccountId === accountId);
      }
      if (!account && instagram.accounts?.length > 0) {
        account = instagram.accounts[0];
      }
      if (!account) {
        account = {
          instagramBusinessAccountId: instagram.instagramBusinessAccountId,
          accessToken: instagram.accessToken,
          instagramUsername: instagram.instagramUsername,
        };
      }

      const { instagramBusinessAccountId, accessToken, instagramUsername } = account;

      console.log('🎬 [INSTAGRAM] Account ID:', instagramBusinessAccountId);

      const baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

      // Step 1: Create Reel container with media_type: REELS
      const containerUrl = `${baseUrl}/${instagramBusinessAccountId}/media`;
      const containerParams = new URLSearchParams({
        video_url: videoUrl,
        media_type: 'REELS',
        caption: caption || '',
        share_to_feed: 'true',
        access_token: accessToken,
      });

      console.log('🎬 [INSTAGRAM] Creating Reel container...');

      const containerResponse = await axios.post(containerUrl, containerParams.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (!containerResponse.data.id) {
        throw new Error('Failed to create Reel container');
      }

      const containerId = containerResponse.data.id;
      console.log('📦 [INSTAGRAM] Reel container created:', containerId);

      // Step 2: Wait for video processing (videos take longer than images)
      console.log('⏳ [INSTAGRAM] Waiting for video processing...');
      let status = 'IN_PROGRESS';
      let attempts = 0;
      const maxAttempts = 30; // Max 60 seconds (2s per check)

      while (status === 'IN_PROGRESS' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;

        const statusUrl = `${baseUrl}/${containerId}?fields=status_code&access_token=${accessToken}`;
        const statusResponse = await axios.get(statusUrl);
        status = statusResponse.data.status_code;
        console.log(`📊 [INSTAGRAM] Container status (attempt ${attempts}): ${status}`);
      }

      if (status !== 'FINISHED') {
        throw new Error(`Video processing failed or timed out. Status: ${status}`);
      }

      // Step 3: Publish the Reel
      console.log('🚀 [INSTAGRAM] Publishing Reel...');
      const publishUrl = `${baseUrl}/${instagramBusinessAccountId}/media_publish`;
      const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      });

      const publishResponse = await axios.post(publishUrl, publishParams.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const mediaId = publishResponse.data.id;
      console.log('✅ [INSTAGRAM] Reel published! Media ID:', mediaId);

      // Get permalink
      const mediaInfoUrl = `${baseUrl}/${mediaId}?fields=permalink,timestamp&access_token=${accessToken}`;
      const mediaInfoResponse = await axios.get(mediaInfoUrl);
      const permalink = mediaInfoResponse.data.permalink;

      console.log('✅ [INSTAGRAM] Reel permalink:', permalink);

      return {
        status: 200,
        json: {
          success: true,
          mediaId,
          permalink,
          username: instagramUsername,
          type: 'reel',
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error publishing Reel:', error.response?.data || error.message);
      return { status: 500, json: { error: error.response?.data?.error?.message || error.message } };
    }
  }

  /**
   * Publish an image as Instagram Story
   * Stories require media_type: 'STORIES'
   */
  async publishStory(req) {
    try {
      const { userId, imageUrl, accountId } = req.body;

      if (!userId || !imageUrl) {
        return { status: 400, json: { error: 'userId and imageUrl are required' } };
      }

      console.log('📖 [INSTAGRAM] Publishing Story...');

      const instagram = await Instagram.findOne({ userId });
      if (!instagram) {
        return { status: 404, json: { error: 'No Instagram accounts found for this user' } };
      }

      // Find the account
      let account;
      if (accountId) {
        account = instagram.accounts?.find(acc => acc.instagramBusinessAccountId === accountId);
      }
      if (!account && instagram.accounts?.length > 0) {
        account = instagram.accounts[0];
      }
      if (!account) {
        account = {
          instagramBusinessAccountId: instagram.instagramBusinessAccountId,
          accessToken: instagram.accessToken,
          instagramUsername: instagram.instagramUsername,
        };
      }

      const { instagramBusinessAccountId, accessToken, instagramUsername } = account;

      console.log('📖 [INSTAGRAM] Story Image URL:', imageUrl);
      console.log('📖 [INSTAGRAM] Account ID:', instagramBusinessAccountId);

      const baseUrl = `https://graph.facebook.com/${this.apiVersion}`;

      // Step 1: Create Story container with media_type: STORIES
      const containerUrl = `${baseUrl}/${instagramBusinessAccountId}/media`;
      const containerParams = new URLSearchParams({
        image_url: imageUrl,
        media_type: 'STORIES',
        access_token: accessToken,
      });

      console.log('📖 [INSTAGRAM] Creating Story container...');

      const containerResponse = await fetch(`${containerUrl}?${containerParams}`, {
        method: 'POST',
      });
      const containerData = await containerResponse.json();

      if (containerData.error) {
        console.error('❌ [INSTAGRAM] Story container creation failed:', containerData.error);
        return { status: 400, json: { error: containerData.error.message, details: containerData.error } };
      }

      const containerId = containerData.id;
      console.log('✅ [INSTAGRAM] Story container created:', containerId);

      // Step 2: Wait for container to be ready
      let ready = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!ready && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const statusUrl = `${baseUrl}/${containerId}?fields=status_code&access_token=${accessToken}`;
        const statusResponse = await fetch(statusUrl);
        const statusData = await statusResponse.json();

        console.log('📖 [INSTAGRAM] Story container status:', statusData.status_code);

        if (statusData.status_code === 'FINISHED') {
          ready = true;
        } else if (statusData.status_code === 'ERROR') {
          return { status: 400, json: { error: 'Story processing failed' } };
        }

        attempts++;
      }

      if (!ready) {
        return { status: 400, json: { error: 'Story processing timed out' } };
      }

      // Step 3: Publish the Story
      const publishUrl = `${baseUrl}/${instagramBusinessAccountId}/media_publish`;
      const publishParams = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      });

      const publishResponse = await fetch(`${publishUrl}?${publishParams}`, {
        method: 'POST',
      });
      const publishData = await publishResponse.json();

      if (publishData.error) {
        console.error('❌ [INSTAGRAM] Story publish failed:', publishData.error);
        return { status: 400, json: { error: publishData.error.message, details: publishData.error } };
      }

      console.log('✅ [INSTAGRAM] Story published! Media ID:', publishData.id);

      return {
        status: 200,
        json: {
          success: true,
          message: 'Story published to Instagram!',
          mediaId: publishData.id,
          type: 'story',
          username: instagramUsername,
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error publishing story:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Refresh access token before it expires
   * Facebook Page tokens from pages_show_list are long-lived and don't expire
   * But we can refresh the user token if needed
   */
  async refreshToken(req) {
    try {
      const { userId, accountId } = req.body;

      const instagram = await Instagram.findOne({ userId });

      if (!instagram) {
        return { status: 404, json: { error: 'No Instagram accounts found' } };
      }

      let account;
      if (accountId) {
        account = instagram.accounts.find(
          acc => acc.instagramBusinessAccountId === accountId
        );
      } else {
        account = instagram.accounts[0];
      }

      if (!account) {
        return { status: 404, json: { error: 'Account not found' } };
      }

      // Refresh the token
      const refreshUrl = `https://graph.facebook.com/${this.apiVersion}/oauth/access_token?` +
        `grant_type=fb_exchange_token` +
        `&client_id=${this.appId}` +
        `&client_secret=${this.appSecret}` +
        `&fb_exchange_token=${account.accessToken}`;

      const response = await fetch(refreshUrl);
      const data = await response.json();

      if (data.error) {
        console.error('❌ [INSTAGRAM] Token refresh failed:', data.error);
        return { status: 400, json: { error: data.error.message } };
      }

      // Update the token
      account.accessToken = data.access_token;
      instagram.lastTokenRefresh = new Date();
      await instagram.save();

      console.log('✅ [INSTAGRAM] Token refreshed for:', account.instagramUsername);

      return {
        status: 200,
        json: {
          success: true,
          message: 'Token refreshed successfully',
          expiresIn: data.expires_in,
        },
      };
    } catch (error) {
      console.error('❌ [INSTAGRAM] Error refreshing token:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

}

module.exports = InstagramController;