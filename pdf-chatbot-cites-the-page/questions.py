"""Twelve user questions: seven the PDFs answer, five they don't. Run with the guard on, then off.

This is the accuracy test: the same list runs before and after every change, and the count is the score.

    python questions.py
"""
from chatbot import Settings, answer

# (question, expected route, must contain, kind)
CASES = [
    ("Can I export my project?", "sources", "CSV", "user-guide.pdf"),
    ("Are attachments included in the export?", "sources", "not included", "user-guide.pdf"),
    ("How much does the Team plan cost per user?", "sources", "12 euros", "pricing.pdf"),
    ("Can I get a refund on an annual plan?", "sources", "pro rata", "pricing.pdf"),
    ("Where is our data stored?", "sources", "European Union", "security.pdf"),
    ("Do you support single sign-on?", "sources", "Enterprise plan", "security.pdf"),
    ("How long do deleted projects stay in the trash?", "sources", "30 days", "support-policy.pdf"),
    ("Is there a mobile app for the dashboard?", "not-available", None, "not in the PDFs"),
    ("Is the Team plan HIPAA compliant?", "not-available", None, "not in the PDFs"),
    ("Can I pay for the Team plan with PayPal?", "not-available", None, "not in the PDFs"),
    ("Is there a nonprofit discount on the Team plan?", "not-available", None, "not in the PDFs"),
    ("Can I export my project to Excel or PDF?", "not-available", None, "not in the PDFs"),
]

GUARD_OFF = Settings(guard=False)


def passes(a, route, must) -> bool:
    return a.route == route and (must is None or must in a.text)


def run(settings=None):
    return [(q, kind, a, passes(a, route, must)) for q, route, must, kind in CASES
            for a in [answer(q, settings)]]


if __name__ == "__main__":
    on, off = run(), run(GUARD_OFF)
    print(f"{'#':>2}  {'question':<50} {'source':<19} {'guard on':<22} guard off")
    for i, ((q, kind, a, ok), (_, _, b, ok2)) in enumerate(zip(on, off), 1):
        print(f"{i:>2}  {q[:50]:<50} {kind:<19} {('PASS ' if ok else 'FAIL ') + a.route:<22} {('PASS ' if ok2 else 'FAIL ') + b.route}")
    na = [r for r in on if r[1] == "not in the PDFs"]
    na_off = [r for r in off if r[1] == "not in the PDFs"]
    print(f"\nguard on: {sum(r[3] for r in on)}/{len(on)} pass · guard off: {sum(r[3] for r in off)}/{len(off)} pass")
    print(f"not in the PDFs: guard on said 'not available' on {sum(r[3] for r in na)} of {len(na)}; "
          f"guard off answered {sum(r[2].route != 'not-available' for r in na_off)} of {len(na_off)} anyway")
    cited = [r for r in on if r[2].route == 'sources']
    print(f"answers with a named source: {sum(bool(r[2].cites) for r in cited)} of {len(cited)} · grounding check passed: {sum(bool(r[2].grounded) for r in cited)} of {len(cited)}")
