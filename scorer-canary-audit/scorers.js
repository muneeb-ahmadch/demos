// Two scorers for a fact-memory system's answers, and the canary set they are tested on.
// Sample records only (invented company, invented facts). Runs in the browser and in node.
const RECORDS = {
  rent: { label: 'Office rent', history: [['2024-01-01', '$4,500/month'], ['2025-03-01', '$5,200/month']] },
  manager: { label: 'Account manager', history: [['2023-02-01', 'Lee Park'], ['2025-06-01', 'Dana Okafor']] },
  terms: { label: 'Payment terms', history: [['2023-09-01', 'Net 30']] },
};
const NO_MATCH = 'NO_MATCH';

// kind: 'wrong' = the scorer must FAIL it; 'right' = the scorer must PASS it.
const CANARIES = [
  { group: 'deliberately wrong answers', q: 'What is the rent now?', fact: 'rent', type: 'money', key: '$5,200', a: '$4,500 per month', kind: 'wrong', why: 'superseded value given as current' },
  { group: 'deliberately wrong answers', q: 'What is the rent now?', fact: 'rent', type: 'money', key: '$5,200', a: 'Either $4,500 or $5,200 a month, depending on the lease.', kind: 'wrong', why: 'hedges between the old and the new value' },
  { group: 'near-misses', q: 'What is the rent now?', fact: 'rent', type: 'money', key: '$5,200', a: '$15,200 per month', kind: 'wrong', why: 'a different number that contains the right digits' },
  { group: 'near-misses', q: 'Who is the account manager now?', fact: 'manager', type: 'text', key: 'Dana Okafor', a: 'Lee Park, who took over from Dana Okafor.', kind: 'wrong', why: 'names the right person inside a wrong answer' },
  { group: '"no match" when the records do not contain the answer', q: 'Who is the insurance provider?', fact: null, type: 'none', key: NO_MATCH, a: 'No match found in the records, but it is most likely Allianz.', kind: 'wrong', why: 'says no match, then guesses anyway' },
  { group: '"no match" when the records do not contain the answer', q: 'What are the payment terms?', fact: 'terms', type: 'text', key: 'Net 30', a: 'Net 30 is not in the records, so: no match.', kind: 'wrong', why: 'refuses a question the records do answer' },
  { group: 'answer keys', q: 'When did the rent change?', fact: 'rent', type: 'date', key: '', a: 'Last Tuesday.', kind: 'wrong', why: 'a blank cell in the answer key' },
  { group: 'value as of a past date', q: 'What was the rent on 2024-06-30?', fact: 'rent', type: 'money', key: '$4,500', a: '$4,500.00 per month', kind: 'right', why: 'right value, extra decimals' },
  { group: 'formatting and Unicode tricks', q: 'What is the rent now?', fact: 'rent', type: 'money', key: '$5,200', a: '\uFF04\uFF15\uFF0C\uFF12\uFF10\uFF10 per month', kind: 'right', why: 'right value in full-width characters' },
  { group: 'formatting and Unicode tricks', q: 'When did Dana Okafor take over?', fact: 'manager', type: 'date', key: '2025-06-01', a: '1 June 2025', kind: 'right', why: 'right date, written out' },
  { group: '"no match" when the records do not contain the answer', q: 'Who is the insurance provider?', fact: null, type: 'none', key: NO_MATCH, a: 'No match: the records do not mention an insurance provider.', kind: 'right', why: 'a clean no match' },
];

// The usual first scorer: lowercase, strip punctuation, substring match.
function usualScore(c) {
  const n = (s) => String(s).toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  const key = c.key === NO_MATCH ? 'no match' : c.key;
  return n(c.a).includes(n(key));
}

// A stricter scorer: typed values, exactly one value, no superseded value, no hedge, no guessed no-match.
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
function norm(s) { return String(s).normalize('NFKC').replace(/[​-‍﻿]/g, '').trim(); }
function money(s) { return [...norm(s).matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?usd/gi)].map((m) => parseFloat((m[1] || m[2]).replace(/,/g, ''))); }
function dates(s) {
  const t = norm(s), out = [];
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of t.matchAll(/\b(\d{1,2}) (january|february|march|april|may|june|july|august|september|october|november|december) (\d{4})\b/gi))
    out.push(`${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}`);
  return out;
}
const SAYS_NO_MATCH = /\bno match\b|not in the records|records do not/i;
const HEDGE = /\b(either|but|likely|probably|might|maybe|perhaps|depending)\b/i;
function strictScore(c) {
  if (!String(c.key).trim()) return { pass: false, reason: 'answer key is blank: flagged, not scored' };
  const a = norm(c.a);
  if (c.key === NO_MATCH) {
    if (!SAYS_NO_MATCH.test(a)) return { pass: false, reason: 'should have said no match' };
    if (HEDGE.test(a) || money(a).length || dates(a).length) return { pass: false, reason: 'says no match, then offers a value' };
    return { pass: true, reason: 'clean no match' };
  }
  if (SAYS_NO_MATCH.test(a)) return { pass: false, reason: 'said no match on an answerable question' };
  if (HEDGE.test(a)) return { pass: false, reason: 'hedged answer' };
  if (c.type === 'money') {
    const v = [...new Set(money(a))], k = money(c.key)[0];
    if (v.length !== 1) return { pass: false, reason: `expected one amount, found ${v.length}` };
    return v[0] === k ? { pass: true, reason: 'amount matches' } : { pass: false, reason: `amount ${v[0]} is not ${k}` };
  }
  if (c.type === 'date') {
    const v = [...new Set(dates(a))];
    if (v.length !== 1) return { pass: false, reason: `expected one date, found ${v.length}` };
    return v[0] === c.key ? { pass: true, reason: 'date matches' } : { pass: false, reason: `date ${v[0]} is not ${c.key}` };
  }
  const low = a.toLowerCase();
  if (!low.includes(norm(c.key).toLowerCase())) return { pass: false, reason: 'value not found' };
  const old = (RECORDS[c.fact]?.history || []).map((h) => h[1]).filter((v) => v !== c.key);
  const hit = old.find((v) => low.includes(v.toLowerCase()));
  return hit ? { pass: false, reason: `also names the superseded value "${hit}"` } : { pass: true, reason: 'value matches, nothing superseded' };
}
function verdict(c, pass) { return (c.kind === 'right') === pass; } // true = the scorer got it right
if (typeof module !== 'undefined') module.exports = { RECORDS, CANARIES, NO_MATCH, usualScore, strictScore, verdict };
