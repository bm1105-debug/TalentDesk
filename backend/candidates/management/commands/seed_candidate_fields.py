import random
from django.core.management.base import BaseCommand
from candidates.models import Candidate

EDUCATION_BY_ROLE = {
    'engineer': [
        'B.Tech Computer Science, IIT Delhi',
        'B.Tech Information Technology, NIT Trichy',
        'B.E. Computer Engineering, BITS Pilani',
        'M.Tech Software Engineering, IIT Bombay',
        'B.Tech CSE, VIT Vellore',
        'M.S. Computer Science, IIIT Hyderabad',
        'B.E. Electronics & Communication, IIT Madras',
    ],
    'analyst': [
        'B.Com (Hons), Delhi University',
        'BBA Finance, Symbiosis Institute',
        'MBA Business Analytics, IIM Ahmedabad',
        'B.Tech CSE, Anna University',
        'M.Sc Statistics, Pune University',
        'MBA Operations, IIM Calcutta',
    ],
    'manager': [
        'MBA General Management, IIM Bangalore',
        'B.Tech + MBA, IIT Kharagpur',
        'PGDM Marketing, XLRI Jamshedpur',
        'MBA HR, Tata Institute of Social Sciences',
        'B.Com + MBA, Symbiosis Institute of Management',
    ],
    'designer': [
        'B.Des Visual Communication, NID Ahmedabad',
        'B.Tech + M.Des, IIT Bombay',
        'Diploma in UX Design, NIFT',
        'B.Sc Multimedia, Amity University',
    ],
    'default': [
        'B.Tech Computer Science, Anna University',
        'B.Sc Information Technology, Mumbai University',
        'BCA, Delhi University',
        'M.Sc Computer Science, Hyderabad University',
        'B.Tech ECE, SRM University',
        'B.E. Mechanical Engineering, COEP Pune',
        'MBA, Bangalore University',
    ],
}

NOTICE_PERIODS = [0, 15, 30, 45, 60, 90]
NOTICE_WEIGHTS  = [5,  10, 45, 10, 20, 10]

# CTC ranges in LPA keyed roughly by seniority tier
CTC_BANDS = [
    (2.0,  6.0),   # junior / 0-2 yrs
    (5.0, 12.0),   # mid / 2-5 yrs
    (10.0, 22.0),  # senior / 5-10 yrs
    (18.0, 40.0),  # lead/principal / 10+ yrs
]

LOCATIONS = [
    'Bangalore, Karnataka',
    'Mumbai, Maharashtra',
    'Hyderabad, Telangana',
    'Pune, Maharashtra',
    'Chennai, Tamil Nadu',
    'Delhi, NCR',
    'Noida, Uttar Pradesh',
    'Gurgaon, Haryana',
    'Kolkata, West Bengal',
    'Ahmedabad, Gujarat',
]


def _pick_education(title: str) -> str:
    title_lower = title.lower()
    if any(k in title_lower for k in ('engineer', 'developer', 'architect', 'devops', 'sre', 'backend', 'frontend', 'fullstack')):
        pool = EDUCATION_BY_ROLE['engineer']
    elif any(k in title_lower for k in ('analyst', 'data', 'scientist', 'bi', 'reporting')):
        pool = EDUCATION_BY_ROLE['analyst']
    elif any(k in title_lower for k in ('manager', 'lead', 'head', 'director', 'vp', 'scrum', 'product')):
        pool = EDUCATION_BY_ROLE['manager']
    elif any(k in title_lower for k in ('design', 'ux', 'ui')):
        pool = EDUCATION_BY_ROLE['designer']
    else:
        pool = EDUCATION_BY_ROLE['default']
    return random.choice(pool)


def _pick_ctc_band(yoe: int) -> tuple[float, float]:
    if yoe <= 2:
        return CTC_BANDS[0]
    elif yoe <= 5:
        return CTC_BANDS[1]
    elif yoe <= 10:
        return CTC_BANDS[2]
    return CTC_BANDS[3]


class Command(BaseCommand):
    help = 'Back-fill missing candidate fields: education, CTC, notice period, experience, location'

    def handle(self, *args, **options):
        candidates = Candidate.objects.all()
        updated = 0

        for c in candidates:
            changed = False

            if c.years_of_experience is None:
                c.years_of_experience = random.randint(0, 15)
                changed = True

            yoe = c.years_of_experience

            if not c.education:
                c.education = _pick_education(c.current_title or '')
                changed = True

            if c.current_ctc is None:
                lo, hi = _pick_ctc_band(yoe)
                c.current_ctc = round(random.uniform(lo, hi), 2)
                changed = True

            if c.expected_ctc is None:
                hike = random.uniform(1.15, 1.45)
                c.expected_ctc = round(float(c.current_ctc) * hike, 2)
                changed = True

            if c.notice_period_days is None:
                c.notice_period_days = random.choices(NOTICE_PERIODS, weights=NOTICE_WEIGHTS)[0]
                changed = True

            if not c.location:
                c.location = random.choice(LOCATIONS)
                changed = True

            if changed:
                c.save(update_fields=[
                    'years_of_experience', 'education',
                    'current_ctc', 'expected_ctc',
                    'notice_period_days', 'location',
                ])
                updated += 1

        self.stdout.write(self.style.SUCCESS(f'Updated {updated} candidates.'))
