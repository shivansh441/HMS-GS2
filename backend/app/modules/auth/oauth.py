import base64
import hashlib
import json
import secrets
import time
from typing import Any, Dict
from fastapi import Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ConflictError, ForbiddenError, UnauthorizedError, ValidationError
from app.core.permissions import Role
from app.db.models import LinkedIdentity, User
from app.modules.audit.service import write_audit_log
from app.modules.auth.service import create_user_session, utc_now

# In-memory OAuth state tracker: state -> { provider, nonce, code_verifier, expires_at }
OAUTH_STATES: Dict[str, Dict[str, Any]] = {}

def clean_expired_states():
    now = time.time()
    for s in list(OAUTH_STATES.keys()):
        if OAUTH_STATES[s].get("expires_at", 0) < now:
            OAUTH_STATES.pop(s, None)

def start_oauth_flow(provider: str) -> dict[str, str]:
    clean_expired_states()
    prov = provider.lower()
    if prov not in ("google", "apple"):
        raise ValidationError(f"Unsupported OAuth provider: {provider}")

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(48)
    code_challenge = base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode()).digest()).decode().rstrip("=")

    OAUTH_STATES[state] = {
        "provider": prov,
        "nonce": nonce,
        "code_verifier": code_verifier,
        "expires_at": time.time() + 600,
    }

    if settings.OAUTH_MODE == "mock":
        # Dev mock consent page
        auth_url = f"/api/v1/auth/oauth/{prov}/mock-consent?state={state}"
    else:
        # Standard OIDC endpoints
        if prov == "google":
            auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?client_id=haven_google_id&response_type=code&scope=openid%20email%20profile&redirect_uri={quote_plus(settings.PUBLIC_WEBSITE_URL + '/api/v1/auth/oauth/google/callback')}&state={state}&code_challenge={code_challenge}&code_challenge_method=S256"
        else:
            auth_url = f"https://appleid.apple.com/auth/authorize?client_id=com.havenstays.web&response_type=code%20id_token&scope=name%20email&redirect_uri={quote_plus(settings.PUBLIC_WEBSITE_URL + '/api/v1/auth/oauth/apple/callback')}&state={state}&nonce={nonce}&response_mode=form_post"

    return {"authUrl": auth_url, "state": state}

def render_mock_consent_page(provider: str, state: str) -> HTMLResponse:
    if state not in OAUTH_STATES:
        return HTMLResponse("<h3>Invalid or expired OAuth state</h3>", status_code=400)

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <title>Haven Stays - Mock {provider.capitalize()} Sign In</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {{ font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }}
        .card {{ background: white; border: 1px solid #cbd5e1; border-radius: 16px; padding: 32px; max-width: 440px; width: 100%; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }}
        h2 {{ margin-top: 0; font-size: 20px; color: #0f172a; }}
        p {{ font-size: 13px; color: #64748b; line-height: 1.5; }}
        .btn {{ display: block; width: 100%; padding: 12px 16px; margin: 10px 0; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; text-align: left; cursor: pointer; text-decoration: none; color: #0f172a; font-size: 13px; font-weight: 500; box-sizing: border-box; }}
        .btn:hover {{ background: #f1f5f9; border-color: #94a3b8; }}
        .badge {{ font-size: 10px; font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px; float: right; }}
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Simulated {provider.capitalize()} Consent</h2>
        <p>This is a local development mock OAuth provider. Choose a test persona to test account linking and registration rules:</p>
        
        <a class="btn" href="/api/v1/auth/oauth/{provider}/callback?state={state}&mock_user=new_guest">
          <strong>New Hotel Guest</strong>
          <span class="badge">CREATE ACTIVE</span>
          <br><small style="color:#64748b">new.guest@gmail.com</small>
        </a>

        <a class="btn" href="/api/v1/auth/oauth/{provider}/callback?state={state}&mock_user=existing_hotel">
          <strong>Existing Hotel Guest (Verified)</strong>
          <span class="badge">AUTO-LINK</span>
          <br><small style="color:#64748b">guest.hotel@gmail.com</small>
        </a>

        <a class="btn" href="/api/v1/auth/oauth/{provider}/callback?state={state}&mock_user=apple_relay">
          <strong>Apple Private Relay</strong>
          <span class="badge">NO MERGE</span>
          <br><small style="color:#64748b">xyz@privaterelay.appleid.com</small>
        </a>
      </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

def handle_oauth_callback(
    db: Session,
    provider: str,
    state: str,
    mock_user: str | None,
    code: str | None,
    response: Response,
    request: Request,
) -> RedirectResponse:
    clean_expired_states()
    state_data = OAUTH_STATES.pop(state, None)
    if not state_data or state_data["provider"] != provider.lower():
        return RedirectResponse(url=f"{settings.PUBLIC_WEBSITE_URL}/oauth/callback?error=invalid_state")

    # Mock user payload simulation
    if mock_user == "existing_hotel":
        email = "guest.hotel@gmail.com"
        sub = "google_sub_101"
        email_verified = True
        name = "Grace Hopper"
    elif mock_user == "apple_relay":
        email = "user123@privaterelay.appleid.com"
        sub = "apple_sub_303"
        email_verified = True
        name = "Private Traveler"
    else:
        # new_guest
        email = f"guest.{secrets.token_hex(3)}@gmail.com"
        sub = f"oauth_sub_{secrets.token_hex(6)}"
        email_verified = True
        name = "Alex Taylor"

    # LINKING RULES:
    # 1. Trust only email_verified=true
    if not email_verified:
        return RedirectResponse(url=f"{settings.PUBLIC_WEBSITE_URL}/oauth/callback?error=unverified_email")

    now = utc_now()
    prov_name = provider.upper()

    # Check if LinkedIdentity already exists
    existing_link = db.scalar(
        select(LinkedIdentity).where(
            LinkedIdentity.provider == prov_name,
            LinkedIdentity.provider_user_id == sub,
        )
    )

    if existing_link:
        user = db.get(User, existing_link.user_id)
        if not user or user.status != "ACTIVE":
            return RedirectResponse(url=f"{settings.PUBLIC_WEBSITE_URL}/oauth/callback?error=account_inactive")
        access_token, _, exp, _ = create_user_session(db, user, "customer", response)
        db.commit()
        return RedirectResponse(url=f"{settings.PUBLIC_WEBSITE_URL}/oauth/callback?token={access_token}")

    # Check if an existing account matches email
    existing_user = db.scalar(select(User).where(User.email == email.lower()))
    if existing_user:
        # Rule: Apple private-relay addresses never merge
        if "privaterelay.appleid.com" in email.lower():
            # Create a separate lightweight user
            existing_user = None
        # Auto-link only verified customer accounts.
        elif (
            existing_user.email_verified_at is not None and
            existing_user.role == Role.CUSTOMER
        ):
            # Auto-link!
            new_link = LinkedIdentity(
                user_id=existing_user.id,
                provider=prov_name,
                provider_user_id=sub,
                email=email.lower(),
            )
            db.add(new_link)
            db.commit()
            access_token, _, exp, _ = create_user_session(db, existing_user, "customer", response)
            return RedirectResponse(url=f"{settings.PUBLIC_WEBSITE_URL}/oauth/callback?token={access_token}")
        else:
            # Never auto-link accounts that are not customers.
            return RedirectResponse(
                url=f"{settings.PUBLIC_WEBSITE_URL}/oauth/callback?error=cannot_autolink&message=Please+sign+in+with+your+usual+method,+then+link+from+Settings."
            )

    # Create new active customer.
    new_user = User(
        email=email.lower(),
        username=email.split("@")[0] + "_" + secrets.token_hex(2),
        full_name=name,
        password_hash=secrets.token_urlsafe(32), # No usable password; OAuth primary
        role=Role.CUSTOMER,
        status="ACTIVE",
        email_verified_at=now,
    )
    db.add(new_user)
    db.flush()

    new_link = LinkedIdentity(
        user_id=new_user.id,
        provider=prov_name,
        provider_user_id=sub,
        email=email.lower(),
    )
    db.add(new_link)
    db.flush()

    write_audit_log(
        db,
        action="CUSTOMER_REGISTERED_OAUTH",
        actor_user_id=new_user.id,
        target_user_id=new_user.id,
        details={"provider": prov_name},
    )

    access_token, _, exp, _ = create_user_session(db, new_user, "customer", response)
    db.commit()
    return RedirectResponse(url=f"{settings.PUBLIC_WEBSITE_URL}/oauth/callback?token={access_token}")
