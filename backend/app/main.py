"""
Combined Stress Detection + Cognitive Load FastAPI Backend

FIXES vs original (search "FIX" to jump to each one):

  [1] stress_label passed to ChatMessageOut is now the string "final_label"
      from stress_from_text(), not the raw int "stress_label".

  [2] kg_response in ChatMessageOut is now built via KGApiResponse(**kg_api_dict)
      instead of passing the raw legacy dict.

  [3] chat/message: stress_from_all_signals() (the full multi-modal KG) is called
      AFTER all signals are resolved.

  [4] LLM system prompt now injects kg_full.llm_context_injection.

  [5] analytics_writer now called via extract_kg_fields() helper.

  [6] chat/message-fast: same fixes [1][2][5] applied.

  [7] /analytics/session/{session_id}: five new KG columns included.

  [8] Duplicate import of stress_from_all_signals removed.

  [9] llm_context_injection attribute access guarded with getattr().

  [S1] SerialMonitor._parse_line() applies change thresholds — only updates
       in-memory state when BPM changes ≥ 1.0, SpO2 ≥ 0.5, GSR ≥ 5.0.
       Eliminates noise-driven history spam while keeping the read loop intact.

  [S2] SerialMonitor._db_flush_loop() persists one BpmReading row every 30 s
       (only if the value changed since the last flush).  Completely decouples
       DB writes from the serial read rate.

  [S3] _sensor._db_factory and _sensor._active_user_id are wired up at the
       bottom of this file, after SessionLocal and models are available.

  [S4] /sensor/connect now sets _sensor._active_user_id = user.id so that
       the flush loop knows which user to attribute readings to.

  [S5] /sensor/disconnect clears _sensor._active_user_id so the flush loop
       stops writing after the user disconnects.
"""

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Body, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse, JSONResponse
from fastapi import Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
import asyncio

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
import audioop
import wave
import soundfile
import scipy

from .db import get_db, Base, engine, SessionLocal
from .config import settings
from . import models, schemas
from .auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, get_current_user,
)
from .ml.model import load_artifact
from .ml.feature_engineering import typing_features, text_features, build_x10
from .ml.inference import get_baseline_mean10, compute_baseline_delta, update_baseline, predict_if_ready
from .ml.final import stress_from_text, stress_from_all_signals, process_audio_file
from .ml.fusion import fuse_signals, SignalInput, FusionResult
from .llm_client import llm_chat, LLMError, simple_fallback_reply
from .analytics_writer import save_message_analytics, extract_kg_fields


# ─────────────────────────────────────────────
# APP INIT
# ─────────────────────────────────────────────
app = FastAPI(title="Stress + Cognitive Load Backend", version="2.2.0")

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

    # [S1] Minimum delta before updating in-memory state
    BPM_CHANGE_THRESHOLD  = 1.0
    SPO2_CHANGE_THRESHOLD = 0.5
    GSR_CHANGE_THRESHOLD  = 5.0

    def __init__(self, port: str = "COM4", baud: int = 115200):
        self.port = port
        self.baud = baud
        self.ser  = None
        self.running   = False
        self.connected = False

        self.latest_bpm:  float | None = None
        self.latest_spo2: float | None = None
        self.latest_gsr:  float | None = None
        self.last_seen:   datetime | None = None

        self.bpm_history:  list[float] = []
        self.full_history: list[dict]  = []
        self.alerts:       list[dict]  = []
        self._last_alert_bpm: float | None = None
        self._lock = threading.Lock()

        # [S2][S3] DB flush state — wired up after singleton creation
        self._db_factory:        object | None = None  # set to SessionLocal below
        self._active_user_id:    int    | None = None  # set on /sensor/connect
        self._db_flush_interval: int    = 30           # seconds between DB writes
        self._last_written_bpm:  float  | None = None
        self._last_written_spo2: float  | None = None
        self._last_written_gsr:  float  | None = None

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
            self.running   = True
            self.connected = True
            print(f"[Serial] Connected on {self.port} @ {self.baud} baud")
            threading.Thread(target=self._loop,          daemon=True).start()
            threading.Thread(target=self._db_flush_loop, daemon=True).start()  # [S4]
        except Exception as e:
            self.connected = False
            print(f"[Serial] Could not open {self.port}: {e}")

    def disconnect(self):
        self.running   = False
        self.connected = False
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass

    def get_status(self) -> dict:
        with self._lock:
            return {
                "connected":       self.connected,
                "port":            self.port,
                "baud":            self.baud,
                "latest_bpm":      self.latest_bpm,
                "latest_spo2":     self.latest_spo2,
                "latest_gsr":      self.latest_gsr,
                "bpm_zone":        self.bpm_zone,
                "avg_bpm_last60s": self.avg_bpm,
                "last_seen":       self.last_seen.isoformat() if self.last_seen else None,
                "total_samples":   len(self.bpm_history),
            }

    def get_history(self, limit: int = 100) -> dict:
        with self._lock:
            return {
                "bpm_history":  self.bpm_history[-limit:],
                "full_history": self.full_history[-limit:],
                "alerts":       self.alerts[-20:],
            }

    def clear_history(self):
        with self._lock:
            self.bpm_history.clear()
            self.full_history.clear()
            self.alerts.clear()

    def reconfigure(self, port: str | None = None, baud: int | None = None):
        was_running = self.running
        self.disconnect()
        if port: self.port = port
        if baud: self.baud = baud
        if was_running: self.connect()

    def _loop(self):
        while self.running:
            try:
                raw = self.ser.readline()
                if not raw:
                    time.sleep(0.01)  # [S5] yield GIL when no data
                    continue
                text = raw.decode("utf-8", errors="ignore").strip()
                self._parse_line(text)
            except Exception:
                time.sleep(0.3)
            time.sleep(0.01)          # [S5] always yield, even on success

    def _parse_line(self, text: str):
        """
        [S1] Parse one Arduino line and update in-memory state only when the
        value has changed by more than the configured threshold.  This stops
        history lists from filling with identical readings on every serial tick.
        """
        now = datetime.now()
        record: dict = {"timestamp": now.isoformat()}
        changed = False

        m = re.search(r"BPM\s*=\s*([0-9.]+)", text, re.IGNORECASE)
        if m:
            bpm = float(m.group(1))
            with self._lock:
                prev = self.latest_bpm
                if prev is None or abs(bpm - prev) >= self.BPM_CHANGE_THRESHOLD:
                    record["bpm"]   = bpm
                    self.latest_bpm = bpm
                    self.last_seen  = now
                    self.bpm_history.append(bpm)
                    if len(self.bpm_history) > self.MAX_HISTORY:
                        self.bpm_history.pop(0)
                    self._check_bpm_alert(bpm, now)
                    changed = True

        m2 = re.search(r"SPO2\s*=\s*([0-9.]+)", text, re.IGNORECASE)
        if m2:
            spo2 = float(m2.group(1))
            with self._lock:
                prev = self.latest_spo2
                if prev is None or abs(spo2 - prev) >= self.SPO2_CHANGE_THRESHOLD:
                    record["spo2"]   = spo2
                    self.latest_spo2 = spo2
                    changed = True

        m3 = re.search(r"GSR\s*=\s*([0-9.]+)", text, re.IGNORECASE)
        if m3:
            gsr = float(m3.group(1))
            with self._lock:
                prev = self.latest_gsr
                if prev is None or abs(gsr - prev) >= self.GSR_CHANGE_THRESHOLD:
                    record["gsr"]   = gsr
                    self.latest_gsr = gsr
                    changed = True

        if changed:
            with self._lock:
                self.full_history.append(record)
                if len(self.full_history) > self.MAX_HISTORY:
                    self.full_history.pop(0)

    def _db_flush_loop(self):
        """
        [S2] Daemon thread: every _db_flush_interval seconds, write one
        BpmReading row to Postgres — but only if the reading changed since the
        last flush.  Requires _db_factory and _active_user_id to be set.
        """
        while self.running:
            time.sleep(self._db_flush_interval)

            if self._db_factory is None or self._active_user_id is None:
                continue
            if self.latest_bpm is None:
                continue

            with self._lock:
                bpm      = self.latest_bpm
                spo2     = self.latest_spo2
                gsr      = self.latest_gsr
                zone     = self.bpm_zone
                is_alert = bpm >= self.BPM_ALERT_THRESHOLD

            # Skip flush if nothing changed since last write
            if bpm == self._last_written_bpm:
                continue

            try:
                db = next(self._db_factory())
                try:
                    db.add(models.BpmReading(
                        user_id  = self._active_user_id,
                        bpm      = bpm,
                        bpm_zone = zone,
                        spo2     = spo2,
                        gsr      = gsr,
                        is_alert = is_alert,
                    ))
                    db.commit()
                    self._last_written_bpm  = bpm
                    self._last_written_spo2 = spo2
                    self._last_written_gsr  = gsr
                    print(
                        f"[Serial] DB flush → BPM={bpm:.1f}  zone={zone}  "
                        f"SpO2={spo2}  GSR={gsr}  alert={is_alert}  "
                        f"user={self._active_user_id}"
                    )
                finally:
                    db.close()

            except Exception as e:
                print(f"[Serial] DB flush error: {e}")

    def _check_bpm_alert(self, bpm: float, now: datetime):
        if bpm >= self.BPM_ALERT_THRESHOLD:
            last = self._last_alert_bpm
            if last is None or abs(bpm - last) >= 5:
                alert = {
                    "timestamp": now.isoformat(),
                    "bpm":       bpm,
                    "zone":      self.bpm_zone,
                    "message":   f"Elevated heart rate detected: {bpm:.0f} BPM",
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
                "no_stress": [{"type": "general",   "text": "You're doing great! Keep it up.",              "action": None}],
                "low":       [{"type": "breathing",  "text": "Try 4-7-8 breathing for 2 minutes.",          "action": "breathing"}],
                "moderate":  [{"type": "break",      "text": "Take a 5-minute walk away from your screen.", "action": "break"}],
                "high":      [{"type": "urgent",     "text": "Please step away and rest. Drink some water.","action": "urgent"}],
            }
        self.last_shown: dict[str, str | None] = {}

    def get_next(self, stress_level: str) -> dict | None:
        options = self.data.get(stress_level, [])
        if not options:
            return None
        last     = self.last_shown.get(stress_level)
        filtered = [r for r in options if r.get("type") != last] or options
        choice   = random.choice(filtered)
        self.last_shown[stress_level] = choice.get("type")
        return choice

    def adapt(self, stress_level: str):
        self.last_shown[stress_level] = None


# ─────────────────────────────────────────────
# WEBCAM STRESS DETECTION SYSTEM
# ─────────────────────────────────────────────
class StressDetectionSystem:
    def __init__(self):
        import tensorflow as tf
        from tensorflow.keras.models import load_model as keras_load

        gpus = tf.config.list_physical_devices('GPU')
        for gpu in gpus:
            try:
                tf.config.experimental.set_memory_growth(gpu, True)
            except Exception:
                pass

        self.face_model   = keras_load(settings.STRESS_MODEL_PATH)
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )
        self.rec_manager = RecommendationManager(
            getattr(settings, "RECOMMENDATIONS_PATH", "recommendations.json")
        )

        self.cap        = None
        self.running    = False
        self.mock_mode  = False
        self._frame_lock   = threading.Lock()
        self._current_frame = None

        self.stress_count        = 0
        self.total_stress_frames = 0
        self.stress_episodes     = 0
        self._window_start       = time.time()
        self.stress_level        = "no_stress"
        self.fps                 = 0
        self.face_detected       = False
        self._last_pred_time     = 0
        self.pred_interval       = 2.0
        self.classify_interval   = 30
        self.confidence_threshold = 0.5
        self._pred_count         = 0

        self._pred_queue  = queue.Queue(maxsize=1)
        self._pred_result = {"stress_level": "no_stress", "score": 0.0}

        self.bpm_history:  list[float] = []
        self.current_rec:  dict | None = None
        self.rec_history:  list[dict]  = []
        self.session_start: datetime | None = None

        self._last_frame_request = time.time()
        self.AUTO_STOP_SECONDS   = 300

    def start(self) -> bool:
        if self.running:
            return True

        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            print("[CAMERA] No physical camera found, using mock mode")
            self.cap       = None
            self.mock_mode = True
        else:
            self.mock_mode = False
            print("[CAMERA] Physical camera opened successfully")

        self.running       = True
        self.session_start = datetime.now()
        self._last_frame_request = time.time()

        if self.mock_mode:
            threading.Thread(target=self._mock_camera_loop, daemon=True).start()
        else:
            threading.Thread(target=self._camera_loop, daemon=True).start()

        threading.Thread(target=self._inference_loop, daemon=True).start()
        threading.Thread(target=self._stats_loop,     daemon=True).start()
        threading.Thread(target=self._auto_stop_loop, daemon=True).start()
        return True

    def stop(self):
        self.running = False
        if self.cap:
            self.cap.release()
            self.cap = None
        with self._frame_lock:
            self._current_frame = None

    def get_frame_b64(self) -> str | None:
        self._last_frame_request = time.time()
        with self._frame_lock:
            frame = self._current_frame
        if frame is None:
            return None
        try:
            resized = cv2.resize(frame, (320, 240))
            _, buf  = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 60])
            return base64.b64encode(buf).decode()
        except Exception:
            return None

    def get_snapshot(self) -> dict:
        bpm = _sensor.latest_bpm if _sensor else None
        return {
            "stress_level":           self.stress_level,
            "bpm":                    bpm,
            "bpm_zone":               _sensor.bpm_zone if _sensor else "unknown",
            "stress_frames":          self.stress_count,
            "total_stress_frames":    self.total_stress_frames,
            "stress_episodes":        self.stress_episodes,
            "fps":                    self.fps,
            "face_detected":          self.face_detected,
            "current_recommendation": self.current_rec,
            "timestamp":              datetime.now().isoformat(),
        }

    def get_history(self) -> dict:
        return {
            "bpm_history":          self.bpm_history[-50:],
            "total_stress_frames":  self.total_stress_frames,
            "stress_episodes":      self.stress_episodes,
            "session_duration_seconds": (
                (datetime.now() - self.session_start).total_seconds()
                if self.session_start else 0
            ),
            "recommendation_history": self.rec_history[-10:],
        }

    def reset(self):
        self.stress_count        = 0
        self.total_stress_frames = 0
        self.stress_episodes     = 0
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
            frame  = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if frame is None:
                return {"stress_level": "no_stress", "confidence": 0.0, "face_detected": False}
            frame  = cv2.resize(frame, (320, 240))
            gray   = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces  = self.face_cascade.detectMultiScale(gray, 1.1, 5)
            if len(faces) == 0:
                return {"stress_level": "no_stress", "confidence": 0.0, "face_detected": False}
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            face_img   = cv2.resize(frame[y:y + h, x:x + w], (128, 128))
            inp        = np.expand_dims(face_img / 255.0, axis=0)
            pred       = float(self.face_model.predict(inp, verbose=0)[0][0])
            return {
                "stress_level": _classify_stress_from_score(pred),
                "confidence":   pred,
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
                fc, t0   = 0, time.time()
            frame = cv2.resize(frame, (320, 240))
            processed = self._process_frame(frame)
            with self._frame_lock:
                self._current_frame = processed
            time.sleep(0.033)

    def _mock_camera_loop(self):
        fc, t0 = 0, time.time()
        while self.running:
            frame = np.zeros((240, 320, 3), dtype=np.uint8)
            frame[:] = (30, 30, 40)
            cv2.putText(frame, "MOCK CAMERA", (60, 120),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            if np.random.random() < 0.3:
                self.face_detected = True
                cv2.rectangle(frame, (100, 60), (220, 180), (0, 255, 0), 2)
            else:
                self.face_detected = False
            if self.face_detected and np.random.random() < 0.2:
                self.stress_count += 1
            cv2.putText(frame, f"FPS: {self.fps}", (10, 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            cv2.putText(frame, f"Level: {self.stress_level}", (10, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
            fc += 1
            if time.time() - t0 >= 1.0:
                self.fps = fc
                fc, t0   = 0, time.time()
            with self._frame_lock:
                self._current_frame = frame
            time.sleep(0.1)

    def _inference_loop(self):
        import tensorflow as tf
        while self.running:
            try:
                face_img = self._pred_queue.get(timeout=1.0)
                inp      = np.expand_dims(face_img / 255.0, axis=0)
                pred     = float(self.face_model.predict(inp, verbose=0)[0][0])
                self._pred_result = {
                    "score":        pred,
                    "stress_level": _classify_stress_from_score(pred),
                }
                self._pred_count += 1
                if self._pred_count % 100 == 0:
                    tf.keras.backend.clear_session()
                    print(f"[Inference] TF session cleared at {self._pred_count} preds")
            except queue.Empty:
                continue
            except Exception as e:
                print(f"[Inference loop] Error: {e}")
                time.sleep(0.5)

    def _process_frame(self, frame: np.ndarray) -> np.ndarray:
        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = self.face_cascade.detectMultiScale(gray, 1.1, 5)
        self.face_detected = len(faces) > 0

        for (x, y, w, h) in faces:
            cv2.rectangle(frame, (x, y), (x + w, y + h), (255, 0, 0), 2)
            now = time.time()
            if now - self._last_pred_time >= self.pred_interval:
                face = cv2.resize(frame[y:y + h, x:x + w], (128, 128))
                if not self._pred_queue.full():
                    self._pred_queue.put_nowait(face.copy())
                self._last_pred_time = now

            pred  = self._pred_result["score"]
            level = self._pred_result["stress_level"]

            if pred > self.confidence_threshold:
                self.stress_count        += 1
                self.total_stress_frames += 1
                if self.stress_count > 50:
                    self.stress_episodes += 1

            label = "Stress" if pred > self.confidence_threshold else "No Stress"
            cv2.putText(frame, label, (x, y - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

        bpm_text = f"BPM: {_sensor.latest_bpm:.1f}" if (_sensor and _sensor.latest_bpm) else "BPM: --"
        for i, (txt, color) in enumerate([
            (bpm_text,                           (0, 255, 255)),
            (f"Stress: {self.stress_count}",     (0, 0, 255)),
            (f"Level: {self.stress_level}",      (255, 0, 0)),
            (f"FPS: {self.fps}",                 (255, 255, 255)),
        ]):
            cv2.putText(frame, txt, (10, 20 + i * 22),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1)
        return frame

    def _stats_loop(self):
        while self.running:
            try:
                if time.time() - self._window_start >= self.classify_interval:
                    self.stress_level = _classify_stress(self.stress_count)
                    self.current_rec  = self.rec_manager.get_next(self.stress_level)
                    if self.current_rec:
                        self.rec_history.append({
                            "timestamp":      datetime.now().isoformat(),
                            "level":          self.stress_level,
                            "recommendation": self.current_rec,
                        })
                    self.stress_count  = 0
                    self._window_start = time.time()
                time.sleep(0.5)
            except Exception as e:
                print(f"[Stats loop] {e}")
                time.sleep(1)

    def _auto_stop_loop(self):
        while self.running:
            time.sleep(30)
            if time.time() - self._last_frame_request > self.AUTO_STOP_SECONDS:
                print("[CAMERA] Auto-stopping due to inactivity")
                self.stop()
                break


# ─────────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────────
def _classify_stress(count: int) -> str:
    if count < 50:    return "no_stress"
    elif count < 110: return "low"
    elif count < 230: return "moderate"
    else:             return "high"


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
# [S3] Wire _db_factory and _active_user_id after SessionLocal is importable
# ─────────────────────────────────────────────
_sensor = SerialMonitor(
    port=getattr(settings, "SERIAL_PORT", "COM4"),
    baud=getattr(settings, "SERIAL_BAUD", 115200),
)
# [S3] Give the sensor a DB session factory so _db_flush_loop can persist readings
_sensor._db_factory = SessionLocal
# _sensor._active_user_id is set dynamically in /sensor/connect  (see [S4] below)
_sensor.connect()

_stress_system: StressDetectionSystem | None = None
_stress_system_lock = threading.Lock()


def get_stress_system() -> StressDetectionSystem:
    global _stress_system
    if _stress_system is None:
        with _stress_system_lock:
            if _stress_system is None:
                print("[CAMERA] Lazy-loading StressDetectionSystem...")
                _stress_system = StressDetectionSystem()
    return _stress_system


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
        system = get_stress_system()
        system.start()
        return {"status": "started", "mock_mode": system.mock_mode}
    except Exception as e:
        print(f"[CAMERA] Start error: {e}")
        system = get_stress_system()
        system.running       = True
        system.face_detected = False
        system.stress_level  = "no_stress"
        return {"status": "started", "mock_mode": True}


@app.post("/camera/stop", tags=["Webcam"])
def camera_stop(user=Depends(get_current_user)):
    get_stress_system().stop()
    return {"status": "stopped"}


@app.get("/camera/frame", tags=["Webcam"])
def camera_frame(user=Depends(get_current_user)):
    system = get_stress_system()
    if not system.running:
        raise HTTPException(400, "Camera not running — call /camera/start first")

    system._last_frame_request = time.time()

    with system._frame_lock:
        frame = system._current_frame

    if frame is None:
        raise HTTPException(503, "No frame available yet")

    try:
        resized = cv2.resize(frame, (320, 240))
        ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 60])
        if not ok:
            raise HTTPException(500, "Frame encoding failed")
        return {
            "frame_b64": base64.b64encode(buf.tobytes()).decode("utf-8"),
            "detections": {
                "stress_level":  system.stress_level,
                "face_detected": system.face_detected,
                "face_score":    round(system._pred_result.get("score", 0.0), 3),
            },
        }
    except Exception as e:
        raise HTTPException(500, f"Frame error: {e}")


@app.get("/camera/stream", tags=["Webcam"])
async def camera_stream(token: str = Query(...)):
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        uid     = int(payload["sub"])
    except Exception:
        raise HTTPException(401, "Invalid token")

    system = get_stress_system()
    if not system.running:
        raise HTTPException(400, "Camera not running")

    async def frame_generator():
        while system.running:
            with system._frame_lock:
                frame = system._current_frame
            if frame is not None:
                resized = cv2.resize(frame, (320, 240))
                ok, buf = cv2.imencode(".jpg", resized, [cv2.IMWRITE_JPEG_QUALITY, 60])
                if ok:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n\r\n"
                        + buf.tobytes()
                        + b"\r\n"
                    )
            await asyncio.sleep(0.033)

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


@app.get("/camera/status", tags=["Webcam"])
def camera_status(user=Depends(get_current_user)):
    system = get_stress_system()
    snap   = system.get_snapshot()
    return {
        "running":       system.running,
        "face_detected": system.face_detected,
        "fps":           system.fps,
        "stress_level":  snap["stress_level"],
        "bpm":           snap["bpm"],
        "session_start": system.session_start.isoformat() if system.session_start else None,
    }


@app.get("/camera/history", tags=["Webcam"])
def camera_history(user=Depends(get_current_user)):
    return get_stress_system().get_history()


@app.post("/camera/reset", tags=["Webcam"])
def camera_reset(user=Depends(get_current_user)):
    get_stress_system().reset()
    return {"status": "reset"}


@app.post("/camera/config", tags=["Webcam"])
def camera_config(
    confidence: float | None = None,
    classify_interval: int | None = None,
    user=Depends(get_current_user),
):
    system = get_stress_system()
    system.update_config(confidence, classify_interval)
    return {
        "confidence_threshold": system.confidence_threshold,
        "classify_interval":    system.classify_interval,
    }


@app.post("/camera/snapshot/save", tags=["Webcam"])
def save_snapshot(user=Depends(get_current_user)):
    system = get_stress_system()
    with system._frame_lock:
        frame = system._current_frame
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
    system = get_stress_system()
    try:
        img_bytes = base64.b64decode(req.image_b64)
        np_arr    = np.frombuffer(img_bytes, dtype=np.uint8)
        frame     = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            return {"stress_level": "no_stress", "face_detected": False, "raw_score": 0.0}

        frame = cv2.resize(frame, (320, 240))
        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = system.face_cascade.detectMultiScale(gray, 1.1, 5)
        if len(faces) == 0:
            return {"stress_level": "no_stress", "face_detected": False, "raw_score": 0.0}

        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        face_img   = cv2.resize(frame[y:y + h, x:x + w], (128, 128))
        inp        = np.expand_dims(face_img / 255.0, axis=0)
        pred       = float(system.face_model.predict(inp, verbose=0)[0][0])
        return {
            "stress_level": _classify_stress_from_score(pred),
            "face_detected": True,
            "raw_score":    pred,
        }
    except Exception as e:
        print(f"[face-stress/detect-b64] Error: {e}")
        return {"stress_level": "no_stress", "face_detected": False, "raw_score": 0.0, "error": str(e)}


# ─────────────────────────────────────────────
# SENSOR / ARDUINO ROUTES
# ─────────────────────────────────────────────
@app.post("/sensor/connect", tags=["Sensor"])
def sensor_connect(user=Depends(get_current_user)):
    print(f"\n{'='*60}")
    print(f"[SENSOR CONNECT] Request from user {user.id}")

    # [S4] Register this user so _db_flush_loop attributes readings correctly
    _sensor._active_user_id = user.id
    print(f"[SENSOR CONNECT] Active user for DB flush set to {user.id}")

    if _sensor.connected:
        print(f"[SENSOR CONNECT] Already connected to {_sensor.port}")
        print(f"{'='*60}\n")
        return {"status": "already_connected", "port": _sensor.port}

    _sensor.connect()
    if _sensor.connected:
        print(f"[SENSOR CONNECT] Successfully connected to {_sensor.port}")
        print(f"{'='*60}\n")
        return {"status": "connected", "port": _sensor.port}

    print(f"[SENSOR CONNECT] Failed to connect to {_sensor.port}")
    print(f"{'='*60}\n")
    raise HTTPException(503, f"Could not connect to {_sensor.port}. Check USB cable and port.")


@app.post("/sensor/disconnect", tags=["Sensor"])
def sensor_disconnect(user=Depends(get_current_user)):
    print(f"\n{'='*60}")
    print(f"[SENSOR DISCONNECT] Request from user {user.id}")

    # [S5] Stop attributing background DB flushes to any user
    _sensor._active_user_id = None
    print(f"[SENSOR DISCONNECT] Active user cleared — DB flush paused")

    _sensor.disconnect()
    print(f"[SENSOR DISCONNECT] Disconnected from {_sensor.port}")
    print(f"{'='*60}\n")
    return {"status": "disconnected"}


@app.get("/sensor/status", tags=["Sensor"])
def sensor_status(user=Depends(get_current_user)):
    status = _sensor.get_status()
    print(f"\n{'='*60}")
    print(f"[SENSOR STATUS] Request from user {user.id}")
    print(f"[SENSOR STATUS] Connected: {status.get('connected', False)}")
    print(f"[SENSOR STATUS] Port: {status.get('port', 'Unknown')}")
    print(f"[SENSOR STATUS] Latest BPM: {status.get('latest_bpm', 'N/A')}")
    print(f"[SENSOR STATUS] Latest SpO2: {status.get('latest_spo2', 'N/A')}")
    print(f"[SENSOR STATUS] Latest GSR: {status.get('latest_gsr', 'N/A')}")
    print(f"[SENSOR STATUS] BPM Zone: {status.get('bpm_zone', 'Unknown')}")
    print(f"{'='*60}\n")
    return status


@app.get("/sensor/history", tags=["Sensor"])
def sensor_history(limit: int = 100, user=Depends(get_current_user)):
    history = _sensor.get_history(limit=limit)
    print(f"\n{'='*60}")
    print(f"[SENSOR HISTORY] Request from user {user.id}")
    print(f"[SENSOR HISTORY] BPM History Length: {len(history.get('bpm_history', []))}")
    if history.get('bpm_history'):
        print(f"[SENSOR HISTORY] Recent BPM: {history['bpm_history'][-5:]}")
    print(f"{'='*60}\n")
    return history


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
# SENSOR — MANUAL FLUSH ENDPOINT (bonus)
# Force an immediate DB write without waiting for the 30s timer.
# ─────────────────────────────────────────────
@app.post("/sensor/flush", tags=["Sensor"])
def sensor_flush(user=Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Immediately persist the current sensor reading to the DB.
    Useful for testing or for triggering a save before disconnect.
    """
    if _sensor.latest_bpm is None:
        raise HTTPException(400, "No BPM reading available yet")

    with _sensor._lock:
        bpm      = _sensor.latest_bpm
        spo2     = _sensor.latest_spo2
        gsr      = _sensor.latest_gsr
        zone     = _sensor.bpm_zone
        is_alert = bpm >= _sensor.BPM_ALERT_THRESHOLD

    db.add(models.BpmReading(
        user_id  = user.id,
        bpm      = bpm,
        bpm_zone = zone,
        spo2     = spo2,
        gsr      = gsr,
        is_alert = is_alert,
    ))
    db.commit()
    _sensor._last_written_bpm = bpm

    return {
        "status":   "flushed",
        "bpm":      bpm,
        "bpm_zone": zone,
        "spo2":     spo2,
        "gsr":      gsr,
        "is_alert": is_alert,
    }


# ─────────────────────────────────────────────
# RECOMMENDATION ROUTES
# ─────────────────────────────────────────────
@app.get("/recommendation", tags=["Recommendations"])
def get_recommendation(user=Depends(get_current_user)):
    system = get_stress_system()
    rec    = system.current_rec
    if not rec:
        level = _classify_stress(system.stress_count)
        rec   = system.rec_manager.get_next(level)
    return {"recommendation": rec, "stress_level": system.stress_level}


@app.post("/recommendation/feedback", tags=["Recommendations"])
def recommendation_feedback(data: schemas.RecommendationFeedback, user=Depends(get_current_user)):
    system = get_stress_system()
    if data.feedback == "no":
        system.rec_manager.adapt(system.stress_level)
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
        upload_dir = os.path.join(os.getcwd(), "uploads")
        os.makedirs(upload_dir, exist_ok=True)

        original_ext = os.path.splitext(file.filename)[-1] if file.filename else ".webm"
        raw_path     = os.path.join(upload_dir, f"voice_{ts}_raw{original_ext}").replace("\\", "/")
        wav_path     = os.path.join(upload_dir, f"voice_{ts}.wav").replace("\\", "/")

        content = await file.read()
        with open(raw_path, "wb") as f:
            f.write(content)

        print(f"[AUDIO UPLOAD] Saved raw: {raw_path} ({len(content)} bytes, ext={original_ext})")

        import subprocess
        ffmpeg_cmd = ["ffmpeg", "-y", "-i", raw_path,
                      "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", wav_path]
        result_ffmpeg = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)

        if result_ffmpeg.returncode != 0:
            print(f"[AUDIO UPLOAD] ffmpeg error:\n{result_ffmpeg.stderr}")
            raise RuntimeError(f"ffmpeg conversion failed: {result_ffmpeg.stderr[-300:]}")

        print(f"[AUDIO UPLOAD] Converted to 16kHz mono 16-bit WAV: {wav_path}")

        with wave.open(wav_path, "rb") as wf:
            print(f"[AUDIO UPLOAD] Verified — channels={wf.getnchannels()} "
                  f"sampwidth={wf.getsampwidth()} framerate={wf.getframerate()}")

        result = process_audio_file(wav_path)
        return {
            "success":     result.get("success", False),
            "transcript":  result.get("transcript", ""),
            "voice_score": result.get("voice_score"),
            "audio_file":  f"voice_{ts}.wav",
            "error":       result.get("error"),
        }

    except Exception as e:
        print(f"[AUDIO UPLOAD] EXCEPTION: {e}")
        traceback.print_exc()
        return {"success": False, "transcript": "", "voice_score": None, "error": str(e)}


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


def _build_kg_api_response(stress_data: dict) -> schemas.KGApiResponse | None:
    """
    FIX [2]: Convert the kg_api dict into the typed KGApiResponse Pydantic model.
    """
    kg_api = stress_data.get("kg_api")
    if not kg_api:
        return None
    try:
        symptoms = [
            schemas.KGSymptomRef(
                label=s.get("label", "") if isinstance(s, dict) else str(s),
                dsm5 =s.get("dsm5")      if isinstance(s, dict) else None,
                icd11=s.get("icd11")     if isinstance(s, dict) else None,
            )
            for s in kg_api.get("symptoms", [])
        ]
        interventions = [
            schemas.KGInterventionRef(
                label=   i.get("label", "") if isinstance(i, dict) else str(i),
                evidence=i.get("evidence")  if isinstance(i, dict) else None,
            )
            for i in kg_api.get("interventions", [])
        ]
        return schemas.KGApiResponse(
            severity_band=    kg_api.get("severity_band", "no_stress"),
            fused_score=      float(kg_api.get("fused_score", 0.0)),
            stressors=        kg_api.get("stressors", []),
            symptoms=         symptoms,
            biological=       kg_api.get("biological", []),
            interventions=    interventions,
            measurement_tools=kg_api.get("measurement_tools", []),
            is_critical=      bool(kg_api.get("is_critical", False)),
            critical_reason=  kg_api.get("critical_reason", ""),
            clinician_summary=kg_api.get("clinician_summary", ""),
        )
    except Exception as e:
        print(f"[KG] Failed to build KGApiResponse: {e}")
        return None


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


# ── FAST ROUTE ────────────────────────────────────────────────────────────────
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

    stress_data = stress_from_text(req.text)

    # FIX [1]
    stress_label = stress_data.get("final_label")

    system = get_stress_system()

    fusion_input = SignalInput(
        text_stress_label=stress_label,
        text_confidence=stress_data.get("confidence"),
        voice_available=False,
        face_stress_level=system.stress_level,
        face_running=system.running,
        bpm=_sensor.latest_bpm,
        bpm_zone=_sensor.bpm_zone,
        heart_available=_sensor.connected and _sensor.latest_bpm is not None,
        cognitive_label=None,
        cognitive_ready=False,
        kg_result=stress_data.get("kg_result", {}),
    )
    fusion: FusionResult = fuse_signals(fusion_input)

    # FIX [4]
    kg_llm_ctx = stress_data.get("llm_context", "")
    sys_prompt = (
        "You are a supportive wellbeing chatbot for university students.\n"
        "Prioritize responding to the user's latest message.\n"
        "Use additional context only to support your response, not override it.\n"
        "You are not a clinician. Do not claim diagnosis or treatment. "
        "If self-harm risk appears, encourage professional help and SOS.\n\n"
        "=== CONTEXT ===\n"
        f"{kg_llm_ctx}\n"
        f"{fusion.llm_context}\n"
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
        # FIX [5]
        kg_kwargs = extract_kg_fields(stress_data)
        save_message_analytics(
            db=db,
            message_id=assistant_msg.id,
            session_id=session_id,
            user_id=user.id,
            **kg_kwargs,
            voice_available=False,
            face_available=system.running,
            face_stress_level=system.stress_level,
            face_detected=system.face_detected,
            heart_available=_sensor.connected and _sensor.latest_bpm is not None,
            bpm=_sensor.latest_bpm,
            bpm_zone=_sensor.bpm_zone,
            spo2=_sensor.latest_spo2,
            gsr=_sensor.latest_gsr,
            cognitive_load_ready=False,
            baseline_ready=False,
            fusion=fusion,
        )

    # FIX [2]
    kg_response = _build_kg_api_response(stress_data)

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
        kg_response=kg_response,
        face_stress_level=system.stress_level,
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


# ── FULL ROUTE ────────────────────────────────────────────────────────────────
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
    print(f"  Voice score passed in: {req.voice_score}")
    print(f"{'#' * 60}")

    db.add(models.ChatMessage(
        session_id=session_id, user_id=user.id, role="user", content=req.text
    ))
    db.commit()

    # ── Voice signal ──────────────────────────────────────────────────────────
    voice_score     = req.voice_score
    voice_available = voice_score is not None

    # ── Keystrokes / feature vector ───────────────────────────────────────────
    klist = [k.model_dump() for k in (req.keystrokes or [])]
    tfeat = typing_features(klist)
    xfeat = text_features(req.text)
    vfeat = req.voice_features.model_dump() if req.voice_features else {
        "pitch_variance": 0.0, "volume_fluctuation": 0.0, "tone_variability": 0.0,
    }

    if not klist and req.voice_features is None and not voice_available:
        raise HTTPException(422, "Provide at least keystrokes, voice_features, or a voice_score.")

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

    # ── Baseline + cognitive load ─────────────────────────────────────────────
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

    # ── Sensors ───────────────────────────────────────────────────────────────
    system = get_stress_system()
    face_score = system._pred_result.get("score", 0.0)

    print(f"[SENSORS]  face={system.stress_level}  face_score={face_score:.3f}  "
          f"face_running={system.running}  bpm={_sensor.latest_bpm}  "
          f"bpm_zone={_sensor.bpm_zone}  arduino={_sensor.connected}")

    # ── Text-only KG pass ─────────────────────────────────────────────────────
    text_stress_data = stress_from_text(req.text)

    # FIX [1]
    stress_label    = text_stress_data.get("final_label")
    text_label_int  = text_stress_data.get("stress_label", 0)
    text_confidence = text_stress_data.get("confidence", 0.0)

    _log_pipeline("TEXT STRESS MODEL", {
        "stress_label": stress_label,
        "confidence":   f"{text_confidence:.3f}",
    })

    print(f"[VOICE]  score={voice_score}  available={voice_available}")

    # FIX [3][8]
    kg_full_result = stress_from_all_signals(
        text            = req.text,
        text_label      = text_label_int,
        text_confidence = text_confidence,
        voice_score     = voice_score,
        face_level      = system.stress_level,
        face_score      = float(face_score),
        bpm             = _sensor.latest_bpm,
        bpm_zone        = _sensor.bpm_zone,
        cognitive_label = pred_label if ready else None,
        cognitive_ready = ready,
    )

    # FIX [9]
    kg_llm_context = getattr(kg_full_result, "llm_context_injection", None) or ""

    stress_data = {
        **text_stress_data,
        "kg_api":         kg_full_result.to_api_response(),
        "kg_full":        kg_full_result.to_dict(),
        "is_critical":    kg_full_result.is_critical,
        "clinician_note": getattr(kg_full_result, "clinician_summary", None),
        "llm_context":    kg_llm_context,
    }

    _log_pipeline("FULL KG RESULT (multi-modal)", {
        "severity_band": kg_full_result.severity_band,
        "fused_score":   f"{kg_full_result.fused_score:.3f}",
        "stressors":     [s["label"] for s in kg_full_result.activated_stressors[:3]],
        "symptoms":      [s["label"] for s in kg_full_result.activated_symptoms[:3]],
        "biological":    [b["label"] for b in kg_full_result.activated_biological[:3]],
        "is_critical":   kg_full_result.is_critical,
    })

    # ── Fusion ────────────────────────────────────────────────────────────────
    fusion_input = SignalInput(
        text_stress_label=stress_label,
        text_confidence=text_confidence,
        voice_score=voice_score,
        voice_available=voice_available,
        face_stress_level=system.stress_level,
        face_running=system.running,
        bpm=_sensor.latest_bpm,
        bpm_zone=_sensor.bpm_zone,
        heart_available=_sensor.connected and _sensor.latest_bpm is not None,
        cognitive_label=pred_label if ready else None,
        cognitive_ready=ready,
        kg_result=stress_data.get("kg_result", {}),
    )
    fusion: FusionResult = fuse_signals(fusion_input)

    _log_pipeline("FUSION RESULT", {
        "fused_score":   f"{fusion.fused_score:.3f}",
        "fused_label":   fusion.fused_label,
        "confidence":    f"{fusion.confidence:.2f}",
        "signals_used":  fusion.signals_used,
        "dominant":      fusion.dominant_signal,
        "alert":         fusion.alert,
        "alert_reasons": fusion.alert_reasons,
    })

    # ── LLM ───────────────────────────────────────────────────────────────────
    # FIX [4]
    sys_prompt = (
        "You are a supportive wellbeing chatbot for university students.\n"
        "Prioritize responding to the user's latest message.\n"
        "Use additional context only to support your response, not override it.\n"
        "You are not a clinician. Do not claim diagnosis or treatment. "
        "If self-harm risk appears, encourage professional help and SOS.\n\n"
        "=== CONTEXT ===\n"
        f"{kg_llm_context}\n"
        f"{fusion.llm_context}\n"
    )
    print(f"[sys_prompt]  sys_prompt={sys_prompt}")
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

    # ── Analytics ─────────────────────────────────────────────────────────────
    probs_safe    = probs or {}
    assistant_msg = _get_last_assistant_message(db, session_id)
    if assistant_msg:
        # FIX [5]
        kg_kwargs = extract_kg_fields(stress_data)
        save_message_analytics(
            db=db,
            message_id=assistant_msg.id,
            session_id=session_id,
            user_id=user.id,
            **kg_kwargs,
            voice_available=voice_available,
            voice_score=voice_score,
            voice_pitch_variance=float(x10[7]),
            voice_volume_fluct=float(x10[8]),
            voice_tone_variability=float(x10[9]),
            face_available=system.running,
            face_stress_level=system.stress_level,
            face_detected=system.face_detected,
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

    # FIX [2]
    kg_response = _build_kg_api_response(stress_data)

    return schemas.ChatMessageOut(
        reply=reply,
        session_id=session_id,
        cognitive_load_ready=ready,
        baseline_ready=baseline_ready,
        window_size=win,
        predicted_label=(pred_label if ready else None),
        probs=(probs if ready else None),
        stress_label=stress_label,
        stress_confidence=text_confidence,
        kg_response=kg_response,
        face_stress_level=system.stress_level,
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
    system = get_stress_system()
    fusion_input = SignalInput(
        text_stress_label=None,
        text_confidence=None,
        face_stress_level=system.stress_level,
        face_running=system.running,
        bpm=_sensor.latest_bpm,
        bpm_zone=_sensor.bpm_zone,
        heart_available=_sensor.connected and _sensor.latest_bpm is not None,
        voice_available=False,
        cognitive_ready=False,
    )
    fusion: FusionResult = fuse_signals(fusion_input)
    return {
        "fused_score":   fusion.fused_score,
        "fused_label":   fusion.fused_label,
        "confidence":    fusion.confidence,
        "signals_used":  fusion.signals_used,
        "alert":         fusion.alert,
        "alert_reasons": fusion.alert_reasons,
        "dashboard":     fusion.dashboard,
        "signals":       fusion.signals,
        "timestamp":     fusion.timestamp,
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
        system        = get_stress_system()
        stress_result = system.analyze_face(image_bytes)
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
            # FIX [7]
            "kg_biological":            r.kg_biological,
            "kg_interventions":         r.kg_interventions,
            "kg_severity_band":         r.kg_severity_band,
            "kg_is_critical":           r.kg_is_critical,
            "kg_clinician_summary":     r.kg_clinician_summary,
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
            "session_id":              r.session_id,
            "created_at":              r.created_at.isoformat(),
            "total_messages":          r.total_messages,
            "duration_seconds":        r.duration_seconds,
            "stress_label_counts":     r.stress_label_counts,
            "avg_fused_score":         r.avg_fused_score,
            "avg_bpm":                 r.avg_bpm,
            "peak_bpm":                r.peak_bpm,
            "peak_fused_score":        r.peak_fused_score,
            "dominant_fused_label":    r.dominant_fused_label,
            "dominant_face_level":     r.dominant_face_level,
            "dominant_cognitive_load": r.dominant_cognitive_load,
            "total_fusion_alerts":     r.total_fusion_alerts,
        }
        for r in rows
    ]}