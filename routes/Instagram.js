const express = require('express');
const instagramRouter = express.Router();
const InstagramController = require('../functions/Instagram');
const instagramController = new InstagramController();
const Instagram = require('../models/instagram');

// Get OAuth URL
instagramRouter.get('/oauth-url', (req, res) => {
  try {
    const { status, json } = instagramController.getOAuthUrl(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Handle OAuth callback
instagramRouter.post('/callback', async (req, res) => {
  try {
    const { status, json } = await instagramController.handleCallback(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Get Instagram account info
instagramRouter.get('/info/:userId', async (req, res) => {
  try {
    const { status, json } = await instagramController.getInstagramInfo(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Disconnect Instagram account
instagramRouter.post('/disconnect/:userId', async (req, res) => {
  try {
    const { status, json } = await instagramController.disconnectInstagram(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Publish image to Instagram
instagramRouter.post('/publish', async (req, res) => {
  try {
    const { status, json } = await instagramController.publishImage(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Refresh access token
instagramRouter.post('/refresh-token', async (req, res) => {
  try {
    const { status, json } = await instagramController.refreshToken(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

// Publish Story to Instagram
instagramRouter.post('/publish-story', async (req, res) => {
  try {
    const { status, json } = await instagramController.publishStory(req, res);
    return res.status(status).json(json);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /instagram/facebook-pages/:userId
 * Get Facebook Pages the user manages (for Meta App Review - pages_show_list)
 */
instagramRouter.get('/facebook-pages/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Find all user's Instagram connections
    const instagramDocs = await Instagram.find({ userId, isConnected: true });

    if (!instagramDocs || instagramDocs.length === 0) {
      return res.status(200).json({
        success: true,
        pages: [],
        message: 'No connected account found'
      });
    }

    // Collect all Facebook Pages from connected accounts
    const pagesMap = new Map();

    for (const doc of instagramDocs) {
      // Check accounts array first (multi-account)
      if (doc.accounts && doc.accounts.length > 0) {
        for (const account of doc.accounts) {
          if (account.facebookPageId && account.isConnected !== false) {
            // Try to get page details from Facebook Graph API
            let pageDetails = {
              id: account.facebookPageId,
              name: account.facebookPageName || 'Facebook Page',
              picture: null,
              category: null,
              fanCount: 0,
              hasInstagram: true,
              instagramId: account.instagramBusinessAccountId,
              instagramUsername: account.instagramUsername,
            };

            // Fetch additional page details if we have access token
            if (account.accessToken) {
              try {
                const pageResponse = await fetch(
                  `https://graph.facebook.com/v21.0/${account.facebookPageId}?fields=id,name,picture,category,fan_count&access_token=${account.accessToken}`
                );
                const pageData = await pageResponse.json();
                if (!pageData.error) {
                  pageDetails.name = pageData.name || pageDetails.name;
                  pageDetails.picture = pageData.picture?.data?.url || null;
                  pageDetails.category = pageData.category || null;
                  pageDetails.fanCount = pageData.fan_count || 0;
                }
              } catch (e) {
                console.log('[INSTAGRAM] Could not fetch page details:', e.message);
              }
            }

            pagesMap.set(account.facebookPageId, pageDetails);
          }
        }
      }

      // Also check single account fields (backward compatibility)
      if (doc.facebookPageId && !pagesMap.has(doc.facebookPageId)) {
        let pageDetails = {
          id: doc.facebookPageId,
          name: doc.facebookPageName || 'Facebook Page',
          picture: null,
          category: null,
          fanCount: 0,
          hasInstagram: true,
          instagramId: doc.instagramBusinessAccountId,
          instagramUsername: doc.instagramUsername,
        };

        if (doc.accessToken) {
          try {
            const pageResponse = await fetch(
              `https://graph.facebook.com/v21.0/${doc.facebookPageId}?fields=id,name,picture,category,fan_count&access_token=${doc.accessToken}`
            );
            const pageData = await pageResponse.json();
            if (!pageData.error) {
              pageDetails.name = pageData.name || pageDetails.name;
              pageDetails.picture = pageData.picture?.data?.url || null;
              pageDetails.category = pageData.category || null;
              pageDetails.fanCount = pageData.fan_count || 0;
            }
          } catch (e) {
            console.log('[INSTAGRAM] Could not fetch page details:', e.message);
          }
        }

        pagesMap.set(doc.facebookPageId, pageDetails);
      }
    }

    const pages = Array.from(pagesMap.values());

    return res.status(200).json({
      success: true,
      pages,
      totalPages: pages.length,
    });
  } catch (error) {
    console.error('[INSTAGRAM] Facebook Pages Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /instagram/page-content/:userId/:pageId
 * Get Facebook Page posts and engagement data for Meta App Review
 * Demonstrates pages_read_engagement permission
 */
instagramRouter.get('/page-content/:userId/:pageId', async (req, res) => {
  try {
    const { userId, pageId } = req.params;

    // Find the page access token from stored accounts
    const instagramDocs = await Instagram.find({ userId, isConnected: true });
    let pageAccessToken = null;
    let pageInfo = null;

    // Search through all accounts to find matching page
    console.log('[PAGE-CONTENT] Looking for pageId:', pageId);
    console.log('[PAGE-CONTENT] Found', instagramDocs.length, 'instagram docs');

    for (const doc of instagramDocs) {
      // Check accounts array (multi-account structure)
      if (doc.accounts && doc.accounts.length > 0) {
        console.log('[PAGE-CONTENT] Doc has', doc.accounts.length, 'accounts');
        for (const acc of doc.accounts) {
          console.log('[PAGE-CONTENT] Checking account:', acc.facebookPageName, 'pageId:', acc.facebookPageId, 'hasToken:', !!acc.accessToken, 'tokenLength:', acc.accessToken?.length);
          // Match by facebookPageId and use the account's accessToken
          if (acc.facebookPageId === pageId && acc.accessToken && acc.isConnected !== false) {
            pageAccessToken = acc.accessToken;
            pageInfo = {
              id: acc.facebookPageId,
              name: acc.facebookPageName,
            };
            console.log('[PAGE-CONTENT] MATCHED! Using token for page:', acc.facebookPageName);
            console.log('[PAGE-CONTENT] Token first 30 chars:', acc.accessToken.substring(0, 30) + '...');
            break;
          }
        }
      }
      if (pageAccessToken) break;

      // Also check single account fields (backward compatibility)
      if (doc.facebookPageId === pageId && doc.accessToken) {
        pageAccessToken = doc.accessToken;
        pageInfo = {
          id: doc.facebookPageId,
          name: doc.facebookPageName,
        };
        console.log('[PAGE-CONTENT] Found token from doc level for page:', doc.facebookPageName);
        break;
      }
    }

    if (!pageAccessToken) {
      console.log('[PAGE-CONTENT] No page token found for pageId:', pageId);
      console.log('[PAGE-CONTENT] Available docs:', instagramDocs.map(d => ({
        accounts: d.accounts?.map(a => ({ pageId: a.facebookPageId, hasToken: !!a.accessToken })),
        docPageId: d.facebookPageId,
      })));
      return res.status(400).json({ error: 'Page not found or no access token. Please reconnect your Instagram account.' });
    }

    // Fetch Page details
    const pageDetailsUrl = `https://graph.facebook.com/v21.0/${pageId}?fields=id,name,picture,category,followers_count,fan_count,about,website,phone&access_token=${pageAccessToken}`;
    const pageResponse = await fetch(pageDetailsUrl);
    const pageData = await pageResponse.json();

    if (pageData.error) {
      return res.status(400).json({ error: pageData.error.message });
    }

    // Fetch Page posts with engagement (try /feed first for more complete results, fallback to /posts)
    // /feed includes posts by the page AND posts by others on the page
    // /posts only includes posts made by the page itself
    console.log('[PAGE-CONTENT] Fetching posts for page:', pageId);

    // Fields for page posts - comments.summary requires pages_read_user_content which may not be granted for all pages
    // So we use likes.summary and reactions.summary which work with pages_read_engagement
    const fullFields = 'id,message,story,created_time,full_picture,attachments{media_type,url,media},shares,likes.summary(true),reactions.summary(true)';
    // Fallback to simple fields if engagement fields still fail
    const simpleFields = 'id,message,story,created_time,full_picture,attachments{media_type,url,media}';

    let feedUrl = `https://graph.facebook.com/v21.0/${pageId}/feed?fields=${fullFields}&limit=25&access_token=${pageAccessToken}`;
    let feedResponse = await fetch(feedUrl);
    let feedData = await feedResponse.json();

    console.log('[PAGE-CONTENT] Feed API response (full fields):', JSON.stringify(feedData, null, 2));

    // If full fields fail with permission error, retry with simple fields
    if (feedData.error && feedData.error.code === 200) {
      console.log('[PAGE-CONTENT] Full fields failed, retrying with simple fields...');
      feedUrl = `https://graph.facebook.com/v21.0/${pageId}/feed?fields=${simpleFields}&limit=25&access_token=${pageAccessToken}`;
      feedResponse = await fetch(feedUrl);
      feedData = await feedResponse.json();
      console.log('[PAGE-CONTENT] Feed API response (simple fields):', JSON.stringify(feedData, null, 2));
    }

    // Use feed data (more complete) or fall back to posts endpoint
    let postsData = feedData;
    if (feedData.error || !feedData.data || feedData.data.length === 0) {
      console.log('[PAGE-CONTENT] Feed empty or error, trying /posts endpoint');
      let postsUrl = `https://graph.facebook.com/v21.0/${pageId}/posts?fields=${fullFields}&limit=25&access_token=${pageAccessToken}`;
      let postsResponse = await fetch(postsUrl);
      postsData = await postsResponse.json();
      console.log('[PAGE-CONTENT] Posts API response:', JSON.stringify(postsData, null, 2));

      // If posts with full fields also fail, try simple fields
      if (postsData.error && postsData.error.code === 200) {
        console.log('[PAGE-CONTENT] Posts full fields failed, retrying with simple fields...');
        postsUrl = `https://graph.facebook.com/v21.0/${pageId}/posts?fields=${simpleFields}&limit=25&access_token=${pageAccessToken}`;
        postsResponse = await fetch(postsUrl);
        postsData = await postsResponse.json();
        console.log('[PAGE-CONTENT] Posts API response (simple fields):', JSON.stringify(postsData, null, 2));
      }
    }

    // Fetch Page insights (engagement metrics)
    const insightsUrl = `https://graph.facebook.com/v21.0/${pageId}/insights?metric=page_engaged_users,page_post_engagements,page_impressions,page_fans&period=day&access_token=${pageAccessToken}`;
    const insightsResponse = await fetch(insightsUrl);
    const insightsData = await insightsResponse.json();

    // Format posts - use message first, then story as fallback
    const posts = (postsData.data || []).map(post => ({
      id: post.id,
      message: post.message || post.story || '',  // Use story as fallback for posts like "updated profile picture"
      createdTime: post.created_time,
      image: post.full_picture || null,
      mediaType: post.attachments?.data?.[0]?.media_type || 'status',
      likes: post.likes?.summary?.total_count || 0,
      comments: post.comments?.summary?.total_count || 0,
      shares: post.shares?.count || 0,
      reactions: post.reactions?.summary?.total_count || 0,
    }));

    console.log('[PAGE-CONTENT] Formatted posts count:', posts.length);

    // Format insights
    const insights = {};
    if (insightsData.data) {
      insightsData.data.forEach(metric => {
        const latestValue = metric.values?.[metric.values.length - 1]?.value || 0;
        insights[metric.name] = latestValue;
      });
    }

    return res.status(200).json({
      success: true,
      page: {
        id: pageData.id,
        name: pageData.name,
        picture: pageData.picture?.data?.url || null,
        category: pageData.category,
        followers: pageData.followers_count || pageData.fan_count || 0,
        about: pageData.about || '',
        website: pageData.website || '',
      },
      posts,
      insights,
      totalPosts: posts.length,
    });
  } catch (error) {
    console.error('[INSTAGRAM] Page Content Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = instagramRouter;