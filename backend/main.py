import os
import sys
import time
import datetime
from typing import List, Dict, Optional

# Ensure the backend directory is in the search path for module imports
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, Depends, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

import models
import schemas
import auth
from database import engine, get_db, SessionLocal

app = FastAPI(title="HabitRing API Backend")

# Configure CORS Middleware
allowed_origins = ["*"] # Allow all for local dev and easy testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

from collections import defaultdict

# Login rate-limiting dictionary
login_attempts_by_ip = defaultdict(list)

def check_rate_limit(ip: str) -> bool:
    now = time.time()
    login_attempts_by_ip[ip] = [t for t in login_attempts_by_ip[ip] if now - t < 60]
    if len(login_attempts_by_ip[ip]) >= 5:
        return False
    login_attempts_by_ip[ip].append(now)
    return True

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    payload = auth.decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

# Helper to calculate user streaks dynamically
def recalculate_user_streak(db: Session, user_id: str):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        return
        
    # Get all habits that count toward the streak (global habits + user habits)
    habits = db.query(models.Habit).filter((models.Habit.created_by == None) | (models.Habit.created_by == user_id)).all()
    if not habits:
        return
        
    # Get all completed logs for the user, grouped by date
    logs = db.query(models.DailyLog).filter(models.DailyLog.user_id == user_id, models.DailyLog.completed == True).all()
    
    logs_by_date = defaultdict(list)
    for log in logs:
        logs_by_date[log.date].append(log.habit_id)
        
    # A day is "completed" if all habits active for that user are logged as completed on that date
    completed_dates = set()
    for log_date, completed_habit_ids in logs_by_date.items():
        if len(completed_habit_ids) >= len(habits):
            completed_dates.add(log_date)
            
    # Calculate streak counting backwards from today or yesterday
    today = datetime.date.today()
    yesterday = today - datetime.timedelta(days=1)
    
    today_str = today.isoformat()
    yesterday_str = yesterday.isoformat()
    
    streak = 0
    current_check = today
    
    # If today or yesterday is completed, start tracing backwards
    if today_str in completed_dates:
        start_date = today
    elif yesterday_str in completed_dates:
        start_date = yesterday
    else:
        # Streak is broken (0 days)
        user.streak = 0
        db.commit()
        return
        
    current_check = start_date
    while True:
        current_str = current_check.isoformat()
        if current_str in completed_dates:
            streak += 1
            current_check = current_check - datetime.timedelta(days=1)
        else:
            break
            
    user.streak = streak
    if streak > user.highest_streak:
        user.highest_streak = streak
    db.commit()

# Default habits seed constants
DEFAULT_HABITS = [
    { "id": "h_wakeup", "name": "Early Wakeup", "icon": "🌅", "goal_type": "boolean", "target_value": 1.0, "unit": "check-in" },
    { "id": "h_read", "name": "Read 5 Pages", "icon": "📚", "goal_type": "counter", "target_value": 5.0, "unit": "pages" },
    { "id": "h_walk", "name": "Walk after Meals", "icon": "🚶", "goal_type": "counter", "target_value": 3.0, "unit": "walks" },
    { "id": "h_exercise", "name": "1-Hour Exercise", "icon": "🏋️", "goal_type": "timer", "target_value": 60.0, "unit": "minutes" },
    { "id": "h_water", "name": "Drink 2L Water", "icon": "💧", "goal_type": "counter", "target_value": 2.0, "unit": "liters" }
]

def seed_habits(db: Session):
    if db.query(models.Habit).filter(models.Habit.created_by == None).count() == 0:
        for h in DEFAULT_HABITS:
            db.add(models.Habit(
                id=h["id"],
                name=h["name"],
                icon=h["icon"],
                goal_type=h["goal_type"],
                target_value=h["target_value"],
                unit=h["unit"],
                created_by=None
            ))
        db.commit()

@app.on_event("startup")
def on_startup():
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_habits(db)
    finally:
        db.close()

# Auth APIs
@app.post("/api/auth/register", response_model=schemas.UserResponse)
def register_user(reg_data: schemas.UserRegister, db: Session = Depends(get_db)):
    normalized_email = reg_data.email.strip().lower()
    # Check if email exists
    existing = db.query(models.User).filter(models.User.email == normalized_email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User with this email already exists")
        
    try:
        auth.validate_password_strength(reg_data.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
        
    import time
    user_id = f"u_{int(time.time() * 1000)}"
    
    new_user = models.User(
        id=user_id,
        name=reg_data.name,
        email=normalized_email,
        password_hash=auth.hash_password(reg_data.password)
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Generate token
    token = auth.create_access_token(data={"sub": new_user.email})
    new_user.token = token
    return new_user

@app.post("/api/auth/login", response_model=schemas.UserResponse)
def login_user(login_data: schemas.UserLogin, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again in a minute.")
        
    normalized_email = login_data.email.strip().lower()
    db_user = db.query(models.User).filter(models.User.email == normalized_email).first()
    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    if not auth.verify_password(login_data.password, db_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
        
    # Recalculate streak upon logging in to ensure freshness
    recalculate_user_streak(db, db_user.id)
    
    token = auth.create_access_token(data={"sub": db_user.email})
    db_user.token = token
    return db_user

@app.post("/api/auth/reset-password")
def reset_password(reset_data: schemas.PasswordReset, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    if not auth.verify_password(reset_data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    try:
        auth.validate_password_strength(reset_data.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    current_user.password_hash = auth.hash_password(reset_data.new_password)
    db.commit()
    return {"status": "success", "message": "Password updated successfully"}

@app.post("/api/auth/forgot-password")
def forgot_password_reset(data: schemas.ForgotPasswordReset, db: Session = Depends(get_db)):
    normalized_email = data.email.strip().lower()
    user = db.query(models.User).filter(models.User.email == normalized_email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Email address not found")
    if not user.name or user.name.strip().lower() != data.name.strip().lower():
        raise HTTPException(status_code=400, detail="Verification failed: Challenger name does not match")
    try:
        auth.validate_password_strength(data.new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    user.password_hash = auth.hash_password(data.new_password)
    db.commit()
    return {"status": "success", "message": "Password reset successfully"}

# Habits APIs
@app.get("/api/habits", response_model=List[schemas.HabitResponse])
def get_habits(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Returns global habits + user's custom habits
    habits = db.query(models.Habit).filter(
        (models.Habit.created_by == None) | (models.Habit.created_by == current_user.id)
    ).all()
    return habits

@app.post("/api/habits", response_model=schemas.HabitResponse)
def create_custom_habit(habit_data: schemas.HabitCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    import time
    habit_id = f"h_custom_{int(time.time() * 1000)}"
    new_habit = models.Habit(
        id=habit_id,
        name=habit_data.name,
        icon=habit_data.icon,
        goal_type=habit_data.goal_type,
        target_value=habit_data.target_value,
        unit=habit_data.unit,
        created_by=current_user.id
    )
    db.add(new_habit)
    db.commit()
    db.refresh(new_habit)
    
    # Recalculate streak since list of habits changed
    recalculate_user_streak(db, current_user.id)
    
    return new_habit

# Logs APIs
@app.get("/api/logs", response_model=List[schemas.DailyLogResponse])
def get_logs(date: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    logs = db.query(models.DailyLog).filter(
        models.DailyLog.user_id == current_user.id,
        models.DailyLog.date == date
    ).all()
    return logs

@app.post("/api/logs", response_model=schemas.DailyLogResponse)
def log_habit(log_data: schemas.DailyLogCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Find target habit configuration
    habit = db.query(models.Habit).filter(
        (models.Habit.id == log_data.habit_id) & 
        ((models.Habit.created_by == None) | (models.Habit.created_by == current_user.id))
    ).first()
    
    if not habit:
        raise HTTPException(status_code=404, detail="Habit not found or not owned by user.")
        
    # Check if a log already exists for this habit on this date
    existing_log = db.query(models.DailyLog).filter(
        models.DailyLog.user_id == current_user.id,
        models.DailyLog.habit_id == log_data.habit_id,
        models.DailyLog.date == log_data.date
    ).first()
    
    completed = log_data.value >= habit.target_value
    
    if existing_log:
        existing_log.value = log_data.value
        existing_log.completed = completed
        db.commit()
        db.refresh(existing_log)
        ret_log = existing_log
    else:
        import time
        log_id = f"log_{int(time.time() * 1000)}"
        new_log = models.DailyLog(
            id=log_id,
            user_id=current_user.id,
            habit_id=log_data.habit_id,
            date=log_data.date,
            value=log_data.value,
            completed=completed
        )
        db.add(new_log)
        db.commit()
        db.refresh(new_log)
        ret_log = new_log
        
    # Recalculate streak after logging
    recalculate_user_streak(db, current_user.id)
    return ret_log

# Leaderboard API
@app.get("/api/leaderboard", response_model=List[schemas.LeaderboardItem])
def get_leaderboard(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    users = db.query(models.User).all()
    today_str = datetime.date.today().isoformat()
    
    leaderboard = []
    for u in users:
        # Calculate completion rate for today
        habits_count = db.query(models.Habit).filter((models.Habit.created_by == None) | (models.Habit.created_by == u.id)).count()
        
        completed_count = db.query(models.DailyLog).filter(
            models.DailyLog.user_id == u.id,
            models.DailyLog.date == today_str,
            models.DailyLog.completed == True
        ).count()
        
        progress = (completed_count / habits_count * 100.0) if habits_count > 0 else 0.0
        
        # Double check and refresh streaks before displaying
        recalculate_user_streak(db, u.id)
        
        leaderboard.append(schemas.LeaderboardItem(
            id=u.id,
            name=u.name,
            streak=u.streak,
            highest_streak=u.highest_streak,
            today_progress=round(progress, 1)
        ))
        
    # Sort leaderboard by streak (descending), then highest streak, then name
    leaderboard.sort(key=lambda x: (x.streak, x.highest_streak, x.name), reverse=True)
    return leaderboard

# Reactions APIs
@app.get("/api/reactions", response_model=List[schemas.ReactionResponse])
def get_reactions(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    reactions = db.query(models.Reaction).filter(
        models.Reaction.receiver_id == current_user.id,
        models.Reaction.read == False
    ).order_by(models.Reaction.timestamp.desc()).all()
    
    ret_list = []
    for r in reactions:
        sender = db.query(models.User).filter(models.User.id == r.sender_id).first()
        ret_list.append(schemas.ReactionResponse(
            id=r.id,
            sender_id=r.sender_id,
            sender_name=sender.name if sender else "Friend",
            receiver_id=r.receiver_id,
            type=r.type,
            timestamp=r.timestamp,
            read=r.read
        ))
        
        # Mark as read immediately on fetch
        r.read = True
    db.commit()
    return ret_list

@app.post("/api/social/react")
def send_reaction(react_data: schemas.ReactionCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    if react_data.receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot send reactions to yourself.")
        
    receiver = db.query(models.User).filter(models.User.id == react_data.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="Recipient user not found.")
        
    import time
    react_id = f"react_{int(time.time() * 1000)}"
    new_react = models.Reaction(
        id=react_id,
        sender_id=current_user.id,
        receiver_id=react_data.receiver_id,
        type=react_data.type,
        timestamp=datetime.datetime.now().isoformat() + "Z",
        read=False
    )
    db.add(new_react)
    db.commit()
    return {"status": "success", "message": f"Reaction '{react_data.type}' sent to {receiver.name}"}

# Timeline Grid API
@app.get("/api/timeline", response_model=List[schemas.DailyDetailsResponse])
def get_timeline_history(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # Pull user logs grouped by date for the 180-day visualization
    logs = db.query(models.DailyLog).filter(models.DailyLog.user_id == current_user.id).all()
    
    logs_by_date = defaultdict(list)
    for l in logs:
        habit = db.query(models.Habit).filter(models.Habit.id == l.habit_id).first()
        logs_by_date[l.date].append({
            "habit_id": l.habit_id,
            "habit_name": habit.name if habit else "Unknown",
            "value": l.value,
            "completed": l.completed
        })
        
    # Get total habits configured
    habits_count = db.query(models.Habit).filter((models.Habit.created_by == None) | (models.Habit.created_by == current_user.id)).count()
    
    timeline = []
    for log_date, date_logs in logs_by_date.items():
        completed_count = sum(1 for l in date_logs if l["completed"])
        rate = (completed_count / habits_count * 100.0) if habits_count > 0 else 0.0
        timeline.append(schemas.DailyDetailsResponse(
            date=log_date,
            completion_rate=round(rate, 1),
            habits_logged=date_logs
        ))
        
    # Sort chronological
    timeline.sort(key=lambda x: x.date)
    return timeline
