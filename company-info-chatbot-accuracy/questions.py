"""Twelve customer questions: seven the company information answers, five it doesn't. Run with the guard on, then off.

This is the accuracy test: the same list runs before and after every change, and the count is the score.

    python questions.py
"""
from chatbot import Settings, answer

# (question, expected route, must contain, kind)
CASES = [
    ("How much does a business website cost?", "sources", "$2,500", "website"),
    ("How long does a website take to build?", "sources", "4 to 6 weeks", "website"),
    ("Do you build online stores?", "sources", "online stores", "website"),
    ("What does the Pro maintenance plan include?", "sources", "5 hours", "company info"),
    ("Can I cancel my maintenance plan?", "sources", "30 days notice", "company info"),
    ("What are your office hours?", "sources", "9 am to 6 pm", "company info"),
    ("Can you move my old website to Next.js?", "sources", "migrate", "website"),
    ("Do you build mobile apps for iPhone?", "not-available", None, "not in company info"),
    ("Do you work with Shopify?", "not-available", None, "not in company info"),
    ("Do you offer a discount for nonprofits?", "not-available", None, "not in company info"),
    ("Can I pay in monthly installments?", "not-available", None, "not in company info"),
    ("Do you offer SEO services?", "not-available", None, "not in company info"),
]

GUARD_OFF = Settings(guard=False)


def passes(a, route, must) -> bool:
    return a.route == route and (must is None or must in a.text)


def run(settings=None):
    return [(q, kind, a, passes(a, route, must)) for q, route, must, kind in CASES
            for a in [answer(q, settings)]]


if __name__ == "__main__":
    on, off = run(), run(GUARD_OFF)
    print(f"{'#':>2}  {'question':<46} {'source kind':<20} {'guard on':<22} guard off")
    for i, ((q, kind, a, ok), (_, _, b, ok2)) in enumerate(zip(on, off), 1):
        print(f"{i:>2}  {q[:46]:<46} {kind:<20} {('PASS ' if ok else 'FAIL ') + a.route:<22} {('PASS ' if ok2 else 'FAIL ') + b.route}")
    na = [r for r in on if r[1] == "not in company info"]
    na_off = [r for r in off if r[1] == "not in company info"]
    print(f"\nguard on: {sum(r[3] for r in on)}/{len(on)} pass · guard off: {sum(r[3] for r in off)}/{len(off)} pass")
    print(f"not in the company info: guard on said 'not available' on {sum(r[3] for r in na)} of {len(na)}; "
          f"guard off answered {sum(r[2].route != 'not-available' for r in na_off)} of {len(na_off)} anyway")
    cited = [r for r in on if r[2].route == 'sources']
    print(f"answers with a named source: {sum(bool(r[2].cites) for r in cited)} of {len(cited)} · grounding check passed: {sum(bool(r[2].grounded) for r in cited)} of {len(cited)}")
