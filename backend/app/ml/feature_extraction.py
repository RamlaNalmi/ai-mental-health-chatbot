# ml/feature_extraction.py
import numpy as np
import librosa
from sklearn.preprocessing import StandardScaler

def extract_features(path):
    """
    Extract audio features from the given audio file path.
    """
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
    """
    Scale features using StandardScaler.
    """
    scaler = StandardScaler()
    return scaler.fit_transform(X)
