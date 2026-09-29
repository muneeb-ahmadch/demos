"""A small support assistant that decides, per question, what should answer it.

    code       exact questions (prices, dates) are computed in Python, never generated
    documents  policy questions are answered from retrieved help-centre text, with a citation
    declined   when retrieval finds nothing strong enough, it says so instead of guessing

The writer step is pluggable. `extractive_writer` (the default, no model, no key) quotes the best
sentences. In production an LLM writer takes the same passages and must cite the same ids; the
retrieval, the router, the refusal threshold and the injection filter stay exactly as they are here.

Pure standard library, so it runs anywhere Python runs (including in a browser via Pyodide).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

import kb

MAX_QUESTION_CHARS = 2000
MIN_SCORE = 1.6  # BM25 score below which retrieval is treated as "not in the documents"

STOPWORDS = set(
    "a an the is are was were be been do does did can could would should will i my me we our you your it its "
    "of to in on for at by with from and or not no if what when where which who how much many there this that "
    "any all get have has".split()
)
INSTRUCTION_PATTERNS = re.compile(
    r"ignore (all |any )?(previous|prior|above) instructions|disregard .{0,30}instructions|"
    r"you are now|system prompt|tell (every|all) (customer|user)s?",
    re.I,
)


@dataclass
class Settings:
    """Every safeguard behind a switch, so each one can be tested on and off."""
    router: bool = True
    refusal_threshold: bool = True
    injection_filter: bool = True
    input_validation: bool = True


@dataclass
class Answer:
    route: str  # code | documents | declined | rejected
    text: str
    sources: list[str] = field(default_factory=list)
    quarantined: list[str] = field(default_factory=list)
    score: float | None = None

    def as_dict(self) -> dict:
        return {"route": self.route, "text": self.text, "sources": self.sources,
                "quarantined": self.quarantined, "score": None if self.score is None else round(self.score, 2)}


# ---------------------------------------------------------------- retrieval (BM25, no dependencies)

def tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words if w not in STOPWORDS]


class Index:
    def __init__(self, docs: dict[str, str], k1: float = 1.4, b: float = 0.75):
        self.docs = docs
        self.toks = {d: tokens(t) for d, t in docs.items()}
        self.avg = sum(map(len, self.toks.values())) / len(docs)
        n = len(docs)
        df: dict[str, int] = {}
        for ts in self.toks.values():
            for w in set(ts):
                df[w] = df.get(w, 0) + 1
        self.idf = {w: math.log(1 + (n - c + 0.5) / (c + 0.5)) for w, c in df.items()}
        self.k1, self.b = k1, b

    def search(self, query: str, k: int = 2) -> list[tuple[str, float]]:
        q = tokens(query)
        scored = []
        for d, ts in self.toks.items():
            s = 0.0
            for w in q:
                tf = ts.count(w)
                if tf:
                    s += self.idf[w] * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * len(ts) / self.avg))
            scored.append((d, s))
        return sorted(scored, key=lambda x: -x[1])[:k]


INDEX = Index(kb.DOCS)

# ---------------------------------------------------------------- the code route

PLAN_RE = re.compile(r"\b(starter|pro|business)\b", re.I)
SEATS_RE = re.compile(r"\b(\d{1,4})\s*(?:seats?|users?|people|members?)\b", re.I)
DATE_RE = re.compile(r"\b(\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})\b")


def parse_date(s: str) -> date | None:
    s = s.replace(",", "")
    for fmt in ("%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def price_answer(q: str) -> Answer | None:
    plan, seats = PLAN_RE.search(q), SEATS_RE.search(q)
    if not (plan and seats and re.search(r"\b(cost|price|how much|pay|total)\b", q, re.I)):
        return None
    name, n = plan.group(1).lower(), int(seats.group(1))
    p = kb.PLANS[name]
    if p["max_seats"] is not None and n > p["max_seats"]:
        return Answer("code", f"{name.title()} allows at most {p['max_seats']} seats, so {n} seats need Pro or Business.", ["price-table"])
    annual = bool(re.search(r"\b(annual|annually|yearly|per year|a year)\b", q, re.I))
    months = kb.ANNUAL_MONTHS_CHARGED if annual else 1
    total = p["seat_month"] * n * months
    period = "per year (billed annually, two months free)" if annual else "per month"
    return Answer("code", f"{name.title()} for {n} seats is ${total:,} {period}: ${p['seat_month']} x {n} seats x {months} months.", ["price-table"])


def trial_answer(q: str) -> Answer | None:
    if not re.search(r"\btrial\b", q, re.I) or not re.search(r"\b(end|ends|expire|expires|last day|until)\b", q, re.I):
        return None
    m = DATE_RE.search(q)
    start = parse_date(m.group(1)) if m else None
    if not start:
        return None
    end = start + timedelta(days=kb.TRIAL_DAYS)
    return Answer("code", f"A trial started on {start.day} {start:%B %Y} ends on {end.day} {end:%B %Y} ({kb.TRIAL_DAYS} days). "
                          "After that the workspace moves to the free Starter plan unless a paid plan is chosen.", ["price-table", "trial"])


CODE_ROUTES = (price_answer, trial_answer)

# ---------------------------------------------------------------- the documents route


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


def extractive_writer(question: str, passages: list[tuple[str, str]]) -> str:
    """No-model writer: the one or two sentences that best match the question, from the top passage."""
    q = set(tokens(question))
    doc_id, text = passages[0]
    ranked = sorted(sentences(text), key=lambda s: -len(q & set(tokens(s))))
    best = [s for s in ranked[:2] if q & set(tokens(s))] or ranked[:1]
    order = sentences(text)
    return " ".join(sorted(best, key=order.index)) + f" [{doc_id}]"


def answer(question: str, settings: Settings | None = None, writer=extractive_writer) -> Answer:
    s = settings or Settings()
    q = (question or "").strip()

    if s.input_validation:
        if not q:
            return Answer("rejected", "Please type a question.")
        if len(q) > MAX_QUESTION_CHARS:
            return Answer("rejected", f"That message is {len(q):,} characters; the limit is {MAX_QUESTION_CHARS:,}. Please shorten it.")

    if s.router:
        for route in CODE_ROUTES:
            a = route(q)
            if a:
                return a

    hits = INDEX.search(q, k=2)
    top_id, top_score = hits[0]
    if s.refusal_threshold and top_score < MIN_SCORE:
        return Answer("declined", "That isn't covered in the help centre, so I won't guess. I've flagged it for a person to answer.", score=top_score)

    passages, quarantined = [], []
    for doc_id, score in hits:
        if s.refusal_threshold and score < MIN_SCORE:
            continue
        text = kb.DOCS[doc_id]
        if s.injection_filter:
            kept = [x for x in sentences(text) if not INSTRUCTION_PATTERNS.search(x)]
            if len(kept) < len(sentences(text)):
                quarantined.append(doc_id)
            text = " ".join(kept)
        if text:
            passages.append((doc_id, text))

    if not passages or (s.refusal_threshold and not set(tokens(q)) & set(tokens(passages[0][1]))):
        return Answer("declined", "That isn't covered in the help centre, so I won't guess. I've flagged it for a person to answer.",
                      quarantined=quarantined, score=top_score)
    return Answer("documents", writer(q, passages), sources=[d for d, _ in passages[:1]], quarantined=quarantined, score=top_score)
