"""
analytics_writer.py
Call save_message_analytics() right after you insert the assistant ChatMessage
in both /chat/message and /chat/message-fast.
"""

from sqlalchemy.orm import Session
from . import models
from .ml.fusion import FusionResult


def save_message_analytics(
    db:           Session,
    message_id:   int,
    session_id:   int,
    user_id:      int,
    # ── Text stress ──────────────────────────
    text_stress_label:      int   | None = None,
    text_stress_confidence: float | None = None,
    kg_symptoms:  list | None = None,
    kg_triggers:  list | None = None,
    kg_coping:    list | None = None,
    # ── Voice ─────────────────────────────────
    voice_available:        bool  = False,
    voice_score:            float | None = None,
    voice_label:            str   | None = None,
    voice_pitch_variance:   float | None = None,
    voice_volume_fluct:     float | None = None,
    voice_tone_variability: float | None = None,
    # ── Face ──────────────────────────────────
    face_available:    bool  = False,
    face_stress_level: str   | None = None,
    face_confidence:   float | None = None,
    face_detected:     bool  | None = None,
    # ── Heart rate ────────────────────────────
    heart_available: bool  = False,
    bpm:             float | None = None,
    bpm_zone:        str   | None = None,
    spo2:            float | None = None,
    gsr:             float | None = None,
    # ── Cognitive load ────────────────────────
    cognitive_load_ready:     bool  = False,
    cognitive_load_label:     str   | None = None,
    cognitive_load_prob_low:  float | None = None,
    cognitive_load_prob_med:  float | None = None,
    cognitive_load_prob_high: float | None = None,
    baseline_ready:  bool  = False,
    baseline_delta:  float | None = None,
    # ── Typing snapshot ───────────────────────
    typing_speed:         float | None = None,
    pause_count:          float | None = None,
    error_rate:           float | None = None,
    mean_iki_ms:          float | None = None,
    ttr:                  float | None = None,
    lexical_diversity:    float | None = None,
    syntactic_complexity: float | None = None,
    # ── Fusion ────────────────────────────────
    fusion: FusionResult | None = None,
) -> models.MessageStressAnalytics:
    """
    Insert one row into message_stress_analytics.
    Pass the FusionResult object directly; all fusion fields are unpacked here.
    """

    row = models.MessageStressAnalytics(
        message_id=message_id,
        session_id=session_id,
        user_id=user_id,

        # Text stress
        text_stress_label=text_stress_label,
        text_stress_confidence=text_stress_confidence,
        kg_symptoms=kg_symptoms or [],
        kg_triggers=kg_triggers or [],
        kg_coping=kg_coping or [],

        # Voice
        voice_available=voice_available,
        voice_score=voice_score,
        voice_label=voice_label,
        voice_pitch_variance=voice_pitch_variance,
        voice_volume_fluct=voice_volume_fluct,
        voice_tone_variability=voice_tone_variability,

        # Face
        face_available=face_available,
        face_stress_level=face_stress_level,
        face_confidence=face_confidence,
        face_detected=face_detected,

        # Heart rate
        heart_available=heart_available,
        bpm=bpm,
        bpm_zone=bpm_zone,
        spo2=spo2,
        gsr=gsr,

        # Cognitive load
        cognitive_load_ready=cognitive_load_ready,
        cognitive_load_label=cognitive_load_label,
        cognitive_load_prob_low=cognitive_load_prob_low,
        cognitive_load_prob_med=cognitive_load_prob_med,
        cognitive_load_prob_high=cognitive_load_prob_high,
        baseline_ready=baseline_ready,
        baseline_delta=baseline_delta,

        # Typing
        typing_speed=typing_speed,
        pause_count=pause_count,
        error_rate=error_rate,
        mean_iki_ms=mean_iki_ms,
        ttr=ttr,
        lexical_diversity=lexical_diversity,
        syntactic_complexity=syntactic_complexity,

        # Fusion
        fused_score=fusion.fused_score          if fusion else None,
        fused_label=fusion.fused_label          if fusion else None,
        fusion_confidence=fusion.confidence     if fusion else None,
        fusion_alert=fusion.alert               if fusion else False,
        fusion_alert_reasons=fusion.alert_reasons if fusion else [],
        signals_used=fusion.signals_used        if fusion else [],
        dominant_signal=fusion.dominant_signal  if fusion else None,
        fusion_dashboard=fusion.dashboard       if fusion else None,
    )

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


# ── Example usage in main.py ──────────────────────────────────
#
# After your existing db.add(ChatMessage(role="assistant", ...)) + db.commit():
#
#   assistant_msg = db.query(models.ChatMessage).filter(...).order_by(
#       models.ChatMessage.created_at.desc()
#   ).first()
#
#   kg = stress_data.get("kg_result", {})
#   probs = probs or {}
#
#   save_message_analytics(
#       db=db,
#       message_id=assistant_msg.id,
#       session_id=session_id,
#       user_id=user.id,
#       text_stress_label=stress_label,
#       text_stress_confidence=stress_data.get("confidence"),
#       kg_symptoms=kg.get("symptoms"),
#       kg_triggers=kg.get("triggers"),
#       kg_coping=kg.get("coping"),
#       voice_available=voice_available,
#       voice_score=voice_score,
#       face_available=_stress_system.running,
#       face_stress_level=_stress_system.stress_level,
#       heart_available=_sensor.connected and _sensor.latest_bpm is not None,
#       bpm=_sensor.latest_bpm,
#       bpm_zone=_sensor.bpm_zone,
#       spo2=_sensor.latest_spo2,
#       gsr=_sensor.latest_gsr,
#       cognitive_load_ready=ready,
#       cognitive_load_label=pred_label,
#       cognitive_load_prob_low=probs.get("Low"),
#       cognitive_load_prob_med=probs.get("Medium"),
#       cognitive_load_prob_high=probs.get("High"),
#       baseline_ready=baseline_ready,
#       baseline_delta=float(bdelta),
#       typing_speed=float(x10[0]),
#       pause_count=float(x10[1]),
#       error_rate=float(x10[2]),
#       mean_iki_ms=float(x10[3]),
#       ttr=float(x10[4]),
#       lexical_diversity=float(x10[5]),
#       syntactic_complexity=float(x10[6]),
#       fusion=fusion,
#   )