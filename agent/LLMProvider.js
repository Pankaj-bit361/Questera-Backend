class LLMProvider {
   constructor(config = {}) {
      this.config = config;
   }

   async chat(messages, options = {}) {
      throw new Error('chat() must be implemented by subclass');
   }

   async chatJSON(messages, options = {}) {
      throw new Error('chatJSON() must be implemented by subclass');
   }
}


class OpenRouterProvider extends LLMProvider {
   constructor(config = {}) {
      super(config);
      this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
      this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
      this.model = config.model || 'x-ai/grok-4.1-fast';
   }

   async chat(messages, options = {}) {
      const { temperature = 0.7, maxTokens = 4096 } = options;

      console.log('🌐 [LLM] Calling OpenRouter with model:', this.model);
      const response = await fetch(this.baseUrl, {
         method: 'POST',
         headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://velosapps.com',
            'X-Title': 'Questera AI'
         },
         body: JSON.stringify({
            model: this.model,
            messages,
            temperature,
            max_tokens: maxTokens
         })
      });

      if (!response.ok) {
         const errorText = await response.text();
         console.error('❌ [LLM] OpenRouter error:', response.status, errorText);
         throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      console.log('✅ [LLM] Response received, length:', content.length);
      if (!content) {
         console.warn('⚠️ [LLM] Empty response from OpenRouter:', JSON.stringify(data).slice(0, 200));
      }
      return content;
   }

   /**
    * Stream chat completion - yields tokens as they arrive
    * @param {Array} messages - Chat messages
    * @param {Object} options - Options including onToken callback
    * @yields {string} Token chunks
    */
   async *chatStream(messages, options = {}) {
      const { temperature = 0.7, maxTokens = 4096 } = options;

      console.log('🌐 [LLM] Starting stream with model:', this.model);
      const response = await fetch(this.baseUrl, {
         method: 'POST',
         headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://velosapps.com',
            'X-Title': 'Questera AI'
         },
         body: JSON.stringify({
            model: this.model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true
         })
      });

      if (!response.ok) {
         const errorText = await response.text();
         console.error('❌ [LLM] OpenRouter stream error:', response.status, errorText);
         throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
         while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
               const trimmed = line.trim();
               if (!trimmed || trimmed === 'data: [DONE]') continue;
               if (!trimmed.startsWith('data: ')) continue;

               try {
                  const json = JSON.parse(trimmed.slice(6));
                  const delta = json.choices?.[0]?.delta?.content;
                  if (delta) {
                     yield delta;
                  }
               } catch (e) {
                  // Skip malformed JSON
               }
            }
         }
      } finally {
         reader.releaseLock();
      }
   }

   /**
    * Stream chat and collect full response
    * @param {Array} messages - Chat messages
    * @param {Function} onToken - Callback for each token
    * @returns {Promise<string>} Full response text
    */
   async chatWithStream(messages, options = {}) {
      const { onToken, ...restOptions } = options;
      let fullText = '';

      for await (const token of this.chatStream(messages, restOptions)) {
         fullText += token;
         if (onToken) {
            onToken(token, fullText);
         }
      }

      console.log('✅ [LLM] Stream complete, length:', fullText.length);
      return fullText;
   }

   async chatJSON(messages, options = {}) {
      const jsonMessages = [
         {
            role: 'system',
            content: 'Respond with valid JSON only. No markdown, no explanations.'
         },
         ...messages
      ];

      const text = await this.chat(jsonMessages, options);
      const parsed = this.parseJSON(text, options.fallback || {});
      if (Object.keys(parsed).length === 0 && text) {
         console.warn('⚠️ [LLM] Failed to parse JSON from:', text.slice(0, 200));
      }
      return parsed;
   }

   parseJSON(text, fallback = {}) {
      let cleaned = (text || '').trim();

      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
      cleaned = cleaned.trim();

      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleaned = jsonMatch[0];

      try {
         return JSON.parse(cleaned);
      } catch {
         return fallback;
      }
   }
}


class AnthropicProvider extends LLMProvider {
   constructor(config = {}) {
      super(config);
      this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
      this.baseUrl = 'https://api.anthropic.com/v1/messages';
      this.model = config.model || 'claude-3-haiku-20240307';
   }

   async chat(messages, options = {}) {
      const { temperature = 0.7, maxTokens = 4096 } = options;

      const systemMsg = messages.find(m => m.role === 'system');
      const otherMsgs = messages.filter(m => m.role !== 'system');

      const response = await fetch(this.baseUrl, {
         method: 'POST',
         headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01'
         },
         body: JSON.stringify({
            model: this.model,
            max_tokens: maxTokens,
            temperature,
            system: systemMsg?.content || '',
            messages: otherMsgs.map(m => ({
               role: m.role === 'assistant' ? 'assistant' : 'user',
               content: m.content
            }))
         })
      });

      if (!response.ok) {
         const error = await response.text();
         throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.content?.[0]?.text || '';
   }

   async chatJSON(messages, options = {}) {
      const jsonMessages = [
         { role: 'system', content: 'Respond with valid JSON only. No markdown.' },
         ...messages
      ];

      const text = await this.chat(jsonMessages, options);

      let cleaned = (text || '').trim();
      if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
      else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
      if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

      const jsonMatch = cleaned.trim().match(/\{[\s\S]*\}/);
      if (jsonMatch) cleaned = jsonMatch[0];

      try {
         return JSON.parse(cleaned);
      } catch {
         return options.fallback || {};
      }
   }
}


module.exports = { LLMProvider, OpenRouterProvider, AnthropicProvider };

