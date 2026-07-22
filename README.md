# Tarefas de Casa — PWA

App instalável (PWA) para gerenciar tarefas de casa e contas a pagar, com notificações push. Dois tipos de tarefa (`casa` e `conta`), sem histórico — tarefa concluída é apagada.

## 1. Criar o banco no Supabase

1. Crie um projeto gratuito em https://supabase.com
2. Vá em **SQL Editor** e rode:

```sql
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  due_date date not null,
  created_at timestamptz not null default now(),
  type text not null check (type in ('casa','conta')),
  assigned_to text not null
);

create table push_subscriptions (
  user_name text primary key,
  subscription jsonb not null
);
```

3. Em **Settings > API**, copie a **Project URL** (`SUPABASE_URL`) e a **service_role key** (`SUPABASE_SERVICE_KEY`) — não a `anon key`, pois o backend precisa de permissão total.

## 2. Gerar as chaves VAPID (para push notifications)

No seu computador, com Node instalado:

```bash
npx web-push generate-vapid-keys
```

Isso gera um par `Public Key` / `Private Key`. Guarde os dois.

## 3. Configurar variáveis de ambiente

Copie `.env.example` para `.env` e preencha com os valores dos passos 1 e 2. Ajuste `USER_NAMES` com os nomes de vocês dois, ex: `USER_NAMES=João,Maria`.

## 4. Rodar localmente (opcional, para testar)

```bash
npm install
npm start
```

Acesse `http://localhost:3000`. Push notification não funciona em `localhost` sem HTTPS em todos os navegadores — o teste completo vale mesmo depois do deploy.

## 5. Deploy no Render

1. Suba esta pasta para um repositório no GitHub.
2. No [Render](https://render.com), crie um **Web Service** novo apontando para o repositório.
3. Build command: `npm install` — Start command: `npm start`.
4. Em **Environment**, adicione as mesmas variáveis do `.env`.
5. Deploy. O Render já fornece HTTPS automaticamente (obrigatório para PWA e push).

## 6. Configurar os lembretes automáticos

O endpoint `GET /api/check-reminders` verifica tarefas vencendo hoje ou atrasadas e envia push para o responsável. Ele precisa ser chamado periodicamente por um serviço externo, pois o Render free tier não roda tarefas agendadas sozinho:

1. Crie uma conta gratuita em https://cron-job.org
2. Crie um novo cron job apontando para `https://SEU-APP.onrender.com/api/check-reminders`
3. Configure para rodar a cada 1 hora.

> Nota: o Render free tier "dorme" após alguns minutos sem acesso. A primeira chamada do cron pode demorar ~30s para acordar o serviço — isso é normal e não afeta o funcionamento.

## 7. Instalar o app no celular

1. Acesse a URL do Render pelo navegador do celular (Chrome no Android, Safari no iOS 16.4+).
2. Toque no menu do navegador → **"Adicionar à tela de início"**.
3. Abra o app pela tela inicial, escolha seu nome no topo e aceite a permissão de notificações quando solicitado.
4. Repita esse passo no celular da sua esposa, escolhendo o nome dela.

## Como funciona no dia a dia

- Escolher **Casa** ou **Contas** no topo alterna a lista visível.
- **"Criar tarefa"** exige título, prazo e responsável; descrição é opcional.
- Ao criar, a pessoa responsável recebe uma notificação push na hora.
- Tarefas vencendo hoje ou atrasadas (borda vermelha) geram lembrete automático a cada verificação do cron.
- Tocar em **"✅ Concluir"** apaga a tarefa permanentemente — não há histórico.

## Atualização: pontuação e prazo com hora

Se você já tinha o banco criado antes, rode esta migração no **SQL Editor** do Supabase (não apaga tarefas existentes):

```sql
-- prazo passa a ter data e hora
alter table tasks alter column due_date type timestamptz using due_date::timestamptz;

-- pontos de cada tarefa
alter table tasks add column points integer not null default 0;

-- placar acumulado por pessoa
create table user_points (
  user_name text primary key,
  points integer not null default 0
);
```

Depois disso, publique o código atualizado (`git add . && git commit -m "pontos e prazo com hora" && git push`). Se o seu Web Service no Render estiver conectado ao repositório do GitHub, o deploy acontece automaticamente a cada push — acompanhe em **Render > seu serviço > Logs**. Se não estiver conectado (deploy manual), use o botão **"Manual Deploy" > "Deploy latest commit"** no painel do Render.

Não é preciso mudar nenhuma variável de ambiente nem reconfigurar o cron-job.org — o endpoint `/api/check-reminders` continua o mesmo.

No celular, como o PWA já está instalado, basta fechar e abrir o app de novo (ou dar um pull-to-refresh) para carregar a versão nova — não precisa reinstalar.

## Personalizar o ícone

Os arquivos `public/icon-192.png` e `public/icon-512.png` são placeholders simples. Troque por um ícone próprio (mesmo tamanho e nome de arquivo) quando quiser.
