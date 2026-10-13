"""A RAG chatbot over a set of predefined PDFs that answers only from them, cites the page, and says so when it can't.

    sources    questions are answered from the retrieved PDF page, with the file and page named
    not available   when nothing in the PDFs supports an answer, it says so instead of guessing

The writer is pluggable. `extractive_writer` (the default: no model, no key) quotes the best sentences. In
production Claude or OpenAI writes from the same passages and must cite the same ids; the grounding check below then
rejects any sentence the passages don't support. Retrieval here is BM25 over page-sized chunks; on the real build it is
embeddings in pgvector (PostgreSQL, next to the app's own tables) with the same threshold logic, behind a FastAPI
endpoint.

Standard library only, so it runs anywhere Python runs, including in a browser tab via Pyodide.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

import sources

MIN_SCORE = 2.0  # retrieval score below which the sources are treated as not covering the question
NOT_AVAILABLE = "That isn't in the documents, so I won't guess."

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
    route: str  # sources | not-available
    text: str
    cites: list[str] = field(default_factory=list)
    score: float | None = None
    grounded: bool | None = None

    def as_dict(self) -> dict:
        return {"route": self.route, "text": self.text, "cites": self.cites,
                "score": None if self.score is None else round(self.score, 2), "grounded": self.grounded}


# Carried over from an earlier build: "US" the country is not the stopword "us", and "how long" / "how much" questions
# need the words their answers use ("days", "costs") to reach the right sentence.
QUESTION_WORDS = {"how long": "days", "how much": "costs", "how many": "days"}


def tokens(text: str) -> list[str]:
    text = re.sub(r"\bUS\b", "usa", text)
    low = text.lower()
    text = text + "".join(" " + v for k, v in QUESTION_WORDS.items() if k in low)
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [w[:-1] if len(w) > 3 and w.endswith("s") else w for w in words if w not in STOPWORDS]


def sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]


# ---------------------------------------------------------------- one chunk per PDF page, cited as "file, p. N"

CORPUS = {f"{f}, p. {i}": page for f, pages in sources.PDFS.items() for i, page in enumerate(pages, 1)}


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

# ---------------------------------------------------------------- writing and checking the answer

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
    """Names and acronyms in the question (HIPAA, PayPal) must appear in the passage. A close-sounding page about
    something else is not an answer, however high it scores."""
    src = CORPUS[doc_id].lower()
    return [n for n in NAME_RE.findall(question) if n.lower() not in src]


def answer(question: str, settings: Settings | None = None, writer=extractive_writer) -> Answer:
    s = settings or Settings()
    q = (question or "").strip()
    if not q:
        return Answer("not-available", "Please type a question.")
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
