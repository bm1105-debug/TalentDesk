# TalentDesk

A production-grade ATS + recruitment CRM for HR consulting firms — managing clients, candidates, jobs, submittals, interviews, and offers in a single application.

**Live:** https://www.companylens.online  
**API:** https://talentdesk-backend.onrender.com

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 4.2, Django REST Framework 3.17, SimpleJWT |
| Database | PostgreSQL |
| Frontend | React 18, Vite 8, TypeScript (strict) |
| UI | Tailwind CSS v4, Shadcn/ui, Radix UI |
| Data fetching | TanStack Query v5 |
| Routing | React Router v7 |
| Forms | React Hook Form + Zod |
| Drag and drop | @dnd-kit/core |
| AI | Groq API (email generation) |

---

## Project Structure

```
TalentDesk/
├── backend/
│   ├── activity/          # Async audit log middleware
│   ├── attachments/       # CV upload, parse (PDF/DOCX/TXT), download
│   ├── candidates/        # Profiles, duplicate detection, bulk status
│   ├── clients/           # Client companies and contacts
│   ├── communications/    # Groq-powered AI email generator (single + bulk)
│   ├── cvgen/             # PDF and DOCX CV generation
│   ├── dashboard/         # My Day, Analytics, Scorecard, Conversion Funnel
│   ├── interviews/        # Scheduling, scoring, calendar view
│   ├── jobs/              # Job postings, pipeline stages
│   ├── notifications/     # In-app notification bell
│   ├── offers/            # Offer lifecycle (accept / decline / withdraw)
│   ├── search/            # Full-text + boolean AND/OR/NOT search
│   ├── submittals/        # Candidate-to-job pipeline, stage advancement
│   ├── tasks/             # Task CRUD with due-today notifications
│   ├── users/             # Auth, RBAC, password change, org chart
│   └── config/            # Django settings and URL root
└── frontend/
    └── src/
        ├── api/           # Axios client with JWT interceptor + refresh
        ├── components/    # Layout, CommandBar, NotificationBell, StatusBadge, etc.
        ├── context/       # AuthContext (JWT + role)
        ├── lib/           # Utilities (cn, timeAgo)
        └── pages/         # One file per route
```

---

## Roles

| Role | Level | Permissions |
|------|-------|-------------|
| `recruiter` | 1 | Own pipeline, candidates, interviews, scorecard |
| `team_lead` | 2 | Player-coach: own caseload + pod of direct reports |
| `vp` | 3 | Full admin — all data, users, analytics, audit log |
| `ceo` | 4 | Same as VP |

VP and CEO are functionally identical. Team Leads manage recruiters via the `reports_to` FK.

---

## Local Setup

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

Create `backend/.env`:

```env
SECRET_KEY=your-secret-key
DEBUG=True
DATABASE_URL=postgres://user:password@localhost:5432/talentdesk
GROQ_API_KEY=your-groq-api-key
```

```bash
python manage.py migrate
python manage.py seed          # creates demo users + sample data
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`, proxies API calls to `http://localhost:8000`.

---

## Demo Credentials

| Username | Role | Password |
|----------|------|----------|
| `admin` | CEO | `TalentDesk@2024` |
| `vp.sharma` | VP | `TalentDesk@2024` |
| `team_lead_1` … `team_lead_5` | Team Lead | `TalentDesk@2024` |
| `recruiter_1_1` … `recruiter_5_5` | Recruiter | `TalentDesk@2024` |

---

## Authentication

```
POST /api/users/token/            # { username, password } → { access, refresh }
POST /api/users/token/refresh/    # { refresh } → { access }
POST /api/users/token/blacklist/  # { refresh } → blacklists token on logout
```

- Access token lifetime: 15 minutes
- Refresh token lifetime: 7 days (rotated on use)
- Login rate limited: 5 attempts/minute

All other endpoints require `Authorization: Bearer <access>`.

---

## Running Tests

```bash
cd backend
python manage.py test --keepdb
```

458 tests across 15 apps:

| App | Tests |
|-----|-------|
| users | 42 |
| clients | 9 |
| candidates | 29 |
| jobs | 22 |
| submittals | 37 |
| activity | 17 |
| dashboard | 106 |
| search | 20 |
| interviews | 17 |
| communications | 14 |
| cvgen | 14 |
| attachments | 13 |
| offers | 18 |
| tasks | 19 |
| boolean_parser | 16 (SimpleTestCase) |
| notifications | (covered in integration tests) |

---

## Key Features

- **Recruiting pipeline** — submittals move through 8-stage pipeline per job; shortlist flag, match score (skills + salary), rejection email prompt on close
- **Candidate management** — duplicate detection on create (409), bulk status update, last-contacted indicator, boolean AND/OR/NOT search
- **Kanban view** — drag-and-drop pipeline board on Job Detail (optimistic UI with rollback)
- **Command Bar** — Ctrl+K global search with keyboard navigation and localStorage recents
- **Dashboard** — personalised My Day: KPI strip, conversion funnel, today's schedule, upcoming deadlines, task panel
- **Analytics** — candidate pool, source effectiveness, pipeline funnel, interview outcomes, recruiter leaderboard
- **People page** — VP/CEO see full org; Team Leads see pod; per-recruiter analytics drill-down; org chart
- **AI Email Generator** — Groq-powered single and bulk email generation with tone/length controls, history sidebar
- **Offer management** — accept/decline/withdraw; accept auto-places candidate to terminal pipeline stage
- **Document generation** — PDF and DOCX CV download from candidate detail
- **Resume parsing** — PDF/DOCX/TXT parsed server-side; auto-fills candidate form
- **Notifications** — in-app bell with unread badge, 30s polling, mark-read
- **Task management** — personal task list with due-today notifications
- **Audit log** — full activity history with async background writes (Team Lead+)
- **Mobile responsive** — tested at 390px (iPhone 14)

---

## Management Commands

```bash
# Seed demo users and sample data
python manage.py seed

# Send in-app notifications for tasks due today (run via cron)
python manage.py notify_due_tasks
```

---

## Infrastructure

| Service | Provider |
|---------|---------|
| Frontend | Render (static site) |
| Backend | Render (web service) |
| Database | Render PostgreSQL |
| DNS + SSL | Cloudflare |
| Uptime monitoring | UptimeRobot → `GET /health/` every 5 min |

The `/health/` endpoint returns `{"status": "ok"}` with no auth required. UptimeRobot pings it every 5 minutes to prevent the free-tier web service from spinning down.
