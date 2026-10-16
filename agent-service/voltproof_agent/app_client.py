"""HTTP client for the VoltProof app API.

The agent only talks to the app through a short allowlist of routes (enforced
by the app as well): read the case, run reference checks, re-check a document,
store the run. It authenticates with a shared secret (AGENT_API_TOKEN, kept in
Secret Manager). There is no route that sets a status or records a review.
"""
from __future__ import annotations

import os
import re
from typing import Any

import httpx

_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


class AppError(Exception):
    pass


class AppClient:
    def __init__(self, base_url: str | None = None, token: str | None = None, transport: httpx.AsyncBaseTransport | None = None):
        self.base_url = (base_url or os.environ.get("VOLTPROOF_APP_URL", "http://localhost:3000")).rstrip("/")
        self.token = token if token is not None else os.environ.get("AGENT_API_TOKEN", "")
        self.transport = transport

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.token}"},
            timeout=httpx.Timeout(90.0, connect=10.0),
            transport=self.transport,
        )

    @staticmethod
    def _check_id(value: str, what: str) -> str:
        if not _ID.match(value or ""):
            raise AppError(f"Invalid {what}.")
        return value

    async def _call(self, method: str, path: str, json: Any = None) -> dict:
        async with self._client() as c:
            r = await c.request(method, path, json=json)
        data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if r.status_code >= 400:
            raise AppError(data.get("error") or f"HTTP {r.status_code}")
        return data

    async def agent_view(self, case_id: str) -> dict:
        return await self._call("GET", f"/api/cases/{self._check_id(case_id, 'case id')}/agent-view")

    async def registry_check(self, case_id: str, provider: str) -> dict:
        if provider not in ("nhtsa_vpic", "nzta_mvr"):
            raise AppError("Unknown registry provider.")
        return await self._call("POST", f"/api/cases/{self._check_id(case_id, 'case id')}/registry", {"provider": provider})

    async def recheck_document(self, case_id: str, document_id: str) -> dict:
        return await self._call("POST", f"/api/cases/{self._check_id(case_id, 'case id')}/documents/{self._check_id(document_id, 'document id')}/process", {})

    async def save_run(self, case_id: str, run: dict) -> dict:
        return await self._call("POST", f"/api/cases/{self._check_id(case_id, 'case id')}/agent-runs", run)


_client: AppClient | None = None


def get_app() -> AppClient:
    global _client
    if _client is None:
        _client = AppClient()
    return _client


def set_app(client: AppClient | None) -> None:
    """Test hook."""
    global _client
    _client = client
