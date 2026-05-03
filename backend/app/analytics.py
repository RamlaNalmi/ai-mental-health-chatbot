# app/analytics.py
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from .database import User, ChatMessage, StressMeasurement, CognitiveLoadMeasurement
from pydantic import BaseModel
from fastapi import HTTPException

# Pydantic models for analytics
class StressTrend(BaseModel):
    date: str
    stress_level: float
    stress_label: int
    confidence: float

class CognitiveLoadTrend(BaseModel):
    date: str
    cognitive_load: float
    ready: bool

class WeeklyAnalytics(BaseModel):
    week_start: str
    week_end: str
    avg_stress: float
    avg_cognitive_load: float
    stress_trend: List[StressTrend]
    cognitive_load_trend: List[CognitiveLoadTrend]
    total_messages: int
    voice_sessions: int
    text_sessions: int

class MonthlyAnalytics(BaseModel):
    month: str
    year: int
    avg_stress: float
    avg_cognitive_load: float
    peak_stress_day: str
    lowest_stress_day: str
    total_sessions: int
    improvement_score: float

class AnalyticsService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_stress_history(
        self, 
        user_id: int, 
        days: int = 30
    ) -> List[StressTrend]:
        """Get stress history for the last N days"""
        start_date = datetime.now() - timedelta(days=days)
        
        measurements = self.db.query(StressMeasurement).filter(
            StressMeasurement.user_id == user_id,
            StressMeasurement.created_at >= start_date
        ).order_by(StressMeasurement.created_at).all()
        
        return [
            StressTrend(
                date=measurement.created_at.strftime("%Y-%m-%d"),
                stress_level=measurement.stress_level,
                stress_label=measurement.stress_label,
                confidence=measurement.confidence
            )
            for measurement in measurements
        ]

    def get_user_cognitive_load_history(
        self, 
        user_id: int, 
        days: int = 30
    ) -> List[CognitiveLoadTrend]:
        """Get cognitive load history for the last N days"""
        start_date = datetime.now() - timedelta(days=days)
        
        measurements = self.db.query(CognitiveLoadMeasurement).filter(
            CognitiveLoadMeasurement.user_id == user_id,
            CognitiveLoadMeasurement.created_at >= start_date
        ).order_by(CognitiveLoadMeasurement.created_at).all()
        
        return [
            CognitiveLoadTrend(
                date=measurement.created_at.strftime("%Y-%m-%d"),
                cognitive_load=measurement.cognitive_load,
                ready=measurement.ready
            )
            for measurement in measurements
        ]

    def get_weekly_analytics(self, user_id: int) -> WeeklyAnalytics:
        """Get comprehensive weekly analytics"""
        today = datetime.now().date()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        
        # Get stress measurements for the week
        stress_measurements = self.db.query(StressMeasurement).filter(
            StressMeasurement.user_id == user_id,
            func.date(StressMeasurement.created_at) >= week_start,
            func.date(StressMeasurement.created_at) <= week_end
        ).all()
        
        # Get cognitive load measurements for the week
        cognitive_measurements = self.db.query(CognitiveLoadMeasurement).filter(
            CognitiveLoadMeasurement.user_id == user_id,
            func.date(CognitiveLoadMeasurement.created_at) >= week_start,
            func.date(CognitiveLoadMeasurement.created_at) <= week_end
        ).all()
        
        # Get chat messages for the week
        chat_messages = self.db.query(ChatMessage).filter(
            ChatMessage.user_id == user_id,
            func.date(ChatMessage.created_at) >= week_start,
            func.date(ChatMessage.created_at) <= week_end
        ).all()
        
        # Calculate averages
        avg_stress = sum(m.stress_level for m in stress_measurements) / len(stress_measurements) if stress_measurements else 0
        avg_cognitive_load = sum(m.cognitive_load for m in cognitive_measurements) / len(cognitive_measurements) if cognitive_measurements else 0
        
        # Count voice vs text sessions
        voice_sessions = sum(1 for msg in chat_messages if msg.voice_features)
        text_sessions = len(chat_messages) - voice_sessions
        
        return WeeklyAnalytics(
            week_start=week_start.strftime("%Y-%m-%d"),
            week_end=week_end.strftime("%Y-%m-%d"),
            avg_stress=avg_stress,
            avg_cognitive_load=avg_cognitive_load,
            stress_trend=[
                StressTrend(
                    date=m.created_at.strftime("%Y-%m-%d"),
                    stress_level=m.stress_level,
                    stress_label=m.stress_label,
                    confidence=m.confidence
                )
                for m in stress_measurements
            ],
            cognitive_load_trend=[
                CognitiveLoadTrend(
                    date=m.created_at.strftime("%Y-%m-%d"),
                    cognitive_load=m.cognitive_load,
                    ready=m.ready
                )
                for m in cognitive_measurements
            ],
            total_messages=len(chat_messages),
            voice_sessions=voice_sessions,
            text_sessions=text_sessions
        )

    def get_monthly_analytics(self, user_id: int) -> MonthlyAnalytics:
        """Get comprehensive monthly analytics"""
        today = datetime.now().date()
        month_start = today.replace(day=1)
        
        # Get all measurements for the month
        stress_measurements = self.db.query(StressMeasurement).filter(
            StressMeasurement.user_id == user_id,
            func.date(StressMeasurement.created_at) >= month_start,
            func.date(StressMeasurement.created_at) <= today
        ).all()
        
        # Calculate daily averages
        daily_stress = {}
        for measurement in stress_measurements:
            date = measurement.created_at.date()
            if date not in daily_stress:
                daily_stress[date] = []
            daily_stress[date].append(measurement.stress_level)
        
        # Find peak and lowest stress days
        if daily_stress:
            daily_averages = {date: sum(levels) / len(levels) for date, levels in daily_stress.items()}
            peak_day = max(daily_averages, key=daily_averages.get)
            lowest_day = min(daily_averages, key=daily_averages.get)
            peak_stress = daily_averages[peak_day]
            lowest_stress = daily_averages[lowest_day]
        else:
            peak_day = lowest_day = today
            peak_stress = lowest_stress = 0
        
        # Calculate improvement score (compare first week to last week)
        if len(stress_measurements) >= 14:
            first_week_avg = sum(m.stress_level for m in stress_measurements[:7]) / 7
            last_week_avg = sum(m.stress_level for m in stress_measurements[-7:]) / 7
            improvement_score = ((first_week_avg - last_week_avg) / first_week_avg) * 100
        else:
            improvement_score = 0
        
        return MonthlyAnalytics(
            month=today.strftime("%B"),
            year=today.year,
            avg_stress=sum(m.stress_level for m in stress_measurements) / len(stress_measurements) if stress_measurements else 0,
            avg_cognitive_load=0,  # Would need similar calculation for cognitive load
            peak_stress_day=peak_day.strftime("%Y-%m-%d"),
            lowest_stress_day=lowest_day.strftime("%Y-%m-%d"),
            total_sessions=len(stress_measurements),
            improvement_score=improvement_score
        )

    def get_stress_insights(self, user_id: int) -> Dict:
        """Get AI-powered insights about user's stress patterns"""
        stress_history = self.get_user_stress_history(user_id, 30)
        
        if not stress_history:
            return {"insight": "Not enough data to provide insights yet."}
        
        # Analyze patterns
        stress_levels = [s.stress_level for s in stress_history]
        avg_stress = sum(stress_levels) / len(stress_levels)
        
        # Determine trend
        if len(stress_levels) >= 7:
            recent_avg = sum(stress_levels[-7:]) / 7
            earlier_avg = sum(stress_levels[:-7]) / (len(stress_levels) - 7) if len(stress_levels) > 7 else avg_stress
            
            if recent_avg < earlier_avg:
                trend = "improving"
            elif recent_avg > earlier_avg * 1.1:
                trend = "worsening"
            else:
                trend = "stable"
        else:
            trend = "insufficient_data"
        
        # Generate insights
        insights = []
        
        if avg_stress > 0.7:
            insights.append("Your stress levels have been consistently high. Consider trying stress management techniques.")
        elif avg_stress < 0.3:
            insights.append("Great job! Your stress levels are well-managed. Keep up the good work!")
        
        if trend == "improving":
            insights.append("Your stress levels have been improving recently. Whatever you're doing is working!")
        elif trend == "worsening":
            insights.append("Your stress levels have been increasing lately. It might be helpful to talk about what's been going on.")
        
        return {
            "trend": trend,
            "average_stress": avg_stress,
            "insights": insights,
            "recommendation": self._get_recommendation(avg_stress, trend)
        }
    
    def _get_recommendation(self, avg_stress: float, trend: str) -> str:
        """Get personalized recommendation based on stress levels and trend"""
        if avg_stress > 0.7:
            return "Consider scheduling regular breaks, practicing mindfulness, or talking to a counselor."
        elif avg_stress > 0.5:
            return "Try incorporating relaxation techniques into your daily routine."
        elif trend == "worsening":
            return "Pay attention to your stress triggers and consider reaching out for support."
        else:
            return "Continue maintaining your current stress management strategies."
