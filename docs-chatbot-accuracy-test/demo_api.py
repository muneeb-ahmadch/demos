"""Glue between the page and the chatbot: the page calls these two functions."""
import json

from chatbot import answer
from questions import CASES, GUARD_OFF, passes


def run_cases(indexes):
    out = []
    for i in indexes:
        q, route, must, kind = CASES[i]
        a, b = answer(q), answer(q, GUARD_OFF)
        out.append({"q": q, "kind": kind, "on": a.as_dict(), "off": b.as_dict(),
                    "ok_on": passes(a, route, must), "ok_off": passes(b, route, must)})
    return json.dumps(out)


def ask(q, off=False):
    return json.dumps(answer(q, GUARD_OFF if off else None).as_dict())
