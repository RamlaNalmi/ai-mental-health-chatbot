# app/database.py
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String)
    university = Column(String)
    major = Column(String)
    year = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    chat_messages = relationship("ChatMessage", back_populates="user")
    stress_measurements = relationship("StressMeasurement", back_populates="user")
    cognitive_load_measurements = relationship("CognitiveLoadMeasurement", back_populates="user")
    mood_entries = relationship("MoodEntry", back_populates="user")
    journal_entries = relationship("JournalEntry", back_populates="user")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(String, index=True)
    message_text = Column(Text)
    is_user_message = Column(Boolean, default=True)
    voice_features = Column(JSON)  # Store voice analysis results
    keystrokes = Column(JSON)  # Store typing patterns
    stress_label = Column(Integer)
    stress_confidence = Column(Float)
    cognitive_load = Column(Float)
    cognitive_load_ready = Column(Boolean, default=False)
    transcript = Column(Text)  # Voice transcription
    kg_response = Column(JSON)  # Knowledge graph response
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="chat_messages")

class StressMeasurement(Base):
    __tablename__ = "stress_measurements"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    stress_level = Column(Float)  # 0.0 to 1.0
    stress_label = Column(Integer)  # 0 or 1
    confidence = Column(Float)  # 0.0 to 1.0
    measurement_type = Column(String)  # "voice", "text", "combined"
    source = Column(String)  # "chat_message", "voice_recording", etc.
    context = Column(Text)  # What triggered this measurement
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="stress_measurements")

class CognitiveLoadMeasurement(Base):
    __tablename__ = "cognitive_load_measurements"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    cognitive_load = Column(Float)  # 0.0 to 1.0
    ready = Column(Boolean, default=False)  # Whether baseline is ready
    window_size = Column(Integer)
    keystroke_features = Column(JSON)
    voice_features = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="cognitive_load_measurements")

class MoodEntry(Base):
    __tablename__ = "mood_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    mood = Column(String)  # "happy", "sad", "anxious", "stressed", etc.
    intensity = Column(Integer)  # 1-10 scale
    triggers = Column(Text)  # What caused this mood
    activities = Column(Text)  # What the user was doing
    notes = Column(Text)  # Additional notes
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="mood_entries")

class JournalEntry(Base):
    __tablename__ = "journal_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    content = Column(Text)
    tags = Column(String)  # Comma-separated tags
    is_private = Column(Boolean, default=True)
    stress_before = Column(Float)  # Stress level before journaling
    stress_after = Column(Float)  # Stress level after journaling
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="journal_entries")

class UserSession(Base):
    __tablename__ = "user_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    session_id = Column(String, unique=True, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime)
    duration_minutes = Column(Integer)
    message_count = Column(Integer, default=0)
    voice_message_count = Column(Integer, default=0)
    avg_stress_level = Column(Float)
    avg_cognitive_load = Column(Float)
    session_summary = Column(Text)
    
    # Relationships
    user = relationship("User")

class WellnessGoal(Base):
    __tablename__ = "wellness_goals"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    goal_type = Column(String)  # "stress_reduction", "mindfulness", "sleep", etc.
    target_value = Column(Float)
    current_value = Column(Float)
    unit = Column(String)  # "minutes", "level", "sessions", etc.
    frequency = Column(String)  # "daily", "weekly", "monthly"
    deadline = Column(DateTime)
    is_completed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    
    # Relationships
    user = relationship("User")
