import os
import json
import urllib.request
import urllib.error

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

def get_gemini_completion(prompt: str) -> str:
    """
    Sends a prompt to Gemini 2.5 Flash. Falls back to a mock response if no key is configured.
    """
    if not GEMINI_API_KEY:
        # Fallback Mock Logic
        if "completed" in prompt.lower() and "remaining/incomplete habits: none" in prompt.lower():
            return "Fantastic work today! You completed all your habits and kept your streak alive. Keep pushing forward! 🔥"
        return "Keep going! You've got this. Let's finish today's remaining habits strong and start fresh tomorrow!"

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }]
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            method="POST",
            headers={"Content-Type": "application/json"},
            data=data
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            # Extract text content
            text = res_data["candidates"][0]["content"]["parts"][0]["text"]
            return text.strip()
    except Exception as e:
        print(f"[Gemini API Error] {e}. Falling back to mock message.")
        if "completed" in prompt.lower() and "remaining/incomplete habits: none" in prompt.lower():
            return "Sensational consistency today! You've checked off every single habit. Keep the momentum going! 🌟"
        return "Great effort today. Remember, building habits is a marathon. Protect your streak by completing what you can!"

def generate_daily_review(name: str, habits_summary: dict, streak: int) -> str:
    """
    Constructs a prompt and returns a personalized daily review message.
    """
    completed = habits_summary.get("completed", [])
    incomplete = habits_summary.get("incomplete", [])
    
    prompt = f"""
    You are a supportive, high-energy habit coach for "HabitRing" (a 180-Day Daily Routine Challenge).
    Create a brief personalized motivational note (maximum 2-3 sentences) for the user.
    
    User's Name: {name}
    Current Streak: {streak} days
    Completed Habits Today: {', '.join(completed) if completed else 'None'}
    Remaining/Incomplete Habits: {', '.join(incomplete) if incomplete else 'None'}
    
    Instructions:
    - If all habits are completed, congratulate them enthusiastically.
    - If some habits are incomplete, encourage them to log them before the day ends to protect their streak.
    - Keep it short, personal, and actionable. Do not output markdown structure.
    """
    return get_gemini_completion(prompt)

def generate_coach_response(name: str, habits: list, chat_history: list, user_message: str) -> str:
    """
    Constructs a prompt for the conversational AI Coach.
    """
    habits_str = ", ".join([h.name for h in habits])
    history_str = "\n".join([f"{msg['role']}: {msg['content']}" for msg in chat_history[-5:]])
    
    prompt = f"""
    You are a supportive and professional AI Habit Coach for "HabitRing".
    You help users build consistent daily routines, overcome setbacks, and stay motivated.
    
    Challenger's Name: {name}
    Challenger's Active Habits: {habits_str}
    
    Recent Conversation History:
    {history_str}
    
    Challenger's Message: {user_message}
    
    Instructions:
    - Provide a warm, actionable, and encouraging response.
    - Focus on small, incremental wins and consistency.
    - Limit your response to 2-3 short paragraphs.
    """
    return get_gemini_completion(prompt)
