const cheerio = require('cheerio');

const FETCH_TIMEOUT = 5000; // 5 seconds
const MAX_WORDS = 600;

class WebsiteExtractor {
   /**
    * Extract structured content from a website URL
    * @param {string} url - The URL to extract from
    * @returns {Promise<object>} Structured website data
    */
   async extract(url) {
      console.log('🌐 [EXTRACTOR] Fetching:', url);
      const startTime = Date.now();

      try {
         // Normalize URL
         if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
         }

         // Fetch with timeout
         const controller = new AbortController();
         const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

         const response = await fetch(url, {
            signal: controller.signal,
            headers: {
               'User-Agent': 'Mozilla/5.0 (compatible; VelosBot/1.0; +https://velosapps.com)',
               'Accept': 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
         });

         clearTimeout(timeout);

         if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
         }

         const html = await response.text();
         console.log('🌐 [EXTRACTOR] Fetched', html.length, 'bytes in', Date.now() - startTime, 'ms');

         // Parse with Cheerio
         const $ = cheerio.load(html);

         // Strip noise
         $('script, style, nav, footer, header, iframe, noscript, svg, form').remove();
         $('[class*="cookie"], [class*="popup"], [class*="modal"], [class*="banner"]').remove();
         $('[id*="cookie"], [id*="popup"], [id*="modal"], [id*="banner"]').remove();
         $('[hidden], [aria-hidden="true"]').remove();

         // Extract structured data
         const data = {
            url: url,
            title: this._cleanText($('title').text()) || '',
            metaDescription: this._cleanText($('meta[name="description"]').attr('content')) || '',
            ogTitle: this._cleanText($('meta[property="og:title"]').attr('content')) || '',
            ogDescription: this._cleanText($('meta[property="og:description"]').attr('content')) || '',
            h1: this._cleanText($('h1').first().text()) || '',
            h2s: [],
            heroText: '',
            keyBullets: [],
            mainContent: '',
         };

         // Get H2s (max 5)
         $('h2').slice(0, 5).each((i, el) => {
            const text = this._cleanText($(el).text());
            if (text && text.length > 3) data.h2s.push(text);
         });

         // Get hero/intro text (first major paragraph)
         const firstP = $('main p, article p, .hero p, section p').first().text();
         data.heroText = this._cleanText(firstP) || '';

         // Get bullet points
         $('ul li, ol li').slice(0, 8).each((i, el) => {
            const text = this._cleanText($(el).text());
            if (text && text.length > 10 && text.length < 200) {
               data.keyBullets.push(text);
            }
         });

         // Get main content (truncated)
         const bodyText = $('main, article, .content, section').text() || $('body').text();
         data.mainContent = this._truncateToWords(this._cleanText(bodyText), MAX_WORDS);

         // Build summary
         data.summary = this._buildSummary(data);

         console.log('🌐 [EXTRACTOR] Extracted:', {
            title: data.title?.slice(0, 50),
            h2Count: data.h2s.length,
            bulletCount: data.keyBullets.length,
            contentWords: data.mainContent.split(' ').length
         });

         return { success: true, data };

      } catch (error) {
         console.error('❌ [EXTRACTOR] Error:', error.message);
         return {
            success: false,
            error: error.name === 'AbortError' ? 'Request timeout' : error.message
         };
      }
   }

   _cleanText(text) {
      if (!text) return '';
      return text
         .replace(/\s+/g, ' ')
         .replace(/\n+/g, ' ')
         .trim();
   }

   _truncateToWords(text, maxWords) {
      const words = text.split(/\s+/);
      if (words.length <= maxWords) return text;
      return words.slice(0, maxWords).join(' ') + '...';
   }

   _buildSummary(data) {
      const parts = [];
      if (data.title) parts.push(`**${data.title}**`);
      if (data.metaDescription) parts.push(data.metaDescription);
      else if (data.ogDescription) parts.push(data.ogDescription);
      if (data.heroText) parts.push(data.heroText);
      if (data.keyBullets.length > 0) {
         parts.push('Key points: ' + data.keyBullets.slice(0, 3).join('; '));
      }
      return parts.join('\n\n');
   }
}

module.exports = WebsiteExtractor;

