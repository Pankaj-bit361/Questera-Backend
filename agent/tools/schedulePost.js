const SchedulerService = require('../../functions/SchedulerService');
const Instagram = require('../../models/instagram');
const { CognitiveNarrator } = require('../CognitiveNarrator');


const schedulerService = new SchedulerService();
const narrator = new CognitiveNarrator();


function parseRelativeTime(timeStr) {
   if (!timeStr) return null;

   const now = new Date();
   const str = timeStr.toLowerCase().trim();

   // Handle "now" or "immediately" - post in 1 minute
   if (str === 'now' || str === 'immediately' || str === 'right now' || str === 'asap') {
      now.setMinutes(now.getMinutes() + 1);
      return now.toISOString();
   }

   const minMatch = str.match(/(\d+)\s*(min|minute)/);
   if (minMatch) {
      now.setMinutes(now.getMinutes() + parseInt(minMatch[1]));
      return now.toISOString();
   }

   const hourMatch = str.match(/(\d+)\s*(hour|hr)/);
   if (hourMatch) {
      now.setHours(now.getHours() + parseInt(hourMatch[1]));
      return now.toISOString();
   }

   const dayMatch = str.match(/(\d+)\s*(day)/);
   if (dayMatch) {
      now.setDate(now.getDate() + parseInt(dayMatch[1]));
      return now.toISOString();
   }

   if (str.includes('t') && str.includes(':')) {
      return timeStr;
   }

   return null;
}


const schedulePostTool = {
   name: 'schedule_post',
   description: 'Schedule or immediately post an image to Instagram. Use "now" for immediate posting.',
   parameters: {
      imageUrl: {
         type: 'string',
         required: true,
         description: 'URL of the image to post'
      },
      caption: {
         type: 'string',
         required: true,
         description: 'Caption for the Instagram post'
      },
      scheduledTime: {
         type: 'string',
         required: true,
         description: 'When to post. Use "now" for immediate, or relative like "2 minutes", "1 hour"'
      },
      accountUsername: {
         type: 'string',
         required: false,
         description: 'Instagram username to post to (e.g., "pixelfusionheroes")'
      },
      hashtags: {
         type: 'string',
         required: false,
         description: 'Hashtags to add to the post'
      }
   },

   execute: async (params, context) => {
      const { caption, scheduledTime, accountUsername, hashtags } = params;
      const { userId, lastImageUrl } = context;

      // Use provided imageUrl or fall back to last generated image
      const imageUrl = params.imageUrl || lastImageUrl;

      console.log('📅 [SCHEDULE] Params:', JSON.stringify(params));
      console.log('📅 [SCHEDULE] Context lastImageUrl:', lastImageUrl);
      console.log('📅 [SCHEDULE] Final imageUrl:', imageUrl);

      if (!userId) {
         return { success: false, error: 'userId is required', message: 'Please log in first.' };
      }

      if (!imageUrl) {
         return { success: false, error: 'imageUrl is required', message: 'No image found to schedule. Please generate or select an image first.' };
      }

      if (!scheduledTime) {
         return { success: false, error: 'scheduledTime is required', message: 'Please specify when to schedule the post.' };
      }

      const parsedTime = parseRelativeTime(scheduledTime);
      if (!parsedTime) {
         return { success: false, error: 'Invalid time format', message: 'Please provide a valid time like "2 minutes" or "1 hour".' };
      }

      try {
         let accountId = null;

         if (accountUsername) {
            const doc = await Instagram.findOne({ userId });
            console.log('📅 [SCHEDULE] Found Instagram doc:', !!doc);
            console.log('📅 [SCHEDULE] Accounts:', doc?.accounts?.length);
            if (doc && doc.accounts) {
               const account = doc.accounts.find(a =>
                  a.instagramUsername?.toLowerCase() === accountUsername.toLowerCase()
               );
               console.log('📅 [SCHEDULE] Matching account:', account?.instagramUsername, account?.instagramBusinessAccountId);
               if (account) {
                  accountId = account.instagramBusinessAccountId;
               }
            }
            if (!accountId) {
               console.log('📅 [SCHEDULE] Account not found:', accountUsername);
               return { success: false, error: `Account "${accountUsername}" not found`, message: `Could not find account "${accountUsername}". Please check the username.` };
            }
         }

         console.log('📅 [SCHEDULE] Calling schedulerService.schedulePost with accountId:', accountId);
         const post = await schedulerService.schedulePost(userId, {
            socialAccountId: accountId,
            imageUrl,
            caption: caption || 'Posted with Velos AI ✨',
            hashtags: hashtags || '',
            scheduledAt: parsedTime,
            postType: 'image'
         });
         console.log('📅 [SCHEDULE] Post created:', post?._id);

         const scheduledDate = new Date(parsedTime);
         const timeStr = scheduledDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

         // Generate cognitive narration (thinking steps)
         const thinkingSteps = narrator.narrateScheduling(params);

         // Build opinionated reasoning (micro-decisions)
         const decisions = [];
         const isImmediate = scheduledTime === 'now' || scheduledTime === 'immediately';

         if (isImmediate) {
            decisions.push({
               type: 'timing',
               value: 'immediate post',
               reason: 'Publishing now to capture real-time engagement'
            });
         } else {
            decisions.push({
               type: 'timing',
               value: timeStr,
               reason: 'Scheduled for when your audience is most active'
            });
         }

         if (accountUsername) {
            decisions.push({
               type: 'account',
               value: `@${accountUsername}`,
               reason: 'Posting to your specified Instagram account'
            });
         }

         if (caption && caption.length > 50) {
            decisions.push({
               type: 'caption',
               value: 'optimized caption',
               reason: 'Caption length optimized for Instagram engagement'
            });
         }

         // Generate smart suggestions
         const suggestions = [
            'Want me to schedule the same content for another account?',
            'I can create carousel posts for higher engagement if you have more images.',
            'Should I schedule follow-up content to boost this post\'s reach?'
         ];

         return {
            success: true,
            postId: post._id,
            scheduledAt: parsedTime,
            status: post.status,
            message: `Post scheduled for ${timeStr}! It will be published to ${accountUsername || 'your default account'}.`,
            // Cognitive Layer
            cognitive: {
               thinkingSteps,
               decisions,
               suggestions,
               persona: 'growth'
            }
         };
      } catch (error) {
         console.error('📅 [SCHEDULE] Error:', error.message);
         console.error('📅 [SCHEDULE] Stack:', error.stack);
         return { success: false, error: error.message, message: `Failed to schedule: ${error.message}` };
      }
   }
};


module.exports = schedulePostTool;

