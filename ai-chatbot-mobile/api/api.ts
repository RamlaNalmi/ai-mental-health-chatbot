import axios from 'axios';

const API_URL = 'http://YOUR_PC_IP:8000'; // replace with your FastAPI server IP

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

export const signup = (email: string, password: string) =>
  api.post('/auth/signup', { email, password });

export const signin = (email: string, password: string) =>
  api.post('/auth/signin', { email, password });

export const sendChatMessage = (session_id: number, text: string, voice_features?: any, keystrokes?: any) =>
  api.post(`/chat/message?session_id=${session_id}`, {
    text,
    voice_features,
    keystrokes,
  });

export const startChatSession = () => api.post('/chat/start');
export const getBaselineStatus = () => api.get('/baseline/status');
export default api;