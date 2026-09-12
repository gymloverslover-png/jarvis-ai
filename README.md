# JARVIS S7B

A futuristic, dark-themed AI chat interface with voice input, text-to-speech
replies, local chat history, and a secure backend that keeps your AI API key
off the client.

---

## 1. What's actually in this project

| File | Purpose |
|---|---|
| `index.html` | Page structure — header, chat log, composer, settings drawer |
| `style.css` | Dark HUD theme, animations, responsive layout |
| `script.js` | Chat logic, voice input (Speech Recognition), text-to-speech, localStorage history, settings |
| `api/chat.js` | **Vercel serverless function** — calls the Anthropic API using your server-side key |
| `server.js` | **Express alternative** — same job as `api/chat.js`, for Render/Railway/VPS/local |
| `package.json` | Dependencies for the Express variant (`server.js`) |
| `.env.example` | Template for your real API key — copy to `.env`, never commit `.env` |
| `.gitignore` | Keeps `.env`, `node_modules/`, and OS junk out of Git |
| `vercel.json` | Serverless function config for Vercel |

**Important truth about this stack:** a real AI backend needs a server to hold
the API key. GitHub Pages only serves static files — it **cannot** run
`api/chat.js` or `server.js`. So:

- If you deploy to **GitHub Pages**, the site will load, but the chat will
  show the "AI backend not configured" error, because there's no server to
  answer `/api/chat`. This is not a bug to "fix" with a fake success message —
  it's a real platform limitation. Use it only if you intend to point the
  frontend at a backend hosted elsewhere (see `endpointInput` in Settings).
- If you deploy to **Vercel**, `api/chat.js` runs automatically as a
  serverless function. This is the recommended path and is what these
  instructions default to.
- If you deploy to **Render, Railway, or your own VPS**, use `server.js`
  (Express) instead — it does the same job outside Vercel's environment.

---

## 2. Get an API key

This project calls the **Anthropic API** by default.

1. Go to https://console.anthropic.com/settings/keys
2. Create a key (starts with `sk-ant-...`)
3. Keep it secret — you'll paste it into an environment variable, never into
   any file that gets committed to Git.

(You can swap in a different provider by editing the `fetch` call in
`api/chat.js` / `server.js` — the rest of the app doesn't care which AI
provider answers, as long as `/api/chat` returns `{ "reply": "..." }`.)

---

## 3. Run it locally first

```bash
# 1. Install dependencies (only needed for the Express path)
npm install

# 2. Create your real env file
cp .env.example .env
# then open .env and paste your real ANTHROPIC_API_KEY

# 3. Start the server
npm start
```

Open `http://localhost:3000` — the chat should work end to end, including
voice input (allow the microphone permission prompt) and spoken replies.

If you'd rather test the Vercel-style function locally:

```bash
npm install -g vercel
vercel dev
```

---

## 4. Deploy publicly on Vercel (recommended)

### Step A — push this project to GitHub

```bash
git init
git add .
git commit -m "JARVIS S7B initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/jarvis-s7b.git
git push -u origin main
```

`.gitignore` already excludes `.env`, so your real key will **not** be
uploaded. Double-check with `git status` before your first push — you should
never see `.env` listed.

### Step B — import into Vercel

1. Go to https://vercel.com and sign in (GitHub login is easiest).
2. Click **Add New → Project**, then select your `jarvis-s7b` repository.
3. Vercel auto-detects the static files and the `api/chat.js` function — no
   build command is required. Leave the framework preset as "Other".
4. Before clicking Deploy, open **Environment Variables** and add:
   - `ANTHROPIC_API_KEY` = your real key
   - (optional) `AI_MODEL` = `claude-sonnet-5`
5. Click **Deploy**.

### Step C — get your public URL

When the build finishes, Vercel shows a link like:

```
https://jarvis-s7b-yourname.vercel.app
```

That URL is live on the public internet immediately. Open it, allow
microphone access when prompted, and test the chat.

### Updating the live site later

Any time you want to change something:

```bash
# edit files locally, then:
git add .
git commit -m "describe your change"
git push
```

Vercel redeploys automatically on every push to `main` — no manual step
needed. Environment variables stay put; you only touch them again if the key
changes (Vercel dashboard → Project → Settings → Environment Variables).

---

## 5. Alternative: deploy the Express version (Render / Railway)

If you prefer a traditional Node server instead of serverless:

1. Push the same repo to GitHub as above.
2. On [Render](https://render.com) or [Railway](https://railway.app), create
   a new **Web Service** from your GitHub repo.
3. Set:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add the environment variable `ANTHROPIC_API_KEY` (and optionally
   `AI_MODEL`) in the platform's dashboard — not in a committed file.
5. Deploy. The platform gives you a public URL such as
   `https://jarvis-s7b.onrender.com`.

`server.js` serves the frontend files itself, so this single URL handles both
the UI and the `/api/chat` route.

---

## 6. Where the API key goes (summary)

- **Never** in `index.html`, `script.js`, or any file committed to Git.
- **Vercel:** Project Settings → Environment Variables → `ANTHROPIC_API_KEY`.
- **Render/Railway/VPS:** the platform's environment variable settings, or a
  local `.env` file (which `.gitignore` excludes from version control).
- The browser only ever talks to your own `/api/chat` route — it never sees
  the key.

---

## 7. Testing checklist (already verified, re-check after any edit)

- [ ] Page loads with no console errors (desktop + mobile browser dev tools)
- [ ] Sending a message via button and via Enter both work
- [ ] Shift+Enter inserts a newline instead of sending
- [ ] Typing indicator appears while waiting, then clears on reply
- [ ] Clear chat button empties the log and localStorage
- [ ] Settings drawer opens/closes, toggles persist after refresh
- [ ] Voice input: mic permission prompt appears; denial shows a clear
      in-chat message instead of failing silently
- [ ] Text-to-speech reads replies aloud when enabled, stays silent when off
- [ ] Stopping the backend (or using a bad API key) shows the friendly error
      bubble, not a blank screen or fake success
- [ ] Layout holds up at 360px width and with the mobile keyboard open
- [ ] Refreshing the page restores saved conversation history

---

## 8. Known platform limits (stated plainly, not glossed over)

- **Speech recognition** (voice-to-text) relies on the browser's
  `SpeechRecognition` API, which is well supported in Chrome, Edge, and
  Safari, but **not supported in Firefox**. The app detects this and shows a
  clear message rather than pretending it works.
- **Text-to-speech** quality and available voices depend entirely on the
  user's OS/browser — there is no server-side voice synthesis in this build.
- **GitHub Pages cannot run the backend**, as explained in section 1 — it's a
  static host by design, not a bug in this project.
  
