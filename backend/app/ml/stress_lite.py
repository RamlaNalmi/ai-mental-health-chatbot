"""
Lightweight stress signal for /chat without TensorFlow, BERT downloads, Neo4j, or extra model files.
"""

from __future__ import annotations

import re
from typing import Any, Dict

_STRESS_RE = re.compile(
    r"\b(stress|stressed|anxious|anxiety|worried|worry|panic|overwhelmed|depressed|hopeless|burnout)\b",
    re.I,
)


def stress_from_text(text: str) -> Dict[str, Any]:
    """Returns the same keys chat_message expects from the heavy pipeline."""
    label = 1 if _STRESS_RE.search(text or "") else 0
    return {
        "text": text,
        "stress_label": label,
        "confidence": 0.6 if label else 0.4,
        "kg_result": {},
    }
