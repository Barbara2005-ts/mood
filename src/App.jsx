import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, onValue, set } from 'firebase/database';
import Confetti from 'react-confetti';
import { format } from 'date-fns';
import { Pie, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, LineElement, PointElement, LinearScale, Title, Tooltip, Legend, CategoryScale } from 'chart.js';
ChartJS.register(ArcElement, LineElement, PointElement, LinearScale, Title, Tooltip, Legend, CategoryScale);

const moods = [
  { emoji: 'Crying Face', label: 'Очень плохо', value: 1, color: '#ef4444' },
  { emoji: 'Sad Face', label: 'Плохо', value: 2, color: '#f97316' },
  { emoji: 'Neutral Face', label: 'Нормально', value: 3, color: '#eab308' },
  { emoji: 'Smiling Face', label: 'Хорошо', value: 4, color: '#22c55e' },
  { emoji: 'Star-Struck', label: 'Отлично!', value: 5, color: '#3b82f6' }
];

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedMood, setSelectedMood] = useState(null);
  const [note, setNote] = useState('');
  const [moodHistory, setMoodHistory] = useState({});
  const [showConfetti, setShowConfetti] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

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
    if (!selectedMood) return alert('Выбери настроение!');
    const today = format(new Date(), 'yyyy-MM-dd');
    const userRef = ref(db, 'moods/' + user.uid + '/' + today);
    set(userRef, { mood: selectedMood, note, timestamp: Date.now() });
    setNote('');
    setSelectedMood(null);
  };

  const exportToPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = darkMode ? '#1f2937' : '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 48px system-ui';
    ctx.fillStyle = '#8b5cf6';
    ctx.textAlign = 'center';
    ctx.fillText('MoodFlow — Мой дневник настроения', canvas.width / 2, 80);

    let y = 160;
    ctx.font = '28px system-ui';
    ctx.fillStyle = darkMode ? '#e9d5ff' : '#4c1d95';
    Object.entries(moodHistory).sort().reverse().slice(0, 20).forEach(([date, m]) => {
      const mood = moods.find(x => x.value === m.mood);
      ctx.fillText(`${date}  ${mood.emoji}  ${mood.label} ${m.note ? '— ' + m.note : ''}`, canvas.width / 2, y);
      y += 45;
    });

    const link = document.createElement('a');
    link.download = 'MoodFlow-дневник.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md">
          <h1 className="text-6xl font-bold text-center mb-10 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            MoodFlow
          </h1>
          <form onSubmit={handleAuth} className="space-y-6">
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 border-2 rounded-xl text-lg" required />
            <input type="password" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 border-2 rounded-xl text-lg" required />
            <button type="submit" className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-5 rounded-xl font-bold text-2xl hover:scale-105 transition">
              {isLogin ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>
          <button onClick={() => setIsLogin(!isLogin)} className="text-center w-full mt-6 text-purple-600 font-semibold">
            {isLogin ? 'Создать аккаунт' : 'У меня уже есть аккаунт'}
          </button>
        </div>
      </div>
    );
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayMood = moodHistory[todayStr];

  const pieData = {
    labels: moods.map(m => m.label),
    datasets: [{
      data: moods.map(m => Object.values(moodHistory).filter(x => x.mood === m.value).length),
      backgroundColor: moods.map(m => m.color)
    }]
  };

  const lineData = {
    labels: Object.keys(moodHistory).sort().slice(-30),
    datasets: [{
      label: 'Настроение',
      data: Object.keys(moodHistory).sort().slice(-30).map(d => moodHistory[d].mood),
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139, 92, 246, 0.1)',
      tension: 0.4,
      pointRadius: 6
    }]
  };

  return (
    <div className={`min-h-screen transition-all ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50'}`}>
      {showConfetti && <Confetti />}
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">MoodFlow</h1>
          <div className="flex gap-4">
            <button onClick={() => setDarkMode(!darkMode)} className="px-6 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700">
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button onClick={exportToPng} className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700">
              Export to PNG
            </button>
            <button onClick={() => signOut(auth)} className="px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700">
              Выйти
            </button>
          </div>
        </div>

        {!todayMood && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-16 text-center max-w-4xl mx-auto">
            <h2 className="text-5xl mb-12">Как дела сегодня, {user.email.split('@')[0]}?</h2>
            <div className="flex justify-center gap-12 mb-12">
              {moods.map(m => (
                <button key={m.value} onClick={() => setSelectedMood(m.value)}
                  className={`text-9xl hover:scale-125 transition-transform ${selectedMood === m.value ? 'scale-125' : ''}`}>
                  {m.emoji}
                </button>
              ))}
            </div>
            {selectedMood && (
              <>
                <textarea placeholder="Почему сегодня так? (необязательно)" value={note} onChange={e => setNote(e.target.value)}
                  className="w-full p-6 border-2 dark:bg-gray-700 rounded-2xl mb-8 text-lg" rows="4" />
                <button onClick={saveMood} className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-20 py-8 rounded-full text-4xl font-bold hover:scale-110 transition">
                  Сохранить настроение
                </button>
              </>
            )}
          </div>
        )}

        {todayMood && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
              {/* Календарь */}
              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8">
                <h2 className="text-4xl font-bold mb-6 text-center">Календарь настроения</h2>
                <div className="grid grid-cols-7 gap-2 text-center">
                  {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => <div key={d} className="text-sm font-bold text-gray-600 dark:text-gray-400">{d}</div>)}
                  {Array.from({ length: 35 }, (_, i) => {
                    const date = new Date();
                    date.setDate(date.getDate() - 30 + i);
                    const dateStr = format(date, 'yyyy-MM-dd');
                    const mood = moodHistory[dateStr];
                    const color = mood ? moods.find(m => m.value === mood.mood)?.color || '#e5e7eb' : '#f3f4f6';
                    return (
                      <div key={i} className="aspect-square rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: color }}>
                        {format(date, 'd')}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8">
                <h2 className="text-4xl font-bold mb-6">Статистика за 30 дней</h2>
                <Pie data={pieData} />
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8">
                <h2 className="text-4xl font-bold mb-6">Сегодня ты {moods.find(m => m.value === todayMood.mood)?.emoji}</h2>
                <p className="text-2xl">{todayMood.note || 'Без заметки'}</p>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl p-8">
              <h2 className="text-4xl font-bold mb-6">Динамика настроения</h2>
              <Line data={lineData} options={{ responsive: true }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;