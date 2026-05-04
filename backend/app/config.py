from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # --- DB / Auth ---
    # Use PostgreSQL in production; SQLite works locally without Docker (override via DATABASE_URL).
    DATABASE_URL: str = "sqlite:///./cogload.db"
    JWT_SECRET: str = "CHANGE_ME"
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 60 * 24 * 7

    # --- ML ---
    MODEL_PATH: str = "cognitive_load_transformer_best.pt"
    SEQ_LEN: int = 5

    # --- Local LLM (Ollama) ---
    OLLAMA_URL: str = "http://127.0.0.1:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"   # or "phi3:mini"

    CHAT_MAX_TURNS: int = 12


settings = Settings()