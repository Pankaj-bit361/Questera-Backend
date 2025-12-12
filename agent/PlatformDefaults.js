/**
 * Platform-specific defaults for image generation and captions
 * Instagram, LinkedIn, Twitter, etc.
 */

const PLATFORM_DEFAULTS = {
   instagram: {
      name: 'Instagram',
      image: {
         aspectRatio: '1:1',        // Square preferred
         altAspectRatios: ['4:5', '9:16'], // Portrait, Stories
         minWidth: 1080,
         maxWidth: 1080,
         quality: 'high',
         format: 'jpeg'
      },
      caption: {
         maxLength: 2200,
         hashtagLimit: 30,
         tone: 'casual, engaging, visual-first',
         emojiUsage: 'encouraged',
         ctaStyle: 'soft (link in bio, DM for more)',
         structure: [
            'Hook (first line grabs attention)',
            'Value or story (2-3 sentences)',
            'Call to action',
            'Hashtags (separate block)'
         ]
      },
      bestTimes: ['9:00', '12:00', '17:00', '20:00'],
      contentTips: [
         'Lead with strong visual',
         'Use carousel for engagement',
         'First line is crucial (shows in preview)'
      ]
   },

   linkedin: {
      name: 'LinkedIn',
      image: {
         aspectRatio: '1.91:1',     // Landscape preferred
         altAspectRatios: ['1:1', '4:5'],
         minWidth: 1200,
         maxWidth: 1920,
         quality: 'high',
         format: 'png'
      },
      caption: {
         maxLength: 3000,
         hashtagLimit: 5,
         tone: 'professional, clean, informative',
         emojiUsage: 'minimal (1-2 max)',
         ctaStyle: 'direct (comment, share, connect)',
         structure: [
            'Hook (bold statement or question)',
            'Context or insight (2-4 sentences)',
            'Key takeaway or lesson',
            'Call to action (engage, comment)',
            'Hashtags (3-5, end of post)'
         ]
      },
      bestTimes: ['8:00', '10:00', '12:00', '17:00'],
      contentTips: [
         'Professional but personable',
         'Data and insights perform well',
         'Use line breaks for readability'
      ]
   },

   twitter: {
      name: 'Twitter/X',
      image: {
         aspectRatio: '16:9',
         altAspectRatios: ['1:1', '2:1'],
         minWidth: 1200,
         maxWidth: 1920,
         quality: 'high',
         format: 'png'
      },
      caption: {
         maxLength: 280,
         hashtagLimit: 2,
         tone: 'concise, witty, conversational',
         emojiUsage: 'moderate',
         ctaStyle: 'quick (retweet, reply)',
         structure: [
            'Punchy opening',
            'One key point',
            'Optional hashtag or mention'
         ]
      },
      bestTimes: ['9:00', '12:00', '17:00'],
      contentTips: [
         'Brevity is key',
         'Threads for longer content',
         'Engage with replies'
      ]
   }
};

class PlatformDefaults {
   static get(platform) {
      const key = platform?.toLowerCase();
      return PLATFORM_DEFAULTS[key] || PLATFORM_DEFAULTS.instagram;
   }

   static getImageSettings(platform) {
      return this.get(platform).image;
   }

   static getCaptionSettings(platform) {
      return this.get(platform).caption;
   }

   static getAspectRatio(platform) {
      return this.get(platform).image.aspectRatio;
   }

   static formatCaptionPrompt(platform, topic) {
      const settings = this.getCaptionSettings(platform);
      return `Write a ${settings.tone} caption for ${platform} about: ${topic}
      
Rules:
- Max ${settings.maxLength} characters
- Max ${settings.hashtagLimit} hashtags
- Emoji usage: ${settings.emojiUsage}
- CTA style: ${settings.ctaStyle}

Structure:
${settings.structure.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
   }

   static getBestPostTimes(platform) {
      return this.get(platform).bestTimes;
   }

   static getAllPlatforms() {
      return Object.keys(PLATFORM_DEFAULTS);
   }
}

module.exports = { PlatformDefaults, PLATFORM_DEFAULTS };

