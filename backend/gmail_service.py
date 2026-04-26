"""Gmail API wrapper - fetch emails, parse, classify."""
import base64
import re
from datetime import datetime, timezone
from email.utils import parseaddr, parsedate_to_datetime
from typing import Optional

from bs4 import BeautifulSoup
from googleapiclient.discovery import build

SPAM_KEYWORDS = [
    "winner", "free money", "prize", "lottery", "viagra", "casino",
    "click here to claim", "you've won", "earn $", "make money fast",
    "weight loss", "miracle", "no credit check", "act now", "limited offer",
    "100% free", "risk-free", "guaranteed",
]
IMPORTANT_KEYWORDS = [
    "urgent", "asap", "deadline", "meeting", "interview", "action required",
    "important", "critical", "follow up", "follow-up", "review", "approval",
    "schedule", "invoice", "payment", "contract",
]


def _classify(subject: str, body: str, labels: list, sender: str) -> str:
    if "SPAM" in labels:
        return "spam"
    text = f"{subject} {body[:2000]}".lower()
    if any(k in text for k in SPAM_KEYWORDS):
        return "spam"
    if any(k in text for k in IMPORTANT_KEYWORDS) or "IMPORTANT" in labels or "STARRED" in labels:
        return "important"
    return "normal"


def _decode_part(data: str) -> str:
    if not data:
        return ""
    try:
        return base64.urlsafe_b64decode(data.encode("utf-8")).decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_body(payload: dict) -> str:
    """Recursively extract plain-text body, fall back to HTML stripped."""
    if not payload:
        return ""
    mime = payload.get("mimeType", "")
    body = payload.get("body", {}) or {}
    data = body.get("data")

    if mime == "text/plain" and data:
        return _decode_part(data)

    parts = payload.get("parts") or []
    # Prefer plain text first
    for p in parts:
        if p.get("mimeType") == "text/plain":
            t = _extract_body(p)
            if t:
                return t
    # Then html
    for p in parts:
        if p.get("mimeType") == "text/html":
            html = _extract_body(p)
            if html:
                soup = BeautifulSoup(html, "html.parser")
                return soup.get_text(separator="\n").strip()
    # Fallback: recurse
    for p in parts:
        t = _extract_body(p)
        if t:
            return t
    if mime == "text/html" and data:
        html = _decode_part(data)
        return BeautifulSoup(html, "html.parser").get_text(separator="\n").strip()
    return ""


def _header(headers: list, name: str) -> str:
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _parse_message(msg: dict, full: bool = False) -> dict:
    payload = msg.get("payload", {})
    headers = payload.get("headers", [])
    subject = _header(headers, "Subject") or "(no subject)"
    from_raw = _header(headers, "From")
    sender_name, sender_email = parseaddr(from_raw)
    date_raw = _header(headers, "Date")
    try:
        ts = parsedate_to_datetime(date_raw) if date_raw else datetime.now(timezone.utc)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
    except Exception:
        ts = datetime.now(timezone.utc)

    snippet = msg.get("snippet", "")
    labels = msg.get("labelIds", []) or []
    body = _extract_body(payload) if full else ""

    classification = _classify(subject, body or snippet, labels, sender_email)

    return {
        "id": msg.get("id"),
        "thread_id": msg.get("threadId"),
        "subject": subject,
        "sender_name": sender_name or sender_email,
        "sender_email": sender_email,
        "snippet": snippet,
        "body": body,
        "timestamp": ts.isoformat(),
        "labels": labels,
        "classification": classification,
        "is_unread": "UNREAD" in labels,
    }


async def list_emails(creds, max_results: int = 30, include_spam: bool = False) -> list:
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    q = "" if include_spam else "-in:spam -in:trash"
    res = service.users().messages().list(userId="me", maxResults=max_results, q=q).execute()
    msg_refs = res.get("messages", []) or []
    emails = []
    for ref in msg_refs:
        try:
            full_msg = service.users().messages().get(
                userId="me", id=ref["id"], format="metadata",
                metadataHeaders=["Subject", "From", "Date"]
            ).execute()
            emails.append(_parse_message(full_msg, full=False))
        except Exception:
            continue
    return emails


async def get_email(creds, message_id: str) -> Optional[dict]:
    service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    msg = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    return _parse_message(msg, full=True)
