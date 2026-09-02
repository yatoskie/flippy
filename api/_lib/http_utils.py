"""
FLIPPY API — HTTP helpers
============================
Small shared helpers so every endpoint doesn't re-implement JSON body
parsing, JSON response writing, or query-string parsing.
"""

import json
from urllib.parse import urlparse, parse_qs
from .cors import cors_headers


def get_query_params(path: str) -> dict:
    parsed = urlparse(path)
    flat = {}
    for k, v in parse_qs(parsed.query).items():
        flat[k] = v[0]
    return flat


def read_json_body(handler) -> dict:
    length = int(handler.headers.get("Content-Length", 0) or 0)
    if length == 0:
        return {}
    raw = handler.rfile.read(length)
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}


def read_raw_body(handler) -> str:
    length = int(handler.headers.get("Content-Length", 0) or 0)
    if length == 0:
        return ""
    return handler.rfile.read(length).decode("utf-8")


def send_json(handler, status: int, data):
    body = json.dumps(data).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    for k, v in cors_headers().items():
        handler.send_header(k, v)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def send_xml(handler, status: int, xml_str: str):
    body = xml_str.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/xml; charset=utf-8")
    for k, v in cors_headers().items():
        handler.send_header(k, v)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def send_cors_preflight(handler):
    handler.send_response(204)
    for k, v in cors_headers().items():
        handler.send_header(k, v)
    handler.end_headers()


def send_error_json(handler, status: int, message: str, code: str = "error"):
    send_json(handler, status, {"success": False, "error": {"code": code, "message": message}})
