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
    for (const doc of instagramDocs) {
      // Check accounts array (multi-account structure)
      if (doc.accounts && doc.accounts.length > 0) {
        for (const acc of doc.accounts) {
          // Match by facebookPageId and use the account's accessToken
          if (acc.facebookPageId === pageId && acc.accessToken && acc.isConnected !== false) {
            pageAccessToken = acc.accessToken;
            pageInfo = {
              id: acc.facebookPageId,
              name: acc.facebookPageName,
            };
            console.log('[PAGE-CONTENT] Found token from accounts array for page:', acc.facebookPageName);
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

    // Fetch Page posts with engagement
    const postsUrl = `https://graph.facebook.com/v21.0/${pageId}/posts?fields=id,message,created_time,full_picture,attachments{media_type,url,media},shares,likes.summary(true),comments.summary(true),reactions.summary(true)&limit=25&access_token=${pageAccessToken}`;
    const postsResponse = await fetch(postsUrl);
    const postsData = await postsResponse.json();

    // Fetch Page insights (engagement metrics)
    const insightsUrl = `https://graph.facebook.com/v21.0/${pageId}/insights?metric=page_engaged_users,page_post_engagements,page_impressions,page_fans&period=day&access_token=${pageAccessToken}`;
    const insightsResponse = await fetch(insightsUrl);
    const insightsData = await insightsResponse.json();

    // Format posts
    const posts = (postsData.data || []).map(post => ({
      id: post.id,
      message: post.message || '',
      createdTime: post.created_time,
      image: post.full_picture || null,
      mediaType: post.attachments?.data?.[0]?.media_type || 'status',
      likes: post.likes?.summary?.total_count || 0,
      comments: post.comments?.summary?.total_count || 0,
      shares: post.shares?.count || 0,
      reactions: post.reactions?.summary?.total_count || 0,
    }));

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