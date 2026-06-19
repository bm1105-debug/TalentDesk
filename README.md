# TalentDesk

An ATS + CRM platform built for HR consulting firms — managing clients, candidates, jobs, submittals, interviews, and offers in a single application.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 4.2, Django REST Framework, SimpleJWT |
| Database | PostgreSQL |
| Frontend | React 18, Vite 8, TypeScript |
| UI | Tailwind CSS v4, Shadcn/ui, Radix UI |
| Data fetching | TanStack Query v5 |
| Routing | React Router v7 |
| Forms | React Hook Form + Zod |
| Drag and drop | @dnd-kit/core |

## Project Structure

```
TalentDesk/
├── backend/
│   ├── activity/          # Audit log
│   ├── attachments/       # CV upload, parse, download
│   ├── candidates/        # Candidate profiles, bulk status, duplicate detection
│   ├── clients/           # Client companies
│   ├── communications/    # Email templates and sent emails
│   ├── cvgen/             # CV document generation
│   ├── dashboard/         # My Day, Analytics, Scorecard endpoints
│   ├── interviews/        # Interview scheduling and scoring
│   ├── jobs/              # Job postings, pipeline stages
│   ├── notifications/     # In-app notification bell
│   ├── offers/            # Offer management (accept / decline / withdraw)
│   ├── search/            # Full-text + boolean search across jobs and candidates
│   ├── submittals/        # Candidate-to-job pipeline, stage advancement
│   ├── tasks/             # Task CRUD with due-today notifications
│   ├── users/             # Auth, roles, password change
│   └── talentdesk/        # Django project settings + URL root
└── frontend/
    └── src/
        ├── api/           # Axios client with JWT interceptor
        ├── components/    # Layout, CommandBar, NotificationBell, InitialsAvatar, etc.
        ├── context/       # AuthContext (JWT + role)
        ├── lib/           # Utilities (cn, etc.)
        └── pages/         # One file per route
```

## Roles

| Role | Permissions |
|------|-------------|
| `recruiter` | Own jobs/submittals/interviews; read clients and candidates |
| `team_lead` | All recruiter permissions + team-wide view |
| `account_manager` | All data; approve offers; access audit log |
| `ceo` | Full read/write across the platform |

## Setup

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Create `.env` in `backend/`:

```
SECRET_KEY=your-secret-key
DEBUG=True
DATABASE_URL=postgres://user:password@localhost:5432/talentdesk
```

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API calls to `http://localhost:8000`.

## Authentication

SimpleJWT — obtain tokens at:

```
POST /api/token/          # { username, password } → { access, refresh }
POST /api/token/refresh/  # { refresh } → { access }
```

All other endpoints require `Authorization: Bearer <access>`.

## Running Tests

```bash
cd backend
python manage.py test
```

| App | Tests |
|-----|-------|
| users | 7 |
| clients | 9 |
| candidates | 29 |
| jobs | 22 |
| submittals | 37 |
| activity | 17 |
| dashboard | 56 |
| search | 20 |
| interviews | 17 |
| communications | 20 |
| cvgen | 14 |
| attachments | 13 |
| offers | 18 |
| tasks | 14 |
| boolean_parser | 16 |

## Key Features

- **Recruiting pipeline** — submittals move through custom pipeline stages per job; shortlist flag, match score, and rejection email prompt on close
- **Candidate management** — duplicate detection on create, bulk status update, last-contacted indicator, boolean/advanced search
- **Kanban view** — drag-and-drop pipeline board on the Job Detail page (optimistic UI with rollback)
- **Command Bar** — Ctrl+K global search across jobs and candidates with keyboard navigation and recent history
- **Dashboard** — personalised My Day view with KPI cards, trend indicators, urgent/overdue jobs, stale submittals, and pending offers
- **Analytics** — candidate pool, source effectiveness, pipeline funnel, interview outcomes, recruiter leaderboard, time-to-fill
- **Offer management** — accept/decline/withdraw with automatic placement on accept
- **Document generation** — PDF and DOCX CV download from candidate detail page
- **Notifications** — in-app bell with unread badge, polled every 30 s
- **Task management** — personal task list with due-today notifications via management command
- **Audit log** — full activity history (manager-only)

## Management Commands

```bash
# Send notifications for tasks due today (run via cron / scheduler)
python manage.py notify_due_tasks
```
