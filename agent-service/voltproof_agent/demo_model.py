"""Offline stand-in for Gemini, for local demos without Google Cloud.

AGENT_MODEL=offline-demo uses this instead of Gemini. It follows the same
contract (tool calls, then structured JSON), so the whole workflow, the
guardrails and the app integration run for real; only the judgement is a
simple fixed policy. Runs record the model as "offline-demo-planner", so
nobody mistakes them for Gemini output.
"""
from __future__ import annotations

import json
import re
from typing import AsyncGenerator

from google.adk.models.base_llm import BaseLlm
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.genai import types

DEMO_MODEL_NAME = "offline-demo-planner"


def _between(text: str, start: str, end: str) -> str:
    i = text.find(start)
    if i < 0:
        return ""
    j = text.find(end, i + len(start))
    return text[i + len(start) : j if j >= 0 else None].strip()


def _json(text: str):
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _reply(part: types.Part) -> LlmResponse:
    return LlmResponse(content=types.Content(role="model", parts=[part]))


class OfflineDemoPlanner(BaseLlm):
    model: str = DEMO_MODEL_NAME

    async def generate_content_async(self, llm_request: LlmRequest, stream: bool = False) -> AsyncGenerator[LlmResponse, None]:
        instruction = str(llm_request.config.system_instruction or "")
        if "You investigate one used electric vehicle case" in instruction:
            yield self._investigate(instruction, llm_request)
        else:
            yield self._draft(instruction)

    def _investigate(self, instruction: str, req: LlmRequest) -> LlmResponse:
        docs = _json(_between(instruction, "Documents:\n", "\n\nHow to work:")) or []
        already = {p.function_call.args.get("document_id") for c in req.contents for p in (c.parts or []) if p.function_call and p.function_call.name == "recheck_document"}
        # Policy: re-check documents whose own checks did not complete: not read, or a photo/scan without a second read.
        for d in docs:
            incomplete = d.get("extractionStatus") in ("failed", "pending", "not_configured") or (d.get("grounding") == "not_checkable" and not d.get("secondRead"))
            if incomplete and d["id"] not in already:
                return _reply(types.Part(function_call=types.FunctionCall(name="recheck_document", args={"document_id": d["id"], "reason": f"Checks on {d['filename']} did not complete."})))
        notes = [f"Re-checked {len(already)} document(s) whose checks had not completed."] if already else ["Every document's checks completed; open items need evidence, not re-reads."]
        return _reply(types.Part(text=json.dumps({"rechecked_documents": sorted(x for x in already if x), "notes": notes, "another_round": False})))

    def _draft(self, instruction: str) -> LlmResponse:
        case = _json(_between(instruction, "Case:\n", "\n\nWrite:")) or {}
        findings = case.get("findings", [])
        open_ = [f for f in findings if f["status"] in ("conflict", "unknown") and f["id"] != "authenticity"]
        conflicts = [f for f in open_ if f["status"] == "conflict"]
        summary = []
        if conflicts:
            summary.append({"text": f"{len(conflicts)} item(s) are in conflict: " + "; ".join(f["title"] for f in conflicts[:3]) + ".", "finding_ids": [f["id"] for f in conflicts[:3]]})
        missing = [f for f in open_ if f["status"] == "unknown"]
        if missing:
            summary.append({"text": f"{len(missing)} item(s) lack evidence: " + "; ".join(f["title"] for f in missing[:3]) + ".", "finding_ids": [f["id"] for f in missing[:3]]})
        questions, seen = [], {}
        for f in open_:
            text = f"About “{f['title']}”: {re.sub(r'[.?]$', '', f['nextAction'] or 'can you provide evidence for this')}?"
            key = (f["nextAction"] or f["title"]).lower()
            if key in seen:  # same request for several items: one question citing all of them
                seen[key]["finding_ids"].append(f["id"])
                continue
            seen[key] = {"text": text, "finding_ids": [f["id"]]}
            questions.append(seen[key])
        docs = {d["id"]: d for d in case.get("documents", [])}
        requests = []
        for f in conflicts:
            for d in docs.values():
                if d["provenance"] == "seller_provided" and not d.get("issuerVerified") and d["filename"] in (f.get("result") or "") and len(requests) < 3:
                    requests.append({
                        "document_id": d["id"],
                        "to": f"The issuer of {d['filename']} (find contact details independently, not from the document)",
                        "subject": f"Request to confirm {d['type'] or 'document'} {d['filename']}",
                        "text": f"Could you confirm that you issued {d['filename']} and that its values match your records? It relates to: {f['title']}.",
                        "finding_ids": [f["id"]],
                    })
        return _reply(types.Part(text=json.dumps({"reviewer_summary": summary[:3], "seller_questions": questions[:5], "issuer_requests": requests})))
