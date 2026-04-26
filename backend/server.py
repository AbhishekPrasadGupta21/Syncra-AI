"""Syncra AI - FastAPI backend."""
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request
from fastapi.responses import RedirectResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from auth import (  # noqa: E402
    build_authorization_url,
    create_session,
    exchange_code_for_tokens,
    get_credentials,
    get_current_user,
    save_user_and_tokens,
)
from gmail_service import get_email, list_emails  # noqa: E402
from ai_service import extract_tasks, summarize_email  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("syncra")

mongo_url = os.environ["MONGO_URL"]
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ["DB_NAME"]]

FRONTEND_URL = os.environ["FRONTEND_URL"]

app = FastAPI(title="Syncra AI")
app.state.db = db

api = APIRouter(prefix="/api")


# ---------------- Models ----------------
class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    deadline: Optional[str] = None
    priority: str = "medium"
    type: str = "task"
    source_email_id: Optional[str] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None


class Task(BaseModel):
    id: str
    user_id: str
    title: str
    description: str = ""
    deadline: Optional[str] = None
    priority: str = "medium"
    type: str = "task"
    status: str = "pending"
    source_email_id: Optional[str] = None
    created_at: str
    updated_at: str
    completed_at: Optional[str] = None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------- Auth ----------------
@api.get("/auth/google/login")
async def google_login():
    url, state = build_authorization_url()
    await db.oauth_states.insert_one({
        "state": state,
        "created_at": _now_iso(),
    })
    return {"authorization_url": url}


@api.get("/auth/google/callback")
async def google_callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/login?error={error or 'missing_code'}")
    if state:
        s = await db.oauth_states.find_one({"state": state}, {"_id": 0})
        if not s:
            return RedirectResponse(f"{FRONTEND_URL}/login?error=invalid_state")
        await db.oauth_states.delete_one({"state": state})

    try:
        creds = exchange_code_for_tokens(code)
    except Exception:
        logger.exception("Token exchange failed")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=token_exchange_failed")

    # Get user profile
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            r = await http.get(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {creds.token}"},
            )
            r.raise_for_status()
            profile = r.json()
    except Exception:
        logger.exception("Userinfo fetch failed")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=userinfo_failed")

    user_id = await save_user_and_tokens(db, profile, creds)
    session_token = await create_session(db, user_id)
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={session_token}")


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name", ""),
        "picture": user.get("picture", ""),
    }


@api.post("/auth/logout")
async def logout(request: Request, user: dict = Depends(get_current_user)):
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1]
        await db.sessions.delete_one({"session_token": token})
    return {"success": True}


# ---------------- Emails ----------------
@api.get("/emails")
async def emails(user: dict = Depends(get_current_user), max_results: int = 30, include_spam: bool = False):
    creds = await get_credentials(db, user["id"])
    return await list_emails(creds, max_results=max_results, include_spam=include_spam)


@api.get("/emails/{message_id}")
async def email_detail(message_id: str, user: dict = Depends(get_current_user)):
    creds = await get_credentials(db, user["id"])
    msg = await get_email(creds, message_id)
    if not msg:
        raise HTTPException(404, "Email not found")
    return msg


@api.post("/emails/{message_id}/summary")
async def email_summary(message_id: str, user: dict = Depends(get_current_user)):
    creds = await get_credentials(db, user["id"])
    msg = await get_email(creds, message_id)
    if not msg:
        raise HTTPException(404, "Email not found")

    # Cache summary by email id + user
    cache_key = f"{user['id']}:{message_id}"
    cached = await db.summaries.find_one({"_key": cache_key}, {"_id": 0})
    if cached:
        return {"summary": cached["summary"], "cached": True}

    summary = await summarize_email(msg["subject"], msg["sender_email"], msg["body"])
    await db.summaries.update_one(
        {"_key": cache_key},
        {"$set": {"_key": cache_key, "summary": summary, "created_at": _now_iso()}},
        upsert=True,
    )
    return {"summary": summary, "cached": False}


@api.post("/emails/{message_id}/extract-tasks")
async def email_extract_tasks(message_id: str, user: dict = Depends(get_current_user)):
    creds = await get_credentials(db, user["id"])
    msg = await get_email(creds, message_id)
    if not msg:
        raise HTTPException(404, "Email not found")

    items = await extract_tasks(
        msg["subject"], msg["sender_email"], msg["body"], msg["timestamp"]
    )
    created = []
    for t in items:
        # Skip if a task with same source_email_id and title already exists for this user
        exists = await db.tasks.find_one(
            {"user_id": user["id"], "source_email_id": message_id, "title": t["title"]},
            {"_id": 0},
        )
        if exists:
            created.append(exists)
            continue
        task_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "title": t["title"],
            "description": t["description"],
            "deadline": t["deadline"],
            "priority": t["priority"],
            "type": t["type"],
            "status": "pending",
            "source_email_id": message_id,
            "source_email_subject": msg["subject"],
            "source_email_sender": msg["sender_name"] or msg["sender_email"],
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "completed_at": None,
        }
        await db.tasks.insert_one(task_doc)
        task_doc.pop("_id", None)
        created.append(task_doc)
    return {"count": len(created), "tasks": created}


# ---------------- Tasks ----------------
@api.get("/tasks")
async def list_tasks(user: dict = Depends(get_current_user), status: Optional[str] = None):
    q = {"user_id": user["id"]}
    if status:
        q["status"] = status
    tasks = await db.tasks.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return tasks


@api.post("/tasks")
async def create_task(payload: TaskCreate, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "title": payload.title,
        "description": payload.description or "",
        "deadline": payload.deadline,
        "priority": payload.priority,
        "type": payload.type,
        "status": "pending",
        "source_email_id": payload.source_email_id,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
        "completed_at": None,
    }
    await db.tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields to update")
    updates["updated_at"] = _now_iso()
    if updates.get("status") == "completed":
        updates["completed_at"] = _now_iso()
    if updates.get("status") == "pending":
        updates["completed_at"] = None
    res = await db.tasks.update_one({"id": task_id, "user_id": user["id"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Task not found")
    task = await db.tasks.find_one({"id": task_id, "user_id": user["id"]}, {"_id": 0})
    return task


@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    res = await db.tasks.delete_one({"id": task_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Task not found")
    return {"success": True}


@api.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    total = await db.tasks.count_documents({"user_id": user["id"]})
    completed = await db.tasks.count_documents({"user_id": user["id"], "status": "completed"})
    pending = await db.tasks.count_documents({"user_id": user["id"], "status": "pending"})
    return {"total": total, "completed": completed, "pending": pending}


@api.get("/preferences")
async def get_prefs(user: dict = Depends(get_current_user)):
    p = await db.preferences.find_one({"user_id": user["id"]}, {"_id": 0})
    if not p:
        p = {"user_id": user["id"], "theme": "dark", "reminder_minutes": 60, "poll_seconds": 60}
        await db.preferences.insert_one(p.copy())
    return p


@api.put("/preferences")
async def set_prefs(payload: dict, user: dict = Depends(get_current_user)):
    payload.pop("_id", None)
    payload["user_id"] = user["id"]
    await db.preferences.update_one({"user_id": user["id"]}, {"$set": payload}, upsert=True)
    return payload


@api.get("/")
async def root():
    return {"app": "Syncra AI", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()
