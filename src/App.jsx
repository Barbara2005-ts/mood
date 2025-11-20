import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, onValue, set, remove } from 'firebase/database';
import Confetti from 'react-confetti';
import { format, parseISO, isToday, isFuture } from 'date-fns';
import { Pie, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, LineElement, PointElement, LinearScale, Title, Tooltip, Legend, CategoryScale } from 'chart.js';

ChartJS.register(ArcElement, LineElement, PointElement, LinearScale, Title, Tooltip, Legend, CategoryScale);

const moods = [
  { emoji: '😢', value: 1, color: '#ff6b6b', description: 'Очень плохо' },
  { emoji: '😔', value: 2, color: '#ffa94d', description: 'Плохо' },
  { emoji: '😐', value: 3, color: '#ffd43b', description: 'Нормально' },
  { emoji: '😊', value: 4, color: '#69db7c', description: 'Хорошо' },
  { emoji: '🤩', value: 5, color: '#4dabf7', description: 'Отлично!' }
];

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedMood, setSelectedMood] = useState(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [moodHistory, setMoodHistory] = useState({});
  const [showConfetti, setShowConfetti] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('today');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [editingMood, setEditingMood] = useState(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) loadMoods(u.uid);
    });
  }, []);

  const loadMoods = (uid) => {
    const moodsRef = ref(db, 'moods/' + uid);
    onValue(moodsRef, (snapshot) => {
      const data = snapshot.val() || {};
      setMoodHistory(data);

      const last7 = Object.entries(data)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 7);
      if (last7.length === 7 && last7.every(([_, m]) => m.mood === 5)) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 8000);
      }
    });
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const saveMood = () => {
    if (!selectedMood) return;
    
    if (isFuture(parseISO(selectedDate))) {
      alert('Нельзя добавлять настроение за будущие даты!');
      return;
    }
    
    const userRef = ref(db, 'moods/' + user.uid + '/' + selectedDate);
    set(userRef, { 
      mood: selectedMood, 
      note, 
      timestamp: Date.now(),
      date: selectedDate
    });
    
    setNote('');
    setSelectedMood(null);
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setEditingMood(null);
    setActiveTab('calendar');
  };

  const deleteMood = (date) => {
    if (window.confirm('Удалить запись о настроении за этот день?')) {
      const userRef = ref(db, 'moods/' + user.uid + '/' + date);
      remove(userRef);
    }
  };

  const editMood = (date) => {
    const moodData = moodHistory[date];
    setSelectedMood(moodData.mood);
    setNote(moodData.note || '');
    setSelectedDate(date);
    setEditingMood(date);
    setActiveTab('today');
  };

  const exportToPDF = () => {
    // Простой экспорт данных в текстовый файл
    const data = {
      пользователь: user.email,
      период: getDateRange(),
      статистика: {
        всего_записей: Object.keys(moodHistory).length,
        среднее_настроение: Object.keys(moodHistory).length > 0 ? 
          (Object.values(moodHistory).reduce((acc, m) => acc + m.mood, 0) / Object.keys(moodHistory).length).toFixed(1) : 0,
        отслеживание_с: getFirstEntryDate()
      },
      записи: Object.entries(moodHistory)
        .sort()
        .reverse()
        .map(([date, moodData]) => ({
          дата: format(parseISO(date), 'dd.MM.yyyy'),
          настроение: moods.find(m => m.value === moodData.mood)?.description,
          эмодзи: moods.find(m => m.value === moodData.mood)?.emoji,
          заметка: moodData.note || 'нет'
        }))
    };

    const text = `MoodFlow - Отчет настроения\n
Пользователь: ${data.пользователь}
Период: ${data.период}

СТАТИСТИКА:
- Всего записей: ${data.статистика.всего_записей}
- Среднее настроение: ${data.статистика.среднее_настроение}/5
- Отслеживание с: ${data.статистика.отслеживание_с}

ИСТОРИЯ НАСТРОЕНИЙ:
${data.записи.map(entry => 
  `${entry.дата} - ${entry.эмодзи} ${entry.настроение} - Заметка: ${entry.заметка}`
).join('\n')}

Отчет создан: ${new Date().toLocaleDateString('ru-RU')}
MoodFlow - Ваш личный дневник настроения`;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `MoodFlow-отчет-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    link.click();
  };

  const getDateRange = () => {
    const dates = Object.keys(moodHistory).sort();
    if (dates.length === 0) return 'Нет данных';
    const firstDate = format(parseISO(dates[0]), 'dd.MM.yyyy');
    const lastDate = format(parseISO(dates[dates.length - 1]), 'dd.MM.yyyy');
    return `${firstDate} - ${lastDate}`;
  };

  const getFirstEntryDate = () => {
    const dates = Object.keys(moodHistory).sort();
    return dates.length > 0 ? format(parseISO(dates[0]), 'dd.MM.yyyy') : 'Нет записей';
  };

  const getAvailableDates = () => {
    const dates = [];
    for (let i = 0; i <= 365; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(format(date, 'yyyy-MM-dd'));
    }
    return dates.sort().reverse();
  };

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="app-logo">
            <div className="logo-emoji">😊</div>
            <h1>MoodFlow</h1>
            <p>Отслеживай своё настроение</p>
          </div>
          
          <form onSubmit={handleAuth} className="auth-form">
            <div className="input-group">
              <label>Email</label>
              <input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="your@email.com"
                required 
              />
            </div>
            
            <div className="input-group">
              <label>Пароль</label>
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder="Минимум 6 символов"
                required 
              />
            </div>
            
            <button type="submit" className="auth-button">
              {isLogin ? 'Войти в аккаунт' : 'Создать аккаунт'}
            </button>
          </form>
          
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            className="switch-auth"
          >
            {isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
          </button>
        </div>
      </div>
    );
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const selectedMoodData = moodHistory[selectedDate];

  const pieData = {
    labels: moods.map(m => m.emoji),
    datasets: [{
      data: moods.map(m => Object.values(moodHistory).filter(x => x.mood === m.value).length),
      backgroundColor: moods.map(m => m.color),
      borderWidth: 0,
    }]
  };

  const lineData = {
    labels: Object.keys(moodHistory).sort().slice(-30),
    datasets: [{
      label: 'Настроение',
      data: Object.keys(moodHistory).sort().slice(-30).map(d => moodHistory[d].mood),
      borderColor: '#ffb38a',
      backgroundColor: 'rgba(255, 179, 138, 0.1)',
      tension: 0.4,
    }]
  };

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      {showConfetti && <Confetti />}
      
      <header className="header">
        <div className="header-content">
          <div className="brand">
            <span className="logo">😊</span>
            <h1>MoodFlow</h1>
          </div>
          
          <div className="header-actions">
            <button 
              onClick={() => setDarkMode(!darkMode)} 
              className="icon-button"
              title="Сменить тему"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            
            <button 
              onClick={exportToPDF} 
              className="icon-button"
              title="Экспорт отчета"
            >
              📄
            </button>
            
            <div className="user-menu">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="user-button"
              >
                👤 {user.email.split('@')[0]}
              </button>
              
              {isMenuOpen && (
                <div className="dropdown-menu">
                  <button onClick={() => signOut(auth)} className="menu-item">
                    🚪 Выйти
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav className="navigation">
        <button 
          className={`nav-button ${activeTab === 'today' ? 'active' : ''}`}
          onClick={() => setActiveTab('today')}
        >
          📝 {editingMood ? 'Редактировать' : 'Добавить'}
        </button>
        <button 
          className={`nav-button ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          📅 Календарь
        </button>
        <button 
          className={`nav-button ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          📊 Статистика
        </button>
      </nav>

      <main className="main-content">
        {activeTab === 'today' && (
          <div className="today-container">
            <div className="mood-selection">
              <h2>
                {editingMood 
                  ? `Редактируешь настроение за ${format(parseISO(selectedDate), 'dd.MM.yyyy')}` 
                  : 'Как ты себя чувствуешь?'}
              </h2>
              
              <div className="date-selection">
                <label>Выбери дату:</label>
                <div className="date-picker">
                  <button 
                    className="date-display"
                    onClick={() => setIsDatePickerOpen(!isDatePickerOpen)}
                  >
                    📅 {format(parseISO(selectedDate), 'dd.MM.yyyy')}
                    {isToday(parseISO(selectedDate)) && ' (сегодня)'}
                    {isFuture(parseISO(selectedDate)) && ' (будущее)'}
                  </button>
                  
                  {isDatePickerOpen && (
                    <div className="date-dropdown">
                      <div className="date-dropdown-header">
                        Доступные даты (прошедшие и сегодня)
                      </div>
                      {getAvailableDates().map(date => {
                        const isFutureDate = isFuture(parseISO(date));
                        return (
                          <button
                            key={date}
                            className={`date-option ${date === selectedDate ? 'selected' : ''} ${moodHistory[date] ? 'has-mood' : ''} ${isFutureDate ? 'future-date' : ''}`}
                            onClick={() => {
                              if (isFutureDate) {
                                alert('Нельзя добавлять настроение за будущие даты!');
                                return;
                              }
                              setSelectedDate(date);
                              setIsDatePickerOpen(false);
                              if (moodHistory[date]) {
                                editMood(date);
                              } else {
                                setSelectedMood(null);
                                setNote('');
                                setEditingMood(null);
                              }
                            }}
                            disabled={isFutureDate}
                          >
                            {format(parseISO(date), 'dd.MM.yyyy')}
                            {isToday(parseISO(date)) && <span className="today-badge">сегодня</span>}
                            {moodHistory[date] && (
                              <span className="mood-indicator">
                                {moods.find(m => m.value === moodHistory[date].mood)?.emoji}
                              </span>
                            )}
                            {isFutureDate && <span className="future-badge">будущее</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="date-help">
                  💡 Можно выбирать только прошедшие даты и сегодняшний день
                </div>
              </div>

              {!isFuture(parseISO(selectedDate)) && (
                <>
                  <p>Выбери смайлик, который лучше всего описывает твоё настроение</p>
                  
                  <div className="moods-grid">
                    {moods.map(mood => (
                      <button
                        key={mood.value}
                        className={`mood-option ${selectedMood === mood.value ? 'selected' : ''}`}
                        onClick={() => setSelectedMood(mood.value)}
                      >
                        <span className="mood-emoji">{mood.emoji}</span>
                        <span className="mood-description">{mood.description}</span>
                      </button>
                    ))}
                  </div>

                  {selectedMood && (
                    <div className="note-section">
                      <label>Хочешь добавить заметку? (необязательно)</label>
                      <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="Напиши, почему у тебя такое настроение..."
                        rows="3"
                      />
                      <div className="action-buttons">
                        <button onClick={saveMood} className="save-button">
                          {editingMood ? '💾 Обновить' : '💾 Сохранить'}
                        </button>
                        {editingMood && (
                          <button 
                            onClick={() => deleteMood(selectedDate)} 
                            className="delete-button"
                          >
                            🗑️ Удалить
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="calendar-container">
            <h2>Календарь настроения</h2>
            
            <div className="calendar-actions">
              <button 
                onClick={() => {
                  setSelectedDate(todayStr);
                  setSelectedMood(null);
                  setNote('');
                  setEditingMood(null);
                  setActiveTab('today');
                }}
                className="add-mood-button"
              >
                ➕ Добавить настроение
              </button>
            </div>

            <div className="calendar">
              <div className="calendar-header">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                  <div key={day} className="calendar-day-header">{day}</div>
                ))}
              </div>
              <div className="calendar-grid">
                {Array.from({ length: 35 }, (_, i) => {
                  const date = new Date();
                  date.setDate(date.getDate() - 30 + i);
                  const dateStr = format(date, 'yyyy-MM-dd');
                  const mood = moodHistory[dateStr];
                  const isToday = dateStr === todayStr;
                  const isFutureDate = isFuture(date);
                  
                  return (
                    <div 
                      key={i}
                      className={`calendar-day ${isToday ? 'today' : ''} ${mood ? 'has-mood' : ''} ${isFutureDate ? 'future-day' : ''}`}
                      style={{ 
                        backgroundColor: mood ? moods.find(m => m.value === mood.mood)?.color : 
                                  isFutureDate ? 'var(--border-light)' : 'transparent' 
                      }}
                      onClick={() => {
                        if (isFutureDate) {
                          alert('Нельзя добавлять настроение за будущие даты!');
                          return;
                        }
                        if (mood) {
                          editMood(dateStr);
                        } else {
                          setSelectedDate(dateStr);
                          setSelectedMood(null);
                          setNote('');
                          setEditingMood(null);
                          setActiveTab('today');
                        }
                      }}
                      title={isFutureDate ? 
                        'Нельзя добавлять настроение за будущие даты' :
                        mood ? 
                          `${dateStr}: ${moods.find(m => m.value === mood.mood)?.description}\n${mood.note || 'Без заметки'}\n\nНажми для редактирования` : 
                          `${dateStr}\n\nНажми чтобы добавить настроение`
                      }
                    >
                      <span className="day-number">{format(date, 'd')}</span>
                      {mood && <span className="day-mood">{moods.find(m => m.value === mood.mood)?.emoji}</span>}
                      {!mood && !isFutureDate && <span className="add-icon">+</span>}
                      {isFutureDate && <span className="future-icon">🔒</span>}
                    </div>
                  );
                })}
              </div>
            </div>
            
            <div className="mood-legend">
              <p>Легенда настроений:</p>
              <div className="legend-items">
                {moods.map(mood => (
                  <div key={mood.value} className="legend-item">
                    <span className="legend-emoji">{mood.emoji}</span>
                    <span className="legend-text">{mood.description}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mood-history">
              <h3>Последние записи</h3>
              <div className="history-list">
                {Object.entries(moodHistory)
                  .sort()
                  .reverse()
                  .slice(0, 10)
                  .map(([date, moodData]) => (
                    <div key={date} className="history-item">
                      <div className="history-date">
                        {format(parseISO(date), 'dd.MM.yyyy')}
                        {isToday(parseISO(date)) && <span className="today-badge">сегодня</span>}
                      </div>
                      <div className="history-mood">
                        <span className="mood-emoji-small">
                          {moods.find(m => m.value === moodData.mood)?.emoji}
                        </span>
                        <span className="mood-description-small">
                          {moods.find(m => m.value === moodData.mood)?.description}
                        </span>
                      </div>
                      {moodData.note && (
                        <div className="history-note">"{moodData.note}"</div>
                      )}
                      <div className="history-actions">
                        <button 
                          onClick={() => editMood(date)}
                          className="edit-button"
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                        <button 
                          onClick={() => deleteMood(date)}
                          className="delete-button-small"
                          title="Удалить"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="stats-container">
            <h2>Статистика настроения</h2>
            
            {Object.keys(moodHistory).length === 0 ? (
              <div className="no-data">
                <p>Пока нет данных для статистики</p>
                <p>Начни отслеживать настроение на вкладке "Добавить"!</p>
              </div>
            ) : (
              <div className="stats-grid">
                <div className="stat-card">
                  <h3>Распределение настроений</h3>
                  <div className="chart-container">
                    <Pie data={pieData} />
                  </div>
                </div>
                
                <div className="stat-card">
                  <h3>Динамика за 30 дней</h3>
                  <div className="chart-container">
                    <Line data={lineData} />
                  </div>
                </div>
                
                <div className="quick-stats">
                  <div className="stat-item">
                    <span className="stat-value">{Object.keys(moodHistory).length}</span>
                    <span className="stat-label">Всего записей</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">
                      {moods.find(m => m.value === moodHistory[todayStr]?.mood)?.emoji || '—'}
                    </span>
                    <span className="stat-label">Сегодня</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">
                      {Math.round(Object.values(moodHistory).reduce((acc, m) => acc + m.mood, 0) / Object.keys(moodHistory).length * 10) / 10}
                    </span>
                    <span className="stat-label">Среднее</span>
                  </div>
                </div>

                <div className="export-section">
                  <button onClick={exportToPDF} className="export-pdf-button">
                    📄 Скачать отчет
                  </button>
                  <p className="export-description">
                    Скачай текстовый файл с полной статистикой и историей настроений
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;