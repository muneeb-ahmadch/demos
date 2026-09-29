"""Glue between the page and the assistant: the page calls these two functions."""
import json

from assistant import answer
from edge_cases import ALL_OFF, CASES, passes, short


def run_cases(indexes):
    out = []
    for i in indexes:
        _, q, route, must, must_not = CASES[i]
        a, b = answer(q), answer(q, ALL_OFF)
        out.append({"q": short(q), "on": a.as_dict(), "off": b.as_dict(),
                    "ok_on": passes(a, route, must, must_not), "ok_off": passes(b, route, must, must_not)})
    return json.dumps(out)


def ask(q, off=False):
    return json.dumps(answer(q, ALL_OFF if off else None).as_dict())
