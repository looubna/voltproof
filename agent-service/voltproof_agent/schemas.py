"""Structured outputs of the LLM agents. Every draft must cite finding ids."""
from __future__ import annotations

from pydantic import BaseModel, Field


class InvestigationOutcome(BaseModel):
    rechecked_documents: list[str] = Field(default_factory=list, description="Ids of documents you asked to re-check this round.")
    notes: list[str] = Field(default_factory=list, description="Short notes for the reviewer (max 5, each under 200 characters). Facts only, no verdicts.")
    another_round: bool = Field(description="True only if a re-check you requested could change an open item and one more round is worth it.")


class CitedText(BaseModel):
    text: str = Field(description="One or two plain sentences.")
    finding_ids: list[str] = Field(description="Ids of the findings this text is about. At least one.")


class IssuerRequest(BaseModel):
    document_id: str = Field(description="Id of the document to confirm with its issuer.")
    to: str = Field(description="The issuing organisation, as named on the document. Add: find contact details independently.")
    subject: str
    text: str = Field(description="Polite request to confirm specific values (document number, date, VIN, odometer or battery figure).")
    finding_ids: list[str]


class Drafts(BaseModel):
    reviewer_summary: list[CitedText] = Field(description="At most 3 sentences for the reviewer: what is open and why.")
    seller_questions: list[CitedText] = Field(description="At most 5 questions to ask the seller before paying.")
    issuer_requests: list[IssuerRequest] = Field(description="At most 3 requests to issuers, for documents whose authenticity matters to an open item.")
