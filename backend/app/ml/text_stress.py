# ml/text_stress.py
import joblib
from transformers import BertTokenizer, BertModel
import torch

# Load models
tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")
bert_model = BertModel.from_pretrained("bert-base-uncased")
xgb_model = joblib.load("stress_detection_xgb_model.pkl")

def bert_encode(texts):
    """
    Encode text using BERT.
    """
    encoded = tokenizer(texts, return_tensors="pt", padding=True, truncation=True, max_length=512)
    with torch.no_grad():
        outputs = bert_model(**encoded)
    return outputs.last_hidden_state.mean(dim=1)

def predict_text_stress(text):
    """
    Predict stress from text using BERT + XGBoost.
    """
    emb = bert_encode([text])
    X_input = emb.cpu().numpy()
    pred = xgb_model.predict(X_input)[0]
    proba = xgb_model.predict_proba(X_input)[0][pred]
    return {"stress_label": int(pred), "confidence": float(proba)}
