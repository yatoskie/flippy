"""
FLIPPY API — /api/goals
==========================
  GET    /api/goals?week=YYYY-MM-DD     -> goals for that week (Sunday start)
  POST   /api/goals                       -> create {weekStart, label, target}
  PATCH  /api/goals                        -> {id, progress} or {id, completed}
  DELETE /api/goals?id=123                   -> delete a goal

  GET    /api/goals?studyLog=1               -> returns { studyDates: [...] }
  POST   /api/goals  {logStudyToday: true}     -> logs today in study_log
                                                    (also bumps in-progress
                                                    goals for the current week)

All operations require: Authorization: Bearer <token>
"""

from datetime import date
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
        params = get_query_params(self.path)

        if params.get("studyLog"):
            rows = run_query("SELECT study_date FROM study_log WHERE user_id = %s", (user_id,))
            dates = [r["study_date"].isoformat() for r in rows]
            return send_json(self, 200, {"success": True, "studyDates": dates})

        week = params.get("week")
        if not week:
            return send_error_json(self, 400, "week query parameter (YYYY-MM-DD) is required.", "validation_error")
        rows = run_query(
            "SELECT id, week_start, label, target, progress, completed FROM goals WHERE user_id = %s AND week_start = %s",
            (user_id, week)
        )
        send_json(self, 200, {"success": True, "goals": rows})

    def do_POST(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        body = read_json_body(self)

        if body.get("logStudyToday"):
            today = date.today().isoformat()
            run_query(
                "INSERT IGNORE INTO study_log (user_id, study_date) VALUES (%s, %s)",
                (user_id, today), fetch="none"
            )
            week_start = _week_start(date.today()).isoformat()
            run_query(
                "UPDATE goals SET progress = progress + 1, completed = (progress + 1 >= target) "
                "WHERE user_id = %s AND week_start = %s AND completed = FALSE",
                (user_id, week_start), fetch="none"
            )
            return send_json(self, 200, {"success": True})

        week_start = (body.get("weekStart") or "").strip()
        label = (body.get("label") or "").strip()
        target = int(body.get("target") or 1)
        if not week_start or not label:
            return send_error_json(self, 400, "weekStart and label are required.", "validation_error")
        new_id = run_query(
            "INSERT INTO goals (user_id, week_start, label, target) VALUES (%s, %s, %s, %s)",
            (user_id, week_start, label, target), fetch="none"
        )
        send_json(self, 201, {"success": True, "goal": {"id": new_id, "weekStart": week_start, "label": label, "target": target, "progress": 0, "completed": False}})

    def do_PATCH(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        body = read_json_body(self)
        goal_id = body.get("id")
        if not goal_id:
            return send_error_json(self, 400, "id is required.", "validation_error")
        if "progress" in body:
            run_query(
                "UPDATE goals SET progress = %s, completed = (%s >= target) WHERE id = %s AND user_id = %s",
                (body["progress"], body["progress"], goal_id, user_id), fetch="none"
            )
        if "completed" in body:
            run_query(
                "UPDATE goals SET completed = %s WHERE id = %s AND user_id = %s",
                (bool(body["completed"]), goal_id, user_id), fetch="none"
            )
        send_json(self, 200, {"success": True})

    def do_DELETE(self):
        user_id = self._authed_user()
        if not user_id:
            return send_error_json(self, 401, "Missing or invalid session token.", "unauthorized")
        params = get_query_params(self.path)
        goal_id = params.get("id")
        if not goal_id:
            return send_error_json(self, 400, "id query parameter is required.", "validation_error")
        run_query("DELETE FROM goals WHERE id = %s AND user_id = %s", (goal_id, user_id), fetch="none")
        send_json(self, 200, {"success": True})


def _week_start(d: date) -> date:
    # Sunday-start week, matching the frontend's currentWeekStart().
    from datetime import timedelta
    return d - timedelta(days=(d.weekday() + 1) % 7)
