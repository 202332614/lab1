const user = JSON.parse(localStorage.getItem('dotto_user') || 'null');
if (!user) window.location.href = '/';

const todayDate = document.getElementById('todayDate');
const username = document.getElementById('username');
const avatar = document.getElementById('avatar-char');
const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('taskInput');
const taskList = document.getElementById('task-list');
const logoutBtn = document.getElementById('logout');

const totalEl = document.getElementById('total');
const doneEl = document.getElementById('done');
const ongoingEl = document.getElementById('ongoing');
const ratioEl = document.getElementById('ratio');
const progressMeter = document.getElementById('progressMeter');
const badge = document.getElementById('badge');

username.textContent = user.id;
avatar.textContent = user.id.slice(0, 1).toUpperCase();
todayDate.textContent = new Date().toLocaleDateString('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('dotto_user');
  window.location.href = '/';
});

async function loadTasks() {
  const res = await fetch(`/api/tasks?userId=${encodeURIComponent(user.id)}`);
  const tasks = await res.json();
  renderTasks(tasks);
}

function renderTasks(tasks) {
  taskList.innerHTML = '';
  tasks.forEach((task) => {
    const li = document.createElement('li');
    if (task.done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!task.done;
    checkbox.className = 'task-check';
    checkbox.addEventListener('change', () => toggleTask(task.id, checkbox.checked));

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.content;

    const meta = document.createElement('div');
    meta.className = 'task-meta';

    const del = document.createElement('button');
    del.className = 'small-btn';
    del.textContent = '삭제';
    del.addEventListener('click', () => deleteTask(task.id));

    meta.appendChild(del);
    li.append(checkbox, text, meta);
    taskList.appendChild(li);
  });

  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const ongoing = total - done;
  const ratio = total ? Math.round((done / total) * 100) : 0;

  totalEl.textContent = total;
  doneEl.textContent = done;
  ongoingEl.textContent = ongoing;
  ratioEl.textContent = `${ratio}%`;
  badge.textContent = ongoing;

  const circumference = 2 * Math.PI * 45;
  progressMeter.style.strokeDasharray = `${circumference}`;
  progressMeter.style.strokeDashoffset = `${circumference - (circumference * ratio) / 100}`;
}

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = taskInput.value.trim();
  if (!content) return;

  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.id, content })
  });

  taskInput.value = '';
  loadTasks();
});

async function toggleTask(taskId, done) {
  await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: done ? 1 : 0 })
  });
  loadTasks();
}

async function deleteTask(taskId) {
  await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
  loadTasks();
}

loadTasks();
