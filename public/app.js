function populateTimeOptions() {
  const select = document.getElementById('due_time');
  select.innerHTML = '';
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
  assigned.innerHTML = '';
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

async function renderMainContent() {
  if (currentType === 'casa') {
    document.getElementById('task-form').style.display = 'flex';
    document.getElementById('request-form').style.display = 'none';
    await loadTasks();
  } else if (currentType === 'pedidos') {
    document.getElementById('task-form').style.display = 'none';
    document.getElementById('request-form').style.display = 'flex';
    await loadRequests();
  }
}

async function loadTasks() {
  const res = await fetch('/api/tasks');
  const tasks = await res.json();
  const list = document.getElementById('list');
  const currentUser = localStorage.getItem('who');
  list.innerHTML = '';

  const now = new Date();

  if (!tasks || tasks.length === 0) {
    list.innerHTML = '<div class="empty">Nenhuma tarefa de casa pendente 🎉</div>';
    return;
  }

  tasks.forEach(t => {
    const dueDate = new Date(t.due_date);
    const checkDate = t.first_confirmed_at ? new Date(t.first_confirmed_at) : now;
    const overdue = dueDate < checkDate;

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

// Carregar e listar os Pedidos
async function loadRequests() {
  const res = await fetch('/api/requests');
  const requests = await res.json();
  const list = document.getElementById('list');
  const currentUser = localStorage.getItem('who');
  list.innerHTML = '';

  if (!requests || requests.length === 0) {
    list.innerHTML = '<div class="empty">Nenhum pedido cadastrado 🛒</div>';
    return;
  }

  requests.forEach(r => {
    const valorFormatado = Number(r.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const isOwner = r.created_by === currentUser;
    const isApproved = r.status === 'aprovado';

    const div = document.createElement('div');
    div.className = 'card';

    // Ações dos botões
    let actionButtonsHTML = '';
    if (isApproved) {
      actionButtonsHTML = `<span style="color:#2f855a; font-weight:bold; align-self:center;">✅ Aprovado por ${escapeHtml(r.approved_by || '')}</span>`;
    } else if (isOwner) {
      actionButtonsHTML = `<span style="color:#718096; font-size:0.85rem; align-self:center;">⏳ Aguardando aprovação</span>`;
    } else {
      actionButtonsHTML = `<button class="btn-approve-req" style="background:#319795; color:#fff; padding:8px 12px; border:none; border-radius:6px; cursor:pointer;">👍 Aprovar</button>`;
    }

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
        <h3>${escapeHtml(r.title)}</h3>
        <div style="display:flex; gap:4px; flex-shrink:0;">
          <span class="badge badge-status-${r.status}">${r.status}</span>
          <span class="badge badge-${r.payment_type}">${r.payment_type}</span>
        </div>
      </div>
      ${r.description ? `<p>${escapeHtml(r.description)}</p>` : ''}
      <div class="meta" style="font-size:0.9rem; color:#333; margin-top:6px;">
        <b>Valor:</b> ${valorFormatado} | <b>Prazo:</b> ${escapeHtml(r.deadline)}
      </div>
      <div class="meta">Solicitado por: ${escapeHtml(r.created_by)}</div>
      
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; pt-8px; border-top:1px solid #eee;">
        <div>${actionButtonsHTML}</div>
        <button class="btn-delete-req" style="background:#e53e3e; color:#fff; padding:8px 12px; border:none; border-radius:6px; cursor:pointer;">🗑️ Excluir</button>
      </div>
    `;

    if (!isApproved && !isOwner) {
      div.querySelector('.btn-approve-req').addEventListener('click', () => approveRequest(r.id));
    }
    div.querySelector('.btn-delete-req').addEventListener('click', () => deleteRequest(r.id));

    list.appendChild(div);
  });
}

// Função de Aprovação do Pedido
async function approveRequest(id) {
  const user_name = localStorage.getItem('who');
  if (!user_name) {
    alert('Por favor, selecione quem está acessando!');
    return;
  }

  const res = await fetch(`/api/requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_name })
  });

  if (!res.ok) {
    const err = await res.json();
    alert(err.error || 'Erro ao aprovar pedido');
    return;
  }

  loadRequests();
}

// Confirmar tarefa de casa
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

// Excluir tarefa de casa
async function deleteTask(id) {
  if (!confirm('Deseja realmente apagar esta tarefa?')) return;
  await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  loadTasks();
}

// Excluir pedido
async function deleteRequest(id) {
  if (!confirm('Deseja realmente apagar este pedido?')) return;
  await fetch(`/api/requests/${id}`, { method: 'DELETE' });
  loadRequests();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Alternância de Abas
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentType = btn.dataset.type;
    renderMainContent();
  });
});

// Submit: Tarefas de Casa
document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const dateVal = document.getElementById('due_date').value;
  const timeVal = document.getElementById('due_time').value;
  const body = {
    title: document.getElementById('title').value,
    description: document.getElementById('description').value,
    due_date: new Date(`${dateVal}T${timeVal}`).toISOString(),
    type: 'casa',
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

// Submit: Pedido Financeiro
document.getElementById('request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user_name = localStorage.getItem('who');
  if (!user_name) {
    alert('Por favor, selecione seu usuário no topo da página antes de criar um pedido!');
    return;
  }

  const body = {
    title: document.getElementById('req_title').value,
    description: document.getElementById('req_description').value,
    amount: document.getElementById('req_amount').value,
    deadline: document.getElementById('req_deadline').value,
    payment_type: document.getElementById('req_payment_type').value,
    created_by: user_name
  };

  await fetch('/api/requests', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  e.target.reset();
  loadRequests();
});

// Push Notifications
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
  renderMainContent();
  loadPoints();
  registerPush();
});