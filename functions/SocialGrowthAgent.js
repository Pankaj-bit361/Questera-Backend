const { OpenRouterProvider } = require('../agent/LLMProvider');

const SOCIAL_GROWTH_SYSTEM_PROMPT = `You are SocialGrowthAgent - an intelligent social media strategist managing ONE Instagram account.

Your goal is SUSTAINABLE GROWTH, not viral spam.

## Your Decision Framework

You make decisions based on:
1. Recent performance data (what's working/not working)
2. Content history (avoid repetition)
3. Platform best practices (Instagram-specific heuristics)
4. Account constraints (posting limits, quiet hours)

## Decision Rules (STRICT)

### Volume Decision:
- If engagement trend is UP and reach is UP → allow 2 feed posts
- If engagement is FLAT → stick to 1 feed post
- If engagement is DOWN → 1 post + exploration mode
- NEVER exceed configured limits

### Format Decision:
- Choose format with highest historical engagement
- If no data, default to single image
- Rotate formats to avoid fatigue

### Theme Decision:
- Rotate themes (don't repeat same theme 2 days in a row)
- Weight toward themes that performed well recently
- If exploring, try a theme that hasn't been used in 5+ days

### Hook Style Decision:
- If comments are low → use bold/controversial hooks
- If saves are low → use educational/value hooks
- If reach is low → use curiosity/trending hooks

### Timing Decision:
- Use best performing time slots from analytics
- Avoid quiet hours
- Prefer times with historically higher engagement

## Output Format (STRICT JSON)

You must respond with ONLY valid JSON, no explanation:

{
  "feedPosts": [
    {
      "time": "HH:MM",
      "format": "image|carousel|reel",
      "theme": "educational|opinion|behind_the_scenes|trending|promotional|engagement",
      "hookStyle": "curiosity|bold|question|value|story",
      "goal": "likes|comments|saves|reach",
      "promptSuggestion": "Brief description of what the post should be about"
    }
  ],
  "stories": [
    {
      "type": "reshare_feed|poll|question|behind_the_scenes|countdown",
      "time": "HH:MM"
    }
  ],
  "engagement": {
    "replyComments": true|false,
    "replyStyle": "friendly|professional|witty"
  },
  "reasoning": "1-2 sentence explanation of why you made these decisions"
}

## Important Rules:
- Be conservative when performance is down
- Never recommend more than configured limits
- Always explain your reasoning
- If unsure, default to safe choices`;

class SocialGrowthAgent {
  constructor() {
    this.llm = new OpenRouterProvider({
      model: 'x-ai/grok-4.1-fast',
    });
  }

  /**
   * Generate daily content plan based on observations and memory
   */
  async decideDailyPlan(observations, memory, config) {
    const userPrompt = this.buildUserPrompt(observations, memory, config);

    try {
      const messages = [
        { role: 'system', content: SOCIAL_GROWTH_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ];

      const plan = await this.llm.chatJSON(messages, {
        temperature: 0.7,
        fallback: this.getDefaultPlan(config),
      });

      // Validate plan against limits
      return this.validatePlan(plan, config);
    } catch (error) {
      console.error('[SOCIAL_GROWTH_AGENT] Error:', error.message);
      return this.getDefaultPlan(config);
    }
  }

  buildUserPrompt(observations, memory, config) {
    const brand = memory.brand || {};
    const topics = brand.topicsAllowed?.join(', ') || 'general content';

    return `## Current Account State

### Brand Identity (IMPORTANT - Use this for content ideas)
- Niche/Topics: ${topics}
- Target Audience: ${brand.targetAudience || 'general audience'}
- Visual Style: ${brand.visualStyle || 'modern'}
- Brand Tone: ${brand.tone || 'friendly'}
- Unique Selling Points: ${brand.uniqueSellingPoints?.join(', ') || 'not specified'}

### Performance Observations (Last 7 Days)
- Engagement Trend: ${observations.engagementTrend || 'unknown'}
- Reach Trend: ${observations.reachTrend || 'unknown'}
- Avg Engagement Rate: ${observations.avgEngagementRate || 0}%
- Best Performing Format: ${observations.bestFormat || 'image'}
- Best Performing Theme: ${observations.bestTheme || 'educational'}
- Comment Rate: ${observations.commentRate || 'normal'}
- Save Rate: ${observations.saveRate || 'normal'}

### Recent Content (Last 5 Posts)
${this.formatContentHistory(memory.contentHistory?.slice(0, 5) || [])}

### Best Posting Times
${memory.performance?.bestTimes?.join(', ') || '10:00, 18:00'}

### Account Limits
- Max Feed Posts/Day: ${config.limits?.maxFeedPostsPerDay || 1}
- Max Stories/Day: ${config.limits?.maxStoriesPerDay || 2}
- Auto Reply Comments: ${config.permissions?.autoReplyComments ? 'Yes' : 'No'}

### Content Preferences
- Allowed Themes: ${config.contentPreferences?.allowedThemes?.join(', ') || 'all'}
- Preferred Tone: ${config.contentPreferences?.tone || 'friendly'}

### Current Date & Time
${new Date().toISOString()}

Based on this data, create today's content plan.
IMPORTANT: The promptSuggestion MUST be specific to the brand's niche (${topics}).
Focus on sustainable growth.`;
  }

  formatContentHistory(history) {
    if (!history || history.length === 0) {
      return 'No recent content history available.';
    }
    return history.map((h, i) =>
      `${i + 1}. ${h.date?.toISOString?.() || h.date} - ${h.format} - ${h.theme} - ` +
      `Engagement: ${h.performance?.engagementRate || 0}%`
    ).join('\n');
  }

  validatePlan(plan, config) {
    // Ensure feed posts don't exceed limit
    if (plan.feedPosts?.length > config.limits?.maxFeedPostsPerDay) {
      plan.feedPosts = plan.feedPosts.slice(0, config.limits.maxFeedPostsPerDay);
    }
    // Ensure stories don't exceed limit
    if (plan.stories?.length > config.limits?.maxStoriesPerDay) {
      plan.stories = plan.stories.slice(0, config.limits.maxStoriesPerDay);
    }
    return plan;
  }

  getDefaultPlan(config) {
    return {
      feedPosts: [{
        time: '10:00',
        format: 'image',
        theme: 'educational',
        hookStyle: 'value',
        goal: 'saves',
        promptSuggestion: 'Create valuable educational content for your audience',
      }],
      stories: [],
      engagement: { replyComments: false },
      reasoning: 'Default conservative plan due to error or insufficient data.',
    };
  }
}

module.exports = SocialGrowthAgent;

