// A RAG chatbot that says "not available" instead of guessing. kit.js is loaded first ($, h, toast, track, sleep,
// netLatency, setupChecklist, onDevOpen, runPython, replay). The logic is the Python in chatbot.py, run via Pyodide.

const PY_FILES = ['sources.py', 'chatbot.py', 'questions.py', 'demo_api.py'];
let _ready;
function ensurePy(log = () => {}) {
  if (!_ready) {
    _ready = (async () => {
      await runPython(PY_FILES, 'demo_api.py', log);
      _py.runPython("import sys; sys.path.insert(0, '.'); import demo_api");
    })();
    _ready.then(() => fillMoment());
    _ready.catch(() => { _ready = null; });
  }
  return _ready;
}
async function py(expr, vars = {}) {
  await ensurePy();
  for (const [k, v] of Object.entries(vars)) _py.globals.set(k, _py.toPy(v));
  return JSON.parse(_py.runPython(expr));
}

const label = (a) => a.route === 'not-available' ? 'not available' : a.route;
const cite = (a) => (a.cites.length ? ' [' + a.cites.join(', ') + ']' : '');

// ---- section 1: their list, verbatim ----
function checkFor(req, note, idx) {
  return {
    req, note,
    async run(progress) {
      progress(_py ? 'Running…' : 'Loading Python in your browser (first run only, about 5 s)…');
      const rows = await py('demo_api.run_cases(IDX)', { IDX: idx });
      await netLatency();
      const on = rows.filter((r) => r.ok_on).length, off = rows.filter((r) => r.ok_off).length;
      const list = h('div', { class: 'rows' }, rows.map((r) => h('div', null,
        (r.ok_on ? '✓ ' : '✗ ') + r.q + ' → ' + label(r.on) + ': ' + r.on.text.slice(0, 110) + cite(r.on))));
      const worst = rows.find((r) => !r.ok_off);
      return {
        ok: on === rows.length,
        mine: [`${on} of ${rows.length} right with the guard on.`, list],
        usual: `Guard off: ${off} of ${rows.length} right.` + (worst ? ` Asked "${worst.q}", it answered: "${worst.off.text.slice(0, 120)}"${cite(worst.off)}` : ''),
      };
    },
  };
}
const CHECKS = [
  checkFor('Retrieve information from our documents, website content, and database records before generating answers', 'Seven questions: three answered by documents, two by website pages, two by database records.', [0, 1, 2, 3, 4, 5, 6]),
  checkFor('Clearly say when the requested information is not available rather than hallucinating', 'Five questions the sources cannot answer: a discount that doesn\'t exist, HIPAA, an account number that isn\'t in the database, a mobile app, PayPal.', [7, 8, 9, 10, 11]),
  checkFor('Hallucination prevention and source-grounded responses', 'All twelve together: every answer must name its source and pass the grounding check, or be "not available".', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
];
setupChecklist(CHECKS);
$('#cta').addEventListener('click', () => { track('cta-run'); setTimeout(() => $('#runall').click(), 450); });

// ---- section 2: the chatbot ----
let off = false;
$('#mode').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  off = b.dataset.off === '1';
  $('#mode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  track(off ? 'guard-off' : 'guard-on');
});
const SUGGEST = ['Can I get a refund on an annual plan after 3 weeks?', 'When does account ACC-1042 renew?', 'When does account ACC-7781 renew?', 'Will you sign a HIPAA business associate agreement?', 'Does it sync with Outlook?', 'Can customers pay with PayPal?'];
SUGGEST.forEach((s) => $('#chips').append(h('button', { type: 'button', onclick: () => ask(s) }, s)));

function trace(r) {
  const parts = [];
  if (r.route === 'record' || (r.cites[0] || '').startsWith('db:')) parts.push('database lookup: ' + (r.cites[0] || 'no matching row'));
  else if (r.score !== null) parts.push('best source score ' + r.score + (off ? '' : ' (threshold 2.0)'));
  if (r.grounded !== null) parts.push('grounding check: ' + (r.grounded ? 'every sentence found in the source' : 'failed'));
  if (off) parts.push('guard off: answers from the closest match whatever it is');
  return parts.join(' · ');
}

async function ask(q) {
  $('#empty')?.remove();
  const thread = $('#thread');
  thread.append(h('div', { class: 'msg you' }, q || '(empty message)'));
  const bubble = h('div', { class: 'msg bot' + (off ? ' off' : '') }, h('span', { class: 'spin' }), _py ? ' Looking in the sources…' : ' Loading Python in your browser (once, about 5 s)…');
  thread.append(bubble);
  $('#askbtn').disabled = true;
  try {
    const [r] = await Promise.all([py('demo_api.ask(Q, OFF)', { Q: q, OFF: off }), netLatency()]);
    bubble.replaceChildren(
      h('span', { class: 'route ' + r.route }, label(r)), h('div', null, r.text),
      r.cites.length ? h('div', { class: 'meta' }, 'source: ' + r.cites.join(', ')) : '',
      h('div', { class: 'trace' }, trace(r)));
  } catch (e) {
    bubble.replaceChildren('Could not load Python in this browser (' + e.message + '). The recorded run is under "For your developer".');
  }
  $('#askbtn').disabled = false;
  bubble.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  track('ask');
}
$('#askform').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#q').value; $('#q').value = ''; ask(q); });

// ---- section 3: the staged moment (computed live when it scrolls into view) ----
let _moment;
function fillMoment() {
  _moment = _moment || (async () => {
    const [row] = await py('demo_api.run_cases([8])');
    const show = (el, a) => el.replaceChildren(h('span', { class: 'route ' + a.route }, label(a)), h('div', null, a.text),
      a.cites.length ? h('div', { class: 'meta' }, 'source: ' + a.cites.join(', ')) : '');
    show($('#m-on'), row.on); show($('#m-off'), row.off);
    $('#m-on').className = ''; $('#m-off').className = '';
  })();
  return _moment;
}
new IntersectionObserver((entries, obs) => { if (entries[0].isIntersecting) { obs.disconnect(); fillMoment(); } }, { rootMargin: '200px' }).observe($('#moment'));

// ---- section 5: for your developer ----
onDevOpen(async (log) => {
  log('$ python questions.py', 'cmd');
  await ensurePy(log);
  await runPython(PY_FILES, 'questions.py', log);
  log('');
  log('$ python questions.py   (recorded first run: score threshold only, before the name check)', 'cmd');
  await replay('run-1-threshold-only.txt', log, 25);
});
