"""
FLIPPY API — /api/auth  (SOAP — account security operations only)
=====================================================================
Per the architecture split: general CRUD (decks/cards/goals/profile) goes
through REST because it's flexible and JSON-native for the frontend.
Account security — signup, login, OTP verification, password reset/change —
goes through SOAP instead, so the highest-risk surface sits behind a single,
strictly-typed XML contract (see /api/security.wsdl) rather than blending
into general-purpose REST routes.

This is a small hand-rolled SOAP 1.1 implementation (stdlib
xml.etree.ElementTree only) rather than a framework like Spyne/zeep —
those are unmaintained/heavy and awkward to run on serverless. The wire
format is still a standard SOAP envelope: any SOAP client can call it.

POST /api/auth
Content-Type: text/xml
Body: a SOAP envelope whose <Body> contains exactly one of:
  Signup, Login, RequestPasswordReset, VerifyOtp, SetNewPassword, ChangePassword

Example request (Signup):
  <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                     xmlns:fl="urn:flippy-security">
    <soapenv:Body>
      <fl:Signup>
        <fl:username>ryuji</fl:username>
        <fl:email>ryuji@example.com</fl:email>
        <fl:password>correct-horse-battery</fl:password>
      </fl:Signup>
    </soapenv:Body>
  </soapenv:Envelope>

Errors are returned as a standard SOAP <Fault> with an HTTP 200 (SOAP 1.1
convention puts the real error in the Fault body, not the HTTP status —
except transport-level failures, which use 4xx/5xx as usual).
"""

from http.server import BaseHTTPRequestHandler
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, date

from ._lib.db import run_query
from ._lib.security import (
    hash_password, verify_password, generate_otp, hash_otp, verify_otp,
    create_token, get_bearer_user_id,
)
from ._lib.http_utils import read_raw_body, send_xml, send_cors_preflight

NS = "urn:flippy-security"
SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/"
ET.register_namespace("soapenv", SOAP_NS)
ET.register_namespace("fl", NS)


def _envelope(body_inner_xml: str) -> str:
    return (
        f'<?xml version="1.0" encoding="UTF-8"?>'
        f'<soapenv:Envelope xmlns:soapenv="{SOAP_NS}" xmlns:fl="{NS}">'
        f'<soapenv:Body>{body_inner_xml}</soapenv:Body>'
        f'</soapenv:Envelope>'
    )


def _fault(faultstring: str, faultcode: str = "Client") -> str:
    return _envelope(
        f'<soapenv:Fault><faultcode>{faultcode}</faultcode>'
        f'<faultstring>{_escape(faultstring)}</faultstring></soapenv:Fault>'
    )


def _escape(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _field(tag: str, value) -> str:
    return f'<fl:{tag}>{_escape(str(value))}</fl:{tag}>'


def _parse_action(raw_xml: str):
    """Returns (action_name, {child_tag: text}) for the single element inside <Body>."""
    root = ET.fromstring(raw_xml)
    body = root.find(f"{{{SOAP_NS}}}Body")
    if body is None or len(body) == 0:
        raise ValueError("SOAP Body is empty or missing.")
    action_el = body[0]
    action_name = action_el.tag.split("}")[-1]
    params = {child.tag.split("}")[-1]: (child.text or "").strip() for child in action_el}
    return action_name, params


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def do_POST(self):
        try:
            raw = read_raw_body(self)
            action, params = _parse_action(raw)
        except Exception:
            return send_xml(self, 400, _fault("Malformed SOAP request."))

        try:
            handler_fn = {
                "Signup": _signup,
                "Login": _login,
                "RequestPasswordReset": _request_password_reset,
                "VerifyOtp": _verify_otp_action,
                "SetNewPassword": _set_new_password,
                "ChangePassword": _change_password,
            }.get(action)
            if not handler_fn:
                return send_xml(self, 400, _fault(f"Unknown action '{action}'."))
            response_xml = handler_fn(params, dict(self.headers))
            send_xml(self, 200, response_xml)
        except _AuthError as e:
            send_xml(self, 200, _fault(str(e)))
        except Exception as e:
            send_xml(self, 500, _fault(f"Server error: {e}", faultcode="Server"))


class _AuthError(Exception):
    pass


# ------------------------------- Action handlers -------------------------------

def _signup(params, headers):
    username = params.get("username", "")
    email = params.get("email", "")
    password = params.get("password", "")
    if not (3 <= len(username) <= 24) or not username.replace("_", "").isalnum():
        raise _AuthError("Username must be 3-24 characters (letters, numbers, underscore).")
    if "@" not in email:
        raise _AuthError("A valid email is required.")
    if len(password) < 8:
        raise _AuthError("Password must be at least 8 characters.")

    existing = run_query("SELECT id FROM users WHERE username = %s OR email = %s", (username, email), fetch="one")
    if existing:
        raise _AuthError("That username or email is already registered.")

    user_id = run_query(
        "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s)",
        (username, email, hash_password(password)), fetch="none"
    )
    token = create_token(user_id)
    return _envelope(
        f'<fl:SignupResponse>{_field("success", "true")}{_field("userId", user_id)}{_field("token", token)}</fl:SignupResponse>'
    )


def _login(params, headers):
    identifier = params.get("usernameOrEmail", "")
    password = params.get("password", "")
    user = run_query(
        "SELECT id, password_hash FROM users WHERE username = %s OR email = %s",
        (identifier, identifier), fetch="one"
    )
    if not user or not verify_password(password, user["password_hash"]):
        raise _AuthError("Incorrect username/email or password.")
    token = create_token(user["id"])
    return _envelope(
        f'<fl:LoginResponse>{_field("success", "true")}{_field("token", token)}{_field("userId", user["id"])}</fl:LoginResponse>'
    )


def _request_password_reset(params, headers):
    email = params.get("email", "")
    user = run_query("SELECT id FROM users WHERE email = %s", (email,), fetch="one")
    # Always respond success even if the email doesn't match, so this
    # endpoint can't be used to enumerate registered emails.
    if user:
        code = generate_otp()
        expires = datetime.utcnow() + timedelta(minutes=10)
        run_query(
            "INSERT INTO otp_codes (user_id, code_hash, expires_at) VALUES (%s, %s, %s)",
            (user["id"], hash_otp(code), expires), fetch="none"
        )
        # A real deployment sends `code` by email here (e.g. via an
        # email API). Wire that call in where this comment is.
    return _envelope(f'<fl:RequestPasswordResetResponse>{_field("success", "true")}</fl:RequestPasswordResetResponse>')


def _verify_otp_action(params, headers):
    email = params.get("email", "")
    code = params.get("code", "")
    user = run_query("SELECT id FROM users WHERE email = %s", (email,), fetch="one")
    if not user:
        raise _AuthError("Invalid code.")
    otp_row = run_query(
        "SELECT id, code_hash FROM otp_codes WHERE user_id = %s AND used = FALSE AND expires_at > NOW() "
        "ORDER BY created_at DESC LIMIT 1",
        (user["id"],), fetch="one"
    )
    if not otp_row or not verify_otp(code, otp_row["code_hash"]):
        raise _AuthError("Invalid or expired code.")
    run_query("UPDATE otp_codes SET used = TRUE WHERE id = %s", (otp_row["id"],), fetch="none")
    reset_token = create_token(user["id"])
    return _envelope(
        f'<fl:VerifyOtpResponse>{_field("success", "true")}{_field("resetToken", reset_token)}</fl:VerifyOtpResponse>'
    )


def _set_new_password(params, headers):
    reset_token = params.get("resetToken", "")
    new_password = params.get("newPassword", "")
    from ._lib.security import verify_token
    user_id = verify_token(reset_token)
    if not user_id:
        raise _AuthError("Reset session expired — request a new code.")
    if len(new_password) < 8:
        raise _AuthError("Password must be at least 8 characters.")
    run_query("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(new_password), user_id), fetch="none")
    return _envelope(f'<fl:SetNewPasswordResponse>{_field("success", "true")}</fl:SetNewPasswordResponse>')


def _change_password(params, headers):
    user_id = get_bearer_user_id(headers)
    if not user_id:
        raise _AuthError("Not authenticated.")
    current_password = params.get("currentPassword", "")
    new_password = params.get("newPassword", "")
    row = run_query("SELECT password_hash FROM users WHERE id = %s", (user_id,), fetch="one")
    if not row or not verify_password(current_password, row["password_hash"]):
        raise _AuthError("Current password is incorrect.")
    if len(new_password) < 8:
        raise _AuthError("New password must be at least 8 characters.")
    run_query("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(new_password), user_id), fetch="none")
    return _envelope(f'<fl:ChangePasswordResponse>{_field("success", "true")}</fl:ChangePasswordResponse>')
