const generateImageTool = require('./generateImage');
const editImageTool = require('./editImage');
const schedulePostTool = require('./schedulePost');
const replyTool = require('./reply');
const getAccountsTool = require('./getAccounts');
const createVariationsTool = require('./createVariations');
const extractWebsiteTool = require('./extractWebsite');
const deepResearchTool = require('./deepResearch');
const autopilotTool = require('./autopilot');
const generateVideoTool = require('./generateVideo');
const batchEditTool = require('./batchEdit');


const allTools = [
   generateImageTool,
   editImageTool,
   batchEditTool,
   schedulePostTool,
   replyTool,
   getAccountsTool,
   createVariationsTool,
   extractWebsiteTool,
   deepResearchTool,
   autopilotTool,
   generateVideoTool
];


module.exports = {
   generateImageTool,
   editImageTool,
   batchEditTool,
   schedulePostTool,
   replyTool,
   getAccountsTool,
   createVariationsTool,
   extractWebsiteTool,
   deepResearchTool,
   autopilotTool,
   generateVideoTool,
   allTools
};

