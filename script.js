/* ============================================================
   JARVIS S7B — client logic
   No API key ever lives in this file. Every AI request goes to
   a same-origin backend route (default /api/chat) which holds
   the real key server-side. See README.md for setup.
   ============================================================ */
(() => {
  'use strict';

  const STORAGE_KEY = 'jarvis_s7b_history_v1';
  const SETTINGS_KEY = 'jarvis_s7b_settings_v1';
  const MAX_STORED_MESSAGES = 200;

  const el = {
    chatLog: document.getElementById('chatLog'),
    typingRow: document.getElementById('typingRow'),
    form: document.getElementById('composerForm'),
    input: document.getElementById('textInput'),
    sendBtn: document.getElementById('sendBtn'),
    micBtn: document.getElementById('micBtn'),
    clearBtn: document.getElementById('clearBtn'),
    statusLine: document.getElementById('statusLine'),
    settingsBtn: document.getElementById('settingsBtn'),
    closeDrawerBtn: document.getElementById('closeDrawerBtn'),
    drawer: document.getElementById('settingsDrawer'),
    overlay: document.getElementById('drawerOverlay'),
    ttsToggle: document.getElementById('ttsToggle'),
    historyToggle: document.getElementById('historyToggle'),
    voiceSelect: document.getElementById('voiceSelect'),
    endpointInput: document.getElementById('endpointInput'),
    wipeBtn: document.getElementById('wipeBtn'),
  };

  /* ---------------- settings ---------------- */
  const defaultSettings = {
    tts: true,
    saveHistory: true,
    voiceURI: '',
    endpoint: '/api/chat',
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
    } catch {
      return { ...defaultSettings };
    }
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable, ignore */ }
  }

  let settings = loadSettings();

  /* ---------------- history ---------------- */
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function persistHistory() {
    if (!settings.saveHistory) return;
    try {
      const trimmed = conversation.slice(-MAX_STORED_MESSAGES);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* quota exceeded or blocked, fail silently */ }
  }

  let conversation = settings.saveHistory ? loadHistory() : [];

  /* ---------------- rendering ---------------- */
  function renderMessage(role, text, { isError = false, persist = true } = {}) {
    const row = document.createElement('div');
    row.className = `msg msg--${role === 'user' ? 'user' : 'ai'}`;

    const avatar = document.createElement('div');
    avatar.className = `msg-avatar msg-avatar--${role === 'user' ? 'user' : 'ai'}`;
    avatar.textContent = role === 'user' ? 'U' : 'J';
    avatar.setAttribute('aria-hidden', 'true');

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble' + (isError ? ' msg-bubble--error' : '');
    const p = document.createElement('p');
    p.textContent = text;
    bubble.appendChild(p);

    row.appendChild(avatar);
    row.appendChild(bubble);
    el.chatLog.appendChild(row);
    el.chatLog.scrollTop = el.chatLog.scrollHeight;

    if (persist && !isError) {
      conversation.push({ role, text, ts: Date.now() });
      persistHistory();
    }
    return bubble;
  }

  function renderHistoryOnLoad() {
    if (!conversation.length) return;
    // Remove the default greeting bubble before replaying saved history
    el.chatLog.innerHTML = '';
    conversation.forEach((m) => renderMessage(m.role, m.text, { persist: false }));
  }

  function setStatus(text, mode = 'idle') {
    el.statusLine.textContent = text;
    el.statusLine.classList.toggle('is-live', mode === 'live');
    el.statusLine.classList.toggle('is-error', mode === 'error');
  }

  function setTyping(isTyping) {
    el.typingRow.hidden = !isTyping;
    if (isTyping) el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  /* ---------------- textarea autosize ---------------- */
  function autosize() {
    el.input.style.height = 'auto';
    el.input.style.height = Math.min(el.input.scrollHeight, 140) + 'px';
  }
  el.input.addEventListener('input', autosize);

  /* ---------------- sending ---------------- */
  let isSending = false;

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    renderMessage('user', trimmed);
    el.input.value = '';
    autosize();
    isSending = true;
    el.sendBtn.disabled = true;
    setTyping(true);
    setStatus('PROCESSING…', 'live');

    try {
      const history = conversation.slice(-20).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(settings.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).error || ''; } catch { /* body not JSON */ }
        throw new Error(detail || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      const reply = (data && data.reply) ? data.reply : '';

      if (!reply) throw new Error('Empty response from AI backend.');

      setTyping(false);
      renderMessage('ai', reply);
      speak(reply);
      setStatus('SYSTEMS NOMINAL', 'idle');
    } catch (err) {
      setTyping(false);
      const friendly = err.name === 'AbortError'
        ? "JARVIS S7B didn't respond in time. The AI backend may be slow or unreachable — please try again."
        : `I couldn't reach the AI backend (${err.message}). Check that the server is running and the API key is configured — see README.md.`;
      renderMessage('ai', friendly, { isError: true, persist: false });
      setStatus('CONNECTION ERROR', 'error');
    } finally {
      isSending = false;
      el.sendBtn.disabled = false;
    }
  }

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(el.input.value);
  });

  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(el.input.value);
    }
  });

  /* ---------------- clear chat ---------------- */
  el.clearBtn.addEventListener('click', () => {
    if (!confirm('Clear the entire conversation?')) return;
    conversation = [];
    persistHistory();
    el.chatLog.innerHTML = '';
    renderMessage('ai', 'Conversation cleared. How can I help?', { persist: false });
  });

  /* ---------------- settings drawer ---------------- */
  function openDrawer() {
    el.drawer.classList.add('is-open');
    el.drawer.setAttribute('aria-hidden', 'false');
    el.overlay.hidden = false;
  }
  function closeDrawer() {
    el.drawer.classList.remove('is-open');
    el.drawer.setAttribute('aria-hidden', 'true');
    el.overlay.hidden = true;
  }
  el.settingsBtn.addEventListener('click', openDrawer);
  el.closeDrawerBtn.addEventListener('click', closeDrawer);
  el.overlay.addEventListener('click', closeDrawer);

  el.ttsToggle.checked = settings.tts;
  el.historyToggle.checked = settings.saveHistory;
  el.endpointInput.value = settings.endpoint;

  el.ttsToggle.addEventListener('change', () => {
    settings.tts = el.ttsToggle.checked;
    saveSettings();
    if (!settings.tts) window.speechSynthesis?.cancel();
  });

  el.historyToggle.addEventListener('change', () => {
    settings.saveHistory = el.historyToggle.checked;
    saveSettings();
    if (settings.saveHistory) {
      persistHistory();
    } else {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  });

  el.endpointInput.addEventListener('change', () => {
    settings.endpoint = el.endpointInput.value.trim() || defaultSettings.endpoint;
    el.endpointInput.value = settings.endpoint;
    saveSettings();
  });

  el.wipeBtn.addEventListener('click', () => {
    if (!confirm('This clears saved chat history and settings from this browser. Continue?')) return;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(SETTINGS_KEY);
    } catch { /* ignore */ }
    location.reload();
  });

  /* ---------------- voice input (speech-to-text) ---------------- */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let isListening = false;

  if (SpeechRecognition) {
    recognizer = new SpeechRecognition();
    recognizer.continuous = false;
    recognizer.interimResults = true;
    recognizer.lang = navigator.language || 'en-US';

    recognizer.addEventListener('start', () => {
      isListening = true;
      el.micBtn.classList.add('is-listening');
      setStatus('LISTENING…', 'live');
    });

    recognizer.addEventListener('result', (event) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      el.input.value = transcript;
      autosize();
    });

    recognizer.addEventListener('end', () => {
      isListening = false;
      el.micBtn.classList.remove('is-listening');
      setStatus('SYSTEMS NOMINAL', 'idle');
      if (el.input.value.trim()) sendMessage(el.input.value);
    });

    recognizer.addEventListener('error', (event) => {
      isListening = false;
      el.micBtn.classList.remove('is-listening');
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        setStatus('MIC PERMISSION DENIED', 'error');
        renderMessage(
          'ai',
          'Microphone access was blocked. Enable microphone permission for this site in your browser settings to use voice input.',
          { isError: true, persist: false }
        );
      } else if (event.error === 'no-speech') {
        setStatus('SYSTEMS NOMINAL', 'idle');
      } else {
        setStatus('MIC ERROR', 'error');
      }
    });
  }

  el.micBtn.addEventListener('click', async () => {
    if (!SpeechRecognition) {
      renderMessage(
        'ai',
        "This browser doesn't support speech recognition. Try Chrome, Edge, or Safari on a supported device, or type your message instead.",
        { isError: true, persist: false }
      );
      return;
    }
    if (isListening) {
      recognizer.stop();
      return;
    }
    try {
      // Explicitly request the mic first so we can show a clear message on denial,
      // rather than letting SpeechRecognition fail silently on some browsers.
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
      recognizer.start();
    } catch {
      setStatus('MIC PERMISSION DENIED', 'error');
      renderMessage(
        'ai',
        'Microphone access was blocked or unavailable. Check your browser/site permissions and try again.',
        { isError: true, persist: false }
      );
    }
  });

  /* ---------------- text-to-speech ---------------- */
  function populateVoices() {
    if (!window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    el.voiceSelect.innerHTML = '';
    voices.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} (${v.lang})`;
      if (v.voiceURI === settings.voiceURI) opt.selected = true;
      el.voiceSelect.appendChild(opt);
    });
  }

  if (window.speechSynthesis) {
    populateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', populateVoices);
  } else {
    el.voiceSelect.innerHTML = '<option>Not supported in this browser</option>';
    el.voiceSelect.disabled = true;
  }

  el.voiceSelect.addEventListener('change', () => {
    settings.voiceURI = el.voiceSelect.value;
    saveSettings();
  });

  function speak(text) {
    if (!settings.tts || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const chosen = voices.find((v) => v.voiceURI === settings.voiceURI);
      if (chosen) utter.voice = chosen;
      utter.rate = 1;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    } catch { /* TTS best-effort only */ }
  }

  /* ---------------- boot ---------------- */
  renderHistoryOnLoad();
  autosize();
  setStatus('SYSTEMS NOMINAL', 'idle');
})();
      
