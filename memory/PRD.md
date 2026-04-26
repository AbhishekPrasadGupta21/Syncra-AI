# Syncra AI — PRD

## Original problem
Real-Time Email-Integrated Smart Task Manager named **Syncra AI** ("Your Inbox. Our Intelligence. Your Tasks.").
Sign in with Google → fetch real Gmail → AI-extract tasks/meetings/deadlines → manage tasks → calendar view.
NO dummy data anywhere; emails fetched live (not persisted); only tasks + preferences in DB.
Tagline + logo + "Google only, skip Microsoft" specified by user.

## Architecture
- **Backend**: FastAPI + Motor (Mongo) — Java not supported in this env.
  - `auth.py` — Google OAuth 2.0 flow + session tokens (stored in `db.sessions`, 7-day TTL).
  - `gmail_service.py` — Gmail API list/get + plain-text/HTML body extraction + classification (important/normal/spam).
  - `ai_service.py` — Claude Sonnet 4.5 via Emergent Universal LLM key for `summarize_email` + `extract_tasks` (strict JSON).
  - `server.py` — REST routes under `/api/*`.
- **Frontend**: React 19 + Tailwind + shadcn + Sonner.
  - Manrope (UI) + JetBrains Mono (data). Dark default + light/dark toggle.
  - Edge-to-edge bento dashboard: sidebar / email list / email detail / tasks+calendar.
- **DB collections**: `users`, `tokens`, `sessions`, `tasks`, `summaries`, `preferences`, `oauth_states`.

## Implemented (Feb 2026)
- Google OAuth login, profile + tokens stored, session token returned to frontend.
- Logout terminates session and redirects to `/login`.
- Time-based dynamic greeting (Morning / Afternoon / Evening, Name).
- Live Gmail fetch (40 messages) with auto-poll every 60 s.
- Email classification (important / normal / spam) by keywords + Gmail labels.
- Email detail view with **Quick Summary** (Claude) and **Convert to Task** (extract structured tasks).
- Task CRUD, mark complete, priority, deadline, type (task/meeting/deadline), source-email link.
- Calendar grid with deadline dots + upcoming list.
- Stats (Total / Pending / Completed) in header.
- 1-hour-before-deadline toast notifications (every minute scan, deduped via sessionStorage).
- Light/Dark theme toggle persisted to localStorage.
- Logo + branding "Syncra AI" everywhere; no "Made with Emergent" in source code (the badge in preview is platform-injected and disappears on prod deploy).

## User personas
- Knowledge worker drowning in email who needs the inbox to "do work for them".

## Backlog (P1 / P2)
- P1: Webhook/push (Gmail Pub/Sub) for real-time replacing 60s polling.
- P1: Calendar event creation back to Google Calendar.
- P1: Customizable reminder frequency in Settings UI (backend already accepts `reminder_minutes`).
- P2: Microsoft Graph (Outlook) provider parity.
- P2: Per-task email-thread deep-link.
- P2: Bulk "Convert all important to tasks" action.
- P2: After-deadline "Did you complete this?" prompt.

## Next tasks
- Wire reminder_minutes preference to UI controls.
- Implement post-deadline completion prompt on dashboard load.
