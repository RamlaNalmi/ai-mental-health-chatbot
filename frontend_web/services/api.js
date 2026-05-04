import axios from 'axios'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 180000, // 3 minutes
})

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  console.log(`[DEBUG] API Request: ${config.method?.toUpperCase()} ${config.url}`)
  console.log(`[DEBUG] Access token exists: ${!!token}`)
  console.log(`[DEBUG] Raw access token: "${token}"`)
  if (token) {
    console.log(`[DEBUG] Access token: ${token.substring(0, 20)}...`)
    config.headers.Authorization = `Bearer ${token}`
    console.log(`[DEBUG] Authorization header: "${config.headers.Authorization}"`)
  } else {
    console.log(`[DEBUG] No access token found in localStorage`)
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        }).catch(err => {
          return Promise.reject(err)
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshToken = localStorage.getItem('refresh_token')
        if (!refreshToken) {
          throw new Error('No refresh token available')
        }

        console.log('[DEBUG] Attempting token refresh...')
        const response = await api.post('/auth/refresh', { refresh_token: refreshToken })
        const { access_token, refresh_token } = response.data

        localStorage.setItem('access_token', access_token)
        localStorage.setItem('refresh_token', refresh_token)

        console.log('[DEBUG] Token refresh successful')
        processQueue(null, access_token)

        originalRequest.headers.Authorization = `Bearer ${access_token}`
        return api(originalRequest)
      } catch (refreshError) {
        console.log('[DEBUG] Token refresh failed:', refreshError)
        processQueue(refreshError, null)
        
        // Clear tokens and redirect to signin
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        window.location.href = '/auth/signin'
        
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

// ── Auth ──────────────────────────────────────────────────────────────
export const authAPI = {
  signIn: (email, password) =>
    api.post('/auth/signin', { email, password }).then(r => r.data),
  signUp: (email, password, name) =>
    api.post('/auth/signup', { email, password, name }).then(r => r.data),
}

export const chatAPI = {
  startSession: () =>
    api.post('/chat/start').then(r => r.data),

  sendMessage: (sessionId, text, keystrokes = [], voiceScore = null) => {
    const ks = keystrokes.length > 0
      ? keystrokes
      : [{ key: 'x', ts_ms: Date.now(), type: 'down' }]

    // Route to /chat/message whenever voice_score is present
    // so the full fusion pipeline runs with all signals
    const endpoint = (keystrokes.length > 1 || voiceScore !== null)
      ? `/chat/message?session_id=${sessionId}`
      : `/chat/message-fast?session_id=${sessionId}`

    const body = {
      text,
      keystrokes:     ks,
      voice_features: null,
      voice_score:    voiceScore,
    }

    return api.post(endpoint, body).then(r => r.data)
  },

  getFusionStatus: () =>
    api.get('/fuse/status').then(r => r.data),
}// ── Baseline ──────────────────────────────────────────────────────────
export const baselineAPI = {
  getStatus: () => api.get('/baseline/status').then(r => r.data),
}

// ── Audio ─────────────────────────────────────────────────────────────
export const audioAPI = {
  upload: (blob, mimeType = 'audio/webm') => {
    // Pick the right extension based on actual mime type
    const ext = mimeType.includes('mp4') ? 'mp4'
              : mimeType.includes('ogg') ? 'ogg'
              : mimeType.includes('wav') ? 'wav'
              : 'webm'
    
    const form = new FormData()
    form.append('file', blob, `recording.${ext}`)
    console.log('[audioAPI] Uploading as:', `recording.${ext}`, 'size:', blob.size)
    return api.post('/upload-audio', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000, // 3 minutes
    }).then(r => r.data)
  },
}

// ── Face ──────────────────────────────────────────────────────────────
export const faceAPI = {
  detectB64: (image_b64) =>
    api.post('/face-stress/detect-b64', { image_b64 }).then(r => r.data),
}

// ── Sensor ────────────────────────────────────────────────────────────
export const sensorAPI = {
  connect:      ()            => api.post('/sensor/connect').then(r => r.data),
  disconnect:   ()            => api.post('/sensor/disconnect').then(r => r.data),
  getStatus:    ()            => api.get('/sensor/status').then(r => r.data),
  getHistory:   (limit = 60) => api.get(`/sensor/history?limit=${limit}`).then(r => r.data),
  getAlerts:    ()            => api.get('/sensor/alerts').then(r => r.data),
  clear:        ()            => api.post('/sensor/clear').then(r => r.data),
  reconfigure:  (port, baud)  => api.post(`/sensor/reconfigure?port=${port}&baud=${baud}`).then(r => r.data),
}

// ── Recommendations ───────────────────────────────────────────────────
export const recommendationAPI = {
  get:      ()         => api.get('/recommendation').then(r => r.data),
  feedback: (feedback) => api.post('/recommendation/feedback', { feedback }).then(r => r.data),
}

export const cameraAPI = {
  start:     () => api.post('/camera/start').then(r => r.data),
  stop:      () => api.post('/camera/stop').then(r => r.data),
  getFrame:  () => api.get('/camera/frame').then(r => r.data),
  getStatus: () => api.get('/camera/status').then(r => r.data),  // ← missing
}

export default api