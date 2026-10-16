"""VoltProof evidence agent service (Cloud Run).

POST /investigate {"case_id": "..."}  → runs the ADK workflow, stores the run in the app.
GET  /health

Deploy with --no-allow-unauthenticated: only the app's service account may call it.
For local runs without Cloud Run IAM, set INVESTIGATE_TOKEN and send it as a bearer token.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import uuid

from fastapi import FastAPI, Header, HTTPException
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import BaseModel

from voltproof_agent.app_client import AppError
from voltproof_agent.workflow import build_workflow, model_name

logging.basicConfig(level=logging.INFO, format='{"severity":"%(levelname)s","message":%(message)r}')


def _enable_cloud_trace() -> None:
    """Exports ADK's OpenTelemetry spans (workflow nodes, agent and model calls) to Cloud Trace."""
    if os.environ.get("AGENT_CLOUD_TRACE", "").lower() != "true":
        return
    try:
        import google.auth
        from google.adk.telemetry.google_cloud import get_gcp_exporters, get_gcp_resource
        from google.adk.telemetry.setup import maybe_set_otel_providers

        credentials, project_id = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        # telemetry.googleapis.com rejects spans whose resource has no gcp.project_id.
        maybe_set_otel_providers(
            [get_gcp_exporters(enable_cloud_tracing=True, google_auth=(credentials, project_id))],
            otel_resource=get_gcp_resource(project_id),
        )
        logging.info("Cloud Trace export enabled")
    except Exception as e:  # noqa: BLE001  (tracing must never stop the service)
        logging.warning(f"Cloud Trace export not enabled: {e}")


_enable_cloud_trace()
app = FastAPI(title="VoltProof evidence agent", version="1.0.0")
APP_NAME = "voltproof_evidence_agent"
RUN_TIMEOUT_S = float(os.environ.get("AGENT_RUN_TIMEOUT_S", "270"))


class InvestigateRequest(BaseModel):
    case_id: str
    requested_by: str | None = None


def _check_token(authorization: str | None):
    expected = os.environ.get("INVESTIGATE_TOKEN")
    if not expected:
        return  # Cloud Run IAM authenticates callers
    if not authorization or not hmac.compare_digest(authorization.removeprefix("Bearer "), expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def investigate_case(case_id: str, workflow=None) -> dict:
    runner = InMemoryRunner(agent=workflow or build_workflow(), app_name=APP_NAME)
    session = await runner.session_service.create_session(app_name=APP_NAME, user_id="voltproof-app", state={"model_name": model_name()})
    message = types.Content(role="user", parts=[types.Part(text=json.dumps({"case_id": case_id}))])
    result: dict = {}
    async for event in runner.run_async(user_id="voltproof-app", session_id=session.id, new_message=message):
        out = getattr(event, "output", None)
        if isinstance(out, dict) and "run_id" in out:
            result = out
    _flush_traces()
    if not result:
        raise RuntimeError("The workflow finished without storing a run.")
    return result


def _flush_traces() -> None:
    # Cloud Run throttles CPU after the response, so send spans before replying.
    if os.environ.get("AGENT_CLOUD_TRACE", "").lower() == "true":
        from opentelemetry import trace

        provider = trace.get_tracer_provider()
        if hasattr(provider, "force_flush"):
            provider.force_flush(timeout_millis=5000)


@app.get("/health")
def health():
    return {"ok": True, "model": model_name()}


@app.post("/investigate")
async def investigate(body: InvestigateRequest, authorization: str | None = Header(default=None)):
    _check_token(authorization)
    request_id = uuid.uuid4().hex[:12]
    logging.info(json.dumps({"step": "investigate", "request": request_id, "case": body.case_id}))
    try:
        return await asyncio.wait_for(investigate_case(body.case_id), timeout=RUN_TIMEOUT_S)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="The investigation took too long.")
    except (AppError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8082")))
