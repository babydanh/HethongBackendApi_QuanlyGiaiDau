import * as dotenv from 'dotenv';
import { createPostgresClientFromEnv } from '../src/database/postgres-client';

dotenv.config();

async function run() {
  const sql = createPostgresClientFromEnv({ max: 1 });
  try {
    await sql.begin(async (tx) => {
      await tx`
        create table if not exists public.tournament_follows (
          id uuid primary key default gen_random_uuid() not null,
          tournament_id uuid not null,
          user_id uuid not null,
          created_at timestamp with time zone default now() not null
        )
      `;

      await tx`
        do $$
        begin
          if not exists (
            select 1
            from pg_constraint
            where conname = 'tournament_follows_tournament_id_tournaments_id_fk'
          ) then
            alter table public.tournament_follows
              add constraint tournament_follows_tournament_id_tournaments_id_fk
              foreign key (tournament_id)
              references public.tournaments(id)
              on delete cascade;
          end if;
        end $$;
      `;

      await tx`
        do $$
        begin
          if not exists (
            select 1
            from pg_constraint
            where conname = 'tournament_follows_user_id_users_id_fk'
          ) then
            alter table public.tournament_follows
              add constraint tournament_follows_user_id_users_id_fk
              foreign key (user_id)
              references public.users(id)
              on delete cascade;
          end if;
        end $$;
      `;

      await tx`
        create unique index if not exists tournament_follows_unique_idx
        on public.tournament_follows (tournament_id, user_id)
      `;
    });

    console.log('Ensured tournament_follows table, constraints, and index.');
  } finally {
    await sql.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
