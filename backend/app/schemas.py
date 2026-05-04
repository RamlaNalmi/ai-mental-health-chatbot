"""
Pydantic v2 Schemas — request bodies, response models, and shared types.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, EmailStr


# ─────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────
class SignUp(BaseModel):
    email:    EmailStr
    name:     Optional[str] = None
    password: str


class SignIn(BaseModel):
    email:    EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type:   str = "bearer"


# ─────────────────────────────────────────────
# BASELINE
# ─────────────────────────────────────────────
class BaselineStatus(BaseModel):
    is_ready:  bool
    n_samples: int


# ─────────────────────────────────────────────
# COGNITIVE LOAD — INGEST
# ─────────────────────────────────────────────
class KeystrokeEvent(BaseModel):
    key:          Optional[str]   = None
    timestamp:    Optional[float] = None   # epoch ms
    duration:     Optional[float] = None   # key-hold ms
    is_backspace: Optional[bool]  = False


class VoiceFeatures(BaseModel):
    pitch_variance:     float = 0.0
    volume_fluctuation: float = 0.0
    tone_variability:   float = 0.0


class IngestRequest(BaseModel):
    text:           str
    keystrokes:     Optional[List[KeystrokeEvent]] = None
    voice_features: Optional[VoiceFeatures]        = None


class PredictOut(BaseModel):
    ready:           bool
    baseline_ready:  bool
    window_size:     Optional[int]              = None
    predicted_label: Optional[str]              = None
    probs:           Optional[Dict[str, float]] = None


# ─────────────────────────────────────────────
# KNOWLEDGE GRAPH — typed sub-models
# FIX: these were missing entirely; KGApiResponse was referenced in main.py
#      but never defined here, causing NameError at import time.
# ─────────────────────────────────────────────
class KGSymptomRef(BaseModel):
    label: str
    dsm5:  Optional[str] = None
    icd11: Optional[str] = None


class KGInterventionRef(BaseModel):
    label:    str
    evidence: Optional[str] = None


class KGApiResponse(BaseModel):
    severity_band:     str                        = "no_stress"
    fused_score:       float                      = 0.0
    stressors:         List[str]                  = []
    symptoms:          List[KGSymptomRef]         = []
    biological:        List[str]                  = []
    interventions:     List[KGInterventionRef]    = []
    measurement_tools: List[str]                  = []
    is_critical:       bool                       = False
    critical_reason:   Optional[str]              = None
    clinician_summary: Optional[str]              = None


# ─────────────────────────────────────────────
# CHAT
# ─────────────────────────────────────────────
class ChatStartOut(BaseModel):
    session_id: int


class ChatMessageIn(BaseModel):
    text:           str
    keystrokes:     Optional[List[KeystrokeEvent]] = None
    voice_features: Optional[VoiceFeatures]        = None
    voice_score:    Optional[float]                = None


class ChatMessageOut(BaseModel):
    reply:      str
    session_id: int

    # Cognitive load
    cognitive_load_ready: bool
    baseline_ready:       bool
    window_size:          Optional[int]              = None
    predicted_label:      Optional[str]              = None
    probs:                Optional[Dict[str, float]] = None

    # Text stress
    # FIX: was Optional[int] — stress_label is now the string final_label
    #      e.g. "stressed" | "not_stressed", never a raw 0/1 integer.
    stress_label:      Optional[str]            = None
    stress_confidence: Optional[float]          = None
    # FIX: was Optional[Dict[str, Any]] — _build_kg_api_response() returns
    #      a KGApiResponse instance, so the field must accept that model.
    #      Pydantic will serialise it correctly to JSON on the way out.
    kg_response:       Optional[KGApiResponse]  = None

    # Face / sensor
    face_stress_level: Optional[str]   = None
    bpm:               Optional[float] = None
    bpm_zone:          Optional[str]   = None

    # Fusion
    fused_score:          Optional[float]      = None
    fused_label:          Optional[str]        = None
    fusion_confidence:    Optional[float]      = None
    fusion_dashboard:     Optional[Dict[str, Any]] = None
    fusion_alert:         Optional[bool]       = None
    fusion_alert_reasons: Optional[List[str]]  = None
    signals_used:         Optional[List[str]]  = None


# ─────────────────────────────────────────────
# STRESS ANALYTICS  (read-back schemas)
# ─────────────────────────────────────────────
class TextStressSnapshot(BaseModel):
    label:      Optional[int]   = None   # 0 | 1
    confidence: Optional[float] = None
    kg_symptoms: Optional[List[str]] = None
    kg_triggers: Optional[List[str]] = None
    kg_coping:   Optional[List[str]] = None


class FaceStressSnapshot(BaseModel):
    available:    bool          = False
    stress_level: Optional[str] = None
    confidence:   Optional[float] = None
    face_detected: Optional[bool] = None


class HeartRateSnapshot(BaseModel):
    available: bool          = False
    bpm:       Optional[float] = None
    bpm_zone:  Optional[str]   = None
    spo2:      Optional[float] = None
    gsr:       Optional[float] = None


class CognitiveLoadSnapshot(BaseModel):
    ready:      bool            = False
    label:      Optional[str]   = None
    prob_low:   Optional[float] = None
    prob_med:   Optional[float] = None
    prob_high:  Optional[float] = None
    baseline_ready: bool        = False
    baseline_delta: Optional[float] = None


class VoiceSnapshot(BaseModel):
    available:        bool          = False
    score:            Optional[float] = None
    label:            Optional[str]   = None
    pitch_variance:   Optional[float] = None
    volume_fluct:     Optional[float] = None
    tone_variability: Optional[float] = None


class FusionSnapshot(BaseModel):
    fused_score:       Optional[float]     = None
    fused_label:       Optional[str]       = None
    confidence:        Optional[float]     = None
    alert:             bool                = False
    alert_reasons:     Optional[List[str]] = None
    signals_used:      Optional[List[str]] = None
    dominant_signal:   Optional[str]       = None
    dashboard:         Optional[Dict[str, Any]] = None


class MessageAnalyticsOut(BaseModel):
    """Full multi-modal stress snapshot for one message — used for analytics endpoints."""
    id:         int
    message_id: int
    session_id: int
    user_id:    int
    created_at: str

    text:      TextStressSnapshot
    voice:     VoiceSnapshot
    face:      FaceStressSnapshot
    heart:     HeartRateSnapshot
    cognitive: CognitiveLoadSnapshot
    fusion:    FusionSnapshot

    # Typing features
    typing_speed:         Optional[float] = None
    pause_count:          Optional[float] = None
    error_rate:           Optional[float] = None
    mean_iki_ms:          Optional[float] = None
    ttr:                  Optional[float] = None
    lexical_diversity:    Optional[float] = None
    syntactic_complexity: Optional[float] = None


class SessionSummaryOut(BaseModel):
    session_id:   int
    total_messages: int
    duration_seconds: Optional[float]    = None
    stress_label_counts: Optional[Dict[str, int]] = None
    avg_fused_score:     Optional[float] = None
    avg_bpm:             Optional[float] = None
    peak_bpm:            Optional[float] = None
    peak_fused_score:    Optional[float] = None
    dominant_fused_label:    Optional[str] = None
    dominant_face_level:     Optional[str] = None
    dominant_cognitive_load: Optional[str] = None
    total_fusion_alerts: int = 0


# ─────────────────────────────────────────────
# RECOMMENDATIONS
# ─────────────────────────────────────────────
class RecommendationFeedback(BaseModel):
    feedback: str   # "yes" | "no"


# ─────────────────────────────────────────────
# BPM / FACE READINGS  (log endpoints)
# ─────────────────────────────────────────────
class BpmReadingIn(BaseModel):
    bpm:      float
    bpm_zone: Optional[str]  = None
    spo2:     Optional[float] = None
    gsr:      Optional[float] = None
    is_alert: bool            = False


class FaceReadingIn(BaseModel):
    stress_level:  Optional[str]   = None
    raw_score:     Optional[float] = None
    face_detected: bool            = False
    stress_frames: Optional[int]   = None
    fps:           Optional[float] = None