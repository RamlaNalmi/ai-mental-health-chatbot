"""
Combined Stress Detection + Cognitive Load FastAPI Backend
- Face-based stress detection (webcam via OpenCV + Keras model)
- Typing/voice cognitive load tracking (ML model + feature engineering)
- AI chat assistant with adaptive system prompts
- BPM monitoring via serial (Arduino/pulse sensor)
- JWT auth, SQLAlchemy DB, per-user baselines
- Full multi-modal analytics saved per message to Supabase
"""

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Body, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import torch
import cv2
import numpy as np
import base64
import threading
import time
import serial
import re
import traceback
import os
import queue
import random
import json
import jwt
from datetime import datetime
from pydantic import BaseModel

# -- Local imports --
from .db import get_db, Base, engine
from .config import settings
from . import models, schemas
from .auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    get_current_user,
)
from .ml.model import load_artifact
from .ml.feature_engineering import typing_features, text_features, build_x10
from .ml.inference import get_baseline_mean10, compute_baseline_delta, update_baseline, predict_if_ready
from .ml.final import stress_from_text, process_audio_file
from .ml.fusion import fuse_signals, SignalInput, FusionResult
from .llm_client import llm_chat, LLMError, simple_fallback_reply
from .analytics_writer import save_message_analytics

# ─────────────────────────────────────────────
# APP INIT
# ─────────────────────────────────────────────
app = FastAPI(title="Stress + Cognitive Load Backend", version="2.0.0")

# NOTE: Base.metadata.create_all() removed — tables are managed via Supabase SQL migration

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://angular-recoup-broadness.ngrok-free.dev"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request, call_next):
    print(f"[{request.method}] {request.url.path}")
    response = await call_next(request)
    return response


# ─────────────────────────────────────────────
# ML MODEL (Cognitive Load)
# ─────────────────────────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
ml_model, scaler, feature_order, label_map, inv_label_map = load_artifact(
    settings.MODEL_PATH, device=DEVICE
)


# ─────────────────────────────────────────────
# SERIAL / ARDUINO SENSOR MONITOR
# ─────────────────────────────────────────────
class SerialMonitor:
    BPM_ZONES = [
        (0,   60,  "rest"),
        (60,  100, "normal"),
        (100, 120, "elevated"),
        (120, 999, "high"),
    ]
    BPM_ALERT_THRESHOLD = 110
    MAX_HISTORY = 300

    def __init__(self, port: str = "COM4", baud: int = 115200):
        self.port = port
        self.baud = baud
        self.ser = None
        self.running = False
        self.connected = False

        self.latest_bpm: float | None = None
        self.latest_spo2: float | None = None
        self.latest_gsr: float | None = None
        self.last_seen: datetime | None = None

        self.bpm_history: list[float] = []
        self.full_history: list[dict] = []

        self.alerts: list[dict] = []
        self._last_alert_bpm: float | None = None

        self._lock = threading.Lock()

    @property
    def bpm_zone(self) -> str:
        if self.latest_bpm is None:
            return "unknown"
        for lo, hi, label in self.BPM_ZONES:
            if lo <= self.latest_bpm < hi:
                return label
        return "unknown"

    @property
    def avg_bpm(self) -> float | None:
        h = self.bpm_history[-60:] if self.bpm_history else []
        return round(sum(h) / len(h), 1) if h else None

    def connect(self):
        try:
            self.ser = serial.Serial(self.port, self.baud, timeout=1)
            self.running = True
            self.connected = True
            print(f"[Serial] Connected on {self.port} @ {self.baud} baud")
            threading.Thread(target=self._loop, daemon=True).start()
        except Exception as e:
            self.connected = False
            print(f"[Serial] Could not open {self.port}: {e}")

    def disconnect(self):
        self.running = False
        self.connected = False
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass

    def get_status(self) -> dict:
        with self._lock:
            return {
                "connected": self.connected,
                "port": self.port,
                "baud": self.baud,
                "latest_bpm": self.latest_bpm,
                "latest_spo2": self.latest_spo2,
                "latest_gsr": self.latest_gsr,
                "bpm_zone": self.bpm_zone,
                "avg_bpm_last60s": self.avg_bpm,
                "last_seen": self.last_seen.isoformat() if self.last_seen else None,
                "total_samples": len(self.bpm_history),
            }

    def get_history(self, limit: int = 100) -> dict:
        with self._lock:
            return {
                "bpm_history": self.bpm_history[-limit:],
                "full_history": self.full_history[-limit:],
                "alerts": self.alerts[-20:],
            }

    def clear_history(self):
        with self._lock:
            self.bpm_history.clear()
            self.full_history.clear()
            self.alerts.clear()

    def reconfigure(self, port: str | None = None, baud: int | None = None):
        was_running = self.running
        self.disconnect()
        if port:
            self.port = port
        if baud:
            self.baud = baud
        if was_running:
            self.connect()

    def _loop(self):
        while self.running:
            try:
                raw = self.ser.readline()
                if not raw:
                    continue
                text = raw.decode("utf-8", errors="ignore").strip()
                self._parse_line(text)
            except Exception:
                time.sleep(0.3)

    def _parse_line(self, text: str):
        now = datetime.now()
        record: dict = {"timestamp": now.isoformat()}
        changed = False

        m = re.search(r"BPM\s*=\s*([0-9.]+)", text, re.IGNORECASE)
        if m:
            bpm = float(m.group(1))
            record["bpm"] = bpm
            with self._lock:
                self.latest_bpm = bpm
                self.last_seen = now
                self.bpm_history.append(bpm)
                if len(self.bpm_history) > self.MAX_HISTORY:
                    self.bpm_history.pop(0)
                self._check_bpm_alert(bpm, now)
            changed = True

        m2 = re.search(r"SPO2\s*=\s*([0-9.]+)", text, re.IGNORECASE)
        if m2:
            record["spo2"] = float(m2.group(1))
            with self._lock:
                self.latest_spo2 = float(m2.group(1))
            changed = True

        m3 = re.search(r"GSR\s*=\s*([0-9.]+)", text, re.IGNORECASE)
        if m3:
            record["gsr"] = float(m3.group(1))
            with self._lock:
                self.latest_gsr = float(m3.group(1))
            changed = True

        if changed:
            with self._lock:
                self.full_history.append(record)
                if len(self.full_history) > self.MAX_HISTORY:
                    self.full_history.pop(0)

    def _check_bpm_alert(self, bpm: float, now: datetime):
        if bpm >= self.BPM_ALERT_THRESHOLD:
            last = self._last_alert_bpm
            if last is None or abs(bpm - last) >= 5:
                alert = {
                    "timestamp": now.isoformat(),
                    "bpm": bpm,
                    "zone": self.bpm_zone,
                    "message": f"Elevated heart rate detected: {bpm:.0f} BPM",
                }
                self.alerts.append(alert)
                if len(self.alerts) > 50:
                    self.alerts.pop(0)
                self._last_alert_bpm = bpm
                print(f"[Serial] ALERT: {alert['message']}")


# ─────────────────────────────────────────────
# RECOMMENDATION MANAGER
# ─────────────────────────────────────────────
class RecommendationManager:
    def __init__(self, json_file: str):
        try:
            with open(json_file) as f:
                self.data = json.load(f)
        except FileNotFoundError:
            self.data = {
                "no_stress": [{"type": "general",   "text": "You're doing great! Keep it up.",                          "action": None}],
                "low":       [{"type": "breathing",  "text": "Try 4-7-8 breathing for 2 minutes.",                      "action": "breathing"}],
                "moderate":  [{"type": "break",      "text": "Take a 5-minute walk away from your screen.",             "action": "break"}],
                "high":      [{"type": "urgent",     "text": "Please step away and rest. Drink some water.",            "action": "urgent"}],
            }
        self.last_shown: dict[str, str | None] = {}

    def get_next(self, stress_level: str) -> dict | None:
        options = self.data.get(stress_level, [])
        if not options:
            return None
        last = self.last_shown.get(stress_level)
        filtered = [r for r in options if r.get("type") != last] or options
        choice = random.choice(filtered)
        self.last_shown[stress_level] = choice.get("type")
        return choice

    def adapt(self, stress_level: str):
        self.last_shown[stress_level] = None


# ─────────────────────────────────────────────
# WEBCAM STRESS DETECTION SYSTEM
# ─────────────────────────────────────────────
class StressDetectionSystem:
    def __init__(self):
        from tensorflow.keras.models import load_model as keras_load
        self.face_model = keras_load(settings.STRESS_MODEL_PATH)
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self.rec_manager = RecommendationManager(
            getattr(settings, "RECOMMENDATIONS_PATH", "recommendations.json")
        )

        self.cap = None
        self.running = False
        self.mock_mode = False
        self._frame_lock = threading.Lock()
        self._current_frame = None

        self.stress_count = 0
        self.total_stress_frames = 0
        self.stress_episodes = 0
        self._window_start = time.time()  # FIX: was missing, caused AttributeError in _stats_loop
        self.stress_level = "no_stress"
        self.fps = 0
        self.face_detected = False
        self._last_pred_time = 0
        self.pred_interval = 0.1
        self.classify_interval = 30
        self.confidence_threshold = 0.5

        self.bpm_history: list[float] = []
        self.current_rec: dict | None = None
        self.rec_history: list[dict] = []
        self.session_start: datetime | None = None

    def start(self) -> bool:
        if self.running:
            return True

        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            print("[CAMERA] No physical camera found, using mock mode")
            self.cap = None
            self.mock_mode = True
        else:
            self.mock_mode = False
            print("[CAMERA] Physical camera opened successfully")

        self.running = True
        self.session_start = datetime.now()

        if self.mock_mode:
            threading.Thread(target=self._mock_camera_loop, daemon=True).start()
        else:
            threading.Thread(target=self._camera_loop, daemon=True).start()

        threading.Thread(target=self._stats_loop, daemon=True).start()
        return True

    def stop(self):
        self.running = False
        if self.cap:
            self.cap.release()

    def get_frame_b64(self) -> str | None:
        with self._frame_lock:
            frame = self._current_frame
        if frame is None:
            return None
        try:
            resized = cv2.resize(frame, (320, 240))
            _, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 70])
            return base64.b64encode(buf).decode()
        except Exception:
            return None

    def get_snapshot(self) -> dict:
        bpm = _sensor.latest_bpm if _sensor else None
        return {
            "stress_level": self.stress_level,
            "bpm": bpm,
            "bpm_zone": _sensor.bpm_zone if _sensor else "unknown",
            "stress_frames": self.stress_count,
            "total_stress_frames": self.total_stress_frames,
            "stress_episodes": self.stress_episodes,
            "fps": self.fps,
            "face_detected": self.face_detected,
            "current_recommendation": self.current_rec,
            "timestamp": datetime.now().isoformat(),
        }

    def get_history(self) -> dict:
        return {
            "bpm_history": self.bpm_history[-50:],
            "total_stress_frames": self.total_stress_frames,
            "stress_episodes": self.stress_episodes,
            "session_duration_seconds": (
                (datetime.now() - self.session_start).total_seconds()
                if self.session_start else 0
            ),
            "recommendation_history": self.rec_history[-10:],
        }

    def reset(self):
        self.stress_count = 0
        self.total_stress_frames = 0
        self.stress_episodes = 0
        self.bpm_history.clear()
        self.rec_history.clear()
        self._window_start = time.time()

    def update_config(self, confidence: float | None = None, classify_interval: int | None = None):
        if confidence is not None:
            self.confidence_threshold = confidence
        if classify_interval is not None:
            self.classify_interval = classify_interval

    def analyze_face(self, image_bytes: bytes) -> dict:
        try:
            np_arr = np.frombuffer(image_bytes, dtype=np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if frame is None:
                return {"stress_level": "no_stress", "confidence": 0.0, "face_detected": False}

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = self.face_cascade.detectMultiScale(gray, 1.1, 5)

            if len(faces) == 0:
                return {"stress_level": "no_stress", "confidence": 0.0, "face_detected": False}

            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            face_img = cv2.resize(frame[y:y + h, x:x + w], (128, 128))
            inp = np.expand_dims(face_img / 255.0, axis=0)

            pred = float(self.face_model.predict(inp, verbose=0)[0][0])
            return {
                "stress_level": _classify_stress_from_score(pred),
                "confidence": pred,
                "face_detected": True,
            }
        except Exception as e:
            print(f"[analyze_face] Error: {e}")
            return {"stress_level": "no_stress", "confidence": 0.0, "face_detected": False}

    def _camera_loop(self):
        fc, t0 = 0, time.time()
        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                time.sleep(0.05)
                continue
            fc += 1
            if time.time() - t0 >= 1.0:
                self.fps = fc
                fc, t0 = 0, time.time()
            processed = self._process_frame(frame)
            with self._frame_lock:
                self._current_frame = processed
            time.sleep(0.01)

    def _mock_camera_loop(self):
        """Mock camera loop that generates synthetic frames for testing"""
        fc, t0 = 0, time.time()
        while self.running:
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            frame[:] = (30, 30, 40)

            cv2.putText(frame, "MOCK CAMERA - TESTING MODE", (50, 240),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            if np.random.random() < 0.3:
                self.face_detected = True
                cv2.rectangle(frame, (200, 150), (440, 350), (0, 255, 0), 2)
                cv2.putText(frame, "Mock Face", (220, 140),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            else:
                self.face_detected = False

            if self.face_detected and np.random.random() < 0.2:
                self.stress_count += 1
                cv2.putText(frame, "STRESS DETECTED", (200, 400),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

            cv2.putText(frame, f"FPS: {self.fps}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            cv2.putText(frame, f"Stress Level: {self.stress_level}", (10, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            fc += 1
            if time.time() - t0 >= 1.0:
                self.fps = fc
                fc, t0 = 0, time.time()

            with self._frame_lock:
                self._current_frame = frame
            time.sleep(0.1)

    def _process_frame(self, frame: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(gray, 1.1, 5)
        self.face_detected = len(faces) > 0

        for (x, y, w, h) in faces:
            cv2.rectangle(frame, (x, y), (x + w, y + h), (255, 0, 0), 2)
            now = time.time()
            if now - self._last_pred_time >= self.pred_interval:
                face = cv2.resize(frame[y:y + h, x:x + w], (128, 128))
                inp = np.expand_dims(face / 255.0, axis=0)
                pred = self.face_model.predict(inp, verbose=0)[0][0]
                if pred > self.confidence_threshold:
                    self.stress_count += 1
                    self.total_stress_frames += 1
                    if self.stress_count > 50:
                        self.stress_episodes += 1
                label = "Stress" if pred > self.confidence_threshold else "No Stress"
                cv2.putText(frame, label, (x, y - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
                self._last_pred_time = now

        bpm_text = f"BPM: {_sensor.latest_bpm:.1f}" if (_sensor and _sensor.latest_bpm) else "BPM: --"
        for i, (txt, color) in enumerate([
            (bpm_text,                             (0, 255, 255)),
            (f"Stress Frames: {self.stress_count}", (0, 0, 255)),
            (f"Level: {self.stress_level}",         (255, 0, 0)),
            (f"FPS: {self.fps}",                    (255, 255, 255)),
        ]):
            cv2.putText(frame, txt, (10, 30 + i * 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
        return frame

    def _stats_loop(self):
        while self.running:
            try:
                if time.time() - self._window_start >= self.classify_interval:
                    self.stress_level = _classify_stress(self.stress_count)
                    self.current_rec = self.rec_manager.get_next(self.stress_level)
                    if self.current_rec:
                        self.rec_history.append({
                            "timestamp": datetime.now().isoformat(),
                            "level": self.stress_level,
                            "recommendation": self.current_rec,
                        })
                    self.stress_count = 0
                    self._window_start = time.time()
                time.sleep(0.5)
            except Exception as e:
                print(f"[Stats loop] {e}")
                time.sleep(1)


# ─────────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────────
def _classify_stress(count: int) -> str:
    if count < 50:       return "no_stress"
    elif count < 110:    return "low"
    elif count < 230:    return "moderate"
    else:                return "high"


def _classify_stress_from_score(score: float) -> str:
    if score < 0.35:   return "no_stress"
    elif score < 0.55: return "low"
    elif score < 0.75: return "moderate"
    else:              return "high"


def _log_pipeline(label: str, data: dict):
    print(f"\n{'=' * 60}")
    print(f"  {label}")
    print(f"{'=' * 60}")
    for k, v in data.items():
        print(f"  {k:30s}: {v}")
    print(f"{'=' * 60}\n")


# ─────────────────────────────────────────────
# SINGLETON INSTANCES
# ─────────────────────────────────────────────
_sensor = SerialMonitor(
    port=getattr(settings, "SERIAL_PORT", "COM4"),
    baud=getattr(settings, "SERIAL_BAUD", 115200),
)
_sensor.connect()

_stress_system = StressDetectionSystem()


# ─────────────────────────────────────────────
# AUTH ROUTES
# ─────────────────────────────────────────────
@app.post("/auth/signup", response_model=schemas.TokenOut, tags=["Auth"])
def signup(req: schemas.SignUp, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == req.email).first():
        raise HTTPException(400, "Email already registered")
    u = models.User(
        email=req.email,
        name=req.name,
        password_hash=hash_password(req.password),
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    db.add(models.UserBaseline(user_id=u.id, is_ready=False, mean10_json={}, n_samples=0))
    db.commit()
    return schemas.TokenOut(access_token=create_access_token(u.id))


@app.post("/auth/signin", tags=["Auth"])
def signin(req: schemas.SignIn, db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.email == req.email).first()
    if not u or not verify_password(req.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    return {
        "access_token":  create_access_token(u.id),
        "refresh_token": create_refresh_token(u.id),
    }


@app.post("/auth/refresh", tags=["Auth"])
def refresh_token(refresh_token: str = Body(...), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Invalid refresh token")
        uid  = int(payload["sub"])
        user = db.query(models.User).filter(models.User.id == uid).first()
        if not user:
            raise HTTPException(401, "User not found")
        return {
            "access_token":  create_access_token(uid),
            "refresh_token": create_refresh_token(uid),
        }
    except Exception as e:
        print(f"[DEBUG] Refresh token error: {e}")
        raise HTTPException(401, "Invalid refresh token")


@app.post("/auth/token", response_model=schemas.TokenOut, tags=["Auth"])
def token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not u or not verify_password(form_data.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    return schemas.TokenOut(access_token=create_access_token(u.id))


# ─────────────────────────────────────────────
# WEBCAM / FACE STRESS ROUTES
# ─────────────────────────────────────────────
@app.post("/camera/start", tags=["Webcam"])
def camera_start(user=Depends(get_current_user)):
    try:
        ok = _stress_system.start()
        return {"status": "started", "mock_mode": _stress_system.mock_mode}
    except Exception as e:
        print(f"[CAMERA] Start error: {e}")
        _stress_system.running = True
        _stress_system.face_detected = False
        _stress_system.stress_level = "no_stress"
        return {"status": "started", "mock_mode": True}


@app.post("/camera/stop", tags=["Webcam"])
def camera_stop(user=Depends(get_current_user)):
    _stress_system.stop()
    return {"status": "stopped"}


@app.get("/camera/frame", tags=["Webcam"])
def camera_frame(user=Depends(get_current_user)):
    if not _stress_system.running:
        raise HTTPException(400, "Camera not running — call /camera/start first")
 
    with _stress_system._frame_lock:
        frame = _stress_system._current_frame
 
    if frame is None:
        raise HTTPException(503, "No frame available yet")
 
    try:
        resized = cv2.resize(frame, (320, 240))
        ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if not ok:
            raise HTTPException(500, "Frame encoding failed")
        return Response(content=buf.tobytes(), media_type="image/jpeg")
    except Exception as e:
        raise HTTPException(500, f"Frame error: {e}")


@app.get("/camera/status", tags=["Webcam"])
def camera_status(user=Depends(get_current_user)):
    snap = _stress_system.get_snapshot()
    return {
        "running":       _stress_system.running,
        "face_detected": _stress_system.face_detected,
        "fps":           _stress_system.fps,
        "stress_level":  snap["stress_level"],
        "bpm":           snap["bpm"],
        "session_start": _stress_system.session_start.isoformat() if _stress_system.session_start else None,
    }


@app.get("/camera/history", tags=["Webcam"])
def camera_history(user=Depends(get_current_user)):
    return _stress_system.get_history()


@app.post("/camera/reset", tags=["Webcam"])
def camera_reset(user=Depends(get_current_user)):
    _stress_system.reset()
    return {"status": "reset"}


@app.post("/camera/config", tags=["Webcam"])
def camera_config(
    confidence: float | None = None,
    classify_interval: int | None = None,
    user=Depends(get_current_user),
):
    _stress_system.update_config(confidence, classify_interval)
    return {
        "confidence_threshold": _stress_system.confidence_threshold,
        "classify_interval":    _stress_system.classify_interval,
    }


@app.post("/camera/snapshot/save", tags=["Webcam"])
def save_snapshot(user=Depends(get_current_user)):
    with _stress_system._frame_lock:
        frame = _stress_system._current_frame
    if frame is None:
        raise HTTPException(400, "No frame available")
    fname = f"snapshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    cv2.imwrite(fname, frame)
    return {"saved": fname}


# ─────────────────────────────────────────────
# FACE STRESS — BASE64 ENDPOINT
# ─────────────────────────────────────────────
class B64ImageIn(BaseModel):
    image_b64: str


@app.post("/face-stress/detect-b64", tags=["ML"])
def detect_face_stress_b64(req: B64ImageIn, user=Depends(get_current_user)):
    print("[DEBUG] Face detection (b64) request received")
    try:
        img_bytes = base64.b64decode(req.image_b64)
        np_arr    = np.frombuffer(img_bytes, dtype=np.uint8)
        frame     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"stress_level": "no_stress", "face_detected": False, "raw_score": 0.0}

        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = _stress_system.face_cascade.detectMultiScale(gray, 1.1, 5)

        if len(faces) == 0:
            return {"stress_level": "no_stress", "face_detected": False, "raw_score": 0.0}

        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        face_img   = cv2.resize(frame[y:y + h, x:x + w], (128, 128))
        inp        = np.expand_dims(face_img / 255.0, axis=0)

        pred = float(_stress_system.face_model.predict(inp, verbose=0)[0][0])
        return {
            "stress_level": _classify_stress_from_score(pred),
            "face_detected": True,
            "raw_score": pred,
        }
    except Exception as e:
        print(f"[face-stress/detect-b64] Error: {e}")
        return {"stress_level": "no_stress", "face_detected": False, "raw_score": 0.0, "error": str(e)}


# ─────────────────────────────────────────────
# SENSOR / ARDUINO ROUTES
# ─────────────────────────────────────────────
@app.post("/sensor/connect", tags=["Sensor"])
def sensor_connect(user=Depends(get_current_user)):
    if _sensor.connected:
        return {"status": "already_connected", "port": _sensor.port}
    _sensor.connect()
    if _sensor.connected:
        return {"status": "connected", "port": _sensor.port}
    raise HTTPException(503, f"Could not connect to {_sensor.port}. Check USB cable and port.")


@app.post("/sensor/disconnect", tags=["Sensor"])
def sensor_disconnect(user=Depends(get_current_user)):
    _sensor.disconnect()
    return {"status": "disconnected"}


@app.get("/sensor/status", tags=["Sensor"])
def sensor_status(user=Depends(get_current_user)):
    return _sensor.get_status()


@app.get("/sensor/history", tags=["Sensor"])
def sensor_history(limit: int = 100, user=Depends(get_current_user)):
    return _sensor.get_history(limit=limit)


@app.get("/sensor/alerts", tags=["Sensor"])
def sensor_alerts(user=Depends(get_current_user)):
    return {"alerts": _sensor.alerts[-20:]}


@app.post("/sensor/clear", tags=["Sensor"])
def sensor_clear(user=Depends(get_current_user)):
    _sensor.clear_history()
    return {"status": "cleared"}


@app.post("/sensor/reconfigure", tags=["Sensor"])
def sensor_reconfigure(
    port: str | None = None,
    baud: int | None = None,
    user=Depends(get_current_user),
):
    _sensor.reconfigure(port=port, baud=baud)
    return _sensor.get_status()


# ─────────────────────────────────────────────
# RECOMMENDATION ROUTES
# ─────────────────────────────────────────────
@app.get("/recommendation", tags=["Recommendations"])
def get_recommendation(user=Depends(get_current_user)):
    rec = _stress_system.current_rec
    if not rec:
        level = _classify_stress(_stress_system.stress_count)
        rec   = _stress_system.rec_manager.get_next(level)
    return {"recommendation": rec, "stress_level": _stress_system.stress_level}


@app.post("/recommendation/feedback", tags=["Recommendations"])
def recommendation_feedback(data: schemas.RecommendationFeedback, user=Depends(get_current_user)):
    if data.feedback == "no":
        _stress_system.rec_manager.adapt(_stress_system.stress_level)
    return {"status": "recorded"}


# ─────────────────────────────────────────────
# COGNITIVE LOAD — BASELINE
# ─────────────────────────────────────────────
@app.get("/baseline/status", response_model=schemas.BaselineStatus, tags=["Cognitive Load"])
def baseline_status(user=Depends(get_current_user), db: Session = Depends(get_db)):
    _, is_ready, n = get_baseline_mean10(db, user.id)
    return schemas.BaselineStatus(is_ready=is_ready, n_samples=n)


# ─────────────────────────────────────────────
# COGNITIVE LOAD — INGEST
# ─────────────────────────────────────────────
@app.post("/ingest", response_model=schemas.PredictOut, tags=["Cognitive Load"])
def ingest(req: schemas.IngestRequest, user=Depends(get_current_user), db: Session = Depends(get_db)):
    klist = [k.model_dump() for k in (req.keystrokes or [])]
    tfeat = typing_features(klist)
    xfeat = text_features(req.text)
    vfeat = req.voice_features.model_dump() if req.voice_features else {
        "pitch_variance": 0.0, "volume_fluctuation": 0.0, "tone_variability": 0.0,
    }
    if not klist and req.voice_features is None:
        raise HTTPException(422, "Provide at least keystrokes or voice_features.")

    x10 = build_x10(tfeat, xfeat, vfeat)
    mean10, baseline_ready, _ = get_baseline_mean10(db, user.id)
    bdelta = compute_baseline_delta(x10, mean10)

    db.add(models.InteractionTimestep(
        user_id=user.id,
        typing_speed=float(x10[0]),    pause_count=float(x10[1]),
        error_rate=float(x10[2]),      mean_iki_ms=float(x10[3]),
        ttr=float(x10[4]),             lexical_diversity=float(x10[5]),
        syntactic_complexity=float(x10[6]),
        pitch_variance=float(x10[7]),  volume_fluctuation=float(x10[8]),
        tone_variability=float(x10[9]),
        baseline_delta=float(bdelta),
    ))
    db.commit()
    update_baseline(db, user.id, x10)

    ready, win, pred_label, probs = predict_if_ready(db, user.id, ml_model, scaler, inv_label_map, DEVICE)
    if ready and pred_label and probs:
        db.add(models.Prediction(user_id=user.id, predicted_label=pred_label, probs_json=probs))
        db.commit()

    return schemas.PredictOut(
        ready=ready, baseline_ready=baseline_ready,
        window_size=win, predicted_label=pred_label, probs=probs,
    )


# ─────────────────────────────────────────────
# AUDIO UPLOAD
# ─────────────────────────────────────────────
@app.post("/upload-audio", tags=["Audio"])
async def upload_audio(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        ts         = datetime.now().strftime("%Y%m%d_%H%M%S")
        fname      = f"voice_{ts}.wav"
        upload_dir = os.path.join(os.getcwd(), "uploads")
        os.makedirs(upload_dir, exist_ok=True)
        path       = os.path.join(upload_dir, fname).replace("\\", "/")

        content = await file.read()
        with open(path, "wb") as f:
            f.write(content)

        result = process_audio_file(path)
        return {
            "success":      result.get("success", False),
            "transcript":   result.get("transcript", ""),
            "voice_score":  result.get("voice_score", 0.5),
            "final_score":  result.get("final_score", 0.5),
            "final_label":  result.get("final_label", 0),
            "audio_file":   fname,
            "error":        result.get("error"),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


# ─────────────────────────────────────────────
# CHAT HELPERS
# ─────────────────────────────────────────────
def _fetch_recent_chat(db: Session, session_id: int, limit: int = 20):
    rows = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.session_id == session_id)
        .order_by(models.ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(rows))


def _get_last_assistant_message(db: Session, session_id: int) -> models.ChatMessage | None:
    return (
        db.query(models.ChatMessage)
        .filter(
            models.ChatMessage.session_id == session_id,
            models.ChatMessage.role == "assistant",
        )
        .order_by(models.ChatMessage.created_at.desc())
        .first()
    )


# ─────────────────────────────────────────────
# CHAT ROUTES
# ─────────────────────────────────────────────
@app.post("/chat/start", response_model=schemas.ChatStartOut, tags=["Chat"])
def chat_start(user=Depends(get_current_user), db: Session = Depends(get_db)):
    s = models.ChatSession(user_id=user.id)
    db.add(s)
    db.commit()
    db.refresh(s)
    return schemas.ChatStartOut(session_id=s.id)


@app.post("/chat/message-fast", response_model=schemas.ChatMessageOut, tags=["Chat"])
def chat_message_fast(
    session_id: int,
    req: schemas.ChatMessageIn,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == session_id,
        models.ChatSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")

    db.add(models.ChatMessage(
        session_id=session_id, user_id=user.id, role="user", content=req.text
    ))
    db.commit()

    stress_data  = stress_from_text(req.text)
    stress_label = stress_data.get("stress_label")
    kg           = stress_data.get("kg_result", {})

    fusion_input = SignalInput(
        text_stress_label=stress_label,
        text_confidence=stress_data.get("confidence"),
        voice_available=False,
        face_stress_level=_stress_system.stress_level,
        face_running=_stress_system.running,
        bpm=_sensor.latest_bpm,
        bpm_zone=_sensor.bpm_zone,
        heart_available=_sensor.connected and _sensor.latest_bpm is not None,
        cognitive_label=None,
        cognitive_ready=False,
        kg_result=kg,
    )
    fusion: FusionResult = fuse_signals(fusion_input)

    sys_prompt = (
        "You are a supportive wellbeing chatbot for university students. "
        "You are not a clinician. Do not claim diagnosis or treatment. "
        "If the user expresses self-harm intent, advise seeking immediate professional help. "
        f"{fusion.llm_context}"
    )
    messages = [
        {"role": "system", "content": sys_prompt},
        {"role": "user",   "content": req.text},
    ]

    try:
        reply = llm_chat(messages)
    except LLMError:
        reply = simple_fallback_reply(None, False)

    db.add(models.ChatMessage(
        session_id=session_id, user_id=user.id, role="assistant", content=reply
    ))
    db.commit()

    assistant_msg = _get_last_assistant_message(db, session_id)
    if assistant_msg:
        save_message_analytics(
            db=db,
            message_id=assistant_msg.id,
            session_id=session_id,
            user_id=user.id,
            text_stress_label=stress_label,
            text_stress_confidence=stress_data.get("confidence"),
            kg_symptoms=kg.get("symptoms"),
            kg_triggers=kg.get("triggers"),
            kg_coping=kg.get("coping"),
            voice_available=False,
            face_available=_stress_system.running,
            face_stress_level=_stress_system.stress_level,
            face_detected=_stress_system.face_detected,
            heart_available=_sensor.connected and _sensor.latest_bpm is not None,
            bpm=_sensor.latest_bpm,
            bpm_zone=_sensor.bpm_zone,
            spo2=_sensor.latest_spo2,
            gsr=_sensor.latest_gsr,
            cognitive_load_ready=False,
            baseline_ready=False,
            fusion=fusion,
        )

    return schemas.ChatMessageOut(
        reply=reply,
        session_id=session_id,
        cognitive_load_ready=False,
        baseline_ready=False,
        window_size=None,
        predicted_label=None,
        probs=None,
        stress_label=stress_label,
        stress_confidence=stress_data.get("confidence"),
        kg_response=kg,
        face_stress_level=_stress_system.stress_level,
        bpm=_sensor.latest_bpm,
        bpm_zone=_sensor.bpm_zone,
        fused_score=fusion.fused_score,
        fused_label=fusion.fused_label,
        fusion_confidence=fusion.confidence,
        fusion_dashboard=fusion.dashboard,
        fusion_alert=fusion.alert,
        fusion_alert_reasons=fusion.alert_reasons,
        signals_used=fusion.signals_used,
    )


@app.post("/chat/message", response_model=schemas.ChatMessageOut, tags=["Chat"])
def chat_message(
    session_id: int,
    req: schemas.ChatMessageIn,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == session_id,
        models.ChatSession.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(404, "Session not found")

    print(f"\n{'#' * 60}")
    print(f"  CHAT/MESSAGE (FULL)  |  user={user.id}  session={session_id}")
    print(f"  User message: {req.text[:120]}")
    print(f"  Keystrokes received: {len(req.keystrokes or [])}")
    print(f"  Voice features: {'yes' if req.voice_features else 'no'}")
    print(f"  Voice score passed in: {getattr(req, 'voice_score', None)}")
    print(f"{'#' * 60}")

    db.add(models.ChatMessage(
        session_id=session_id, user_id=user.id, role="user", content=req.text
    ))
    db.commit()

    klist = [k.model_dump() for k in (req.keystrokes or [])]
    tfeat = typing_features(klist)
    xfeat = text_features(req.text)
    vfeat = req.voice_features.model_dump() if req.voice_features else {
        "pitch_variance": 0.0, "volume_fluctuation": 0.0, "tone_variability": 0.0,
    }
    if not klist and req.voice_features is None:
        raise HTTPException(422, "Provide at least keystrokes or voice_features.")

    x10 = build_x10(tfeat, xfeat, vfeat)

    _log_pipeline("TYPING / FEATURE VECTOR (x10)", {
        "typing_speed":         f"{x10[0]:.3f}",
        "pause_count":          f"{x10[1]:.3f}",
        "error_rate":           f"{x10[2]:.3f}",
        "mean_iki_ms":          f"{x10[3]:.3f}",
        "ttr":                  f"{x10[4]:.3f}",
        "lexical_diversity":    f"{x10[5]:.3f}",
        "syntactic_complexity": f"{x10[6]:.3f}",
        "pitch_variance":       f"{x10[7]:.3f}",
        "volume_fluctuation":   f"{x10[8]:.3f}",
        "tone_variability":     f"{x10[9]:.3f}",
    })

    mean10, baseline_ready, _ = get_baseline_mean10(db, user.id)
    bdelta = compute_baseline_delta(x10, mean10)
    print(f"[BASELINE]  ready={baseline_ready}  delta={bdelta:.4f}")

    db.add(models.InteractionTimestep(
        user_id=user.id,
        typing_speed=float(x10[0]),       pause_count=float(x10[1]),
        error_rate=float(x10[2]),         mean_iki_ms=float(x10[3]),
        ttr=float(x10[4]),                lexical_diversity=float(x10[5]),
        syntactic_complexity=float(x10[6]),
        pitch_variance=float(x10[7]),     volume_fluctuation=float(x10[8]),
        tone_variability=float(x10[9]),   baseline_delta=float(bdelta),
    ))
    db.commit()
    update_baseline(db, user.id, x10)

    _, baseline_ready, _ = get_baseline_mean10(db, user.id)
    ready, win, pred_label, probs = predict_if_ready(
        db, user.id, ml_model, scaler, inv_label_map, DEVICE
    )

    _log_pipeline("COGNITIVE LOAD MODEL", {
        "prediction_ready": ready,
        "window_size":      win,
        "predicted_label":  pred_label,
        "probabilities":    probs,
    })

    if ready and pred_label and probs:
        db.add(models.Prediction(
            user_id=user.id, predicted_label=pred_label, probs_json=probs
        ))
        db.commit()

    stress_data  = stress_from_text(req.text)
    stress_label = stress_data.get("final_label") or stress_data.get("stress_label")
    kg           = stress_data.get("kg_result", {})

    _log_pipeline("TEXT STRESS MODEL", {
        "stress_label": stress_label,
        "confidence":   f"{stress_data.get('confidence', 0):.3f}",
        "kg symptoms":  kg.get("symptoms", []),
        "kg triggers":  kg.get("triggers", []),
        "kg coping":    kg.get("coping", []),
    })

    voice_score     = getattr(req, "voice_score", None)
    voice_available = voice_score is not None
    print(f"[VOICE]  score={voice_score}  available={voice_available}")

    print(f"[SENSORS]  face={_stress_system.stress_level}  "
          f"face_running={_stress_system.running}  "
          f"bpm={_sensor.latest_bpm}  "
          f"bpm_zone={_sensor.bpm_zone}  "
          f"arduino={_sensor.connected}")

    fusion_input = SignalInput(
        text_stress_label=stress_label,
        text_confidence=stress_data.get("confidence"),
        voice_score=voice_score,
        voice_available=voice_available,
        face_stress_level=_stress_system.stress_level,
        face_running=_stress_system.running,
        bpm=_sensor.latest_bpm,
        bpm_zone=_sensor.bpm_zone,
        heart_available=_sensor.connected and _sensor.latest_bpm is not None,
        cognitive_label=pred_label if ready else None,
        cognitive_ready=ready,
        kg_result=kg,
    )
    fusion: FusionResult = fuse_signals(fusion_input)

    _log_pipeline("FUSION RESULT", {
        "fused_score":    f"{fusion.fused_score:.3f}",
        "fused_label":    fusion.fused_label,
        "confidence":     f"{fusion.confidence:.2f}",
        "signals_used":   fusion.signals_used,
        "dominant":       fusion.dominant_signal,
        "alert":          fusion.alert,
        "alert_reasons":  fusion.alert_reasons,
    })

    sys_prompt = (
        "You are a supportive wellbeing chatbot for university students. "
        "You are not a clinician. Do not claim diagnosis or treatment. "
        "If the user expresses self-harm intent, advise seeking immediate professional help. "
        f"{fusion.llm_context}"
    )
    history  = _fetch_recent_chat(db, session_id)
    messages = [{"role": "system", "content": sys_prompt}]
    for m in history:
        if m.role in ("user", "assistant"):
            messages.append({"role": m.role, "content": m.content})

    try:
        reply = llm_chat(messages)
        print(f"\n[LLM RESPONSE]\n  {reply[:300]}")
    except LLMError as e:
        print(f"\n[LLM ERROR] {e} — fallback")
        reply = simple_fallback_reply(pred_label if ready else None, baseline_ready)

    db.add(models.ChatMessage(
        session_id=session_id, user_id=user.id, role="assistant", content=reply
    ))
    db.commit()

    probs_safe = probs or {}
    assistant_msg = _get_last_assistant_message(db, session_id)
    if assistant_msg:
        save_message_analytics(
            db=db,
            message_id=assistant_msg.id,
            session_id=session_id,
            user_id=user.id,
            text_stress_label=stress_label,
            text_stress_confidence=stress_data.get("confidence"),
            kg_symptoms=kg.get("symptoms"),
            kg_triggers=kg.get("triggers"),
            kg_coping=kg.get("coping"),
            voice_available=voice_available,
            voice_score=voice_score,
            voice_pitch_variance=float(x10[7]),
            voice_volume_fluct=float(x10[8]),
            voice_tone_variability=float(x10[9]),
            face_available=_stress_system.running,
            face_stress_level=_stress_system.stress_level,
            face_detected=_stress_system.face_detected,
            heart_available=_sensor.connected and _sensor.latest_bpm is not None,
            bpm=_sensor.latest_bpm,
            bpm_zone=_sensor.bpm_zone,
            spo2=_sensor.latest_spo2,
            gsr=_sensor.latest_gsr,
            cognitive_load_ready=ready,
            cognitive_load_label=pred_label,
            cognitive_load_prob_low=probs_safe.get("Low"),
            cognitive_load_prob_med=probs_safe.get("Medium"),
            cognitive_load_prob_high=probs_safe.get("High"),
            baseline_ready=baseline_ready,
            baseline_delta=float(bdelta),
            typing_speed=float(x10[0]),
            pause_count=float(x10[1]),
            error_rate=float(x10[2]),
            mean_iki_ms=float(x10[3]),
            ttr=float(x10[4]),
            lexical_diversity=float(x10[5]),
            syntactic_complexity=float(x10[6]),
            fusion=fusion,
        )

    print(f"\n[DONE] chat/message complete\n")

    return schemas.ChatMessageOut(
        reply=reply,
        session_id=session_id,
        cognitive_load_ready=ready,
        baseline_ready=baseline_ready,
        window_size=win,
        predicted_label=(pred_label if ready else None),
        probs=(probs if ready else None),
        stress_label=stress_label,
        stress_confidence=stress_data.get("confidence"),
        kg_response=kg,
        face_stress_level=_stress_system.stress_level,
        bpm=_sensor.latest_bpm,
        bpm_zone=_sensor.bpm_zone,
        fused_score=fusion.fused_score,
        fused_label=fusion.fused_label,
        fusion_confidence=fusion.confidence,
        fusion_dashboard=fusion.dashboard,
        fusion_alert=fusion.alert,
        fusion_alert_reasons=fusion.alert_reasons,
        signals_used=fusion.signals_used,
    )


# ─────────────────────────────────────────────
# FUSION STATUS
# ─────────────────────────────────────────────
@app.get("/fuse/status", tags=["Fusion"])
def fuse_status(user=Depends(get_current_user)):
    fusion_input = SignalInput(
        text_stress_label=None,
        text_confidence=None,
        face_stress_level=_stress_system.stress_level,
        face_running=_stress_system.running,
        bpm=_sensor.latest_bpm,
        bpm_zone=_sensor.bpm_zone,
        heart_available=_sensor.connected and _sensor.latest_bpm is not None,
        voice_available=False,
        cognitive_ready=False,
    )
    fusion: FusionResult = fuse_signals(fusion_input)
    return {
        "fused_score":    fusion.fused_score,
        "fused_label":    fusion.fused_label,
        "confidence":     fusion.confidence,
        "signals_used":   fusion.signals_used,
        "alert":          fusion.alert,
        "alert_reasons":  fusion.alert_reasons,
        "dashboard":      fusion.dashboard,
        "signals":        fusion.signals,
        "timestamp":      fusion.timestamp,
    }


# ─────────────────────────────────────────────
# FACE STRESS — FILE UPLOAD
# ─────────────────────────────────────────────
@app.post("/face-stress/detect", tags=["Face Stress"])
async def detect_face_stress(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    try:
        image_bytes   = await file.read()
        stress_result = _stress_system.analyze_face(image_bytes)
        print(f"[FACE STRESS] User {user.id}: {stress_result}")
        return {
            "face_stress_level": stress_result.get("stress_level", "unknown"),
            "face_confidence":   stress_result.get("confidence", 0.0),
            "face_detected":     stress_result.get("face_detected", False),
            "timestamp":         datetime.now().isoformat(),
            "message":           f"Face stress detected: {stress_result.get('stress_level','unknown')}",
        }
    except Exception as e:
        print(f"[FACE STRESS ERROR] {e}")
        raise HTTPException(500, f"Face stress detection failed: {str(e)}")


# ─────────────────────────────────────────────
# ANALYTICS ROUTES
# ─────────────────────────────────────────────
@app.get("/analytics/session/{session_id}", tags=["Analytics"])
def session_analytics(
    session_id: int,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.MessageStressAnalytics)
        .filter(
            models.MessageStressAnalytics.session_id == session_id,
            models.MessageStressAnalytics.user_id    == user.id,
        )
        .order_by(models.MessageStressAnalytics.created_at.asc())
        .all()
    )
    return {"session_id": session_id, "count": len(rows), "rows": [
        {
            "id":                       r.id,
            "created_at":               r.created_at.isoformat(),
            "text_stress_label":        r.text_stress_label,
            "text_stress_confidence":   r.text_stress_confidence,
            "kg_symptoms":              r.kg_symptoms,
            "kg_triggers":              r.kg_triggers,
            "kg_coping":                r.kg_coping,
            "voice_available":          r.voice_available,
            "voice_score":              r.voice_score,
            "voice_label":              r.voice_label,
            "face_available":           r.face_available,
            "face_stress_level":        r.face_stress_level,
            "face_confidence":          r.face_confidence,
            "face_detected":            r.face_detected,
            "heart_available":          r.heart_available,
            "bpm":                      r.bpm,
            "bpm_zone":                 r.bpm_zone,
            "spo2":                     r.spo2,
            "gsr":                      r.gsr,
            "cognitive_load_ready":     r.cognitive_load_ready,
            "cognitive_load_label":     r.cognitive_load_label,
            "cognitive_load_prob_low":  r.cognitive_load_prob_low,
            "cognitive_load_prob_med":  r.cognitive_load_prob_med,
            "cognitive_load_prob_high": r.cognitive_load_prob_high,
            "baseline_delta":           r.baseline_delta,
            "typing_speed":             r.typing_speed,
            "error_rate":               r.error_rate,
            "mean_iki_ms":              r.mean_iki_ms,
            "ttr":                      r.ttr,
            "fused_score":              r.fused_score,
            "fused_label":              r.fused_label,
            "fusion_confidence":        r.fusion_confidence,
            "fusion_alert":             r.fusion_alert,
            "fusion_alert_reasons":     r.fusion_alert_reasons,
            "signals_used":             r.signals_used,
            "dominant_signal":          r.dominant_signal,
        }
        for r in rows
    ]}


@app.get("/analytics/user/summary", tags=["Analytics"])
def user_analytics_summary(
    limit: int = 10,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(models.SessionSummary)
        .filter(models.SessionSummary.user_id == user.id)
        .order_by(models.SessionSummary.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"summaries": [
        {
            "session_id":               r.session_id,
            "created_at":               r.created_at.isoformat(),
            "total_messages":           r.total_messages,
            "duration_seconds":         r.duration_seconds,
            "stress_label_counts":      r.stress_label_counts,
            "avg_fused_score":          r.avg_fused_score,
            "avg_bpm":                  r.avg_bpm,
            "peak_bpm":                 r.peak_bpm,
            "peak_fused_score":         r.peak_fused_score,
            "dominant_fused_label":     r.dominant_fused_label,
            "dominant_face_level":      r.dominant_face_level,
            "dominant_cognitive_load":  r.dominant_cognitive_load,
            "total_fusion_alerts":      r.total_fusion_alerts,
        }
        for r in rows
    ]}