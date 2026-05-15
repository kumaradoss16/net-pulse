import os
import json
import time
import urllib.request
from collections import defaultdict
from functools import wraps

from flask import Flask, jsonify, request, render_template

app = Flask(__name__)

# ── Rate Limiter (in-memory, per IP) ─────────────────────────────────────────
_rate_store = defaultdict(list)

def rate_limit(limit=30, window=60):
    def decorator(f):
        @wraps(f)
        def wrapped(*args, **kwargs):
            ip  = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
            now = time.time()
            _rate_store[ip] = [t for t in _rate_store[ip] if now - t < window]
            if len(_rate_store[ip]) >= limit:
                return jsonify({"error": "Rate limit exceeded"}), 429
            _rate_store[ip].append(now)
            return f(*args, **kwargs)
        return wrapped
    return decorator


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/config")
def config():
    """Return CDN endpoint config to the browser. Never proxy test bytes."""
    return jsonify({
        "servers": [
            {
                "id":    "cf-auto",
                "label": "Cloudflare Edge (Auto-nearest PoP)",
                "ping":  "https://speed.cloudflare.com/__down?bytes=0",
                "down":  "https://speed.cloudflare.com/__down?bytes=",
                "up":    "https://speed.cloudflare.com/__up",
            }
        ],
        "test": {
            "dl_streams":  6,
            "ul_streams":  4,
            "dl_mb":       25,
            "ul_mb":       4,
            "duration_ms": 12000,
        }
    })


@app.route("/get-ip")
def get_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.remote_addr or "Unavailable")
    return jsonify({"ip": ip})


@app.route("/get-geoip")
@rate_limit(limit=30, window=60)
def get_geoip():
    client_ip = request.args.get("ip", "").strip()
    if not client_ip:
        forwarded = request.headers.get("X-Forwarded-For", "")
        client_ip = forwarded.split(",")[0].strip() if forwarded else ""
    try:
        url = f"https://ipinfo.io/{client_ip}/json" if client_ip else "https://ipinfo.io/json"
        with urllib.request.urlopen(url, timeout=6) as res:
            data = json.loads(res.read().decode())
        lat, lon = map(float, data.get("loc", "0,0").split(","))
        return jsonify({
            "ip":       data.get("ip",       "N/A"),
            "isp":      data.get("org",      "N/A"),
            "city":     data.get("city",     "N/A"),
            "region":   data.get("region",   "N/A"),
            "country":  data.get("country",  "N/A"),
            "loc":      data.get("loc",      "0,0"),
            "lat":      lat,
            "lon":      lon,
            "timezone": data.get("timezone", "N/A"),
            "hostname": data.get("hostname", "N/A"),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
