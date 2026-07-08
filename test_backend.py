import sys
import os
import time

# Add backend directory to system path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "backend")))

import main
import models
import auth
from database import SessionLocal, engine

def run_tests():
    print("=== STARTING HABITRING BACKEND INTEGRATION TESTS ===")
    
    # 1. Initialize Database Tables
    print("Initializing SQLite database tables...")
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # Clear existing rows to ensure clean test state
        db.query(models.Reaction).delete()
        db.query(models.DailyLog).delete()
        db.query(models.Habit).delete()
        db.query(models.User).delete()
        db.commit()
        
        # 2. Seed Default Habits
        print("Seeding default challenge habits...")
        main.seed_habits(db)
        habits = db.query(models.Habit).all()
        assert len(habits) == 5, f"Expected 5 seeded habits, got {len(habits)}"
        print(f"Successfully seeded {len(habits)} habits.")
        
        # 3. Register Users
        print("Registering mock test challengers...")
        u1_pass = "P@ssword123"
        u2_pass = "Ch@llenge456"
        
        # Verify password strength validations
        try:
            auth.validate_password_strength("weak")
            assert False, "Should have raised ValueError for weak password"
        except ValueError as e:
            print("Passed: Password complexity validation caught weak password.")
            
        user1 = models.User(
            id="u_alice",
            name="Alice Smith",
            email="alice@habitring.com",
            password_hash=auth.hash_password(u1_pass)
        )
        user2 = models.User(
            id="u_bob",
            name="Bob Jones",
            email="bob@habitring.com",
            password_hash=auth.hash_password(u2_pass)
        )
        db.add(user1)
        db.add(user2)
        db.commit()
        print("Successfully registered Alice and Bob.")

        # 4. Verify Custom Habit Creation
        print("Testing custom habit creation (e.g. 'Early to Bed')...")
        custom_habit = models.Habit(
            id="h_bed",
            name="Early to Bed",
            icon="🛌",
            goal_type="boolean",
            target_value=1.0,
            unit="check-in",
            created_by=user1.id
        )
        db.add(custom_habit)
        db.commit()
        print(f"Created custom habit: {custom_habit.name}")

        # 5. Log Habits and recalculate streaks
        import datetime
        yesterday_str = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        today_str = datetime.date.today().isoformat()

        print(f"Simulating habit logging for Alice on date {yesterday_str} (yesterday)...")
        # Alice completes all 6 habits (5 global + 1 custom)
        active_habits_alice = db.query(models.Habit).filter(
            (models.Habit.created_by == None) | (models.Habit.created_by == user1.id)
        ).all()
        
        for h in active_habits_alice:
            log = models.DailyLog(
                id=f"log_y_{h.id}",
                user_id=user1.id,
                habit_id=h.id,
                date=yesterday_str,
                value=h.target_value,
                completed=True
            )
            db.add(log)
        db.commit()
        
        print("Recalculating streak for Alice...")
        main.recalculate_user_streak(db, user1.id)
        db.refresh(user1)
        print(f"Alice's calculated streak (completed yesterday): {user1.streak} days")
        assert user1.streak == 1, f"Expected streak of 1, got {user1.streak}"

        # Alice also completes all habits today
        print(f"Simulating habit logging for Alice on date {today_str} (today)...")
        for h in active_habits_alice:
            log = models.DailyLog(
                id=f"log_t_{h.id}",
                user_id=user1.id,
                habit_id=h.id,
                date=today_str,
                value=h.target_value,
                completed=True
            )
            db.add(log)
        db.commit()
        
        main.recalculate_user_streak(db, user1.id)
        db.refresh(user1)
        print(f"Alice's updated streak (completed yesterday + today): {user1.streak} days")
        assert user1.streak == 2, f"Expected streak of 2, got {user1.streak}"

        # 6. Test Social Reactions
        print("Testing social cheering between Bob and Alice...")
        react = models.Reaction(
            id="r_cheer_1",
            sender_id=user2.id,
            receiver_id=user1.id,
            type="cheer",
            timestamp="2026-07-06T12:00:00Z",
            read=False
        )
        db.add(react)
        db.commit()
        
        unread_reactions = db.query(models.Reaction).filter(
            models.Reaction.receiver_id == user1.id,
            models.Reaction.read == False
        ).all()
        assert len(unread_reactions) == 1, "Expected 1 unread reaction for Alice"
        print("Passed: Bob cheered Alice successfully and reaction stored.")

        # 7. Test Forgot Password recovery flow
        print("Testing public forgot password recovery endpoint...")
        import schemas
        from fastapi import HTTPException
        
        # Test 7.1: Incorrect challenger name validation
        data_bad_name = schemas.ForgotPasswordReset(
            email="alice@habitring.com",
            name="Wrong Name",
            new_password="NewSecureP@ss123"
        )
        try:
            main.forgot_password_reset(data_bad_name, db)
            assert False, "Should have raised HTTPException for mismatching name"
        except HTTPException as e:
            assert e.status_code == 400
            print("Passed: Mismatching challenger name caught correctly.")

        # Test 7.2: Weak password validation
        data_weak_pw = schemas.ForgotPasswordReset(
            email="alice@habitring.com",
            name="Alice Smith",
            new_password="weak"
        )
        try:
            main.forgot_password_reset(data_weak_pw, db)
            assert False, "Should have raised HTTPException for weak password"
        except HTTPException as e:
            assert e.status_code == 400
            print("Passed: Weak password caught correctly.")

        # Test 7.3: Successful reset
        data_ok = schemas.ForgotPasswordReset(
            email="alice@habitring.com",
            name="Alice Smith",
            new_password="NewSecureP@ss123"
        )
        res = main.forgot_password_reset(data_ok, db)
        assert res["status"] == "success"
        
        # Verify database update
        db.refresh(user1)
        assert auth.verify_password("NewSecureP@ss123", user1.password_hash)
        print("Passed: Public forgot password reset completed successfully.")

        print("=== ALL HABITRING INTEGRATION TESTS COMPLETED SUCCESSFULLY ===")
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
