const user = JSON.parse(localStorage.getItem('dotto_user') || 'null');
if (!user) window.location.href = '/';

const todayDate = document.getElementById('todayDate');
const username = document.getElementById('username');
const avatar = document.getElementById('avatar-char');
const profileForm = document.getElementById('profile-form');
const displayName = document.getElementById('displayName');
const statusMessage = document.getElementById('statusMessage');
const message = document.getElementById('mypage-message');
const doneCount = document.getElementById('doneCount');
const todoCount = document.getElementById('todoCount');
const doneRate = document.getElementById('doneRate');
const habitList = document.getElementById('habit-list');

username.textContent = user.id;
avatar.textContent = user.id.slice(0, 1).toUpperCase();
todayDate.textContent = new Date().toLocaleDateString('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
});

const habits = ['물 2L 마시기', '운동 20분', '독서 10페이지'];

function renderHabits() {
  habitList.innerHTML = '';
  habits.forEach((habit) => {
    const li = document.createElement('li');
    li.innerHTML = `<input type="checkbox" /> <span>${habit}</span>`;
    habitList.appendChild(li);
  });
}

document.getElementById('add-habit').addEventListener('click', () => {
  const input = prompt('새 체크리스트 항목을 입력하세요');
  if (!input) return;
  habits.push(input.trim());
  renderHabits();
});

profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: user.id,
      displayName: displayName.value.trim(),
      statusMessage: statusMessage.value.trim()
    })
  });

  if (res.ok) message.textContent = '프로필이 저장되었습니다.';
});

document.getElementById('logout').addEventListener('click', () => {
  localStorage.removeItem('dotto_user');
  window.location.href = '/';
});

async function loadSummary() {
  const tasksRes = await fetch(`/api/tasks?userId=${encodeURIComponent(user.id)}`);
  const tasks = await tasksRes.json();
  const done = tasks.filter((task) => task.done).length;
  const todo = tasks.length - done;
  const rate = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  doneCount.textContent = done;
  todoCount.textContent = todo;
  doneRate.textContent = `${rate}%`;

  const profileRes = await fetch(`/api/profile?userId=${encodeURIComponent(user.id)}`);
  const profile = await profileRes.json();
  if (profile) {
    displayName.value = profile.display_name || '';
    statusMessage.value = profile.status_message || '';
  }
}

renderHabits();
loadSummary();
