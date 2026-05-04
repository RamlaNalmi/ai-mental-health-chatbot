"""
SQLAlchemy ORM Models — PostgreSQL / Supabase
Tables:
  - users
  - user_baselines
  - interaction_timesteps
  - predictions
  - chat_sessions
  - chat_messages
  - message_stress_analytics   ← full per-message multi-modal snapshot
  - session_summaries          ← rolled-up summary per chat session
  - bpm_readings               ← time-series heart rate log
  - face_stress_readings       ← time-series face stress log
"""

from datetime import datetime
from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Float,
    ForeignKey, Integer, JSON, String, Text, SmallInteger,
)
from sqlalchemy.orm import relationship
from .db import Base


# ─────────────────────────────────────────────
# USERS
# ─────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    email         = Column(String(255), unique=True, nullable=False, index=True)
    name          = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=False)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    baseline              = relationship("UserBaseline",            back_populates="user", uselist=False)
    interaction_timesteps = relationship("InteractionTimestep",     back_populates="user")
    predictions           = relationship("Prediction",              back_populates="user")
    chat_sessions         = relationship("ChatSession",             back_populates="user")
    chat_messages         = relationship("ChatMessage",             back_populates="user")
    stress_analytics      = relationship("MessageStressAnalytics",  back_populates="user")
    bpm_readings          = relationship("BpmReading",              back_populates="user")
    face_readings         = relationship("FaceStressReading",       back_populates="user")


# ─────────────────────────────────────────────
# USER BASELINES
# ─────────────────────────────────────────────
class UserBaseline(Base):
    __tablename__ = "user_baselines"

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id     = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    is_ready    = Column(Boolean, default=False, nullable=False)
    mean10_json = Column(JSON, default=dict, nullable=False)
    n_samples   = Column(Integer, default=0, nullable=False)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="baseline")


# ─────────────────────────────────────────────
# INTERACTION TIMESTEPS
# ─────────────────────────────────────────────
class InteractionTimestep(Base):
    __tablename__ = "interaction_timesteps"

    id                   = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id              = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at           = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Typing
    typing_speed         = Column(Float, default=0.0)
    pause_count          = Column(Float, default=0.0)
    error_rate           = Column(Float, default=0.0)
    mean_iki_ms          = Column(Float, default=0.0)

    # Text / lexical
    ttr                  = Column(Float, default=0.0)
    lexical_diversity    = Column(Float, default=0.0)
    syntactic_complexity = Column(Float, default=0.0)

    # Voice
    pitch_variance       = Column(Float, default=0.0)
    volume_fluctuation   = Column(Float, default=0.0)
    tone_variability     = Column(Float, default=0.0)

    baseline_delta       = Column(Float, default=0.0)

    user = relationship("User", back_populates="interaction_timesteps")


# ─────────────────────────────────────────────
# PREDICTIONS  (cognitive load)
# ─────────────────────────────────────────────
class Prediction(Base):
    __tablename__ = "predictions"

    id              = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id         = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    predicted_label = Column(String(50), nullable=False)   # "Low" | "Medium" | "High"
    probs_json      = Column(JSON, default=dict)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="predictions")


# ─────────────────────────────────────────────
# CHAT SESSIONS
# ─────────────────────────────────────────────
class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id    = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at   = Column(DateTime, nullable=True)

    user     = relationship("User",           back_populates="chat_sessions")
    messages = relationship("ChatMessage",    back_populates="session", order_by="ChatMessage.created_at")
    summary  = relationship("SessionSummary", back_populates="session", uselist=False)


# ─────────────────────────────────────────────
# CHAT MESSAGES
# ─────────────────────────────────────────────
class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(BigInteger, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id    = Column(BigInteger, ForeignKey("users.id",         ondelete="CASCADE"), nullable=False, index=True)
    role       = Column(String(20), nullable=False)   # "user" | "assistant"
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    session   = relationship("ChatSession",          back_populates="messages")
    user      = relationship("User",                 back_populates="chat_messages")
    analytics = relationship("MessageStressAnalytics", back_populates="message", uselist=False)


# ─────────────────────────────────────────────
# MESSAGE STRESS ANALYTICS  ← the comprehensive table
# One row per user message — stores every modality label/score
# ─────────────────────────────────────────────
class MessageStressAnalytics(Base):
    __tablename__ = "message_stress_analytics"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    message_id = Column(BigInteger, ForeignKey("chat_messages.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    session_id = Column(BigInteger, ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id    = Column(BigInteger, ForeignKey("users.id",         ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # ── Text stress modality ──────────────────────────────────
    text_stress_label      = Column(SmallInteger, nullable=True)   # 0 | 1
    text_stress_confidence = Column(Float, nullable=True)          # 0.0 – 1.0

    # Legacy KG lists (kept for backward compat)
    kg_symptoms  = Column(JSON, nullable=True)   # list[str]
    kg_triggers  = Column(JSON, nullable=True)   # list[str]
    kg_coping    = Column(JSON, nullable=True)   # list[str]

    # FIX: five new KG columns that main.py reads back via r.kg_biological etc.
    # and writes via extract_kg_fields(). Previously absent, causing AttributeError
    # on every analytics read and silently dropping data on every write.
    kg_biological        = Column(JSON,    nullable=True)   # list[str]  — activated biological nodes
    kg_interventions     = Column(JSON,    nullable=True)   # list[dict] — {label, evidence}
    kg_severity_band     = Column(String(20), nullable=True)  # "no_stress"|"low"|"moderate"|"high"|"critical"
    kg_is_critical       = Column(Boolean, nullable=True)   # True when KG flags crisis pathway
    kg_clinician_summary = Column(Text,    nullable=True)   # free-text clinician note from KG

    # ── Voice modality ────────────────────────────────────────
    voice_available        = Column(Boolean, default=False)
    voice_score            = Column(Float, nullable=True)          # 0.0 – 1.0
    voice_label            = Column(String(20), nullable=True)     # "Low"|"Medium"|"High" or null
    voice_pitch_variance   = Column(Float, nullable=True)
    voice_volume_fluct     = Column(Float, nullable=True)
    voice_tone_variability = Column(Float, nullable=True)

    # ── Face / webcam modality ────────────────────────────────
    face_available    = Column(Boolean, default=False)
    face_stress_level = Column(String(20), nullable=True)   # "no_stress"|"low"|"moderate"|"high"
    face_confidence   = Column(Float, nullable=True)        # raw model score 0–1
    face_detected     = Column(Boolean, nullable=True)

    # ── Heart rate / BPM modality ─────────────────────────────
    heart_available = Column(Boolean, default=False)
    bpm             = Column(Float, nullable=True)
    bpm_zone        = Column(String(20), nullable=True)     # "rest"|"normal"|"elevated"|"high"
    spo2            = Column(Float, nullable=True)
    gsr             = Column(Float, nullable=True)

    # ── Cognitive load modality ───────────────────────────────
    cognitive_load_ready  = Column(Boolean, default=False)
    cognitive_load_label  = Column(String(20), nullable=True)   # "Low"|"Medium"|"High"
    cognitive_load_prob_low  = Column(Float, nullable=True)
    cognitive_load_prob_med  = Column(Float, nullable=True)
    cognitive_load_prob_high = Column(Float, nullable=True)
    baseline_ready           = Column(Boolean, default=False)
    baseline_delta           = Column(Float, nullable=True)

    # ── Typing features (snapshot at message time) ────────────
    typing_speed         = Column(Float, nullable=True)
    pause_count          = Column(Float, nullable=True)
    error_rate           = Column(Float, nullable=True)
    mean_iki_ms          = Column(Float, nullable=True)
    ttr                  = Column(Float, nullable=True)
    lexical_diversity    = Column(Float, nullable=True)
    syntactic_complexity = Column(Float, nullable=True)

    # ── Fusion output ─────────────────────────────────────────
    fused_score       = Column(Float, nullable=True)        # 0.0 – 1.0
    fused_label       = Column(String(20), nullable=True)   # "no_stress"|"low"|"moderate"|"high"
    fusion_confidence = Column(Float, nullable=True)
    fusion_alert      = Column(Boolean, default=False)
    fusion_alert_reasons = Column(JSON, nullable=True)      # list[str]
    signals_used      = Column(JSON, nullable=True)         # list[str] e.g. ["text","face","heart"]
    dominant_signal   = Column(String(30), nullable=True)
    fusion_dashboard  = Column(JSON, nullable=True)         # full dashboard dict

    # ── Relationships ─────────────────────────────────────────
    message = relationship("ChatMessage", back_populates="analytics")
    user    = relationship("User",        back_populates="stress_analytics")


# ─────────────────────────────────────────────
# SESSION SUMMARIES  (rolled-up stats per session)
# ─────────────────────────────────────────────
class SessionSummary(Base):
    __tablename__ = "session_summaries"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(BigInteger, ForeignKey("chat_sessions.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    user_id    = Column(BigInteger, ForeignKey("users.id",         ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    total_messages       = Column(Integer, default=0)
    duration_seconds     = Column(Float, nullable=True)

    # Stress counts per label across the session
    stress_label_counts  = Column(JSON, nullable=True)   # {"no_stress": 3, "low": 2, "moderate": 1, "high": 0}

    # Averages
    avg_fused_score      = Column(Float, nullable=True)
    avg_bpm              = Column(Float, nullable=True)
    avg_text_confidence  = Column(Float, nullable=True)
    avg_face_confidence  = Column(Float, nullable=True)
    avg_voice_score      = Column(Float, nullable=True)
    avg_cognitive_prob_high = Column(Float, nullable=True)

    # Peak readings
    peak_bpm             = Column(Float, nullable=True)
    peak_fused_score     = Column(Float, nullable=True)

    # Most common labels
    dominant_fused_label    = Column(String(20), nullable=True)
    dominant_face_level     = Column(String(20), nullable=True)
    dominant_cognitive_load = Column(String(20), nullable=True)

    # Alert count
    total_fusion_alerts  = Column(Integer, default=0)

    session = relationship("ChatSession", back_populates="summary")


# ─────────────────────────────────────────────
# BPM READINGS  (time-series from Arduino)
# ─────────────────────────────────────────────
class BpmReading(Base):
    __tablename__ = "bpm_readings"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id    = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    bpm      = Column(Float, nullable=False)
    bpm_zone = Column(String(20), nullable=True)
    spo2     = Column(Float, nullable=True)
    gsr      = Column(Float, nullable=True)
    is_alert = Column(Boolean, default=False)

    user = relationship("User", back_populates="bpm_readings")


# ─────────────────────────────────────────────
# FACE STRESS READINGS  (time-series from webcam)
# ─────────────────────────────────────────────
class FaceStressReading(Base):
    __tablename__ = "face_stress_readings"

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id     = Column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recorded_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    stress_level  = Column(String(20), nullable=True)   # "no_stress"|"low"|"moderate"|"high"
    raw_score     = Column(Float, nullable=True)         # model output 0–1
    face_detected = Column(Boolean, default=False)
    stress_frames = Column(Integer, nullable=True)       # count in classify window
    fps           = Column(Float, nullable=True)

    user = relationship("User", back_populates="face_readings")