CREATE TABLE IF NOT EXISTS football_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  logo_url text,
  category_id uuid NOT NULL REFERENCES categories(id),
  community_id uuid REFERENCES communities(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT football_teams_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS idx_football_teams_status ON football_teams(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_football_teams_community ON football_teams(community_id, status);
CREATE INDEX IF NOT EXISTS idx_football_teams_creator ON football_teams(created_by, status);

CREATE TABLE IF NOT EXISTS football_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES football_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL DEFAULT 'PLAYER',
  status varchar(20) NOT NULL DEFAULT 'INVITED',
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  joined_at timestamptz,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT football_team_members_role_check CHECK (role IN ('CAPTAIN', 'MANAGER', 'PLAYER')),
  CONSTRAINT football_team_members_status_check CHECK (status IN ('INVITED', 'ACTIVE', 'DECLINED', 'LEFT', 'REMOVED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_football_team_members_team_user ON football_team_members(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_football_team_members_team_status ON football_team_members(team_id, status);
CREATE INDEX IF NOT EXISTS idx_football_team_members_user_status ON football_team_members(user_id, status);

CREATE TABLE IF NOT EXISTS football_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES football_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT football_team_invites_status_check CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_football_team_invites_pending ON football_team_invites(team_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_football_team_invites_user_status ON football_team_invites(user_id, status, created_at);

CREATE TABLE IF NOT EXISTS tournament_team_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  division_id uuid NOT NULL REFERENCES tournament_divisions(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES football_teams(id) ON DELETE RESTRICT,
  status varchar(30) NOT NULL DEFAULT 'DRAFT',
  display_name_snapshot varchar(120) NOT NULL,
  logo_url_snapshot text,
  captain_ids_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  confirmed_at timestamptz,
  locked_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_team_entries_status_check CHECK (status IN ('DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'LOCKED', 'WITHDRAWN'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_team_entries_division_team ON tournament_team_entries(tournament_id, division_id, team_id);
CREATE INDEX IF NOT EXISTS idx_tournament_team_entries_division_status ON tournament_team_entries(division_id, status, created_at);

CREATE TABLE IF NOT EXISTS tournament_team_roster_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES tournament_team_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role varchar(12) NOT NULL DEFAULT 'MAIN',
  jersey_number integer,
  position varchar(30),
  confirmation_status varchar(20) NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_team_roster_role_check CHECK (role IN ('MAIN', 'RESERVE')),
  CONSTRAINT tournament_team_roster_confirmation_check CHECK (confirmation_status IN ('PENDING', 'CONFIRMED', 'DECLINED')),
  CONSTRAINT tournament_team_roster_jersey_check CHECK (jersey_number IS NULL OR jersey_number BETWEEN 0 AND 99)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_team_roster_entry_user ON tournament_team_roster_snapshots(entry_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_team_roster_entry_role ON tournament_team_roster_snapshots(entry_id, role);

CREATE TABLE IF NOT EXISTS football_team_ranks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES football_teams(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id),
  tier_id uuid REFERENCES elo_tiers(id) ON DELETE SET NULL,
  elo_points integer NOT NULL DEFAULT 1000,
  matches_played integer NOT NULL DEFAULT 0,
  matches_won integer NOT NULL DEFAULT 0,
  win_streak integer NOT NULL DEFAULT 0,
  peak_elo integer NOT NULL DEFAULT 1000,
  last_match_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT football_team_ranks_stats_check CHECK (elo_points >= 0 AND matches_played >= 0 AND matches_won >= 0 AND matches_won <= matches_played)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_football_team_ranks_team_category ON football_team_ranks(team_id, category_id);
CREATE INDEX IF NOT EXISTS idx_football_team_ranks_leaderboard ON football_team_ranks(category_id, elo_points DESC, team_id);

CREATE TABLE IF NOT EXISTS football_elo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_rank_id uuid NOT NULL REFERENCES football_team_ranks(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE RESTRICT,
  before_elo integer NOT NULL,
  after_elo integer NOT NULL,
  delta integer NOT NULL,
  outcome varchar(20) NOT NULL,
  reason varchar(40) NOT NULL DEFAULT 'MATCH_COMPLETED',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT football_elo_events_outcome_check CHECK (outcome IN ('WIN', 'DRAW', 'LOSS', 'FORFEIT', 'NO_SHOW') )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_football_elo_events_match_team ON football_elo_events(match_id, team_rank_id);
CREATE INDEX IF NOT EXISTS idx_football_elo_events_team_created ON football_elo_events(team_rank_id, created_at);
