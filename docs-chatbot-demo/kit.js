// Demo kit (PLAN Amendment 17). Copy as-is; bid-specific code goes in app.js. See README.md.

// ---------- DOM + small helpers ----------
const $ = (s) => document.querySelector(s);
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function toast(msg) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function track(name) { try { window.goatcounter && goatcounter.count({ path: location.pathname + '#' + name, title: name, event: true }); } catch (e) {} }

// ---------- latency ----------
// netLatency: for anything a person watches (spinners show). fastLatency: for 100-run stress loops; MessageChannel
// yields are not throttled in background tabs, setTimeout is (to ~1/s).
const netLatency = () => sleep(220 + Math.random() * 380);
const _chan = new MessageChannel(), _waiting = [];
_chan.port1.onmessage = () => _waiting.shift()();
const yieldTask = () => new Promise((r) => { _waiting.push(r); _chan.port2.postMessage(0); });
const fastLatency = async () => { for (let n = Math.random() * 8 | 0; n > 0; n--) await yieldTask(); };
const pace = () => (document.hidden ? Promise.resolve() : sleep(6)); // lets a watched counter climb visibly

// ---------- section 1: the checklist ----------
// setupChecklist(CHECKS). Each check: { req: 'their words, verbatim', note: 'what the check does',
//   async run(progress) { ...; return { ok: bool, mine: 'green line', usual: 'what the usual version did' | [nodes] } } }
function setupChecklist(checks) {
  let passed = 0;
  const score = () => ($('#score').textContent = `${passed} of ${checks.length} checked` + (passed === checks.length ? ', all passing' : ''));
  checks.forEach((c, i) => {
    c.icon = h('div', { class: 'icon' }, String(i + 1));
    c.res = h('div', { class: 'res' });
    c.btn = h('button', { class: 'btn ghost small', onclick: () => runOne(c) }, 'Run');
    $('#checklist').append(h('div', { class: 'check' }, c.icon, h('div', null, h('div', { class: 'req' }, c.req, h('small', null, c.note)), c.res), c.btn));
  });
  async function runOne(c) {
    if (c.running) return;
    c.running = true; c.btn.disabled = true;
    c.icon.className = 'icon run'; c.icon.replaceChildren(h('span', { class: 'spin' }));
    c.res.className = 'res show'; c.res.replaceChildren(h('div', { class: 'typical' }, 'Running…'));
    let r;
    try { r = await c.run((msg) => { c.res.firstChild.textContent = msg; }); }
    catch (e) { r = { ok: false, mine: 'Demo error: ' + e.message, usual: '' }; }
    c.icon.className = r.ok ? 'icon ok' : 'icon'; c.icon.replaceChildren(r.ok ? '✓' : '!');
    c.res.replaceChildren(h('div', { class: 'mine' }, r.mine), r.usual ? h('div', { class: 'typical' }, r.usual) : '');
    if (!c.done && r.ok) { c.done = true; passed++; }
    score(); c.btn.textContent = 'Run again'; c.btn.disabled = false; c.running = false;
  }
  score();
  $('#runall').onclick = async () => {
    track('run-all'); $('#runall').disabled = true;
    for (const c of checks) { await runOne(c); await sleep(document.hidden ? 0 : 250); }
    $('#runall').disabled = false;
  };
}

// ---------- section 5: for your developer ----------
// onDevOpen(async (log) => { log('$ cmd', 'cmd'); log('ok 1 - ...', 'ok'); }) runs once, the first time it is opened.
function onDevOpen(fn) {
  const d = $('#dev'), out = $('#devout');
  d.addEventListener('toggle', async () => {
    if (!d.open || d.ran) return;
    d.ran = true; track('dev'); out.replaceChildren();
    const log = (text, cls) => { if (!cls) cls = /\b(FAIL|not ok|Error)\b/.test(text) ? 'fail' : /^\s*(ok|PASS)\b/.test(text) ? 'ok' : ''; out.append(h('span', { class: cls }, text + '\n')); };
    try { await fn(log); } catch (e) { log('Demo error: ' + e.message, 'fail'); }
  });
}

// ---------- runtimes ----------
// Python in the tab: await runPython(['main.py', 'helper.py'], 'main.py', log, { VARIANT: 'mine' })
let _py;
async function runPython(files, main, log, globals = {}) {
  if (!_py) {
    log('Loading Python in your browser (first run only, about 5 s)…', 'dim');
    await new Promise((res, rej) => { const s = h('script', { src: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js' }); s.onload = res; s.onerror = rej; document.head.append(s); });
    _py = await loadPyodide();
  }
  for (const f of files) _py.FS.writeFile(f, await (await fetch(f, { cache: 'no-store' })).text());
  _py.setStdout({ batched: (t) => log(t) }); _py.setStderr({ batched: (t) => log(t, 'fail') });
  _py.globals.set('INIT', _py.toPy(globals));
  await _py.runPythonAsync(`import runpy, sys; sys.path.insert(0, '.'); sys.argv=['${main}']; runpy.run_path('${main}', init_globals=dict(INIT), run_name='__main__')`)
    .catch((e) => log(String(e).split('\n').slice(-2).join(' '), 'fail'));
}
// A recorded run (anything that needs a model key or their system): await replay('run-raw.txt', log)
async function replay(url, log, ms = 50) {
  const lines = (await (await fetch(url, { cache: 'no-store' })).text()).split('\n');
  for (const l of lines) { log(l, l.startsWith('$') ? 'cmd' : undefined); if (!document.hidden) await sleep(ms); }
}
