/**
 * JARVIS S7B — Express server (alternative to /api/chat on Vercel)
 * Use this if you're deploying to Render, Railway, a VPS, or running
 * locally instead of Vercel's serverless functions.
 *
 * Start:  npm install && npm start
 * Env:    copy .env.example to .env and fill in ANTHROPIC_API_KEY
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.AI_MODEL || 'claude-sonnet-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 20;

const SYSTEM_PROMPT =
  'You are JARVIS S7B, a poised, precise AI assistant. Keep replies clear, ' +
  'helpful, and reasonably concise unless the user asks for depth.';

app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname))); // serves index.html, style.css, script.js

// Basic abuse protection on the AI route.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

app.post('/api/chat', chatLimiter, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set.');
    return res.status(500).json({
      error: 'AI backend is not configured. Set ANTHROPIC_API_KEY in your .env file.',
    });
  }

  const { message, history } = req.body || {};

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
      return res.status(502).json({ error: 'The AI provider returned an error. Please try again shortly.' });
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

    return res.json({ reply });
  } catch (err) {
    console.error('Chat handler failure:', err);
    return res.status(500).json({ error: 'Unexpected server error. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`JARVIS S7B server running on http://localhost:${PORT}`);
});
