"""
Central configuration — reads from .env (production) or .env.local (dev).
All optional fields default to None so the app starts without crashing.
"""
from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    # ── App ───────────────────────────────────────────────────────────────
    APP_NAME: str = "AI Call Center"
    APP_VERSION: str = "5.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"

    # ── Database ──────────────────────────────────────────────────────────
    # SQLite for local dev, Neon (managed Postgres, free tier) for
    # production. Neon connection strings need `?ssl=require` (asyncpg's
    # param name — NOT `sslmode=require`, that's the psycopg2 spelling).
    # e.g. postgresql+asyncpg://user:pass@ep-xxxx.neon.tech/dbname?ssl=require
    #
    # Two connection-string flavors Neon gives you:
    #   - Direct (unpooled)  — use this one by default; combine with the
    #     pool settings below.
    #   - Pooled (pgbouncer, transaction mode) — if you use this one
    #     instead, DB_STATEMENT_CACHE_SIZE below MUST be 0 (see database.py),
    #     since pgbouncer transaction pooling and asyncpg's prepared
    #     statement cache don't mix.
    DATABASE_URL: str = "sqlite+aiosqlite:///./callcenter.db"

    # Schema is managed by Alembic migrations now (see alembic/), not
    # create_all(). This only controls whether app/main.py's startup path
    # still calls create_all() as a convenience for local SQLite dev —
    # it's ignored for Postgres. Never set true against Neon/production.
    AUTO_CREATE_TABLES_SQLITE_ONLY: bool = True

    # asyncpg connection pool sizing — conservative defaults so a handful
    # of replicas + Celery workers don't blow through Neon's free-tier
    # connection limit. Raise DB_POOL_SIZE only after checking Neon's
    # dashboard for your plan's connection cap.
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_RECYCLE_SECONDS: int = 300      # Neon can idle-close connections; recycle before that
    # Set to 0 if DATABASE_URL points at Neon's pooled (pgbouncer) endpoint.
    # Leave at the asyncpg default (unset/None -> asyncpg's own default)
    # for a direct/unpooled Neon connection string.
    DB_STATEMENT_CACHE_SIZE: Optional[int] = None

    # ── Redis ─────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379"

    # ── JWT ───────────────────────────────────────────────────────────────
    # These three are the ONLY source of truth for token signing/expiry —
    # app/core/security.py reads them from `settings`, not from
    # os.environ directly, and no longer hardcodes its own expiry. Change
    # ACCESS_TOKEN_EXPIRE_MINUTES in .env if 24h isn't what you want;
    # nothing else needs editing.
    JWT_SECRET_KEY: str = "change-me-jwt-secret"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24h

    # ── Allowed users (no self-signup) ───────────────────────────────────
    # Format: "email1:password1,email2:password2". Each pair is provisioned
    # into the local `users` table at startup (see app/main.py) — created if
    # missing, password updated if you change it here and restart. There is
    # no public /register endpoint; only these accounts can log in.
    ALLOWED_USERS: Optional[str] = None

    # ── CORS ──────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # ── Public base URL ───────────────────────────────────────────────────
    # This server's own public URL (ngrok/Cloudflare tunnel in dev, real
    # domain in production) — used to build Vobiz answer/hangup webhook
    # URLs and the license activation "domain". Was TELNYX_WEBHOOK_BASE_URL;
    # renamed since it's not Telnyx-specific. Old var name still read as a
    # fallback by vobiz_service._get_base_url() env-file check.
    PUBLIC_BASE_URL: Optional[str] = None

    # ── Vobiz (sole telephony provider) ──────────────────────────────────
    # Real (non-demo) companies must still set their own vobiz_auth_id/
    # vobiz_auth_token/vobiz_phone_number via Settings — there is NO
    # fallback to these for a normal paying company, so one customer can
    # never silently place/receive calls (and incur charges) on another
    # customer's or the shared demo account. See _creds() in
    # app/services/telephony/vobiz_service.py and vobiz_stream_pipeline.py.
    #
    # The one deliberate exception is the shared demo account
    # (Company.is_demo_account=True — see models.py). Prospects handed the
    # demo login shouldn't have to go set up their own Vobiz account just
    # to try the product, so a demo company with blank vobiz_* fields (or
    # any of the three left blank) falls back to these .env values
    # instead. Leave all three blank here to require the demo account to
    # have its own credentials too.
    VOBIZ_AUTH_ID: Optional[str] = None
    VOBIZ_AUTH_TOKEN: Optional[str] = None
    VOBIZ_PHONE_NUMBER: Optional[str] = None
    # True -> outbound calls use the Pipecat streaming pipeline
    # (/vobiz-stream/answer-stream). False -> rollback to the old
    # Record+Gather XML flow (/vobiz/answer). Override with
    # USE_STREAMING_CALLS=false in .env if you need to roll back without
    # a code change.
    USE_STREAMING_CALLS: bool = True

    # ── License server (one-time activation key) ─────────────────────────
    # Points at your hosted activationkey.py instance.
    # DEPRECATED — the license server used to be a separate service you'd
    # point this at. It's now merged directly into this backend (see
    # app/api/routes/admin.py + app/services/license_service.py, which now
    # read/write the local `licenses` table instead of making HTTP calls
    # here). Left defined only so nothing breaks if some old .env still
    # sets it; nothing in the app reads it anymore.
    LICENSE_SERVER_URL: str = "http://localhost:8100"

    # Bearer token that gates every /api/v1/admin/* route (license
    # generation, user list, password resets) and the admin.html panel.
    # CHANGE THIS in production — treat it like a root password. Access
    # this panel only from a trusted network (VPN/IP-allowlist at your
    # reverse proxy) since the token alone is the only gate.
    ADMIN_TOKEN: str = "change-this-admin-token-in-production"

    # Login rate limiting (see app/api/routes/auth.py) — keyed per
    # email+IP in Redis so it's consistent across worker processes.
    LOGIN_RATE_LIMIT_ATTEMPTS: int = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 900   # 15 minutes

    # Admin route rate limiting (see app/api/routes/admin.py) — keyed per
    # IP in Redis, same mechanism as login. The admin token has no
    # lockout of its own, so this is what actually slows down someone
    # hammering /api/v1/admin/* with guessed tokens.
    ADMIN_RATE_LIMIT_ATTEMPTS: int = 20
    ADMIN_RATE_LIMIT_WINDOW_SECONDS: int = 300   # 5 minutes

    # ── Field-level encryption ────────────────────────────────────────────
    # Fernet key (32 url-safe base64 bytes) used to encrypt sensitive
    # per-tenant columns at rest — currently Company.vobiz_auth_token and
    # Company.vobiz_auth_id (see app/core/crypto.py). Generate one with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Required in production once any company has Vobiz credentials
    # saved; app/core/crypto.py raises loudly instead of silently storing
    # plaintext if this is unset and encryption is actually attempted.
    ENCRYPTION_KEY: Optional[str] = None

    # ── Deepgram STT ──────────────────────────────────────────────────────────
    # Free tier: 45,000 minutes/month
    # Sign up: https://console.deepgram.com
    DEEPGRAM_API_KEY: Optional[str] = None

    # ── Sarvam AI (Hindi/Hinglish TTS) ──────────────────────────────────────
    # Sign up: https://dashboard.sarvam.ai — purpose-built for Indian
    # languages, low-latency WS streaming, outputs mulaw/8kHz natively
    # (matches Vobiz's stream format with zero resampling).
    SARVAM_API_KEY: Optional[str] = None

    # ── LLM ───────────────────────────────────────────────────────────────
    LLM_PROVIDER: str = "groq"                      # groq | openai | anthropic
    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"    # fixed model
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_MODEL: str = "claude-haiku-4-5-20251001"

    # ── TTS ───────────────────────────────────────────────────────────────
    # Global fallback default; per-company override lives on
    # Company.tts_provider so each customer can pick their own in Settings.
    #
    # "vobiz"    = Vobiz's native XML <Speak> (turn-based, no extra vendor
    #              key needed, but adds a full webhook round-trip per turn)
    # "sarvam"   = Sarvam AI — recommended for Hindi/Hinglish. Purpose-built
    #              for Indian languages, streams over Vobiz's WS media
    #              stream for real-time playback instead of round-tripping.
    # "deepgram" = Deepgram Aura-2 — DOES NOT SUPPORT HINDI (only en, es,
    #              de, fr, nl, it, ja as of this writing — see
    #              developers.deepgram.com/docs/tts-models). Only usable
    #              for English-mode calls; resolve_tts_provider() below
    #              auto-falls-back to Sarvam if "deepgram" is selected for
    #              a Hindi/Hinglish call.
    TTS_PROVIDER: str = "vobiz"

    # ── STT ───────────────────────────────────────────────────────────────
    # Vobiz calls are record-then-transcribe via Deepgram REST (see
    # vobiz_webhook.py), or Gather-mode where Vobiz transcribes for us.
    STT_PROVIDER: str = "deepgram"

    # ── Email ─────────────────────────────────────────────────────────────
    SENDGRID_API_KEY: Optional[str] = None
    EMAIL_FROM_ADDRESS: str = "noreply@yourdomain.com"
    EMAIL_FROM_NAME: str = "AI Agent"
    EMAIL_REPLY_TO: Optional[str] = None
    IMAP_HOST: str = "imap.gmail.com"
    IMAP_PORT: int = 993
    IMAP_USERNAME: Optional[str] = None
    IMAP_PASSWORD: Optional[str] = None
    IMAP_MAILBOX: str = "INBOX"
    EMAIL_AUTO_REPLY_CONFIDENCE: float = 0.75
    EMAIL_POLL_INTERVAL_SECONDS: int = 120

    # ── Vector DB ─────────────────────────────────────────────────────────
    CHROMADB_HOST: str = "localhost"
    CHROMADB_PORT: int = 8001
    CHROMADB_LOCAL_PATH: str = "./chroma_data"
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

    # ── Storage ───────────────────────────────────────────────────────────
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 50

    # ── Celery ────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    # ── Call settings ─────────────────────────────────────────────────────
    MAX_CALL_DURATION_SECONDS: int = 1800
    OUTBOUND_CONCURRENT_LIMIT: int = 10   # raise after Vobiz raises your account's concurrency cap

    class Config:
        env_file = (".env.local", ".env")
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
