from typing import Dict, List, Optional

import requests

from .config import settings


class LLMError(RuntimeError):
    pass


def llm_chat(messages: List[Dict[str, str]]) -> str:
    """
    Calls local Ollama chat endpoint.
    messages: [{"role": "system"|"user"|"assistant", "content": "..."}]
    """
    url = f"{settings.OLLAMA_URL}/api/chat"
    payload = {
        "model": settings.OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": 0.5,
            "num_predict": 120,
        },
    }

    try:
        r = requests.post(url, json=payload, timeout=600)
        if r.status_code != 200:
            raise LLMError(f"Ollama HTTP {r.status_code}: {r.text[:500]}")
        data = r.json()
        content = (data.get("message") or {}).get("content")
        if not content:
            raise LLMError(f"Ollama returned empty content: {data}")
        return content.strip()
    except requests.RequestException as e:
        raise LLMError(f"Ollama request failed: {e}")


def simple_fallback_reply(
    pred_label: Optional[str],
    baseline_ready: bool,
    user_text: Optional[str] = None,
    stress_label: Optional[int] = None,
) -> str:
    """
    Fallback if Ollama is down. Keeps the pipeline testable.
    """
    text = (user_text or "").strip().lower()

    if stress_label == 1 or "stress" in text or "not feeling" in text:
        return (
            "I hear you. Let's slow this down for a moment: take one easy breath, unclench your jaw, "
            "and tell me what feels heaviest right now."
        )

    if not baseline_ready:
        return "I'm here with you. Before we go deeper, are you feeling more stressed, tired, or overwhelmed?"

    if pred_label == "High":
        return (
            "Okay, let's keep this very small. Breathe in for 4 seconds, out for 6 seconds, three times. "
            "Then tell me the next single step you can do in 5 minutes."
        )
    if pred_label == "Medium":
        return "Let's simplify this. What is the hardest part right now, and what needs your attention first?"
    return "I'm with you. Tell me what's going on, and what you've already tried so far."
