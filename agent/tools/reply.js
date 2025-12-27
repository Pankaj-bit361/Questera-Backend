const replyTool = {
   name: 'reply',
   description: `Send a text response to the user. The default conversational tool.

WHEN TO USE:
- User asks a QUESTION that needs a text answer
- User wants to CHAT, have a conversation, or discuss ideas
- User needs HELP, guidance, or explanation
- User's request is UNCLEAR and needs clarification
- User greets you or says hello/hi/hey
- User says thank you or expresses gratitude
- Providing status updates or confirmations
- Explaining what you did or will do
- When NO other tool is appropriate

WHEN NOT TO USE:
- User clearly wants an IMAGE generated → use generate_image
- User wants to EDIT an image → use edit_image
- User wants to POST/SCHEDULE → use schedule_post
- User wants RESEARCH → use deep_research
- User provides a WEBSITE URL for brand content → use extract_website
- User wants VARIATIONS of an image → use create_variations
- User asks about their ACCOUNTS → use get_instagram_accounts
- User wants to manage AUTOPILOT → use autopilot

RESPONSE GUIDELINES:
- Be helpful, friendly, and concise
- Ask clarifying questions when request is ambiguous
- Suggest next steps when appropriate
- Keep responses focused and actionable
- Use emojis sparingly but appropriately
- Don't be overly verbose - get to the point

EXAMPLES OF WHEN TO USE:
- "Hi!" → reply with greeting
- "What can you do?" → reply explaining capabilities
- "Thanks!" → reply acknowledging
- "How does this work?" → reply with explanation
- "I'm not sure what I want" → reply asking clarifying questions
- "What do you think about this?" → reply with opinion/suggestion

EXAMPLES OF WHEN NOT TO USE:
- "Create an image of a sunset" → DON'T reply, use generate_image
- "Post this to Instagram" → DON'T reply, use schedule_post
- "Edit the background" → DON'T reply, use edit_image

TONE:
- Professional but friendly
- Helpful and proactive
- Clear and concise
- Encouraging and supportive`,

   parameters: {
      message: {
         type: 'string',
         required: true,
         description: 'The text message to send to the user. Be clear, helpful, and concise.',
         example: 'I\'d be happy to help! What kind of content would you like to create today?'
      }
   },

   execute: async (params, context) => {
      return {
         success: true,
         message: params.message,
         type: 'text'
      };
   }
};


module.exports = replyTool;

