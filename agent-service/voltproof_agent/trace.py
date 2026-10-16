"""Run trace kept in session state; stored with the run in the case's audit trail."""
from __future__ import annotations

import time
from typing import Any, MutableMapping


def add_step(
    state: MutableMapping[str, Any],
    node: str,
    kind: str,
    summary: str,
    tool: str | None = None,
    model: str | None = None,
    ms: int | None = None,
    detail: str | None = None,
) -> None:
    steps = list(state.get("trace", []))
    step: dict[str, Any] = {"node": node, "kind": kind, "summary": summary[:600], "at": time.time()}
    if tool:
        step["tool"] = tool
    if model:
        step["model"] = model
    if ms is not None:
        step["ms"] = int(ms)
    if detail:
        step["detail"] = detail[:1500]
    steps.append(step)
    state["trace"] = steps
