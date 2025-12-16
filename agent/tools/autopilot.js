const AutopilotConfig = require('../../models/autopilotConfig');
const AutopilotMemory = require('../../models/autopilotMemory');
const { CognitiveNarrator } = require('../CognitiveNarrator');

const narrator = new CognitiveNarrator();

/**
 * Autopilot Tool - Enables autopilot mode with brand onboarding
 * 
 * Flow:
 * 1. User asks to enable autopilot
 * 2. If brand info missing, return questions for agent to ask
 * 3. User provides brand info via saveBrandInfo action
 * 4. Autopilot is enabled with full context
 */
const autopilotTool = {
  name: 'autopilot',
  description: `Manage autopilot mode for autonomous social media posting. 
Actions:
- "check": Check autopilot status and if brand info is complete
- "enable": Enable autopilot (requires brand info first)
- "disable": Disable autopilot
- "save_brand": Save brand information for autopilot context
- "run_now": Manually trigger autopilot to create today's content`,
  parameters: {
    action: {
      type: 'string',
      required: true,
      description: 'Action: "check", "enable", "disable", "save_brand", or "run_now"'
    },
    chatId: {
      type: 'string',
      required: true,
      description: 'The chat/account ID for this autopilot instance'
    },
    brandInfo: {
      type: 'object',
      required: false,
      description: 'Brand information object with: niche, targetAudience, visualStyle, tone, topics, referenceImageUrl'
    }
  },

  execute: async (params, context) => {
    const { action, chatId, brandInfo } = params;
    const { userId } = context;

    if (!userId) {
      return { success: false, error: 'Not logged in', message: 'Please log in first.' };
    }

    if (!chatId) {
      return { success: false, error: 'chatId required', message: 'Please specify which chat/account to configure.' };
    }

    try {
      switch (action) {
        case 'check':
          return await checkAutopilotStatus(userId, chatId);

        case 'enable':
          return await enableAutopilot(userId, chatId);

        case 'disable':
          return await disableAutopilot(userId, chatId);

        case 'save_brand':
          return await saveBrandInfo(userId, chatId, brandInfo);

        case 'run_now':
          return await runAutopilotNow(userId, chatId);

        default:
          return { success: false, error: 'Invalid action', message: `Unknown action: ${action}` };
      }
    } catch (error) {
      console.error('[AUTOPILOT-TOOL] Error:', error.message);
      return { success: false, error: error.message, message: `Autopilot error: ${error.message}` };
    }
  }
};

/**
 * Check autopilot status and brand info completeness
 */
async function checkAutopilotStatus(userId, chatId) {
  const config = await AutopilotConfig.findOne({ userId, chatId });
  const memory = await AutopilotMemory.findOne({ userId, chatId });

  const brandComplete = memory?.brand &&
    memory.brand.targetAudience &&
    memory.brand.topicsAllowed?.length > 0;

  const onboardingQuestions = !brandComplete ? [
    "What's your niche or industry? (e.g., fitness, tech, fashion, food, travel)",
    "Who is your target audience? (age range, interests, problems they have)",
    "What visual style do you prefer? (minimal, bold colors, dark aesthetic, vibrant, professional)",
    "What tone should your content have? (professional, casual, funny, inspiring, educational)",
    "What topics do you want to post about? (list 3-5 main topics)",
    "Do you have a reference image of yourself for personalized AI images? (optional - provide URL)"
  ] : null;

  return {
    success: true,
    status: {
      enabled: config?.enabled || false,
      paused: config?.paused || false,
      brandInfoComplete: brandComplete,
      lastRun: config?.lastRunAt,
      postsToday: config?.stats?.postsToday || 0
    },
    needsOnboarding: !brandComplete,
    onboardingQuestions,
    message: brandComplete
      ? `Autopilot is ${config?.enabled ? 'enabled ✅' : 'disabled'}. Brand info is complete.`
      : 'I need to learn about your brand before enabling autopilot. Let me ask you a few questions...',
    cognitive: {
      thinkingSteps: narrator.narrateGeneric('Checking autopilot configuration and brand completeness'),
      persona: 'growth'
    }
  };
}

/**
 * Enable autopilot (only if brand info is complete)
 */
async function enableAutopilot(userId, chatId) {
  const memory = await AutopilotMemory.findOne({ userId, chatId });

  const brandComplete = memory?.brand &&
    memory.brand.targetAudience &&
    memory.brand.topicsAllowed?.length > 0;

  if (!brandComplete) {
    return {
      success: false,
      needsOnboarding: true,
      message: "I can't enable autopilot yet - I need to understand your brand first. Let me ask you a few questions about your content style and audience.",
      onboardingQuestions: [
        "What's your niche or industry?",
        "Who is your target audience?",
        "What visual style do you prefer?",
        "What tone should your content have?",
        "What topics do you want to post about?"
      ]
    };
  }

  // Enable autopilot
  let config = await AutopilotConfig.findOne({ userId, chatId });
  if (!config) {
    config = new AutopilotConfig({ userId, chatId });
  }

  config.enabled = true;
  config.paused = false;
  await config.save();

  return {
    success: true,
    enabled: true,
    message: `🚀 Autopilot is now ENABLED! I'll automatically create and schedule content based on your brand: ${memory.brand.topicsAllowed.join(', ')}. I'll post up to ${config.limits.maxPostsPerDay} times per day during optimal hours.`,
    cognitive: {
      thinkingSteps: narrator.narrateGeneric('Enabling autonomous content creation mode'),
      decisions: [
        { type: 'mode', value: 'autopilot enabled', reason: 'Brand info complete, ready for autonomous posting' }
      ],
      persona: 'growth'
    }
  };
}

/**
 * Disable autopilot
 */
async function disableAutopilot(userId, chatId) {
  const config = await AutopilotConfig.findOne({ userId, chatId });
  if (config) {
    config.enabled = false;
    await config.save();
  }

  return {
    success: true,
    enabled: false,
    message: '⏸️ Autopilot has been disabled. I will no longer automatically create content. You can re-enable it anytime.',
    cognitive: {
      thinkingSteps: narrator.narrateGeneric('Disabling autonomous content mode'),
      persona: 'growth'
    }
  };
}

/**
 * Save brand information from onboarding
 */
async function saveBrandInfo(userId, chatId, brandInfo) {
  if (!brandInfo) {
    return {
      success: false,
      error: 'brandInfo required',
      message: 'Please provide brand information to save.'
    };
  }

  let memory = await AutopilotMemory.findOne({ userId, chatId });
  if (!memory) {
    memory = new AutopilotMemory({ userId, chatId });
  }

  // Update brand info
  if (brandInfo.niche) {
    memory.brand.topicsAllowed = Array.isArray(brandInfo.niche)
      ? brandInfo.niche
      : [brandInfo.niche];
  }
  if (brandInfo.topics) {
    memory.brand.topicsAllowed = Array.isArray(brandInfo.topics)
      ? brandInfo.topics
      : brandInfo.topics.split(',').map(t => t.trim());
  }
  if (brandInfo.targetAudience) {
    memory.brand.targetAudience = brandInfo.targetAudience;
  }
  if (brandInfo.visualStyle) {
    memory.brand.visualStyle = brandInfo.visualStyle;
  }
  if (brandInfo.tone) {
    memory.brand.tone = brandInfo.tone;
  }
  if (brandInfo.uniqueSellingPoints) {
    memory.brand.uniqueSellingPoints = Array.isArray(brandInfo.uniqueSellingPoints)
      ? brandInfo.uniqueSellingPoints
      : [brandInfo.uniqueSellingPoints];
  }
  if (brandInfo.referenceImageUrl) {
    memory.referenceImageUrl = brandInfo.referenceImageUrl;
  }

  await memory.save();

  const brandComplete = memory.brand.targetAudience && memory.brand.topicsAllowed?.length > 0;

  return {
    success: true,
    brandComplete,
    brandInfo: memory.brand,
    message: brandComplete
      ? `✅ Brand info saved! I now understand your brand:\n• Niche: ${memory.brand.topicsAllowed.join(', ')}\n• Audience: ${memory.brand.targetAudience}\n• Style: ${memory.brand.visualStyle}\n• Tone: ${memory.brand.tone}\n\nYou can now enable autopilot!`
      : 'Brand info partially saved. Please provide target audience and topics to complete setup.',
    cognitive: {
      thinkingSteps: narrator.narrateGeneric('Saving brand context for personalized content'),
      decisions: [
        { type: 'brand', value: 'context saved', reason: 'Will use this for all future autopilot content' }
      ],
      persona: 'growth'
    }
  };
}

/**
 * Manually run autopilot now
 */
async function runAutopilotNow(userId, chatId) {
  const AutopilotService = require('../../functions/AutopilotService');
  const autopilotService = new AutopilotService();

  const memory = await AutopilotMemory.findOne({ userId, chatId });
  const brandComplete = memory?.brand &&
    memory.brand.targetAudience &&
    memory.brand.topicsAllowed?.length > 0;

  if (!brandComplete) {
    return {
      success: false,
      needsOnboarding: true,
      message: "Can't run autopilot - brand info is incomplete. Let me ask you about your brand first."
    };
  }

  try {
    const result = await autopilotService.runForChat(userId, chatId);

    return {
      success: true,
      result,
      message: `🎯 Autopilot executed! Created ${result.postsCreated || 0} posts. ${result.plan?.reasoning || ''}`,
      cognitive: {
        thinkingSteps: narrator.narrateGeneric('Executing autopilot: analyzing performance, deciding content, generating'),
        decisions: result.plan?.feedPosts?.map(p => ({
          type: 'content',
          value: `${p.theme} ${p.format} at ${p.time}`,
          reason: p.goal
        })) || [],
        persona: 'growth'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      message: `Autopilot run failed: ${error.message}`
    };
  }
}

module.exports = autopilotTool;

