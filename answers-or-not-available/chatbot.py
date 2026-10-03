"""A RAG chatbot that answers only from the business's own sources, and says so when it can't.

    records    an account or invoice number is looked up in the database, exactly; never generated
    sources    other questions are answered from the retrieved document or web page, with the source named
    not available   when nothing in the sources supports an answer, it says so instead of guessing

The writer is pluggable. `extractive_writer` (the default: no model, no key) quotes the best sentences. In
production Claude or OpenAI writes from the same passages and must cite the same ids; the grounding check below then
rejects any sentence the passages don't support. Retrieval here is BM25 over a few pages; on the real build it is
embeddings in pgvector (or Pinecone/Qdrant) with the same threshold logic.

Standard library only, so it runs anywhere Python runs, including in a browser tab via Pyodide.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

import sources

MIN_SCORE = 2.0  # retrieval score below which the sources are treated as not covering the question
NOT_AVAILABLE = "That information isn't in our documents, website or records, so I won't guess. I've logged the question for the team."

STOPWORDS = set(
    "a an the is are was were be been do does did can could would should will i my me we our you your it its "
    "of to in on for at by with from and or not no if what when where which who how much many there this that "
    "any all get have has us".split()
)


@dataclass
class Settings:
    guard: bool = True  # the "not available" guard: score threshold, exact-record lookups, grounding check


@dataclass
class Answer:
    route: str  # record | sources | not-available
    text: str
    cites: list[str] = field(default_factory=list)
    score: float | None = None
    grounded: bool | None = None

    def as_dict(self) -> dict:
        return {"route": self.route, "text": self.text, "cites": self.cites,
                "score": None if self.score is None else round(self.score, 2), "grounded": self.grounded}


def tokens(text: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words if w not in STOPWORDS]


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


# ---------------------------------------------------------------- one index over documents + website pages

CORPUS = {**sources.DOCUMENTS, **sources.WEBSITE}


class Index:
    def __init__(self, docs: dict[str, str], k1: float = 1.4, b: float = 0.75):
        self.toks = {d: tokens(t) for d, t in docs.items()}
        self.avg = sum(map(len, self.toks.values())) / len(docs)
        n, df = len(docs), {}
        for ts in self.toks.values():
            for w in set(ts):
                df[w] = df.get(w, 0) + 1
        self.idf = {w: math.log(1 + (n - c + 0.5) / (c + 0.5)) for w, c in df.items()}
        self.k1, self.b = k1, b

    def search(self, query: str, k: int = 2) -> list[tuple[str, float]]:
        q, out = tokens(query), []
        for d, ts in self.toks.items():
            s = 0.0
            for w in q:
                tf = ts.count(w)
                if tf:
                    s += self.idf[w] * tf * (self.k1 + 1) / (tf + self.k1 * (1 - self.b + self.b * len(ts) / self.avg))
            out.append((d, s))
        return sorted(out, key=lambda x: -x[1])[:k]


INDEX = Index(CORPUS)

# ---------------------------------------------------------------- database records

ID_RE = re.compile(r"\b(ACC|INV)-?(\d{3,6})\b", re.I)


def _closest(table: dict, key: str) -> str:
    """What an unguarded first version does: a LIKE/fuzzy match that always returns *some* row."""
    digits = key.split("-")[1]
    return max(table, key=lambda k: sum(a == b for a, b in zip(k.split("-")[1], digits)))


def record_answer(q: str, s: Settings) -> Answer | None:
    m = ID_RE.search(q)
    if not m:
        return None
    kind, key = m.group(1).upper(), f"{m.group(1).upper()}-{m.group(2)}"
    table = sources.ACCOUNTS if kind == "ACC" else sources.INVOICES
    if key not in table:
        if s.guard:
            return Answer("not-available", f"There is no record {key} in the database, so I can't tell you anything about it. Please check the number.")
        key = _closest(table, key)  # unguarded: answers about a different customer's row
    row = table[key]
    if kind == "ACC":
        text = f"Account {key} is on the {row['plan']} plan with {row['staff_seats']} staff seats, status {row['status']}, renewing on {row['renews']}."
    else:
        text = f"Invoice {key} for ${row['amount_usd']} was issued on {row['issued']} and is {row['status']}."
    return Answer("record", text, cites=[f"db:{'accounts' if kind == 'ACC' else 'invoices'}/{key}"], grounded=True)


# ---------------------------------------------------------------- documents and website

def extractive_writer(question: str, doc_id: str) -> str:
    q = set(tokens(question))
    order = sentences(CORPUS[doc_id])
    ranked = sorted(order, key=lambda x: -len(q & set(tokens(x))))
    best = [x for x in ranked[:2] if q & set(tokens(x))] or ranked[:1]
    return " ".join(sorted(best, key=order.index))


def grounded(text: str, doc_id: str) -> bool:
    """Every sentence of the answer must appear in the cited source. An LLM writer's output goes through this too."""
    src = CORPUS[doc_id]
    return all(x in src for x in sentences(text))


NAME_RE = re.compile(r"\b(?:[A-Z]{2,}|[A-Z][a-z]+[A-Z][A-Za-z]*)\b|(?<=[a-z,] )[A-Z][a-z]+\b")


def missing_names(question: str, doc_id: str) -> list[str]:
    """Names and acronyms in the question (HIPAA, PayPal, Outlook) must appear in the passage. A close-sounding
    page about something else (a GDPR agreement for a HIPAA question) is not an answer, however high it scores."""
    src = CORPUS[doc_id].lower()
    return [n for n in NAME_RE.findall(question) if n.lower() not in src]


def answer(question: str, settings: Settings | None = None, writer=extractive_writer) -> Answer:
    s = settings or Settings()
    q = (question or "").strip()
    if not q:
        return Answer("not-available", "Please type a question.")
    rec = record_answer(q, s)
    if rec:
        return rec
    doc_id, score = INDEX.search(q, k=1)[0]
    q_terms = set(tokens(q))
    if s.guard and score < MIN_SCORE:
        return Answer("not-available", NOT_AVAILABLE, score=score)
    if s.guard and missing_names(q, doc_id):
        return Answer("not-available", NOT_AVAILABLE, score=score)
    text = writer(q, doc_id)
    ok = grounded(text, doc_id)
    if s.guard and not ok:
        return Answer("not-available", NOT_AVAILABLE, score=score, grounded=False)
    return Answer("sources", text, cites=[doc_id], score=score, grounded=ok)
