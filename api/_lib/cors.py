"""
FLIPPY API — CORS helper
===========================
Every endpoint calls add_cors_headers() before sending a response, and
handles OPTIONS preflight the same way. Allowed origin is configurable via
the ALLOWED_ORIGIN env var so the GitHub Pages URL can be locked down
in production instead of left wide open.
"""

import os

def cors_headers():
    origin = os.environ.get("ALLOWED_ORIGIN", "*")
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, SOAPAction",
        "Access-Control-Max-Age": "86400",
    }
