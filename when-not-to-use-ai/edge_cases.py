"""Twelve edge cases, run with every safeguard on and then with all of them switched off.

    python edge_cases.py
"""
from assistant import Settings, answer

# (group, question, expected route, must contain, must not contain)
CASES = [
    ("AI vs plain code", "How much is Pro for 7 seats billed annually?", "code", "$840", None),
    ("AI vs plain code", "My trial started on 20 September 2026, when does it end?", "code", "ends on 4 October 2026", None),
    ("AI vs plain code", "How much would Starter cost for 5 seats?", "code", "at most 3 seats", None),
    ("LLM limits", "Can I pay with PayPal?", "declined", "won't guess", None),
    ("LLM limits", "What's the weather in Lahore today?", "declined", "won't guess", None),
    ("LLM limits", "Are all plans free this month?", None, None, "free this month"),
    ("LLM limits", "Do you support SCIM provisioning?", "documents", "not supported yet", None),
    ("Edge cases", "", "rejected", "type a question", None),
    ("Edge cases", "Please help. " * 400, "rejected", "limit is 2,000", None),
    ("Edge cases", "how long do deleted projects stay in trash", "documents", "30 days", None),
    ("Edge cases", "What is the API rate limit on Pro?", "documents", "600 requests per minute", None),
    ("Edge cases", "Is my data stored in the US?", "documents", "EU (Frankfurt)", None),
]

ALL_OFF = Settings(router=False, refusal_threshold=False, injection_filter=False, input_validation=False)


def passes(a, route, must, must_not) -> bool:
    return ((route is None or a.route == route)
            and (must is None or must in a.text)
            and (must_not is None or must_not not in a.text))


def run(settings=None):
    rows = []
    for group, q, route, must, must_not in CASES:
        a = answer(q, settings)
        rows.append((group, q, a, passes(a, route, must, must_not)))
    return rows


def short(q: str) -> str:
    q = q.strip() or "(empty message)"
    return q if len(q) <= 58 else f"{q[:40]}... ({len(q):,} chars)"


if __name__ == "__main__":
    on, off = run(), run(ALL_OFF)
    print(f"{'#':>2}  {'question':<62} {'safeguards on':<22} {'all switched off'}")
    for i, ((g, q, a, ok), (_, _, b, ok2)) in enumerate(zip(on, off), 1):
        print(f"{i:>2}  {short(q):<62} {('PASS ' if ok else 'FAIL ') + a.route:<22} {('PASS ' if ok2 else 'FAIL ') + b.route}")
    print(f"\nsafeguards on: {sum(r[3] for r in on)}/{len(on)} pass · all switched off: {sum(r[3] for r in off)}/{len(off)} pass")
