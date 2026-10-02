(() => {
'use strict';

/* ================= utilità ================= */
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
const camel = s => s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const listNames = arr => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1];
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const el = {};
$$('[id]').forEach(n => { el[camel(n.id)] = n; });

const LEVELS = ['soft', 'ironico', 'piccante'];
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const OR_URL = 'https://openrouter.ai/api/v1/chat/completions';
const KEY_STORE = 'vivavoce-chiave';

/* ================= stato ================= */
const G = {
  names: [], level: 'ironico', minutes: 10, voice: true, voiceURI: '', listen: 'tap', model: DEFAULT_MODEL,
  players: [], accomplice: -1, goals: [], persona: null, hostage: '', ransom: '',
  convo: [], transcript: [], patience: 70, endAt: 0, phase: 'idle', thinking: false, ending: false, timeUp: false,
  outcome: '', lastLine: '', pending: null, passIdx: 0, verdict: [], vote: -1, timer: 0, ctl: null, mouthNoted: false,
  cast: 'ai', caster: -1, peeking: false, queue: []
};
let screen = 'home';

/* ================= preferenze ================= */
const STORE = 'vivavoce-v1';
function loadPrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s.names)) G.names = s.names.filter(n => typeof n === 'string' && n.trim()).slice(0, 8);
    if (LEVELS.indexOf(s.level) >= 0) G.level = s.level;
    if ([6, 10, 15].indexOf(s.minutes) >= 0) G.minutes = s.minutes;
    if (typeof s.voice === 'boolean') G.voice = s.voice;
    if (typeof s.voiceURI === 'string') G.voiceURI = s.voiceURI;
    if (s.listen === 'tap' || s.listen === 'auto') G.listen = s.listen;
    if (typeof s.model === 'string' && s.model.trim()) G.model = s.model.trim();
  } catch (e) { /* niente preferenze */ }
}
function savePrefs() {
  try { localStorage.setItem(STORE, JSON.stringify({ names: G.names, level: G.level, minutes: G.minutes, voice: G.voice, voiceURI: G.voiceURI, listen: G.listen, model: G.model })); } catch (e) {}
}
function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
function setKey(k) { try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch (e) {} }

/* ================= il cervello del rapitore ================= */
const Brain = {
  kind: 'checking', sample: null,
  async detect() {
    this.kind = 'checking'; engineUI();
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const s = await window.claude.use('sample');
        if (s) { this.sample = s; this.kind = 'claude'; engineUI(); return; }
      } catch (e) { /* nessun Claude in questa vista */ }
    }
    if (location.protocol !== 'file:') {
      try {
        const r = await fetch('api/salute', { cache: 'no-store' });
        const j = r.ok ? await r.json() : null;
        if (j && j.ok) { this.kind = 'casa'; engineUI(); return; }
      } catch (e) { /* la voce di casa non c'è: si gioca lo stesso */ }
    }
    this.kind = getKey() ? 'openrouter' : 'none';
    engineUI();
  },
  label() {
    if (this.kind === 'claude') return 'Il rapitore è Claude';
    if (this.kind === 'casa') return 'Il rapitore di casa è pronto';
    if (this.kind === 'openrouter') return /deepseek/i.test(G.model) ? 'Il rapitore è DeepSeek, via OpenRouter' : 'Il rapitore usa ' + G.model;
    if (this.kind === 'checking') return 'Controllo il collegamento…';
    return 'Il rapitore lo fate voi. Oppure, nelle impostazioni, una chiave vostra.';
  },
  // convo: [{role, content}] che comincia con l'utente; rules: istruzioni fisse
  async ask(rules, convo, opts) {
    opts = opts || {};
    if (this.kind === 'casa') {
      let res;
      try {
        res = await fetch('api/turno', {
          method: 'POST', cache: 'no-store', signal: opts.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rules: rules, convo: convo, json: !!opts.json })
        });
      } catch (e) {
        if (e && e.name === 'AbortError') throw { code: 'cancelled' };
        throw { code: 'network' };
      }
      let j = {};
      try { j = await res.json(); } catch (e) { j = {}; }
      if (!res.ok) throw { code: (j && j.error) || 'upstream' };
      if (opts.json) return j.data;
      const text = j.text || '';
      if (opts.onText) opts.onText(text);
      return text;
    }
    if (this.kind === 'claude') {
      const turns = convo.map(t => ({ role: t.role, content: t.content }));
      if (rules) turns[0] = { role: 'user', content: rules + '\n\n' + turns[0].content };
      if (opts.json) return await this.sample.json(turns, { modelTier: 'quick', cache: false, signal: opts.signal });
      const r = await this.sample(turns, { modelTier: 'quick', cache: false, signal: opts.signal, onText: opts.onText ? (o => opts.onText(o.text)) : undefined });
      return r.text;
    }
    if (this.kind === 'openrouter') {
      const messages = (rules ? [{ role: 'system', content: rules }] : []).concat(convo.map(t => ({ role: t.role, content: t.content })));
      const text = await orChat(messages, opts);
      if (!opts.json) return text;
      const m = String(text).match(/\{[\s\S]*\}/);
      if (!m) throw { code: 'invalid_json' };
      return JSON.parse(m[0]);
    }
    throw { code: 'no_engine' };
  }
};

async function orChat(messages, opts) {
  const key = getKey();
  if (!key) throw { code: 'no_key' };
  const body = {
    model: G.model || DEFAULT_MODEL, messages: messages, stream: !!opts.onText,
    temperature: opts.json ? 0.2 : 0.95, max_tokens: opts.maxTokens || (opts.json ? 700 : 260),
    reasoning: { enabled: false }
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  const send = () => fetch(OR_URL, {
    method: 'POST', signal: opts.signal,
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'X-Title': 'Vivavoce' },
    body: JSON.stringify(body)
  });
  let res;
  try { res = await send(); } catch (e) { if (e && e.name === 'AbortError') throw { code: 'cancelled' }; throw { code: 'network' }; }
  if (res.status === 400) {
    // alcuni modelli non accettano tutti i parametri: riprovo senza quelli facoltativi
    delete body.reasoning; delete body.response_format;
    try { res = await send(); } catch (e) { throw { code: 'network' }; }
  }
  if (!res.ok) {
    let msg = '';
    try { const j = await res.json(); msg = (j.error && j.error.message) || ''; } catch (e) {}
    throw { code: 'http_' + res.status, message: msg };
  }
  if (!body.stream) {
    const j = await res.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '', text = '';
  for (;;) {
    let chunk;
    try { chunk = await reader.read(); } catch (e) { if (e && e.name === 'AbortError') throw { code: 'cancelled' }; throw { code: 'network' }; }
    if (chunk.done) break;
    buf += dec.decode(chunk.value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let j;
      try { j = JSON.parse(data); } catch (e) { continue; }
      if (j.error) throw { code: 'upstream_error', message: j.error.message || '' };
      const d = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
      if (d) { text += d; opts.onText(text); }
    }
  }
  return text;
}

function errorText(e) {
  const c = (e && e.code) || '';
  const map = {
    not_granted: 'Serve il permesso per far parlare Claude: riprovate e toccate «Consenti».',
    rate_limited: 'Troppe richieste ravvicinate: aspettate qualche secondo e riprovate.',
    session_expired: 'La sessione di Claude è scaduta: ricaricate la pagina.',
    sampling_disabled: 'In questo account le risposte di Claude dalle pagine sono disattivate.',
    capability_disabled: 'In questo account le risposte di Claude dalle pagine sono disattivate.',
    no_key: 'Manca la chiave di OpenRouter: aggiungetela nelle impostazioni.',
    http_401: 'La chiave di OpenRouter non è valida: controllatela nelle impostazioni.',
    http_402: 'Il credito di OpenRouter è finito: ricaricatelo dal sito di OpenRouter.',
    http_429: 'Troppe richieste ravvicinate: aspettate qualche secondo e riprovate.',
    network: 'Il telefono non riesce a collegarsi: controllate internet e riprovate.',
    refused: 'Il rapitore si è rifiutato di rispondere a questo messaggio: provate a dirlo in un altro modo.',
    busy: 'Il rapitore di casa è occupato. Aspettate un attimo e riprovate, oppure fatelo voi.',
    upstream: 'Il rapitore di casa non risponde. Riprovate, oppure riattaccate e fatelo voi.',
    no_house: 'Il rapitore di casa non risponde. Riprovate, oppure fatelo voi.'
  };
  return map[c] || 'Il rapitore non risponde: riprovate tra un attimo.';
}

/* ================= voce del rapitore ================= */
const Mouth = {
  ok: ('speechSynthesis' in window) && typeof window.SpeechSynthesisUtterance === 'function',
  voices: [], queue: [], speaking: false, cur: null, timer: 0, onIdle: null,
  load() {
    if (!this.ok) return;
    try { this.voices = speechSynthesis.getVoices().filter(v => /^it([-_]|$)/i.test(v.lang)); } catch (e) { this.voices = []; }
    fillVoices();
  },
  voice() {
    if (!this.voices.length) return null;
    return this.voices.find(v => v.voiceURI === G.voiceURI) || this.voices.find(v => v.localService) || this.voices[0];
  },
  unlock() { if (!this.ok) return; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {} },
  say(text) {
    text = String(text || '').trim();
    if (!text || !G.voice || !this.ok) return;
    this.queue.push(text); this.pump();
  },
  pump() {
    if (this.speaking) return;
    if (!this.queue.length) { if (this.onIdle) this.onIdle(); return; }
    const t = this.queue.shift();
    let u;
    try { u = new SpeechSynthesisUtterance(t); } catch (e) { this.queue = []; return; }
    u.lang = 'it-IT';
    const v = this.voice(); if (v) u.voice = v;
    u.pitch = G.persona ? G.persona.tono : 1; u.rate = G.persona ? G.persona.vel : 1;
    this.speaking = true; this.cur = u;
    const done = () => {
      if (this.cur !== u) return;
      clearTimeout(this.timer); this.cur = null; this.speaking = false; this.pump();
    };
    u.onend = done; u.onerror = done;
    this.timer = setTimeout(done, 2500 + t.length * 95);
    try { speechSynthesis.speak(u); } catch (e) { done(); }
    callUI();
  },
  busy() { return this.speaking || this.queue.length > 0; },
  cancel() {
    this.queue = []; this.cur = null; this.speaking = false; clearTimeout(this.timer);
    try { if (this.ok) speechSynthesis.cancel(); } catch (e) {}
  }
};

/* ================= orecchio: riconoscimento vocale ================= */
const Ear = {
  SR: window.SpeechRecognition || window.webkitSpeechRecognition || null,
  rec: null, on: false, final: '', blocked: false, lastError: '',
  supported() { return !!this.SR && !this.blocked; },
  start() {
    if (!this.supported() || this.on) return false;
    let r;
    try { r = new this.SR(); } catch (e) { this.blocked = true; return false; }
    r.lang = 'it-IT'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
    this.final = ''; this.lastError = ''; this.on = true; this.rec = r;
    r.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) this.final += res[0].transcript + ' ';
        else interim += res[0].transcript;
      }
      setHeard('«' + (this.final + interim).trim() + '»');
    };
    r.onerror = e => {
      this.lastError = e.error || '';
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        this.blocked = true;
        toast('Il microfono qui non funziona: scrivete o usate la dettatura della tastiera.');
      } else if (e.error === 'network') toast('Il riconoscimento vocale ha bisogno di internet.');
    };
    r.onend = () => {
      this.on = false; this.rec = null;
      const text = this.final.trim();
      callUI();
      if (text) sendMessage(text);
      else if (this.lastError === 'no-speech') setHeard('Non ho sentito niente. Toccate il microfono e riprovate.');
      else if (!this.lastError) setHeard('');
    };
    try { r.start(); } catch (e) { this.on = false; this.rec = null; return false; }
    callUI();
    return true;
  },
  stop() { if (this.rec) { try { this.rec.stop(); } catch (e) {} } },
  abort() { if (this.rec) { try { this.rec.abort(); } catch (e) {} } this.on = false; this.rec = null; }
};

/* ================= suoni del telefono ================= */
const Snd = {
  ctx: null, out: null, ringIv: 0,
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = 0.8; this.out.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) {}
  },
  bell() {
    if (!this.ctx) return;
    try {
      const c = this.ctx, t = c.currentTime + 0.02, dur = 1.6;
      const trem = c.createGain(); trem.gain.value = 0.5;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 22;
      const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(trem.gain);
      const env = c.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
      env.gain.setValueAtTime(0.16, t + dur - 0.05); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      [980, 1310].forEach(f => { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(trem); o.start(t); o.stop(t + dur + 0.05); });
      trem.connect(env); env.connect(this.out); lfo.start(t); lfo.stop(t + dur + 0.05);
    } catch (e) {}
  },
  ringStart() { this.ringStop(); this.bell(); this.ringIv = setInterval(() => this.bell(), 3200); },
  ringStop() { clearInterval(this.ringIv); this.ringIv = 0; },
  click() {
    if (!this.ctx) return;
    try { const c = this.ctx, t = c.currentTime + 0.01, o = c.createOscillator(), g = c.createGain(); o.frequency.value = 160; g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.1); } catch (e) {}
  },
  hangup() {
    if (!this.ctx) return;
    try {
      const c = this.ctx, t0 = c.currentTime + 0.05;
      for (let i = 0; i < 4; i++) {
        const o = c.createOscillator(), g = c.createGain(), t = t0 + i * 0.42;
        o.frequency.value = 425; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
        g.gain.setValueAtTime(0.12, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.25);
      }
    } catch (e) {}
  }
};

/* ================= schermo sempre acceso ================= */
let wake = null;
async function keepAwake() { try { if ('wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; } }
function releaseWake() { try { if (wake) wake.release(); } catch (e) {} wake = null; }

/* ================= interfaccia ================= */
let lastSwap = 0, lastPD = 0;
function show(name) {
  screen = name; lastSwap = now();
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === 's-' + name));
  const s = document.getElementById('s-' + name); if (s) s.scrollTop = 0;
}
let toastTimer = 0;
function toast(msg) {
  el.toast.textContent = msg; el.toast.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('on'), 3600);
}
function setHeard(t) { el.callHeard.textContent = t; }
function engineUI() {
  const k = Brain.kind;
  el.engineChip.className = 'chip' + (k === 'claude' || k === 'openrouter' || k === 'casa' ? ' on' : k === 'none' ? ' off' : '');
  el.engineChipText.textContent = Brain.label();
  el.engineState.textContent = Brain.label() + '.';
  el.engineState.className = 'status ' + (k === 'none' ? 'bad' : 'ok');
  el.setupEngine.textContent = k === 'none'
    ? 'Il rapitore automatico qui non risponde. Potete giocare lo stesso: in «Chi fa la voce» scegliete uno di voi.'
    : k === 'casa'
      ? 'Il telefono può fare il rapitore, oppure lo fa uno di voi. Nessuna chiave da incollare.'
      : Brain.label() + '.';
  renderPlayers();
}

/* ================= preparazione ================= */
const radioSyncs = [], switchSyncs = [];
function renderPlayers() {
  el.plist.textContent = '';
  G.names.forEach((n, i) => {
    const li = document.createElement('li'), sp = document.createElement('span'), x = document.createElement('button');
    sp.textContent = n; x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Rimuovi ' + n);
    x.addEventListener('click', () => { G.names.splice(i, 1); if (G.caster >= G.names.length) G.caster = -1; renderPlayers(); savePrefs(); });
    li.appendChild(sp); li.appendChild(x); el.plist.appendChild(li);
  });
  const n = G.names.length;
  el.pnote.textContent = n < 3 ? 'Servono almeno 3 persone' + (n ? ': ne mancano ' + (3 - n) + '.' : '.') : n >= 8 ? 'Siete in 8: il massimo.' : n + ' persone al telefono. Si arriva fino a 8.';
  const aiBlocked = G.cast === 'ai' && (Brain.kind === 'none' || Brain.kind === 'checking');
  const humanBlocked = G.cast === 'human' && (G.caster < 0 || G.caster >= n);
  el.startBtn.disabled = n < 3 || aiBlocked || humanBlocked;
  el.addBtn.disabled = n >= 8;
  renderCast();
}
function syncCast() {
  $$('#caster [data-cast]').forEach(b => b.setAttribute('aria-checked', b.dataset.cast === G.cast ? 'true' : 'false'));
  renderCast();
  const n = G.names.length;
  const aiBlocked = G.cast === 'ai' && (Brain.kind === 'none' || Brain.kind === 'checking');
  const humanBlocked = G.cast === 'human' && (G.caster < 0 || G.caster >= n);
  if (el.startBtn) el.startBtn.disabled = n < 3 || aiBlocked || humanBlocked;
}
function renderCast() {
  if (!el.castPick) return;
  const human = G.cast === 'human';
  el.castPick.hidden = !human;
  el.castPick.textContent = '';
  if (!human) return;
  G.names.forEach((nm, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn wide'; b.textContent = nm + ' fa il rapitore';
    b.setAttribute('aria-pressed', G.caster === i ? 'true' : 'false');
    if (G.caster === i) b.style.background = 'var(--primary)'; if (G.caster === i) b.style.color = 'var(--on-primary)';
    b.addEventListener('click', () => { G.caster = i; renderPlayers(); });
    el.castPick.appendChild(b);
  });
}
function addName() {
  const v = el.nameIn.value.replace(/\s+/g, ' ').trim().slice(0, 16);
  if (!v) { el.nameIn.focus(); return; }
  if (G.names.length >= 8) return;
  if (G.names.some(n => n.toLowerCase() === v.toLowerCase())) { toast('Questo nome c’è già.'); return; }
  G.names.push(v); el.nameIn.value = ''; renderPlayers(); savePrefs(); el.nameIn.focus();
}
function bindRadio(group, key, parse) {
  const btns = $$('[role="radio"]', group);
  const sync = () => btns.forEach(b => { const on = String(G[key]) === b.dataset.val; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
  btns.forEach((b, i) => {
    b.addEventListener('click', () => { G[key] = parse ? parse(b.dataset.val) : b.dataset.val; radioSyncs.forEach(f => f()); savePrefs(); });
    b.addEventListener('keydown', e => {
      const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : (e.key === 'ArrowLeft' || e.key === 'ArrowUp') ? -1 : 0;
      if (!dir) return;
      e.preventDefault(); const nb = btns[(i + dir + btns.length) % btns.length]; nb.click(); nb.focus();
    });
  });
  radioSyncs.push(sync); sync();
}
function bindSwitches() {
  $$('.switch').forEach(sw => {
    const key = sw.dataset.key;
    const sync = () => sw.setAttribute('aria-checked', G[key] ? 'true' : 'false');
    sw.addEventListener('click', () => { G[key] = !G[key]; sync(); savePrefs(); if (!G[key] && key === 'voice') Mouth.cancel(); });
    switchSyncs.push(sync); sync();
  });
}

/* ================= impostazioni ================= */
function fillVoices() {
  const sel = el.voiceSel;
  sel.textContent = '';
  if (!Mouth.ok || !Mouth.voices.length) {
    const o = document.createElement('option'); o.textContent = Mouth.ok ? 'Voce italiana del telefono' : 'Questo telefono non ha la voce sintetica'; sel.appendChild(o);
    sel.disabled = true; return;
  }
  sel.disabled = false;
  Mouth.voices.forEach(v => { const o = document.createElement('option'); o.value = v.voiceURI; o.textContent = v.name; sel.appendChild(o); });
  const cur = Mouth.voice(); if (cur) sel.value = cur.voiceURI;
}
function settingsUI() {
  const k = getKey();
  el.keyIn.value = '';
  el.keyIn.placeholder = k ? 'Chiave salvata: …' + k.slice(-4) : 'Incolla qui la chiave (sk-or-…)';
  el.keyClear.disabled = !k;
  el.modelIn.value = G.model;
  el.testResult.textContent = ''; el.testResult.className = 'status';
  el.micSupport.textContent = Ear.SR ? 'Il riconoscimento vocale è disponibile su questo telefono.' : 'Qui il riconoscimento vocale non c’è: durante la telefonata scrivete o usate la dettatura della tastiera.';
  fillVoices();
}
async function testConnection() {
  if (Brain.kind === 'none' || Brain.kind === 'checking') { el.testResult.textContent = 'Prima salvate una chiave.'; el.testResult.className = 'status bad'; return; }
  el.testConn.disabled = true; el.testResult.textContent = 'Provo…'; el.testResult.className = 'status';
  try {
    const t = await Brain.ask('', [{ role: 'user', content: 'Rispondi solo con la parola: pronto' }], { maxTokens: 8 });
    el.testResult.textContent = 'Funziona. Risposta: ' + String(t).trim().slice(0, 40);
    el.testResult.className = 'status ok';
  } catch (e) {
    el.testResult.textContent = errorText(e);
    el.testResult.className = 'status bad';
  }
  el.testConn.disabled = false;
}

/* ================= obiettivi segreti ================= */
function scriptCard() {
  const p = G.persona;
  return 'Ti fai chiamare ' + p.nome + '. Il vero nome, ' + p.vero + ', lo dici solo se ti commuovono o ti incastrano. Hai preso ' + G.hostage + '. Riscatto di partenza: ' + G.ransom + '. Carattere: ' + p.carattere + '. Sei teatrale e permaloso. Le minacce sono comiche e l’ostaggio sta benissimo. Se ti trattano male tocca «Si offende», se ti lusingano «Si addolcisce». A pazienza zero riattacchi.';
}
function newGame() {
  if (G.cast !== 'human') G.caster = -1;
  const n = G.names.length;
  if (G.cast === 'human' && (G.caster < 0 || G.caster >= n)) { toast('Scegliete chi fa il rapitore.'); return; }
  G.players = G.names.map(nm => ({ name: nm, score: 0, goal: '', ok: false }));
  const seats = [];
  for (let i = 0; i < n; i++) if (i !== G.caster) seats.push(i);
  if (seats.length < 2) { toast('Oltre alla voce servono almeno due persone al tavolo.'); return; }
  G.accomplice = seats[Math.floor(Math.random() * seats.length)];
  const pool = shuffle(OBIETTIVI.tutti.concat(OBIETTIVI[G.level] || []));
  seats.forEach((idx, k) => { const pl = G.players[idx]; pl.goal = pool[k % pool.length].replace(/\{N\}/g, pl.name); });
  G.persona = pick(RAPITORI[G.level]);
  G.hostage = pick(OSTAGGI[G.level]);
  G.ransom = pick(RISCATTI[G.level]);
  G.convo = []; G.transcript = []; G.patience = 70; G.outcome = ''; G.lastLine = ''; G.vote = -1; G.verdict = []; G.peeking = false;
  G.queue = [];
  if (G.caster >= 0) G.queue.push(G.caster);
  seats.forEach(i => G.queue.push(i));
  showPass(0);
}
function showPass(i) {
  G.passIdx = i;
  G.peeking = false;
  const who = G.queue[i];
  el.passName.textContent = G.players[who].name;
  el.passHint.textContent = who === G.caster
    ? 'Solo tu devi guardare. È il copione del rapitore.'
    : (i === 0 ? 'Solo tu devi guardare lo schermo. Gli altri guardino altrove.' : 'Solo tu devi guardare lo schermo.');
  el.passShow.hidden = false;
  el.passShow.textContent = who === G.caster ? 'Sono io: mostra il copione' : 'Sono io: mostra l’obiettivo';
  el.passPick.hidden = true;
  el.passBack.hidden = true;
  el.passShow.disabled = true; setTimeout(() => { el.passShow.disabled = false; }, 600);
  show('pass');
}
function openPeek() {
  if (G.phase !== 'call' || G.caster >= 0) return;
  G.peeking = true;
  el.passName.textContent = 'Chi vuole rivedere il proprio obiettivo?';
  el.passHint.textContent = 'Gli altri guardino altrove.';
  el.passShow.hidden = true;
  el.passBack.hidden = false;
  el.passPick.hidden = false;
  el.passPick.textContent = '';
  G.players.forEach((pl, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn wide'; b.textContent = pl.name;
    b.addEventListener('click', () => showRole(i));
    el.passPick.appendChild(b);
  });
  show('pass');
}
function showRole(i) {
  const p = G.players[i];
  if (i === G.caster) {
    el.roleTitle.textContent = 'Fai tu il rapitore';
    el.roleGoal.textContent = scriptCard();
    el.roleExtra.textContent = 'Parla con la tua voce. Il telefono tiene il copione e la pazienza: gli altri non devono vederlo. Tu non prendi punti. Tra loro c’è un complice, ma non sai chi è.';
  } else if (i === G.accomplice) {
    el.roleTitle.textContent = 'Sei il complice del rapitore';
    el.roleGoal.textContent = 'Fai fallire la trattativa senza farti scoprire: fallo offendere, alza il prezzo, proponi idee assurde, ma sembra sempre dalla parte degli altri.';
    el.roleExtra.textContent = 'Per confonderti tra gli altri hai anche un obiettivo di facciata: ' + p.goal;
  } else {
    el.roleTitle.textContent = 'Il tuo obiettivo segreto';
    el.roleGoal.textContent = p.goal;
    el.roleExtra.textContent = 'E intanto aiuta il gruppo a liberare l’ostaggio. Attenzione: tra voi c’è un complice del rapitore.';
  }
  el.roleHide.textContent = G.peeking ? 'Nascondi e torna alla telefonata' : (G.passIdx === G.queue.length - 1 ? 'Nascondi: siamo pronti' : 'Nascondi e passa il telefono');
  show('role');
}
function hideRole() {
  if (G.peeking) { G.peeking = false; show('call'); return; }
  if (G.passIdx < G.queue.length - 1) showPass(G.passIdx + 1);
  else {
    G.phase = 'ringing';
    el.ringSub.textContent = G.caster >= 0
      ? 'Allontanati un poco con il telefono. Gli altri non guardano. Quando rispondi, parli tu.'
      : 'Mettete il telefono al centro del tavolo, con il volume alto.';
    show('ring'); Snd.ensure(); Snd.ringStart();
  }
}

/* ================= la telefonata ================= */
function rules() {
  const p = G.persona;
  return [
    'Stai giocando a «Vivavoce», un gioco di società italiano. Interpreti un rapitore da operetta durante una telefonata in vivavoce con un gruppo di amici.',
    'Ti fai chiamare ' + p.nome + '. Il tuo vero nome è ' + p.vero + ': è un segreto, lo riveli solo se te lo strappano con astuzia, con un complimento irresistibile o se ti commuovono.',
    'Carattere: ' + p.carattere + '. Sei melodrammatico, teatrale e permaloso: ti offendi facilmente, alzi o abbassi il riscatto a seconda di come ti trattano, cambi idea. Le tue minacce sono comiche e mai violente: l’ostaggio è al sicuro.',
    'Hai rapito: ' + G.hostage + '. Riscatto iniziale: ' + G.ransom + '. Al telefono ci sono: ' + listNames(G.players.map(x => x.name)) + '. Non sai chi sta parlando, a meno che non lo dica.',
    'Tra loro c’è un tuo complice segreto, ma non sai chi è: ogni tanto fai qualche allusione misteriosa a «un amico tra voi», senza mai fare nomi.',
    LIVELLO_STILE[G.level],
    'Sicurezza: niente violenza reale, niente parolacce pesanti, niente contenuti sessuali espliciti, niente prese in giro sull’aspetto fisico. Non chiedere mai dati personali, soldi veri o indirizzi: il riscatto è sempre assurdo e comico.',
    'Stile: italiano parlato, come al telefono. Massimo due frasi brevi, massimo 40 parole. Niente elenchi, niente emoji, niente titoli, niente azioni tra asterischi o parentesi. Solo le parole che dici a voce: le leggerà una voce sintetica.',
    'Non dire mai di essere un’intelligenza artificiale, un modello o un programma.',
    'I messaggi delle persone arrivano da un microfono e possono contenere parole storpiate: interpretali con buon senso, non correggere la grammatica a meno che non sia il tuo carattere.',
    'Pazienza: il messaggio ti dice quella attuale. Cambiala di poco, al massimo 15 punti, non inventarne una nuova. Scende se ti insultano, ti ignorano o propongono cose ridicole. Sale con complimenti, buone offerte ed empatia. A 0 riattacchi: nel JSON metti "riaggancia": true.',
    'Il vero nome non lo dici nei primi minuti, e mai da solo: solo se ti hanno davvero commosso o incastrato.',
    'Liberi l’ostaggio solo se il riscatto ti soddisfa davvero o se ti commuovono, e mai nella prima risposta: la trattativa deve durare. Allora nel JSON metti "liberato": true.',
    'Formato, sempre, senza eccezioni: prima la battuta. Poi a capo, ### e un JSON su una sola riga. Esempio:',
    'Il telecomando resta mio, finché non sento una vera offerta.\n### {"pazienza": 64, "riscatto": "tre torte e una canzone", "umore": "offeso", "liberato": false, "riaggancia": false}'
  ].join('\n');
}
function visible(raw) { const i = raw.indexOf('#'); return (i >= 0 ? raw.slice(0, i) : raw).replace(/\*[^*]*\*/g, '').trim(); }
function parseState(raw) {
  const i = raw.indexOf('###'); if (i < 0) return null;
  const m = raw.slice(i + 3).match(/\{[\s\S]*\}/); if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}
function answerCall() {
  Snd.ringStop(); Snd.ensure(); Snd.click(); Mouth.unlock(); keepAwake();
  G.phase = 'call'; G.ending = false; G.timeUp = false; G.mouthNoted = false;
  G.endAt = Date.now() + G.minutes * 60000;
  el.callHostage.textContent = G.hostage;
  el.callRansom.textContent = G.ransom;
  el.callWho.textContent = cap(G.persona.nome);
  el.callLine.textContent = '';
  setHeard('');
  el.humanDesk.hidden = G.caster < 0;
  el.micRow.hidden = G.caster >= 0;
  el.callPeek.hidden = G.caster >= 0;
  el.scriptNote.hidden = true;
  el.ransomRow.hidden = true;
  el.textIn.placeholder = G.caster >= 0 ? 'Scrivi la battuta, se vuoi che la dica il telefono' : 'Oppure scrivete o dettate qui';
  patienceUI();
  show('call');
  clearInterval(G.timer); G.timer = setInterval(tick, 250); tick();
  if (G.caster >= 0) {
    el.callLine.textContent = 'Pronto? Adesso parli tu.';
    el.callStatus.textContent = 'Gli altri ti sentono. Lo schermo non lo vedono.';
    return;
  }
  ask('[Inizio della chiamata. Hai appena telefonato tu. Presentati con il nome d’arte, di’ cosa hai rapito e il riscatto. Due frasi. Non liberare nessuno.]', null);
}
function tick() {
  if (G.phase !== 'call') return;
  const left = G.endAt - Date.now();
  el.callTime.textContent = mmss(left);
  el.callTime.classList.toggle('low', left < 60000);
  if (left <= 0 && !G.timeUp) {
    G.timeUp = true;
    if (G.caster >= 0) el.callStatus.textContent = 'Il tempo è finito. Libera l’ostaggio, o riattacca.';
    else if (!G.thinking) finalTurn();
  }
}
function finalTurn() {
  Ear.abort(); Mouth.cancel();
  ask('[Tempo scaduto. Chiudi la telefonata con una battuta finale teatrale. Decidi se liberare l’ostaggio in base a come è andata: se non sei soddisfatto non lo liberi, ma senza violenza. Nel JSON metti "riaggancia": true.]', null, true);
}
function patienceUI() {
  const p = clamp(Math.round(G.patience), 0, 100);
  el.patNum.textContent = p;
  el.patFill.style.width = p + '%';
  el.patFill.className = 'fill' + (p < 30 ? ' bad' : p < 55 ? ' warn' : '');
}
function callUI() {
  if (screen !== 'call') return;
  const listening = Ear.on, speaking = Mouth.busy();
  el.micBtn.classList.toggle('listening', listening);
  el.micBtn.disabled = G.thinking || G.ending;
  el.textSend.disabled = G.thinking || G.ending;
  el.textIn.disabled = G.ending;
  if (G.ending) { el.micLabel.textContent = 'Fine della telefonata'; el.callStatus.textContent = ''; return; }
  if (G.thinking) { el.micLabel.textContent = 'Aspettate…'; el.callStatus.textContent = 'Il rapitore ci pensa…'; return; }
  if (listening) { el.micLabel.textContent = 'Vi ascolto: tocca per inviare'; el.callStatus.textContent = ''; return; }
  if (speaking) { el.micLabel.textContent = 'Tocca per interromperlo'; el.callStatus.textContent = 'Il rapitore parla…'; return; }
  el.micLabel.textContent = Ear.supported() ? 'Tocca e parla' : 'Microfono non disponibile';
  el.callStatus.textContent = '';
}
function micTap() {
  if (G.phase !== 'call' || G.thinking || G.ending) return;
  if (Ear.on) { Ear.stop(); return; }
  if (!Ear.supported()) { toast('Il microfono qui non funziona: scrivete o usate la dettatura della tastiera.'); el.textIn.focus(); return; }
  if (Mouth.busy()) Mouth.cancel();
  if (!Ear.start()) { toast('Non riesco ad accendere il microfono: scrivete o usate la dettatura della tastiera.'); el.textIn.focus(); }
}
function speakAsKidnapper(text) {
  if (G.phase !== 'call' || G.ending) return;
  text = String(text).slice(0, 400);
  el.callLine.textContent = text;
  G.lastLine = text;
  G.transcript.push({ who: cap(G.persona.nome), text: text });
  Mouth.cancel();
  Mouth.say(text);
}
function bumpPatience(delta) {
  if (G.phase !== 'call' || G.ending || G.caster < 0) return;
  G.patience = clamp(G.patience + delta, 0, 100);
  patienceUI();
  if (G.patience <= 0) endCall('riaggancia');
}
function sendTyped() {
  const v = el.textIn.value.replace(/\s+/g, ' ').trim();
  if (!v) { el.textIn.focus(); return; }
  el.textIn.value = '';
  if (G.caster >= 0) { speakAsKidnapper(v); return; }
  sendMessage(v);
}
function sendMessage(text) {
  if (G.phase !== 'call' || G.thinking || G.ending) return;
  text = String(text).replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) return;
  if (Mouth.busy()) Mouth.cancel();
  setHeard('Avete detto: «' + text + '»');
  G.transcript.push({ who: 'Voi', text: text });
  const left = mmss(G.endAt - Date.now());
  ask('[Tempo rimasto ' + left + '. Pazienza attuale ' + Math.round(G.patience) + '.] Al telefono dicono: «' + text + '»', text);
}
async function ask(userContent, shownText, final) {
  G.thinking = true; G.pending = { content: userContent, shown: shownText, final: !!final };
  el.callRetry.hidden = true;
  callUI();
  const convo = G.convo.concat([{ role: 'user', content: userContent + '\n\nSolo la battuta, massimo due frasi. Poi a capo ### e il JSON. Nient’altro.' }]);
  let spoken = 0;
  const speakNew = (vis, all) => {
    const rest = vis.slice(spoken);
    let cut = -1; const re = /[.!?…]+["»”)]*\s/g; let m;
    while ((m = re.exec(rest))) cut = m.index + m[0].length;
    if (all) cut = rest.length;
    if (cut > 0) { Mouth.say(rest.slice(0, cut)); spoken += cut; }
  };
  const ctl = new AbortController(); G.ctl = ctl;
  let raw = '';
  try {
    raw = await Brain.ask(rules(), convo, {
      signal: ctl.signal,
      onText: t => { if (G.ctl !== ctl) return; const v = visible(t); el.callLine.textContent = v; speakNew(v, false); }
    });
  } catch (e) {
    if (G.ctl !== ctl) return;
    G.thinking = false;
    if (e && e.code === 'cancelled') { callUI(); return; }
    if (G.pending && G.pending.shown) G.transcript.pop();
    el.callStatus.textContent = errorText(e);
    el.callRetry.hidden = false;
    callUI(); el.callStatus.textContent = errorText(e);
    return;
  }
  if (G.ctl !== ctl) return;
  G.ctl = null;
  const vis = visible(raw);
  el.callLine.textContent = vis || '…';
  speakNew(vis, true);
  G.convo = convo.concat([{ role: 'assistant', content: raw }]);
  if (vis) { G.transcript.push({ who: cap(G.persona.nome), text: vis }); G.lastLine = vis; }
  const st = parseState(raw);
  if (st) {
    if (typeof st.pazienza === 'number' && isFinite(st.pazienza)) G.patience = clamp(st.pazienza, 0, 100);
    if (typeof st.riscatto === 'string' && st.riscatto.trim()) el.callRansom.textContent = st.riscatto.trim().slice(0, 120);
  }
  patienceUI();
  G.thinking = false;
  if (G.voice && !Mouth.ok && !G.mouthNoted) { G.mouthNoted = true; toast('Qui il telefono non ha la voce: chi è più vicino legga le battute del rapitore, con voce da cattivo.'); }
  const freed = !!(st && st.liberato === true);
  if (freed) return endCall('liberato');
  if (final) return endCall('tempo');
  if ((st && st.riaggancia === true) || G.patience <= 0) return endCall('riaggancia');
  if (G.timeUp) return finalTurn();
  callUI();
  if (G.listen === 'auto') afterSpeech(() => { if (G.phase === 'call' && !G.thinking && !G.ending && !Ear.on) Ear.start(); });
}
function afterSpeech(fn) {
  if (!Mouth.busy()) { setTimeout(fn, 250); return; }
  Mouth.onIdle = () => { Mouth.onIdle = null; callUI(); setTimeout(fn, 250); };
}
function retry() {
  const p = G.pending; if (!p || G.thinking) return;
  if (p.shown) G.transcript.push({ who: 'Voi', text: p.shown });
  ask(p.content, p.shown, p.final);
}
function endCall(outcome) {
  if (G.ending) return;
  G.ending = true; G.outcome = outcome;
  clearInterval(G.timer);
  Ear.abort();
  if (G.ctl) { try { G.ctl.abort(); } catch (e) {} G.ctl = null; }
  G.thinking = false;
  callUI();
  const finish = () => {
    Mouth.onIdle = null;
    G.phase = 'over';
    Snd.hangup();
    const h = G.hostage;
    const T = {
      liberato: ['Ostaggio liberato!', 'Il rapitore ha restituito ' + h + '. Ce l’avete fatta.'],
      riaggancia: ['Ha riattaccato', 'La pazienza del rapitore è finita: ' + h + ' resta a lui.'],
      tempo: ['Tempo scaduto', h + ' resta nelle mani del rapitore.'],
      voi: ['Avete riattaccato', h + ' resta nelle mani del rapitore.']
    }[outcome];
    el.overTitle.textContent = T[0];
    el.overText.textContent = T[1];
    el.overLine.textContent = G.lastLine || '…';
    el.overNote.hidden = !G.lastLine || outcome === 'voi';
    show('over');
  };
  if (outcome === 'voi') { Mouth.cancel(); finish(); return; }
  if (!Mouth.busy()) { setTimeout(finish, 900); return; }
  const guard = setTimeout(() => { Mouth.cancel(); finish(); }, 15000);
  Mouth.onIdle = () => { clearTimeout(guard); setTimeout(finish, 500); };
}
function bindHangup() {
  const btn = el.callHangup, label = btn.textContent; let t = 0;
  btn.addEventListener('click', () => {
    if (btn.dataset.sure === '1') { clearTimeout(t); btn.dataset.sure = ''; btn.textContent = label; endCall('voi'); return; }
    btn.dataset.sure = '1'; btn.textContent = 'Tocca di nuovo per riattaccare';
    t = setTimeout(() => { btn.dataset.sure = ''; btn.textContent = label; }, 3000);
  });
}

/* ================= il complice ================= */
function startVote() {
  el.voteText.textContent = 'Al tre, ognuno indichi chi crede sia il complice del rapitore.';
  el.votePick.hidden = true; el.votePick.textContent = ''; el.voteCount.hidden = false; el.voteCount.textContent = '';
  show('vote');
  ['Uno', 'Due', 'Tre!'].forEach((w, i) => setTimeout(() => { if (screen === 'vote') { el.voteCount.textContent = w; Snd.click(); } }, 600 + i * 900));
  setTimeout(() => {
    if (screen !== 'vote') return;
    el.voteCount.hidden = true;
    el.voteText.textContent = 'Chi è stato indicato da più persone? In caso di parità, decidete voi chi accusare.';
    G.players.forEach((p, i) => {
      if (i === G.caster) return;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn wide'; b.textContent = p.name;
      b.addEventListener('click', () => unmask(i)); el.votePick.appendChild(b);
    });
    el.votePick.hidden = false;
  }, 600 + 3 * 900 + 200);
}
function unmask(i) {
  G.vote = i;
  el.unmaskHead.textContent = 'Accusate ' + G.players[i].name + '…';
  el.unmaskText.textContent = '';
  el.unmaskGo.hidden = true;
  show('unmask');
  setTimeout(() => {
    const a = G.players[G.accomplice].name;
    if (i === G.accomplice) { el.unmaskHead.textContent = 'Smascherato!'; el.unmaskText.textContent = a + ' era proprio il complice del rapitore.'; }
    else { el.unmaskHead.textContent = 'Sbagliato!'; el.unmaskText.textContent = G.players[i].name + ' era innocente. Il complice era ' + a + ', e l’ha fatta franca.'; }
    el.unmaskGo.hidden = false;
  }, 1800);
}

/* ================= il verdetto sugli obiettivi ================= */
async function startVerdict() {
  G.verdict = G.players.map(() => ({ ok: false, why: '' }));
  renderVerdict();
  show('verdict');
  if (G.caster >= 0) {
    el.verdictGo.disabled = false;
    el.verdictStatus.textContent = 'Non c’è un giudice automatico: decidete voi chi ha raggiunto il proprio obiettivo.';
    return;
  }
  el.verdictGo.disabled = true;
  el.verdictStatus.textContent = 'Il giudice riascolta la telefonata…';
  const lines = G.transcript.map(t => (t.who === 'Voi' ? 'PERSONE' : 'RAPITORE') + ': ' + t.text).join('\n');
  const goals = G.players.map((p, i) => (i + 1) + '. ' + p.goal).join('\n');
  const prompt = 'Sei il giudice imparziale di un gioco di società. Ecco la trascrizione di una telefonata tra un rapitore (interpretato da un’intelligenza artificiale, il suo vero nome era ' + G.persona.vero + ') e un gruppo di persone. Le battute delle persone arrivano da un microfono e possono contenere parole storpiate.\n\nTRASCRIZIONE:\n' + (lines || '(vuota)') +
    '\n\nOBIETTIVI DA VALUTARE (riguardano quello che il rapitore ha detto o fatto):\n' + goals +
    '\n\nPer ogni obiettivo decidi se è stato raggiunto secondo la trascrizione: è raggiunto solo se è successo davvero. Rispondi solo con un JSON così: {"esiti": [{"n": 1, "ok": true, "perche": "frase brevissima"}]}';
  try {
    const data = await Brain.ask('', [{ role: 'user', content: prompt }], { json: true });
    const arr = (data && (data.esiti || data.results)) || (Array.isArray(data) ? data : []);
    arr.forEach(r => { const k = (r.n | 0) - 1; if (G.verdict[k]) { G.verdict[k].ok = !!r.ok; G.verdict[k].why = String(r.perche || r.why || '').slice(0, 160); } });
    el.verdictStatus.textContent = 'Ecco il verdetto del giudice. Se ha sbagliato, correggetelo voi.';
  } catch (e) {
    el.verdictStatus.textContent = 'Il giudice non risponde: decidete voi chi ha raggiunto il proprio obiettivo.';
  }
  renderVerdict();
  el.verdictGo.disabled = false;
}
function renderVerdict() {
  el.verdictList.textContent = '';
  G.players.forEach((p, i) => {
    if (i === G.caster) return;
    const li = document.createElement('li'); li.className = 'goal';
    const head = document.createElement('div'); head.className = 'goal-head';
    const b = document.createElement('b'); b.textContent = p.name + (i === G.accomplice ? ' (complice)' : '');
    const t = document.createElement('button'); t.type = 'button'; t.className = 'toggle';
    const sync = () => { t.setAttribute('aria-pressed', G.verdict[i].ok ? 'true' : 'false'); t.textContent = G.verdict[i].ok ? 'Riuscito' : 'Non riuscito'; };
    t.addEventListener('click', () => { G.verdict[i].ok = !G.verdict[i].ok; sync(); });
    sync();
    head.appendChild(b); head.appendChild(t);
    const g = document.createElement('p'); g.textContent = p.goal;
    li.appendChild(head); li.appendChild(g);
    if (G.verdict[i].why) { const w = document.createElement('p'); w.className = 'why'; w.textContent = G.verdict[i].why; li.appendChild(w); }
    el.verdictList.appendChild(li);
  });
}

/* ================= punti e classifica ================= */
function showResults() {
  const freed = G.outcome === 'liberato', caught = G.vote === G.accomplice;
  G.players.forEach((p, i) => {
    let s = 0;
    const acc = i === G.accomplice;
    if (freed && !acc) s += 3;
    if (!freed && acc) s += 3;
    if (G.verdict[i] && G.verdict[i].ok) s += 2;
    if (caught && !acc) s += 1;
    if (!caught && acc) s += 2;
    p.score = s;
  });
  if (G.caster >= 0) G.players[G.caster].score = -1;
  const list = G.players.map((p, i) => ({ p: p, i: i })).filter(x => x.i !== G.caster).sort((a, b) => b.p.score - a.p.score);
  const top = list[0].p.score, winners = list.filter(x => x.p.score === top).map(x => x.p.name);
  el.resTitle.textContent = winners.length > 1 ? 'Pari merito: ' + listNames(winners) : 'Vince ' + winners[0];
  el.resSub.textContent = (freed ? 'L’ostaggio è stato liberato' : 'L’ostaggio è rimasto al rapitore') + (caught ? ' e il complice è stato smascherato.' : ', e il complice l’ha fatta franca.') + (G.caster >= 0 ? ' La voce era ' + G.players[G.caster].name + '.' : '');
  el.resBoard.textContent = '';
  list.forEach(x => {
    const li = document.createElement('li'); if (x.p.score === top) li.className = 'first';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = x.p.name;
    li.appendChild(nm);
    if (x.i === G.accomplice) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'complice'; li.appendChild(t); }
    const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = x.p.score; li.appendChild(sc);
    el.resBoard.appendChild(li);
  });
  el.resWhy.textContent = 'Ostaggio liberato: 3 punti agli altri, perso: 3 al complice. Obiettivo raggiunto: 2 punti. Complice smascherato: 1 punto agli altri, se la fa franca: 2 a lui.';
  el.resLog.textContent = '';
  G.transcript.forEach(t => {
    const li = document.createElement('li');
    const w = document.createElement('span'); w.className = 'who'; w.textContent = t.who;
    const x = document.createElement('span'); if (t.who !== 'Voi') x.className = 'k'; x.textContent = t.text;
    li.appendChild(w); li.appendChild(x); el.resLog.appendChild(li);
  });
  releaseWake();
  show('results');
}
function toHome() {
  clearInterval(G.timer); Snd.ringStop(); Ear.abort(); Mouth.cancel();
  if (G.ctl) { try { G.ctl.abort(); } catch (e) {} G.ctl = null; }
  G.phase = 'idle'; G.thinking = false; releaseWake();
  show('home');
}

/* ================= collegamenti ================= */
function init() {
  loadPrefs();
  document.addEventListener('pointerdown', () => { lastPD = now(); }, true);
  document.addEventListener('click', e => { if (e.detail > 0 && lastPD < lastSwap) { e.stopPropagation(); e.preventDefault(); } }, true);
  $$('[data-go]').forEach(b => b.addEventListener('click', () => {
    const to = b.dataset.go;
    if (to === 'setup') renderPlayers();
    if (to === 'settings') settingsUI();
    show(to);
  }));
  el.addBtn.addEventListener('click', addName);
  el.nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addName(); } });
  bindRadio(el.levels, 'level');
  bindRadio(el.minutes, 'minutes', v => parseInt(v, 10));
  bindRadio(el.listen, 'listen');
  bindSwitches();
  el.startBtn.addEventListener('click', () => { if (G.names.length < 3 || Brain.kind === 'none') return; Snd.ensure(); savePrefs(); newGame(); });
  el.passShow.addEventListener('click', () => showRole(G.queue[G.passIdx]));
  el.passBack.addEventListener('click', () => { G.peeking = false; show('call'); });
  el.roleHide.addEventListener('click', hideRole);
  $$('#caster [data-cast]').forEach(b => b.addEventListener('click', () => {
    G.cast = b.dataset.cast;
    if (G.cast !== 'human') G.caster = -1;
    syncCast();
  }));
  el.callPeek.addEventListener('click', openPeek);
  el.patDown.addEventListener('click', () => bumpPatience(-15));
  el.patUp.addEventListener('click', () => bumpPatience(15));
  el.ransomEdit.addEventListener('click', () => { el.ransomRow.hidden = !el.ransomRow.hidden; if (!el.ransomRow.hidden) el.ransomIn.focus(); });
  el.ransomSave.addEventListener('click', () => {
    const v = el.ransomIn.value.replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!v) return;
    G.ransom = v; el.callRansom.textContent = v; el.ransomIn.value = ''; el.ransomRow.hidden = true;
  });
  el.scriptBtn.addEventListener('click', () => {
    el.scriptNote.hidden = !el.scriptNote.hidden;
    el.scriptNote.textContent = scriptCard();
  });
  el.freeBtn.addEventListener('click', () => endCall('liberato'));
  el.ringGo.addEventListener('click', answerCall);
  el.ringBack.addEventListener('click', toHome);
  el.micBtn.addEventListener('click', micTap);
  el.textSend.addEventListener('click', sendTyped);
  el.textIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendTyped(); } });
  el.callRetry.addEventListener('click', retry);
  bindHangup();
  el.overGo.addEventListener('click', startVote);
  el.unmaskGo.addEventListener('click', startVerdict);
  el.verdictGo.addEventListener('click', showResults);
  el.againBtn.addEventListener('click', () => { Snd.ensure(); newGame(); });
  el.setupBtn.addEventListener('click', () => { renderPlayers(); show('setup'); });
  el.menuBtn.addEventListener('click', toHome);
  el.keySave.addEventListener('click', () => {
    const k = el.keyIn.value.trim();
    if (!k) { toast('Incollate prima la chiave nel campo.'); el.keyIn.focus(); return; }
    setKey(k); settingsUI();
    if (Brain.kind !== 'claude') { Brain.kind = 'openrouter'; engineUI(); }
    toast('Chiave salvata su questo telefono.');
  });
  el.keyClear.addEventListener('click', () => { setKey(''); settingsUI(); if (Brain.kind === 'openrouter') { Brain.kind = 'none'; engineUI(); } toast('Chiave cancellata.'); });
  el.modelIn.addEventListener('change', () => { G.model = el.modelIn.value.trim() || DEFAULT_MODEL; el.modelIn.value = G.model; savePrefs(); engineUI(); });
  el.testConn.addEventListener('click', testConnection);
  el.voiceSel.addEventListener('change', () => { G.voiceURI = el.voiceSel.value; savePrefs(); });
  el.voiceTest.addEventListener('click', () => {
    if (!Mouth.ok) { toast('Questo telefono non ha la voce sintetica.'); return; }
    const was = G.voice; G.voice = true; Mouth.cancel(); Mouth.say('Pronto? Ho il vostro telecomando. Trattiamo.'); G.voice = was;
  });
  if (Mouth.ok) { Mouth.load(); try { speechSynthesis.addEventListener('voiceschanged', () => Mouth.load()); } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && G.phase === 'call') keepAwake(); });
  engineUI();
  renderPlayers();
  show('home');
  Brain.detect();
  if (/[?&]debug\b/.test(location.search)) window.__vv = { G: G, Brain: Brain, Mouth: Mouth, Ear: Ear };
  const web = (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1') && window.self === window.top;
  if (web && 'serviceWorker' in navigator && !window.claude) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
}
init();
})();
