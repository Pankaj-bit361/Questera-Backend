const ScheduledPost = require('../models/scheduledPost');
const InstagramController = require('./Instagram');
const EmailService = require('./EmailService');
const ContentEngine = require('./ContentEngine');

class SchedulerController {
  constructor() {
    this.instagramController = new InstagramController();
    this.emailService = new EmailService();
    this.contentEngine = new ContentEngine();
  }

  /**
   * Create a new scheduled post
   */
  async createScheduledPost(req) {
    try {
      const { userId, imageUrl, caption, hashtags, platform, accountId, scheduledAt, timezone, isRecurring, frequency, frequencyDays, frequencyTime, repeatUntil, imageChatId } = req.body;

      if (!userId || !imageUrl || !scheduledAt) {
        return { status: 400, json: { error: 'userId, imageUrl, and scheduledAt are required' } };
      }

      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        return { status: 400, json: { error: 'Scheduled time must be in the future' } };
      }

      const post = await ScheduledPost.create({
        userId,
        imageUrl,
        caption: caption || '',
        hashtags: hashtags || '',
        platform: platform || 'instagram',
        accountId,
        scheduledAt: scheduledDate,
        timezone: timezone || 'UTC',
        isRecurring: isRecurring || false,
        frequency: frequency || 'once',
        frequencyDays: frequencyDays || [],
        frequencyTime,
        repeatUntil: repeatUntil ? new Date(repeatUntil) : null,
        imageChatId,
      });

      console.log('📅 [SCHEDULER] Created scheduled post:', post.postId, 'for', scheduledDate);

      // Send email notification
      this.emailService.sendPostScheduledEmail(userId, post).catch(err => {
        console.error('❌ [SCHEDULER] Failed to send scheduled email:', err);
      });

      return {
        status: 200,
        json: {
          success: true,
          message: 'Post scheduled successfully',
          post: {
            postId: post.postId,
            imageUrl: post.imageUrl,
            caption: post.caption,
            hashtags: post.hashtags,
            platform: post.platform,
            scheduledAt: post.scheduledAt,
            status: post.status,
          },
        },
      };
    } catch (error) {
      console.error('❌ [SCHEDULER] Error creating scheduled post:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Schedule a video/reel post with auto-generated viral caption and hashtags
   * Now uses Gemini to ANALYZE the actual video for better captions
   */
  async scheduleVideo(req) {
    try {
      const {
        userId,
        videoUrl,
        videoChatId,
        prompt, // Video generation prompt - used for caption generation
        platform = 'instagram',
        accountId,
        scheduledAt,
        timezone = 'UTC',
        customCaption, // User can override auto-generated caption
        customHashtags, // User can override auto-generated hashtags
        postType = 'reel', // 'reel' or 'story'
        tone = 'brand', // 'brand', 'creator', 'marketing', 'story'
      } = req.body;

      if (!userId || !videoUrl || !scheduledAt) {
        return { status: 400, json: { error: 'userId, videoUrl, and scheduledAt are required' } };
      }

      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        return { status: 400, json: { error: 'Scheduled time must be in the future' } };
      }

      console.log('🎬 [SCHEDULER] Scheduling video for', scheduledDate);
      console.log('📝 [SCHEDULER] Video URL:', videoUrl?.slice(0, 50) + '...');
      console.log('🎯 [SCHEDULER] Tone:', tone);

      // Generate viral caption and hashtags if not provided
      let caption = customCaption || '';
      let hashtags = customHashtags || '';

      if (!customCaption || !customHashtags) {
        console.log('✨ [SCHEDULER] Generating caption by analyzing actual video...');
        try {
          // Pass videoUrl for Gemini to analyze the actual video content
          const viralContent = await this.contentEngine.generateViralVideoContent(
            prompt || 'AI-generated creative video',
            { platform, tone, videoUrl } // Pass videoUrl for video analysis!
          );

          if (!customCaption) {
            caption = `${viralContent.hook || ''}\n\n${viralContent.caption || ''}\n\n${viralContent.callToAction || ''}`.trim();
          }
          if (!customHashtags) {
            hashtags = viralContent.hashtagString || '';
          }

          console.log('✅ [SCHEDULER] Generated viral content:', {
            captionLength: caption.length,
            hashtagCount: (hashtags.match(/#/g) || []).length,
            viralScore: viralContent.viralScore,
          });
        } catch (err) {
          console.warn('⚠️ [SCHEDULER] Failed to generate viral content:', err.message);
          // Use fallback caption
          caption = caption || 'Check this out! 🔥\n\nFollow for more amazing content ✨';
          hashtags = hashtags || '#reels #viral #explore #fyp #trending #content #creator';
        }
      }

      // Create the scheduled post
      // NOTE: Don't set imageUrl to videoUrl - it breaks thumbnail display
      const post = await ScheduledPost.create({
        userId,
        videoUrl,
        // imageUrl: null for video posts - frontend handles this
        videoChatId,
        caption,
        hashtags,
        platform,
        accountId,
        scheduledAt: scheduledDate,
        timezone,
        postType, // 'reel' or 'story'
        status: 'scheduled',
      });

      console.log('📅 [SCHEDULER] Video scheduled:', post.postId, 'for', scheduledDate);

      // Send email notification
      this.emailService.sendPostScheduledEmail(userId, post).catch(err => {
        console.error('❌ [SCHEDULER] Failed to send scheduled email:', err);
      });

      return {
        status: 200,
        json: {
          success: true,
          message: 'Video scheduled successfully',
          post: {
            postId: post.postId,
            videoUrl: post.videoUrl,
            caption: post.caption,
            hashtags: post.hashtags,
            platform: post.platform,
            postType: post.postType,
            scheduledAt: post.scheduledAt,
            status: post.status,
          },
        },
      };
    } catch (error) {
      console.error('❌ [SCHEDULER] Error scheduling video:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Generate caption preview by analyzing actual video with Gemini
   */
  async generateVideoCaption(req) {
    try {
      const { prompt, platform = 'instagram', videoUrl, tone = 'brand' } = req.body;

      if (!prompt && !videoUrl) {
        return { status: 400, json: { error: 'prompt or videoUrl is required' } };
      }

      console.log('✨ [SCHEDULER] Generating caption preview...');
      console.log('🎬 [SCHEDULER] Video URL:', videoUrl ? videoUrl.slice(0, 50) + '...' : 'none');
      console.log('🎯 [SCHEDULER] Tone:', tone);

      const viralContent = await this.contentEngine.generateViralVideoContent(
        prompt || 'AI-generated video',
        { platform, tone, videoUrl } // Pass videoUrl for video analysis!
      );

      // Build caption based on tone
      let fullCaption;
      if (tone === 'brand') {
        // Clean, professional - no CTA
        fullCaption = `${viralContent.hook || ''}\n\n${viralContent.caption || ''}`.trim();
      } else {
        // Creator/marketing - include CTA
        fullCaption = `${viralContent.hook || ''}\n\n${viralContent.caption || ''}\n\n${viralContent.callToAction || ''}`.trim();
      }

      return {
        status: 200,
        json: {
          success: true,
          hook: viralContent.hook,
          caption: fullCaption,
          hashtags: viralContent.hashtagString,
          suggestedAudio: viralContent.suggestedAudio,
          bestPostingTimes: viralContent.bestPostingTimes,
          viralScore: viralContent.viralScore,
          tips: viralContent.tips,
          videoAnalysis: viralContent.videoAnalysis || null, // Include analysis if available
        },
      };
    } catch (error) {
      console.error('❌ [SCHEDULER] Error generating caption:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Get all scheduled posts for a user (for calendar view)
   */
  async getScheduledPosts(req) {
    try {
      const { userId } = req.params;
      const { startDate, endDate, status } = req.query;

      if (!userId) {
        return { status: 400, json: { error: 'userId is required' } };
      }

      const query = { userId };

      if (startDate && endDate) {
        query.scheduledAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
      }

      if (status) {
        query.status = status;
      }

      const posts = await ScheduledPost.find(query).sort({ scheduledAt: 1 });

      return {
        status: 200,
        json: {
          success: true,
          posts: posts.map(p => ({
            postId: p.postId,
            imageUrl: p.imageUrl,
            videoUrl: p.videoUrl,
            postType: p.postType,
            caption: p.caption,
            hashtags: p.hashtags,
            platform: p.platform,
            accountId: p.accountId,
            scheduledAt: p.scheduledAt,
            status: p.status,
            publishedAt: p.publishedAt,
            publishError: p.publishError,
            isRecurring: p.isRecurring,
            frequency: p.frequency,
          })),
        },
      };
    } catch (error) {
      console.error('❌ [SCHEDULER] Error getting scheduled posts:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Update a scheduled post
   */
  async updateScheduledPost(req) {
    try {
      const { postId } = req.params;
      const { caption, hashtags, scheduledAt, accountId } = req.body;

      const post = await ScheduledPost.findOne({ postId });
      if (!post) {
        return { status: 404, json: { error: 'Scheduled post not found' } };
      }

      if (post.status !== 'scheduled') {
        return { status: 400, json: { error: 'Cannot update a post that is not scheduled' } };
      }

      if (caption !== undefined) post.caption = caption;
      if (hashtags !== undefined) post.hashtags = hashtags;
      if (accountId !== undefined) post.accountId = accountId;
      if (scheduledAt) {
        const newDate = new Date(scheduledAt);
        if (newDate <= new Date()) {
          return { status: 400, json: { error: 'Scheduled time must be in the future' } };
        }
        post.scheduledAt = newDate;
      }

      await post.save();

      return { status: 200, json: { success: true, message: 'Post updated', post } };
    } catch (error) {
      console.error('❌ [SCHEDULER] Error updating scheduled post:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Cancel/Delete a scheduled post
   */
  async cancelScheduledPost(req) {
    try {
      const { postId } = req.params;

      const post = await ScheduledPost.findOne({ postId });
      if (!post) {
        return { status: 404, json: { error: 'Scheduled post not found' } };
      }

      if (post.status === 'published') {
        return { status: 400, json: { error: 'Cannot cancel an already published post' } };
      }

      post.status = 'cancelled';
      await post.save();

      console.log('🚫 [SCHEDULER] Cancelled scheduled post:', postId);

      return { status: 200, json: { success: true, message: 'Post cancelled' } };
    } catch (error) {
      console.error('❌ [SCHEDULER] Error cancelling scheduled post:', error);
      return { status: 500, json: { error: error.message } };
    }
  }

  /**
   * Process and publish due posts (called by cron job)
   */
  async processDuePosts() {
    try {
      const duePosts = await ScheduledPost.findDuePosts();
      console.log(`📅 [SCHEDULER] Found ${duePosts.length} posts due for publishing`);

      const results = [];
      for (const post of duePosts) {
        try {
          const result = await this.publishPost(post);
          results.push({ postId: post.postId, ...result });

          // Send success email notification
          this.emailService.sendPostPublishedEmail(post.userId, post).catch(err => {
            console.error('❌ [SCHEDULER] Failed to send published email:', err);
          });
        } catch (error) {
          console.error(`❌ [SCHEDULER] Failed to publish post ${post.postId}:`, error);
          post.retryCount += 1;
          post.publishError = error.message;
          if (post.retryCount >= 3) {
            post.status = 'failed';
            // Send failure email notification
            this.emailService.sendPostFailedEmail(post.userId, post, error.message).catch(err => {
              console.error('❌ [SCHEDULER] Failed to send failure email:', err);
            });
          }
          await post.save();
          results.push({ postId: post.postId, success: false, error: error.message });
        }
      }

      return { success: true, processed: results.length, results };
    } catch (error) {
      console.error('❌ [SCHEDULER] Error processing due posts:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Publish a single post to its platform
   */
  async publishPost(post) {
    console.log(`📤 [SCHEDULER] Publishing post ${post.postId} to ${post.platform}...`);
    console.log(`📋 [SCHEDULER] Post details: postType=${post.postType}, videoUrl=${post.videoUrl?.slice(0, 50)}, imageUrl=${post.imageUrl?.slice(0, 50)}`);

    if (post.platform === 'instagram') {
      let result;

      // Check post type and route to appropriate method
      if (post.postType === 'story') {
        console.log('📖 [SCHEDULER] Publishing as Instagram Story...');
        const mediaUrl = post.videoUrl || post.imageUrl;
        result = await this.instagramController.publishStory({
          body: {
            userId: post.userId,
            imageUrl: mediaUrl,
            accountId: post.accountId,
          },
        });
      } else if (post.postType === 'carousel' && post.imageUrls?.length > 1) {
        // Carousel post with multiple images
        console.log('🎠 [SCHEDULER] Publishing as Instagram Carousel...');
        result = await this.instagramController.publishCarousel({
          body: {
            userId: post.userId,
            imageUrls: post.imageUrls,
            caption: post.fullCaption,
            accountId: post.accountId,
          },
        });
      } else if (post.postType === 'reel' || post.postType === 'video') {
        // Video/Reel post
        console.log('🎬 [SCHEDULER] Publishing as Instagram Reel...');
        const videoUrl = post.videoUrl || post.imageUrl;
        if (!videoUrl) {
          throw new Error('videoUrl is required for Reel posts');
        }
        result = await this.instagramController.publishReel({
          body: {
            userId: post.userId,
            videoUrl: videoUrl,
            caption: post.fullCaption,
            accountId: post.accountId,
          },
        });
      } else {
        // Regular image feed post
        console.log('📸 [SCHEDULER] Publishing as Instagram Image...');
        if (!post.imageUrl) {
          throw new Error('imageUrl is required for Image posts');
        }
        result = await this.instagramController.publishImage({
          body: {
            userId: post.userId,
            imageUrl: post.imageUrl,
            caption: post.fullCaption,
            accountId: post.accountId,
          },
        });
      }

      if (result.json.success) {
        post.status = 'published';
        post.publishedAt = new Date();
        post.publishedMediaId = result.json.mediaId;
        post.platformPostUrl = result.json.permalink; // Store permalink for analytics matching
        await post.save();

        // Post first comment if provided
        if (post.firstComment && result.json.mediaId) {
          console.log('💬 [SCHEDULER] Posting first comment...');
          try {
            const commentResult = await this.instagramController.postComment({
              body: {
                userId: post.userId,
                mediaId: result.json.mediaId,
                comment: post.firstComment,
                accountId: post.accountId,
              },
            });
            if (commentResult.json.success) {
              console.log('✅ [SCHEDULER] First comment posted successfully');
            } else {
              console.log('⚠️ [SCHEDULER] First comment failed:', commentResult.json.error);
            }
          } catch (commentErr) {
            console.log('⚠️ [SCHEDULER] Failed to post first comment:', commentErr.message);
            // Don't fail the whole post for comment failure
          }
        }

        // Handle recurring posts - create next occurrence
        if (post.isRecurring && post.frequency !== 'once') {
          await this.createNextRecurrence(post);
        }

        const postTypeLabel = post.postType === 'story' ? 'Story' : 'Post';
        console.log(`✅ [SCHEDULER] ${postTypeLabel} ${post.postId} published successfully!`);
        return { success: true, mediaId: result.json.mediaId };
      } else {
        throw new Error(result.json.error || 'Failed to publish to Instagram');
      }
    }

    throw new Error(`Platform ${post.platform} not supported yet`);
  }

  /**
   * Create next occurrence for recurring posts
   */
  async createNextRecurrence(post) {
    let nextDate = new Date(post.scheduledAt);

    if (post.frequency === 'daily') {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (post.frequency === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    }

    // Check if we've passed the repeatUntil date
    if (post.repeatUntil && nextDate > post.repeatUntil) {
      console.log(`📅 [SCHEDULER] Recurring post ${post.postId} has reached its end date`);
      return;
    }

    await ScheduledPost.create({
      userId: post.userId,
      imageUrl: post.imageUrl,
      caption: post.caption,
      hashtags: post.hashtags,
      platform: post.platform,
      accountId: post.accountId,
      scheduledAt: nextDate,
      timezone: post.timezone,
      isRecurring: true,
      frequency: post.frequency,
      frequencyDays: post.frequencyDays,
      frequencyTime: post.frequencyTime,
      repeatUntil: post.repeatUntil,
      imageChatId: post.imageChatId,
    });

    console.log(`📅 [SCHEDULER] Created next recurring post for ${nextDate}`);
  }

  /**
   * Get scheduler stats for user dashboard
   */
  async getSchedulerStats(req) {
    try {
      const { userId } = req.params;

      const [scheduled, published, failed] = await Promise.all([
        ScheduledPost.countDocuments({ userId, status: 'scheduled' }),
        ScheduledPost.countDocuments({ userId, status: 'published' }),
        ScheduledPost.countDocuments({ userId, status: 'failed' }),
      ]);

      const upcomingPosts = await ScheduledPost.find({
        userId,
        status: 'scheduled',
      }).sort({ scheduledAt: 1 }).limit(5);

      return {
        status: 200,
        json: {
          success: true,
          stats: { scheduled, published, failed, total: scheduled + published + failed },
          upcomingPosts: upcomingPosts.map(p => ({
            postId: p.postId,
            imageUrl: p.imageUrl,
            scheduledAt: p.scheduledAt,
            platform: p.platform,
          })),
        },
      };
    } catch (error) {
      console.error('❌ [SCHEDULER] Error getting stats:', error);
      return { status: 500, json: { error: error.message } };
    }
  }
}

module.exports = SchedulerController;

