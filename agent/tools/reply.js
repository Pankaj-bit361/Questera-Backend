const replyTool = {
   name: 'reply',
   description: 'Reply to user with a text message. Use this for answering questions, having conversations, providing help, or when no image action is needed.',
   parameters: {
      message: {
         type: 'string',
         required: true,
         description: 'The message to send to the user'
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

