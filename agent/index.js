const AgentExecutor = require('./AgentExecutor');
const ToolRegistry = require('./ToolRegistry');
const { LLMProvider, OpenRouterProvider, AnthropicProvider } = require('./LLMProvider');
const { ImageAgent, createImageAgent } = require('./ImageAgent');
const RouterAgent = require('./RouterAgent');
const PromptValidator = require('./PromptValidator');
const { FailureHandler, FAILURE_RESPONSES } = require('./FailureResponses');
const { PlatformDefaults, PLATFORM_DEFAULTS } = require('./PlatformDefaults');
const { Telemetry, LogTypes } = require('./Telemetry');
const WebsiteExtractor = require('./WebsiteExtractor');
const DeepResearch = require('./DeepResearch');


function createAgent(options = {}) {
   const {
      provider = 'openrouter',
      model,
      apiKey,
      tools = [],
      systemPrompt = '',
      maxIterations = 5,
      onToolCall,
      onToolResult
   } = options;

   let llm;

   switch (provider) {
      case 'anthropic':
         llm = new AnthropicProvider({ model, apiKey });
         break;
      case 'openrouter':
      default:
         llm = new OpenRouterProvider({ model, apiKey });
         break;
   }

   const registry = new ToolRegistry();
   registry.registerMany(tools);

   return new AgentExecutor({
      llm,
      tools: registry,
      systemPrompt,
      maxIterations,
      onToolCall,
      onToolResult
   });
}


function defineTool(config) {
   return {
      name: config.name,
      description: config.description,
      parameters: config.parameters || {},
      execute: config.execute
   };
}


module.exports = {
   // Core Agent
   AgentExecutor,
   ToolRegistry,
   LLMProvider,
   OpenRouterProvider,
   AnthropicProvider,
   ImageAgent,
   createAgent,
   createImageAgent,
   defineTool,
   // New Systems
   RouterAgent,
   PromptValidator,
   FailureHandler,
   FAILURE_RESPONSES,
   PlatformDefaults,
   PLATFORM_DEFAULTS,
   Telemetry,
   LogTypes,
   // Website & Research
   WebsiteExtractor,
   DeepResearch
};

