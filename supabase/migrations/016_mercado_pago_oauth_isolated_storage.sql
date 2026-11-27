create table public.mp_oauth_attempt (
 id smallint primary key check(id=1),
 state_hash text not null unique check(length(state_hash)=43),
 administrator uuid not null references auth.users(id) on delete cascade,
 verifier_encrypted text not null,
 expires_at timestamptz not null
);
create table public.mp_connection (
 id smallint primary key check(id=1),
 seller_id text not null check(seller_id ~ '^[0-9]+$'),
 credentials_encrypted text not null,
 expires_at timestamptz not null,
 live_mode boolean not null,
 connected_at timestamptz not null default now()
);
alter table public.mp_oauth_attempt enable row level security;
alter table public.mp_connection enable row level security;
revoke all on public.mp_oauth_attempt, public.mp_connection from public, anon, authenticated;
grant select, insert, update, delete on public.mp_oauth_attempt, public.mp_connection to service_role;