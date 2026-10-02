/* Il rapitore di casa.
   La chiave, se c'è, sta solo sul server. Il telefono non la vede mai.
   Senza chiave si usa un modello aperto e gratuito, piccolo, da operetta. */

const GROQ_MODEL = 'openai/gpt-oss-20b';
const OR_MODEL = 'deepseek/deepseek-v4-flash';

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

function clip(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) : s;
}

async function chatOpenAI(url, key, model, rules, convo, json) {
  const messages = [];
  if (rules) messages.push({ role: 'system', content: clip(rules, 4000) });
  (convo || []).slice(-12).forEach(t => {
    if (t && (t.role === 'user' || t.role === 'assistant') && t.content) {
      messages.push({ role: t.role, content: clip(t.content, 800) });
    }
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: json ? 0.2 : 0.9,
      max_tokens: json ? 500 : 220
    })
  });
  if (res.status === 429) { const e = new Error('busy'); e.code = 'busy'; throw e; }
  if (!res.ok) { const e = new Error('upstream'); e.code = 'upstream'; throw e; }
  const j = await res.json();
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
}

function asJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) { const e = new Error('json'); e.code = 'invalid_json'; throw e; }
  return JSON.parse(m[0]);
}

module.exports = async function turno(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method' }); return; }
  const body = readBody(req);
  const rules = clip(body.rules, 4000);
  const convo = Array.isArray(body.convo) ? body.convo.slice(-12) : [];
  if (!convo.length) { res.status(400).json({ error: 'empty' }); return; }
  try {
    let text = '';
    if (process.env.GROQ_API_KEY) {
      text = await chatOpenAI('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, GROQ_MODEL, rules, convo, !!body.json);
    } else if (process.env.OPENROUTER_API_KEY) {
      text = await chatOpenAI('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, OR_MODEL, rules, convo, !!body.json);
    } else {
      res.status(503).json({ error: 'no_house' });
      return;
    }
    text = String(text || '').replace(/```[\s\S]*?```/g, m => m.replace(/```json|```/g, '')).trim();
    if (body.json) { res.status(200).json({ data: asJson(text) }); return; }
    res.status(200).json({ text: text.slice(0, 1200) });
  } catch (e) {
    const code = (e && e.code) || 'upstream';
    res.status(code === 'busy' ? 429 : 502).json({ error: code });
  }
};
