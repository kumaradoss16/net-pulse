from flask import Flask, render_template, Response, jsonify, request
import speedtest
import json
import time
import ssl
import urllib.request
import socketio
import os

app = Flask(__name__)
# Change this line at the top
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",     # no eventlet/gevent needed — works on all Python versions
    logger=False,
    engineio_logger=False,
)

# ── Helpers ──────────────────────────────────────────────

def get_public_ip():
    services = [
        "https://api.ipify.org?format=json",
        "https://api.my-ip.io/ip.json",
        "https://ipinfo.io/json",
    ]
    for url in services:
        try:
            with urllib.request.urlopen(url, timeout=5) as res:
                data = json.loads(res.read().decode())
                ip = data.get("ip") or data.get("query")
                if ip:
                    return ip
        except Exception:
            continue
    return "Unavailable"

def get_speedtest_instance():
    try:
        return speedtest.Speedtest(secure=True)
    except Exception:
        return speedtest.Speedtest()

# ── Routes ───────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/get-ip")
def get_ip():
    ip = get_public_ip()
    return jsonify({"ip": ip})


# ── NEW: GeoIP + ISP lookup ──────────────────────────────
@app.route("/get-geoip")
def get_geoip():
    """
    Returns ISP, org, city, region, country, loc (lat,lon)
    using ipinfo.io (free tier — 50k req/month, no key needed).
    """
    try:
        with urllib.request.urlopen("https://ipinfo.io/json", timeout=6) as res:
            data = json.loads(res.read().decode())
        return jsonify({
            "ip":       data.get("ip",       "N/A"),
            "isp":      data.get("org",       "N/A"),   # e.g. "AS9829 BSNL"
            "city":     data.get("city",      "N/A"),
            "region":   data.get("region",    "N/A"),
            "country":  data.get("country",   "N/A"),
            "loc":      data.get("loc",       "N/A"),   # "12.9716,77.5946"
            "timezone": data.get("timezone",  "N/A"),
            "hostname": data.get("hostname",  "N/A"),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── NEW: List nearby speedtest servers ───────────────────
@app.route("/get-servers")
def get_servers():
    """
    Returns a list of the 10 closest speedtest.net servers
    with id, name, country, sponsor, distance (km), host.
    """
    try:
        st = get_speedtest_instance()
        st.get_servers()          # fetch all servers
        st.get_best_server()      # also sets closest list
        # servers dict is keyed by distance bucket
        flat = []
        for dist_list in st.servers.values():
            for s in dist_list:
                flat.append({
                    "id":       s.get("id", ""),
                    "name":     s.get("name", ""),
                    "country":  s.get("country", ""),
                    "sponsor":  s.get("sponsor", ""),
                    "distance": round(s.get("d", 0), 1),
                    "host":     s.get("host", ""),
                    "lat":      s.get("lat", ""),
                    "lon":      s.get("lon", ""),
                })
        # sort by distance, return top 10
        flat.sort(key=lambda x: x["distance"])
        return jsonify({"servers": flat[:10]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── NEW: Run speedtest against a specific server id ──────
@app.route("/run-speedtest")
def run_speedtest():
    server_id = request.args.get("server_id", None)   # optional ?server_id=1234

    def generate():
        try:
            yield f"data: {json.dumps({'stage': 'server', 'status': 'Connecting to server…'})}\n\n"

            st = get_speedtest_instance()

            if server_id:
                # Use user-chosen server
                st.get_servers([int(server_id)])
                st.get_best_server()
            else:
                st.get_best_server()

            server      = st.results.server
            server_label = f"{server.get('name','Unknown')}, {server.get('country','')}"
            server_info  = {
                "stage":    "server",
                "status":   "Connected",
                "server":   server_label,
                "sponsor":  server.get("sponsor", ""),
                "host":     server.get("host", ""),
                "distance": round(server.get("d", 0), 1),
                "country":  server.get("country", ""),
            }
            yield f"data: {json.dumps(server_info)}\n\n"
            time.sleep(0.3)

            yield f"data: {json.dumps({'stage': 'ping', 'status': 'Measuring ping…'})}\n\n"
            ping = round(st.results.ping, 2)
            yield f"data: {json.dumps({'stage': 'ping', 'status': 'Done', 'value': ping})}\n\n"
            time.sleep(0.3)

            yield f"data: {json.dumps({'stage': 'download', 'status': 'Testing download…'})}\n\n"
            download = round(st.download() / 1_000_000, 2)
            yield f"data: {json.dumps({'stage': 'download', 'status': 'Done', 'value': download})}\n\n"
            time.sleep(0.3)

            yield f"data: {json.dumps({'stage': 'upload', 'status': 'Testing upload…'})}\n\n"
            upload = round(st.upload() / 1_000_000, 2)
            yield f"data: {json.dumps({'stage': 'upload', 'status': 'Done', 'value': upload})}\n\n"

            yield f"data: {json.dumps({'stage': 'complete', 'ping': ping, 'download': download, 'upload': upload})}\n\n"

        except speedtest.ConfigRetrievalError as e:
            yield f"data: {json.dumps({'stage': 'error', 'message': f'Config error: {str(e)}'})}\n\n"
        except speedtest.NoMatchedServers:
            yield f"data: {json.dumps({'stage': 'error', 'message': 'No servers matched. Check firewall or retry.'})}\n\n"
        except speedtest.SpeedtestBestServerFailure:
            yield f"data: {json.dumps({'stage': 'error', 'message': 'Best server lookup failed. Retry.'})}\n\n"
        except ssl.SSLError as e:
            yield f"data: {json.dumps({'stage': 'error', 'message': f'SSL error: {str(e)}'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'message': str(e)})}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control":               "no-cache",
            "X-Accel-Buffering":           "no",
            "Access-Control-Allow-Origin": "*",
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    socketio.run(app, host="0.0.0.0", debug=False, port=port, allow_unsafe_werkzeug=True)
