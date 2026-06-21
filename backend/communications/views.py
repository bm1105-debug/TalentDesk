import re
import requests as http_requests

from django.conf import settings

from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response

from .models import GeneratedEmail
from .serializers import GenerateEmailSerializer, GeneratedEmailSerializer
from users.permissions import IsRecruiterOrAbove


# ── Groq helpers ──────────────────────────────────────────────────────────────

_GROQ_SYSTEM_PROMPT = """You are an expert business communications and recruitment email assistant.

Your role is to write professional, human-sounding emails for recruiters, staffing firms, hiring managers, and business professionals.

Rules:
1. Always generate a compelling subject line and a complete email body.
2. The email must sound like it was written by a real person — clear, concise, and professional.
3. Include all provided key points naturally.
4. Address the recipient using their name exactly as provided. If a title (Dr., Prof., etc.) is already included, use it as-is. Do not add titles like Mr./Ms. or shorten to last name only unless explicitly provided.
5. Match the requested tone exactly.
6. Avoid clichés: "I hope this email finds you well", "Trust you are doing great", "Hope you're having a wonderful day".
7. Avoid unnecessary filler text and generic AI-sounding language.
8. Never use markdown formatting — no bold, no bullet points, no asterisks, no headers inside the email body.
9. If information is incomplete — use neutral wording. Never invent facts, dates, links, or commitments.

Length requirements:
- Concise: 3-4 short sentences only.
- Standard: 1-2 short paragraphs.
- Detailed: Multiple well-structured paragraphs with context.

Tone requirements:
- Professional: Businesslike and respectful.
- Friendly: Warm and approachable.
- Formal: Corporate and polished, no contractions.
- Assertive: Direct, confident, and action-oriented.

Return output ONLY in this format:
Subject: <subject line>

Email: <email body>"""

_TOKEN_LIMITS = {"Concise": 200, "Standard": 500, "Detailed": 900}


def _call_groq(messages: list, max_tokens: int = 500) -> str:
    response = http_requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": "llama-3.1-8b-instant",
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": max_tokens,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def _parse_email(text: str) -> tuple:
    subject_match = re.search(r"Subject:\s*(.+)", text, re.IGNORECASE)
    body_match    = re.search(r"Email:\s*([\s\S]+)", text, re.IGNORECASE)
    subject = subject_match.group(1).strip() if subject_match else ""
    body    = body_match.group(1).strip()    if body_match    else text
    body    = re.sub(r"^Subject:\s*.+\n?", "", body, flags=re.IGNORECASE).strip()
    return subject, body


def _build_user_prompt(purpose: str, recipient: str, keypoints: str, tone: str, length: str) -> str:
    return (
        f"Generate a business email using the following information:\n\n"
        f"Purpose:\n{purpose}\n\n"
        f"Recipient Name & Designation:\n{recipient}\n\n"
        f"Key Points:\n{keypoints}\n\n"
        f"Tone:\n{tone}\n\n"
        f"Length:\n{length}\n\n"
        "Requirements:\n"
        "- Include every key point naturally.\n"
        "- Match the selected tone.\n"
        "- Follow the selected length.\n"
        "- Make the email sound authentic and written by a human.\n"
        "- Create a relevant and professional subject line."
    )


def _trim_history(user) -> None:
    old_ids = list(
        GeneratedEmail.objects.filter(user=user)
        .order_by("-created_at")
        .values_list("id", flat=True)[10:]
    )
    if old_ids:
        GeneratedEmail.objects.filter(id__in=old_ids).delete()


# ── Views ─────────────────────────────────────────────────────────────────────

class GenerateEmailView(APIView):
    """
    POST /api/communications/ai-generate/
    Proxies the Groq API server-side (key never exposed to browser).
    Supports single and bulk modes. Saves to per-user history (max 10).
    """
    permission_classes = [IsRecruiterOrAbove]

    def post(self, request):
        serializer = GenerateEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        mode         = data["mode"]
        purpose      = data["purpose"]
        keypoints    = data["keypoints"]
        tone         = data["tone"]
        length       = data["length"]
        max_tokens   = _TOKEN_LIMITS.get(length, 500)
        save_history = data.get("save_history", True)

        if mode == "bulk" and not data["recipients"]:
            return Response({"error": "No recipients provided."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if mode == "single":
                return self._generate_single(request.user, data, purpose, keypoints, tone, length, max_tokens, save_history)
            else:
                return self._generate_bulk(request.user, data, purpose, keypoints, tone, length, max_tokens)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)

    def _generate_single(self, user, data, purpose, keypoints, tone, length, max_tokens, save_history=True):
        recipient          = data["recipient"]
        refine_instruction = data["refine_instruction"]
        previous_email     = data["previous_email"]

        if refine_instruction and previous_email:
            user_prompt = (
                f"The previous email needs refinement.\n\n"
                f"Refinement Request:\n{refine_instruction}\n\n"
                f"Keep:\n- Same purpose: {purpose}\n"
                f"- Same recipient: {recipient}\n"
                f"- Same key information: {keypoints}\n\n"
                "Improve the email according to the refinement request while maintaining professionalism.\n"
                "Return a completely revised version, not minor wording changes."
            )
            messages = [
                {"role": "system",    "content": _GROQ_SYSTEM_PROMPT},
                {"role": "assistant", "content": previous_email},
                {"role": "user",      "content": user_prompt},
            ]
        else:
            messages = [
                {"role": "system", "content": _GROQ_SYSTEM_PROMPT},
                {"role": "user",   "content": _build_user_prompt(purpose, recipient, keypoints, tone, length)},
            ]

        email_text    = _call_groq(messages, max_tokens)
        subject, body = _parse_email(email_text)

        response_data: dict = {"mode": "single", "subject": subject, "body": body}

        if save_history:
            record = GeneratedEmail.objects.create(
                user=user, mode="single", purpose=purpose,
                tone=tone, length=length, recipient=recipient,
                subject=subject, body=body,
            )
            _trim_history(user)
            response_data["id"]         = record.id
            response_data["created_at"] = record.created_at

        return Response(response_data)

    def _generate_bulk(self, user, data, purpose, keypoints, tone, length, max_tokens):
        bulk_results = []
        for recipient in data["recipients"]:
            messages = [
                {"role": "system", "content": _GROQ_SYSTEM_PROMPT},
                {"role": "user",   "content": _build_user_prompt(purpose, recipient, keypoints, tone, length)},
            ]
            email_text    = _call_groq(messages, max_tokens)
            subject, body = _parse_email(email_text)
            bulk_results.append({"recipient": recipient, "subject": subject, "body": body, "error": None})

        record = GeneratedEmail.objects.create(
            user=user, mode="bulk", purpose=purpose,
            tone=tone, length=length, bulk_results=bulk_results,
        )
        _trim_history(user)

        return Response({
            "id": record.id, "mode": "bulk",
            "bulk_results": bulk_results,
            "created_at": record.created_at,
        })


class EmailHistoryView(APIView):
    """
    GET    /api/communications/ai-history/ — last 10 generated emails for current user
    DELETE /api/communications/ai-history/ — wipe all history for current user
    """
    permission_classes = [IsRecruiterOrAbove]

    def get(self, request):
        history = GeneratedEmail.objects.filter(user=request.user).order_by("-created_at")[:10]
        return Response(GeneratedEmailSerializer(history, many=True).data)

    def delete(self, request):
        GeneratedEmail.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
