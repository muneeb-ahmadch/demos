// Meeting-room booking, first slice. Everything runs in this tab: an in-memory backend with simulated latency.
// Two backends share one class: safe=false is the usual first version (check, then insert; inclusive bounds;
// no missing-row handling; no past check), safe=true is mine (per-room lock around check+insert, half-open
// ranges, 404 on a missing row, past and 4-hour checks). In the real build the lock is a Postgres constraint.

// ---------- time ----------
const DAY0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const at = (day, h, m = 0) => DAY0 + day * 864e5 + (h * 60 + m) * 6e4;
const fmt = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const dayName = (day) => new Date(DAY0 + day * 864e5).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
const weekday = (day) => new Date(DAY0 + day * 864e5).toLocaleDateString('en-GB', { weekday: 'long' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Latency. The network kind is for things a person watches. The fast kind yields to the event loop a random number
// of times through MessageChannel, which background tabs do not throttle, for the 100-run stress checks.
const chan = new MessageChannel(), waiting = [];
chan.port1.onmessage = () => waiting.shift()();
const yieldTask = () => new Promise((r) => { waiting.push(r); chan.port2.postMessage(0); });
const fastLatency = async () => { for (let n = Math.random() * 8 | 0; n > 0; n--) await yieldTask(); };
const netLatency = () => sleep(220 + Math.random() * 380);

// ---------- backend ----------
class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; Object.assign(this, extra); } }
const ROOMS = [{ id: 1, name: 'Atlas', capacity: 4 }, { id: 2, name: 'Borealis', capacity: 8 }, { id: 3, name: 'Cedar', capacity: 12 }];

class BookingService {
  constructor({ safe, latency = fastLatency }) { this.safe = safe; this.latency = latency; this.rows = new Map(); this.next = 1; this.locks = new Map(); }
  overlaps(b, from, to) { return this.safe ? b.startTime < to && b.endTime > from : b.startTime <= to && b.endTime >= from; }
  async bookings(roomId, from, to) {
    await this.latency();
    return [...this.rows.values()].filter((b) => b.roomId === roomId && b.startTime < to && b.endTime > from).sort((a, b) => a.startTime - b.startTime);
  }
  async lock(roomId, fn) {
    if (!this.safe) return fn();
    const prev = this.locks.get(roomId) || Promise.resolve();
    let release; const mine = new Promise((r) => (release = r));
    this.locks.set(roomId, prev.then(() => mine));
    await prev;
    try { return await fn(); } finally { release(); }
  }
  async create({ roomId, title, startTime, endTime, createdBy }) {
    const s = +startTime, e = +endTime;
    if (!(e > s)) throw new HttpError(400, 'End time must be after the start time');
    if (e - s > 4 * 36e5) throw new HttpError(400, 'Bookings can be at most 4 hours');
    if (this.safe && s < Date.now()) throw new HttpError(400, 'That time has already passed');
    return this.lock(roomId, async () => {
      await this.latency();
      const clash = [...this.rows.values()].find((b) => b.roomId === roomId && this.overlaps(b, s, e)); // 1. check
      if (clash) throw new HttpError(409, 'Room already booked', { conflict: clash });
      await this.latency();
      const row = { id: this.next++, roomId, title, startTime: s, endTime: e, createdBy }; // 2. insert
      this.rows.set(row.id, row);
      return row;
    });
  }
  async remove(id) {
    await this.latency();
    const b = this.rows.get(id);
    if (this.safe && !b) throw new HttpError(404, 'Booking not found');
    this.rows.delete(id);
    return { deleted: b.id }; // the usual version reads .id of whatever came back
  }
}

// ---------- tiny DOM helpers ----------
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
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
function track(name) { try { window.goatcounter && goatcounter.count({ path: location.pathname + '#' + name, title: name, event: true }); } catch (e) {} }
const pace = () => (document.hidden ? Promise.resolve() : sleep(6));

// =====================================================================================
// 1. The checklist
// =====================================================================================
const slot = (h1, h2, who = 'Ana', day = 1) => ({ roomId: 1, title: 'Standup', startTime: at(day, h1), endTime: at(day, h2), createdBy: who });
const outcome = async (p) => { try { await p; return 'ok'; } catch (e) { return e.status || 'crash'; } };

async function doubleBookings(safe, onProgress) {
  let dbl = 0;
  for (let i = 1; i <= 100; i++) {
    const s = new BookingService({ safe });
    const r = await Promise.allSettled([s.create(slot(9, 10, 'Ana')), s.create(slot(9, 10, 'Ben'))]);
    if (r.filter((x) => x.status === 'fulfilled').length === 2) dbl++;
    if (onProgress) onProgress(i, dbl);
    await pace();
  }
  return dbl;
}

const CHECKS = [
  { req: 'Two near-simultaneous booking requests for the same room and time slot', note: '100 pairs of requests fired at the same moment',
    async run(progress) {
      const mine = await doubleBookings(true, (i) => progress(`Racing… ${i} of 100 pairs (my version)`));
      const usual = await doubleBookings(false, (i, d) => progress(`Racing… ${i} of 100 pairs (usual version, ${d} double-booked so far)`));
      return { ok: mine === 0, mine: `Exactly one booking wins in all 100 races. 0 double bookings.`,
        usual: usual ? [`Usual check-then-insert: `, h('b', null, `${usual} of 100 double-booked`), ` in this run.`] : 'Usual version: this run got lucky, 0 of 100. It usually is not.' };
    } },
  { req: 'Back-to-back bookings (end of one = start of another) are not a conflict', note: '09:00–10:00 booked, then 10:00–11:00',
    async run() {
      const check = async (safe) => { const s = new BookingService({ safe }); await s.create(slot(9, 10)); return outcome(s.create(slot(10, 11, 'Ben'))); };
      const [m, u] = [await check(true), await check(false)];
      return { ok: m === 'ok', mine: '10:00–11:00 accepted straight after 09:00–10:00.',
        usual: u === 'ok' ? 'Usual version: also accepted.' : ['Usual version: ', h('b', null, 'rejected it as a clash'), ', because its overlap test counts the shared 10:00.'] };
    } },
  { req: "Deleting a booking that's already been deleted or doesn't exist", note: 'the same booking deleted twice, and an id that never existed',
    async run() {
      const check = async (safe) => { const s = new BookingService({ safe }); const b = await s.create(slot(9, 10)); await s.remove(b.id); return [await outcome(s.remove(b.id)), await outcome(s.remove(999))]; };
      const [m, u] = [await check(true), await check(false)];
      return { ok: m[0] === 404 && m[1] === 404, mine: 'Both return a clean 404 Not Found.',
        usual: u[0] === 'crash' ? ['Usual version: ', h('b', null, 'the server crashes'), ' (TypeError on a missing row).'] : 'Usual version: handled.' };
    } },
  { req: 'Invalid time ranges (end before start, negative duration)', note: '11:00 → 10:00, and a zero-length booking',
    async run() {
      const s = new BookingService({ safe: true });
      const [a, b] = [await outcome(s.create(slot(11, 10))), await outcome(s.create(slot(10, 10)))];
      return { ok: a === 400 && b === 400, mine: 'Both rejected with a 400 and a message a person can act on.', usual: 'Usual version: also rejected. This one is usually right first time.' };
    } },
  { req: 'No bookings in the past, and a maximum duration of 4 hours', note: 'yesterday 09:00–10:00, and a 5-hour booking',
    async run() {
      const check = async (safe) => { const s = new BookingService({ safe }); return [await outcome(s.create(slot(9, 10, 'Ana', -1))), await outcome(s.create(slot(9, 14)))]; };
      const [m, u] = [await check(true), await check(false)];
      return { ok: m[0] === 400 && m[1] === 400, mine: 'Both rejected with a 400 before anything is written.',
        usual: u[0] === 'ok' ? ['Usual version: ', h('b', null, 'accepted a booking for yesterday'), '.'] : 'Usual version: also rejected.' };
    } },
];

let checked = 0;
function renderChecks() {
  const list = $('#checklist');
  CHECKS.forEach((c, i) => {
    c.icon = h('div', { class: 'icon' }, String(i + 1));
    c.res = h('div', { class: 'res' });
    c.btn = h('button', { class: 'btn ghost small', onclick: () => runCheck(c) }, 'Run');
    list.append(h('div', { class: 'check' }, c.icon, h('div', null, h('div', { class: 'req' }, c.req, h('small', null, c.note)), c.res), c.btn));
  });
}
async function runCheck(c) {
  if (c.running) return;
  c.running = true; c.btn.disabled = true;
  c.icon.className = 'icon run'; c.icon.replaceChildren(h('span', { class: 'spin' }));
  c.res.className = 'res show'; c.res.replaceChildren(h('div', { class: 'typical' }, 'Running…'));
  const r = await c.run((msg) => { c.res.firstChild.textContent = msg; });
  c.icon.className = r.ok ? 'icon ok' : 'icon'; c.icon.replaceChildren(r.ok ? '✓' : '!');
  c.res.replaceChildren(h('div', { class: 'mine' }, r.mine), h('div', { class: 'typical' }, r.usual));
  if (!c.done && r.ok) { c.done = true; checked++; }
  $('#score').textContent = `${checked} of 5 checked` + (checked === 5 ? ', all passing' : '');
  c.btn.textContent = 'Run again'; c.btn.disabled = false; c.running = false;
}
$('#runall').onclick = async () => {
  track('run-all'); $('#runall').disabled = true;
  for (const c of CHECKS) { await runCheck(c); await sleep(document.hidden ? 0 : 250); }
  $('#runall').disabled = false;
};

// =====================================================================================
// 2. The app
// =====================================================================================
const api = new BookingService({ safe: true, latency: netLatency });
(function seed() {
  const add = (roomId, day, h1, m1, h2, m2, title, who) => { const id = api.next++; api.rows.set(id, { id, roomId, title, startTime: at(day, h1, m1), endTime: at(day, h2, m2), createdBy: who }); };
  add(1, 1, 9, 0, 10, 0, 'Standup', 'Ana'); add(1, 1, 10, 0, 11, 0, 'Design review', 'Ben'); add(1, 1, 14, 0, 15, 30, 'Client call', 'Ana');
  add(2, 1, 11, 0, 12, 0, 'Hiring sync', 'Ben'); add(2, 1, 16, 0, 17, 0, 'Retro', 'Ana'); add(3, 1, 15, 0, 17, 0, 'All-hands', 'Ben');
  add(1, 0, 9, 0, 10, 0, 'Standup', 'Ana'); add(1, 0, 16, 0, 17, 0, 'One-to-one', 'Ben'); add(2, 0, 13, 0, 14, 0, 'Planning', 'Ana');
})();

const START_H = 8, END_H = 19, HOUR_PX = 52;
const state = { roomId: 1, day: 1, bookings: [], selected: null, justAdded: null, busy: false, loadToken: 0 };
const room = () => ROOMS.find((r) => r.id === state.roomId);

// time selects, 30-minute steps
for (const id of ['#f-start', '#f-end']) for (let m = START_H * 60; m <= END_H * 60; m += 30) {
  const v = String(m / 60 | 0).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  $(id).append(h('option', { value: v }, v));
}
$('#f-start').value = '11:00'; $('#f-end').value = '12:00';
const hm = (v) => v.split(':').map(Number);
const form = () => ({ roomId: state.roomId, title: $('#f-title').value.trim() || 'Meeting', startTime: at(state.day, ...hm($('#f-start').value)), endTime: at(state.day, ...hm($('#f-end').value)), createdBy: $('#f-who').value });

function renderRooms() {
  $('#rooms').replaceChildren(...ROOMS.map((r) => h('button', { class: 'room' + (r.id === state.roomId ? ' active' : ''), onclick: () => { state.roomId = r.id; state.selected = null; hideAlert(); renderRooms(); load(); } },
    h('span', { class: 'room-name' }, r.name), h('span', { class: 'room-cap' }, `${r.capacity} people`))));
}
document.querySelectorAll('#daySeg button').forEach((b) => (b.onclick = () => { state.day = +b.dataset.day; state.selected = null; hideAlert(); load(); }));

async function load() {
  const token = ++state.loadToken;
  $('#loading').classList.add('show');
  const list = await api.bookings(state.roomId, at(state.day, 0), at(state.day + 1, 0));
  if (token !== state.loadToken) return;
  state.bookings = list;
  $('#loading').classList.remove('show');
  renderDay(); validate();
}

const y = (ms) => ((ms - at(state.day, START_H)) / 36e5) * HOUR_PX;
function renderDay() {
  document.querySelectorAll('#daySeg button').forEach((b) => b.classList.toggle('on', +b.dataset.day === state.day));
  $('#dayTitle').textContent = `${room().name} · ${dayName(state.day)}`;
  $('#where').replaceChildren('Booking ', h('b', null, room().name), ` (${room().capacity} people) on ${dayName(state.day)}`);
  const tl = $('#timeline');
  tl.querySelectorAll('.hour,.block,.past,.preview').forEach((n) => n.remove());
  for (let hr = START_H; hr < END_H; hr++) tl.append(h('div', { class: 'hour' }, h('span', null, String(hr).padStart(2, '0') + ':00')));
  const now = Date.now();
  if (now > at(state.day, START_H)) tl.append(h('div', { class: 'past', style: `height:${Math.min(y(now), (END_H - START_H) * HOUR_PX)}px` }));
  for (const b of state.bookings) {
    const top = y(b.startTime), height = Math.max(y(b.endTime) - top - 3, 22);
    const el = h('div', { class: `block ${b.createdBy}${b.id === state.justAdded ? ' new' : ''}${b.id === state.selected ? ' sel' : ''}`, style: `top:${top + 1}px;height:${height}px` },
      h('div', { class: 't' }, b.title), h('div', { class: 'm' }, `${fmt(b.startTime)}–${fmt(b.endTime)} · ${b.createdBy}`),
      h('button', { class: 'btn ghost small cancel', onclick: (e) => { e.stopPropagation(); cancel(b); } }, 'Cancel'));
    el.onclick = (e) => { e.stopPropagation(); state.selected = state.selected === b.id ? null : b.id; renderDay(); };
    tl.append(el);
  }
  state.justAdded = null;
  renderPreview();
}
function renderPreview() {
  const tl = $('#timeline'); tl.querySelectorAll('.preview').forEach((n) => n.remove());
  const v = form(); if (!(v.endTime > v.startTime)) return;
  const bad = !!clientProblem(v);
  tl.append(h('div', { class: 'preview' + (bad ? ' bad' : ''), style: `top:${y(v.startTime) + 1}px;height:${y(v.endTime) - y(v.startTime) - 3}px` }, bad ? 'can’t book here' : 'your booking'));
}
$('#timeline').addEventListener('click', (e) => {
  const rect = $('#timeline').getBoundingClientRect();
  let mins = START_H * 60 + Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30;
  mins = Math.max(START_H * 60, Math.min(mins, END_H * 60 - 60));
  const v = (m) => String(m / 60 | 0).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  $('#f-start').value = v(mins); $('#f-end').value = v(mins + 60);
  state.selected = null; hideAlert(); renderDay(); validate();
});

// client-side validation, against what this screen knows
function clientProblem(v) {
  if (!(v.endTime > v.startTime)) return 'End time must be after the start time.';
  if (v.endTime - v.startTime > 4 * 36e5) return 'Bookings can be at most 4 hours.';
  if (v.startTime < Date.now()) return 'That time has already passed.';
  const c = state.bookings.find((b) => b.startTime < v.endTime && b.endTime > v.startTime);
  if (c) return `Overlaps “${c.title}”, ${fmt(c.startTime)}–${fmt(c.endTime)}.`;
  return '';
}
function validate() {
  const msg = clientProblem(form());
  $('#f-msg').textContent = msg; $('#f-msg').classList.toggle('show', !!msg);
  $('#f-book').disabled = !!msg || state.busy;
  $('#ghost').disabled = !!msg || state.busy;
  renderPreview();
  return !msg;
}
['#f-title', '#f-start', '#f-end', '#f-who'].forEach((id) => $(id).addEventListener('input', () => { hideAlert(); validate(); }));

function hideAlert() { $('#alert').className = 'alert'; }
function showAlert(kind, ...kids) { const a = $('#alert'); a.className = 'alert show ' + kind; a.replaceChildren(...kids); }

function nextFree(v) {
  const dur = v.endTime - v.startTime, taken = state.bookings;
  const free = (s) => s >= Date.now() && s + dur <= at(state.day, END_H) && !taken.some((b) => b.startTime < s + dur && b.endTime > s);
  for (let s = v.startTime; s + dur <= at(state.day, END_H); s += 30 * 6e4) if (free(s)) return s;
  for (let s = at(state.day, START_H); s < v.startTime; s += 30 * 6e4) if (free(s)) return s;
  return null;
}
function setForm(start, end) { $('#f-start').value = fmt(start); $('#f-end').value = fmt(end); }

async function book() {
  if (!validate()) return;
  const v = form();
  state.busy = true; hideAlert();
  $('#f-book').replaceChildren(h('span', { class: 'spin' }), '  Booking…'); validate();
  try {
    const row = await api.create(v);
    state.justAdded = row.id; state.ghosted = false;
    toast(`Booked ${room().name}, ${fmt(row.startTime)}–${fmt(row.endTime)}`);
    track('book');
    await load();
    showAlert('ok', `Confirmed: ${row.title}, ${fmt(row.startTime)}–${fmt(row.endTime)}.`);
  } catch (e) {
    if (e.status === 409) {
      await load(); // this screen was stale: refresh it first, then explain
      const c = e.conflict, s = nextFree(v);
      showAlert('bad',
        h('div', null, h('b', null, `${c.createdBy} booked this slot a moment ago`), ` (“${c.title}”, ${fmt(c.startTime)}–${fmt(c.endTime)}). Your day view has been refreshed.`),
        s ? h('button', { class: 'btn small', onclick: () => { setForm(s, s + (v.endTime - v.startTime)); hideAlert(); validate(); book(); } }, `Book ${fmt(s)}–${fmt(s + (v.endTime - v.startTime))} instead`) : 'No other free slot of that length today.',
        state.ghosted ? h('span', { class: 'note' }, 'This is the case from your post: a conflict that only appears after the form looked valid on the client.') : '');
      state.ghosted = false;
    } else showAlert('bad', e.message + '.');
  } finally {
    state.busy = false; $('#f-book').replaceChildren('Book room'); validate();
  }
}
$('#f-book').onclick = book;

async function cancel(b) {
  try { await api.remove(b.id); toast(`Cancelled “${b.title}”`); }
  catch (e) { if (e.status === 404) toast('Already cancelled by someone else. Refreshed.'); }
  state.selected = null; await load();
}

$('#ghost').onclick = async () => {
  const v = form();
  $('#ghost').disabled = true;
  try {
    await api.create({ ...v, title: 'Ben’s team sync', createdBy: 'Ben' }); // on Ben's laptop; this screen is not refreshed
    state.ghosted = true; track('ghost');
    toast('Ben just booked it on his laptop. Now press “Book room”.');
  } catch (e) { toast('Ben could not take it: ' + e.message); }
  validate();
};

// =====================================================================================
// 3. The race
// =====================================================================================
let raceMode = 'mine';
document.querySelectorAll('.tmr').forEach((n) => (n.textContent = weekday(1)));
document.querySelectorAll('#raceSeg button').forEach((b) => (b.onclick = () => {
  raceMode = b.dataset.mode;
  document.querySelectorAll('#raceSeg button').forEach((x) => x.classList.toggle('on', x === b));
  ['Ana', 'Ben'].forEach((w) => ($('#st-' + w).className = 'status', $('#st-' + w).textContent = ''));
  $('#strip').replaceChildren(); $('#caption').className = 'caption';
}));

$('#raceBtn').onclick = async () => {
  track('race-' + raceMode);
  const btn = $('#raceBtn'); btn.disabled = true;
  $('#strip').replaceChildren(); $('#caption').className = 'caption';
  const svc = new BookingService({ safe: raceMode === 'mine', latency: netLatency });
  const mk = (who) => ({ roomId: 2, title: `${who}'s meeting`, startTime: at(1, 14), endTime: at(1, 15), createdBy: who });
  for (const w of ['Ana', 'Ben']) { const s = $('#st-' + w); s.className = 'status wait'; s.replaceChildren(h('span', { class: 'spin' }), '  Booking…'); }
  const res = await Promise.allSettled([svc.create(mk('Ana')), svc.create(mk('Ben'))]);
  ['Ana', 'Ben'].forEach((w, i) => {
    const s = $('#st-' + w), r = res[i];
    if (r.status === 'fulfilled') { s.className = 'status ok'; s.replaceChildren('✓ Confirmed', h('small', null, 'Borealis, 14:00–15:00 is yours')); }
    else { s.className = 'status bad'; s.replaceChildren(`Just taken by ${r.reason.conflict.createdBy}`, h('small', null, '15:00–16:00 is free. Book that instead?')); }
  });
  // what the database now holds
  const rows = [...svc.rows.values()], clash = rows.length > 1;
  const pct = (ms) => ((ms - at(1, 13)) / (3 * 36e5)) * 100;
  rows.forEach((b, i) => $('#strip').append(h('div', { class: 'sb ' + (clash ? 'clash' : b.createdBy), style: `left:${pct(b.startTime)}%;width:${pct(b.endTime) - pct(b.startTime)}%;top:${clash ? 6 + i * 34 : 22}px` },
    clash ? `${b.createdBy}: double-booked` : `${b.createdBy}'s meeting`)));
  const cap = $('#caption');
  if (clash) { cap.className = 'caption show bad'; cap.textContent = `Both laptops say “Confirmed”. On ${weekday(1)} at 14:00, two teams walk into Borealis.`; }
  else if (raceMode === 'usual') { cap.className = 'caption show meh'; cap.textContent = 'This time the timing happened to work out. Press again: in the usual version it goes wrong more often than not.'; }
  else { cap.className = 'caption show ok'; cap.textContent = 'Exactly one wins, every time. The other person finds out straight away and is offered the next free slot.'; }
  btn.disabled = false; btn.textContent = 'Press Book again';
};

// =====================================================================================
// 4. For your developer: the test file, run here against both versions
// =====================================================================================
async function testRun(safe) {
  const lines = [], mk = () => new BookingService({ safe });
  let pass = 0, n = 0;
  const t = (ok, name, extra) => { n++; ok ? pass++ : 0; lines.push([`${ok ? 'ok' : 'not ok'} ${n} - ${name}`, ok ? 'ok' : 'fail']); if (extra) lines.push(['    ' + extra, 'dim']); };
  { const s = mk(); await s.create(slot(9, 10)); t(await outcome(s.create(slot(9, 10, 'Ben'))) === 409, 'a later booking over the same slot is rejected with 409'); }
  t(await outcome(mk().create(slot(11, 10))) === 400, 'end before start is rejected with 400');
  { const d = await doubleBookings(safe); t(d === 0, 'two near-simultaneous requests for the same room and slot: exactly one wins', `race: both accepted in ${d} of 100 runs`); }
  { const s = mk(); await s.create(slot(9, 10)); const o = await outcome(s.create(slot(10, 11, 'Ben'))); t(o === 'ok', 'back-to-back bookings are NOT a conflict', o === 'ok' ? '' : `10:00-11:00 after 09:00-10:00 got ${o}`); }
  { const s = mk(); const b = await s.create(slot(9, 10)); await s.remove(b.id); const o = await outcome(s.remove(b.id)); t(o === 404, 'deleting a booking twice gives a clean 404, not a crash', o === 404 ? '' : `second delete: ${o}`); }
  lines.push([`# pass ${pass} of ${n}`, pass === n ? 'ok' : 'fail']);
  return lines;
}
$('#dev').addEventListener('toggle', async () => {
  if (!$('#dev').open || $('#dev').ran) return;
  $('#dev').ran = true; track('dev');
  const out = $('#testout'); out.replaceChildren();
  for (const [label, safe] of [['usual first version', false], ['my version', true]]) {
    out.append(h('span', { class: 'cmd' }, `$ node --test booking.test.js   # ${label}\n`));
    for (const [text, cls] of await testRun(safe)) out.append(h('span', { class: cls }, text + '\n'));
    out.append('\n');
  }
});

// ---------- start ----------
renderChecks(); renderRooms(); load();
