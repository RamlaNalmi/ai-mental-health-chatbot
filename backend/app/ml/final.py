# ml/final.py
from datetime import datetime
import queue, json, wave
import numpy as np
import sounddevice as sd
import librosa
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.models import load_model
from neo4j import GraphDatabase
import joblib
from transformers import BertTokenizer, BertModel
import torch
from sklearn.metrics.pairwise import cosine_similarity
import vosk

# ---------------- CONFIG ----------------
VOSK_MODEL_PATH = "vosk-model-small-en-us-0.15"
SAMPLERATE = 16000
CHANNELS = 1
BLOCKSIZE = 10000
BINARY_MODEL_PATH = "binary_stress_model_20260108_032055.h5"
AFFECT3_MODEL_PATH = "affect_3class_model_20260108_031946.h5"
TEXT_MODEL_PATH = "stress_detection_xgb_model.pkl"
NEO4J_URI = "neo4j://127.0.0.1:7687"
NEO4J_USER = "neo4j"
NEO4J_PASSWORD = "Rismiya_n24"
NEO4J_DB = "stress"

# ---------------- DATABASE ----------------
# lazy Neo4j driver: try to initialize, but tolerate absence (local dev)
_driver = None
def get_driver():
    global _driver
    if _driver is None:
        try:
            _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        except Exception as e:
            print("Warning: Neo4j driver init failed:", e)
            _driver = None
    return _driver

# ---------------- LOAD MODELS ----------------
tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")
bert_model = BertModel.from_pretrained("bert-base-uncased")
xgb_model = joblib.load(TEXT_MODEL_PATH)
binary_model = load_model(BINARY_MODEL_PATH)
affect3_model = load_model(AFFECT3_MODEL_PATH)

# ---------------- BERT ----------------
def bert_encode(texts):
    encoded = tokenizer(texts, return_tensors="pt", padding=True, truncation=True, max_length=512)
    with torch.no_grad():
        outputs = bert_model(**encoded)
    return outputs.last_hidden_state.mean(dim=1)

def predict_text_stress(text):
    emb = bert_encode([text])
    X_input = emb.cpu().numpy()
    pred = xgb_model.predict(X_input)[0]
    proba = xgb_model.predict_proba(X_input)[0][pred]
    return {"stress_label": int(pred), "confidence": float(proba)}

# ---------------- AUDIO ----------------
def extract_features(path):
    y, sr = librosa.load(path, sr=16000, mono=True)
    energy = np.mean(y**2)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    pitches, mags = librosa.piptrack(y=y, sr=sr)
    pitch = pitches[mags > np.median(mags)]
    pitch_mean = float(np.mean(pitch)) if len(pitch) else 0
    pitch_std  = float(np.std(pitch)) if len(pitch) else 0
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    zcr = librosa.feature.zero_crossing_rate(y).mean()
    harmonic, percussive = librosa.effects.hpss(y)
    hnr = np.mean(np.abs(harmonic)) / (np.mean(np.abs(percussive)) + 1e-6)
    rms = librosa.feature.rms(y=y)[0]
    silence = np.mean(rms < np.percentile(rms, 25))
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    mfcc_mean = np.mean(mfcc, axis=1)
    return np.hstack([energy, tempo, pitch_mean, pitch_std, centroid, zcr, hnr, silence, mfcc_mean])

def scale_features(X):
    scaler = StandardScaler()
    return scaler.fit_transform(X)

# ---------------- VOICE RECORDING ----------------
q = queue.Queue()
def callback(indata, frames, time, status):
    if status: print(status)
    q.put(bytes(indata))

def voice_pipeline():
    model_vosk = vosk.Model(VOSK_MODEL_PATH)
    rec = vosk.KaldiRecognizer(model_vosk, SAMPLERATE)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    audio_file = f"recording_{timestamp}.wav"
    full_transcript = ""

    with sd.RawInputStream(samplerate=SAMPLERATE, blocksize=BLOCKSIZE, dtype="int16", channels=CHANNELS, callback=callback):
        with wave.open(audio_file, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLERATE)
            try:
                while True:
                    data = q.get()
                    wf.writeframes(data)
                    if rec.AcceptWaveform(data):
                        result = json.loads(rec.Result())
                        full_transcript += " " + result.get("text", "")
                    else:
                        partial = json.loads(rec.PartialResult())
                        if partial.get("partial"):
                            print("\r⏳", partial["partial"], end="")
            except KeyboardInterrupt:
                pass

    feats = extract_features(audio_file)
    feats_scaled = scale_features(feats.reshape(1, -1))
    voice_score = binary_model.predict(feats_scaled)[0][0]
    return full_transcript, voice_score

# ---------------- FUSION ----------------
def fuse_predictions(voice_score, text_label):
    text_score = 1 if text_label == 1 else 0
    final_score = (0.4 * voice_score) + (0.6 * text_score)
    final_label = 1 if final_score > 0.5 else 0
    return final_score, final_label

# ---------------- KG ----------------
def get_kg_nodes():
    d = get_driver()
    if not d:
        return []
    try:
        with d.session(database=NEO4J_DB) as session:
            result = session.run(
                "MATCH (n) WHERE n:Symptom OR n:StressTrigger OR n:StressCategory OR n:CopingMechanism RETURN n.name AS name, labels(n) AS labels"
            )
            return [{"name": r["name"], "labels": r["labels"]} for r in result]
    except Exception as e:
        print("Warning: Unable to query Neo4j:", e)
        return []

kg_nodes = []
try:
    kg_nodes = get_kg_nodes()
except Exception as e:
    print("Warning: could not load KG nodes:", e)

if kg_nodes:
    kg_texts = [node["name"] for node in kg_nodes]
    with torch.no_grad():
        kg_embeddings = bert_encode(kg_texts).cpu().numpy()
else:
    kg_texts = []
    # empty embeddings with correct hidden dim to keep downstream code safe
    hidden_size = getattr(bert_model.config, "hidden_size", 768)
    kg_embeddings = np.empty((0, hidden_size))

def match_concepts_hybrid(text, top_k=10, threshold=0.51):
    if not kg_nodes or kg_embeddings.shape[0] == 0:
        return [], [], [], []

    with torch.no_grad():
        text_emb = bert_encode([text]).cpu().numpy()
    sims = cosine_similarity(text_emb, kg_embeddings)[0]
    matched_symptoms, matched_triggers, matched_categories, matched_coping = [], [], [], []

    for i, node in enumerate(kg_nodes):
        node_name_lower = node["name"].lower()
        text_lower = text.lower()
        score = sims[i]
        if node_name_lower in text_lower:
            score += 0.3
        if score >= threshold:
            labels = node["labels"]
            if "Symptom" in labels: matched_symptoms.append((node["name"], score))
            elif "StressTrigger" in labels: matched_triggers.append((node["name"], score))
            elif "StressCategory" in labels: matched_categories.append((node["name"], score))
            elif "CopingMechanism" in labels: matched_coping.append((node["name"], score))

    matched_symptoms = [x[0] for x in sorted(matched_symptoms, key=lambda x: x[1], reverse=True)[:top_k]]
    matched_triggers = [x[0] for x in sorted(matched_triggers, key=lambda x: x[1], reverse=True)[:top_k]]
    matched_categories = [x[0] for x in sorted(matched_categories, key=lambda x: x[1], reverse=True)[:top_k]]
    matched_coping = [x[0] for x in sorted(matched_coping, key=lambda x: x[1], reverse=True)[:top_k]]

    return matched_symptoms, matched_triggers, matched_categories, matched_coping

def query_kg_filtered(symptoms, triggers):
    if not symptoms and not triggers:
        return {"symptoms": [], "triggers": [], "categories": [], "coping": []}

    d = get_driver()
    if not d:
        return {"symptoms": [], "triggers": [], "categories": [], "coping": []}

    try:
        with d.session(database=NEO4J_DB) as session:
            result = session.run("""
                MATCH (s:Symptom) WHERE s.name IN $symptoms
                OPTIONAL MATCH (s)<-[:CAUSES]-(t:StressTrigger) WHERE t.name IN $triggers
                OPTIONAL MATCH (t)-[:BELONGS_TO]->(c:StressCategory)
                OPTIONAL MATCH (t)-[:CAN_BE_REDUCED_BY]->(cop:CopingMechanism)
                RETURN collect(DISTINCT s.name) AS symptoms,
                       collect(DISTINCT t.name) AS triggers,
                       collect(DISTINCT c.name) AS categories,
                       collect(DISTINCT cop.name) AS coping
            """, symptoms=symptoms, triggers=triggers)
            for r in result:
                return dict(r)
    except Exception as e:
        print("Warning: Unable to query filtered Neo4j concepts:", e)
    return {"symptoms": [], "triggers": [], "categories": [], "coping": []}

# ---------------- WRAPPERS ----------------
def stress_from_text(text: str):
    result = predict_text_stress(text)
    label = result["stress_label"]
    confidence = result["confidence"]
    symptoms, triggers, categories, coping = match_concepts_hybrid(text)
    kg_result = query_kg_filtered(symptoms, triggers)
    return {
        "text": text,
        "stress_label": label,
        "confidence": confidence,
        "kg_result": kg_result
    }

def stress_from_voice():
    transcript, voice_score = voice_pipeline()
    text_result = predict_text_stress(transcript)
    final_score, final_label = fuse_predictions(voice_score, text_result["stress_label"])
    symptoms, triggers, categories, coping = match_concepts_hybrid(transcript)
    kg_result = query_kg_filtered(symptoms, triggers)
    return {
        "transcript": transcript,
        "voice_score": voice_score,
        "text_result": text_result,
        "final_score": final_score,
        "final_label": final_label,
        "kg_result": kg_result
    }
