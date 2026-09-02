"""
FLIPPY API — /api/cards
==========================
  GET    /api/cards?deckId=123        -> list cards in a deck
  POST   /api/cards                     -> create {deckId, front, back}
  PATCH  /api/cards                      -> update {id, front, back} OR
                                             record a review {id, correct: bool}
  DELETE /api/cards?id=123                 -> delete a card

All operations require: Authorization: Bearer <token>. Deck ownership is
verified via a join against decks.user_id on every write, so one user can
never read or modify another user's cards even with a guessed id.
"""

from http.server import BaseHTTPRequestHandler
from ._lib.db import run_query
from ._lib.security import get_bearer_user_id
from ._lib.http_utils import get_query_params, read_json_body, send_json, send_error_json, send_cors_preflight


def _deck_belongs_to_user(deck_id, user_id):
    row = run_query("SELECT id FROM decks WHERE id = %s AND user_id = %s", (deck_id, user_id), fetch="one")
    return row is not None


def _card_belongs_to_user(card_id, user_id):
    row = run_query(
        "SELECT c.id FROM cards c JOIN decks d ON c.deck_id = d.id WHERE c.id = %s AND d.user_id = %s",
        (card_id, user_id), fetch="one"
    )
    return row is not None


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        send_cors_preflight(self)

    def _authed_user(self):
        return get_bearer_user_id(dict(self.headers))

    def do_GET(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        params = get_query_params(self.path)
        deck_id = params.get("deckId")
        if not deck_id or not _deck_belongs_to_user(deck_id, user_id):
            return send_error_json(self, 404, "Deck not found.", "not_found")
        rows = run_query(
            "SELECT id, deck_id, front, back, times_correct, times_wrong, last_reviewed FROM cards WHERE deck_id = %s ORDER BY created_at ASC",
            (deck_id,)
        )
        send_json(self, 200, {"success": True, "cards": rows})

    def do_POST(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        body = read_json_body(self)
        deck_id = body.get("deckId")
        front = (body.get("front") or "").strip()
        back = (body.get("back") or "").strip()
        if not deck_id or not front or not back:
            return send_error_json(self, 400, "deckId, front, and back are required.", "validation_error")
        if not _deck_belongs_to_user(deck_id, user_id):
            return send_error_json(self, 404, "Deck not found.", "not_found")
        new_id = run_query(
            "INSERT INTO cards (deck_id, front, back) VALUES (%s, %s, %s)",
            (deck_id, front, back), fetch="none"
        )
        send_json(self, 201, {"success": True, "card": {"id": new_id, "deckId": deck_id, "front": front, "back": back}})

    def do_PATCH(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        body = read_json_body(self)
        card_id = body.get("id")
        if not card_id or not _card_belongs_to_user(card_id, user_id):
            return send_error_json(self, 404, "Card not found.", "not_found")

        if "correct" in body:
            # Recording a review result from a study session.
            if body["correct"]:
                run_query(
                    "UPDATE cards SET times_correct = times_correct + 1, last_reviewed = NOW() WHERE id = %s",
                    (card_id,), fetch="none"
                )
            else:
                run_query(
                    "UPDATE cards SET times_wrong = times_wrong + 1, last_reviewed = NOW() WHERE id = %s",
                    (card_id,), fetch="none"
                )
            return send_json(self, 200, {"success": True})

        front = (body.get("front") or "").strip()
        back = (body.get("back") or "").strip()
        if not front or not back:
            return send_error_json(self, 400, "front and back are required.", "validation_error")
        run_query("UPDATE cards SET front = %s, back = %s WHERE id = %s", (front, back, card_id), fetch="none")
        send_json(self, 200, {"success": True})

    def do_DELETE(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        params = get_query_params(self.path)
        card_id = params.get("id")
        if not card_id or not _card_belongs_to_user(card_id, user_id):
            return send_error_json(self, 404, "Card not found.", "not_found")
        run_query("DELETE FROM cards WHERE id = %s", (card_id,), fetch="none")
        send_json(self, 200, {"success": True})
