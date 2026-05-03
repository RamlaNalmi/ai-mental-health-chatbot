"""
API Gateway - ai-mental-health-chatbot
======================================
Aggregates results from all microservices into a single /final-result endpoint.

Services:
  - Facial Stress API      → http://localhost:5000  (Api.py - if present)
  - Emotion Detection API  → http://localhost:5001  (emotion_backend/API.py)
  - Cognitive Load API     → http://localhost:8000  (backend/app/main.py)
"""

from flask import Flask, jsonify
from flask_cors import CORS
import requests
import time

app = Flask(__name__)
CORS(app)

ENDPOINTS = {
    "stress": "http://localhost:5000/status",
    "emotion": "http://localhost:5001/api/health",
    "cognitive_load": "http://localhost:8000/baseline/status"
}

@app.route('/final-result', methods=['GET'])
def get_final_result():
    results = []
    all_ok = True
    any_ok = False

    for service_name, url in ENDPOINTS.items():
        try:
            # Short timeout so one down service doesn't hang the gateway
            response = requests.get(url, timeout=2)
            if response.status_code == 200:
                results.append({
                    "service": service_name,
                    "status": "ok",
                    "data": response.json()
                })
                any_ok = True
            else:
                results.append({
                    "service": service_name,
                    "status": "error",
                    "error": f"HTTP {response.status_code}"
                })
                all_ok = False
        except requests.exceptions.RequestException:
            results.append({
                "service": service_name,
                "status": "error",
                "error": "Service unreachable or timed out."
            })
            all_ok = False

    if all_ok:
        overall_status = "healthy"
    elif any_ok:
        overall_status = "partial"
    else:
        overall_status = "down"

    return jsonify({
        "gateway_status": overall_status,
        "combined": results,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S")
    })

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "gateway_running"})

if __name__ == '__main__':
    print("\n" + "="*60)
    print("  API Gateway running on http://localhost:5002")
    print("  Aggregating endpoints into /final-result")
    print("="*60 + "\n")
    app.run(host='0.0.0.0', port=5002, debug=True)
