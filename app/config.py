from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://cs2:cs2@db:5432/cs2_analyzer"
    upload_dir: str = "uploads"
    demo_retention_days: int = 7
    allowed_hosts: str = "*"
    cors_origins: str = "*"
    trusted_hosts: str = "*"
    max_upload_bytes: int = 600 * 1024 * 1024
    parse_semaphore_limit: int = 3
    memory_limit_mb: int = 2048
    large_demo_mb: int = 300

    # --- Demo storage (S3 / MinIO) ---
    s3_enabled: bool = False
    s3_bucket: str = ""
    s3_region: str = "us-east-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_endpoint_url: str = ""  # for S3-compatible providers (MinIO, etc.)
    s3_prefix: str = "demos"
    s3_force_path_style: bool = False
    s3_delete_local_after_upload: bool = True
    s3_delete_local_after_parse: bool = True
    s3_cleanup_enabled: bool = True

    # --- SaaS: auth ---
    jwt_secret: str = "change-me-in-production-min-32-chars!!"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 30
    # Require login for uploads (enable in production)
    auth_required: bool = False
    frontend_base_url: str = "http://localhost"

    # --- SaaS: redis ---
    redis_url: str = "redis://redis:6379/0"

    # --- SaaS: rate limiting ---
    rate_limit_general_per_min: int = 60
    rate_limit_auth_per_min: int = 10
    login_max_failures: int = 5
    login_lockout_minutes: int = 15

    # --- SaaS: email (Resend) ---
    resend_api_key: str = ""
    email_from: str = "ClutchLab <noreply@clutchlab.gg>"

    # --- SaaS: Stripe ---
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_pro_monthly: str = ""
    stripe_price_pro_yearly: str = ""
    stripe_price_team_monthly: str = ""
    stripe_price_team_yearly: str = ""
    stripe_price_org_monthly: str = ""
    stripe_price_org_yearly: str = ""

    # --- SaaS: trial ---
    trial_days: int = 7

    # Comma-separated emails that get ADMIN role on registration
    admin_emails: str = ""

    # Seed demo accounts for every role (dev/staging only)
    seed_demo_users: bool = True
    demo_user_password: str = "Demo2026!"

    # --- SaaS: monitoring ---
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.1

    # --- SaaS: parse queue ---
    parse_worker_count: int = 2

    # --- SaaS: coach tools ---
    voice_notes_dir: str = "voice_notes"
    max_voice_note_bytes: int = 15 * 1024 * 1024

    # --- SaaS: integrations ---
    faceit_api_key: str = ""

    # --- SaaS: JWT RS256 (optional; falls back to HS256 when keys are absent) ---
    jwt_private_key_path: str = "jwt_rsa_private.pem"
    jwt_public_key_path: str = "jwt_rsa_public.pem"


settings = Settings()
