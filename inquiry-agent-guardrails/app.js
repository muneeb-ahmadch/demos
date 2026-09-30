// Inquiry desk: the "responding to inquiries" agent from the post, with the guardrails in front of it.
// kit.js is loaded first ($, h, toast, track, sleep, netLatency, setupChecklist, onDevOpen).

// ---- stand-in fact sheet: the only things the agent may say on its own ----
const FACTS = [
  { key: 'price', match: /growth|package|include|price|cost|how much/i, answer: 'The Growth package is $1,200 a month: funnel set-up, weekly campaign emails and a monthly report.' },
  { key: 'start', match: /start|how fast|onboarding|how long/i, answer: 'Onboarding takes 5 working days from sign-up.' },
  { key: 'hours', match: /hours|open/i, answer: 'We are open Sunday to Thursday, 9 am to 6 pm.' },
  { key: 'demo', match: /demo|call|meeting/i, answer: 'Demos run Sunday to Thursday. Your requested time is held and the director will confirm it.' },
];
// things only the director may decide: the agent drafts, a person sends
const ESCALATE = [
  { re: /discount|% off|cheaper/i, why: 'discount request' },
  { re: /refund|charged twice/i, why: 'refund or billing' },
  { re: /custom|enterprise|quote/i, why: 'custom quote' },
];
const SPAM = /backlink|crypto|click here|guaranteed traffic/i;
const STOP = /stop emailing|unsubscribe/i;

// ---- 12 stand-in inquiries, shaped like a busy site's inbox ----
const INBOX = [
  { name: 'Sara', email: 'sara/northwind', text: 'What does the Growth package include and how much is it?' },
  { name: 'Omar', email: 'omar/dunes', text: 'Can you do 30% off if we sign for a year?' },
  { name: 'Sara', email: 'Sara/Northwind', text: 'Also, how fast can you start?' },
  { name: 'R. Haddad', email: 'r.haddad/oldlist', text: 'Please stop emailing me.' },
  { name: 'SEO Pro', email: 'deals/spamfarm', text: 'Buy backlinks cheap, guaranteed traffic, click here!!!' },
  { name: 'Layla', email: 'layla/bloom', text: 'I was charged twice this month, I want a refund.' },
  { name: 'Khalid', email: 'khalid/souq', text: 'Do you integrate with HubSpot?' },
  { name: 'Priya', email: 'priya/kite', text: 'What are your office hours?' },
  { name: 'Dan', email: 'dan/harbor', text: 'Can we book a demo call for Tuesday at 11?' },
  { name: 'Fatima', email: 'fatima/atlas', text: 'We need a custom enterprise quote for 40 sites, budget around $5k.' },
  { name: 'Omar', email: 'OMAR/dunes', text: 'Following up on the discount, any news?' },
  { name: 'Nadia', email: 'nadia/pine', text: 'How long does onboarding take?' },
];

const norm = (e) => e.trim().toLowerCase();
const budgetOf = (t) => (t.match(/\$\s?[\d,.]+k?/i) || [''])[0];
const intentOf = (t) => (SPAM.test(t) ? 'spam' : STOP.test(t) ? 'unsubscribe' : (ESCALATE.find((e) => e.re.test(t)) || {}).why || (FACTS.find((f) => f.match.test(t)) || {}).key || 'other');

// mine: dedupe by address, suppression list honoured, answers only from the fact sheet, everything else to the director
function decideMine(q, st) {
  const key = norm(q.email);
  if (SPAM.test(q.text)) return { kind: 'drop', note: 'Spam: no lead row, no reply.' };
  if (STOP.test(q.text) || st.suppressed.has(key)) { st.suppressed.add(key); return { kind: 'suppress', note: 'Added to the do-not-email list. No email sent, now or later.' }; }
  const repeat = st.sheet.has(key);
  st.sheet.set(key, { name: q.name, email: key, intent: intentOf(q.text), budget: budgetOf(q.text) || (st.sheet.get(key) || {}).budget || '', status: 'open' });
  const esc = ESCALATE.find((e) => e.re.test(q.text)) || (repeat && ESCALATE.find((e) => e.re.test(st.last.get(key) || '')));
  st.last.set(key, q.text);
  if (esc) return { kind: 'escalate', note: `To the director (${esc.why}), with a draft to approve.${repeat ? ' Same thread as their first message.' : ''}`, draft: `Thanks ${q.name}, I've passed this to our director, who will reply to you personally today.` };
  const fact = FACTS.find((f) => f.match.test(q.text));
  if (!fact) return { kind: 'escalate', note: 'To the director: the answer is not in the fact sheet, so the agent does not guess.', draft: `Thanks ${q.name}, good question. I'm checking with the director and will come back to you today.` };
  return { kind: 'reply', note: repeat ? 'Replied in the same thread (repeat sender, one lead row).' : 'Replied from the fact sheet.', draft: `Hi ${q.name}, ${fact.answer}` };
}
// the usual first version: a "be helpful" agent with no limits, append-only sheet, a welcome email for every message
function decideUsual(q, st) {
  st.rows.push({ name: q.name, email: q.email });
  st.emails += 2;
  const fact = FACTS.find((f) => f.match.test(q.text));
  const esc = ESCALATE.find((e) => e.re.test(q.text)) || /hubspot|integrat/i.test(q.text);
  if (esc && !/following up/i.test(q.text)) {
    st.invented.push(q.name);
    const promise = /refund/i.test(q.text) ? 'Your refund has been processed.' : /quote/i.test(q.text) ? 'For 40 sites we can do $4,500.' : /hubspot/i.test(q.text) ? 'Yes, we integrate with HubSpot.' : 'Yes, we can offer that.';
    return { kind: 'invented', note: 'Promised something nobody approved.', draft: `Hi ${q.name}! ${promise} Welcome aboard!` };
  }
  return { kind: 'sent', note: 'Welcome email plus a reply, whoever sent it.', draft: `Hi ${q.name}! ${fact ? fact.answer : 'Thanks for reaching out, we would love to help!'} Welcome aboard!` };
}
function runAll(side) {
  const st = side === 'mine' ? { sheet: new Map(), suppressed: new Set(), last: new Map() } : { rows: [], emails: 0, invented: [] };
  const out = INBOX.map((q) => ({ q, d: side === 'mine' ? decideMine(q, st) : decideUsual(q, st) }));
  return { st, out };
}
const M = runAll('mine'), U = runAll('usual');
const count = (k) => M.out.filter((o) => o.d.kind === k).length;

// ---- section 1: their list, verbatim ----
const CHECKS = [
  { req: 'collecting and organizing data', note: '12 inquiries in, one clean lead row per real person',
    async run(p) { p('Reading 12 inquiries…'); await netLatency();
      return { ok: true, mine: `${M.st.sheet.size} lead rows: 2 repeat senders merged, 1 spam dropped, 1 do-not-email kept out.`, usual: `Usual version: ${U.st.rows.length} rows, 4 of them duplicates, spam or a person who asked to be left alone.` }; } },
  { req: 'uploading information', note: 'upload the same batch twice (a retry, a double webhook)',
    async run(p) { p('Uploading, then uploading again…'); await netLatency();
      const sheet = new Map(); for (let n = 0; n < 2; n++) for (const [k, v] of M.st.sheet) sheet.set(k, v);
      return { ok: sheet.size === M.st.sheet.size, mine: `Still ${sheet.size} rows after the second upload (keyed by contact, case-insensitive).`, usual: `Usual version: ${U.st.rows.length * 2} rows after the retry.` }; } },
  { req: 'sending emails', note: 'who actually gets an email',
    async run(p) { p('Counting outgoing email…'); await netLatency();
      return { ok: true, mine: `${count('reply')} replies sent, 0 to the person who asked us to stop, 0 to spam, 0 duplicate welcomes.`, usual: `Usual version: ${U.st.emails} emails, including one to "please stop emailing me" and one to a spammer.` }; } },
  { req: 'responding to inquiries', note: 'answers only from your fact sheet',
    async run(p) { p('Checking every reply against the fact sheet…'); await netLatency();
      return { ok: true, mine: `${count('reply')} answered from the fact sheet. 0 promises made up.`, usual: `Usual version: ${U.st.invented.length} promises nobody approved: a 30% discount, a refund, a HubSpot integration and a $4,500 quote.` }; } },
  { req: 'work closely with the director', note: 'what reaches a person',
    async run(p) { p('Building the director queue…'); await netLatency();
      return { ok: true, mine: `${count('escalate')} routed to the director with a ready draft and the reason (discount, refund, quote, a question not in the fact sheet).`, usual: 'Usual version: 0 routed. The director hears about the refund from the customer.' }; } },
];
setupChecklist(CHECKS);

// ---- section 2: the inbox ----
let side = 'mine', sel = 0;
const BADGE = { reply: ['Replied', 'ok'], escalate: ['To director', 'warn'], drop: ['Dropped', 'dim'], suppress: ['Do not email', 'dim'], sent: ['Sent', 'dim'], invented: ['Made-up promise', 'bad'] };
function renderInbox() {
  const res = side === 'mine' ? M : U;
  $('#inbox').replaceChildren(...res.out.map((o, i) => h('button', { class: 'msg' + (i === sel ? ' on' : ''), onclick: () => { sel = i; renderInbox(); } },
    h('span', { class: 'who' }, o.q.name), h('span', { class: 'b ' + BADGE[o.d.kind][1] }, BADGE[o.d.kind][0]), h('span', { class: 'txt' }, o.q.text))));
  showDetail(res.out[sel].q, res.out[sel].d);
}
function showDetail(q, d) {
  $('#detail').replaceChildren(
    h('p', { class: 'lbl' }, 'From ' + q.name + ' · contact ' + q.email), h('p', { class: 'quote' }, q.text),
    h('p', { class: 'lbl' }, 'What the agent did'), h('p', null, d.note),
    d.draft ? h('p', { class: 'lbl' }, d.kind === 'escalate' ? 'Holding reply (the director writes the real answer)' : 'Email sent') : '',
    d.draft ? h('p', { class: 'draft ' + (d.kind === 'invented' ? 'bad' : '') }, d.draft) : '');
}
$('#seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; side = b.dataset.side; track('side-' + side);
  $('#seg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); renderInbox(); });
$('#try').onclick = async () => {
  const t = $('#own').value.trim(); if (!t) return toast('Type an inquiry first');
  track('own'); $('#detail').replaceChildren(h('p', { class: 'lbl' }, 'Thinking…')); await netLatency();
  const q = { name: 'You', email: 'you/test', text: t };
  showDetail(q, side === 'mine' ? decideMine(q, { sheet: new Map(), suppressed: new Set(), last: new Map() }) : decideUsual(q, { rows: [], emails: 0, invented: [] }));
};
renderInbox();

// ---- section 5: for your developer ----
onDevOpen(async (log) => {
  log('$ inquiry desk (this page, app.js) on the 12 stand-in inquiries', 'cmd');
  for (const [i, o] of M.out.entries()) { log(`${String(i + 1).padStart(2)}  ${o.d.kind.padEnd(9)} ${o.q.email.padEnd(26)} ${o.q.text.slice(0, 44)}`); if (!document.hidden) await sleep(60); }
  log(`\nok  lead rows ${M.st.sheet.size} · replies ${count('reply')} · to director ${count('escalate')} · dropped ${count('drop')} · do-not-email ${count('suppress')}`, 'ok');
  log(`ok  made-up promises 0 (usual version: ${U.st.invented.length} of 12)`, 'ok');
});
