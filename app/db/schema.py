"""SaaS database schema: users, auth, roles, subscriptions, payments."""

import logging

import asyncpg

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============ USERS & AUTH ============

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    steam_id TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'FREE',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_steam_id ON users (steam_id) WHERE steam_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens (token);

CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications (token);

CREATE TABLE IF NOT EXISTS password_resets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets (token);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id);

-- ============ PLANS / SUBSCRIPTIONS / PAYMENTS ============

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    stripe_price_monthly TEXT,
    stripe_price_yearly TEXT,
    monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    yearly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    max_demos INT NOT NULL DEFAULT 3,
    max_file_size_mb INT NOT NULL DEFAULT 200,
    max_users INT NOT NULL DEFAULT 1,
    features JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    stripe_subscription_id TEXT UNIQUE,
    stripe_customer_id TEXT,
    billing_interval TEXT NOT NULL DEFAULT 'monthly',
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    stripe_payment_intent_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments (user_id);

CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    discount_percent INT NOT NULL CHECK (discount_percent BETWEEN 1 AND 100),
    max_uses INT NOT NULL DEFAULT 100,
    current_uses INT NOT NULL DEFAULT 0,
    plan_type TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (promo_id, user_id)
);

CREATE TABLE IF NOT EXISTS referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    uses INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes (code);

CREATE TABLE IF NOT EXISTS referral_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reward_type TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (referrer_id, referred_id, reward_type)
);

-- ============ USAGE TRACKING (demo quotas) ============

CREATE TABLE IF NOT EXISTS demo_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    match_id TEXT,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demo_usage_user_time ON demo_usage (user_id, uploaded_at);

-- Bonus demos granted by referrals / promos
CREATE TABLE IF NOT EXISTS demo_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INT NOT NULL,
    reason TEXT,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demo_bonuses_user ON demo_bonuses (user_id);

-- Link demos to owners
ALTER TABLE matches ADD COLUMN IF NOT EXISTS owner_id UUID;
CREATE INDEX IF NOT EXISTS idx_matches_owner ON matches (owner_id) WHERE owner_id IS NOT NULL;

-- ============ GAMIFICATION ============

ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS xp_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_xp_events_user_time ON xp_events (user_id, created_at);

CREATE TABLE IF NOT EXISTS achievements (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'trophy',
    xp_reward INT NOT NULL DEFAULT 100,
    tier TEXT NOT NULL DEFAULT 'bronze'
);

CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_code TEXT NOT NULL REFERENCES achievements(code) ON DELETE CASCADE,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, achievement_code)
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements (user_id);

-- ============ CLANS / TEAMS ============

CREATE TABLE IF NOT EXISTS clans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    tag TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clans_owner ON clans (owner_id);

CREATE TABLE IF NOT EXISTS clan_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members (clan_id);

CREATE TABLE IF NOT EXISTS clan_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    max_uses INT NOT NULL DEFAULT 10,
    uses INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clan_invites_code ON clan_invites (code);

-- ============ CHALLENGES ============

CREATE TABLE IF NOT EXISTS user_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_code TEXT NOT NULL,
    week_start DATE NOT NULL,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, challenge_code, week_start)
);
CREATE INDEX IF NOT EXISTS idx_user_challenges_user ON user_challenges (user_id, week_start);

-- ============ SOCIAL ============

CREATE TABLE IF NOT EXISTS activity_feed (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_feed_time ON activity_feed (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_feed_user ON activity_feed (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS follows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (follower_id, following_id),
    CHECK (follower_id != following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);

-- Likes & comments on feed events
CREATE TABLE IF NOT EXISTS feed_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (activity_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_likes_activity ON feed_likes (activity_id);

CREATE TABLE IF NOT EXISTS feed_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID NOT NULL REFERENCES activity_feed(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feed_comments_activity ON feed_comments (activity_id, created_at);

-- Weekly digest send log (prevents duplicate sends)
CREATE TABLE IF NOT EXISTS digest_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start DATE NOT NULL UNIQUE,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recipients INT NOT NULL DEFAULT 0
);

-- ============ 2FA ============

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ============ COACH TOOLS ============

CREATE TABLE IF NOT EXISTS coach_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    round_number INT,
    title TEXT NOT NULL DEFAULT '',
    audio_path TEXT NOT NULL,
    duration_seconds REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_notes_match ON coach_notes (match_id, created_at);

CREATE TABLE IF NOT EXISTS coach_drawings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Untitled',
    map_name TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coach_drawings_match ON coach_drawings (match_id, created_at);

-- ============ TOURNAMENTS ============

CREATE TABLE IF NOT EXISTS tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tournaments_owner ON tournaments (owner_id);

CREATE TABLE IF NOT EXISTS tournament_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'group',
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tournament_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_matches ON tournament_matches (tournament_id);

-- ============ DEMO FOLDERS (collections) ============

CREATE TABLE IF NOT EXISTS demo_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#22d3ee',
    tournament_id UUID REFERENCES tournaments(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demo_folders_owner ON demo_folders (owner_id);
CREATE INDEX IF NOT EXISTS idx_demo_folders_tournament ON demo_folders (tournament_id);

CREATE TABLE IF NOT EXISTS folder_matches (
    folder_id UUID NOT NULL REFERENCES demo_folders(id) ON DELETE CASCADE,
    match_id TEXT NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (folder_id, match_id)
);
CREATE INDEX IF NOT EXISTS idx_folder_matches_match ON folder_matches (match_id);

ALTER TABLE matches ADD COLUMN IF NOT EXISTS auto_tournament_id UUID;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS auto_tournament_stage TEXT NOT NULL DEFAULT 'group';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS auto_folder_id UUID;

-- ============ PRO DEMOS ============

ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_matches_pro ON matches (is_pro) WHERE is_pro;

-- ============ INTEGRATIONS ============

ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT;

-- ============ API KEYS (ORGANIZATION) ============

CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys (user_id);
"""

ACHIEVEMENTS = [
    # (code, name, description, icon, xp_reward, tier)
    ("first_upload", "First Blood", "Upload your first demo", "upload", 100, "bronze"),
    ("uploads_10", "Demo Grinder", "Upload 10 demos", "layers", 250, "silver"),
    ("uploads_50", "Tape Study Addict", "Upload 50 demos", "flame", 600, "gold"),
    ("uploads_100", "The Archivist", "Upload 100 demos", "crown", 1500, "diamond"),
    ("streak_3", "Warming Up", "Upload demos on 3 different days", "calendar", 150, "bronze"),
    ("streak_7", "Consistency King", "Upload demos on 7 different days", "calendar-check", 400, "silver"),
    ("clan_founder", "Founder", "Create a clan", "shield", 200, "silver"),
    ("clan_member", "Team Player", "Join a clan", "users", 100, "bronze"),
    ("referral_1", "Recruiter", "Invite your first friend", "gift", 200, "silver"),
    ("referral_5", "Talent Scout", "Invite 5 friends", "megaphone", 800, "gold"),
    ("pro_subscriber", "Going Pro", "Subscribe to any paid plan", "star", 300, "gold"),
    ("verified", "Identity Confirmed", "Verify your email address", "badge-check", 50, "bronze"),
    ("steam_linked", "Locked In", "Link your Steam account", "link", 100, "bronze"),
]

DEFAULT_PLANS = [
    # (id, name, monthly, yearly, max_demos, max_mb, max_users, features)
    (
        "FREE", "Free", 0, 0, 3, 200, 1,
        '["3 demos / month", "Max demo size 200 MB", "Basic heatmap",'
        ' "Positions replay (own demos)", "Basic grenade analysis", "1 report export / month"]',
    ),
    (
        "PRO", "Pro", 9.99, 89.99, 50, 600, 1,
        '["50 demos / month", "Max demo size 600 MB", "Full heatmap with round filters",'
        ' "Player comparison (2 players)", "Full grenade trajectories", "Habit analysis",'
        ' "Smoke landing heatmap", "Unlimited report exports", "Match history",'
        ' "Match comparison", "Priority parsing queue"]',
    ),
    (
        "TEAM", "Team", 29.99, 269.99, 200, 600, 5,
        '["Everything in Pro", "200 demos / month", "Up to 5 team members",'
        ' "Shared team demo pool", "Team analytics", "Team roles (Owner / Admin / Member)",'
        ' "Report sharing", "Team dashboard"]',
    ),
    (
        "ORGANIZATION", "Organization", 99.99, 899.99, 1000, 600, 20,
        '["Everything in Team", "1000 demos / month", "Up to 20 members",'
        ' "API access", "Webhooks", "Custom reports", "Dedicated manager", "SSO integration"]',
    ),
]


async def ensure_saas_schema(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)
        for plan_id, name, monthly, yearly, demos, mb, users, features in DEFAULT_PLANS:
            await conn.execute(
                """
                INSERT INTO plans (id, name, monthly_price, yearly_price,
                                   max_demos, max_file_size_mb, max_users, features)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    monthly_price = EXCLUDED.monthly_price,
                    yearly_price = EXCLUDED.yearly_price,
                    max_demos = EXCLUDED.max_demos,
                    max_file_size_mb = EXCLUDED.max_file_size_mb,
                    max_users = EXCLUDED.max_users,
                    features = EXCLUDED.features
                """,
                plan_id, name, monthly, yearly, demos, mb, users, features,
            )
        for code, name, description, icon, xp, tier in ACHIEVEMENTS:
            await conn.execute(
                """
                INSERT INTO achievements (code, name, description, icon, xp_reward, tier)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (code) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    icon = EXCLUDED.icon,
                    xp_reward = EXCLUDED.xp_reward,
                    tier = EXCLUDED.tier
                """,
                code, name, description, icon, xp, tier,
            )
    logger.info("SaaS schema ensured (users, auth, plans, subscriptions, gamification, clans)")
