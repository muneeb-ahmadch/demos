"""Twelve customer messages: seven the knowledge base answers, three it doesn't, two that must go to a human.

This is the accuracy test: the same list runs before and after every change, and the count is the score.

    python questions.py
"""
from chatbot import Settings, answer

# (message, expected route, must contain, kind)
CASES = [
    ("How do I reset my smart plug?", "sources", "10 seconds", "product doc"),
    ("Does it work with Alexa?", "sources", "Alexa", "product doc"),
    ("How long does delivery take?", "sources", "3 to 5 business days", "FAQ"),
    ("Can I return it if I don't like it?", "sources", "30 days", "FAQ"),
    ("When will I get my refund?", "sources", "5 business days", "FAQ"),
    ("My plug won't connect to my 5 GHz wifi", "sources", "2.4 GHz", "help article"),
    ("How do I claim the warranty?", "sources", "order number", "help article"),
    ("Does the plug work with Apple HomeKit?", "not-sure", None, "not in knowledge base"),
    ("Do you ship to Canada?", "not-sure", None, "not in knowledge base"),
    ("Is there a discount code for first orders?", "not-sure", None, "not in knowledge base"),
    ("Can I talk to a real person please?", "handoff", None, "asks for a human"),
    ("This is ridiculous, my plug stopped working again!!", "handoff", None, "frustrated"),
]

GUARD_OFF = Settings(guard=False)


def passes(a, route, must) -> bool:
    return a.route == route and (must is None or must in a.text)


def run(settings=None):
    return [(q, kind, a, passes(a, route, must)) for q, route, must, kind in CASES
            for a in [answer(q, settings)]]


if __name__ == "__main__":
    on, off = run(), run(GUARD_OFF)
    print(f"{'#':>2}  {'customer message':<52} {'kind':<22} {'guard on':<19} guard off")
    for i, ((q, kind, a, ok), (_, _, b, ok2)) in enumerate(zip(on, off), 1):
        print(f"{i:>2}  {q[:52]:<52} {kind:<22} {('PASS ' if ok else 'FAIL ') + a.route:<19} {('PASS ' if ok2 else 'FAIL ') + b.route}")
    print(f"\nguard on: {sum(r[3] for r in on)}/{len(on)} pass · guard off: {sum(r[3] for r in off)}/{len(off)} pass")
    na = [r for r in on if r[1] == "not in knowledge base"]
    hu = [r for r in on if r[1] in ("asks for a human", "frustrated")]
    print(f"not in the knowledge base: 'I'm not sure' + handoff on {sum(r[3] for r in na)} of {len(na)} · human/frustrated: handed off {sum(r[3] for r in hu)} of {len(hu)}")
    cited = [r for r in on if r[2].route == 'sources']
    print(f"answers with a named source: {sum(bool(r[2].cites) for r in cited)} of {len(cited)} · grounding check passed: {sum(bool(r[2].grounded) for r in cited)} of {len(cited)}")
