-- ============================================
-- KR PREVIDÊNCIA CRM — Setup completo do banco
-- Execute isso no SQL Editor do Supabase
-- ============================================

-- Tabela de perfis de usuários (vendedores e admin)
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  nome text not null,
  email text not null,
  role text not null default 'vendedor', -- 'admin' ou 'vendedor'
  created_at timestamptz default now()
);

-- Tabela de advogados
create table advogados (
  id uuid default gen_random_uuid() primary key,
  nome_completo text not null,
  oab text not null,
  estado text not null,
  cidade text not null,
  telefone text not null,
  email text not null,
  estado_civil text,
  nacionalidade text default 'Brasileira',
  endereco text,
  vendedor_id uuid references profiles(id),
  total_compras integer default 0,
  ultima_compra date,
  status text default 'vermelho', -- verde, amarelo, vermelho
  titulo text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Tabela de compras
create table compras (
  id uuid default gen_random_uuid() primary key,
  advogado_id uuid references advogados(id) on delete cascade,
  produto text not null, -- 'Maternidade', 'BPC', 'Auxilio Acidente'
  vendedor_id uuid references profiles(id),
  data_compra date not null default current_date,
  created_at timestamptz default now()
);

-- Tabela de produtos por advogado
create table advogado_produtos (
  advogado_id uuid references advogados(id) on delete cascade,
  produto text not null,
  primary key (advogado_id, produto)
);

-- ============================================
-- FUNÇÕES AUTOMÁTICAS
-- ============================================

-- Função para calcular status e título automaticamente
create or replace function atualizar_status_advogado()
returns trigger as $$
declare
  dias_sem_compra integer;
  novo_status text;
  novo_titulo text;
  total integer;
begin
  -- Calcular dias desde última compra
  if new.ultima_compra is null then
    dias_sem_compra := 999;
  else
    dias_sem_compra := current_date - new.ultima_compra;
  end if;

  -- Definir status
  if dias_sem_compra <= 15 then
    novo_status := 'verde';
  elsif dias_sem_compra <= 30 then
    novo_status := 'amarelo';
  else
    novo_status := 'vermelho';
  end if;

  total := new.total_compras;

  -- Definir título
  if total = 0 then novo_titulo := '';
  elsif total = 1 then novo_titulo := 'Parceiro Bronze';
  elsif total = 2 then novo_titulo := 'Parceiro Prata';
  elsif total = 3 then novo_titulo := 'Cliente Gold';
  elsif total = 4 then novo_titulo := 'Cliente Gold II';
  elsif total = 5 then novo_titulo := 'Cliente Platinum';
  elsif total = 6 then novo_titulo := 'Cliente Platinum II';
  elsif total = 7 then novo_titulo := 'Cliente Diamond';
  elsif total = 8 then novo_titulo := 'Cliente Diamond II';
  else novo_titulo := 'Cliente Black';
  end if;

  new.status := novo_status;
  new.titulo := novo_titulo;
  new.updated_at := now();

  return new;
end;
$$ language plpgsql;

-- Trigger que roda a função antes de update
create trigger trigger_status_advogado
  before insert or update on advogados
  for each row execute function atualizar_status_advogado();

-- Função que atualiza advogado quando uma compra é registrada
create or replace function on_compra_inserida()
returns trigger as $$
begin
  -- Atualizar total de compras e última compra
  update advogados set
    total_compras = total_compras + 1,
    ultima_compra = new.data_compra
  where id = new.advogado_id;

  -- Inserir produto se ainda não tiver
  insert into advogado_produtos (advogado_id, produto)
  values (new.advogado_id, new.produto)
  on conflict do nothing;

  return new;
end;
$$ language plpgsql;

create trigger trigger_on_compra
  after insert on compras
  for each row execute function on_compra_inserida();

-- Função para criar perfil automaticamente quando usuário se registra
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, nome, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'vendedor')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================
-- SEGURANÇA (Row Level Security)
-- ============================================

alter table profiles enable row level security;
alter table advogados enable row level security;
alter table compras enable row level security;
alter table advogado_produtos enable row level security;

-- Admin vê tudo, vendedor vê só os dele
create policy "profiles_select" on profiles for select using (auth.uid() = id);

create policy "advogados_admin_all" on advogados for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "advogados_vendedor_select" on advogados for select
  using (vendedor_id = auth.uid());

create policy "advogados_vendedor_insert" on advogados for insert
  with check (vendedor_id = auth.uid());

create policy "advogados_vendedor_update" on advogados for update
  using (vendedor_id = auth.uid());

create policy "compras_admin_all" on compras for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "compras_vendedor" on compras for all
  using (vendedor_id = auth.uid());

create policy "produtos_select" on advogado_produtos for select using (true);
create policy "produtos_insert" on advogado_produtos for insert with check (true);

-- ============================================
-- INSERIR ADMIN (kairosolucoes@gmail.com)
-- Execute DEPOIS de criar a conta no Supabase Auth
-- Substitua o UUID pelo ID real do usuário
-- ============================================
-- update profiles set role = 'admin' where email = 'kairosolucoes@gmail.com';
