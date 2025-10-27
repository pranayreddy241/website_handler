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
 * Extract content from URL. Not implemented due to network limitations.
 * Returns empty string.
 */
async function extractContentFromUrl() {
  return '';
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
    sessions[id].description = description;
    sessions[id].extractedContent = extractedContent;
    const prompt = createPrompt({
      description,
      extractedContent,
      feedback: sessions[id].feedback
    });
    const buildUrl = buildLovableUrl(prompt);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ sessionId: id, buildUrl }));
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

  // Serve 404 for other endpoints
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});