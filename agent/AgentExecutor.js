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
               // Single action complete - return result with cognitive layer
               return {
                  success: true,
                  result: toolResult,
                  toolUsed: response.tool,
                  thought: response.thought,
                  iterations,
                  // Pass through cognitive layer from tool
                  cognitive: toolResult.cognitive || null
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
               // Tool returns: { success, imageUrl, images: [...] } directly (not nested under data)
               // images[0] can be either a string URL or an object { mimeType, url }
               let imageUrl = toolResult.images?.[0] || toolResult.imageUrl || toolResult.data?.images?.[0] || toolResult.data?.imageUrl;

               // Handle case where imageUrl is an object like { mimeType: 'image/jpeg', url: '...' }
               if (imageUrl && typeof imageUrl === 'object' && imageUrl.url) {
                  imageUrl = imageUrl.url;
               }

               context.generatedImageUrl = imageUrl;
               console.log('🔗 [EXECUTOR] Generated imageUrl for posting:', imageUrl);

               // CRITICAL: Tell LLM to use THIS EXACT URL, not the old lastImageUrl
               messages.push({
                  role: 'user',
                  content: `Image generated successfully!

CRITICAL: Use this EXACT newly generated image URL for posting (do NOT use any other URL):
imageUrl: ${imageUrl}

Now call schedule_post with this EXACT imageUrl. Do NOT use lastImageUrl or any other image.`
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

      // Collect all image URLs from history for context
      const historyImageUrls = [];

      if (context.history && Array.isArray(context.history)) {
         for (const msg of context.history) {
            let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

            // For assistant messages with images, INCLUDE the actual URL so LLM knows it
            if (msg.imageUrl && msg.role === 'assistant') {
               historyImageUrls.push(msg.imageUrl);
               content = `[Image generated: ${msg.imageUrl}]`;
            }

            messages.push({
               role: msg.role === 'assistant' ? 'assistant' : 'user',
               content
            });
         }
      }

      // Add a context message with recent image URLs if any exist
      if (historyImageUrls.length > 0) {
         const recentImages = historyImageUrls.slice(-10); // Last 10 images
         const imageContext = `[RECENT_IMAGES_IN_CONVERSATION: ${JSON.stringify(recentImages)}]`;
         messages.push({
            role: 'system',
            content: imageContext
         });
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

   /**
    * Run agent with streaming - emits events for real-time UI updates
    * @param {Object} input - User input
    * @param {Object} context - Context including userId, chatId, etc.
    * @param {Function} emit - Callback to emit SSE events
    * @returns {Promise<Object>} Final result
    */
   async runStream(input, context = {}, emit) {
      const messages = this.buildMessages(input, context);
      let iterations = 0;

      // Emit initial thinking state
      emit({ type: 'thinking', data: { stage: 'analyzing', message: 'Understanding your request...' } });

      while (iterations < this.maxIterations) {
         iterations++;

         console.log('🧠 [EXECUTOR-STREAM] Calling LLM, iteration:', iterations);
         emit({ type: 'thinking', data: { stage: 'reasoning', message: 'Deciding best approach...', iteration: iterations } });

         // For streaming, we need to collect the full response first to parse JSON
         // But we can stream the thinking process
         let fullResponse = '';
         let lastEmitTime = Date.now();

         try {
            // Use streaming to show progress, but collect full text for JSON parsing
            fullResponse = await this.llm.chatWithStream(
               [{ role: 'system', content: 'Respond with valid JSON only. No markdown, no explanations.' }, ...messages],
               {
                  onToken: (token, accumulated) => {
                     // Emit progress every 100ms to avoid flooding
                     if (Date.now() - lastEmitTime > 100) {
                        emit({ type: 'progress', data: { length: accumulated.length } });
                        lastEmitTime = Date.now();
                     }
                  }
               }
            );
         } catch (error) {
            console.error('❌ [EXECUTOR-STREAM] LLM error:', error.message);
            emit({ type: 'error', data: { message: error.message } });
            return { success: false, message: error.message, iterations };
         }

         // Parse the JSON response
         const response = this.llm.parseJSON(fullResponse, {});
         console.log('🧠 [EXECUTOR-STREAM] LLM response:', JSON.stringify(response).slice(0, 300));

         if (response.finalAnswer !== undefined) {
            // Stream the final answer token by token for chat responses
            emit({ type: 'answer_start', data: { thought: response.thought } });

            const words = response.finalAnswer.split(' ');
            for (let i = 0; i < words.length; i++) {
               emit({ type: 'token', data: { token: (i > 0 ? ' ' : '') + words[i] } });
               // Small delay for visual effect
               await new Promise(r => setTimeout(r, 20));
            }

            emit({ type: 'answer_end', data: {} });

            return {
               success: true,
               message: response.finalAnswer,
               data: response.data || {},
               thought: response.thought,
               iterations
            };
         }

         if (response.tool) {
            // Emit tool call event
            emit({
               type: 'tool_call',
               data: {
                  tool: response.tool,
                  thought: response.thought,
                  params: response.params
               }
            });

            const toolResult = await this.executeTool(response.tool, response.params, context);

            // Emit tool result
            emit({
               type: 'tool_result',
               data: {
                  tool: response.tool,
                  success: toolResult.success,
                  cognitive: toolResult.cognitive
               }
            });

            // Check if this is a multi-step workflow
            const isGenerateAndPost = context.routerIntent === 'generate_and_post';
            const isWebsiteContent = context.routerIntent === 'website_content';
            const isGenerateStep = response.tool === 'generate_image';
            const isExtractStep = response.tool === 'extract_website';

            const shouldContinueToPost = isGenerateAndPost && isGenerateStep && toolResult.success;
            const shouldContinueToGenerate = isWebsiteContent && isExtractStep && toolResult.success;

            if (toolResult.success && !shouldContinueToPost && !shouldContinueToGenerate) {
               emit({ type: 'complete', data: { toolUsed: response.tool } });
               return {
                  success: true,
                  result: toolResult,
                  toolUsed: response.tool,
                  thought: response.thought,
                  iterations,
                  cognitive: toolResult.cognitive || null
               };
            }

            if (toolResult.success && shouldContinueToGenerate) {
               emit({ type: 'thinking', data: { stage: 'multi_step', message: 'Website analyzed, creating content...' } });

               messages.push({ role: 'assistant', content: JSON.stringify(response) });
               const websiteData = toolResult.websiteData;
               context.websiteData = websiteData;
               messages.push({
                  role: 'user',
                  content: `Website extracted successfully. Brand context:
- Title: ${websiteData?.title || 'N/A'}
- Description: ${websiteData?.description || 'N/A'}
- Headline: ${websiteData?.headline || 'N/A'}
- Key Points: ${websiteData?.keyPoints?.join(', ') || 'N/A'}

Now create an engaging image and/or content for this brand based on the original user request.`
               });
               continue;
            }

            if (toolResult.success && shouldContinueToPost) {
               emit({ type: 'thinking', data: { stage: 'multi_step', message: 'Image created, scheduling post...' } });

               messages.push({ role: 'assistant', content: JSON.stringify(response) });
               let imageUrl = toolResult.images?.[0] || toolResult.imageUrl || toolResult.data?.images?.[0];
               if (imageUrl && typeof imageUrl === 'object' && imageUrl.url) {
                  imageUrl = imageUrl.url;
               }
               context.generatedImageUrl = imageUrl;
               messages.push({
                  role: 'user',
                  content: `Image generated successfully! imageUrl: ${imageUrl}\nNow call schedule_post with this EXACT imageUrl.`
               });
               continue;
            }

            // Tool failed - retry
            emit({ type: 'thinking', data: { stage: 'retry', message: 'Adjusting approach...' } });
            messages.push({ role: 'assistant', content: JSON.stringify(response) });
            messages.push({ role: 'user', content: `Tool failed: ${JSON.stringify(toolResult)}. Try again.` });
            continue;
         }

         console.log('⚠️ [EXECUTOR-STREAM] No finalAnswer or tool in response');
         emit({ type: 'error', data: { message: 'Invalid response from agent' } });
         return { success: false, message: 'Agent returned invalid response', data: response, iterations };
      }

      emit({ type: 'error', data: { message: 'Max iterations reached' } });
      return { success: false, message: 'Max iterations reached', iterations };
   }
}


module.exports = AgentExecutor;

