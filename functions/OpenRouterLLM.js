/**
 * OpenRouter LLM Service
 * Uses OpenRouter API for text generation with various models
 */
class OpenRouterLLM {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY;
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.model = 'google/gemini-2.5-flash-lite-preview-09-2025'; // Fast thinking model
  }

  /**
   * Generate text using OpenRouter API
   * @param {string} prompt - The prompt to send
   * @param {object} options - Optional settings
   * @returns {string} - The generated text
   */
  async generateText(prompt, options = {}) {
    const {
      systemPrompt = '',
      temperature = 0.7,
      maxTokens = 4096,
      reasoning = false,
    } = options;

    const messages = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }

    messages.push({
      role: 'user',
      content: prompt
    });

    const requestBody = {
      model: this.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    // Enable reasoning for complex tasks
    if (reasoning) {
      requestBody.reasoning = { enabled: true };
    }

    try {
      console.log('🤖 [OPENROUTER] Calling API with model:', this.model);

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://velosapps.com',
          'X-Title': 'Questera AI'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [OPENROUTER] API error:', response.status, errorText);
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from OpenRouter');
      }

      const content = data.choices[0].message.content;
      console.log('✅ [OPENROUTER] Response received, length:', content?.length || 0);

      return content;
    } catch (error) {
      console.error('❌ [OPENROUTER] Error:', error.message);
      throw error;
    }
  }

  /**
   * Generate JSON response using OpenRouter
   * @param {string} prompt - The prompt to send
   * @param {object} options - Optional settings
   * @returns {object} - Parsed JSON response
   */
  async generateJSON(prompt, options = {}) {
    // Wrap the prompt with strong JSON instructions
    const jsonPrompt = `${prompt}

CRITICAL INSTRUCTIONS:
1. You MUST respond with ONLY a valid JSON object
2. Do NOT include any text before or after the JSON
3. Do NOT use markdown code blocks
4. Start your response with { and end with }
5. Ensure all strings are properly escaped`;

    const text = await this.generateText(jsonPrompt, {
      ...options,
      systemPrompt: 'You are a JSON-only response bot. You MUST always respond with valid JSON and nothing else. Never include explanations, markdown, or text outside the JSON object.'
    });

    // Clean and parse JSON
    let cleaned = (text || '').trim();

    // Remove markdown code blocks if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    // Try to extract JSON object if wrapped in text
    const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      cleaned = jsonObjectMatch[0];
    }

    // Try to extract JSON array if that's what we expect
    const jsonArrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonObjectMatch && jsonArrayMatch) {
      cleaned = jsonArrayMatch[0];
    }

    try {
      return JSON.parse(cleaned);
    } catch (error) {
      console.warn('⚠️ [OPENROUTER] JSON parse failed:', error.message);
      console.warn('⚠️ [OPENROUTER] Raw response (first 300 chars):', (text || '').slice(0, 300));
      return options.fallback || {};
    }
  }
}

module.exports = OpenRouterLLM;

