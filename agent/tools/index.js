const generateImageTool = require('./generateImage');
const editImageTool = require('./editImage');
const schedulePostTool = require('./schedulePost');
const replyTool = require('./reply');
const getAccountsTool = require('./getAccounts');
const createVariationsTool = require('./createVariations');
const extractWebsiteTool = require('./extractWebsite');
const deepResearchTool = require('./deepResearch');


const allTools = [
   generateImageTool,
   editImageTool,
   schedulePostTool,
   replyTool,
   getAccountsTool,
   createVariationsTool,
   extractWebsiteTool,
   deepResearchTool
];


module.exports = {
   generateImageTool,
   editImageTool,
   schedulePostTool,
   replyTool,
   getAccountsTool,
   createVariationsTool,
   extractWebsiteTool,
   deepResearchTool,
   allTools
};

