import os
import json
import wave
import queue
from datetime import datetime

import numpy as np
import sounddevice as sd
import librosa
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.models import load_model
from transformers import BertTokenizer, BertModel
import torch
import joblib
import vosk

# ----------------- CONFIG -----------------
VOSK_MODEL_PATH = r"vosk-model-small-en-us-0.15"

SAMPLERATE = 16000
CHANNELS = 1
BLOCKSIZE = 10000

BINARY_MODEL_PATH = "binary_stress_model_20260108_032055.h5"
TRI_MODEL_PATH    = "affect_3class_model_20260108_031946.h5"

TEXT_MODEL_PATH = "stress_detection_xgb_model.pkl"

# ----------------- LOAD MODELS -----------------
binary_model = load_model(BINARY_MODEL_PATH)
tri_model    = load_model(TRI_MODEL_PATH)

xgb_model    = joblib.load(TEXT_MODEL_PATH)
tokenizer    = BertTokenizer.from_pretrained("bert-base-uncased")
bert_model   = BertModel.from_pretrained("bert-base-uncased")

# ----------------- AUDIO QUEUE -----------------
q = queue.Queue()

def callback(indata, frames, time, status):
    if status:
        print(status)
    q.put(bytes(indata))

# ----------------- TEXT STRESS -----------------
def bert_encode(texts):
    encoded = tokenizer(
        texts,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512
    )
    with torch.no_grad():
        outputs = bert_model(**encoded)
    embeddings = outputs.last_hidden_state.mean(dim=1)
    return embeddings

def predict_text_stress(text):
    emb = bert_encode([text])
    X_input = emb.cpu().numpy()
    pred = xgb_model.predict(X_input)[0]
    proba = xgb_model.predict_proba(X_input)[0][pred]
    return {"stress_label": int(pred), "confidence": float(proba)}

# ----------------- AUDIO FEATURE EXTRACTION -----------------
def extract_features(path):
    y, sr = librosa.load(path, sr=SAMPLERATE, mono=True)
    energy = np.mean(y**2)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    pitches, mags = librosa.piptrack(y=y, sr=sr)
    pitch = pitches[mags > np.median(mags)] if len(mags) else np.array([0])
    pitch_mean = float(np.mean(pitch))
    pitch_std = float(np.std(pitch))
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

# ----------------- VOICE PIPELINE -----------------
def voice_pipeline(audio_file: str, model_type="binary"):
    """
    Input: path to audio file
    model_type: 'binary' or 'tri'
    Output: transcript, stress label/score
    """
    # Speech recognition
    model_vosk = vosk.Model(VOSK_MODEL_PATH)
    rec = vosk.KaldiRecognizer(model_vosk, SAMPLERATE)
    full_transcript = ""

    with wave.open(audio_file, "rb") as wf:
        while True:
            data = wf.readframes(BLOCKSIZE)
            if len(data) == 0:
                break
            if rec.AcceptWaveform(data):
                result = json.loads(rec.Result())
                full_transcript += " " + result.get("text", "")

    # Extract features
    feats = extract_features(audio_file)
    feats_scaled = scale_features(feats.reshape(1, -1))

    # Predict stress
    if model_type == "binary":
        voice_score = binary_model.predict(feats_scaled)[0][0]
    elif model_type == "tri":
        preds = tri_model.predict(feats_scaled)
        voice_score = int(np.argmax(preds, axis=1)[0])
    else:
        raise ValueError("model_type must be 'binary' or 'tri'")

    return full_transcript.strip(), voice_score

# ----------------- FUSION -----------------
def fuse_predictions(voice_score, text_label, tri_class=False):
    """
    Combine voice and text predictions
    """
    text_score = 1 if text_label == 1 else 0
    final_score = (0.4 * voice_score) + (0.6 * text_score)
    if tri_class:
        final_label = int(round(final_score))
    else:
        final_label = 1 if final_score > 0.5 else 0
    return final_score, final_label