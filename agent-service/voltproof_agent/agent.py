"""Entry point for `adk web` / `adk run` and the service: exposes root_agent."""
from .workflow import build_workflow

root_agent = build_workflow()
