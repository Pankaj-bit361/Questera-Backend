/**
 * Enterprise-grade failure response library
 * Provides user-friendly, actionable error messages
 */

const FAILURE_RESPONSES = {
   // ━━━━━━━━━━━━━━━━━━━━━━
   // IMAGE GENERATION FAILURES
   // ━━━━━━━━━━━━━━━━━━━━━━
   IMAGE_GENERATION_FAILED: {
      code: 'IMAGE_GEN_001',
      message: "I couldn't generate that image. Let me try a different approach.",
      action: 'retry_simplified',
      userMessage: "Image generation failed. Please try rephrasing your request or simplifying the description."
   },
   IMAGE_CONTENT_BLOCKED: {
      code: 'IMAGE_GEN_002',
      message: "That request contains content I can't generate.",
      action: 'none',
      userMessage: "I'm unable to create that type of image. Please try a different description."
   },
   IMAGE_TIMEOUT: {
      code: 'IMAGE_GEN_003',
      message: "Image generation is taking longer than expected.",
      action: 'retry',
      userMessage: "This is taking a while. Would you like me to try again with a simpler prompt?"
   },
   NO_REFERENCE_IMAGE: {
      code: 'IMAGE_GEN_004',
      message: "I need a reference image for this personalization.",
      action: 'request_image',
      userMessage: "For personalized images (like putting your face in a scene), please upload a reference photo."
   },

   // ━━━━━━━━━━━━━━━━━━━━━━
   // EDITING FAILURES
   // ━━━━━━━━━━━━━━━━━━━━━━
   EDIT_NO_IMAGE: {
      code: 'EDIT_001',
      message: "I need an image to edit.",
      action: 'request_image',
      userMessage: "Please upload the image you'd like me to edit."
   },
   EDIT_UNCLEAR: {
      code: 'EDIT_002',
      message: "I'm not sure what changes you want.",
      action: 'clarify',
      userMessage: "Could you be more specific about what you'd like me to change in the image?"
   },
   EDIT_FAILED: {
      code: 'EDIT_003',
      message: "The edit couldn't be completed.",
      action: 'retry',
      userMessage: "I wasn't able to make that edit. Would you like to try a different modification?"
   },

   // ━━━━━━━━━━━━━━━━━━━━━━
   // SCHEDULING FAILURES
   // ━━━━━━━━━━━━━━━━━━━━━━
   SCHEDULE_NO_ACCOUNT: {
      code: 'SCHED_001',
      message: "No social account connected.",
      action: 'connect_account',
      userMessage: "Please connect your Instagram or LinkedIn account first to schedule posts."
   },
   SCHEDULE_INVALID_TIME: {
      code: 'SCHED_002',
      message: "That time isn't valid for scheduling.",
      action: 'clarify',
      userMessage: "Please provide a valid future date and time for scheduling."
   },
   SCHEDULE_NO_IMAGE: {
      code: 'SCHED_003',
      message: "I need an image to post.",
      action: 'request_image',
      userMessage: "Please provide or generate an image before scheduling the post."
   },
   SCHEDULE_FAILED: {
      code: 'SCHED_004',
      message: "Scheduling failed.",
      action: 'retry',
      userMessage: "I couldn't schedule the post. Please check your account connection and try again."
   },

   // ━━━━━━━━━━━━━━━━━━━━━━
   // SYSTEM FAILURES
   // ━━━━━━━━━━━━━━━━━━━━━━
   RATE_LIMITED: {
      code: 'SYS_001',
      message: "Too many requests.",
      action: 'wait',
      userMessage: "You're making requests too quickly. Please wait a moment and try again."
   },
   CREDITS_EXHAUSTED: {
      code: 'SYS_002',
      message: "No credits remaining.",
      action: 'upgrade',
      userMessage: "You've used all your image generation credits. Please upgrade your plan to continue."
   },
   SERVICE_UNAVAILABLE: {
      code: 'SYS_003',
      message: "Service temporarily unavailable.",
      action: 'retry_later',
      userMessage: "I'm experiencing technical difficulties. Please try again in a few minutes."
   },
   UNKNOWN_ERROR: {
      code: 'SYS_999',
      message: "Something unexpected happened.",
      action: 'retry',
      userMessage: "Something went wrong. Please try again or rephrase your request."
   }
};

class FailureHandler {
   static get(errorType) {
      return FAILURE_RESPONSES[errorType] || FAILURE_RESPONSES.UNKNOWN_ERROR;
   }

   static getUserMessage(errorType) {
      const failure = this.get(errorType);
      return failure.userMessage;
   }

   static format(errorType, customMessage = null) {
      const failure = this.get(errorType);
      return {
         success: false,
         code: failure.code,
         message: customMessage || failure.userMessage,
         action: failure.action
      };
   }

   static fromError(error) {
      const message = error?.message?.toLowerCase() || '';

      if (message.includes('rate limit')) return this.format('RATE_LIMITED');
      if (message.includes('timeout')) return this.format('IMAGE_TIMEOUT');
      if (message.includes('credit')) return this.format('CREDITS_EXHAUSTED');
      if (message.includes('blocked') || message.includes('safety')) return this.format('IMAGE_CONTENT_BLOCKED');
      if (message.includes('unavailable')) return this.format('SERVICE_UNAVAILABLE');

      return this.format('UNKNOWN_ERROR', error?.message);
   }
}

module.exports = { FailureHandler, FAILURE_RESPONSES };

