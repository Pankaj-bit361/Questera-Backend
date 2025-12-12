const generateImageTool = require('./generateImage');
const editImageTool = require('./editImage');
const schedulePostTool = require('./schedulePost');
const replyTool = require('./reply');
const getAccountsTool = require('./getAccounts');
const createVariationsTool = require('./createVariations');


const allTools = [
   generateImageTool,
   editImageTool,
   schedulePostTool,
   replyTool,
   getAccountsTool,
   createVariationsTool
];


module.exports = {
   generateImageTool,
   editImageTool,
   schedulePostTool,
   replyTool,
   getAccountsTool,
   createVariationsTool,
   allTools
};

