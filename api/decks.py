"""
FLIPPY API — /api/decks
==========================
REST endpoint for deck CRUD. General operations use REST per the project's
architecture (account security operations are handled separately by the
SOAP endpoint at /api/auth).

  GET    /api/decks              -> list the authenticated user's decks
  POST   /api/decks               -> create a deck {title, description}
  PATCH  /api/decks                -> update a deck {id, title, description}
  DELETE /api/decks?id=123          -> delete a deck (cascades to its cards)

All operations require: Authorization: Bearer <token>
"""

from http.server import BaseHTTPRequestHandler
from ._lib.db import run_query
from ._lib.security import get_bearer_user_id
from ._lib.http_utils import get_query_params, read_json_body, send_json, send_error_json, send_cors_preflight


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _authed_user(self):
        return get_bearer_user_id(dict(self.headers))

    def do_GET(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        rows = run_query(
            "SELECT id, title, description, created_at FROM decks WHERE user_id = %s ORDER BY created_at DESC",
            (user_id,)
        )
        send_json(self, 200, {"success": True, "decks": rows})

    def do_POST(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        body = read_json_body(self)
        title = (body.get("title") or "").strip()
        description = (body.get("description") or "").strip()
        if not title:
            return send_error_json(self, 400, "Title is required.", "validation_error")
        new_id = run_query(
            "INSERT INTO decks (user_id, title, description) VALUES (%s, %s, %s)",
            (user_id, title, description), fetch="none"
        )
        send_json(self, 201, {"success": True, "deck": {"id": new_id, "title": title, "description": description}})

    def do_PATCH(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        body = read_json_body(self)
        deck_id = body.get("id")
        title = (body.get("title") or "").strip()
        description = (body.get("description") or "").strip()
        if not deck_id or not title:
            return send_error_json(self, 400, "id and title are required.", "validation_error")
        run_query(
            "UPDATE decks SET title = %s, description = %s WHERE id = %s AND user_id = %s",
            (title, description, deck_id, user_id), fetch="none"
        )
        send_json(self, 200, {"success": True})

    def do_DELETE(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        params = get_query_params(self.path)
        deck_id = params.get("id")
        if not deck_id:
            return send_error_json(self, 400, "id query parameter is required.", "validation_error")
        run_query("DELETE FROM decks WHERE id = %s AND user_id = %s", (deck_id, user_id), fetch="none")
        send_json(self, 200, {"success": True})
