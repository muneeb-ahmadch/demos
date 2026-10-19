"""Twelve customer questions: seven the sources answer, five they don't. Run with the guard on, then off.

This is the accuracy test: the same list runs before and after every change, and the count is the score.

    python questions.py
"""
from chatbot import Settings, answer

# (question, expected route, must contain, kind)
CASES = [
    ("Can I return an opened serum?", "sources", "store credit", "PDF"),
    ("How many days do I have to return an unopened product?", "sources", "30 days", "PDF"),
    ("Does the Vitamin C Serum contain fragrance?", "sources", "fragrance-free", "PDF"),
    ("Can I change the address on my order?", "sources", "2 hours", "document"),
    ("What is the minimum wholesale order?", "sources", "24 units", "document"),
    ("How long does shipping take in the US?", "sources", "3 to 5 business days", "website"),
    ("Do you ship to Canada?", "sources", "Canada", "website"),
    ("Do you offer a student discount?", "not-available", None, "not in sources"),
    ("Is the serum approved by the FDA?", "not-available", None, "not in sources"),
    ("Can I pay with Klarna?", "not-available", None, "not in sources"),
    ("Do you have a shop I can visit in person?", "not-available", None, "not in sources"),
    ("Do you sell gift cards?", "not-available", None, "not in sources"),
]

GUARD_OFF = Settings(guard=False)


def passes(a, route, must) -> bool:
    return a.route == route and (must is None or must in a.text)


def run(settings=None):
    return [(q, kind, a, passes(a, route, must)) for q, route, must, kind in CASES
            for a in [answer(q, settings)]]


if __name__ == "__main__":
    on, off = run(), run(GUARD_OFF)
    print(f"{'#':>2}  {'question':<54} {'source kind':<15} {'guard on':<22} guard off")
    for i, ((q, kind, a, ok), (_, _, b, ok2)) in enumerate(zip(on, off), 1):
        print(f"{i:>2}  {q[:54]:<54} {kind:<15} {('PASS ' if ok else 'FAIL ') + a.route:<22} {('PASS ' if ok2 else 'FAIL ') + b.route}")
    na = [r for r in on if r[1] == "not in sources"]
    na_off = [r for r in off if r[1] == "not in sources"]
    print(f"\nguard on: {sum(r[3] for r in on)}/{len(on)} pass · guard off: {sum(r[3] for r in off)}/{len(off)} pass")
    print(f"not in the sources: guard on said 'not available' on {sum(r[3] for r in na)} of {len(na)}; "
          f"guard off answered {sum(r[2].route != 'not-available' for r in na_off)} of {len(na_off)} anyway")
    cited = [r for r in on if r[2].route == 'sources']
    print(f"answers with a named source: {sum(bool(r[2].cites) for r in cited)} of {len(cited)} · grounding check passed: {sum(bool(r[2].grounded) for r in cited)} of {len(cited)}")
