"""
FLIPPY API — /api/users
==========================
General profile operations (REST). Password changes and anything else
classified as an account-security operation go through the SOAP endpoint
at /api/auth instead — see that file for the rationale.

  GET   /api/users            -> current user's profile
  PATCH /api/users             -> update {username, email, currentPassword,
                                   theme, accentColor, avatar}
                                   currentPassword is required only when
                                   changing username or email.

Requires: Authorization: Bearer <token>
"""

from http.server import BaseHTTPRequestHandler
from ._lib.db import run_query
from ._lib.security import get_bearer_user_id, verify_password
from ._lib.http_utils import read_json_body, send_json, send_error_json, send_cors_preflight


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _authed_user(self):
        return get_bearer_user_id(dict(self.headers))

    def do_GET(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        row = run_query(
            "SELECT id, username, email, avatar_url, theme, accent_color FROM users WHERE id = %s",
            (user_id,), fetch="one"
        )
        if not row:
            return send_error_json(self, 404, "User not found.", "not_found")
        send_json(self, 200, {"success": True, "user": row})

    def do_PATCH(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        body = read_json_body(self)

        # Appearance-only changes (theme/accent/avatar) don't require a
        # password re-check — they aren't security-sensitive.
        if "theme" in body:
            run_query("UPDATE users SET theme = %s WHERE id = %s", (body["theme"], user_id), fetch="none")
        if "accentColor" in body:
            run_query("UPDATE users SET accent_color = %s WHERE id = %s", (body["accentColor"], user_id), fetch="none")
        if "avatar" in body:
            run_query("UPDATE users SET avatar_url = %s WHERE id = %s", (body["avatar"], user_id), fetch="none")

        # Identity changes (username/email) require the current password.
        if "username" in body or "email" in body:
            current_pw = body.get("currentPassword") or ""
            row = run_query("SELECT password_hash FROM users WHERE id = %s", (user_id,), fetch="one")
            if not row or not verify_password(current_pw, row["password_hash"]):
                return send_error_json(self, 403, "Current password is incorrect.", "bad_password")
            if "username" in body:
                run_query("UPDATE users SET username = %s WHERE id = %s", (body["username"], user_id), fetch="none")
            if "email" in body:
                run_query("UPDATE users SET email = %s WHERE id = %s", (body["email"], user_id), fetch="none")

        send_json(self, 200, {"success": True})
