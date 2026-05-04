"""
analytics_writer.py
Call save_message_analytics() right after you insert the assistant ChatMessage
in both /chat/message and /chat/message-fast.
"""

from sqlalchemy.orm import Session
from . import models
from .ml.fusion import FusionResult


# ─────────────────────────────────────────────
# FIX: extract_kg_fields() was called in main.py but never defined here,
# causing NameError on every chat request.
#
# This helper unpacks both the legacy KG fields (kg_symptoms / kg_triggers /
# kg_coping) AND the five new multi-modal KG fields introduced in the rewrite
# (kg_biological, kg_interventions, kg_severity_band, kg_is_critical,
# kg_clinician_summary) from the merged stress_data dict that main.py builds
# after calling stress_from_all_signals().
#
# The returned dict is **kwargs-splattered directly into save_message_analytics,
# so every key must match a parameter name of that function exactly.
# ─────────────────────────────────────────────
def extract_kg_fields(stress_data: dict) -> dict:
    """
    Pull all KG-related fields out of the merged stress_data dict.

    stress_data is expected to contain:
      - "kg_result"  : legacy dict  {symptoms, triggers, coping}   (text-only pass)
      - "kg_api"     : dict from KGResult.to_api_response()        (multi-modal pass)
      - "is_critical": bool
      - "clinician_note": str | None

    Returns a flat dict ready to be **-spread into save_message_analytics().
    """
    kg_result = stress_data.get("kg_result") or {}
    kg_api    = stress_data.get("kg_api")    or {}

    # Legacy lists — fall back to kg_result keys if kg_api doesn't have them
    kg_symptoms = (
        [s.get("label", str(s)) if isinstance(s, dict) else str(s)
         for s in kg_api.get("symptoms", [])]
        or kg_result.get("symptoms")
        or []
    )
    kg_triggers = kg_result.get("triggers") or []
    kg_coping   = kg_result.get("coping")   or []

    # New multi-modal KG fields
    kg_biological = (
        kg_api.get("biological") or []
    )
    kg_interventions = (
        kg_api.get("interventions") or []
    )
    kg_severity_band = (
        kg_api.get("severity_band")
        or stress_data.get("severity_band")
    )
    kg_is_critical = bool(
        kg_api.get("is_critical")
        or stress_data.get("is_critical")
        or False
    )
    kg_clinician_summary = (
        kg_api.get("clinician_summary")
        or stress_data.get("clinician_note")
    )

    # text_stress_label: keep as raw int (0/1) for the DB column which is
    # SmallInteger.  stress_data["stress_label"] is the int; "final_label" is
    # the human-readable string used in the API response.
    text_stress_label = stress_data.get("stress_label")   # int 0 | 1

    return dict(
        text_stress_label=text_stress_label,
        text_stress_confidence=stress_data.get("confidence"),
        kg_symptoms=kg_symptoms,
        kg_triggers=kg_triggers,
        kg_coping=kg_coping,
        kg_biological=kg_biological,
        kg_interventions=kg_interventions,
        kg_severity_band=kg_severity_band,
        kg_is_critical=kg_is_critical,
        kg_clinician_summary=kg_clinician_summary,
    )


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
    # FIX: five new KG parameters that were previously absent, so any caller
    # passing them would raise TypeError and the DB row was never written.
    kg_biological:        list  | None = None,
    kg_interventions:     list  | None = None,
    kg_severity_band:     str   | None = None,
    kg_is_critical:       bool  | None = None,
    kg_clinician_summary: str   | None = None,
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

        # FIX: write the five new KG columns that were silently dropped before
        kg_biological=kg_biological or [],
        kg_interventions=kg_interventions or [],
        kg_severity_band=kg_severity_band,
        kg_is_critical=kg_is_critical,
        kg_clinician_summary=kg_clinician_summary,

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
        fused_score=fusion.fused_score            if fusion else None,
        fused_label=fusion.fused_label            if fusion else None,
        fusion_confidence=fusion.confidence       if fusion else None,
        fusion_alert=fusion.alert                 if fusion else False,
        fusion_alert_reasons=fusion.alert_reasons if fusion else [],
        signals_used=fusion.signals_used          if fusion else [],
        dominant_signal=fusion.dominant_signal    if fusion else None,
        fusion_dashboard=fusion.dashboard         if fusion else None,
    )

    db.add(row)
    db.commit()
    db.refresh(row)
    return row