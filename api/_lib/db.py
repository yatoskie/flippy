"""
FLIPPY API — Database connection
==================================
THE single source of DB connection config. Every endpoint imports
get_connection() from here — nothing else in the codebase opens a
connection directly.

Reads credentials from environment variables only (never hardcoded):
  DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

Locally these come from a .env file (see .env.example at the repo root).
On Vercel they're set in Project Settings → Environment Variables.
On Hostinger (or any future host) they're set the same way in that
platform's env var config. The variable NAMES never change — only the
values do — which is what makes the Vercel → Hostinger move a config
change, not a code change.
"""

import os
import pymysql
from pymysql.cursors import DictCursor

def get_connection():
    """Returns a new PyMySQL connection using DictCursor (rows as dicts)."""
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "flippy"),
        cursorclass=DictCursor,
        autocommit=True,
        connect_timeout=8,
    )


def run_query(sql, params=None, fetch="all"):
    """
    Convenience helper for a single parameterized query.
    fetch: "all" | "one" | "none" (for INSERT/UPDATE/DELETE)
    ALWAYS pass params as a tuple/list for parameterized (safe) queries —
    never format `sql` with user input directly.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            if fetch == "one":
                return cur.fetchone()
            if fetch == "none":
                return cur.lastrowid
            return cur.fetchall()
    finally:
        conn.close()
