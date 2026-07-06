import json
from sqlalchemy import Column, String, Float, Integer, Boolean, ForeignKey, Text, TypeDecorator
from sqlalchemy.orm import relationship
from database import Base

class JSONText(TypeDecorator):
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return json.dumps(value)
        return None

    def process_result_value(self, value, dialect):
        if value is not None:
            try:
                return json.loads(value)
            except:
                return {}
        return None

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    streak = Column(Integer, default=0)
    highest_streak = Column(Integer, default=0)
    last_active_date = Column(String, nullable=True) # YYYY-MM-DD

    logs = relationship("DailyLog", back_populates="user", cascade="all, delete-orphan")
    habits = relationship("Habit", back_populates="creator", cascade="all, delete-orphan")

class Habit(Base):
    __tablename__ = "habits"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    icon = Column(String, default="🔥")
    goal_type = Column(String, default="boolean") # boolean, counter, timer
    target_value = Column(Float, default=1.0)
    unit = Column(String, default="times") # times, liters, pages, minutes
    created_by = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=True) # None for global/system defaults

    creator = relationship("User", back_populates="habits")
    logs = relationship("DailyLog", back_populates="habit", cascade="all, delete-orphan")

class DailyLog(Base):
    __tablename__ = "daily_logs"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    habit_id = Column(String, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False)
    date = Column(String, index=True, nullable=False) # YYYY-MM-DD
    value = Column(Float, default=0.0)
    completed = Column(Boolean, default=False)

    user = relationship("User", back_populates="logs")
    habit = relationship("Habit", back_populates="logs")

class Reaction(Base):
    __tablename__ = "reactions"

    id = Column(String, primary_key=True, index=True)
    sender_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String, nullable=False) # cheer, nudge, fire
    timestamp = Column(String, nullable=False) # ISO time string
    read = Column(Boolean, default=False)
