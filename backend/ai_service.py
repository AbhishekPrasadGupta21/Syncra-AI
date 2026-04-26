"""Claude Sonnet 4.5 wrappers for email summarization and task extraction."""
import json
import os
import re
import secrets
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ["EMERGENT_LLM_KEY"]
MODEL_PROVIDER = "anthropic"
MODEL_NAME = "claude-sonnet-4-5-20250929"


def _new_chat(system_message: str) -> LlmChat:
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"syncra-{secrets.token_hex(8)}",
        system_message=system_message,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)


async def summarize_email(subject: str, sender: str, body: str) -> str:
    system = (
        "You are an executive assistant. Produce a CONCISE 2-3 sentence summary of the email "
        "that captures the core request, any deadlines, and required actions. Plain text only."
    )
    chat = _new_chat(system)
    truncated = body[:6000] if body else ""
    user = UserMessage(text=f"From: {sender}\nSubject: {subject}\n\n{truncated}")
    resp = await chat.send_message(user)
    return (resp or "").strip()


def _extract_json(text: str):
    """Find first JSON array/object in text."""
    if not text:
        return None
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    candidate = fence.group(1) if fence else text
    m = re.search(r"(\[.*\]|\{.*\})", candidate, re.DOTALL)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except Exception:
        return None


async def extract_tasks(subject: str, sender: str, body: str, email_timestamp: str) -> list:
    """Return list of task dicts: {title, description, deadline (ISO or null), priority, type}."""
    system = (
        "You extract structured action items from emails. Return STRICT JSON only — a JSON array. "
        "Each element: {\"title\": str, \"description\": str, \"deadline\": ISO 8601 datetime or null, "
        "\"priority\": \"high\"|\"medium\"|\"low\", \"type\": \"task\"|\"meeting\"|\"deadline\"}. "
        "If no clear actionable item, return []. Be conservative: do not invent deadlines. "
        "Use the email's send time as reference for relative phrases like 'tomorrow' or 'next Monday'. "
        "Output ONLY the JSON array, nothing else."
    )
    chat = _new_chat(system)
    truncated = body[:6000] if body else ""
    user = UserMessage(text=(
        f"Email sent at: {email_timestamp}\nFrom: {sender}\nSubject: {subject}\n\n{truncated}"
    ))
    resp = await chat.send_message(user)
    parsed = _extract_json(resp or "")
    if not isinstance(parsed, list):
        return []

    cleaned = []
    for t in parsed:
        if not isinstance(t, dict):
            continue
        title = (t.get("title") or "").strip()
        if not title:
            continue
        priority = (t.get("priority") or "medium").lower()
        if priority not in ("high", "medium", "low"):
            priority = "medium"
        ttype = (t.get("type") or "task").lower()
        if ttype not in ("task", "meeting", "deadline"):
            ttype = "task"
        deadline = t.get("deadline")
        if deadline:
            try:
                # Validate parseable
                dt = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                deadline = dt.isoformat()
            except Exception:
                deadline = None
        cleaned.append({
            "title": title[:200],
            "description": (t.get("description") or "")[:1000],
            "deadline": deadline,
            "priority": priority,
            "type": ttype,
        })
    return cleaned
