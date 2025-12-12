const ToolRegistry = require('./ToolRegistry');


class AgentExecutor {
   constructor(options = {}) {
      this.llm = options.llm;
      this.tools = options.tools || new ToolRegistry();
      this.systemPrompt = options.systemPrompt || '';
      this.maxIterations = options.maxIterations || 5;
      this.onToolCall = options.onToolCall || null;
      this.onToolResult = options.onToolResult || null;
   }

   buildSystemPrompt() {
      const toolDefs = this.tools.getToolsForPrompt();

      return `${this.systemPrompt}

You have access to these tools:

${toolDefs}

IMPORTANT: You MUST respond with valid JSON only. Never respond with plain text.

To use a tool, respond with this exact JSON format:
{
   "thought": "your reasoning",
   "tool": "tool_name",
   "params": { ... }
}

For conversations (questions, greetings, help), respond with:
{
   "thought": "your reasoning",
   "finalAnswer": "your response to user"
}

RULES:
- ALWAYS use a tool when user wants to generate, edit, or create images
- For image generation requests with reference images, use generate_image tool
- For editing existing images, use edit_image tool
- NEVER output plain text - always use JSON format
- NEVER mimic previous outputs - always call the appropriate tool`;
   }

   async run(input, context = {}) {
      const messages = this.buildMessages(input, context);
      let iterations = 0;

      while (iterations < this.maxIterations) {
         iterations++;

         console.log('🧠 [EXECUTOR] Calling LLM, iteration:', iterations);
         const response = await this.llm.chatJSON(messages, { fallback: {} });
         console.log('🧠 [EXECUTOR] LLM response:', JSON.stringify(response).slice(0, 300));

         if (response.finalAnswer !== undefined) {
            return {
               success: true,
               message: response.finalAnswer,
               data: response.data || {},
               thought: response.thought,
               iterations
            };
         }

         if (response.tool) {
            const toolResult = await this.executeTool(response.tool, response.params, context);

            // Check if this is a multi-step workflow
            const isGenerateAndPost = context.routerIntent === 'generate_and_post';
            const isWebsiteContent = context.routerIntent === 'website_content';
            const isGenerateStep = response.tool === 'generate_image';
            const isExtractStep = response.tool === 'extract_website';

            // Determine if we should continue to next step
            const shouldContinueToPost = isGenerateAndPost && isGenerateStep && toolResult.success;
            const shouldContinueToGenerate = isWebsiteContent && isExtractStep && toolResult.success;

            if (toolResult.success && !shouldContinueToPost && !shouldContinueToGenerate) {
               // Single action complete - return result
               return {
                  success: true,
                  result: toolResult,
                  toolUsed: response.tool,
                  iterations
               };
            }

            if (toolResult.success && shouldContinueToGenerate) {
               // Multi-step: website extracted, now generate content with brand context
               console.log('🌐 [EXECUTOR] Website extracted, continuing to generate content...');

               messages.push({
                  role: 'assistant',
                  content: JSON.stringify(response)
               });

               // Pass website data as context for image generation
               const websiteData = toolResult.websiteData;
               context.websiteData = websiteData;

               messages.push({
                  role: 'user',
                  content: `Website extracted successfully. Brand context:
- Title: ${websiteData?.title || 'N/A'}
- Description: ${websiteData?.description || 'N/A'}
- Headline: ${websiteData?.headline || 'N/A'}
- Key Points: ${websiteData?.keyPoints?.join(', ') || 'N/A'}

Now create an engaging image and/or content for this brand based on the original user request. Use this context to make it relevant and on-brand.`
               });

               continue;
            }

            if (toolResult.success && shouldContinueToPost) {
               // Multi-step: image generated, now continue to post
               console.log('🔗 [EXECUTOR] Multi-step workflow: image generated, continuing to post...');

               messages.push({
                  role: 'assistant',
                  content: JSON.stringify(response)
               });

               // Store the generated image URL for the next step
               const imageUrl = toolResult.data?.images?.[0] || toolResult.data?.imageUrl;
               context.generatedImageUrl = imageUrl;

               messages.push({
                  role: 'user',
                  content: `Image generated successfully: ${imageUrl}. Now proceed to post this image to the user's Instagram as requested. Use the schedule_post tool.`
               });

               continue;
            }

            // Tool failed - add to messages and retry
            messages.push({
               role: 'assistant',
               content: JSON.stringify(response)
            });

            messages.push({
               role: 'user',
               content: `Tool failed: ${JSON.stringify(toolResult)}. Try again or use a different approach.`
            });

            continue;
         }

         console.log('⚠️ [EXECUTOR] No finalAnswer or tool in response:', JSON.stringify(response));
         return {
            success: false,
            message: 'Agent returned invalid response',
            data: response,
            iterations
         };
      }

      return {
         success: false,
         message: 'Max iterations reached',
         iterations
      };
   }

   buildMessages(input, context) {
      const messages = [
         { role: 'system', content: this.buildSystemPrompt() }
      ];

      if (context.history && Array.isArray(context.history)) {
         for (const msg of context.history) {
            let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

            // For assistant messages with images, show a simplified summary (not as tool call to avoid confusion)
            if (msg.imageUrl && msg.role === 'assistant') {
               content = `[Image was generated successfully]`;
            }

            messages.push({
               role: msg.role === 'assistant' ? 'assistant' : 'user',
               content
            });
         }
      }

      let userContent = input.message || input;

      if (input.images && input.images.length > 0) {
         userContent += `\n\n[User attached ${input.images.length} reference image(s) for face/style preservation]`;
      }

      if (context.lastImageUrl) {
         userContent += `\n\n[Previous image available for editing: ${context.lastImageUrl}]`;
      }

      messages.push({ role: 'user', content: userContent });

      return messages;
   }

   async executeTool(name, params, context) {
      if (!this.tools.has(name)) {
         return { error: `Tool not found: ${name}` };
      }

      if (this.onToolCall) {
         this.onToolCall(name, params);
      }

      try {
         const result = await this.tools.execute(name, params, context);

         if (this.onToolResult) {
            this.onToolResult(name, result);
         }

         return result;
      } catch (error) {
         return { error: error.message };
      }
   }
}


module.exports = AgentExecutor;

