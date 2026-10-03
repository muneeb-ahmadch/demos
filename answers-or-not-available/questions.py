"""Twelve customer questions: seven the sources answer, five they don't. Run with the guard on, then off.

    python questions.py
"""
from chatbot import Settings, answer

# (question, expected route, must contain, kind)
CASES = [
    ("Can I get a refund on an annual plan after 3 weeks?", "sources", "pro rata", "document"),
    ("Where is our customer data stored?", "sources", "Frankfurt", "document"),
    ("How many contacts can I import from a CSV?", "sources", "10,000 rows", "document"),
    ("How much does the Pro plan cost per staff member?", "sources", "$19", "website"),
    ("Does it sync with Outlook?", "sources", "Outlook", "website"),
    ("When does account ACC-1042 renew?", "record", "12 November 2026", "database"),
    ("Is invoice INV-2304 paid?", "record", "unpaid", "database"),
    ("Do you offer a nonprofit discount?", "not-available", None, "not in sources"),
    ("Will you sign a HIPAA business associate agreement?", "not-available", None, "not in sources"),
    ("When does account ACC-7781 renew?", "not-available", None, "not in sources"),
    ("Is there a mobile app for staff?", "not-available", None, "not in sources"),
    ("Can customers pay with PayPal?", "not-available", None, "not in sources"),
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
    cited = [r for r in on if r[2].route in ('sources', 'record')]
    print(f"answers with a named source: {sum(bool(r[2].cites) for r in cited)} of {len(cited)} · grounding check passed: {sum(bool(r[2].grounded) for r in cited)} of {len(cited)}")
