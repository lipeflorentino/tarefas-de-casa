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
  
  who.innerHTML = '<option value="">-- Selecione seu nome --</option>';
  users.forEach(u => {
    who.innerHTML += `<option value="${u}">${u}</option>`;
    assigned.innerHTML += `<option value="${u}">${u}</option>`;
  });

  const saved = localStorage.getItem('who');
  if (saved) {
    who.value = saved;
    document.getElementById('user-select').style.display = 'none';
    document.getElementById('current-user-label').textContent = `Usuário atual: ${saved}`;
  }

  who.addEventListener('change', () => {
    if (who.value) {
      localStorage.setItem('who', who.value);
      document.getElementById('user-select').style.display = 'none';
      document.getElementById('current-user-label').textContent = `Usuário atual: ${who.value}`;
      registerPush();
    }
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
  const currentUser = localStorage.getItem('who');
  list.innerHTML = '';

  const now = new Date();
  const filtered = tasks.filter(t => t.type === currentType);

  if (filtered.length === 0) {
    list.innerHTML = '<div class="empty">Nenhuma tarefa por aqui 🎉</div>';
    return;
  }

  filtered.forEach(t => {
    const dueDate = new Date(t.due_date);
    // Se já houve 1ª confirmação, congela a contagem do tempo na data informada
    const checkDate = t.first_confirmed_at ? new Date(t.first_confirmed_at) : now;
    const overdue = dueDate < checkDate;

    // Cálculo dinâmico de exibição dos pontos atuais (prevendo penalidade)
    let displayPoints = t.points;
    if (overdue) {
      const diffMin = Math.floor((checkDate - dueDate) / (1000 * 60));
      const penalty = Math.floor(diffMin / 10);
      displayPoints -= penalty;
    }

    const prazoFormatado = dueDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'card' + (overdue ? ' overdue' : '');

    let btnText = '✅ Concluir';
    let btnDisabled = false;

    if (t.first_confirmed_by) {
      if (t.first_confirmed_by === currentUser) {
        btnText = '⏳ Aguardando 2ª confirmação...';
        btnDisabled = true;
      } else {
        btnText = '✔️ Confirmar e Finalizar';
      }
    }

    div.innerHTML = `
      <h3>${escapeHtml(t.title)}</h3>
      ${t.description ? `<p>${escapeHtml(t.description)}</p>` : ''}
      <div class="meta">
        Prazo: ${prazoFormatado} • Responsável: ${escapeHtml(t.assigned_to)} • 
        <b>${displayPoints} pts</b> ${displayPoints < t.points ? '(Atrasada)' : ''}
      </div>
      <div style="display:flex; gap:8px; margin-top:10px;">
        <button class="btn-confirm" ${btnDisabled ? 'disabled' : ''}>${btnText}</button>
        <button class="btn-delete" style="background:#e53e3e;">🗑️ Excluir</button>
      </div>
    `;

    div.querySelector('.btn-confirm').addEventListener('click', () => confirmTask(t.id));
    div.querySelector('.btn-delete').addEventListener('click', () => deleteTask(t.id));
    
    list.appendChild(div);
  });
}

// Confirmar tarefa
async function confirmTask(id) {
  const user_name = localStorage.getItem('who');
  if (!user_name) {
    alert('Por favor, selecione quem está acessando!');
    return;
  }

  await fetch(`/api/tasks/${id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_name })
  });
  
  loadTasks();
  loadPoints();
}

// Excluir tarefa sem pontuar (Item 1)
async function deleteTask(id) {
  if (!confirm('Deseja realmente apagar esta tarefa?')) return;
  
  await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  loadTasks();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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