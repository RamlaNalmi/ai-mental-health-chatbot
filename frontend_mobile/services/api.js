import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'https://angular-recoup-broadness.ngrok-free.dev';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Auth ─────────────────────────────────────────────────────────────
export const authAPI = {
  signIn: async (email, password) => {
    const response = await api.post('/auth/signin', { email, password });
    return response.data;
  },
  signUp: async (email, password) => {
    const response = await api.post('/auth/signup', { email, password });
    return response.data;
  },
};

// ─── Chat ─────────────────────────────────────────────────────────────
export const chatAPI = {
  startSession: async () => {
    const response = await api.post('/chat/start');
    return response.data;
  },

  sendMessage: async (sessionId, message, voiceData = null, keystrokes = null) => {
    const payload = {
      text: message,
      voice_features: voiceData || null,
      keystrokes: keystrokes && keystrokes.length > 0 ? keystrokes : [{ key: 'x', ts_ms: Date.now(), type: 'down' }],
    };
    // Use fast endpoint if no keystrokes/voice; full endpoint when we have them
    const endpoint = keystrokes && keystrokes.length > 1
      ? `/chat/message?session_id=${sessionId}`
      : `/chat/message-fast?session_id=${sessionId}`;
    const response = await api.post(endpoint, payload);
    return response.data;
  },

  getFusionStatus: async () => {
    const response = await api.get('/fuse/status');
    return response.data;
  },
};

// ─── Baseline ─────────────────────────────────────────────────────────
export const baselineAPI = {
  getStatus: async () => {
    const response = await api.get('/baseline/status');
    return response.data;
  },
};

// ─── Audio ────────────────────────────────────────────────────────────
export const audioAPI = {
  uploadAudio: async (audioUri) => {
    const formData = new FormData();
    formData.append('file', { uri: audioUri, type: 'audio/wav', name: 'recording.wav' });
    const response = await api.post('/upload-audio', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return response.data;
  },
};

// ─── Sensor (Arduino / BPM) ───────────────────────────────────────────
export const sensorAPI = {
  connect: async () => {
    const response = await api.post('/sensor/connect');
    return response.data;
  },
  disconnect: async () => {
    const response = await api.post('/sensor/disconnect');
    return response.data;
  },
  getStatus: async () => {
    const response = await api.get('/sensor/status');
    return response.data;
  },
  getHistory: async (limit = 60) => {
    const response = await api.get(`/sensor/history?limit=${limit}`);
    return response.data;
  },
  getAlerts: async () => {
    const response = await api.get('/sensor/alerts');
    return response.data;
  },
  clear: async () => {
    const response = await api.post('/sensor/clear');
    return response.data;
  },
  reconfigure: async (port, baud) => {
    const params = [];
    if (port) params.push(`port=${encodeURIComponent(port)}`);
    if (baud) params.push(`baud=${baud}`);
    const response = await api.post(`/sensor/reconfigure?${params.join('&')}`);
    return response.data;
  },
};

// ─── Face stress (base64 image → backend) ────────────────────────────
// Backend needs a new route for this — see backend patch below.
export const faceAPI = {
  // Sends a base64 JPEG to a lightweight face stress endpoint
  detectStressFromBase64: async (base64Image) => {
    const response = await api.post('/face-stress/detect-b64', { image_b64: base64Image });
    return response.data;
  },
  // Alternatively use the existing webcam stream approach:
  startCamera: async () => {
    const response = await api.post('/camera/start');
    return response.data;
  },
  stopCamera: async () => {
    const response = await api.post('/camera/stop');
    return response.data;
  },
  getCameraStatus: async () => {
    const response = await api.get('/camera/status');
    return response.data;
  },
};

// ─── Recommendations ──────────────────────────────────────────────────
export const recommendationAPI = {
  get: async () => {
    const response = await api.get('/recommendation');
    return response.data;
  },
  feedback: async (feedback) => {
    const response = await api.post('/recommendation/feedback', { feedback });
    return response.data;
  },
};

export default api;
