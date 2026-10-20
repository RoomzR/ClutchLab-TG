"""Academy schema: organizations, enriched demo events, stats, mistakes, training,
lineups, analysts, tactical boards, communications.

Idempotent DDL (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) applied on every
start, same approach as db/schema.py.
"""

import logging

import asyncpg

logger = logging.getLogger(__name__)

ACADEMY_SCHEMA_SQL = """
-- ============ ORGANIZATION / ROLES ============

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    retention_days INT NOT NULL DEFAULT 90,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS academy_role TEXT NOT NULL DEFAULT 'player';
ALTER TABLE users ADD COLUMN IF NOT EXISTS player_name TEXT;
CREATE INDEX IF NOT EXISTS idx_users_org ON users (org_id);

CREATE TABLE IF NOT EXISTS academy_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    tag TEXT,
    demo_names TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS academy_roster (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    team_id UUID REFERENCES academy_teams(id) ON DELETE SET NULL,
    player_name TEXT NOT NULL,
    steam_id TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ingame_role TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, player_name)
);
CREATE INDEX IF NOT EXISTS idx_roster_steam ON academy_roster (steam_id);

-- ============ MATCH METADATA ============

ALTER TABLE matches ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_type TEXT NOT NULL DEFAULT 'scrim';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS opponent_name TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS original_filename TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS parser_version TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS analysis_version TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS analysis_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS has_voice BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS voice_reason TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS reviewed_by_analyst BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS file_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_matches_org_created ON matches (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS t_team TEXT;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS ct_team TEXT;

CREATE TABLE IF NOT EXISTS parse_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    kind TEXT NOT NULL DEFAULT 'parse',
    status TEXT NOT NULL DEFAULT 'queued',
    attempt INT NOT NULL DEFAULT 1,
    error TEXT,
    worker TEXT,
    duration_ms INT,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_parse_jobs_match ON parse_jobs (match_id, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_parse_jobs_status ON parse_jobs (status, queued_at DESC);

-- ============ INDEXES FOR LEGACY EVENT TABLES ============

CREATE INDEX IF NOT EXISTS idx_positions_match_round_tick ON positions (match_id, round_number, tick);
CREATE INDEX IF NOT EXISTS idx_positions_match_tick ON positions (match_id, tick);
CREATE INDEX IF NOT EXISTS idx_kills_match ON kills (match_id, round_number, tick);
CREATE INDEX IF NOT EXISTS idx_grenades_match ON grenades (match_id, round_number, tick);
CREATE INDEX IF NOT EXISTS idx_purchases_match ON purchases (match_id, round_number);
CREATE INDEX IF NOT EXISTS idx_bomb_events_match ON bomb_events (match_id, round_number);
CREATE INDEX IF NOT EXISTS idx_rounds_match ON rounds (match_id, round_number);
CREATE INDEX IF NOT EXISTS idx_players_match ON players (match_id);
CREATE INDEX IF NOT EXISTS idx_players_name ON players (name);

-- ============ ENRICHED EVENTS ============

CREATE TABLE IF NOT EXISTS kill_details (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    tick INT NOT NULL,
    round_number INT NOT NULL,
    killer TEXT, victim TEXT, assister TEXT,
    weapon TEXT,
    headshot BOOLEAN, assisted_flash BOOLEAN,
    penetrated INT, thrusmoke BOOLEAN, attacker_blind BOOLEAN,
    noscope BOOLEAN, attacker_in_air BOOLEAN,
    distance REAL,
    killer_side TEXT, victim_side TEXT,
    killer_x REAL, killer_y REAL, killer_z REAL,
    victim_x REAL, victim_y REAL, victim_z REAL,
    killer_place TEXT, victim_place TEXT,
    killer_speed REAL,
    killer_steamid TEXT, victim_steamid TEXT
);
CREATE INDEX IF NOT EXISTS idx_kill_details_match ON kill_details (match_id, round_number, tick);

CREATE TABLE IF NOT EXISTS damages (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    tick INT NOT NULL,
    round_number INT NOT NULL,
    attacker TEXT, victim TEXT,
    attacker_side TEXT, victim_side TEXT,
    weapon TEXT,
    dmg_health INT, dmg_armor INT, health_after INT,
    hitgroup TEXT,
    attacker_x REAL, attacker_y REAL, victim_x REAL, victim_y REAL,
    attacker_place TEXT, victim_place TEXT,
    raw_dmg INT
);
CREATE INDEX IF NOT EXISTS idx_damages_match ON damages (match_id, round_number, tick);

CREATE TABLE IF NOT EXISTS shots (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    tick INT NOT NULL,
    round_number INT NOT NULL,
    player_name TEXT, side TEXT, weapon TEXT,
    speed REAL, x REAL, y REAL, place TEXT
);
CREATE INDEX IF NOT EXISTS idx_shots_match ON shots (match_id, round_number, tick);

CREATE TABLE IF NOT EXISTS blinds (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    tick INT NOT NULL,
    round_number INT NOT NULL,
    flasher TEXT, flasher_side TEXT,
    victim TEXT, victim_side TEXT,
    duration REAL
);
CREATE INDEX IF NOT EXISTS idx_blinds_match ON blinds (match_id, round_number);

CREATE TABLE IF NOT EXISTS round_economy (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    player_name TEXT NOT NULL,
    side TEXT,
    money_start INT, cash_spent INT, equip_value INT, round_start_equip INT,
    has_defuser BOOLEAN, has_helmet BOOLEAN, armor INT,
    steam_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_round_economy_match ON round_economy (match_id, round_number);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    tick INT, round_number INT,
    player_name TEXT, side TEXT, text TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_match ON chat_messages (match_id, tick);

CREATE TABLE IF NOT EXISTS pings (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    tick INT, round_number INT,
    player_name TEXT, side TEXT,
    x REAL, y REAL, z REAL, player_place TEXT, urgent BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_pings_match ON pings (match_id, round_number, tick);

CREATE TABLE IF NOT EXISTS zone_time (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INT, player_name TEXT, side TEXT, place TEXT, seconds REAL
);
CREATE INDEX IF NOT EXISTS idx_zone_time_match ON zone_time (match_id, player_name);

CREATE TABLE IF NOT EXISTS death_inventory (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    tick INT, round_number INT, victim TEXT, items TEXT[] NOT NULL DEFAULT '{}', value INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_death_inventory_match ON death_inventory (match_id, round_number);

CREATE TABLE IF NOT EXISTS early_places (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INT, player_name TEXT, side TEXT, place TEXT
);
CREATE INDEX IF NOT EXISTS idx_early_places_match ON early_places (match_id, player_name);

-- ============ COMPUTED STATS ============

CREATE TABLE IF NOT EXISTS player_match_stats (
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    player_name TEXT NOT NULL,
    side TEXT NOT NULL,
    team_name TEXT,
    steam_id TEXT,
    won BOOLEAN,
    counters JSONB NOT NULL DEFAULT '{}'::jsonb,
    extras JSONB NOT NULL DEFAULT '{}'::jsonb,
    metric_version TEXT NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (match_id, player_name, side)
);
CREATE INDEX IF NOT EXISTS idx_pms_player ON player_match_stats (player_name, side);

CREATE TABLE IF NOT EXISTS round_summaries (
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    data JSONB NOT NULL,
    PRIMARY KEY (match_id, round_number)
);

CREATE TABLE IF NOT EXISTS team_match_stats (
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    team_name TEXT NOT NULL,
    won BOOLEAN,
    data JSONB NOT NULL,
    PRIMARY KEY (match_id, team_name)
);
CREATE INDEX IF NOT EXISTS idx_tms_team ON team_match_stats (team_name);

-- ============ MISTAKES / AI ============

CREATE TABLE IF NOT EXISTS mistakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INT,
    player_name TEXT,
    team_name TEXT,
    side TEXT,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    confidence TEXT NOT NULL DEFAULT 'rule',
    tick_start INT,
    tick_end INT,
    title TEXT NOT NULL,
    explanation TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    solution_code TEXT,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'open',
    reviewed_by UUID,
    coach_comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mistakes_match ON mistakes (match_id, round_number);
CREATE INDEX IF NOT EXISTS idx_mistakes_player ON mistakes (player_name, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_round_reviews (
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    review JSONB NOT NULL,
    source TEXT NOT NULL,
    model TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (match_id, round_number)
);

CREATE TABLE IF NOT EXISTS match_facts (
    id BIGSERIAL PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    round_number INT,
    player_name TEXT,
    tick INT,
    text TEXT NOT NULL,
    tsv TSVECTOR
);
CREATE INDEX IF NOT EXISTS idx_match_facts_match ON match_facts (match_id, kind);
CREATE INDEX IF NOT EXISTS idx_match_facts_tsv ON match_facts USING GIN (tsv);

CREATE TABLE IF NOT EXISTS coach_chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    user_id UUID,
    title TEXT NOT NULL DEFAULT 'Разбор матча',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_match ON coach_chat_sessions (match_id, created_at DESC);

CREATE TABLE IF NOT EXISTS coach_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES coach_chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON coach_chat_messages (session_id, created_at);

CREATE TABLE IF NOT EXISTS ai_usage (
    id BIGSERIAL PRIMARY KEY,
    feature TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT,
    input_tokens INT,
    output_tokens INT,
    match_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============ TRAINING ============

CREATE TABLE IF NOT EXISTS training_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,
    player_name TEXT NOT NULL,
    week_start DATE NOT NULL,
    source TEXT NOT NULL DEFAULT 'ai',
    created_by UUID,
    summary TEXT NOT NULL DEFAULT '',
    themes JSONB NOT NULL DEFAULT '[]'::jsonb,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    based_on_matches TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_plans_player ON training_plans (player_name, week_start DESC);

CREATE TABLE IF NOT EXISTS homework (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,
    player_name TEXT NOT NULL,
    mistake_id UUID REFERENCES mistakes(id) ON DELETE SET NULL,
    mistake_type TEXT,
    match_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    solution_code TEXT,
    lineup_id UUID,
    assigned_by UUID,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'assigned',
    check_metric TEXT,
    check_op TEXT,
    check_threshold REAL,
    baseline_value REAL,
    last_value REAL,
    last_checked_at TIMESTAMPTZ,
    verification JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_homework_player ON homework (player_name, status);

CREATE TABLE IF NOT EXISTS coach_text_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    round_number INT,
    tick INT,
    player_name TEXT,
    author_id UUID,
    author_name TEXT,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_text_notes_match ON coach_text_notes (match_id, round_number);

-- ============ LINEUPS ============

CREATE TABLE IF NOT EXISTS lineups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,
    map_name TEXT NOT NULL,
    side TEXT NOT NULL,
    grenade_type TEXT NOT NULL,
    title TEXT NOT NULL,
    target TEXT NOT NULL DEFAULT '',
    role TEXT,
    technique TEXT NOT NULL DEFAULT 'stand',
    throw_x REAL, throw_y REAL, throw_z REAL,
    land_x REAL, land_y REAL, land_z REAL,
    steps TEXT NOT NULL DEFAULT '',
    video_url TEXT,
    video_path TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    source_match_id TEXT,
    source_tick INT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lineups_map ON lineups (org_id, map_name, grenade_type);

-- ============ LIVE ANALYSTS ============

CREATE TABLE IF NOT EXISTS analyst_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analyst_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_analyst_slots_time ON analyst_slots (starts_at);

CREATE TABLE IF NOT EXISTS analyst_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_id UUID REFERENCES analyst_slots(id) ON DELETE SET NULL,
    org_id UUID,
    analyst_id UUID REFERENCES users(id) ON DELETE SET NULL,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    match_id TEXT REFERENCES matches(match_id) ON DELETE SET NULL,
    focus TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'requested',
    queue_position INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_analyst_bookings_status ON analyst_bookings (status, created_at);

CREATE TABLE IF NOT EXISTS analyst_booking_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES analyst_bookings(id) ON DELETE CASCADE,
    author_id UUID,
    author_name TEXT,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analyst_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    booking_id UUID REFERENCES analyst_bookings(id) ON DELETE SET NULL,
    analyst_id UUID,
    status TEXT NOT NULL DEFAULT 'ai_draft',
    summary TEXT NOT NULL DEFAULT '',
    sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalized_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_analyst_reports_match ON analyst_reports (match_id);

-- ============ TACTICAL BOARD ============

CREATE TABLE IF NOT EXISTS tactical_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,
    match_id TEXT REFERENCES matches(match_id) ON DELETE SET NULL,
    map_name TEXT NOT NULL,
    round_number INT,
    tick INT,
    title TEXT NOT NULL DEFAULT 'Новая доска',
    shapes JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tactical_boards_org ON tactical_boards (org_id, updated_at DESC);

-- ============ COMMUNICATION ============

CREATE TABLE IF NOT EXISTS communication_reports (
    match_id TEXT PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
    has_voice BOOLEAN NOT NULL DEFAULT FALSE,
    voice_reason TEXT,
    report JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


async def ensure_academy_schema(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(ACADEMY_SCHEMA_SQL)
    logger.info("Academy schema ensured")
