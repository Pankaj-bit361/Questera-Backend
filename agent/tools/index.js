const generateImageTool = require('./generateImage');
const editImageTool = require('./editImage');
const schedulePostTool = require('./schedulePost');
const replyTool = require('./reply');
const getAccountsTool = require('./getAccounts');
const createVariationsTool = require('./createVariations');
const extractWebsiteTool = require('./extractWebsite');
const deepResearchTool = require('./deepResearch');
const autopilotTool = require('./autopilot');


const allTools = [
   generateImageTool,
   editImageTool,
   schedulePostTool,
   replyTool,
   getAccountsTool,
   createVariationsTool,
   extractWebsiteTool,
   deepResearchTool,
   autopilotTool
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
   autopilotTool,
   allTools
};

