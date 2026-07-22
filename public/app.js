function populateTimeOptions() {
  const select = document.getElementById('due_time');
  for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      select.innerHTML += `<option value="${hh}:${mm}">${hh}:${mm}</option>`;
    }
  }
}

let currentType = 'casa';
let users = [];

async function loadConfig() {
  const res = await fetch('/api/config');
  const data = await res.json();
  users = data.users;

  const who = document.getElementById('who');
  const assigned = document.getElementById('assigned_to');
  users.forEach(u => {
    who.innerHTML += `<option value="${u}">${u}</option>`;
    assigned.innerHTML += `<option value="${u}">${u}</option>`;
  });

  const saved = localStorage.getItem('who');
  if (saved) who.value = saved;

  who.addEventListener('change', () => {
    localStorage.setItem('who', who.value);
    registerPush();
  });
}

async function loadPoints() {
  const res = await fetch('/api/points');
  const scores = await res.json();
  const board = document.getElementById('leaderboard');
  board.innerHTML = users.map(u => {
    const entry = scores.find(s => s.user_name === u);
    const pts = entry ? entry.points : 0;
    return `<div class="score"><div class="name">${escapeHtml(u)}</div><div class="pts">${pts} pts</div></div>`;
  }).join('');
}

async function loadTasks() {
  const res = await fetch('/api/tasks');
  const tasks = await res.json();
  const list = document.getElementById('list');
  list.innerHTML = '';

  const now = new Date();
  const filtered = tasks.filter(t => t.type === currentType);

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">Nenhuma tarefa por aqui 🎉</div>';
    return;
  }

  filtered.forEach(t => {
    const dueDate = new Date(t.due_date);
    const overdue = dueDate < now;
    const prazoFormatado = dueDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'card' + (overdue ? ' overdue' : '');
    div.innerHTML = `
      <h3>${escapeHtml(t.title)}</h3>
      ${t.description ? `<p>${escapeHtml(t.description)}</p>` : ''}
      <div class="meta">Prazo: ${prazoFormatado} • Responsável: ${escapeHtml(t.assigned_to)} • ${t.points} pts</div>
      <button>✅ Concluir</button>
    `;
    div.querySelector('button').addEventListener('click', () => completeTask(t.id));
    list.appendChild(div);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function completeTask(id) {
  const completed_by = document.getElementById('who').value;
  await fetch(`/api/tasks/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed_by })
  });
  loadTasks();
  loadPoints();
}

document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentType = btn.dataset.type;
    loadTasks();
  });
});

document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dateVal = document.getElementById('due_date').value; // ex: 2026-07-22
  const timeVal = document.getElementById('due_time').value; // ex: 14:30
  const body = {
    title: document.getElementById('title').value,
    description: document.getElementById('description').value,
    due_date: new Date(`${dateVal}T${timeVal}`).toISOString(),
    type: currentType,
    assigned_to: document.getElementById('assigned_to').value,
    points: Number(document.getElementById('points').value)
  };
  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  e.target.reset();
  loadTasks();
});

// --- Notificações push ---
async function registerPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const who = document.getElementById('who').value;
  if (!who) return;

  const reg = await navigator.serviceWorker.register('/sw.js');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  const configRes = await fetch('/api/vapid-public-key');
  const { publicKey } = await configRes.json();
  if (!publicKey) return;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_name: who, subscription: sub })
  });
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

loadConfig().then(() => {
  populateTimeOptions();
  loadTasks();
  loadPoints();
  registerPush();
});