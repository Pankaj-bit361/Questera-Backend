/**
 * Telemetry & Logging System for Agent Improvement
 * Tracks prompts, intents, failures, and user feedback
 */

const fs = require('fs').promises;
const path = require('path');

// In-memory buffer for batch writing
let logBuffer = [];
const BUFFER_FLUSH_SIZE = 10;
const LOG_DIR = path.join(__dirname, '../logs');

const LogTypes = {
   INTENT_CLASSIFICATION: 'intent',
   IMAGE_GENERATION: 'image_gen',
   IMAGE_EDIT: 'image_edit',
   PROMPT_ENRICHMENT: 'enrichment',
   FAILURE: 'failure',
   USER_FEEDBACK: 'feedback',
   CLARIFICATION: 'clarification'
};

class Telemetry {
   static async init() {
      try {
         await fs.mkdir(LOG_DIR, { recursive: true });
      } catch (err) {
         console.warn('⚠️ [TELEMETRY] Could not create log directory:', err.message);
      }
   }

   static async log(type, data) {
      const entry = {
         timestamp: new Date().toISOString(),
         type,
         ...data
      };

      console.log(`📊 [TELEMETRY] ${type}:`, JSON.stringify(data).slice(0, 100));
      
      logBuffer.push(entry);

      if (logBuffer.length >= BUFFER_FLUSH_SIZE) {
         await this.flush();
      }

      return entry;
   }

   // ━━━━━━━━━━━━━━━━━━━━━━
   // SPECIFIC LOGGING METHODS
   // ━━━━━━━━━━━━━━━━━━━━━━

   static async logIntent(userId, message, intent, confidence, needsClarification) {
      return this.log(LogTypes.INTENT_CLASSIFICATION, {
         userId,
         message: message?.slice(0, 200),
         intent,
         confidence,
         needsClarification
      });
   }

   static async logImageGeneration(userId, prompt, enrichedPrompt, wasEnriched, success, imageUrl) {
      return this.log(LogTypes.IMAGE_GENERATION, {
         userId,
         originalPrompt: prompt?.slice(0, 300),
         enrichedPrompt: enrichedPrompt?.slice(0, 300),
         wasEnriched,
         success,
         hasImage: !!imageUrl
      });
   }

   static async logFailure(userId, errorType, errorCode, action, context) {
      return this.log(LogTypes.FAILURE, {
         userId,
         errorType,
         errorCode,
         action,
         context: context?.slice?.(0, 200) || context
      });
   }

   static async logFeedback(userId, chatId, messageId, rating, comment) {
      return this.log(LogTypes.USER_FEEDBACK, {
         userId,
         chatId,
         messageId,
         rating,  // 1-5 or thumbs up/down
         comment: comment?.slice(0, 500)
      });
   }

   static async logClarification(userId, originalMessage, clarificationQuestion, routerIntent) {
      return this.log(LogTypes.CLARIFICATION, {
         userId,
         originalMessage: originalMessage?.slice(0, 200),
         clarificationQuestion,
         routerIntent
      });
   }

   // ━━━━━━━━━━━━━━━━━━━━━━
   // BATCH OPERATIONS
   // ━━━━━━━━━━━━━━━━━━━━━━

   static async flush() {
      if (logBuffer.length === 0) return;

      const toFlush = [...logBuffer];
      logBuffer = [];

      try {
         const date = new Date().toISOString().split('T')[0];
         const logFile = path.join(LOG_DIR, `telemetry-${date}.jsonl`);
         const lines = toFlush.map(entry => JSON.stringify(entry)).join('\n') + '\n';
         await fs.appendFile(logFile, lines);
         console.log(`📊 [TELEMETRY] Flushed ${toFlush.length} entries to ${logFile}`);
      } catch (err) {
         console.error('❌ [TELEMETRY] Flush failed:', err.message);
         // Put entries back in buffer
         logBuffer = [...toFlush, ...logBuffer];
      }
   }

   // ━━━━━━━━━━━━━━━━━━━━━━
   // ANALYTICS HELPERS
   // ━━━━━━━━━━━━━━━━━━━━━━

   static async getWeeklyStats() {
      // Read last 7 days of logs and aggregate
      const stats = {
         totalRequests: 0,
         intents: { generate_image: 0, edit_image: 0, schedule_post: 0, chat: 0 },
         failures: {},
         avgConfidence: 0,
         clarificationsNeeded: 0,
         enrichmentRate: 0
      };

      try {
         const files = await fs.readdir(LOG_DIR);
         const recentFiles = files
            .filter(f => f.startsWith('telemetry-') && f.endsWith('.jsonl'))
            .sort()
            .slice(-7);

         for (const file of recentFiles) {
            const content = await fs.readFile(path.join(LOG_DIR, file), 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            
            for (const line of lines) {
               try {
                  const entry = JSON.parse(line);
                  stats.totalRequests++;
                  
                  if (entry.type === 'intent' && entry.intent) {
                     stats.intents[entry.intent] = (stats.intents[entry.intent] || 0) + 1;
                  }
                  if (entry.type === 'failure' && entry.errorType) {
                     stats.failures[entry.errorType] = (stats.failures[entry.errorType] || 0) + 1;
                  }
               } catch (e) { /* skip malformed */ }
            }
         }
      } catch (err) {
         console.warn('⚠️ [TELEMETRY] Could not read stats:', err.message);
      }

      return stats;
   }
}

// Initialize on load
Telemetry.init();

module.exports = { Telemetry, LogTypes };

