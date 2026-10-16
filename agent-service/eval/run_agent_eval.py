"""Live evaluation of the ADK evidence agent.

Runs the real workflow (real Gemini on Vertex AI) against the deployed app on
the synthetic demo cases and checks its behaviour, not just its output:

- reference checks: both registry lookups always run;
- forensic analyst: runs if and only if the case has flagged documents, and
  explains every flagged document, citing only indicators the checks raised;
- drafts: every kept draft cites findings; no verdict words anywhere;
- bounds: tool calls within budget, run within the time limit.

Usage (from agent-service/):
  AGENT_API_TOKEN=... VOLTPROOF_APP_URL=https://... GOOGLE_GENAI_USE_VERTEXAI=TRUE \\
  GOOGLE_CLOUD_PROJECT=... GOOGLE_CLOUD_LOCATION=global GEMINI_MODEL=gemini-2.5-flash \\
  .venv/bin/python eval/run_agent_eval.py
Writes eval/AGENT_RESULTS.md and eval/agent_results.json.
"""
from __future__ import annotations

import asyncio
import json
import pathlib
import re
import sys
import time
import warnings
from datetime import datetime, timezone

warnings.filterwarnings("ignore")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from main import investigate_case  # noqa: E402
from voltproof_agent.app_client import AppClient, get_app, set_app  # noqa: E402
from voltproof_agent.forensic_analyst import FORENSIC_MODEL  # noqa: E402
from voltproof_agent.guardrails import MAX_TOOL_CALLS  # noqa: E402
from voltproof_agent.workflow import AGENT_VERSION, model_name  # noqa: E402

CASES = ["demo-hero-id3", "demo-tampered-kona", "demo-tesla-model3", "demo-kia-ev6"]
TIME_LIMIT_S = 150
VERDICT = re.compile(r"\b(forged|forgery|fake|fraud|fraudulent)\b|\b(is|are|was|were)\s+(verified|genuine|authentic)\b", re.I)


class RecordingClient(AppClient):
    """Keeps the run payload the agent stores, so it can be checked."""

    saved: dict | None = None

    async def save_run(self, case_id: str, run: dict) -> dict:
        self.saved = run
        return await super().save_run(case_id, run)


def flagged_docs(view: dict) -> dict[str, set[str]]:
    out = {}
    for d in view["documents"]:
        codes = {i["code"] for i in d.get("forensicIndicators", [])}
        if any(s.get("integrity") == "invalid" for s in d.get("signatures", [])):
            codes.add("signature_broken")
        if codes:
            out[d["id"]] = codes
    return out


async def evaluate(case_id: str) -> dict:
    client = RecordingClient()
    set_app(client)
    view = await get_app().agent_view(case_id)
    flagged = flagged_docs(view)
    started = time.time()
    error = None
    try:
        await investigate_case(case_id)
    except Exception as e:  # noqa: BLE001
        error = f"{type(e).__name__}: {e}"
    seconds = time.time() - started
    run = client.saved or {}
    steps = run.get("steps", [])
    report = run.get("forensicReport", [])
    texts = [x["text"] for k in ("reviewerSummary", "sellerQuestions", "issuerRequests") for x in run.get(k, [])]
    texts += [v for r in report for f in r["findings"] for v in f.values() if isinstance(v, str)]
    checks = {
        "run stored": bool(run) and error is None,
        "both registry lookups ran": sum(1 for s in steps if s["node"] == "reference_checks") >= 2,
        "forensic analyst ran iff documents flagged": any(s["node"] == "forensic_analyst" and s["kind"] == "analysis" for s in steps) == bool(flagged),
        "every flagged document explained": {r["documentId"] for r in report} >= set(flagged),
        "explanations cite only raised indicators": all(f["indicatorCode"] in flagged.get(r["documentId"], set()) for r in report for f in r["findings"]),
        "every draft cites findings": all(x["findingIds"] for k in ("reviewerSummary", "sellerQuestions", "issuerRequests") for x in run.get(k, [])),
        "no verdict words": not any(VERDICT.search(t) for t in texts),
        f"tool calls ≤ {MAX_TOOL_CALLS}": sum(1 for s in steps if s["kind"] == "tool_call" and s["summary"].endswith(")")) <= MAX_TOOL_CALLS,
        f"finished in < {TIME_LIMIT_S} s": seconds < TIME_LIMIT_S,
    }
    return {
        "case": case_id,
        "seconds": round(seconds, 1),
        "flaggedDocuments": len(flagged),
        "forensicReports": len(report),
        "steps": len(steps),
        "geminiCalls": sum(1 for s in steps if s["kind"] in ("model_call", "analysis")),
        "drafts": {k: len(run.get(k, [])) for k in ("reviewerSummary", "sellerQuestions", "issuerRequests")},
        "droppedByValidation": len(run.get("dropped", [])),
        "checks": checks,
        "error": error,
    }


async def main():
    results = []
    for case in CASES:
        r = await evaluate(case)
        results.append(r)
        print(json.dumps({"case": case, "passed": all(r["checks"].values()), "seconds": r["seconds"]}))
    total = sum(len(r["checks"]) for r in results)
    passed = sum(v for r in results for v in r["checks"].values())
    here = pathlib.Path(__file__).parent
    (here / "agent_results.json").write_text(json.dumps(results, indent=2))
    lines = [
        "# Evidence agent evaluation (live)",
        "",
        f"Ran {datetime.now(timezone.utc).isoformat(timespec='seconds')} · agent {AGENT_VERSION} · {model_name()} (investigator, drafter) · {FORENSIC_MODEL} (forensic analyst) · synthetic demo cases.",
        "",
        f"**{passed}/{total} behaviour checks passed.**",
        "",
        "| Case | Flagged docs | Forensic reports | Steps | Gemini calls | Questions / issuer requests | Dropped | Time | Checks |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in results:
        ok = sum(r["checks"].values())
        lines.append(f"| {r['case']} | {r['flaggedDocuments']} | {r['forensicReports']} | {r['steps']} | {r['geminiCalls']} | {r['drafts']['sellerQuestions']} / {r['drafts']['issuerRequests']} | {r['droppedByValidation']} | {r['seconds']} s | {ok}/{len(r['checks'])} |")
    lines += ["", "## Checks", ""]
    for r in results:
        lines.append(f"- **{r['case']}**: " + "; ".join(f"{'✓' if v else '✗'} {k}" for k, v in r["checks"].items()) + (f" — error: {r['error']}" if r["error"] else ""))
    (here / "AGENT_RESULTS.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines[:12]))


if __name__ == "__main__":
    asyncio.run(main())
