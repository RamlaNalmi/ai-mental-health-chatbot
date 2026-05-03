# ml/voice_text_fusion.py

def fuse_predictions(voice_score, text_label):
    """
    Fuse voice and text predictions for final stress prediction.
    """
    text_score = 1 if text_label == 1 else 0
    final_score = (0.4 * voice_score) + (0.6 * text_score)
    final_label = 1 if final_score > 0.5 else 0
    return final_score, final_label
