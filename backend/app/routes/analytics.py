# app/routes/analytics.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from ..database import get_db
from ..auth import get_current_user
from ..analytics import AnalyticsService, WeeklyAnalytics, MonthlyAnalytics, StressTrend, CognitiveLoadTrend
from ..database import User

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/stress/history")
async def get_stress_history(
    days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List[StressTrend]:
    """Get user's stress history for the specified number of days"""
    analytics_service = AnalyticsService(db)
    return analytics_service.get_user_stress_history(current_user.id, days)

@router.get("/cognitive-load/history")
async def get_cognitive_load_history(
    days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List[CognitiveLoadTrend]:
    """Get user's cognitive load history for the specified number of days"""
    analytics_service = AnalyticsService(db)
    return analytics_service.get_user_cognitive_load_history(current_user.id, days)

@router.get("/weekly")
async def get_weekly_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> WeeklyAnalytics:
    """Get comprehensive weekly analytics"""
    analytics_service = AnalyticsService(db)
    return analytics_service.get_weekly_analytics(current_user.id)

@router.get("/monthly")
async def get_monthly_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> MonthlyAnalytics:
    """Get comprehensive monthly analytics"""
    analytics_service = AnalyticsService(db)
    return analytics_service.get_monthly_analytics(current_user.id)

@router.get("/insights")
async def get_stress_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get AI-powered insights about user's stress patterns"""
    analytics_service = AnalyticsService(db)
    return analytics_service.get_stress_insights(current_user.id)

@router.get("/dashboard")
async def get_dashboard_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get comprehensive dashboard data"""
    analytics_service = AnalyticsService(db)
    
    # Get various analytics
    weekly = analytics_service.get_weekly_analytics(current_user.id)
    monthly = analytics_service.get_monthly_analytics(current_user.id)
    insights = analytics_service.get_stress_insights(current_user.id)
    
    # Get recent stress history (last 7 days)
    recent_stress = analytics_service.get_user_stress_history(current_user.id, 7)
    
    # Get recent cognitive load history (last 7 days)
    recent_cognitive = analytics_service.get_user_cognitive_load_history(current_user.id, 7)
    
    return {
        "weekly": weekly,
        "monthly": monthly,
        "insights": insights,
        "recent_stress": recent_stress,
        "recent_cognitive": recent_cognitive,
        "summary": {
            "current_week_stress": weekly.avg_stress,
            "current_month_stress": monthly.avg_stress,
            "stress_trend": insights.get("trend", "stable"),
            "total_sessions_this_week": weekly.total_messages,
            "voice_sessions_this_week": weekly.voice_sessions,
            "improvement_score": monthly.improvement_score
        }
    }

@router.post("/stress-measurement")
async def record_stress_measurement(
    stress_level: float,
    stress_label: int,
    confidence: float,
    measurement_type: str,
    context: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record a new stress measurement"""
    from ..database import StressMeasurement
    
    measurement = StressMeasurement(
        user_id=current_user.id,
        stress_level=stress_level,
        stress_label=stress_label,
        confidence=confidence,
        measurement_type=measurement_type,
        source="manual",
        context=context
    )
    
    db.add(measurement)
    db.commit()
    db.refresh(measurement)
    
    return {"message": "Stress measurement recorded successfully", "id": measurement.id}

@router.post("/cognitive-load-measurement")
async def record_cognitive_load_measurement(
    cognitive_load: float,
    ready: bool = False,
    window_size: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record a new cognitive load measurement"""
    from ..database import CognitiveLoadMeasurement
    
    measurement = CognitiveLoadMeasurement(
        user_id=current_user.id,
        cognitive_load=cognitive_load,
        ready=ready,
        window_size=window_size
    )
    
    db.add(measurement)
    db.commit()
    db.refresh(measurement)
    
    return {"message": "Cognitive load measurement recorded successfully", "id": measurement.id}

@router.post("/mood-entry")
async def record_mood_entry(
    mood: str,
    intensity: int,
    triggers: Optional[str] = None,
    activities: Optional[str] = None,
    notes: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record a new mood entry"""
    from ..database import MoodEntry
    
    entry = MoodEntry(
        user_id=current_user.id,
        mood=mood,
        intensity=intensity,
        triggers=triggers,
        activities=activities,
        notes=notes
    )
    
    db.add(entry)
    db.commit()
    db.refresh(entry)
    
    return {"message": "Mood entry recorded successfully", "id": entry.id}

@router.get("/mood-recent")
async def get_recent_moods(
    days: int = Query(default=7, ge=1, le=30),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get recent mood entries"""
    from ..database import MoodEntry
    from datetime import datetime, timedelta
    
    start_date = datetime.now() - timedelta(days=days)
    
    entries = db.query(MoodEntry).filter(
        MoodEntry.user_id == current_user.id,
        MoodEntry.created_at >= start_date
    ).order_by(MoodEntry.created_at.desc()).all()
    
    return [
        {
            "id": entry.id,
            "mood": entry.mood,
            "intensity": entry.intensity,
            "triggers": entry.triggers,
            "activities": entry.activities,
            "notes": entry.notes,
            "created_at": entry.created_at.isoformat()
        }
        for entry in entries
    ]

@router.get("/mood-analytics")
async def get_mood_analytics(
    days: int = Query(default=30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get mood analytics and patterns"""
    from ..database import MoodEntry
    from datetime import datetime, timedelta
    from sqlalchemy import func
    
    start_date = datetime.now() - timedelta(days=days)
    
    # Get mood entries
    entries = db.query(MoodEntry).filter(
        MoodEntry.user_id == current_user.id,
        MoodEntry.created_at >= start_date
    ).all()
    
    if not entries:
        return {"message": "Not enough data for mood analytics"}
    
    # Calculate mood distribution
    mood_counts = {}
    intensity_sum = 0
    
    for entry in entries:
        mood_counts[entry.mood] = mood_counts.get(entry.mood, 0) + 1
        intensity_sum += entry.intensity
    
    # Find most common mood
    most_common_mood = max(mood_counts, key=mood_counts.get) if mood_counts else None
    
    # Calculate average intensity
    avg_intensity = intensity_sum / len(entries) if entries else 0
    
    # Analyze triggers
    trigger_counts = {}
    for entry in entries:
        if entry.triggers:
            triggers = [t.strip() for t in entry.triggers.split(',')]
            for trigger in triggers:
                trigger_counts[trigger] = trigger_counts.get(trigger, 0) + 1
    
    # Get top triggers
    top_triggers = sorted(trigger_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    return {
        "period_days": days,
        "total_entries": len(entries),
        "most_common_mood": most_common_mood,
        "average_intensity": round(avg_intensity, 1),
        "mood_distribution": mood_counts,
        "top_triggers": top_triggers,
        "mood_trend": "stable"  # Would need more complex analysis for trend
    }

@router.get("/export")
async def export_analytics_data(
    format: str = Query(default="json", regex="^(json|csv)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export user's analytics data"""
    analytics_service = AnalyticsService(db)
    
    # Parse dates if provided
    if start_date:
        start_date = datetime.strptime(start_date, "%Y-%m-%d")
    else:
        start_date = datetime.now() - timedelta(days=30)
    
    if end_date:
        end_date = datetime.strptime(end_date, "%Y-%m-%d")
    else:
        end_date = datetime.now()
    
    # Get data for the specified period
    days = (end_date - start_date).days
    stress_history = analytics_service.get_user_stress_history(current_user.id, days)
    cognitive_history = analytics_service.get_user_cognitive_load_history(current_user.id, days)
    
    export_data = {
        "user_id": current_user.id,
        "export_date": datetime.now().isoformat(),
        "period": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "days": days
        },
        "stress_measurements": stress_history,
        "cognitive_load_measurements": cognitive_history
    }
    
    if format == "csv":
        # Convert to CSV format (simplified)
        import csv
        import io
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(["Date", "Stress Level", "Stress Label", "Confidence", "Cognitive Load", "Ready"])
        
        # Write data
        stress_dict = {s.date: s for s in stress_history}
        cognitive_dict = {c.date: c for c in cognitive_history}
        
        all_dates = set(stress_dict.keys()) | set(cognitive_dict.keys())
        
        for date in sorted(all_dates):
            stress = stress_dict.get(date)
            cognitive = cognitive_dict.get(date)
            
            writer.writerow([
                date,
                stress.stress_level if stress else "",
                stress.stress_label if stress else "",
                stress.confidence if stress else "",
                cognitive.cognitive_load if cognitive else "",
                cognitive.ready if cognitive else ""
            ])
        
        return {"data": output.getvalue(), "format": "csv"}
    
    return export_data
