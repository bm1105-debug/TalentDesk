import re
import io

SECTION_RE = re.compile(
    r'^(summary|objective|profile|experience|work\s+history|education|skill|technical|'
    r'certification|project|award|language|reference|publication|interest|contact)',
    re.IGNORECASE,
)


def _extract_text_pdf(raw_bytes):
    from pdfminer.high_level import extract_text
    return extract_text(io.BytesIO(raw_bytes)) or ''


def _extract_text_docx(raw_bytes):
    from docx import Document
    doc = Document(io.BytesIO(raw_bytes))
    return '\n'.join(p.text for p in doc.paragraphs)


def _get_text(file_obj, filename):
    name = filename.lower()
    raw = file_obj.read()
    if name.endswith('.pdf'):
        return _extract_text_pdf(raw)
    if name.endswith('.docx'):
        return _extract_text_docx(raw)
    if name.endswith('.txt'):
        return raw.decode('utf-8', errors='ignore')
    return None


def _extract_email(text):
    m = re.search(r'[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}', text)
    return m.group(0) if m else ''


def _extract_phone(text):
    for m in re.finditer(r'(\+?[\d][\d\s\-().]{5,17}[\d])', text):
        candidate = m.group(0).strip()
        digits = re.sub(r'\D', '', candidate)
        if 7 <= len(digits) <= 15:
            return candidate
    return ''


def _extract_name(lines):
    skip = {'resume', 'cv', 'curriculum vitae', 'curriculum', 'vitae'}
    for line in lines[:8]:
        if not line or line.lower() in skip:
            continue
        if SECTION_RE.match(line):
            continue
        words = line.split()
        if 2 <= len(words) <= 4 and all(re.match(r"^[A-Z][a-zA-Z\-'\.]{1,}$", w) for w in words):
            return line
    return ''


def _extract_title(text, name_line):
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    past_name = not name_line
    for line in lines[:12]:
        if line == name_line:
            past_name = True
            continue
        if past_name:
            if (len(line.split()) <= 8
                    and not SECTION_RE.match(line)
                    and not re.search(r'[@\d]', line)
                    and len(line) > 3):
                return line
            break
    m = re.search(r'(?i)(?:title|position|role)[:\s]+([^\n]+)', text)
    return m.group(1).strip() if m else ''


def parse_resume(file_obj, filename):
    """
    Parse a resume file and return extracted fields.
    Returns a dict with: first_name, last_name, email, phone, current_title.
    All values default to '' on extraction failure — never raises.
    """
    try:
        text = _get_text(file_obj, filename)
    except Exception as exc:
        return {'error': f'Could not read file: {exc}'}

    if text is None:
        return {'error': 'Unsupported file type. Upload a PDF, DOCX, or TXT file.'}

    lines = [l.strip() for l in text.split('\n') if l.strip()]
    name = _extract_name(lines)

    first_name, last_name = '', ''
    if name:
        parts = name.split()
        first_name = parts[0]
        last_name = ' '.join(parts[1:])

    return {
        'first_name':    first_name,
        'last_name':     last_name,
        'email':         _extract_email(text),
        'phone':         _extract_phone(text),
        'current_title': _extract_title(text, name),
        'preview':       text[:500].strip(),
    }
