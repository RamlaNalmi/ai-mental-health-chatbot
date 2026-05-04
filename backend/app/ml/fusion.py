"""
ml/fusion.py — Multi-Modal Stress Fusion Engine

Combines 4 signals into one unified stress score:
  1. Text stress       (BERT + XGBoost)         → 0.0–1.0
  2. Voice stress      (Librosa + Keras)         → 0.0–1.0
  3. Face stress       (OpenCV + Keras webcam)   → no_stress/low/moderate/high
  4. Heart rate        (Arduino BPM)             → rest/normal/elevated/high
  5. Cognitive load    (Typing features + ML)    → Low/Medium/High

Fusion strategy:
  - Weighted average of available signals (missing signals are skipped gracefully)
  - Confidence-weighted: high-confidence signals get more influence
  - Output: unified score 0.0–1.0, label, per-signal breakdown, recommendations
"""

from dataclasses import dataclass, field, asdict
from typing import Optional
import time


# ─────────────────────────────────────────────
# SIGNAL WEIGHTS
# These must sum to 1.0 when all signals present.
# Adjusted dynamically when signals are missing.
# ─────────────────────────────────────────────
BASE_WEIGHTS = {
    "text":     0.30,   # Most reliable — always available in chat
    "voice":    0.25,   # Strong signal — only when audio sent
    "face":     0.25,   # Strong signal — only when camera running
    "heart":    0.15,   # Physiological — only when Arduino connected
    "cognitive":0.05,   # Typing patterns — supplementary
}

# How each face level maps to a 0–1 score
FACE_LEVEL_SCORES = {
    "no_stress": 0.0,
    "low":       0.35,
    "moderate":  0.65,
    "high":      1.0,
    "unknown":   None,   # treated as missing
}

# How each BPM zone maps to a 0–1 score
BPM_ZONE_SCORES = {
    "rest":     0.1,
    "normal":   0.2,
    "elevated": 0.65,
    "high":     1.0,
    "unknown":  None,   # treated as missing
}

# How cognitive load maps to a 0–1 score
COGNITIVE_SCORES = {
    "Low":    0.1,
    "Medium": 0.5,
    "High":   0.9,
}

# Final fused score → label thresholds
FUSED_THRESHOLDS = {
    "high":     0.70,
    "moderate": 0.45,
    "low":      0.20,
    # below 0.20 → no_stress
}


# ─────────────────────────────────────────────
# DATA CLASSES
# ─────────────────────────────────────────────
@dataclass
class SignalInput:
    """
    All raw signals going INTO fusion.
    All fields are optional — fusion handles missing signals gracefully.
    """
    # Text signal (from BERT + XGBoost)
    text_stress_label: Optional[int] = None        # 0 or 1
    text_confidence: Optional[float] = None        # 0.0–1.0

    # Voice signal (from Librosa + Keras)
    voice_score: Optional[float] = None            # 0.0–1.0
    voice_available: bool = False

    # Face signal (from webcam ML model)F
    face_stress_level: Optional[str] = None        # "no_stress"|"low"|"moderate"|"high"
    face_running: bool = False

    # Heart rate signal (from Arduino)
    bpm: Optional[float] = None
    bpm_zone: Optional[str] = None                 # "rest"|"normal"|"elevated"|"high"
    heart_available: bool = False

    # Cognitive load (from typing features)
    cognitive_label: Optional[str] = None          # "Low"|"Medium"|"High"
    cognitive_ready: bool = False

    # Knowledge graph context (passed through, not used in scoring)
    kg_result: Optional[dict] = None

    # Timestamp
    timestamp: str = field(default_factory=lambda: __import__('datetime').datetime.now().isoformat())


@dataclass
class SignalScore:
    """Normalised 0–1 score for a single signal, with metadata."""
    name: str
    raw_score: Optional[float]          # The 0–1 score before weighting
    weight_used: float                  # Actual weight after redistribution
    weighted_contribution: float        # raw_score × weight_used
    available: bool
    confidence: Optional[float] = None  # Signal's own confidence if known
    label: Optional[str] = None         # Human-readable label for this signal


@dataclass
class FusionResult:
    """
    The unified output returned to the API and frontend dashboard.
    """
    # ── Core output ───────────────────────────
    fused_score: float                  # 0.0–1.0 unified stress score
    fused_label: str                    # "no_stress"|"low"|"moderate"|"high"
    confidence: float                   # How confident we are (based on # signals)

    # ── Per-signal breakdown ──────────────────
    signals: dict                       # {signal_name: SignalScore as dict}
    signals_used: list                      # How many signals contributed
    signals_available: int              # How many were non-null

    # ── Context ───────────────────────────────
    kg_result: Optional[dict]           # Knowledge graph coping suggestions
    dominant_signal: str                # Which signal contributed most
    alert: bool                         # True if any individual signal is critical
    alert_reasons: list                 # Why alert was triggered

    # ── LLM prompt fragment ───────────────────
    llm_context: str                    # Ready-to-inject string for system prompt

    # ── Dashboard data ────────────────────────
    dashboard: dict                     # Structured for Expo frontend rendering

    # ── Timestamp ─────────────────────────────
    timestamp: str = field(default_factory=lambda: __import__('datetime').datetime.now().isoformat())


# ─────────────────────────────────────────────
# MAIN FUSION FUNCTION
# ─────────────────────────────────────────────
def fuse_signals(inp: SignalInput) -> FusionResult:
    """
    Core fusion engine. Call this on every chat message.

    Steps:
      1. Normalise each signal to 0–1
      2. Determine which signals are available
      3. Redistribute weights among available signals
      4. Compute weighted average
      5. Apply confidence weighting
      6. Classify fused score into label
      7. Build LLM context string
      8. Build dashboard payload
    """

    # ── Step 1: Normalise signals ─────────────
    raw: dict[str, Optional[float]] = {}
    confidences: dict[str, float] = {}
    labels: dict[str, str] = {}

    # Text
    if inp.text_stress_label is not None and inp.text_confidence is not None:
        # Convert binary label + confidence to a continuous score
        # label=1 (stressed): score = confidence
        # label=0 (not stressed): score = 1 - confidence
        raw["text"] = float(inp.text_confidence) if inp.text_stress_label == 1 else float(1.0 - inp.text_confidence)
        confidences["text"] = float(inp.text_confidence)
        labels["text"] = "Stressed" if inp.text_stress_label == 1 else "Not Stressed"
    else:
        raw["text"] = None

    # Voice
    if inp.voice_available and inp.voice_score is not None:
        raw["voice"] = float(max(0.0, min(1.0, inp.voice_score)))
        confidences["voice"] = 0.75   # voice model doesn't output its own confidence
        labels["voice"] = _score_to_label(raw["voice"])
    else:
        raw["voice"] = None

    # Face
    face_score = FACE_LEVEL_SCORES.get(inp.face_stress_level or "unknown")
    if inp.face_running and face_score is not None:
        raw["face"] = face_score
        confidences["face"] = 0.80
        labels["face"] = inp.face_stress_level or "unknown"
    else:
        raw["face"] = None

    # Heart rate
    bpm_score = BPM_ZONE_SCORES.get(inp.bpm_zone or "unknown")
    if inp.heart_available and bpm_score is not None:
        raw["heart"] = bpm_score
        confidences["heart"] = 0.85   # physiological signal — high confidence
        labels["heart"] = f"{inp.bpm_zone} ({inp.bpm:.0f} BPM)" if inp.bpm else inp.bpm_zone
    else:
        raw["heart"] = None

    # Cognitive load
    cog_score = COGNITIVE_SCORES.get(inp.cognitive_label) if inp.cognitive_ready else None
    if cog_score is not None:
        raw["cognitive"] = cog_score
        confidences["cognitive"] = 0.70
        labels["cognitive"] = inp.cognitive_label
    else:
        raw["cognitive"] = None

    # ── Step 2: Find available signals ────────
    available = {k: v for k, v in raw.items() if v is not None}
    n_available = len(available)

    if n_available == 0:
        # No signals at all — return neutral
        return _neutral_result(inp)

    # ── Step 3: Redistribute weights ──────────
    # Sum base weights of available signals, then normalise to 1.0
    total_base = sum(BASE_WEIGHTS[k] for k in available)
    adjusted_weights = {k: BASE_WEIGHTS[k] / total_base for k in available}

    # ── Step 4: Confidence-weighted average ───
    # Each signal's contribution = score × weight × confidence
    # Then normalise by sum of (weight × confidence)
    weighted_sum = 0.0
    weight_conf_sum = 0.0
    signal_scores: dict[str, SignalScore] = {}

    for name, score in available.items():
        conf = confidences.get(name, 0.75)
        w = adjusted_weights[name]
        effective_weight = w * conf
        contribution = score * effective_weight

        weighted_sum += contribution
        weight_conf_sum += effective_weight

        signal_scores[name] = SignalScore(
            name=name,
            raw_score=score,
            weight_used=w,
            weighted_contribution=contribution,
            available=True,
            confidence=conf,
            label=labels.get(name),
        )

    # Add unavailable signals as empty entries for dashboard completeness
    for name in BASE_WEIGHTS:
        if name not in available:
            signal_scores[name] = SignalScore(
                name=name,
                raw_score=None,
                weight_used=0.0,
                weighted_contribution=0.0,
                available=False,
            )

    fused_score = weighted_sum / weight_conf_sum if weight_conf_sum > 0 else 0.0
    fused_score = max(0.0, min(1.0, fused_score))

    # ── Step 5: Overall confidence ────────────
    # More signals = more confident. Full confidence at 4+ signals.
    fusion_confidence = min(1.0, n_available / 4.0)

    # ── Step 6: Classify ──────────────────────
    fused_label = _score_to_label(fused_score)

    # ── Step 7: Dominant signal ───────────────
    dominant = max(
        signal_scores.values(),
        key=lambda s: s.weighted_contribution if s.available else -1
    ).name

    # ── Step 8: Alerts ────────────────────────
    alert, alert_reasons = _check_alerts(inp, raw, fused_score)

    # ── Step 9: LLM context string ────────────
    llm_context = _build_llm_context(
        fused_score, fused_label, fusion_confidence,
        signal_scores, inp, alert, alert_reasons
    )

    # ── Step 10: Dashboard payload ────────────
    dashboard = _build_dashboard(
        fused_score, fused_label, fusion_confidence,
        signal_scores, inp, alert, alert_reasons, dominant
    )

    return FusionResult(
        fused_score=round(fused_score, 3),
        fused_label=fused_label,
        confidence=round(fusion_confidence, 2),
        signals={k: asdict(v) for k, v in signal_scores.items()},
        signals_used=list(available.keys()),
        signals_available=n_available,
        kg_result=inp.kg_result,
        dominant_signal=dominant,
        alert=alert,
        alert_reasons=alert_reasons,
        llm_context=llm_context,
        dashboard=dashboard,
    )


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def _score_to_label(score: float) -> str:
    if score >= FUSED_THRESHOLDS["high"]:     return "high"
    if score >= FUSED_THRESHOLDS["moderate"]: return "moderate"
    if score >= FUSED_THRESHOLDS["low"]:      return "low"
    return "no_stress"


def _check_alerts(inp: SignalInput, raw: dict, fused_score: float):
    """
    Trigger alert if any single signal is critically high,
    even if the overall fused score is moderate.
    """
    alert = False
    reasons = []

    # Heart rate spike
    if inp.bpm and inp.bpm >= 120:
        alert = True
        reasons.append(f"Heart rate critically high: {inp.bpm:.0f} BPM")

    # Face sustained high stress
    if inp.face_stress_level == "high" and inp.face_running:
        alert = True
        reasons.append("Face showing high stress continuously")

    # All signals agree on high stress
    if fused_score >= 0.80:
        alert = True
        reasons.append(f"All signals indicate high stress (score: {fused_score:.2f})")

    # Text very high confidence stress
    if inp.text_stress_label == 1 and inp.text_confidence and inp.text_confidence >= 0.92:
        alert = True
        reasons.append(f"Text strongly indicates stress ({inp.text_confidence*100:.0f}% confidence)")

    return alert, reasons


def _build_llm_context(
    fused_score: float,
    fused_label: str,
    confidence: float,
    signal_scores: dict,
    inp: SignalInput,
    alert: bool,
    alert_reasons: list,
) -> str:
    """
    Builds the context string injected into the LLM system prompt.
    Concise but information-dense.
    """
    parts = []

    # Overall stress
    conf_pct = int(confidence * 100)
    parts.append(
        f"STRESS FUSION ({conf_pct}% confidence, {len([s for s in signal_scores.values() if s.available])} signals): "
        f"Level={fused_label.upper()}, Score={fused_score:.2f}"
    )

    # Per-signal breakdown
    signal_parts = []
    for name, s in signal_scores.items():
        if s.available and s.raw_score is not None:
            signal_parts.append(f"{name}={s.label or f'{s.raw_score:.2f}'}")
    if signal_parts:
        parts.append("Signals: " + ", ".join(signal_parts))

    # KG coping hints
    if inp.kg_result:
        coping = inp.kg_result.get("coping", [])
        if coping:
            parts.append(f"Suggested coping: {', '.join(coping[:3])}")
        triggers = inp.kg_result.get("triggers", [])
        if triggers:
            parts.append(f"Detected triggers: {', '.join(triggers[:3])}")

    # Alert
    if alert:
        parts.append("⚠ ALERT: " + "; ".join(alert_reasons))

    # Tone instruction based on label
    tone_map = {
        "high":     "CRITICAL: Keep response very short (2-3 sentences max), calm, grounding. Suggest one immediate action only.",
        "moderate": "MODERATE: Be warm and structured. Offer 1-2 concrete suggestions. Don't overwhelm.",
        "low":      "LOW: Supportive tone. Normal conversation length. Acknowledge stress gently.",
        "no_stress":"CALM: Normal supportive conversation. No need to emphasize stress.",
    }
    parts.append(tone_map.get(fused_label, ""))

    return " | ".join(parts)


def _build_dashboard(
    fused_score: float,
    fused_label: str,
    confidence: float,
    signal_scores: dict,
    inp: SignalInput,
    alert: bool,
    alert_reasons: list,
    dominant: str,
) -> dict:
    """
    Structured payload for the Expo dashboard screen.
    Frontend can render this directly without any extra processing.
    """

    # Color coding for UI
    label_colors = {
        "no_stress": "#22c55e",   # green
        "low":       "#eab308",   # yellow
        "moderate":  "#f97316",   # orange
        "high":      "#ef4444",   # red
    }

    # Signal display cards for the dashboard
    signal_cards = []
    display_names = {
        "text":      "Text Analysis",
        "voice":     "Voice Analysis",
        "face":      "Face Detection",
        "heart":     "Heart Rate",
        "cognitive": "Cognitive Load",
    }
    icons = {
        "text":      "message-text",
        "voice":     "microphone",
        "face":      "face-recognition",
        "heart":     "heart-pulse",
        "cognitive": "brain",
    }

    for name, s in signal_scores.items():
        card = {
            "id": name,
            "label": display_names.get(name, name),
            "icon": icons.get(name, "circle"),
            "available": s.available,
            "score": round(s.raw_score, 2) if s.raw_score is not None else None,
            "display_label": s.label or ("N/A" if not s.available else _score_to_label(s.raw_score)),
            "color": label_colors.get(
                _score_to_label(s.raw_score) if s.raw_score is not None else "no_stress",
                "#94a3b8"
            ) if s.available else "#94a3b8",
            "weight_pct": round(s.weight_used * 100, 1),
            "is_dominant": name == dominant,
        }
        signal_cards.append(card)

    # Gauge data (for a circular stress meter in the app)
    gauge = {
        "value": round(fused_score * 100),     # 0–100 for easy rendering
        "label": fused_label.replace("_", " ").title(),
        "color": label_colors.get(fused_label, "#94a3b8"),
        "confidence_pct": round(confidence * 100),
    }

    # KG coping for quick-action buttons
    coping_actions = []
    if inp.kg_result:
        for item in (inp.kg_result.get("coping") or [])[:4]:
            coping_actions.append({"label": item, "type": "coping"})

    return {
        "gauge": gauge,
        "signal_cards": signal_cards,
        "alert": {
            "active": alert,
            "reasons": alert_reasons,
            "color": "#ef4444" if alert else None,
        },
        "coping_actions": coping_actions,
        "kg": {
            "symptoms": (inp.kg_result or {}).get("symptoms", [])[:5],
            "triggers": (inp.kg_result or {}).get("triggers", [])[:5],
            "categories": (inp.kg_result or {}).get("categories", [])[:3],
        },
        "summary_text": _summary_text(fused_label, dominant, inp),
        "dominant_signal": dominant,
        "signals_active": sum(1 for s in signal_cards if s["available"]),
    }


def _summary_text(fused_label: str, dominant: str, inp: SignalInput) -> str:
    """One-line human-readable summary shown on the dashboard."""
    signal_name = {
        "text": "your words",
        "voice": "your voice",
        "face": "your expression",
        "heart": "your heart rate",
        "cognitive": "your typing pattern",
    }.get(dominant, "the analysis")

    if fused_label == "no_stress":
        return f"You seem calm. {signal_name.capitalize()} shows no signs of stress."
    elif fused_label == "low":
        return f"Mild stress detected, mainly from {signal_name}. You're managing well."
    elif fused_label == "moderate":
        return f"Moderate stress detected from {signal_name}. Consider taking a short break."
    else:
        return f"High stress detected from {signal_name}. Please pause and take care of yourself."


def _neutral_result(inp: SignalInput) -> FusionResult:
    """Returned when no signals are available at all."""
    return FusionResult(
        fused_score=0.0,
        fused_label="no_stress",
        confidence=0.0,
        signals={},
        signals_used=[],
        signals_available=0,
        kg_result=inp.kg_result,
        dominant_signal="none",
        alert=False,
        alert_reasons=[],
        llm_context="No sensor data available. Respond supportively based on message content only.",
        dashboard={
            "gauge": {"value": 0, "label": "Unknown", "color": "#94a3b8", "confidence_pct": 0},
            "signal_cards": [],
            "alert": {"active": False, "reasons": [], "color": None},
            "coping_actions": [],
            "kg": {"symptoms": [], "triggers": [], "categories": []},
            "summary_text": "Monitoring not active.",
            "dominant_signal": "none",
            "signals_active": 0,
        },
    )
