// Canary run for a fact-memory scorer. Logic and canaries live in scorers.js (also run in node for the recorded numbers).
const label = (p) => (p ? 'PASS' : 'fail');

// ---- section 1: the canaries ----
const CHECKS = CANARIES.map((c) => ({
  req: `${c.group}: "${c.a}"`,
  note: `Q: ${c.q} · key: ${c.key === NO_MATCH ? 'no match' : c.key || '(blank)'} · this answer is ${c.kind === 'wrong' ? 'WRONG, must fail' : 'RIGHT, must pass'} (${c.why})`,
  async run() {
    await netLatency();
    const u = usualScore(c), s = strictScore(c);
    return {
      ok: verdict(c, s.pass),
      mine: `Stricter scorer: ${label(s.pass)} (${s.reason})`,
      usual: `Typical first scorer: ${label(u)}${verdict(c, u) ? ', correct' : c.kind === 'wrong' ? ', passed a wrong answer' : ', failed a right answer'}`,
    };
  },
}));
setupChecklist(CHECKS);

// ---- section 2: score your own answer ----
const QS = [
  { q: 'What is the rent now?', fact: 'rent', type: 'money', key: '$5,200' },
  { q: 'What was the rent on 2024-06-30?', fact: 'rent', type: 'money', key: '$4,500' },
  { q: 'Who is the account manager now?', fact: 'manager', type: 'text', key: 'Dana Okafor' },
  { q: 'When did Dana Okafor take over?', fact: 'manager', type: 'date', key: '2025-06-01' },
  { q: 'Who is the insurance provider?', fact: null, type: 'none', key: NO_MATCH },
];
QS.forEach((x, i) => $('#qsel').append(h('option', { value: i }, x.q)));
$('#ans').value = 'Either $4,500 or $5,200 a month.';
$('#scorebtn').onclick = () => {
  track('score-own');
  const x = QS[$('#qsel').value], c = { ...x, a: $('#ans').value };
  const u = usualScore(c), s = strictScore(c);
  $('#tryout').replaceChildren(
    h('div', null, `Answer key: ${x.key === NO_MATCH ? 'no match' : x.key}`),
    h('div', { class: s.pass ? 'good' : 'bad' }, `Stricter scorer: ${label(s.pass)} (${s.reason})`),
    h('div', { class: u ? 'good' : 'bad' }, `Typical first scorer: ${label(u)}`),
  );
};
const rows = Object.values(RECORDS).flatMap((r) => r.history.map(([d, v], i) => h('tr', null, h('td', null, r.label), h('td', null, v), h('td', null, `from ${d}`), h('td', null, i === r.history.length - 1 ? 'current' : 'superseded'))));
$('#recs').append(h('table', null, h('tr', null, h('th', null, 'Fact'), h('th', null, 'Value'), h('th', null, 'Valid'), h('th', null, 'Status')), ...rows), h('p', null, 'Nothing about an insurance provider, so that question must come back as no match.'));

// ---- section 5: for your developer ----
onDevOpen(async (log) => {
  log('$ node run_canaries.js', 'cmd');
  let uw = 0, sw = 0, ur = 0, sr = 0, W = 0, R = 0;
  CANARIES.forEach((c, i) => {
    const u = usualScore(c), s = strictScore(c).pass;
    if (c.kind === 'wrong') { W++; if (u) uw++; if (s) sw++; } else { R++; if (!u) ur++; if (!s) sr++; }
    log(`${String(i + 1).padStart(2)} ${c.kind.padEnd(5)} usual=${label(u)} strict=${label(s)}${verdict(c, u) ? '' : '  <- usual scorer wrong'} | ${c.why}`, verdict(c, u) ? '' : 'fail');
  });
  log(`usual scorer: passed ${uw} of ${W} wrong answers; failed ${ur} of ${R} right answers`, 'fail');
  log(`strict scorer: passed ${sw} of ${W} wrong answers; failed ${sr} of ${R} right answers`, 'ok');
});
