/* Dice al gioco se la voce di casa è accesa. Nessuna chiave esce da qui. */
module.exports = function salute(req, res) {
  res.setHeader('cache-control', 'no-store');
  const on = !!(process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY);
  res.status(200).json({ ok: on, voce: on ? 'casa' : 'voi' });
};
