// Browser port of booking-race-repro (bid 2026-09-29--882254). Same stand-in service, same five tests.
// "naive" is the check-then-insert service exactly as in naive-booking-service.js.
// "fixed" is one way to fix it on the stand-in: a per-room lock around check+insert, half-open ranges, 404 on a missing row.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(Math.random() * 4);

class HttpError extends Error { constructor(status, m) { super(m); this.status = status; } }

class Db {
  constructor(halfOpen) { this.bookings = new Map(); this.nextId = 1; this.halfOpen = halfOpen; }
  async findForRoom(roomId, from, to) {
    await jitter();
    return [...this.bookings.values()].filter((b) => b.roomId === roomId &&
      (this.halfOpen ? b.startTime < to && b.endTime > from : b.startTime <= to && b.endTime >= from));
  }
  async insert(b) { await jitter(); const id = this.nextId++; this.bookings.set(id, { id, ...b }); return id; }
  async remove(id) { await jitter(); const b = this.bookings.get(id); this.bookings.delete(id); return b; }
}

class BookingService {
  constructor(fixed) { this.fixed = fixed; this.db = new Db(fixed); this.locks = new Map(); }
  async withRoomLock(roomId, fn) {
    if (!this.fixed) return fn();
    const prev = this.locks.get(roomId) || Promise.resolve();
    let release; const next = new Promise((r) => (release = r));
    this.locks.set(roomId, prev.then(() => next));
    await prev;
    try { return await fn(); } finally { release(); }
  }
  async create({ roomId, title, startTime, endTime, createdBy }) {
    const start = new Date(startTime).getTime(), end = new Date(endTime).getTime();
    if (!(end > start)) throw new HttpError(400, 'endTime must be after startTime');
    if (end - start > 4 * 3600e3) throw new HttpError(400, 'max 4 hours');
    return this.withRoomLock(roomId, async () => {
      const clashes = await this.db.findForRoom(roomId, start, end);
      if (clashes.length) throw new HttpError(409, 'room already booked');
      return this.db.insert({ roomId, title, startTime: start, endTime: end, createdBy });
    });
  }
  async remove(id) {
    const b = await this.db.remove(id);
    if (this.fixed && !b) throw new HttpError(404, 'booking not found');
    return { deleted: b.id };
  }
}

const at = (h) => new Date(Date.UTC(2030, 0, 15, h)).toISOString();
const slot = (h1, h2, who = 'ana') => ({ roomId: 1, title: 'Standup', startTime: at(h1), endTime: at(h2), createdBy: who });
const status = async (p) => { try { await p; return 'ok'; } catch (e) { return e.status || 'crash: ' + e.constructor.name; } };

async function runDemo(log, variant) {
  const fixed = variant === 'fixed';
  const svc = () => new BookingService(fixed);
  log(`$ node --test booking.test.js   (${fixed ? 'with the fix' : 'as usually written: check, then insert'})`, 'cmd');
  let pass = 0, fail = 0, races = 0;
  const report = (ok, name, extra) => { ok ? pass++ : fail++; log(`${ok ? 'ok' : 'not ok'} ${pass + fail} - ${name}`, ok ? 'ok' : 'fail'); if (extra) log('    ' + extra, 'dim'); };

  { const s = svc(); await s.create(slot(9, 10));
    report(await status(s.create(slot(9, 10, 'ben'))) === 409, 'a second booking over the same slot, sent later, is rejected with 409'); }

  report(await status(svc().create(slot(11, 10))) === 400, 'end before start is rejected with 400');

  log('  racing: two people book room 1, 09:00-10:00, at the same moment, 100 times...', 'dim');
  const line = document.createElement('span'); line.className = 'fail'; document.getElementById('out').appendChild(line);
  for (let i = 1; i <= 100; i++) {
    const s = svc();
    const r = await Promise.allSettled([s.create(slot(9, 10, 'ana')), s.create(slot(9, 10, 'ben'))]);
    if (r.filter((x) => x.status === 'fulfilled').length === 2) races++;
    line.className = races ? 'fail' : 'ok';
    line.textContent = `  double-booked: ${races} of ${i} runs\n`;
  }
  report(races === 0, 'two near-simultaneous requests for the same room and slot: exactly one wins');

  { const s = svc(); await s.create(slot(9, 10));
    const st = await status(s.create(slot(10, 11, 'ben')));
    report(st === 'ok', 'back-to-back bookings (end of one = start of the next) are NOT a conflict', st === 'ok' ? '' : `10:00-11:00 after 09:00-10:00 got ${st}`); }

  { const s = svc(); const id = await s.create(slot(9, 10)); await s.remove(id);
    const st = await status(s.remove(id));
    report(st === 404, 'deleting a booking twice gives a clean 404, not a crash', st === 404 ? '' : `second delete: ${st}`); }

  log(`# tests ${pass + fail}`); log(`# pass ${pass}`, 'ok'); log(`# fail ${fail}`, fail ? 'fail' : 'dim');
  return fixed
    ? { headline: `With the fix: ${pass} of 5 pass, double-booked in ${races} of 100 races.`, verdict: fail ? 'fail' : 'ok' }
    : { headline: `As usually written: the same room was double-booked in ${races} of 100 races, and ${fail} of 5 edge cases fail.`, verdict: 'fail' };
}
