const Instagram = require('../../models/instagram');


const getAccountsTool = {
   name: 'get_instagram_accounts',
   description: 'Get list of connected Instagram accounts for the user. Use this when user asks about their accounts or before scheduling.',
   parameters: {},

   execute: async (params, context) => {
      const { userId } = context;

      if (!userId) {
         return { success: false, error: 'userId is required' };
      }

      try {
         const doc = await Instagram.findOne({ userId });

         if (!doc || !doc.accounts || doc.accounts.length === 0) {
            return {
               success: true,
               accounts: [],
               message: 'No Instagram accounts connected'
            };
         }

         const accounts = doc.accounts.map(acc => ({
            id: acc.instagramBusinessAccountId,
            username: acc.instagramUsername,
            name: acc.instagramName || acc.facebookPageName,
            profilePicture: acc.profilePictureUrl
         }));

         const usernames = accounts.map(a => a.username).filter(Boolean).join(', ');

         return {
            success: true,
            accounts,
            count: accounts.length,
            message: `You have ${accounts.length} connected account(s): ${usernames}`
         };
      } catch (error) {
         return { success: false, error: error.message };
      }
   }
};


module.exports = getAccountsTool;

