// Inquiry agent, first slice: a morning of inquiries (section 1), the site chat (section 2), their list (section 3).
// kit.js is loaded first ($, h, toast, track, sleep, netLatency, setupChecklist, onDevOpen).

// ---- stand-in fact sheet: the only things the agent may say on its own ----
const FACTS = [
  { label: 'pricing', match: /growth|package|include|price|cost|how much/i, answer: 'The Growth package is $1,200 a month: funnel set-up, weekly campaign emails and a monthly report.' },
  { label: 'getting started', match: /start|how fast|onboarding|how long/i, answer: 'Onboarding takes 5 working days from sign-up.' },
  { label: 'opening hours', match: /hours|open/i, answer: 'We are open Sunday to Thursday, 9 am to 6 pm.' },
  { label: 'demo booking', match: /demo|call|meeting/i, answer: 'Demos run Sunday to Thursday. Your time is held, and the director will confirm it shortly.' },
];
// things only the director decides: the agent keeps the customer informed and drafts, a person sends
const ESCALATE = [
  { re: /discount|% off|cheaper/i, why: 'Discount request', because: 'only you set prices',
    draft: (n) => `Hi ${n}, thanks for asking about a yearly plan. If you sign for 12 months we can offer 10% off. Shall I send over the agreement?` },
  { re: /refund|charged twice/i, why: 'Refund or billing', because: 'money back is your call',
    draft: (n) => `Hi ${n}, sorry about the double charge. I've refunded the second payment today, and it will show on your statement within 5 working days.` },
  { re: /custom|enterprise|quote/i, why: 'Custom quote', because: 'you price custom work',
    draft: (n) => `Hi ${n}, thanks for the details. For 40 sites I'd suggest a custom plan. Could we do a 15-minute call on Sunday to confirm scope and price?` },
];
const UNKNOWN = { why: 'Not in the fact sheet', because: 'the agent does not guess', draft: (n) => `Hi ${n}, `, learn: true };
const SPAM = /backlink|crypto|click here|guaranteed traffic/i;
const STOP = /stop emailing|unsubscribe/i;

// ---- a stand-in morning: 12 inquiries, shaped like a busy site's inbox ----
const INBOX = [
  { t: '09:02', via: 'site chat', name: 'Sara', contact: 'sara/northwind', text: 'What does the Growth package include and how much is it?' },
  { t: '09:10', via: 'email', name: 'Omar', contact: 'omar/dunes', text: 'Can you do 30% off if we sign for a year?' },
  { t: '09:14', via: 'site chat', name: 'Sara', contact: 'Sara/Northwind', text: 'Also, how fast can you start?' },
  { t: '09:21', via: 'email', name: 'R. Haddad', contact: 'r.haddad/oldlist', text: 'Please stop emailing me.' },
  { t: '09:33', via: 'contact form', name: 'SEO Pro', contact: 'deals/spamfarm', text: 'Buy backlinks cheap, guaranteed traffic, click here!!!' },
  { t: '09:40', via: 'email', name: 'Layla', contact: 'layla/bloom', text: 'I was charged twice this month, I want a refund.' },
  { t: '09:52', via: 'site chat', name: 'Khalid', contact: 'khalid/souq', text: 'Do you integrate with HubSpot?' },
  { t: '10:05', via: 'site chat', name: 'Priya', contact: 'priya/kite', text: 'What are your office hours?' },
  { t: '10:12', via: 'contact form', name: 'Dan', contact: 'dan/harbor', text: 'Can we book a demo call for Tuesday at 11?' },
  { t: '10:26', via: 'email', name: 'Fatima', contact: 'fatima/atlas', text: 'We need a custom enterprise quote for 40 sites, budget around $5k.' },
  { t: '10:41', via: 'email', name: 'Omar', contact: 'OMAR/dunes', text: 'Following up on the discount, any news?' },
  { t: '10:52', via: 'site chat', name: 'Nadia', contact: 'nadia/pine', text: 'How long does onboarding take?' },
];

const norm = (c) => c.trim().toLowerCase();
const budgetOf = (t) => (t.match(/\$\s?[\d,.]+k?/i) || [''])[0];
const newState = () => ({ sheet: new Map(), suppressed: new Set(), last: new Map() });
const hold = (n) => `Thanks${n ? ' ' + n : ''}, I've passed this to our director, who will reply to you personally today.`;

// mine: dedupe by contact, do-not-email list honoured, answers only from the fact sheet, everything else to the director
function decideMine(q, st) {
  const key = norm(q.contact), n = q.name;
  if (SPAM.test(q.text)) return { kind: 'drop', key, topic: 'spam' };
  if (STOP.test(q.text)) { st.suppressed.add(key); return { kind: 'suppress', key, topic: 'unsubscribe', reply: "Understood. You won't get any more emails from us." }; }
  const repeat = st.sheet.has(key), prev = st.sheet.get(key);
  // a vague follow-up ("any news?") stays with the director; a new question the fact sheet answers does not
  const esc = ESCALATE.find((e) => e.re.test(q.text)) || (repeat && !FACTS.some((f) => f.match.test(q.text)) && ESCALATE.find((e) => e.re.test(st.last.get(key) || '')));
  const fact = !esc && FACTS.find((f) => f.match.test(q.text));
  const route = esc || (fact ? null : UNKNOWN);
  const topic = route ? route.why.toLowerCase() : fact.label;
  st.sheet.set(key, {
    name: n, via: prev ? prev.via : q.via, budget: budgetOf(q.text) || (prev ? prev.budget : ''),
    topics: prev ? [...new Set([...prev.topics, topic])] : [topic],
    status: route ? 'Waiting for you' : prev && prev.status !== 'Answered' ? prev.status : 'Answered',
  });
  st.last.set(key, q.text);
  const emailOk = !st.suppressed.has(key);
  if (route) return { kind: 'escalate', key, repeat, route, topic, emailOk, reply: repeat ? `Thanks${n ? ' ' + n : ''}, your answer from our director is on its way today.` : hold(n) };
  return { kind: 'reply', key, repeat, fact, topic, emailOk, reply: `${n ? 'Hi ' + n + '! ' : ''}${fact.answer}` };
}
// the typical first version: a "be helpful" agent with no limits, an append-only sheet, a welcome email for every message
function decideUsual(q, st) {
  st.rows.push(q.contact); st.emails += 2;
  const fact = FACTS.find((f) => f.match.test(q.text));
  const risky = (ESCALATE.find((e) => e.re.test(q.text)) || /hubspot|integrat/i.test(q.text)) && !/following up/i.test(q.text);
  if (risky) {
    const [promise, wrong] = /refund/i.test(q.text) ? ['Your refund has been processed.', 'Nobody processed a refund'] : /quote/i.test(q.text) ? ['For 40 sites we can do $4,500.', 'A price you never set']
      : /hubspot/i.test(q.text) ? ['Yes, we integrate with HubSpot.', 'Not in your fact sheet'] : ['Yes, we can offer that.', 'A 30% discount you never approved'];
    st.invented.push(q.name);
    return { kind: 'invented', wrong, reply: `Hi ${q.name}! ${promise} Welcome aboard!` };
  }
  return { kind: 'sent', reply: `Hi ${q.name}! ${fact ? fact.answer : 'Thanks for reaching out, we would love to help!'} Welcome aboard!` };
}
const M = (() => { const st = newState(); return { st, out: INBOX.map((q) => ({ q, d: decideMine(q, st) })) }; })();
const U = (() => { const st = { rows: [], emails: 0, invented: [] }; return { st, out: INBOX.map((q) => ({ q, d: decideUsual(q, st) })) }; })();
const count = (k) => M.out.filter((o) => o.d.kind === k).length;
const threads = new Set(M.out.filter((o) => o.d.kind === 'escalate').map((o) => o.d.key)).size;

// ---- section 1: a morning of inquiries ----
const lanes = { ans: $('#lane-ans'), you: $('#lane-you'), out: $('#lane-out') };
const OUTCOME = { reply: 'answered from your fact sheet', escalate: 'sent to you, with a draft ready', drop: 'spam, kept out', suppress: 'added to the do-not-email list' };
const PILL = { 'Answered': 'g', 'Waiting for you': 'a', 'Sent by you': 'g' };
let sim, playing = false, fast = false;

function resetSim() {
  sim = { st: newState(), cards: new Map(), n: 0, ans: 0, you: 0 };
  Object.values(lanes).forEach((l) => l.replaceChildren());
  $('#usual').classList.remove('show'); $('#bad-replies').classList.remove('show');
  $('#sheet-note').textContent = 'Fills in as messages arrive. Keyed by contact, so nothing is saved twice.';
  renderSheet(); stats();
}
function stats() {
  $('#s-in').textContent = sim.n; $('#s-ans').textContent = sim.ans; $('#s-leads').textContent = sim.st.sheet.size;
  $('#s-you').textContent = sim.you; $('#s-bad').textContent = 0;
  for (const k of ['ans', 'you', 'out']) $('#c-' + k).textContent = lanes[k].children.length || '';
}
function renderSheet(flash) {
  const rows = [...sim.st.sheet].map(([k, r]) => h('tr', { class: k === flash ? 'flash' : '' },
    h('td', null, h('b', null, r.name)), h('td', null, r.via), h('td', null, r.topics.join(', ')), h('td', null, r.budget || '–'),
    h('td', null, h('span', { class: 'st tag ' + PILL[r.status] }, r.status))));
  $('#sheet').replaceChildren(...(rows.length ? rows : [h('tr', { class: 'empty-row' }, h('td', { colspan: 5 }, 'No leads yet.'))]));
}
const meta = (q, extra) => h('div', { class: 'meta' }, h('b', null, q.name), ` · ${q.via} · ${q.t}`, extra || '');
const quote = (t) => h('p', { class: 'q' }, `“${t}”`);

function place(q, d) {
  const lane = d.kind === 'reply' ? 'ans' : d.kind === 'escalate' ? 'you' : 'out';
  const prev = sim.cards.get(d.key);
  if (d.repeat && prev && prev.lane === lane) {           // same person, same thread: one card, one lead row
    const follow = h('div', { class: 'follow' }, h('div', { class: 'meta' }, `${q.t} · follow-up, same thread`), quote(q.text),
      lane === 'ans' ? h('p', { class: 'a' }, d.reply) : h('p', { class: 'told' }, `Told: “${d.reply}” Still one item for you.`));
    prev.act ? prev.el.insertBefore(follow, prev.act) : prev.el.append(follow);   // your reply stays last in the thread
    prev.el.style.animation = 'none'; void prev.el.offsetWidth; prev.el.style.animation = '';
    if (lane === 'ans') sim.ans++;
    return;
  }
  let el, act;
  if (lane === 'ans') {
    sim.ans++;
    el = h('div', { class: 'item' }, meta(q), quote(q.text), h('p', { class: 'a' }, d.reply),
      h('span', { class: 'tag g' }, 'Answered in seconds'), h('span', { class: 'tag n' }, 'fact sheet: ' + d.fact.label));
  } else if (lane === 'you') {
    sim.you++;
    act = h('div', { class: 'row' });
    el = h('div', { class: 'item' }, meta(q), quote(q.text), h('span', { class: 'tag a' }, d.route.why), h('span', { class: 'tag n' }, d.route.because),
      h('p', { class: 'told' }, `Customer already told: “${d.reply}”`), act);
    act.append(h('button', { class: 'btn small', onclick: () => openDraft(q, d, el, act) }, 'Write the reply'));
  } else {
    el = h('div', { class: 'item' }, meta(q), quote(q.text),
      h('span', { class: 'tag n' }, d.kind === 'drop' ? 'Spam: no reply, not saved' : 'Asked to stop: no email, now or later'));
  }
  sim.cards.set(d.key, { el, lane, act });
  lanes[lane].append(el);
}
function openDraft(q, d, el, act) {
  track('draft');
  const ta = h('textarea', { 'aria-label': 'Your reply to ' + q.name }); ta.value = d.route.draft(q.name);
  const learn = d.route.learn ? h('input', { type: 'checkbox', checked: '' }) : null;
  act.replaceChildren(h('div', { style: 'width:100%' },
    h('div', { class: 'meta' }, d.route.learn ? 'The agent does not know this one. Type your answer:' : 'Draft written for you. Edit anything, then send.'), ta,
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => send() }, 'Send as me'),
      learn ? h('label', { class: 'learn' }, learn, 'Add my answer to the fact sheet, so the agent answers this itself next time') : '')));
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  function send() {
    if (d.route.learn && ta.value.trim().length <= d.route.draft(q.name).trim().length) return toast('Type your answer first');
    track('approve');
    el.classList.add('sent');
    act.replaceChildren(h('p', { class: 'a', style: 'margin:6px 0' }, ta.value.trim()), h('span', { class: 'tag g' }, 'Sent by you'),
      learn && learn.checked ? h('span', { class: 'tag n' }, 'Added to the fact sheet') : '');
    sim.st.sheet.get(d.key).status = 'Sent by you';
    sim.you--; renderSheet(d.key); stats();
    toast(sim.you ? `Sent. ${sim.you} left for you.` : 'Sent. Nothing left on your desk.');
  }
}
async function play(skip) {
  if (playing) { fast = true; return; }
  playing = true; fast = !!skip; track(skip ? 'skip' : 'play'); resetSim();
  const btn = $('#play'); btn.disabled = true; btn.textContent = 'Playing…';
  for (const q of INBOX) {
    $('#clock').textContent = q.t;
    $('#ticker').replaceChildren(h('span', { class: 'spin' }), ` ${q.t} · new ${q.via} message from ${q.name}`);
    if (!fast) await sleep(420);
    const d = decideMine(q, sim.st); sim.n++;
    place(q, d); renderSheet(d.key); stats();
    $('#ticker').textContent = `${q.t} · ${q.name}: ${OUTCOME[d.kind]}`;
    if (!fast) await sleep(480);
  }
  $('#clock').textContent = '11:00';
  $('#ticker').replaceChildren(h('b', null, `Morning done. ${sim.n} messages handled, ${sim.ans} answered on the spot, ${sim.you} waiting for you.`), ' Try one: press “Write the reply” in the yellow column.');
  $('#sheet-note').textContent = `${sim.st.sheet.size} leads from ${sim.n} messages: 2 repeat senders merged, 1 spam message kept out, 1 person on the do-not-email list.`;
  $('#usual').classList.add('show');
  btn.disabled = false; btn.textContent = '↻ Play again'; playing = false;
}
$('#play').onclick = () => play(false);
$('#skip').onclick = () => play(true);
$('#heroplay').addEventListener('click', () => setTimeout(() => play(false), 500));
$('#usual-list').replaceChildren(
  h('li', null, h('b', null, `${U.st.invented.length} promises nobody approved`), ': a 30% discount, a refund, a HubSpot integration and a $4,500 quote'),
  h('li', null, h('b', null, `${U.st.emails} emails`), ', including one to a person who asked to stop and one to a spammer'),
  h('li', null, h('b', null, `${U.st.rows.length} rows`), ' in your sheet, 4 of them duplicates or junk'),
  h('li', null, h('b', null, '0 messages for you'), '. You would hear about the refund from the customer.'));
$('#bad-replies').replaceChildren(...U.out.filter((o) => o.d.kind === 'invented').map((o) =>
  h('div', { class: 'badr' }, h('div', { class: 'meta' }, 'To ', h('b', null, o.q.name), ` · ${o.q.t}`), h('div', { class: 'bubble' }, o.d.reply), h('small', null, o.d.wrong))));
$('#show-bad').onclick = () => { track('show-bad'); $('#bad-replies').classList.toggle('show'); };
resetSim();

// ---- section 2: the site chat, and what happens behind it ----
const CHIPS = ['How much is the Growth package?', 'Can I get 30% off for a year?', 'I was charged twice, can I get a refund?', 'Do you integrate with HubSpot?', 'When are you open?', 'Please stop emailing me'];
const chat = newState();
let busy = false;
$('#chips').replaceChildren(...CHIPS.map((c) => h('button', { class: 'chip', type: 'button', onclick: () => ask(c) }, c)));
$('#ask').addEventListener('submit', (e) => { e.preventDefault(); const t = $('#own').value.trim(); if (!t) return toast('Type a question first'); $('#own').value = ''; ask(t); });

function stepsFor(d) {
  if (d.kind === 'drop') return [['Understood the message', 'Looks like spam'], ['Nothing sent, nothing saved', 'Kept out of your lead sheet and your inbox', 'ok']];
  if (d.kind === 'suppress') return [['Understood the message', 'Asks to stop getting emails'], ['Do-not-email list', 'Added. No marketing email to this person, now or later', 'ok']];
  const s = [['Understood the question', 'Topic: ' + d.topic],
    ['Lead sheet', d.repeat ? 'Same person as before: existing row updated, not duplicated' : 'New lead saved, with where they came from'],
    ['Do-not-email list', d.emailOk ? 'Not on it, follow-up emails allowed' : 'On it: chat answer only, no follow-up emails']];
  if (d.kind === 'reply') s.push(['Answer', `Found in your fact sheet (${d.fact.label}), replied in seconds`, 'ok'], ['Promise check', 'The reply says nothing that is not in your fact sheet', 'ok']);
  else s.push(['Needs you', `${d.route.why}: ${d.route.because}. Sent to you with a draft reply`, 'you'], ['Customer kept informed', 'Told a person will reply today, so nobody waits in silence', 'ok']);
  return s;
}
async function ask(text) {
  if (busy) return; busy = true; track('ask');
  const msgs = $('#msgs');
  const scroll = () => { msgs.scrollTop = msgs.scrollHeight; };
  msgs.append(h('div', { class: 'bub me' }, text)); scroll();
  const typing = h('div', { class: 'typing' }, 'typing…'); msgs.append(typing); scroll();
  const d = decideMine({ name: '', contact: 'visitor/site', text, via: 'site chat' }, chat);
  $('#trace').replaceChildren();
  for (const [i, [b, s, cls]] of stepsFor(d).entries()) {
    await sleep(document.hidden ? 0 : 320);
    $('#trace').append(h('li', { class: cls || '' }, h('div', { class: 'n' }, cls === 'ok' ? '✓' : cls === 'you' ? '!' : String(i + 1)), h('div', null, h('b', null, b), h('span', null, s))));
  }
  typing.remove();
  msgs.append(d.kind === 'drop' ? h('div', { class: 'bub sys' }, 'No reply: marked as spam') : h('div', { class: 'bub bot' }, d.reply)); scroll();
  busy = false;
}

// ---- section 3: their list, verbatim ----
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
      return { ok: true, mine: `${count('escalate')} messages in ${threads} threads sent to the director, each with a ready draft and the reason (discount, refund, quote, a question not in the fact sheet).`, usual: 'Usual version: 0 routed. The director hears about the refund from the customer.' }; } },
];
setupChecklist(CHECKS);

// ---- section 5: for your developer ----
onDevOpen(async (log) => {
  log('$ inquiry desk (this page, app.js) on the 12 stand-in inquiries', 'cmd');
  for (const [i, o] of M.out.entries()) { log(`${String(i + 1).padStart(2)}  ${o.q.t}  ${o.d.kind.padEnd(9)} ${o.q.contact.padEnd(18)} ${o.q.text.slice(0, 44)}`); if (!document.hidden) await sleep(60); }
  log(`\nok  lead rows ${M.st.sheet.size} · replies ${count('reply')} · to director ${count('escalate')} (${threads} threads) · dropped ${count('drop')} · do-not-email ${count('suppress')}`, 'ok');
  log(`ok  made-up promises 0 (usual version: ${U.st.invented.length} of 12)`, 'ok');
});
