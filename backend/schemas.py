from pydantic import BaseModel
from typing import List, Dict, Optional

class UserLogin(BaseModel):
    email: str
    password: str

class UserRegister(BaseModel):
    name: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    streak: int
    highest_streak: int
    token: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

class HabitCreate(BaseModel):
    name: str
    icon: Optional[str] = "🔥"
    goal_type: str # boolean, counter, timer
    target_value: float
    unit: str

class HabitResponse(BaseModel):
    id: str
    name: str
    icon: str
    goal_type: str
    target_value: float
    unit: str
    created_by: Optional[str] = None

    class Config:
        orm_mode = True
        from_attributes = True

class DailyLogCreate(BaseModel):
    habit_id: str
    date: str # YYYY-MM-DD
    value: float

class DailyLogResponse(BaseModel):
    id: str
    user_id: str
    habit_id: str
    date: str
    value: float
    completed: bool

    class Config:
        orm_mode = True
        from_attributes = True

class ReactionCreate(BaseModel):
    receiver_id: str
    type: str # cheer, nudge, fire

class ReactionResponse(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    receiver_id: str
    type: str
    timestamp: str
    read: bool

    class Config:
        orm_mode = True
        from_attributes = True

class LeaderboardItem(BaseModel):
    id: str
    name: str
    streak: int
    highest_streak: int
    today_progress: float # Percentage 0.0 to 100.0

class DailyDetailsResponse(BaseModel):
    date: str
    completion_rate: float # 0.0 to 100.0
    habits_logged: List[Dict]

class PasswordReset(BaseModel):
    current_password: str
    new_password: str

class ForgotPasswordReset(BaseModel):
    email: str
    name: str
    new_password: str

class ChatMessage(BaseModel):
    role: str
    content: str

class CoachChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []

class CoachChatResponse(BaseModel):
    response: str
