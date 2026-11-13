"""A RAG chatbot that answers only from the business's own sources, and says so when it can't.

    sources    questions are answered from the retrieved PDF, document or web page, with the source named
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
NOT_AVAILABLE = "I'm not sure, and I don't want to guess. I've passed your question to our team with this chat attached."
HANDOFF = "I'm handing you to a person on our team now, with this whole conversation attached so you don't have to repeat anything."

STOPWORDS = set(
    "a an the is are was were be been do does did can could would should will i my me we our you your it its "
    "of to in on for at by with from and or not no if what when where which who how much many there this that "
    "any all get have has us".split()
)


@dataclass
class Settings:
    guard: bool = True  # the "not available" guard: score threshold, name check, grounding check


@dataclass
class Answer:
    route: str  # sources | not-sure | handoff
    text: str
    cites: list[str] = field(default_factory=list)
    score: float | None = None
    grounded: bool | None = None

    def as_dict(self) -> dict:
        return {"route": self.route, "text": self.text, "cites": self.cites,
                "score": None if self.score is None else round(self.score, 2), "grounded": self.grounded}


# Fixes found by the 12-question test (run 1, before these: 8 of 12 with the guard on):
#   1. "cost" never met the pricing page, which says "starts at"; the page's own name (/pricing) was not indexed,
#      so the price question landed on the maintenance plan. Now page names are indexed and cost/price/pricing match.
#   2. "how long" never met "4 to 6 weeks", so the right page scored under the threshold and the bot said
#      "not available" to a question it could answer.
#   3. "cancel" never met "cancelled" (no stemming beyond a trailing s).
#   6. (this bid's run 1) "When will I get my refund?" had one content word, scored under the threshold and got
#      "I'm not sure" although the returns FAQ answers it; "when will" now asks for "within ... days".
#   5. on the right page, the writer quoted the first plan sentence instead of the cancellation line.
#   4. "iPhone" slipped past the name check, so "mobile-friendly" on /services was used to say yes to mobile apps.
QUESTION_WORDS = {"how long": "takes weeks days", "how much": "price", "when will": "within days"}
SYNONYMS = {"cost": "price", "pricing": "price", "priced": "price", "move": "migrate"}


def stem(w: str) -> str:
    if len(w) > 3 and w.endswith("s"):
        w = w[:-1]
    if len(w) > 5 and w.endswith("ed"):
        w = w[:-2]
        if w[-1] == w[-2]:
            w = w[:-1]
    return SYNONYMS.get(w, w)


def tokens(text: str) -> list[str]:
    low = text.lower()
    text = text + "".join(" " + v for k, v in QUESTION_WORDS.items() if k in low)
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [stem(w) for w in words if w not in STOPWORDS]


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


# ---------------------------------------------------------------- one index over PDFs + documents + website pages

CORPUS = {**sources.PDFS, **sources.DOCUMENTS, **sources.WEBSITE}


class Index:
    def __init__(self, docs: dict[str, str], k1: float = 1.4, b: float = 0.75):
        self.toks = {d: tokens(d.replace("/", " ").replace(".md", "") + " " + t) for d, t in docs.items()}  # page name indexed too (fix 1)
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

# ---------------------------------------------------------------- documents and website

def extractive_writer(question: str, doc_id: str) -> str:
    q = set(tokens(question))
    order = sentences(CORPUS[doc_id])
    # fix 5: a question word that appears in fewer sentences of the page counts more ("cancel" beats "plan"),
    # so "Can I cancel my plan?" gets the cancellation line, not the first plan sentence
    sets = [set(tokens(x)) for x in order]
    weight = {w: 1 / sum(w in st for st in sets) for w in q if any(w in st for st in sets)}
    ranked = sorted(order, key=lambda x: -sum(weight.get(w, 0) for w in q & set(tokens(x))))
    best = [x for x in ranked[:2] if q & set(tokens(x))] or ranked[:1]
    return " ".join(sorted(best, key=order.index))


def grounded(text: str, doc_id: str) -> bool:
    """Every sentence of the answer must appear in the cited source. An LLM writer's output goes through this too."""
    src = CORPUS[doc_id]
    return all(x in src for x in sentences(text))


NAME_RE = re.compile(r"\b(?:[A-Z]{2,}|[A-Z][a-z]+[A-Z][A-Za-z]*|[a-z]+[A-Z][A-Za-z]*)\b|(?<=[a-z,] )[A-Z][a-z]+\b")  # iPhone too (fix 4)


def missing_names(question: str, doc_id: str) -> list[str]:
    """Names and acronyms in the question (Shopify, iPhone, SEO) must appear in the passage. A close-sounding page about
    something else is not an answer, however high it scores."""
    src = CORPUS[doc_id].lower()
    return [n for n in NAME_RE.findall(question) if n.lower() not in src]


HUMAN_RE = re.compile(r"\b(real person|human|agent|someone|manager|talk to|speak to|call me)\b", re.I)
FRUSTRATED_RE = re.compile(r"(!!|\b(ridiculous|useless|terrible|worst|angry|again|still not|unacceptable)\b)", re.I)


def wants_human(q: str) -> bool:
    """Escalation rule from the post: the customer asks for a person, or sounds frustrated."""
    return bool(HUMAN_RE.search(q) or FRUSTRATED_RE.search(q))


def answer(question: str, settings: Settings | None = None, writer=extractive_writer) -> Answer:
    s = settings or Settings()
    q = (question or "").strip()
    if not q:
        return Answer("not-sure", "Please type a question.")
    doc_id, score = INDEX.search(q, k=1)[0]
    q_terms = set(tokens(q))
    if s.guard and wants_human(q):
        return Answer("handoff", HANDOFF, score=score)
    if s.guard and score < MIN_SCORE:
        return Answer("not-sure", NOT_AVAILABLE, score=score)
    if s.guard and missing_names(q, doc_id):
        return Answer("not-sure", NOT_AVAILABLE, score=score)
    text = writer(q, doc_id)
    ok = grounded(text, doc_id)
    if s.guard and not ok:
        return Answer("not-sure", NOT_AVAILABLE, score=score, grounded=False)
    return Answer("sources", text, cites=[doc_id], score=score, grounded=ok)
