// HabitRing Mobile Frontend Application Logic
const API_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
    ? 'http://localhost:8000/api'
    : window.location.origin + '/api';

// Active UI elements cache
const elements = {
    authScreen: document.getElementById('auth-screen'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    toggleAuthBtn: document.getElementById('toggle-auth-btn'),
    toastContainer: document.getElementById('toast-container'),
    
    currentDayLabel: document.getElementById('current-day-label'),
    headerStreakCount: document.getElementById('header-streak-count'),
    profileStreakCount: document.getElementById('profile-streak-count'),
    profileHighestStreak: document.getElementById('profile-highest-streak'),
    
    progressCircleFill: document.getElementById('progress-circle-fill'),
    dashboardProgressText: document.getElementById('dashboard-progress-text'),
    habitCardsList: document.getElementById('habit-cards-list'),
    
    leaderboardList: document.getElementById('leaderboard-list'),
    unreadReactionsBadge: document.getElementById('unread-reactions-badge'),
    reactionsFeed: document.getElementById('reactions-feed'),
    
    challengeGrid180: document.getElementById('challenge-grid-180'),
    
    createHabitForm: document.getElementById('create-habit-form'),
    resetPasswordForm: document.getElementById('reset-password-form'),
    logoutBtn: document.getElementById('logout-btn'),
    
    navTabs: document.querySelectorAll('.nav-tab'),
    viewSections: document.querySelectorAll('.view-section'),
    
    habitNameInput: document.getElementById('habit-name-input'),
    habitIconInput: document.getElementById('habit-icon-input'),
    habitGoalTypeSelect: document.getElementById('habit-goal-type-select'),
    habitTargetInput: document.getElementById('habit-target-input'),
    habitUnitInput: document.getElementById('habit-unit-input'),

    forgotPasswordForm: document.getElementById('forgot-password-form'),
    forgotPasswordLink: document.getElementById('forgot-password-link'),
    backToLoginBtn: document.getElementById('back-to-login-btn'),
    registerPasswordInput: document.getElementById('register-password'),
    forgotPasswordInput: document.getElementById('forgot-new-password'),
    resetPasswordInput: document.getElementById('reset-new-password'),
};

// Global App State
let appState = {
    user: null,
    habits: [],
    logs: {}, // map of habit_id -> DailyLog
    timeline: [],
    currentDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    activeTimers: {}, // map of habit_id -> setInterval instance
};

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-slide ${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';
    
    toast.innerHTML = `
        <div class="toast-body">
            <i data-lucide="${icon}" class="toast-icon"></i>
            <span>${message}</span>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    
    elements.toastContainer.appendChild(toast);
    if (window.lucide) {
        window.lucide.createIcons();
    }
    setTimeout(() => toast.remove(), 4000);
}

// REST Api fetch wrapper with token
async function apiRequest(endpoint, method = 'GET', data = null) {
    const token = sessionStorage.getItem('perf_eval_token');
    const headers = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = { method, headers };
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    try {
        const res = await fetch(`${API_URL}${endpoint}`, options);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || 'API request failed');
        }
        return await res.json();
    } catch (e) {
        console.error(e);
        throw e;
    }
}

// HTML5 Web Audio Synthesized Success Chime (Offline-ready)
function playSuccessChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
        osc.frequency.exponentialRampToValueAtTime(783.99, audioCtx.currentTime + 0.15); // G5
        osc.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.3); // C6
        
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.6);
    } catch (e) {
        console.warn("Failed to play synthesized sound:", e);
    }
}

// -------------------------------------------------------------
// Authentication System
// -------------------------------------------------------------
function checkAuth() {
    const token = sessionStorage.getItem('perf_eval_token');
    const userName = sessionStorage.getItem('perf_eval_user_name');
    
    if (token && userName) {
        elements.authScreen.classList.add('hidden');
        appState.user = { name: userName };
        initApp();
    } else {
        elements.authScreen.classList.remove('hidden');
    }
}

// Password Complexity Validation Helper
function checkPasswordStrength(password, checklistContainer) {
    if (!checklistContainer) return false;
    const rules = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[!@#$%^&*()\-=_+\[\]{}|;:',.<>?/~`]/.test(password),
    };
    
    let allValid = true;
    for (const [rule, isValid] of Object.entries(rules)) {
        const item = checklistContainer.querySelector(`[data-rule="${rule}"]`);
        if (item) {
            if (isValid) {
                item.classList.add('valid');
            } else {
                item.classList.remove('valid');
                allValid = false;
            }
        }
    }
    return allValid;
}

// Bind Authentication Listeners
if (elements.registerPasswordInput) {
    elements.registerPasswordInput.oninput = (e) => {
        const container = document.getElementById('register-password-checklist');
        checkPasswordStrength(e.target.value, container);
    };
}

if (elements.forgotPasswordInput) {
    elements.forgotPasswordInput.oninput = (e) => {
        const container = document.getElementById('forgot-password-checklist');
        checkPasswordStrength(e.target.value, container);
    };
}

if (elements.resetPasswordInput) {
    elements.resetPasswordInput.oninput = (e) => {
        const container = document.getElementById('reset-password-checklist');
        checkPasswordStrength(e.target.value, container);
    };
}

if (elements.forgotPasswordLink) {
    elements.forgotPasswordLink.onclick = (e) => {
        e.preventDefault();
        elements.loginForm.classList.add('hidden');
        elements.registerForm.classList.add('hidden');
        elements.forgotPasswordForm.classList.remove('hidden');
        elements.toggleAuthBtn.classList.add('hidden');
        elements.backToLoginBtn.classList.remove('hidden');
    };
}

if (elements.backToLoginBtn) {
    elements.backToLoginBtn.onclick = (e) => {
        e.preventDefault();
        elements.forgotPasswordForm.classList.add('hidden');
        elements.registerForm.classList.add('hidden');
        elements.loginForm.classList.remove('hidden');
        elements.toggleAuthBtn.classList.remove('hidden');
        elements.backToLoginBtn.classList.add('hidden');
        elements.toggleAuthBtn.textContent = "Don't have an account? Sign up";
    };
}

elements.toggleAuthBtn.onclick = (e) => {
    e.preventDefault();
    elements.forgotPasswordForm.classList.add('hidden');
    elements.backToLoginBtn.classList.add('hidden');
    elements.toggleAuthBtn.classList.remove('hidden');
    
    if (elements.loginForm.classList.contains('hidden')) {
        elements.loginForm.classList.remove('hidden');
        elements.registerForm.classList.add('hidden');
        elements.toggleAuthBtn.textContent = "Don't have an account? Sign up";
    } else {
        elements.loginForm.classList.add('hidden');
        elements.registerForm.classList.remove('hidden');
        elements.toggleAuthBtn.textContent = "Already have an account? Sign in";
    }
};

elements.loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    
    try {
        const data = await apiRequest('/auth/login', 'POST', { email, password });
        sessionStorage.setItem('perf_eval_token', data.token);
        sessionStorage.setItem('perf_eval_user_name', data.name);
        sessionStorage.setItem('perf_eval_user_email', data.email);
        
        showToast(`Welcome back, ${data.name}!`, 'success');
        elements.authScreen.classList.add('hidden');
        initApp();
    } catch (err) {
        showToast(err.message, 'error');
    }
};

elements.registerForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = elements.registerPasswordInput.value;
    
    const container = document.getElementById('register-password-checklist');
    const isStrong = checkPasswordStrength(password, container);
    if (!isStrong) {
        showToast("Password is not strong enough! Please satisfy all requirements.", "error");
        return;
    }
    
    try {
        const data = await apiRequest('/auth/register', 'POST', { name, email, password });
        sessionStorage.setItem('perf_eval_token', data.token);
        sessionStorage.setItem('perf_eval_user_name', data.name);
        sessionStorage.setItem('perf_eval_user_email', data.email);
        
        showToast(`Registration successful! Welcome ${data.name}`, 'success');
        elements.authScreen.classList.add('hidden');
        initApp();
    } catch (err) {
        showToast(err.message, 'error');
    }
};

if (elements.forgotPasswordForm) {
    elements.forgotPasswordForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value.trim();
        const name = document.getElementById('forgot-name').value.trim();
        const password = elements.forgotPasswordInput.value;
        
        const container = document.getElementById('forgot-password-checklist');
        const isStrong = checkPasswordStrength(password, container);
        if (!isStrong) {
            showToast("Password is not strong enough! Please satisfy all requirements.", "error");
            return;
        }
        
        try {
            await apiRequest('/auth/forgot-password', 'POST', { email, name, new_password: password });
            showToast("Password reset successfully! Logging you in...", "success");
            
            // Automatically log in the user
            const data = await apiRequest('/auth/login', 'POST', { email, password });
            sessionStorage.setItem('perf_eval_token', data.token);
            sessionStorage.setItem('perf_eval_user_name', data.name);
            sessionStorage.setItem('perf_eval_user_email', data.email);
            
            elements.authScreen.classList.add('hidden');
            elements.forgotPasswordForm.reset();
            initApp();
        } catch (err) {
            showToast(err.message, 'error');
        }
    };
}

elements.logoutBtn.onclick = () => {
    if (confirm("Are you sure you want to exit the challenge?")) {
        // Clear timers
        Object.values(appState.activeTimers).forEach(clearInterval);
        appState.activeTimers = {};
        
        sessionStorage.clear();
        window.location.reload();
    }
};

// -------------------------------------------------------------
// Core Habit Tracker Functionality
// -------------------------------------------------------------
async function initApp() {
    // 1. Fetch habits and initial data
    try {
        appState.habits = await apiRequest('/habits');
        const activeLogs = await apiRequest(`/logs?date=${appState.currentDate}`);
        
        appState.logs = {};
        activeLogs.forEach(l => {
            appState.logs[l.habit_id] = l;
        });
        
        // 2. Load settings profile stats
        const leaderData = await apiRequest('/leaderboard');
        const self = leaderData.find(item => item.name === sessionStorage.getItem('perf_eval_user_name'));
        if (self) {
            elements.headerStreakCount.textContent = `${self.streak} Days`;
            elements.profileStreakCount.textContent = `${self.streak} Days`;
            elements.profileHighestStreak.textContent = `${self.highest_streak} Days`;
        }
        
        // 3. Render views
        setupNavigation();
        renderDateCarousel();
        renderDashboard();
        renderTimelineGrid();
        renderLeaderboard();
        updateDayLabelOffset(new Date());
        fetchDailyReview();
        setupAiCoach();
        
        // 4. Start Social Polling Background Service (Sync standings & reactions)
        startBackgroundService();
        setupIdleTimeout();
        
    } catch (err) {
        showToast("Initialization error. Check connection.", 'error');
    }
}

// Date Selector Carousel Generator (7 Days history logging)
function renderDateCarousel() {
    const carousel = document.getElementById('date-carousel');
    if (!carousel) return;
    carousel.innerHTML = "";
    
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        const item = document.createElement('div');
        const isActive = dateStr === appState.currentDate;
        item.className = `date-item ${isActive ? 'active' : ''}`;
        item.dataset.date = dateStr;
        
        const isToday = dateStr === new Date().toISOString().split('T')[0];
        const labelText = isToday ? "Today" : weekdays[d.getDay()];
        const dayNum = d.getDate().toString().padStart(2, '0');
        
        item.innerHTML = `
            <span class="weekday">${labelText}</span>
            <span class="day-num">${dayNum}</span>
        `;
        
        item.onclick = async () => {
            if (appState.currentDate === dateStr) return;
            appState.currentDate = dateStr;
            
            try {
                const activeLogs = await apiRequest(`/logs?date=${appState.currentDate}`);
                appState.logs = {};
                activeLogs.forEach(l => {
                    appState.logs[l.habit_id] = l;
                });
                
                carousel.querySelectorAll('.date-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                
                renderDashboard();
                updateDayLabelOffset(d);
            } catch (e) {
                showToast("Error shifting date logs", "error");
            }
        };
        
        carousel.appendChild(item);
    }
}

function updateDayLabelOffset(selectedDateObj) {
    const start = new Date();
    start.setDate(start.getDate() - 90); // Mock starting 90 days ago for grid demonstration
    
    const diffTime = Math.abs(selectedDateObj - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    elements.currentDayLabel.textContent = `Day ${diffDays} of 180`;
}

// Render Dashboard List of Habits
function renderDashboard() {
    elements.habitCardsList.innerHTML = "";
    let completedCount = 0;
    
    appState.habits.forEach(h => {
        const log = appState.logs[h.id] || { value: 0.0, completed: false };
        if (log.completed) completedCount++;
        
        const card = document.createElement('div');
        card.className = `habit-card ${log.completed ? 'completed' : ''}`;
        
        // Header info of habit
        const infoHtml = `
            <div class="habit-info">
                <span class="habit-icon">${h.icon}</span>
                <div class="habit-details">
                    <h5 class="habit-title">${h.name}</h5>
                    <span class="habit-subtitle">${log.completed ? 'Completed' : 'Target: ' + h.target_value + ' ' + h.unit}</span>
                </div>
            </div>
        `;
        
        // Control actions wrapper based on Goal Type
        let controlsHtml = "";
        
        if (h.goal_type === 'boolean') {
            controlsHtml = `
                <button onclick="toggleCheckboxHabit('${h.id}', ${log.completed ? 0 : 1})" class="checkbox-btn ${log.completed ? 'completed' : ''}">
                    <span class="checkbox-tick">${log.completed ? '✓' : ''}</span>
                </button>
            `;
        } else if (h.goal_type === 'counter') {
            // Water/Page counter controls
            controlsHtml = `
                <div class="counter-controls">
                    <button onclick="logCounterHabit('${h.id}', -1)" class="counter-btn minus">-</button>
                    <span class="counter-value">${log.value.toFixed(0)}</span>
                    <button onclick="logCounterHabit('${h.id}', 1)" class="counter-btn plus">+</button>
                </div>
            `;
        } else if (h.goal_type === 'timer') {
            // Countdown exercise timer controls
            const isRunning = !!appState.activeTimers[h.id];
            const remaining = log.completed ? 0 : Math.max(0, h.target_value * 60 - (log.value * 60)); // remaining in seconds
            const formatTime = (sec) => {
                const m = Math.floor(sec / 60);
                const s = Math.floor(sec % 60);
                return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
            };
            
            controlsHtml = `
                <div class="timer-controls">
                    <span class="timer-display ${isRunning ? 'pulse' : ''}">${formatTime(remaining)}</span>
                    <button onclick="toggleTimerHabit('${h.id}')" class="btn-timer ${log.completed ? 'completed' : isRunning ? 'running' : ''}">
                        ${log.completed ? 'Done' : isRunning ? 'Pause' : 'Start'}
                    </button>
                </div>
            `;
        }
        
        card.innerHTML = `${infoHtml} ${controlsHtml}`;
        elements.habitCardsList.appendChild(card);
    });
    
    // Calculate and render progress ring
    const totalHabits = appState.habits.length;
    const progressRate = totalHabits > 0 ? (completedCount / totalHabits * 100.0) : 0.0;
    
    elements.dashboardProgressText.textContent = `${progressRate.toFixed(0)}%`;
    
    // Circle stroke dash offset calculation (213.6 is the circumference for r=34)
    const offset = 213.6 - (progressRate / 100.0 * 213.6);
    elements.progressCircleFill.setAttribute('stroke-dashoffset', offset);
}

// Checkbox routine actions
async function toggleCheckboxHabit(habitId, targetValue) {
    try {
        const log = await apiRequest('/logs', 'POST', {
            habit_id: habitId,
            date: appState.currentDate,
            value: parseFloat(targetValue)
        });
        
        appState.logs[habitId] = log;
        if (log.completed) {
            playSuccessChime();
            showToast("Goal completed! Streak secured.", "success");
        }
        
        renderDashboard();
        updateStreaks();
    } catch (e) {
        showToast("Error updating routine checkbox", "error");
    }
}

// Counter habit actions (water/reading)
async function logCounterHabit(habitId, amount) {
    const currentVal = appState.logs[habitId] ? appState.logs[habitId].value : 0.0;
    const targetVal = appState.habits.find(h => h.id === habitId).target_value;
    const newVal = Math.max(0.0, currentVal + amount);
    
    try {
        const log = await apiRequest('/logs', 'POST', {
            habit_id: habitId,
            date: appState.currentDate,
            value: parseFloat(newVal)
        });
        
        const oldCompleted = appState.logs[habitId] ? appState.logs[habitId].completed : false;
        appState.logs[habitId] = log;
        
        if (log.completed && !oldCompleted) {
            playSuccessChime();
            showToast("Goal completed! Keep pushing.", "success");
        }
        
        renderDashboard();
        updateStreaks();
    } catch (e) {
        showToast("Error logging counter value", "error");
    }
}

// Timer workflow actions (workout countdown)
function toggleTimerHabit(habitId) {
    const habit = appState.habits.find(h => h.id === habitId);
    const log = appState.logs[habitId] || { value: 0.0, completed: false };
    
    if (log.completed) return;
    
    if (appState.activeTimers[habitId]) {
        // Pause timer
        clearInterval(appState.activeTimers[habitId]);
        delete appState.activeTimers[habitId];
        renderDashboard();
    } else {
        // Start timer (runs every second)
        appState.activeTimers[habitId] = setInterval(async () => {
            const currentLog = appState.logs[habitId] || { value: 0.0, completed: false };
            // Increment logged value by 1 second (1/60th of a minute)
            const addedMinutes = 1.0 / 60.0;
            const updatedVal = Math.min(habit.target_value, currentLog.value + addedMinutes);
            
            try {
                const updatedLog = await apiRequest('/logs', 'POST', {
                    habit_id: habitId,
                    date: appState.currentDate,
                    value: parseFloat(updatedVal)
                });
                
                appState.logs[habitId] = updatedLog;
                
                if (updatedLog.completed) {
                    clearInterval(appState.activeTimers[habitId]);
                    delete appState.activeTimers[habitId];
                    playSuccessChime();
                    showToast("Workout complete! Awesome work.", "success");
                    updateStreaks();
                }
                
                renderDashboard();
            } catch (e) {
                console.error("Timer tick sync failed:", e);
            }
        }, 1000);
        
        renderDashboard();
    }
}

async function updateStreaks() {
    try {
        const leaderData = await apiRequest('/leaderboard');
        const self = leaderData.find(item => item.name === sessionStorage.getItem('perf_eval_user_name'));
        if (self) {
            elements.headerStreakCount.textContent = `${self.streak} Days`;
            elements.profileStreakCount.textContent = `${self.streak} Days`;
            elements.profileHighestStreak.textContent = `${self.highest_streak} Days`;
        }
        renderTimelineGrid();
        fetchDailyReview();
    } catch (e) {
        console.error("Streak sync failed:", e);
    }
}

// -------------------------------------------------------------
// Leaderboard & Social System
// -------------------------------------------------------------
async function renderLeaderboard() {
    try {
        const leaderboard = await apiRequest('/leaderboard');
        elements.leaderboardList.innerHTML = "";
        
        leaderboard.forEach((item, index) => {
            const isSelf = item.name === sessionStorage.getItem('perf_eval_user_name');
            const row = document.createElement('div');
            row.className = `leaderboard-item ${isSelf ? 'is-self' : ''}`;
            
            let rankHtml = `<span class="rank-num">${index + 1}</span>`;
            if (index === 0) rankHtml = `<span class="rank-badge">🥇</span>`;
            if (index === 1) rankHtml = `<span class="rank-badge">🥈</span>`;
            if (index === 2) rankHtml = `<span class="rank-badge">🥉</span>`;
            
            const infoHtml = `
                <div class="leader-info">
                    ${rankHtml}
                    <div class="leader-details">
                        <h6>${item.name} ${isSelf ? '(You)' : ''}</h6>
                        <span class="leader-subtext">Today: ${item.today_progress}%</span>
                    </div>
                </div>
            `;
            
            let actionButtons = "";
            if (!isSelf) {
                actionButtons = `
                    <div class="reaction-buttons">
                        <button onclick="sendSocialReaction('${item.id}', 'cheer')" class="btn-react" title="Cheer">🎉</button>
                        <button onclick="sendSocialReaction('${item.id}', 'fire')" class="btn-react" title="Send Fire">🔥</button>
                        <button onclick="sendSocialReaction('${item.id}', 'nudge')" class="btn-react" title="Nudge">🔔</button>
                    </div>
                `;
            } else {
                actionButtons = `
                    <div class="streak-pill">
                        🔥 ${item.streak} Day streak
                    </div>
                `;
            }
            
            row.innerHTML = `${infoHtml} ${actionButtons}`;
            elements.leaderboardList.appendChild(row);
        });
        
    } catch (e) {
        console.error("Failed to render standings:", e);
    }
}

async function sendSocialReaction(receiverId, type) {
    try {
        await apiRequest('/social/react', 'POST', { receiver_id: receiverId, type });
        showToast("Reaction sent successfully!", "success");
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function fetchReactions() {
    if (!sessionStorage.getItem('perf_eval_token')) return;
    
    try {
        const reactions = await apiRequest('/reactions');
        if (reactions.length > 0) {
            elements.unreadReactionsBadge.classList.remove('hidden');
            
            reactions.forEach(r => {
                const card = document.createElement('div');
                card.className = "reaction-card";
                
                let emoji = "🎉";
                if (r.type === 'nudge') emoji = "🔔";
                if (r.type === 'fire') emoji = "🔥";
                
                card.innerHTML = `
                    <span class="reaction-text">${emoji} <strong>${r.sender_name}</strong> sent you a ${r.type}!</span>
                    <span class="timestamp">${new Date(r.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                `;
                elements.reactionsFeed.prepend(card);
                
                // Fire native browser notification
                if (Notification.permission === 'granted') {
                    new Notification("HabitRing Social Alert", {
                        body: `${r.sender_name} sent you a ${r.type}!`,
                        icon: 'assets/flame.png'
                    });
                }
            });
            
            setTimeout(() => {
                elements.unreadReactionsBadge.classList.add('hidden');
            }, 5000);
        }
    } catch (e) {
        console.error("Failed to fetch reactions:", e);
    }
}

// -------------------------------------------------------------
// Timeline & Historical 180 Days Grid
// -------------------------------------------------------------
async function renderTimelineGrid() {
    elements.challengeGrid180.innerHTML = "";
    
    try {
        const timeline = await apiRequest('/timeline');
        const timelineMap = {};
        timeline.forEach(item => {
            timelineMap[item.date] = item.completion_rate;
        });
        
        // Loop from Day 1 to 180
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90); // Set start date to 90 days ago for demonstration
        
        for (let i = 1; i <= 180; i++) {
            const dateObj = new Date(startDate);
            dateObj.setDate(startDate.getDate() + i - 1);
            const dateStr = dateObj.toISOString().split('T')[0];
            
            const box = document.createElement('div');
            box.className = "grid-box text-white bg-gray-900/60 hover:bg-gray-800/80";
            box.textContent = i;
            box.title = `Day ${i}: ${dateStr}`;
            
            if (timelineMap[dateStr] !== undefined) {
                const completionRate = timelineMap[dateStr];
                if (completionRate >= 100.0) {
                    box.className = "grid-box bg-emerald-600 text-white font-extrabold shadow-sm shadow-emerald-950/20";
                } else if (completionRate > 0.0) {
                    box.className = "grid-box bg-yellow-600 text-white font-extrabold shadow-sm shadow-yellow-950/20";
                } else {
                    box.className = "grid-box bg-red-650 text-white font-extrabold shadow-sm shadow-red-950/20";
                }
            } else {
                // If past day but no logs logged, mark as missed (Red)
                const todayStr = new Date().toISOString().split('T')[0];
                if (dateStr < todayStr) {
                    box.className = "grid-box bg-red-650/40 text-gray-500";
                }
            }
            
            elements.challengeGrid180.appendChild(box);
        }
        
    } catch (e) {
        console.error("Timeline render error:", e);
    }
}

// -------------------------------------------------------------
// Custom Habit Creation
// -------------------------------------------------------------
elements.createHabitForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = elements.habitNameInput.value.trim();
    const icon = elements.habitIconInput.value.trim();
    const goal_type = elements.habitGoalTypeSelect.value;
    const target_value = parseFloat(elements.habitTargetInput.value);
    const unit = elements.habitUnitInput.value.trim();
    
    try {
        await apiRequest('/habits', 'POST', { name, icon, goal_type, target_value, unit });
        showToast("Custom habit created successfully!", "success");
        
        // Reset and refresh
        elements.createHabitForm.reset();
        elements.habitIconInput.value = "🔥";
        elements.habitGoalTypeSelect.value = "boolean";
        elements.habitTargetInput.value = "1";
        elements.habitUnitInput.value = "times";
        
        initApp();
        switchView('dashboard');
    } catch (err) {
        showToast(err.message, 'error');
    }
};

// -------------------------------------------------------------
// Update Credentials (Password Reset)
// -------------------------------------------------------------
if (elements.resetPasswordForm) {
    elements.resetPasswordForm.onsubmit = async (e) => {
        e.preventDefault();
        const current_password = document.getElementById('reset-current-password').value;
        const new_password = elements.resetPasswordInput.value;
        
        const container = document.getElementById('reset-password-checklist');
        const isStrong = checkPasswordStrength(new_password, container);
        if (!isStrong) {
            showToast("New password is not strong enough! Please satisfy all requirements.", "error");
            return;
        }
        
        try {
            await apiRequest('/auth/reset-password', 'POST', { current_password, new_password });
            showToast("Password updated successfully!", "success");
            elements.resetPasswordForm.reset();
            
            // Clear checklist items
            if (container) {
                container.querySelectorAll('.checklist-item').forEach(item => item.classList.remove('valid'));
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    };
}

// Bind Logout button click
if (elements.logoutBtn) {
    elements.logoutBtn.onclick = () => {
        Object.values(appState.activeTimers).forEach(clearInterval);
        appState.activeTimers = {};
        sessionStorage.clear();
        window.location.reload();
    };
}

// -------------------------------------------------------------
// AI Integration Helpers & Event Listeners
// -------------------------------------------------------------
let aiCoachHistory = [];

async function fetchDailyReview() {
    const banner = document.getElementById('ai-daily-review-banner');
    const text = document.getElementById('ai-daily-review-text');
    if (!banner || !text) return;

    banner.classList.remove('hidden');
    text.textContent = "Analyzing today's logging trends...";

    try {
        const data = await apiRequest('/ai/daily-review', 'GET');
        text.textContent = data.message;
    } catch (e) {
        console.error("AI Daily review error:", e);
        banner.classList.add('hidden');
    }
}

function setupAiCoach() {
    const form = document.getElementById('ai-chat-form');
    if (form) {
        form.onsubmit = handleAiCoachChat;
    }
}

async function handleAiCoachChat(e) {
    e.preventDefault();
    const input = document.getElementById('ai-chat-input');
    const container = document.getElementById('ai-chat-messages');
    if (!input || !container) return;

    const message = input.value.trim();
    if (!message) return;

    // Clear input
    input.value = "";

    // Append User Message to UI
    appendChatMessage('user', message);

    // Show loading assistant message
    const loadingMessage = appendChatMessage('assistant', '...');

    try {
        const response = await apiRequest('/ai/coach', 'POST', {
            message: message,
            history: aiCoachHistory
        });

        // Remove loading message bubble and update with real reply
        loadingMessage.remove();
        appendChatMessage('assistant', response.response);

        // Save messages in history
        aiCoachHistory.push({ role: 'user', content: message });
        aiCoachHistory.push({ role: 'model', content: response.response });
    } catch (err) {
        if (loadingMessage) loadingMessage.remove();
        appendChatMessage('assistant', 'Sorry, I encountered an error connecting to the coach service. Please try again!');
    }
}

function appendChatMessage(role, content) {
    const container = document.getElementById('ai-chat-messages');
    if (!container) return null;

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    msgDiv.innerHTML = `
        <div class="message-bubble">
            ${content}
        </div>
    `;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    return msgDiv;
}

// -------------------------------------------------------------
// Tab / Views Navigation Setup
// -------------------------------------------------------------
function setupNavigation() {
    elements.navTabs.forEach(tab => {
        tab.onclick = (e) => {
            e.preventDefault();
            const targetView = tab.getAttribute('data-view');
            switchView(targetView);
        };
    });
}

function switchView(viewId) {
    elements.viewSections.forEach(sec => {
        sec.classList.add('hidden');
    });
    elements.navTabs.forEach(t => {
        t.classList.remove('active', 'text-violet-500');
        t.classList.add('text-gray-500');
    });
    
    const activeSection = document.getElementById(`${viewId}-view`);
    if (activeSection) {
        activeSection.classList.remove('hidden');
    }
    
    const activeTab = [...elements.navTabs].find(t => t.getAttribute('data-view') === viewId);
    if (activeTab) {
        activeTab.classList.add('active', 'text-violet-500');
        activeTab.classList.remove('text-gray-500');
    }
    
    // Trigger refreshes depending on view
    if (viewId === 'leaderboard') renderLeaderboard();
    if (viewId === 'timeline') renderTimelineGrid();
}

// -------------------------------------------------------------
// Background Social Service Polling
// -------------------------------------------------------------
let backgroundPollId = null;

function startBackgroundService() {
    if (backgroundPollId) clearInterval(backgroundPollId);
    
    // Request notification permission on startup
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Poll every 10 seconds for leaderboard standings and reactions
    backgroundPollId = setInterval(() => {
        fetchReactions();
        if (document.getElementById('leaderboard-view').classList.contains('hidden') === false) {
            renderLeaderboard();
        }
    }, 10000);
}

// -------------------------------------------------------------
// Idle Inactivity Timeout (Security Audit Compliance)
// -------------------------------------------------------------
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes
let idleTimer = null;

function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (sessionStorage.getItem('perf_eval_token')) {
        console.debug("[Inactivity Monitor] Session reset.");
        idleTimer = setTimeout(() => {
            showToast("Your session expired due to inactivity.", "info");
            Object.values(appState.activeTimers).forEach(clearInterval);
            appState.activeTimers = {};
            sessionStorage.clear();
            window.location.reload();
        }, IDLE_TIMEOUT_MS);
    }
}

function setupIdleTimeout() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(evt => {
        document.addEventListener(evt, resetIdleTimer, true);
    });
    resetIdleTimer();
}

// Start Application!
checkAuth();
