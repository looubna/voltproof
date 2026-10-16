"""ADK callbacks that bound what the investigator can do.

- Only the investigator's own tools may run (allowlist).
- At most MAX_TOOL_CALLS tool calls per run, and one re-check per document.
- Every call and its result is written to the run trace, which is stored in
  the case's audit trail.
"""
from __future__ import annotations

from typing import Any

from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext

from .tools import TOOL_NAMES
from .trace import add_step

MAX_TOOL_CALLS = 8


def before_tool(tool: BaseTool, args: dict[str, Any], tool_context: ToolContext) -> dict | None:
    state = tool_context.state
    if tool.name not in TOOL_NAMES:
        add_step(state, "investigator", "decision", f"Blocked tool {tool.name}: not on the allowlist.", tool.name)
        return {"error": f"Tool {tool.name} is not allowed."}
    used = int(state.get("tool_calls", 0))
    if used >= MAX_TOOL_CALLS:
        add_step(state, "investigator", "decision", "Tool budget reached; no more tool calls this run.", tool.name)
        return {"error": "Tool budget for this run is used up. Finish with what you have."}
    if tool.name == "recheck_document":
        done = list(state.get("rechecked", []))
        doc = str(args.get("document_id", ""))
        if doc in done:
            return {"error": "This document was already re-checked in this run."}
        state["rechecked"] = done + [doc]
    state["tool_calls"] = used + 1
    detail = ", ".join(f"{k}={str(v)[:80]}" for k, v in args.items())
    add_step(state, "investigator", "tool_call", f"{tool.name}({detail})", tool.name)
    return None


def _result_summary(name: str, r: dict) -> str:
    if r.get("error"):
        return f"→ {r['error']}"
    if name == "explain_finding":
        f = r.get("finding", {})
        return f"→ {f.get('title')}: {f.get('status')}. {str(f.get('result', ''))[:300]}"
    if name == "document_checks":
        d = r.get("document", {})
        flags = "; ".join(i.get("code", "") + (f" on {i['field']}" if i.get("field") else "") for i in d.get("forensicIndicators", []))
        sigs = ", ".join(s.get("integrity", "") for s in d.get("signatures", []))
        return f"→ {d.get('filename')} ({d.get('type')}, {d.get('provenance')}): read {d.get('extractionStatus')}; forensic flags: {flags or 'none'}; signatures: {sigs or 'none'}"
    if name == "recheck_document":
        return f"→ re-read finished ({r.get('status')}). {r.get('claimSummary') or ''}"
    return "→ done"


def after_tool(tool: BaseTool, args: dict[str, Any], tool_context: ToolContext, tool_response: Any) -> dict | None:
    if isinstance(tool_response, dict):
        kind = "check" if tool.name == "recheck_document" and not tool_response.get("error") else "tool_call"
        add_step(tool_context.state, "investigator", kind, f"{tool.name} result", tool.name, detail=_result_summary(tool.name, tool_response))
    return None
