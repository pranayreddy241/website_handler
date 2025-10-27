const http = require('http');
const url = require('url');
// Use crypto for unique IDs since 'uuid' package isn't available offline
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');

// Load knowledge base from JSON file
const knowledgeBasePath = path.join(__dirname, 'knowledgeBase.json');
let knowledgeBase = {};
try {
  const kbData = fs.readFileSync(knowledgeBasePath, 'utf8');
  knowledgeBase = JSON.parse(kbData);
} catch (err) {
  console.warn('Knowledge base not found or invalid JSON; proceeding with an empty knowledge base.');
}

// In-memory storage for sessions
const sessions = {};

/**
 * Helper to generate a Lovable Build with URL link.
 * @param {string} prompt
 * @returns {string}
 */
function buildLovableUrl(prompt) {
  const baseUrl = 'https://lovable.dev/build';
  const encodedPrompt = encodeURIComponent(prompt);
  return `${baseUrl}?prompt=${encodedPrompt}`;
}

/**
 * Summarize text (stub). For now return trimmed text.
 * @param {string} text
 * @returns {string}
 */
function summarizeText(text) {
  return text.length > 300 ? text.substring(0, 300) + '…' : text;
}

/**
 * Extract meaningful content from a given URL.
 *
 * This helper attempts to fetch the HTML of the provided page and
 * extract useful context to inform the Lovable prompt. The function
 * looks at the page title, meta description and the first few
 * paragraphs of visible text. Network errors or very large pages
 * will cause the function to return an empty string so the system
 * can fall back on the user’s description and knowledge base. It
 * intentionally uses only built‑in Node.js modules (https/http) to
 * avoid the need for external packages.
 *
 * @param {string} pageUrl The URL to fetch and extract from
 * @returns {Promise<string>} A concise summary of the page
 */
async function extractContentFromUrl(pageUrl) {
  return new Promise((resolve) => {
    try {
      const { protocol, hostname, path: pathname } = new url.URL(pageUrl);
      const getter = protocol === 'https:' ? require('https') : require('http');
      const options = {
        hostname,
        path: pathname,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 AI Website Builder'
        }
      };
      const req = getter.request(options, (res) => {
        let html = '';
        res.on('data', (chunk) => {
          html += chunk.toString('utf8');
          // Avoid downloading extremely large pages
          if (html.length > 1_000_000) {
            req.destroy();
          }
        });
        res.on('end', () => {
          // Simple helpers to extract content
          const stripTags = (str) => str.replace(/<[^>]*>/g, '');
          const match = (regex) => {
            const m = regex.exec(html);
            return m ? stripTags(m[1]).trim() : '';
          };
          const title = match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const description = match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i);
          // Collect first two paragraphs
          const paragraphs = [];
          const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
          let pMatch;
          while (paragraphs.length < 2 && (pMatch = pRegex.exec(html))) {
            const text = stripTags(pMatch[1]).trim();
            if (text) paragraphs.push(text);
          }
          const combined = [];
          if (title) combined.push(title);
          if (description) combined.push(description);
          if (paragraphs.length) combined.push(paragraphs.join('\n'));
          const summary = summarizeText(combined.join('\n').replace(/\s+/g, ' ').trim());
          resolve(summary);
        });
      });
      req.on('error', () => {
        resolve('');
      });
      req.end();
    } catch (err) {
      // Invalid URL or other parsing issue
      resolve('');
    }
  });
}

/**
 * Build a prompt combining description, extracted content, knowledge base and feedback.
 * @param {object} params
 */
function createPrompt({ description, extractedContent, feedback }) {
  let prompt = '';
  if (description) prompt += `User description: ${description}\n`;
  if (extractedContent) prompt += `\nContent from source: ${extractedContent}\n`;
  if (knowledgeBase && knowledgeBase.designGuidelines) {
    prompt += '\nDesign guidelines:\n';
    knowledgeBase.designGuidelines.forEach((line) => {
      prompt += `- ${line}\n`;
    });
  }
  if (feedback && feedback.length > 0) {
    prompt += '\nPlease apply these updates based on user feedback:\n';
    feedback.forEach((fb) => {
      prompt += `- ${fb}\n`;
    });
  }
  return prompt.trim();
}

/**
 * Evaluate a generated website for basic structural qualities.
 *
 * Given a URL, this helper fetches the page and inspects the HTML to
 * count headings and images. It then returns a crude score and
 * suggestions. This is not a replacement for comprehensive user
 * feedback but can help the agent decide whether a site is worth
 * showing to the user.
 *
 * @param {string} siteUrl
 * @returns {Promise<{score: number, report: string}>}
 */
async function evaluateSite(siteUrl) {
  return new Promise((resolve) => {
    try {
      const { protocol, hostname, path: pathname } = new url.URL(siteUrl);
      const getter = protocol === 'https:' ? require('https') : require('http');
      const req = getter.request({
        hostname,
        path: pathname,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 AI Website Builder'
        }
      }, (res) => {
        let html = '';
        res.on('data', (chunk) => {
          html += chunk.toString('utf8');
          if (html.length > 1_000_000) req.destroy();
        });
        res.on('end', () => {
          const countTags = (tag) => {
            const regex = new RegExp(`<${tag}[^>]*>`, 'gi');
            return (html.match(regex) || []).length;
          };
          const h1 = countTags('h1');
          const h2 = countTags('h2');
          const images = countTags('img');
          let score = 0;
          let report = '';
          if (h1 >= 1) score += 30; else report += 'Add at least one main heading.\n';
          if (h2 >= 2) score += 20; else report += 'Use subheadings to structure content.\n';
          if (images >= 1) score += 20; else report += 'Include images to make the page visually engaging.\n';
          // Bonus for meta viewport tag
          if (/\bname=["']viewport["']/i.test(html)) score += 10; else report += 'Ensure the page is mobile-friendly (missing viewport meta tag).\n';
          // Cap at 100
          score = Math.min(100, score);
          resolve({ score, report: report.trim() });
        });
      });
      req.on('error', () => resolve({ score: 0, report: 'Failed to fetch page for evaluation.' }));
      req.end();
    } catch {
      resolve({ score: 0, report: 'Invalid URL for evaluation.' });
    }
  });
}

/**
 * Optionally fetch design inspiration snippets from the web.
 *
 * Given a user description, query a lightweight search engine
 * (DuckDuckGo’s HTML interface) for related websites and extract
 * snippets of text from the first couple of results. These snippets
 * can provide inspiration for the prompt by reflecting how similar
 * websites describe themselves. If the network call fails or returns
 * nothing useful, the function returns an empty string so the prompt
 * won’t be polluted with irrelevant data.
 *
 * @param {string} query The description or keyword to search for
 * @returns {Promise<string>} Concatenated snippets from top results
 */
async function fetchSimilarDesignSummaries(query) {
  return new Promise((resolve) => {
    if (!query) return resolve('');
    try {
      const encoded = encodeURIComponent(`${query} website`);
      const options = {
        hostname: 'duckduckgo.com',
        path: `/html/?q=${encoded}`,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 AI Website Builder'
        }
      };
      const req = require('https').request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk.toString('utf8');
          if (data.length > 500_000) {
            req.destroy();
          }
        });
        res.on('end', () => {
          const snippets = [];
          // DuckDuckGo result titles appear in <a class="result__a"> tags
          const regex = /<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;
          let match;
          while (snippets.length < 2 && (match = regex.exec(data))) {
            const text = match[1].replace(/<[^>]*>/g, '').trim();
            if (text) snippets.push(text);
          }
          resolve(snippets.join('\n'));
        });
      });
      req.on('error', () => resolve(''));
      req.end();
    } catch {
      resolve('');
    }
  });
}

/**
 * Parse JSON body from request
 */
function parseJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        resolve(json);
      } catch (err) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname } = parsedUrl;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/api/knowledge-base' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(knowledgeBase));
    return;
  }

  if (pathname === '/api/generate' && req.method === 'POST') {
    const body = await parseJson(req);
    const { description, url: sourceUrl, sessionId } = body;
    const id = sessionId || randomUUID();
    if (!sessions[id]) {
      sessions[id] = { description: '', extractedContent: '', feedback: [] };
    }
    let extractedContent = '';
    if (sourceUrl) {
      extractedContent = await extractContentFromUrl(sourceUrl);
    }
    // Fetch similar site summaries for additional inspiration
    const similarSnippets = await fetchSimilarDesignSummaries(description);
    // Combine extracted content with similar snippets if available
    const combinedExtracted = [extractedContent, similarSnippets].filter(Boolean).join('\n\n');
    sessions[id].description = description;
    sessions[id].extractedContent = combinedExtracted;
    const prompt = createPrompt({
      description,
      extractedContent: combinedExtracted,
      feedback: sessions[id].feedback
    });
    const buildUrl = buildLovableUrl(prompt);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ sessionId: id, buildUrl, summary: combinedExtracted }));
    return;
  }

  if (pathname === '/api/feedback' && req.method === 'POST') {
    const body = await parseJson(req);
    const { sessionId, feedback } = body;
    if (!sessionId || !sessions[sessionId]) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid session' }));
      return;
    }
    sessions[sessionId].feedback.push(feedback);
    const { description, extractedContent, feedback: allFeedback } = sessions[sessionId];
    const prompt = createPrompt({ description, extractedContent, feedback: allFeedback });
    const buildUrl = buildLovableUrl(prompt);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ buildUrl }));
    return;
  }

  // Endpoint to evaluate a generated site
  if (pathname === '/api/evaluate' && req.method === 'POST') {
    const body = await parseJson(req);
    const { url: siteUrl } = body;
    if (!siteUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'URL is required for evaluation' }));
      return;
    }
    const result = await evaluateSite(siteUrl);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
    return;
  }

  // Serve 404 for other endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});