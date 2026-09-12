/**
 * JARVIS S7B — Vercel Serverless Function
 * POST /api/chat
 *
 * Holds the AI API key server-side (never sent to the browser).
 * Deploy this project on Vercel and set ANTHROPIC_API_KEY as an
 * environment variable in the Vercel project settings.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 20;

const SYSTEM_PROMPT =
  'You are JARVIS S7B, a poised, precise AI assistant. Keep replies clear, ' +
  'helpful, and reasonably concise unless the user asks for depth.';

module.exports = async (req, res) => {
  // CORS: same-origin by default; adjust ALLOWED_ORIGIN if the frontend
  // is hosted on a different domain than this function.
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set.');
    return res.status(500).json({
      error: 'AI backend is not configured. Set ANTHROPIC_API_KEY in your deployment environment.',
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { message, history } = body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A non-empty "message" string is required.' });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` });
  }

  const safeHistory = Array.isArray(history)
    ? history
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-MAX_HISTORY_ITEMS)
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }))
    : [];

  const messages = [...safeHistory, { role: 'user', content: message.trim() }];

  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text();
      console.error('Anthropic API error:', upstream.status, errBody);
      return res.status(502).json({
        error: 'The AI provider returned an error. Please try again shortly.',
      });
    }

    const data = await upstream.json();
    const reply = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    if (!reply) {
      return res.status(502).json({ error: 'The AI provider returned an empty response.' });
    }

    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat handler failure:', err);
    return res.status(500).json({ error: 'Unexpected server error. Please try again.' });
  }
};
        
