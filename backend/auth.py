"""Authentication: Google OAuth 2.0 + session management."""
import os
import secrets
import warnings
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

GOOGLE_CLIENT_ID = os.environ["GOOGLE_CLIENT_ID"]
GOOGLE_CLIENT_SECRET = os.environ["GOOGLE_CLIENT_SECRET"]
GOOGLE_REDIRECT_URI = os.environ["GOOGLE_REDIRECT_URI"]

SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
]

CLIENT_CONFIG = {
    "web": {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

bearer_scheme = HTTPBearer(auto_error=False)


def build_flow() -> Flow:
    return Flow.from_client_config(
        CLIENT_CONFIG, scopes=SCOPES, redirect_uri=GOOGLE_REDIRECT_URI
    )


def build_authorization_url():
    flow = build_flow()
    url, state = flow.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true"
    )
    return url, state


def exchange_code_for_tokens(code: str) -> Credentials:
    flow = build_flow()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        flow.fetch_token(code=code)
    return flow.credentials


async def save_user_and_tokens(db, profile: dict, creds: Credentials) -> str:
    """Upsert user and store tokens. Returns user_id."""
    email = profile["email"]
    user = await db.users.find_one({"email": email}, {"_id": 0})
    now = datetime.now(timezone.utc).isoformat()
    if user:
        user_id = user["id"]
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": profile.get("name", ""), "picture": profile.get("picture", ""), "updated_at": now}},
        )
    else:
        user_id = secrets.token_urlsafe(16)
        await db.users.insert_one({
            "id": user_id,
            "email": email,
            "name": profile.get("name", ""),
            "picture": profile.get("picture", ""),
            "created_at": now,
            "updated_at": now,
        })

    expires_at = (creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else
                  datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    await db.tokens.update_one(
        {"user_id": user_id},
        {"$set": {
            "user_id": user_id,
            "access_token": creds.token,
            "refresh_token": creds.refresh_token,
            "expires_at": expires_at,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "token_uri": "https://oauth2.googleapis.com/token",
            "scopes": SCOPES,
        }},
        upsert=True,
    )
    return user_id


async def create_session(db, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await db.sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
    })
    return token


async def get_credentials(db, user_id: str) -> Credentials:
    token_doc = await db.tokens.find_one({"user_id": user_id}, {"_id": 0})
    if not token_doc:
        raise HTTPException(status_code=401, detail="No Google tokens found")

    creds = Credentials(
        token=token_doc["access_token"],
        refresh_token=token_doc.get("refresh_token"),
        token_uri=token_doc["token_uri"],
        client_id=token_doc["client_id"],
        client_secret=token_doc["client_secret"],
        scopes=token_doc.get("scopes", SCOPES),
    )

    expires_at_str = token_doc.get("expires_at")
    expires_at = datetime.fromisoformat(expires_at_str) if expires_at_str else datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) >= expires_at - timedelta(minutes=2):
        try:
            creds.refresh(GoogleRequest())
            new_expiry = (creds.expiry.replace(tzinfo=timezone.utc) if creds.expiry else
                          datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
            await db.tokens.update_one(
                {"user_id": user_id},
                {"$set": {"access_token": creds.token, "expires_at": new_expiry}},
            )
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token refresh failed: {e}")
    return creds


async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    db = request.app.state.db
    token = None
    if creds:
        token = creds.credentials
    if not token:
        token = request.cookies.get("syncra_session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = datetime.fromisoformat(session["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= expires_at:
        raise HTTPException(status_code=401, detail="Session expired")

    user = await db.users.find_one({"id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
