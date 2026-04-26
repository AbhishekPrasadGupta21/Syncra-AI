"""Backend tests for Syncra AI."""
import os
import secrets
import datetime as dt
from urllib.parse import urlparse, parse_qs

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://real-time-tasks-2.preview.emergentagent.com"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "syncra_ai_db")
GOOGLE_CLIENT_ID = "844458848910-0neg1kpni41co3las59f017difonroef.apps.googleusercontent.com"
EXPECTED_REDIRECT = "https://real-time-tasks-2.preview.emergentagent.com/api/auth/google/callback"
FRONTEND_URL = "https://real-time-tasks-2.preview.emergentagent.com"


@pytest.fixture(scope="session")
def mongo_db():
    c = MongoClient(MONGO_URL)
    yield c[DB_NAME]
    c.close()


@pytest.fixture(scope="session")
def fake_session(mongo_db):
    uid = f"TEST_user_{secrets.token_hex(4)}"
    mongo_db.users.insert_one({
        "id": uid, "email": f"TEST_{uid}@example.com",
        "name": "TEST User", "picture": "",
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    })
    tok = secrets.token_urlsafe(32)
    mongo_db.sessions.insert_one({
        "session_token": tok, "user_id": uid,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "expires_at": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).isoformat(),
    })
    yield {"token": tok, "user_id": uid}
    mongo_db.users.delete_many({"id": uid})
    mongo_db.sessions.delete_many({"user_id": uid})
    mongo_db.tasks.delete_many({"user_id": uid})
    mongo_db.preferences.delete_many({"user_id": uid})


@pytest.fixture
def auth_headers(fake_session):
    return {"Authorization": f"Bearer {fake_session['token']}"}


# ---------- Health ----------
def test_health():
    r = requests.get(f"{BASE_URL}/api/")
    assert r.status_code == 200
    j = r.json()
    assert j["app"] == "Syncra AI"
    assert j["status"] == "ok"


# ---------- Google OAuth URL ----------
def test_google_login_url():
    r = requests.get(f"{BASE_URL}/api/auth/google/login")
    assert r.status_code == 200
    url = r.json()["authorization_url"]
    p = urlparse(url)
    assert p.netloc == "accounts.google.com"
    assert p.path == "/o/oauth2/auth"
    q = parse_qs(p.query)
    assert q["client_id"][0] == GOOGLE_CLIENT_ID
    assert q["redirect_uri"][0] == EXPECTED_REDIRECT
    assert q["access_type"][0] == "offline"
    assert q["prompt"][0] == "consent"
    scope = q["scope"][0]
    assert "openid" in scope
    assert "userinfo.email" in scope
    assert "userinfo.profile" in scope
    assert "gmail.readonly" in scope


def test_callback_error_redirect():
    r = requests.get(f"{BASE_URL}/api/auth/google/callback", params={"error": "foo"}, allow_redirects=False)
    assert r.status_code in (302, 307)
    assert "error=foo" in r.headers["location"]
    assert r.headers["location"].startswith(FRONTEND_URL)


def test_callback_invalid_state():
    r = requests.get(
        f"{BASE_URL}/api/auth/google/callback",
        params={"code": "invalid", "state": "invalid_state_xyz"},
        allow_redirects=False,
    )
    assert r.status_code in (302, 307)
    assert "error=invalid_state" in r.headers["location"]


# ---------- Auth guards ----------
@pytest.mark.parametrize("ep", ["/api/auth/me", "/api/tasks", "/api/stats", "/api/preferences", "/api/emails"])
def test_no_auth_returns_401(ep):
    r = requests.get(f"{BASE_URL}{ep}")
    assert r.status_code == 401, f"{ep} -> {r.status_code}"


@pytest.mark.parametrize("ep", ["/api/auth/me", "/api/tasks", "/api/stats", "/api/preferences"])
def test_invalid_token_returns_401(ep):
    r = requests.get(f"{BASE_URL}{ep}", headers={"Authorization": "Bearer nonsense_token_12345"})
    assert r.status_code == 401


# ---------- Authenticated endpoints ----------
def test_me_with_fake_session(auth_headers, fake_session):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
    assert r.status_code == 200
    j = r.json()
    assert j["id"] == fake_session["user_id"]
    assert j["email"].startswith("TEST_")


def test_tasks_empty_initially(auth_headers):
    r = requests.get(f"{BASE_URL}/api/tasks", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    # cleanup any pre-existing won't exist for fresh user
    assert r.json() == []


def test_stats_zero_initially(auth_headers):
    r = requests.get(f"{BASE_URL}/api/stats", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"total": 0, "completed": 0, "pending": 0}


def test_task_crud_flow(auth_headers):
    # CREATE
    r = requests.post(f"{BASE_URL}/api/tasks", headers=auth_headers,
                      json={"title": "TEST_task1", "description": "d", "priority": "high"})
    assert r.status_code == 200
    t = r.json()
    assert t["title"] == "TEST_task1"
    assert t["status"] == "pending"
    tid = t["id"]

    # GET list
    r = requests.get(f"{BASE_URL}/api/tasks", headers=auth_headers)
    assert any(x["id"] == tid for x in r.json())

    # PATCH -> completed
    r = requests.patch(f"{BASE_URL}/api/tasks/{tid}", headers=auth_headers, json={"status": "completed"})
    assert r.status_code == 200
    assert r.json()["status"] == "completed"
    assert r.json()["completed_at"] is not None

    # Stats
    r = requests.get(f"{BASE_URL}/api/stats", headers=auth_headers)
    s = r.json()
    assert s["total"] >= 1 and s["completed"] >= 1

    # DELETE
    r = requests.delete(f"{BASE_URL}/api/tasks/{tid}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["success"] is True

    r = requests.patch(f"{BASE_URL}/api/tasks/{tid}", headers=auth_headers, json={"status": "pending"})
    assert r.status_code == 404


def test_preferences_defaults_and_update(auth_headers):
    r = requests.get(f"{BASE_URL}/api/preferences", headers=auth_headers)
    assert r.status_code == 200
    p = r.json()
    assert p["theme"] == "dark"
    assert p["reminder_minutes"] == 60
    assert p["poll_seconds"] == 60

    r = requests.put(f"{BASE_URL}/api/preferences", headers=auth_headers,
                     json={"theme": "light", "reminder_minutes": 30, "poll_seconds": 120})
    assert r.status_code == 200

    r = requests.get(f"{BASE_URL}/api/preferences", headers=auth_headers)
    p2 = r.json()
    assert p2["theme"] == "light"
    assert p2["reminder_minutes"] == 30
    assert p2["poll_seconds"] == 120


def test_logout_invalidates_session(mongo_db):
    # Create dedicated session for logout test
    uid = f"TEST_logout_{secrets.token_hex(4)}"
    mongo_db.users.insert_one({"id": uid, "email": f"{uid}@example.com", "name": "X", "picture": "",
                               "created_at": "x", "updated_at": "x"})
    tok = secrets.token_urlsafe(32)
    mongo_db.sessions.insert_one({
        "session_token": tok, "user_id": uid,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "expires_at": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).isoformat(),
    })
    h = {"Authorization": f"Bearer {tok}"}
    try:
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=h)
        assert r.status_code == 200

        r = requests.post(f"{BASE_URL}/api/auth/logout", headers=h)
        assert r.status_code == 200
        assert r.json()["success"] is True

        r = requests.get(f"{BASE_URL}/api/auth/me", headers=h)
        assert r.status_code == 401
    finally:
        mongo_db.users.delete_many({"id": uid})
        mongo_db.sessions.delete_many({"user_id": uid})


# ---------- Import test for AI/Gmail wrappers ----------
def test_module_imports():
    import gmail_service  # noqa
    import ai_service  # noqa
    assert hasattr(gmail_service, "list_emails")
    assert hasattr(gmail_service, "get_email")
    assert hasattr(ai_service, "summarize_email")
    assert hasattr(ai_service, "extract_tasks")


def test_emails_requires_auth():
    r = requests.get(f"{BASE_URL}/api/emails")
    assert r.status_code == 401
