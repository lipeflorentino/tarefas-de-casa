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
  const { title, description, due_date, type, assigned_to } = req.body;
  if (!title || !due_date || !type || !assigned_to) {
    return res.status(400).json({ error: 'title, due_date, type e assigned_to são obrigatórios' });
  }
  const { data, error } = await supabase
    .from('tasks')
    .insert([{ title, description: description || null, due_date, type, assigned_to }])
    .select();
  if (error) return res.status(500).json({ error: error.message });

  await notifyUser(assigned_to, 'Nova tarefa', `${title} — prazo ${due_date}`);

  res.status(201).json(data[0]);
});

// concluir (= apagar, sem histórico) tarefa
app.delete('/api/tasks/:id', async (req, res) => {
  const { error } = await supabase.from('tasks').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).end();
});

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
  const today = new Date().toISOString().slice(0, 10);
  const { data: tasks, error } = await supabase.from('tasks').select('*').lte('due_date', today);
  if (error) return res.status(500).json({ error: error.message });

  for (const task of tasks) {
    const overdue = task.due_date < today;
    const label = overdue ? 'ATRASADA' : 'VENCE HOJE';
    await notifyUser(task.assigned_to, `${label}: ${task.title}`, task.description || '');
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
