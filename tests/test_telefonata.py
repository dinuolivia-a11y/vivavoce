"""Prova automatica di Vivavoce (richiede Playwright). Il rapitore e il microfono sono simulati: nessuna spesa.
Uso: python3 tests/test_telefonata.py"""
import json
from playwright.sync_api import sync_playwright
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
URL = (ROOT / "index.html").as_uri() + "?debug"
SH = str(ROOT / "screenshot") + "/"
Path(SH).mkdir(exist_ok=True)
errors = []

FAKE_MIC = """
window.__srQueue = [];
class FakeSR {
  start() { const self = this; window.__srStarts = (window.__srStarts || 0) + 1;
    setTimeout(() => { const t = window.__srQueue.shift() || 'ciao rapitore'; const res = [{ transcript: t }]; res.isFinal = true;
      self.onresult && self.onresult({ resultIndex: 0, results: [res] }); setTimeout(() => self.onend && self.onend(), 50); }, 300); }
  stop() {} abort() { this.onend && this.onend(); }
}
window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
"""

def reply_for(last):
    st = lambda p, r, lib=False, rag=False: '\n### ' + json.dumps({"pazienza": p, "riscatto": r, "umore": "teatrale", "liberato": lib, "riaggancia": rag})
    if 'Inizio della chiamata' in last:
        return 'Pronto? Qui parla il Gatto Mascherato. Ho il vostro telecomando. Volete rivederlo? Tre torte al cioccolato. Avete pochi minuti!' + st(70, 'tre torte al cioccolato')
    if 'Tempo scaduto' in last:
        return 'Il tempo è finito, miei cari. Il telecomando resta con me, guarderò i miei programmi preferiti.' + st(40, 'tre torte', False, True)
    if 'pistacchio' in last.lower():
        return 'Una torta al pistacchio? Mi avete commosso. Va bene, vi restituisco il telecomando.' + st(90, 'una torta al pistacchio', True)
    return 'Come osate chiamarmi ladro? Io sono un custode temporaneo! Il prezzo sale: cinque torte.' + st(45, 'cinque torte')

JUDGE = json.dumps({"esiti": [{"n": 1, "ok": True, "perche": "Il rapitore ha detto la parola."}, {"n": 2, "ok": False, "perche": "Non è successo."}, {"n": 3, "ok": True, "perche": "È successo davvero."}]})

def route_openrouter(route):
    body = json.loads(route.request.post_data or '{}')
    msgs = body.get('messages', [])
    last = msgs[-1]['content'] if msgs else ''
    assert route.request.headers.get('authorization') == 'Bearer sk-or-prova-123', 'chiave non inviata'
    if 'giudice' in last:
        return route.fulfill(status=200, content_type='application/json', body=json.dumps({"choices": [{"message": {"content": JUDGE}}]}))
    if not body.get('stream'):
        return route.fulfill(status=200, content_type='application/json', body=json.dumps({"choices": [{"message": {"content": "pronto"}}]}))
    assert msgs[0]['role'] == 'system' and 'Vivavoce' in msgs[0]['content']
    text = reply_for(last)
    chunks = [text[i:i + 14] for i in range(0, len(text), 14)]
    sse = ''.join('data: ' + json.dumps({"choices": [{"delta": {"content": c}}]}) + '\n\n' for c in chunks) + 'data: [DONE]\n\n'
    route.fulfill(status=200, headers={'content-type': 'text/event-stream'}, body=sse)

FAKE_CLAUDE = """
(function () {
  const reply = %s;
  async function fake(input, opts) {
    window.__claudeCalls = (window.__claudeCalls || 0) + 1; window.__lastInput = input;
    const last = Array.isArray(input) ? input[input.length - 1].content : input;
    const text = reply(last);
    let acc = '';
    for (let i = 0; i < text.length; i += 16) { acc += text.slice(i, i + 16); await new Promise(r => setTimeout(r, 15)); if (opts && opts.onText) opts.onText({ text: acc, delta: text.slice(i, i + 16) }); }
    return { text: acc, truncated: false };
  }
  fake.json = async () => (%s);
  window.claude = { use: async (n) => { await new Promise(r => setTimeout(r, 200)); return n === 'sample' ? fake : null; } };
})();
"""
JS_REPLY = """function (last) {
  const st = (p, r, lib, rag) => '\\n### ' + JSON.stringify({ pazienza: p, riscatto: r, umore: 'teatrale', liberato: !!lib, riaggancia: !!rag });
  if (last.indexOf('Inizio della chiamata') >= 0) return 'Pronto? Sono Lady Nebbiolina, tesoro. Ho il vostro telecomando. Il riscatto: un disegno fatto da tutti voi.' + st(70, 'un disegno');
  if (last.indexOf('Tempo scaduto') >= 0) return 'Il sipario cala, tesori. Il telecomando resta con me.' + st(50, 'un disegno', false, true);
  if (last.indexOf('pronto') >= 0) return 'pronto';
  return 'Un complimento? Oh, arrossisco. Ma il prezzo resta: un disegno, e anche una canzone.' + st(78, 'un disegno e una canzone');
}"""

def wait_active(page, name, timeout=12000):
    page.wait_for_function(f"document.getElementById('s-{name}').classList.contains('active')", timeout=timeout)

def deal(page):
    n = page.evaluate("window.__vv.G.players.length")
    for i in range(n):
        wait_active(page, 'pass'); page.wait_for_function("!document.getElementById('pass-show').disabled")
        page.click('#pass-show'); wait_active(page, 'role')
        if i == 0: page.screenshot(path=SH + 'v04_role.png')
        page.click('#role-hide')
    wait_active(page, 'ring')

with sync_playwright() as p:
    b = p.chromium.launch()
    # 1) OpenRouter + microfono simulato, tema scuro
    ctx = b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, color_scheme='dark')
    ctx.add_init_script(FAKE_MIC)
    ctx.route('https://openrouter.ai/api/v1/chat/completions', route_openrouter)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_timeout(1500)
    page.screenshot(path=SH + 'v01_home_none_dark.png')
    print('senza collegamento:', page.inner_text('#engine-chip-text'))
    page.click('#s-home [data-go="settings"]'); page.wait_for_timeout(200)
    page.fill('#key-in', 'sk-or-prova-123'); page.click('#key-save')
    page.click('#test-conn'); page.wait_for_function("document.getElementById('test-result').textContent.indexOf('Funziona') === 0", timeout=5000)
    print('prova collegamento:', page.inner_text('#test-result'))
    page.click('[data-key="voice"]')   # voce spenta per non aspettare la sintesi vocale nel browser di prova
    page.screenshot(path=SH + 'v02_settings_dark.png', full_page=True)
    page.click('#s-settings [data-go="home"]'); wait_active(page, 'home')
    print('con chiave:', page.inner_text('#engine-chip-text'))
    page.click('#s-home [data-go="setup"]'); wait_active(page, 'setup')
    for n in ['Olivia', 'Luca', 'Giò']:
        page.fill('#name-in', n); page.press('#name-in', 'Enter')
    page.click('#levels [data-val="soft"]'); page.click('#minutes [data-val="6"]')
    page.screenshot(path=SH + 'v03_setup_dark.png')
    page.click('#start-btn'); deal(page)
    page.screenshot(path=SH + 'v05_ring_dark.png')
    page.click('#ring-go'); wait_active(page, 'call')
    page.wait_for_function("document.getElementById('call-line').textContent.length > 20 && !window.__vv.G.thinking", timeout=8000)
    page.screenshot(path=SH + 'v06_call_open_dark.png')
    page.fill('#text-in', 'Sei solo un ladro'); page.click('#text-send')
    page.wait_for_function("window.__vv.G.patience === 45 && !window.__vv.G.thinking", timeout=8000)
    print('dopo l’insulto: pazienza', page.inner_text('#pat-num'), '| riscatto', page.inner_text('#call-ransom'))
    page.screenshot(path=SH + 'v07_call_angry_dark.png')
    page.evaluate("window.__srQueue.push('Ti offriamo una torta al pistacchio')")
    page.click('#mic-btn')
    wait_active(page, 'over')
    print('microfono usato:', page.evaluate("window.__srStarts"), '| esito:', page.inner_text('#over-title'))
    page.screenshot(path=SH + 'v08_over_dark.png')
    page.click('#over-go'); page.wait_for_selector('#vote-pick:not([hidden])', timeout=6000)
    acc = page.evaluate("window.__vv.G.accomplice")
    page.locator('#vote-pick button').nth(acc).click(); wait_active(page, 'unmask')
    page.wait_for_selector('#unmask-go:not([hidden])', timeout=5000)
    print('smascheramento:', page.inner_text('#unmask-head'))
    page.click('#unmask-go'); wait_active(page, 'verdict')
    page.wait_for_function("!document.getElementById('verdict-go').disabled", timeout=8000)
    page.screenshot(path=SH + 'v09_verdict_dark.png', full_page=True)
    page.click('#verdict-go'); wait_active(page, 'results')
    print('risultati:', page.inner_text('#res-title'), '|', [x.split('\n') for x in page.locator('#res-board li').all_inner_texts()])
    page.screenshot(path=SH + 'v10_results_dark.png', full_page=True)
    ctx.close()

    # 2) Claude dentro la pagina pubblicata (simulato), tema chiaro, voce accesa, tempo che scade
    ctx = b.new_context(viewport={'width': 412, 'height': 915}, device_scale_factor=2, color_scheme='light')
    ctx.add_init_script(FAKE_CLAUDE % (JS_REPLY, JUDGE))
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL); page.wait_for_function("document.getElementById('engine-chip-text').textContent.indexOf('Claude') >= 0", timeout=5000)
    page.wait_for_timeout(600)
    page.screenshot(path=SH + 'v11_home_claude_light.png')
    print('motore:', page.inner_text('#engine-chip-text'))
    page.click('#s-home [data-go="setup"]')
    for n in ['Olivia', 'Luca', 'Giò', 'Marta']:
        page.fill('#name-in', n); page.press('#name-in', 'Enter')
    page.click('#levels [data-val="ironico"]')
    page.click('#start-btn'); deal(page)
    page.click('#ring-go'); wait_active(page, 'call')
    page.wait_for_function("document.getElementById('call-line').textContent.length > 20 && !window.__vv.G.thinking", timeout=8000)
    first = page.evaluate("window.__lastInput[0].content.slice(0, 60)")
    print('prima richiesta a Claude comincia con:', first)
    page.fill('#text-in', 'Sei la rapitrice più elegante del mondo'); page.press('#text-in', 'Enter')
    page.wait_for_function("window.__vv.G.patience === 78 && !window.__vv.G.thinking", timeout=8000)
    page.screenshot(path=SH + 'v12_call_light.png')
    page.evaluate("window.__vv.G.endAt = Date.now() + 1200")
    wait_active(page, 'over', 30000)
    print('tempo scaduto:', page.inner_text('#over-title'), '| chiamate a Claude:', page.evaluate('window.__claudeCalls'))
    page.screenshot(path=SH + 'v13_over_light.png')
    ctx.close()
    b.close()
print('ERRORS:', errors or 'none')
