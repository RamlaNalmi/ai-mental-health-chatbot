from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- DB / Auth ---
    DATABASE_URL: str = "postgresql+psycopg2://postgres:Rismiya_n24@db.hykmnfvgndjsmwumrdao.supabase.co:5432/postgres"
    JWT_SECRET: str = "CHANGE_ME"
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 60 * 24 * 7

    # --- ML ---
    MODEL_PATH: str = "cognitive_load_transformer_best.pt"
    SEQ_LEN: int = 5
    
    # --- Stress Detection ---
    STRESS_MODEL_PATH: str = "facial_stress_detection_model.h5"

    # --- Local LLM (Ollama) ---
    OLLAMA_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = "phi3:mini"   # Smaller model for less memory

    CHAT_MAX_TURNS: int = 12

    class Config:
        env_file = ".env"


settings = Settings()

# Print configuration once loaded
print(f"✅ CONFIGURATION LOADED")
print(f"📊 DATABASE_URL: {settings.DATABASE_URL}")
print(f"🔐 JWT_SECRET: {'SET' if settings.JWT_SECRET != 'CHANGE_ME' else 'NOT SET'}")
print(f"🤖 MODEL_PATH: {settings.MODEL_PATH}")
print(f"📹 STRESS_MODEL_PATH: {settings.STRESS_MODEL_PATH}")
print(f"🧠 OLLAMA_URL: {settings.OLLAMA_URL}")
print(f"🗣️ OLLAMA_MODEL: {settings.OLLAMA_MODEL}")