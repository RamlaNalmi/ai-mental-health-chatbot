from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from .config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"sslmode": "require"}  # REQUIRED for Supabase
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False
)

class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# test connection
try:
    with engine.connect() as conn:
        print("✅ SUPABASE DB CONNECTED SUCCESSFULLY")
        print("DATABASE_URL =", settings.DATABASE_URL)
except Exception as e:
    print("❌ DB CONNECTION FAILED:", e)