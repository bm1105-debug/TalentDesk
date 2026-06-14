# TalentDesk

A full-stack Applicant Tracking System (ATS) and Recruitment CRM built for HR consulting firms. Replaces spreadsheets and WhatsApp with a unified platform for managing candidates, jobs, clients, and the full recruitment pipeline.

## Tech Stack

**Backend**
- Python 3.11 + Django 4.2 + Django REST Framework
- PostgreSQL
- SimpleJWT (authentication)
- xhtml2pdf + python-docx (CV export)

**Frontend**
- React 18 + Vite + TypeScript
- Tailwind CSS v4
- TanStack Query v5
- React Router v7
- React Hook Form + Zod

## Features

| Module | Description |
|--------|-------------|
| **Candidates** | Manage candidate profiles, skills, status, and source tracking |
| **Jobs** | Job requisitions with pipeline stages, priority, and recruiter assignment |
| **Submittals** | Submit candidates to jobs, advance pipeline stages, append notes |
| **Interviews** | Schedule and track interviews with status updates |
| **Communications** | Email templates with variable rendering, send and audit log |
| **CV Export** | Generate candidate CVs as PDF or DOCX |
| **Search** | Unified full-text search across candidates, jobs, and clients |
| **Dashboard** | "My Day" view — urgent jobs, overdue roles, stale submittals |

## Project Structure

```
TalentDesk/
├── backend/                  # Django project
│   ├── config/               # Settings, URLs, WSGI
│   ├── users/                # Auth, roles, permissions
│   ├── clients/              # Client companies and contacts
│   ├── candidates/           # Candidate profiles and skills
│   ├── jobs/                 # Job requisitions and pipeline stages
│   ├── submittals/           # Candidate-to-job submissions
│   ├── interviews/           # Interview scheduling
│   ├── communications/       # Email templates and send log
│   ├── cvgen/                # PDF and DOCX CV generation
│   ├── search/               # Unified full-text search
│   ├── activity/             # Auto activity logging middleware
│   └── dashboard/            # My Day aggregation endpoint
└── frontend/                 # React + Vite app
    └── src/
        ├── pages/            # One file per page
        ├── components/       # Layout, ProtectedRoute, UI primitives
        ├── api/              # Axios client with JWT interceptor
        └── context/          # Auth context
```

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

### Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Create a .env file
cp .env.example .env
# Edit .env and fill in SECRET_KEY and DATABASE_URL

# Run migrations
python manage.py migrate

# Seed with 100 test records
python manage.py seed

# Start the server
python manage.py runserver
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

> Vite proxies all `/api/*` requests to `http://localhost:8000` automatically.

### Default Login Credentials (after seeding)

| Username | Password | Role |
|----------|----------|------|
| `ceo` | `pass1234` | CEO |
| `manager1` | `pass1234` | Account Manager |
| `recruiter1` | `pass1234` | Recruiter |
| `recruiter2` | `pass1234` | Recruiter |

## Running Tests

```bash
cd backend
python manage.py test
```

171 tests across all apps.

## Role Permissions

| Action | Recruiter | Account Manager | CEO |
|--------|-----------|-----------------|-----|
| View candidates / jobs / submittals | ✓ | ✓ | ✓ |
| Create candidates / submittals | ✓ | ✓ | ✓ |
| Create / edit jobs | | ✓ | ✓ |
| Delete candidates | | ✓ | ✓ |
| Access email audit log | | ✓ | ✓ |
| Create users | | | ✓ |

## Environment Variables

Create `backend/.env`:

```env
SECRET_KEY=your-secret-key-here
DEBUG=True
DATABASE_URL=postgres://user:password@localhost:5432/talentdesk
ALLOWED_HOSTS=localhost,127.0.0.1
DEFAULT_FROM_EMAIL=noreply@talentdesk.io
```
