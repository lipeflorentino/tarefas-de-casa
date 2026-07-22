require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

webpush.setVapidDetails(
  'mailto:' + (process.env.CONTACT_EMAIL || 'admin@example.com'),
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// nomes dos usuários e chave pública do push, usados pelo frontend
app.get('/api/config', (req, res) => {
  res.json({ users: (process.env.USER_NAMES || 'Eu,Esposa').split(',') });
});

app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// placar de pontos acumulados
app.get('/api/points', async (req, res) => {
  const { data, error } = await supabase.from('user_points').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// listar tarefas
app.get('/api/tasks', async (req, res) => {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// criar tarefa
app.post('/api/tasks', async (req, res) => {
  const { title, description, due_date, type, assigned_to, points } = req.body;
  if (!title || !due_date || !type || !assigned_to || points === undefined || points === null || points === '') {
    return res.status(400).json({ error: 'title, due_date, type, assigned_to e points são obrigatórios' });
  }
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ title, description: description || null, due_date, type, assigned_to, points: Number(points) }])
    .select();
  if (error) return res.status(500).json({ error: error.message });

  const prazo = new Date(due_date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  await notifyUser(assigned_to, 'Nova tarefa', `${title} — prazo ${prazo} (${points} pts)`);

  res.status(201).json(data[0]);
});

// concluir (= apagar, sem histórico) tarefa — quem completa ganha os pontos
app.delete('/api/tasks/:id', async (req, res) => {
  const { completed_by } = req.body || {};

  const { data: task, error: fetchError } = await supabase
    .from('tasks')
    .select('points')
    .eq('id', req.params.id)
    .single();
  if (fetchError) return res.status(500).json({ error: fetchError.message });

  const { error: delError } = await supabase.from('tasks').delete().eq('id', req.params.id);
  if (delError) return res.status(500).json({ error: delError.message });

  if (completed_by && task && task.points) {
    await addPoints(completed_by, task.points);
  }

  res.status(204).end();
});

async function addPoints(userName, points) {
  const { data } = await supabase
    .from('user_points')
    .select('points')
    .eq('user_name', userName)
    .single();

  const current = data ? data.points : 0;
  const { error } = await supabase
    .from('user_points')
    .upsert([{ user_name: userName, points: current + points }], { onConflict: 'user_name' });
  if (error) console.error('Erro ao atualizar pontos de', userName, error.message);
}

// salvar inscrição de push de um usuário
app.post('/api/subscribe', async (req, res) => {
  const { user_name, subscription } = req.body;
  if (!user_name || !subscription) {
    return res.status(400).json({ error: 'user_name e subscription são obrigatórios' });
  }
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert([{ user_name, subscription }], { onConflict: 'user_name' });
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ok: true });
});

// verificação de prazos — chamar via cron externo (ex: cron-job.org) a cada hora
app.get('/api/check-reminders', async (req, res) => {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*')
    .lte('due_date', endOfToday.toISOString());
  if (error) return res.status(500).json({ error: error.message });

  for (const task of tasks) {
    const dueDate = new Date(task.due_date);
    const overdue = dueDate < now;
    const label = overdue ? 'ATRASADA' : 'VENCE HOJE';
    const horario = dueDate.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const corpo = `${task.description || ''} (${horario}, ${task.points} pts)`.trim();
    await notifyUser(task.assigned_to, `${label}: ${task.title}`, corpo);
  }

  res.json({ checked: tasks.length });
});

async function notifyUser(userName, title, body) {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('user_name', userName)
    .single();
  if (error || !data) return;

  try {
    await webpush.sendNotification(data.subscription, JSON.stringify({ title, body }));
  } catch (err) {
    console.error('Erro ao enviar push para', userName, err.message);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
