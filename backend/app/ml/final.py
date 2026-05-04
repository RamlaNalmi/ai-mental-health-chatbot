"""
ml/final.py — Comprehensive Stress Knowledge Graph Engine
══════════════════════════════════════════════════════════════════════════════
Maps ALL multi-modal signals (text, voice, face, BPM, cognitive load,
keystroke dynamics) onto the comprehensive stress KG:

  KG Node Types Covered
  ─────────────────────
  • StressorCategory   (acute / chronic / daily-hassle)
  • Stressor           (18 stressors: academic_workload, exam_pressure …)
  • Biological         (hpa_axis, cortisol, sns_activation, allostatic_load …)
  • Symptom            (anxiety_disorder, burnout, cognitive_impairment …)
  • Theory             (lazarus, hobfoll, selye, mcewen …)
  • Moderator          (gender, ses, resilience, self_efficacy …)
  • Intervention       (mindfulness, cbt, social_support, exercise …)
  • CopingStrategy     (problem_focused, emotion_focused, cognitive_reappraisal)
  • MeasurementTool    (PSS, PHQ-9, GAD-7, DASS-21, MBI-SS, SISCO)
  • Outcome            (academic_underperformance, dropout, longterm_health …)

  Signal → KG Mapping
  ────────────────────
  text_stress       → Stressor nodes (BERT cosine + keyword hybrid)
  voice_score       → Biological (SNS/HPA), Symptom (somatic)
  face_score        → Symptom (emotional_dysregulation, anxiety)
  bpm               → Biological (sns_activation, cortisol, hpa_axis)
  cognitive_label   → Symptom (cognitive_impairment, burnout)
  fused_label       → Full pathway: Stressor → Biological → Symptom
                        → Outcome → Intervention (clinician-ready)

  Clinician Output
  ─────────────────
  • Structured KGResult dataclass (serialisable to dict / JSON)
  • DSM-5 / ICD-11 codes on every flagged symptom
  • Evidence-graded interventions (RCT / quasi-experimental / observational)
  • Theory pathway (which theoretical model best explains this presentation)
  • Moderator flags (gender, SES, rural/urban — when known from user profile)
  • Severity band (no_stress | low | moderate | high | critical)
  • Measurement tool recommendations (validated scales to confirm screening)
  • Narrative paragraph for LLM system prompt injection

Sources: MeSO Ontology (2024) · DSM-5 · ICD-11 · Lazarus (1991)
         Hobfoll (1996) · McEwen (1998) · Maslach (1997) · Mahees (2020)
         Biomarker study (2024) · Mindfulness RCT (2024)
══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import os
import json
import queue
import wave
import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional

import numpy as np
import torch
import librosa
import joblib
import vosk
from pydub import AudioSegment
from transformers import BertTokenizer, BertModel
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.models import load_model
from neo4j import GraphDatabase


# ══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════════════════════

VOSK_MODEL_PATH      = "vosk-model-small-en-us-0.15"
SAMPLERATE           = 16000
BLOCKSIZE            = 4000
BINARY_MODEL_PATH    = "binary_stress_model_20260108_032055.h5"
AFFECT3_MODEL_PATH   = "affect_3class_model_20260108_031946.h5"
TEXT_MODEL_PATH      = "stress_detection_xgb_model.pkl"

NEO4J_URI            = "neo4j+s://2c495538.databases.neo4j.io"
NEO4J_USER           = "2c495538"
NEO4J_PASSWORD       = "Sg5ToAp3rJDrR4obMqOd3VbfH04z6XamIdfynVxNyi0"
NEO4J_DB             = "2c495538"

# BPM thresholds (maps to sns_activation / hpa_axis biological nodes)
BPM_REST_MAX         = 60
BPM_NORMAL_MAX       = 100
BPM_ELEVATED_MAX     = 120   # → HPA axis activation territory
BPM_HIGH_THRESHOLD   = 120   # → SNS strong activation; cortisol spike expected

# Cosine similarity threshold for KG concept matching
KG_SIM_THRESHOLD     = 0.51
KG_TOP_K             = 10


# ══════════════════════════════════════════════════════════════════════════════
# KNOWLEDGE GRAPH — STATIC TAXONOMY
# All IDs match the comprehensive .cypher file exactly.
# ══════════════════════════════════════════════════════════════════════════════

# ── Stressor catalogue (id → metadata) ───────────────────────────────────────
STRESSOR_CATALOGUE: dict[str, dict] = {
    "academic_workload":     {"label": "Academic Workload",            "type": "chronic",  "weight": 24, "primary": True},
    "exam_pressure":         {"label": "Exam & Assessment Pressure",   "type": "acute",    "weight": 20, "biomarker_linked": True},
    "academic_self_efficacy":{"label": "Low Academic Self-Efficacy",   "type": "chronic",  "weight": 16},
    "presentation_phobia":   {"label": "Social Phobia / Presentations","type": "acute",    "weight": 14},
    "poor_english":          {"label": "Language Barrier (English)",    "type": "chronic",  "weight": 15},
    "transition_stress":     {"label": "University Transition Stress", "type": "acute",    "weight": 16},
    "economic_hardship":     {"label": "Economic Hardship",            "type": "chronic",  "weight": 22, "primary": True},
    "food_insecurity":       {"label": "Food Insecurity",              "type": "chronic",  "weight": 14},
    "digital_divide":        {"label": "Digital Divide / Tech Access", "type": "chronic",  "weight": 13},
    "relationship_stress":   {"label": "Relationship Stress",          "type": "chronic",  "weight": 20, "primary": True},
    "loneliness":            {"label": "Loneliness & Social Isolation","type": "chronic",  "weight": 15},
    "ragging":               {"label": "Ragging (Hazing)",             "type": "acute",    "weight": 18},
    "discrimination":        {"label": "Discrimination & Stigma",      "type": "chronic",  "weight": 14},
    "sociocultural_pressure":{"label": "Socio-Cultural Pressure",      "type": "chronic",  "weight": 17},
    "student_politics":      {"label": "Student Politics & Closures",  "type": "acute",    "weight": 16},
    "hostel_environment":    {"label": "Poor Hostel Environment",      "type": "chronic",  "weight": 17},
    "covid_pandemic":        {"label": "Pandemic / Crisis Events",     "type": "acute",    "weight": 16},
    "job_insecurity":        {"label": "Graduate Job Insecurity",      "type": "chronic",  "weight": 14},
}

# ── Biological node catalogue ─────────────────────────────────────────────────
BIOLOGICAL_CATALOGUE: dict[str, dict] = {
    "hpa_axis":        {"label": "HPA Axis Activation",        "weight": 20, "mechanism": "CRH → ACTH → cortisol"},
    "sns_activation":  {"label": "Sympathetic Nervous System",  "weight": 18, "mechanism": "fight-or-flight; adrenaline/noradrenaline"},
    "cortisol":        {"label": "Cortisol (Stress Hormone)",   "weight": 18, "measurable": True},
    "il1b":            {"label": "IL-1β (Interleukin-1β)",      "weight": 14, "sex_differential": True},
    "crp":             {"label": "C-Reactive Protein (CRP)",    "weight": 13},
    "iga":             {"label": "Salivary IgA",                "weight": 12},
    "alpha_amylase":   {"label": "Salivary Alpha-Amylase",      "weight": 12, "marker_of": "SNS"},
    "allostatic_load": {"label": "Allostatic Load",             "weight": 16, "chronic_only": True},
    "neurobiological": {"label": "Neurobiological Changes",     "weight": 15},
    "immune_suppression":{"label":"Immune Suppression",         "weight": 14},
}

# ── Symptom catalogue (with DSM-5 / ICD-11 codes) ────────────────────────────
SYMPTOM_CATALOGUE: dict[str, dict] = {
    "anxiety_disorder":      {"label": "Anxiety Disorder (GAD)",         "type": "psychological", "weight": 18,
                               "dsm5": "300.02",  "icd11": "6B00",  "scale": "GAD-7"},
    "major_depression":      {"label": "Major Depressive Disorder",      "type": "psychological", "weight": 18,
                               "dsm5": "296.xx",  "icd11": "6A70",  "scale": "PHQ-9"},
    "burnout":               {"label": "Academic Burnout",               "type": "psychological", "weight": 18,
                               "icd11": "QD85",   "scale": "MBI-SS"},
    "ptsd_symptoms":         {"label": "Trauma-Related Stress (PTSD)",   "type": "psychological", "weight": 14,
                               "dsm5": "308.3",   "icd11": "6B40"},
    "suicidal_ideation":     {"label": "Suicidal Ideation & Attempts",   "type": "psychological", "weight": 16,
                               "severity": "critical"},
    "impaired_selfconcept":  {"label": "Impaired Self-Concept",          "type": "psychological", "weight": 13},
    "cognitive_impairment":  {"label": "Cognitive Impairment",           "type": "psychological", "weight": 15},
    "emotional_dysregulation":{"label":"Emotional Dysregulation",        "type": "psychological", "weight": 14},
    "sleep_disorder":        {"label": "Sleep Disturbance / Insomnia",   "type": "physical",      "weight": 16},
    "chronic_fatigue":       {"label": "Chronic Fatigue",                "type": "physical",      "weight": 14},
    "somatic_symptoms":      {"label": "Somatic / Physical Symptoms",    "type": "physical",      "weight": 14},
    "cardiovascular_risk":   {"label": "Cardiovascular Risk",            "type": "physical",      "weight": 13},
    "mental_health_deterioration": {"label": "Mental Health Deterioration","type": "psychological","weight": 18},
}

# ── Intervention catalogue (evidence-graded) ─────────────────────────────────
INTERVENTION_CATALOGUE: dict[str, dict] = {
    "mindfulness":        {"label": "Mindfulness-Based Interventions", "evidence": "RCT", "effect_size": "d=1.89",
                           "target_symptoms": ["burnout","anxiety_disorder","sleep_disorder","emotional_dysregulation"],
                           "source": "Mindfulness RCT (2024, n=153)"},
    "cbt":                {"label": "Cognitive Behavioural Therapy (CBT)", "evidence": "RCT",
                           "target_symptoms": ["anxiety_disorder","major_depression","cognitive_impairment"],
                           "source": "Neurophysiology review (2025)"},
    "social_support":     {"label": "Social Support Networks",         "evidence": "Observational",
                           "target_symptoms": ["loneliness","major_depression","burnout"],
                           "source": "Hobfoll (1996); ACHA (2019)"},
    "exercise_sports":    {"label": "Physical Exercise & Sports",      "evidence": "Observational+RCT",
                           "target_biological": ["cortisol","sns_activation"],
                           "target_symptoms": ["anxiety_disorder","burnout"],
                           "source": "Mahees (2020); WHO"},
    "counseling_services":{"label": "University Counseling Services",  "evidence": "Observational",
                           "target_symptoms": ["mental_health_deterioration","suicidal_ideation","major_depression"],
                           "source": "Katherine (2000)"},
    "academic_support":   {"label": "Academic Support Programs",       "evidence": "Observational",
                           "target_stressors": ["academic_workload","poor_english"],
                           "source": "Mahees (2020)"},
    "financial_aid":      {"label": "Financial Aid & Welfare",         "evidence": "Policy",
                           "target_stressors": ["economic_hardship","food_insecurity"],
                           "source": "Mahees (2020)"},
    "simulation_training":{"label": "Simulation & Skills Training",    "evidence": "Quasi-experimental",
                           "target_stressors": ["academic_self_efficacy"],
                           "source": "Neurophysiology review (2025)"},
    "curriculum_reform":  {"label": "Curriculum Restructuring",        "evidence": "Systemic",
                           "target_stressors": ["academic_workload"],
                           "source": "Mahees (2020)"},
    "anti_ragging":       {"label": "Anti-Ragging & Safety Policies",  "evidence": "Systemic",
                           "target_stressors": ["ragging"],
                           "source": "Weeramunde (2008)"},
}

# ── Coping strategies ─────────────────────────────────────────────────────────
COPING_CATALOGUE: dict[str, dict] = {
    "problem_focused_coping": {"label": "Problem-Focused Coping",   "suitable_for": "controllable_stressors",
                                "source": "Lazarus & Folkman (1984)"},
    "emotion_focused_coping": {"label": "Emotion-Focused Coping",   "suitable_for": "uncontrollable_stressors"},
    "cognitive_reappraisal":  {"label": "Cognitive Reappraisal",    "biological_effect": "reduces cortisol reactivity",
                                "source": "Gross (1998); CBT"},
    "maladaptive_coping":     {"label": "Maladaptive Coping",       "is_risk_factor": True,
                                "linked_to": ["allostatic_load","major_depression"]},
}

# ── Validated measurement tools ───────────────────────────────────────────────
MEASUREMENT_TOOLS: dict[str, dict] = {
    "pss":                   {"label": "Perceived Stress Scale (PSS-10)", "items": 10,  "developer": "Cohen et al. (1983)",
                               "measures": ["anxiety_disorder"]},
    "phq9":                  {"label": "Patient Health Questionnaire (PHQ-9)", "items": 9, "developer": "Kroenke et al. (2001)",
                               "measures": ["major_depression"]},
    "gad7":                  {"label": "Generalized Anxiety Disorder Scale (GAD-7)", "items": 7,
                               "developer": "Spitzer et al. (2006)", "measures": ["anxiety_disorder"]},
    "dass21":                {"label": "DASS-21",                          "items": 21,
                               "measures": ["anxiety_disorder","major_depression"]},
    "mbi":                   {"label": "Maslach Burnout Inventory (MBI-SS)", "developer": "Maslach et al. (1997)",
                               "measures": ["burnout"]},
    "sisco":                 {"label": "SISCO Academic Stress Inventory",   "developer": "Barraza (2007)",
                               "measures": ["academic_workload"]},
    "salivary_biomarker_panel":{"label":"Multi-Biomarker Panel (Saliva)", "method": "ELISA",
                               "measures": ["cortisol","il1b","crp","iga"]},
}

# ── Outcome nodes ─────────────────────────────────────────────────────────────
OUTCOME_CATALOGUE: dict[str, dict] = {
    "academic_underperformance": {"label": "Academic Underperformance", "weight": 18},
    "mental_health_deterioration":{"label": "Mental Health Deterioration","weight": 18},
    "dropout":                   {"label": "Dropout & Attrition",       "weight": 15},
    "dual_burden":               {"label": "Part-Time Work & Dual Burden","weight": 13},
    "longterm_health":           {"label": "Long-Term Health Consequences","weight": 14},
    "reduced_empathy":           {"label": "Reduced Empathy & Professionalism","weight": 12},
}

# ── Theory → stressor → symptom canonical pathways ────────────────────────────
THEORY_PATHWAY_MAP: dict[str, dict] = {
    "lazarus_theory": {
        "label": "Lazarus: Appraisal & Coping (1991)",
        "activated_by":   ["exam_pressure","academic_workload","relationship_stress"],
        "key_concepts":   "primary_appraisal, secondary_appraisal, problem_focused_coping",
        "clinical_note":  "Assess perceived controllability — secondary appraisal determines coping pathway.",
    },
    "hobfoll_cor": {
        "label": "Hobfoll: Conservation of Resources (1996)",
        "activated_by":   ["economic_hardship","food_insecurity","digital_divide","loneliness"],
        "key_concepts":   "resource_loss, resource_threat, resource_gain",
        "clinical_note":  "Identify resource deficits (economic, social, informational). Restoration of resources is primary intervention target.",
    },
    "selye_gas": {
        "label": "Selye: General Adaptation Syndrome (1950)",
        "activated_by":   ["allostatic_load"],
        "key_concepts":   "alarm → resistance → exhaustion",
        "clinical_note":  "Elevated BPM + face stress + burnout cluster → possible exhaustion stage. Immediate workload reduction warranted.",
    },
    "mcewen_allostasis": {
        "label": "McEwen: Allostatic Load Theory (1998)",
        "activated_by":   ["allostatic_load","cardiovascular_risk","immune_suppression"],
        "key_concepts":   "allostatic_load, wear_and_tear",
        "clinical_note":  "Chronic multi-signal stress → allostatic load accumulation. Systemic intervention needed.",
    },
    "diathesis_stress": {
        "label": "Diathesis-Stress Model (Monroe & Simons 1991)",
        "activated_by":   ["prior_mental_health","anxiety_disorder","major_depression"],
        "key_concepts":   "vulnerability, predisposition, stress_threshold",
        "clinical_note":  "Prior mental health history lowers threshold. Prioritise early screening and referral.",
    },
    "bandura_selfefficacy": {
        "label": "Bandura: Self-Efficacy Theory (1997)",
        "activated_by":   ["academic_self_efficacy","presentation_phobia"],
        "key_concepts":   "self_efficacy, mastery_experience",
        "clinical_note":  "Targeted skills training and simulation improve efficacy beliefs and reduce perceived threat appraisal.",
    },
}


# ══════════════════════════════════════════════════════════════════════════════
# KG RESULT DATACLASS
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class KGResult:
    # Core stress classification
    severity_band: str                    = "no_stress"   # no_stress|low|moderate|high|critical
    fused_score: float                    = 0.0

    # KG nodes activated by this session
    activated_stressors: list[dict]       = field(default_factory=list)   # Stressor nodes
    activated_biological: list[dict]      = field(default_factory=list)   # Biological nodes
    activated_symptoms: list[dict]        = field(default_factory=list)   # Symptom nodes (with DSM/ICD)
    at_risk_outcomes: list[dict]          = field(default_factory=list)   # Outcome nodes

    # Clinical support
    recommended_interventions: list[dict] = field(default_factory=list)   # Intervention nodes (evidence-graded)
    coping_strategies: list[dict]         = field(default_factory=list)   # CopingStrategy nodes
    measurement_tools: list[dict]         = field(default_factory=list)   # MeasurementTool nodes (what to screen)
    active_theories: list[dict]           = field(default_factory=list)   # Theory nodes explaining this case

    # Signal breakdown
    signal_contributions: dict            = field(default_factory=dict)   # per-signal KG activation detail
    stressor_type_flags: dict             = field(default_factory=dict)   # {"acute": True, "chronic": True, ...}

    # Clinician narrative
    clinician_summary: str                = ""
    llm_context_injection: str            = ""

    # Safety flag
    is_critical: bool                     = False
    critical_reason: str                  = ""

    # Metadata
    timestamp: str                        = field(default_factory=lambda: datetime.utcnow().isoformat())
    kg_version: str                       = "comprehensive_v2"

    def to_dict(self) -> dict:
        return asdict(self)

    def to_api_response(self) -> dict:
        """Slim version for API chat endpoint response."""
        return {
            "severity_band":              self.severity_band,
            "fused_score":                round(self.fused_score, 3),
            "stressors":                  [s["label"] for s in self.activated_stressors],
            "symptoms":                   [{"label": s["label"], "dsm5": s.get("dsm5",""), "icd11": s.get("icd11","")}
                                           for s in self.activated_symptoms],
            "biological":                 [b["label"] for b in self.activated_biological],
            "interventions":              [{"label": i["label"], "evidence": i.get("evidence","")}
                                           for i in self.recommended_interventions],
            "measurement_tools":          [t["label"] for t in self.measurement_tools],
            "is_critical":                self.is_critical,
            "critical_reason":            self.critical_reason,
            "clinician_summary":          self.clinician_summary,
        }


# ══════════════════════════════════════════════════════════════════════════════
# MODEL LOADING
# ══════════════════════════════════════════════════════════════════════════════

print("[KG Engine] Loading BERT tokenizer + model …")
tokenizer   = BertTokenizer.from_pretrained("bert-base-uncased")
bert_model  = BertModel.from_pretrained("bert-base-uncased")
xgb_model   = joblib.load(TEXT_MODEL_PATH)
binary_model = load_model(BINARY_MODEL_PATH)
affect3_model = load_model(AFFECT3_MODEL_PATH)

print("[KG Engine] Loading VOSK model …")
model_vosk  = vosk.Model(VOSK_MODEL_PATH)
print("[KG Engine] VOSK loaded.")

driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))


# ══════════════════════════════════════════════════════════════════════════════
# BERT UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

def bert_encode(texts: list[str]) -> torch.Tensor:
    encoded = tokenizer(texts, return_tensors="pt", padding=True, truncation=True, max_length=512)
    with torch.no_grad():
        out = bert_model(**encoded)
    return out.last_hidden_state.mean(dim=1)


# ══════════════════════════════════════════════════════════════════════════════
# KG NODE CACHE  (loaded once from Neo4j + static catalogue)
# ══════════════════════════════════════════════════════════════════════════════

def _load_kg_nodes_from_neo4j() -> list[dict]:
    """Pull all KG nodes from the live Neo4j graph."""
    try:
        with driver.session(database=NEO4J_DB) as s:
            result = s.run(
                """
                MATCH (n:Node)
                RETURN n.id      AS id,
                       n.label   AS label,
                       n.category AS category,
                       labels(n)  AS node_labels,
                       n.weight  AS weight,
                       n.description AS description,
                       n.stressor_type AS stressor_type,
                       n.symptom_type  AS symptom_type,
                       n.dsm5_code     AS dsm5,
                       n.icd11_code    AS icd11,
                       n.measurement_scale AS scale,
                       n.evidence_level    AS evidence_level
                """
            )
            nodes = []
            for r in result:
                nodes.append({
                    "id":            r["id"],
                    "label":         r["label"],
                    "category":      r["category"],
                    "node_labels":   r["node_labels"],
                    "weight":        r["weight"] or 10,
                    "description":   r["description"] or "",
                    "stressor_type": r["stressor_type"],
                    "symptom_type":  r["symptom_type"],
                    "dsm5":          r["dsm5"],
                    "icd11":         r["icd11"],
                    "scale":         r["scale"],
                    "evidence_level":r["evidence_level"],
                })
            print(f"[KG Engine] Loaded {len(nodes)} nodes from Neo4j.")
            return nodes
    except Exception as e:
        print(f"[KG Engine] Neo4j unreachable, falling back to static catalogue: {e}")
        return _build_static_node_list()


def _build_static_node_list() -> list[dict]:
    """Fallback: build node list from the static catalogues above."""
    nodes = []
    for nid, meta in STRESSOR_CATALOGUE.items():
        nodes.append({"id": nid, "label": meta["label"], "category": "stressor",
                      "node_labels": ["Stressor","Node"], "weight": meta["weight"],
                      "description": "", "stressor_type": meta.get("type")})
    for nid, meta in BIOLOGICAL_CATALOGUE.items():
        nodes.append({"id": nid, "label": meta["label"], "category": "biological",
                      "node_labels": ["Biological","Node"], "weight": meta["weight"], "description": ""})
    for nid, meta in SYMPTOM_CATALOGUE.items():
        nodes.append({"id": nid, "label": meta["label"], "category": "symptom",
                      "node_labels": ["Symptom","Node"], "weight": meta["weight"], "description": "",
                      "dsm5": meta.get("dsm5"), "icd11": meta.get("icd11"), "scale": meta.get("scale"),
                      "symptom_type": meta.get("type")})
    for nid, meta in INTERVENTION_CATALOGUE.items():
        nodes.append({"id": nid, "label": meta["label"], "category": "intervention",
                      "node_labels": ["Intervention","Node"], "weight": 15, "description": "",
                      "evidence_level": meta.get("evidence")})
    for nid, meta in COPING_CATALOGUE.items():
        nodes.append({"id": nid, "label": meta["label"], "category": "coping",
                      "node_labels": ["CopingStrategy","Node"], "weight": 13, "description": ""})
    for nid, meta in MEASUREMENT_TOOLS.items():
        nodes.append({"id": nid, "label": meta["label"], "category": "measurement",
                      "node_labels": ["MeasurementTool","Node"], "weight": 12, "description": ""})
    for nid, meta in OUTCOME_CATALOGUE.items():
        nodes.append({"id": nid, "label": meta["label"], "category": "outcome",
                      "node_labels": ["Outcome","Node"], "weight": meta["weight"], "description": ""})
    return nodes


# Load once at module import
_KG_NODES: list[dict]       = _load_kg_nodes_from_neo4j()
_KG_TEXTS: list[str]        = [n["label"] + " " + n["description"] for n in _KG_NODES]

print("[KG Engine] Computing BERT embeddings for KG nodes …")
with torch.no_grad():
    _KG_EMBEDDINGS: np.ndarray = bert_encode(_KG_TEXTS).cpu().numpy()
print(f"[KG Engine] KG node embeddings ready. Shape: {_KG_EMBEDDINGS.shape}")


# ══════════════════════════════════════════════════════════════════════════════
# TEXT STRESS PREDICTION
# ══════════════════════════════════════════════════════════════════════════════

def predict_text_stress(text: str) -> dict:
    emb    = bert_encode([text])
    X      = emb.cpu().numpy()
    pred   = int(xgb_model.predict(X)[0])
    proba  = float(xgb_model.predict_proba(X)[0][pred])
    return {"stress_label": pred, "confidence": proba}


# ══════════════════════════════════════════════════════════════════════════════
# HYBRID CONCEPT MATCHING  (BERT cosine + keyword boost)
# Returns matched nodes grouped by KG category.
# ══════════════════════════════════════════════════════════════════════════════

def match_kg_concepts(
    text: str,
    top_k: int = KG_TOP_K,
    threshold: float = KG_SIM_THRESHOLD,
) -> dict[str, list[dict]]:
    """
    Match free text against all KG nodes using BERT similarity + keyword boost.
    Returns dict of category → list of matched node dicts with similarity scores.
    """
    with torch.no_grad():
        text_emb = bert_encode([text]).cpu().numpy()

    sims = cosine_similarity(text_emb, _KG_EMBEDDINGS)[0]
    text_lower = text.lower()

    buckets: dict[str, list] = {
        "stressor": [], "biological": [], "symptom": [],
        "intervention": [], "coping": [], "measurement": [], "outcome": [], "theory": []
    }

    for i, node in enumerate(_KG_NODES):
        score = float(sims[i])
        # Keyword boost: exact label substring in text
        if node["label"].lower() in text_lower:
            score += 0.30
        # Partial keyword boost for common terms
        for kw in node["label"].lower().split():
            if len(kw) > 4 and kw in text_lower:
                score += 0.08
                break

        if score >= threshold:
            cat = node.get("category", "")
            if cat in buckets:
                buckets[cat].append({**node, "similarity": round(score, 4)})

    # Sort each bucket by score desc, take top_k
    for cat in buckets:
        buckets[cat] = sorted(buckets[cat], key=lambda x: x["similarity"], reverse=True)[:top_k]

    return buckets


# ══════════════════════════════════════════════════════════════════════════════
# NEO4J ENRICHMENT — follow KG edges for deeper pathway data
# ══════════════════════════════════════════════════════════════════════════════

def _neo4j_enrich_symptoms_and_interventions(
    stressor_ids: list[str],
    symptom_ids: list[str],
) -> dict:
    """
    Given matched stressor + symptom node IDs, traverse the KG for:
    - Related coping mechanisms
    - Evidence-based interventions
    - Outcome risks
    """
    try:
        with driver.session(database=NEO4J_DB) as session:
            result = session.run(
                """
                MATCH (s:Node) WHERE s.id IN $stressor_ids
                OPTIONAL MATCH (s)<-[:CAUSES]-(t:Node)
                OPTIONAL MATCH (t)-[:CAN_BE_REDUCED_BY]->(cop:Node)
                OPTIONAL MATCH (i:Intervention)-[:REDUCES|TREATS|BUFFERS]->(sy:Node)
                  WHERE sy.id IN $symptom_ids
                OPTIONAL MATCH (sy)-[:LEADS_TO]->(o:Outcome)
                RETURN
                  collect(DISTINCT {id: t.id, label: t.label})      AS triggers,
                  collect(DISTINCT {id: cop.id, label: cop.label})   AS coping,
                  collect(DISTINCT {id: i.id,   label: i.label, evidence: i.evidence_level}) AS interventions,
                  collect(DISTINCT {id: o.id,   label: o.label})     AS outcomes
                """,
                stressor_ids=stressor_ids,
                symptom_ids=symptom_ids,
            )
            for row in result:
                return {
                    "triggers":      [r for r in row["triggers"]      if r.get("id")],
                    "coping":        [r for r in row["coping"]        if r.get("id")],
                    "interventions": [r for r in row["interventions"]  if r.get("id")],
                    "outcomes":      [r for r in row["outcomes"]      if r.get("id")],
                }
    except Exception as e:
        print(f"[Neo4j enrich] Error: {e}")
    return {"triggers": [], "coping": [], "interventions": [], "outcomes": []}


# ══════════════════════════════════════════════════════════════════════════════
# SIGNAL → KG BIOLOGICAL PATHWAY MAPPER
# Maps each sensor/model signal onto KG biological & symptom nodes
# ══════════════════════════════════════════════════════════════════════════════

def _map_bpm_to_kg(bpm: Optional[float]) -> dict:
    """Map raw BPM reading onto KG biological and symptom nodes."""
    if bpm is None:
        return {"biological": [], "symptoms": [], "stressor_type": None, "note": "BPM unavailable"}

    activated_bio  = []
    activated_sym  = []
    stressor_type  = None

    if bpm >= BPM_HIGH_THRESHOLD:
        # Strong SNS activation → HPA axis likely co-activated
        activated_bio = [
            {**BIOLOGICAL_CATALOGUE["sns_activation"],  "id": "sns_activation",  "signal_source": "bpm", "bpm": bpm},
            {**BIOLOGICAL_CATALOGUE["hpa_axis"],        "id": "hpa_axis",        "signal_source": "bpm", "bpm": bpm},
            {**BIOLOGICAL_CATALOGUE["cortisol"],        "id": "cortisol",        "signal_source": "bpm", "bpm": bpm,
             "note": "Cortisol spike expected at this BPM level (biomarker evidence)"},
        ]
        activated_sym = [
            {**SYMPTOM_CATALOGUE["somatic_symptoms"],   "id": "somatic_symptoms","signal_source": "bpm"},
            {**SYMPTOM_CATALOGUE["cardiovascular_risk"],"id": "cardiovascular_risk","signal_source": "bpm"},
        ]
        stressor_type = "acute"

    elif bpm >= BPM_ELEVATED_MAX:
        activated_bio = [
            {**BIOLOGICAL_CATALOGUE["sns_activation"],  "id": "sns_activation",  "signal_source": "bpm"},
            {**BIOLOGICAL_CATALOGUE["hpa_axis"],        "id": "hpa_axis",        "signal_source": "bpm"},
        ]
        activated_sym = [
            {**SYMPTOM_CATALOGUE["somatic_symptoms"],   "id": "somatic_symptoms","signal_source": "bpm"},
        ]
        stressor_type = "acute"

    elif bpm >= BPM_NORMAL_MAX:
        activated_bio = [
            {**BIOLOGICAL_CATALOGUE["sns_activation"],  "id": "sns_activation",  "signal_source": "bpm"},
        ]

    return {
        "biological":    activated_bio,
        "symptoms":      activated_sym,
        "stressor_type": stressor_type,
        "bpm":           bpm,
        "zone":          _bpm_zone(bpm),
        "note":          f"BPM={bpm:.1f} → zone={_bpm_zone(bpm)}",
    }


def _bpm_zone(bpm: float) -> str:
    if bpm < BPM_REST_MAX:      return "rest"
    if bpm < BPM_NORMAL_MAX:    return "normal"
    if bpm < BPM_ELEVATED_MAX:  return "elevated"
    return "high"


def _map_face_to_kg(face_level: str, face_score: float = 0.0) -> dict:
    """Map face stress level → KG symptom & biological nodes."""
    bio, sym = [], []
    if face_level in ("moderate", "high"):
        sym.append({**SYMPTOM_CATALOGUE["anxiety_disorder"],      "id": "anxiety_disorder",      "signal_source": "face"})
        sym.append({**SYMPTOM_CATALOGUE["emotional_dysregulation"],"id": "emotional_dysregulation","signal_source": "face"})
        bio.append({**BIOLOGICAL_CATALOGUE["sns_activation"],     "id": "sns_activation",        "signal_source": "face"})
    if face_level == "high":
        sym.append({**SYMPTOM_CATALOGUE["somatic_symptoms"],      "id": "somatic_symptoms",      "signal_source": "face"})
        bio.append({**BIOLOGICAL_CATALOGUE["hpa_axis"],           "id": "hpa_axis",              "signal_source": "face"})
    return {"biological": bio, "symptoms": sym, "face_level": face_level, "face_score": face_score}


def _map_voice_to_kg(voice_score: Optional[float]) -> dict:
    """Map voice stress score → KG biological and symptom nodes."""
    if voice_score is None:
        return {"biological": [], "symptoms": [], "note": "voice unavailable"}
    bio, sym = [], []
    if voice_score > 0.5:
        bio.append({**BIOLOGICAL_CATALOGUE["sns_activation"],     "id": "sns_activation",  "signal_source": "voice"})
        sym.append({**SYMPTOM_CATALOGUE["somatic_symptoms"],      "id": "somatic_symptoms","signal_source": "voice"})
    if voice_score > 0.75:
        bio.append({**BIOLOGICAL_CATALOGUE["hpa_axis"],           "id": "hpa_axis",        "signal_source": "voice"})
        sym.append({**SYMPTOM_CATALOGUE["anxiety_disorder"],      "id": "anxiety_disorder","signal_source": "voice"})
    return {"biological": bio, "symptoms": sym, "voice_score": voice_score}


def _map_cognitive_load_to_kg(cognitive_label: Optional[str]) -> dict:
    """Map cognitive load ML prediction → KG symptom nodes."""
    sym = []
    if cognitive_label in ("Medium", "High"):
        sym.append({**SYMPTOM_CATALOGUE["cognitive_impairment"],  "id": "cognitive_impairment", "signal_source": "cognitive"})
    if cognitive_label == "High":
        sym.append({**SYMPTOM_CATALOGUE["burnout"],               "id": "burnout",              "signal_source": "cognitive"})
        sym.append({**SYMPTOM_CATALOGUE["chronic_fatigue"],       "id": "chronic_fatigue",      "signal_source": "cognitive"})
    return {"symptoms": sym, "cognitive_label": cognitive_label}


# ══════════════════════════════════════════════════════════════════════════════
# SEVERITY BAND COMPUTATION
# ══════════════════════════════════════════════════════════════════════════════

def _compute_severity_band(
    text_label: int,
    text_confidence: float,
    voice_score: Optional[float],
    face_level: str,
    bpm: Optional[float],
    cognitive_label: Optional[str],
    suicidal_flag: bool = False,
) -> tuple[str, float]:
    """
    Weighted fusion score → severity band.
    Weights derived from KG node weights (normalised):
      text=0.30, face=0.20, bpm=0.20, voice=0.15, cognitive=0.15
    """
    if suicidal_flag:
        return "critical", 1.0

    score = 0.0

    # Text stress (binary 0/1, weighted by confidence)
    if text_label == 1:
        score += 0.30 * text_confidence

    # Face level
    face_map = {"no_stress": 0.0, "low": 0.33, "moderate": 0.66, "high": 1.0}
    score += 0.20 * face_map.get(face_level, 0.0)

    # BPM
    if bpm is not None:
        bpm_score = min((max(bpm - 60, 0)) / 60, 1.0)   # 60→0, 120→1.0
        score += 0.20 * bpm_score

    # Voice
    if voice_score is not None:
        score += 0.15 * voice_score

    # Cognitive load
    cog_map = {None: 0.0, "Low": 0.0, "Medium": 0.5, "High": 1.0}
    score += 0.15 * cog_map.get(cognitive_label, 0.0)

    if score < 0.20:   band = "no_stress"
    elif score < 0.40: band = "low"
    elif score < 0.65: band = "moderate"
    elif score < 0.85: band = "high"
    else:              band = "critical"

    return band, round(score, 4)


# ══════════════════════════════════════════════════════════════════════════════
# THEORY ACTIVATION
# ══════════════════════════════════════════════════════════════════════════════

def _activate_theories(
    activated_stressor_ids: list[str],
    activated_biological_ids: list[str],
    activated_symptom_ids: list[str],
) -> list[dict]:
    active = []
    all_ids = set(activated_stressor_ids + activated_biological_ids + activated_symptom_ids)
    for tid, theory in THEORY_PATHWAY_MAP.items():
        overlap = set(theory["activated_by"]) & all_ids
        if overlap:
            active.append({
                "id":            tid,
                "label":         theory["label"],
                "key_concepts":  theory["key_concepts"],
                "clinical_note": theory["clinical_note"],
                "triggered_by":  list(overlap),
            })
    return active


# ══════════════════════════════════════════════════════════════════════════════
# INTERVENTION SELECTOR
# ══════════════════════════════════════════════════════════════════════════════

def _select_interventions(
    severity_band: str,
    activated_symptom_ids: list[str],
    activated_stressor_ids: list[str],
    neo4j_interventions: list[dict],
) -> list[dict]:
    """Select top evidence-graded interventions from the KG."""
    selected: dict[str, dict] = {}

    # From Neo4j traversal
    for iv in neo4j_interventions:
        iid = iv.get("id")
        if iid and iid in INTERVENTION_CATALOGUE:
            selected[iid] = {**INTERVENTION_CATALOGUE[iid], "id": iid, "source": "neo4j_traversal"}

    # From static catalogue: match target_symptoms / target_stressors
    for iid, meta in INTERVENTION_CATALOGUE.items():
        if iid in selected:
            continue
        ts = meta.get("target_symptoms", [])
        tst = meta.get("target_stressors", [])
        if set(ts) & set(activated_symptom_ids):
            selected[iid] = {**meta, "id": iid}
        elif set(tst) & set(activated_stressor_ids):
            selected[iid] = {**meta, "id": iid}

    # Critical / high → always include counseling
    if severity_band in ("high", "critical") and "counseling_services" not in selected:
        selected["counseling_services"] = {**INTERVENTION_CATALOGUE["counseling_services"], "id": "counseling_services"}

    # Sort: RCT evidence first
    evidence_rank = {"RCT": 0, "Observational+RCT": 1, "Observational": 2,
                     "Quasi-experimental": 3, "Systemic": 4, "Policy": 5}
    return sorted(
        selected.values(),
        key=lambda x: evidence_rank.get(x.get("evidence", ""), 9)
    )


# ══════════════════════════════════════════════════════════════════════════════
# MEASUREMENT TOOL SELECTOR
# ══════════════════════════════════════════════════════════════════════════════

def _select_measurement_tools(activated_symptom_ids: list[str]) -> list[dict]:
    tools = []
    seen  = set()
    for tid, meta in MEASUREMENT_TOOLS.items():
        measures = meta.get("measures", [])
        if set(measures) & set(activated_symptom_ids):
            if tid not in seen:
                tools.append({**meta, "id": tid})
                seen.add(tid)
    # Always recommend PSS for general stress screening
    if "pss" not in seen:
        tools.insert(0, {**MEASUREMENT_TOOLS["pss"], "id": "pss"})
    return tools


# ══════════════════════════════════════════════════════════════════════════════
# OUTCOME RISK SELECTOR
# ══════════════════════════════════════════════════════════════════════════════

def _select_outcomes(severity_band: str, activated_symptom_ids: list[str]) -> list[dict]:
    risks = []
    if severity_band in ("moderate", "high", "critical"):
        risks.append({**OUTCOME_CATALOGUE["academic_underperformance"], "id": "academic_underperformance"})
    if severity_band in ("high", "critical"):
        risks.append({**OUTCOME_CATALOGUE["mental_health_deterioration"], "id": "mental_health_deterioration"})
    if "suicidal_ideation" in activated_symptom_ids:
        risks.append({**OUTCOME_CATALOGUE["dropout"], "id": "dropout"})
    if severity_band == "critical":
        risks.append({**OUTCOME_CATALOGUE["longterm_health"], "id": "longterm_health"})
    return risks


# ══════════════════════════════════════════════════════════════════════════════
# SUICIDALITY DETECTION
# ══════════════════════════════════════════════════════════════════════════════

SUICIDAL_KEYWORDS = [
    "kill myself", "end my life", "suicide", "suicidal", "not worth living",
    "want to die", "no reason to live", "hurt myself", "self harm",
    "overdose", "can't go on", "can't do this anymore", "don't want to be here",
]

def _detect_suicidality(text: str) -> bool:
    t = text.lower()
    return any(kw in t for kw in SUICIDAL_KEYWORDS)


# ══════════════════════════════════════════════════════════════════════════════
# CLINICIAN NARRATIVE BUILDER
# ══════════════════════════════════════════════════════════════════════════════

def _build_clinician_summary(kg_result: KGResult) -> str:
    band  = kg_result.severity_band.replace("_", " ").title()
    score = kg_result.fused_score

    stressor_labels     = [s["label"] for s in kg_result.activated_stressors[:3]]
    symptom_labels      = [s["label"] for s in kg_result.activated_symptoms[:3]]
    bio_labels          = [b["label"] for b in kg_result.activated_biological[:2]]
    intervention_labels = [i["label"] for i in kg_result.recommended_interventions[:2]]
    theory_labels       = [t["label"] for t in kg_result.active_theories[:1]]

    lines = [
        f"[CLINICIAN BRIEF — Stress KG v2]",
        f"Severity Band: {band} (fused score: {score:.2f})",
        "",
    ]
    if stressor_labels:
        lines.append(f"Active Stressors: {'; '.join(stressor_labels)}")
    if bio_labels:
        lines.append(f"Biological Pathway: {'; '.join(bio_labels)}")
    if symptom_labels:
        dsm_refs = []
        for s in kg_result.activated_symptoms[:3]:
            ref = s["label"]
            if s.get("dsm5"):  ref += f" (DSM-5:{s['dsm5']})"
            if s.get("icd11"): ref += f" / ICD-11:{s['icd11']}"
            dsm_refs.append(ref)
        lines.append(f"Flagged Symptoms: {'; '.join(dsm_refs)}")
    if theory_labels:
        lines.append(f"Theoretical Framework: {'; '.join(theory_labels)}")
    if intervention_labels:
        lines.append(f"Priority Interventions: {'; '.join(intervention_labels)}")
    if kg_result.measurement_tools:
        lines.append(f"Recommended Scales: {'; '.join(t['label'] for t in kg_result.measurement_tools[:2])}")
    if kg_result.is_critical:
        lines.append(f"⚠ CRITICAL FLAG: {kg_result.critical_reason}")
    return "\n".join(lines)


def _build_llm_context(kg_result: KGResult) -> str:
    """Generates the system-prompt context fragment injected into LLM."""
    band   = kg_result.severity_band
    stressors = ", ".join(s["label"] for s in kg_result.activated_stressors[:4]) or "none identified"
    symptoms  = ", ".join(s["label"] for s in kg_result.activated_symptoms[:3])  or "none"
    coping    = ", ".join(c["label"] for c in kg_result.coping_strategies[:2])   or "general self-care"
    ivs       = "; ".join(f"{i['label']} ({i.get('evidence','')})" for i in kg_result.recommended_interventions[:2])

    critical_note = ""
    if kg_result.is_critical:
        critical_note = (
            " IMPORTANT: This user may be in crisis. "
            "Immediately and compassionately advise contacting a counselor, mental health helpline, "
            "or emergency services. Do not engage therapeutically — signpost only."
        )

    return (
        f"[Stress KG Context] "
        f"Severity={band.upper()} (score={kg_result.fused_score:.2f}). "
        f"Activated stressors: {stressors}. "
        f"Symptoms flagged: {symptoms}. "
        f"Adaptive coping to encourage: {coping}. "
        f"Evidence-based interventions: {ivs}."
        f"{critical_note}"
    )


# ══════════════════════════════════════════════════════════════════════════════
# MASTER KG MAPPING FUNCTION
# ══════════════════════════════════════════════════════════════════════════════

def map_to_kg(
    text: str,
    text_label: int                  = 0,
    text_confidence: float           = 0.0,
    voice_score: Optional[float]     = None,
    face_level: str                  = "no_stress",
    face_score: float                = 0.0,
    bpm: Optional[float]             = None,
    bpm_zone: str                    = "unknown",
    cognitive_label: Optional[str]   = None,
    cognitive_ready: bool            = False,
) -> KGResult:
    """
    Full multi-modal → KG mapping.

    Parameters
    ──────────
    text             : User's raw message text
    text_label       : XGBoost prediction (0=no_stress, 1=stress)
    text_confidence  : Model confidence [0,1]
    voice_score      : Voice stress score [0,1] or None
    face_level       : "no_stress"|"low"|"moderate"|"high"
    face_score       : Raw face model output [0,1]
    bpm              : Pulse sensor reading (bpm) or None
    bpm_zone         : "rest"|"normal"|"elevated"|"high"
    cognitive_label  : "Low"|"Medium"|"High" or None
    cognitive_ready  : Whether cognitive load window is ready

    Returns
    ───────
    KGResult dataclass — fully populated for clinician display and LLM injection
    """

    # ── 1. Suicidality safety check (always first) ──────────────────────────
    suicidal_flag = _detect_suicidality(text)

    # ── 2. Text → KG concept matching ───────────────────────────────────────
    text_matches = match_kg_concepts(text)

    activated_stressors    = text_matches.get("stressor",  [])
    activated_bio_text     = text_matches.get("biological", [])
    activated_symptoms_text= text_matches.get("symptom",    [])
    activated_coping_text  = text_matches.get("coping",     [])

    # ── 3. Signal → KG biological / symptom mappings ────────────────────────
    bpm_kg   = _map_bpm_to_kg(bpm)
    face_kg  = _map_face_to_kg(face_level, face_score)
    voice_kg = _map_voice_to_kg(voice_score)
    cog_kg   = _map_cognitive_load_to_kg(cognitive_label if cognitive_ready else None)

    # ── 4. Merge biological activations (deduplicate by id) ─────────────────
    bio_map: dict[str, dict] = {}
    for src in [activated_bio_text, bpm_kg["biological"], face_kg["biological"], voice_kg["biological"]]:
        for node in src:
            nid = node.get("id", node.get("label", ""))
            if nid not in bio_map:
                bio_map[nid] = node
            else:
                # Merge signal sources
                existing_src = bio_map[nid].get("signal_source", "")
                new_src      = node.get("signal_source", "")
                bio_map[nid]["signal_source"] = f"{existing_src},{new_src}".strip(",")
    all_biological = list(bio_map.values())

    # ── 5. Merge symptom activations ─────────────────────────────────────────
    sym_map: dict[str, dict] = {}
    for src in [activated_symptoms_text, bpm_kg["symptoms"], face_kg["symptoms"],
                voice_kg["symptoms"], cog_kg["symptoms"]]:
        for node in src:
            nid = node.get("id", node.get("label",""))
            if nid not in sym_map:
                sym_map[nid] = node
    if suicidal_flag:
        sym_map["suicidal_ideation"] = {**SYMPTOM_CATALOGUE["suicidal_ideation"],
                                         "id": "suicidal_ideation", "signal_source": "text_keyword"}
    all_symptoms = list(sym_map.values())

    # ── 6. Severity band ─────────────────────────────────────────────────────
    band, fused_score = _compute_severity_band(
        text_label, text_confidence, voice_score, face_level, bpm, cognitive_label, suicidal_flag
    )

    # ── 7. Neo4j edge traversal ───────────────────────────────────────────────
    stressor_ids = [s.get("id","") for s in activated_stressors if s.get("id")]
    symptom_ids  = [s.get("id","") for s in all_symptoms         if s.get("id")]
    neo4j_data   = _neo4j_enrich_symptoms_and_interventions(stressor_ids, symptom_ids)

    # ── 8. Interventions ──────────────────────────────────────────────────────
    interventions = _select_interventions(
        band, symptom_ids, stressor_ids, neo4j_data.get("interventions", [])
    )

    # ── 9. Coping strategies ──────────────────────────────────────────────────
    coping_selected = activated_coping_text
    neo4j_coping    = [c for c in neo4j_data.get("coping", [])
                       if c.get("id") and c["id"] in COPING_CATALOGUE]
    for c in neo4j_coping:
        if not any(x.get("id") == c["id"] for x in coping_selected):
            coping_selected.append({**COPING_CATALOGUE[c["id"]], "id": c["id"]})
    # Always suggest cognitive_reappraisal for moderate+
    if band in ("moderate","high","critical") and not any(c.get("id")=="cognitive_reappraisal" for c in coping_selected):
        coping_selected.append({**COPING_CATALOGUE["cognitive_reappraisal"], "id": "cognitive_reappraisal"})

    # ── 10. Measurement tools ─────────────────────────────────────────────────
    measure_tools = _select_measurement_tools(symptom_ids)

    # ── 11. Outcomes at risk ──────────────────────────────────────────────────
    outcomes = _select_outcomes(band, symptom_ids)

    # ── 12. Theory activation ─────────────────────────────────────────────────
    bio_ids     = [b.get("id","") for b in all_biological]
    theories    = _activate_theories(stressor_ids, bio_ids, symptom_ids)

    # ── 13. Stressor type flags ───────────────────────────────────────────────
    stressor_types = set()
    for s in activated_stressors:
        st = s.get("stressor_type") or s.get("type")
        if st:
            stressor_types.add(st)
    # BPM contribution
    if bpm_kg.get("stressor_type"):
        stressor_types.add(bpm_kg["stressor_type"])
    stressor_type_flags = {t: True for t in stressor_types}

    # ── 14. Signal contributions log ─────────────────────────────────────────
    signal_contributions = {
        "text":      {"label": text_label, "confidence": round(text_confidence,3),
                      "stressors_matched": len(activated_stressors), "symptoms_matched": len(activated_symptoms_text)},
        "face":      {"level": face_level, "score": round(face_score,3), "symptoms": len(face_kg["symptoms"])},
        "bpm":       {"bpm": bpm, "zone": bpm_zone, "bio_activated": len(bpm_kg["biological"])},
        "voice":     {"score": voice_score, "symptoms": len(voice_kg["symptoms"])},
        "cognitive": {"label": cognitive_label, "ready": cognitive_ready, "symptoms": len(cog_kg["symptoms"])},
    }

    # ── 15. Critical flag ─────────────────────────────────────────────────────
    is_critical   = suicidal_flag or band == "critical"
    critical_reason = ""
    if suicidal_flag:
        critical_reason = "Suicidal ideation keywords detected in message text."
    elif band == "critical":
        critical_reason = f"Fused stress score {fused_score:.2f} exceeds critical threshold."

    # ── 16. Build KGResult ───────────────────────────────────────────────────
    kg = KGResult(
        severity_band            = band,
        fused_score              = fused_score,
        activated_stressors      = activated_stressors,
        activated_biological     = all_biological,
        activated_symptoms       = all_symptoms,
        at_risk_outcomes         = outcomes,
        recommended_interventions= interventions,
        coping_strategies        = coping_selected,
        measurement_tools        = measure_tools,
        active_theories          = theories,
        signal_contributions     = signal_contributions,
        stressor_type_flags      = stressor_type_flags,
        is_critical              = is_critical,
        critical_reason          = critical_reason,
    )

    kg.clinician_summary    = _build_clinician_summary(kg)
    kg.llm_context_injection = _build_llm_context(kg)

    return kg


# ══════════════════════════════════════════════════════════════════════════════
# CONVENIENCE WRAPPERS  (backward-compatible with existing main.py calls)
# ══════════════════════════════════════════════════════════════════════════════

def stress_from_text(text: str) -> dict:
    """
    Drop-in replacement for the old stress_from_text().
    Returns enriched dict including full KGResult.
    """
    result      = predict_text_stress(text)
    label       = result["stress_label"]
    confidence  = result["confidence"]

    kg          = map_to_kg(
        text           = text,
        text_label     = label,
        text_confidence= confidence,
    )

    # Legacy format (for existing main.py compatibility)
    kg_dict = {
        "symptoms":      [s["label"] for s in kg.activated_symptoms],
        "triggers":      [s["label"] for s in kg.activated_stressors],
        "coping":        [c["label"] for c in kg.coping_strategies],
        "interventions": [i["label"] for i in kg.recommended_interventions],
        "severity_band": kg.severity_band,
    }

    return {
        "text":          text,
        "stress_label":  label,
        "final_label":   "stressed" if label == 1 else "not_stressed",
        "confidence":    confidence,
        "kg_result":     kg_dict,
        "kg_full":       kg.to_dict(),
        "kg_api":        kg.to_api_response(),
        "clinician_note":kg.clinician_summary,
        "llm_context":   kg.llm_context_injection,
        "is_critical":   kg.is_critical,
    }


def stress_from_all_signals(
    text: str,
    text_label: int,
    text_confidence: float,
    voice_score: Optional[float]   = None,
    face_level: str                = "no_stress",
    face_score: float              = 0.0,
    bpm: Optional[float]           = None,
    bpm_zone: str                  = "unknown",
    cognitive_label: Optional[str] = None,
    cognitive_ready: bool          = False,
) -> KGResult:
    """
    Full multi-modal wrapper called from main.py chat/message endpoint.
    Returns complete KGResult for clinician dashboard and LLM injection.
    """
    return map_to_kg(
        text             = text,
        text_label       = text_label,
        text_confidence  = text_confidence,
        voice_score      = voice_score,
        face_level       = face_level,
        face_score       = face_score,
        bpm              = bpm,
        bpm_zone         = bpm_zone,
        cognitive_label  = cognitive_label,
        cognitive_ready  = cognitive_ready,
    )

# ══════════════════════════════════════════════════════════════════════════════
# AUDIO FEATURE EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

def extract_audio_features(audio_file_path: str) -> Optional[np.ndarray]:
    try:
        y, sr = librosa.load(audio_file_path, sr=SAMPLERATE)

        if len(y) == 0:
            print("[AUDIO FEATURES] Empty audio signal")
            return None

        energy     = float(np.mean(librosa.feature.rms(y=y)))
        tempo, _   = librosa.beat.beat_track(y=y, sr=sr)
        tempo      = float(tempo)

        pitches, mags = librosa.piptrack(y=y, sr=sr)
        pitch      = pitches[mags > np.median(mags)]
        pitch_mean = float(np.mean(pitch)) if len(pitch) else 0.0
        pitch_std  = float(np.std(pitch))  if len(pitch) else 0.0

        centroid   = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
        zcr        = float(librosa.feature.zero_crossing_rate(y).mean())

        harmonic, percussive = librosa.effects.hpss(y)
        hnr        = float(np.mean(np.abs(harmonic)) / (np.mean(np.abs(percussive)) + 1e-6))

        rms        = librosa.feature.rms(y=y)[0]
        silence    = float(np.mean(rms < np.percentile(rms, 25)))
        mfcc_mean  = np.mean(librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13), axis=1)

        features   = np.hstack([energy, tempo, pitch_mean, pitch_std,
                                 centroid, zcr, hnr, silence, mfcc_mean])

        print(f"[AUDIO FEATURES] Extracted {len(features)} features successfully")
        return features.reshape(1, -1)

    except Exception as e:
        print(f"[AUDIO FEATURES] Extraction failed: {e}")
        return None


def _predict_voice_stress(audio_file_path: str) -> Optional[float]:
    try:
        features = extract_audio_features(audio_file_path)

        if features is None:
            print("[VOICE STRESS] No features extracted — skipping prediction")
            return None

        try:
            features_scaled = StandardScaler().fit_transform(features)
        except Exception:
            features_scaled = features

        # Binary model
        binary_pred  = binary_model.predict(features_scaled, verbose=0)
        binary_score = float(binary_pred[0][0])
        print(f"[VOICE STRESS] Binary model score: {binary_score:.3f}")

        # Affect 3-class model
        affect_pred  = affect3_model.predict(features_scaled, verbose=0)
        affect_probs = affect_pred[0]
        affect_score = float(
            affect_probs[0] * 0.0 +
            affect_probs[1] * 0.5 +
            affect_probs[2] * 1.0
        )
        print(f"[VOICE STRESS] Affect3 probs: low={affect_probs[0]:.3f} "
              f"mid={affect_probs[1]:.3f} high={affect_probs[2]:.3f} "
              f"→ score={affect_score:.3f}")

        fused_voice_score = round((0.55 * binary_score) + (0.45 * affect_score), 4)
        print(f"[VOICE STRESS] Fused voice score: {fused_voice_score:.3f}")
        return fused_voice_score

    except Exception as e:
        print(f"[VOICE STRESS] Prediction failed: {e}")
        traceback.print_exc()
        return None


# ══════════════════════════════════════════════════════════════════════════════
# AUDIO TRANSCRIPTION
# ══════════════════════════════════════════════════════════════════════════════

def transcribe_audio_file(audio_file_path: str, model, rec) -> str:
    print(f"\n{'='*50}")
    print(f"[AUDIO TRANSCRIBE] 🎙️ STARTING TRANSCRIPTION")
    print(f"[AUDIO TRANSCRIBE] 📁 File: {audio_file_path}")
    print(f"{'='*50}")

    try:
        wf = wave.open(audio_file_path, "rb")

        channels  = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        nframes   = wf.getnframes()
        duration  = nframes / framerate

        print(f"[AUDIO TRANSCRIBE] 📈 Audio specs:")
        print(f"   • Channels: {channels}")
        print(f"   • Sample width: {sampwidth} bytes")
        print(f"   • Frame rate: {framerate} Hz")
        print(f"   • Total frames: {nframes:,}")
        print(f"   • Duration: {duration:.2f} seconds")

        if sampwidth != 2:
            raise ValueError(
                f"VOSK needs 16-bit PCM (sample_width=2), got {sampwidth} bytes."
            )
        if channels != 1:
            raise ValueError(f"VOSK needs mono audio, got {channels} channels.")
        if framerate != SAMPLERATE:
            raise ValueError(f"VOSK needs {SAMPLERATE}Hz, got {framerate}Hz.")

        print(f"[AUDIO TRANSCRIBE] ✅ Audio format valid for VOSK")
        rec.Reset()
        transcript  = ""
        chunk_count = 0

        while True:
            data = wf.readframes(BLOCKSIZE)
            if len(data) == 0:
                chunk_count += 1
                break

            chunk_count += 1

            if chunk_count % 50 == 0:
                progress = (chunk_count * BLOCKSIZE / nframes) * 100
                print(f"[AUDIO TRANSCRIBE] 📊 Progress: {progress:.1f}%")

            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                text   = result.get("text", "")
                if text:
                    transcript += " " + text
                    print(f"[AUDIO TRANSCRIBE] ✅ RESULT: '{text}'")
            else:
                partial      = json.loads(rec.PartialResult())
                partial_text = partial.get("partial", "")
                if partial_text and len(partial_text) > 2:
                    print(f"[AUDIO TRANSCRIBE] 🔄 Partial: '{partial_text}'")

        final_result = json.loads(rec.FinalResult())
        final_text   = final_result.get("text", "")
        if final_text:
            transcript += " " + final_text
            print(f"[AUDIO TRANSCRIBE] 🎯 FINAL TEXT: '{final_text}'")

        wf.close()
        result = transcript.strip()

        print(f"\n{'='*50}")
        print(f"[AUDIO TRANSCRIBE] 🎉 COMPLETE: '{result}'")
        print(f"[AUDIO TRANSCRIBE] 📏 {len(result)} chars / {len(result.split())} words")
        print(f"{'='*50}\n")

        return result

    except Exception as e:
        print(f"\n[AUDIO TRANSCRIBE] ❌ ERROR: {type(e).__name__}: {e}")
        print(f"{'='*50}\n")
        return ""


# ══════════════════════════════════════════════════════════════════════════════
# AUDIO PROCESSING  — transcribe + voice stress score
# ══════════════════════════════════════════════════════════════════════════════

def process_audio_file(audio_file_path: str) -> dict:
    try:
        print(f"[AUDIO PROCESS] Processing: {audio_file_path}")

        rec        = vosk.KaldiRecognizer(model_vosk, SAMPLERATE)
        transcript = transcribe_audio_file(audio_file_path, model_vosk, rec)
        print(f"[AUDIO PROCESS] Transcript: {transcript!r}")

        voice_score = _predict_voice_stress(audio_file_path)
        print(f"[AUDIO PROCESS] Voice stress score: {voice_score}")

        return {
            "success":     True,
            "transcript":  transcript,
            "voice_score": voice_score,
            "audio_file":  audio_file_path,
        }

    except Exception as e:
        print(f"[AUDIO PROCESS] Error: {e}")
        traceback.print_exc()
        return {
            "success":     False,
            "transcript":  "",
            "voice_score": None,
            "audio_file":  audio_file_path,
            "error":       f"Audio processing failed: {str(e)}",
        }


def fuse_audio_text_predictions(voice_score: float, text_label: int) -> tuple[float, int]:
    """Original binary fusion (kept for backward compat)."""
    final_score = (0.4 * voice_score) + (0.6 * (1 if text_label == 1 else 0))
    return final_score, (1 if final_score > 0.5 else 0)