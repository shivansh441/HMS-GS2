import os

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Haven Stays API"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    
    # SQLite fallback when DATABASE_URL is unset
    DATABASE_URL: str = Field(default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./haven_stays.db"))
    
    # Security
    JWT_SECRET: str = "haven_stays_jwt_secret_must_be_at_least_32_bytes_long_random_key_12345"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    ADMIN_MFA_REQUIRED: bool = False
    
    # AES-256-GCM key (32 bytes urlsafe base64 encoded or raw 32 bytes)
    # Default is 32 byte key urlsafe base64: base64.urlsafe_b64encode(b"01234567890123456789012345678901").decode()
    ENCRYPTION_KEY_B64: str = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="
    
    # CORS: Allow-list of admin-panel and public-website origins only
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000"
    ]
    
    # Refresh token cookies
    ADMIN_REFRESH_COOKIE_NAME: str = "hs_admin_rt"
    CUST_REFRESH_COOKIE_NAME: str = "hs_cust_rt"
    
    ADMIN_COOKIE_PATH: str = "/api/v1/admin/auth"
    CUST_COOKIE_PATH: str = "/api/v1/auth"
    
    # Argon2id params
    ARGON2_MEMORY_COST: int = 65536
    ARGON2_TIME_COST: int = 3
    ARGON2_PARALLELISM: int = 4

    # OAuth
    OAUTH_MODE: str = "mock" # mock | production
    PUBLIC_WEBSITE_URL: str = "http://localhost:3000"
    ADMIN_PANEL_URL: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
