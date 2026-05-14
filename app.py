import os
import ssl
import json
import time
import math
import threading
import datetime
import urllib.request

from flask import Flask, render_template, Response, jsonify, request
from flask_socketio import SocketIO, emit
import speedtest
import psutil

app = Flask(__name__)
app.config["SECRET_KEY"] = "netpulse-secret-key"

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading",
    logger=False,
    engineio_logger=False,
)

connected_clients = {}

# ── Helpers ────────────────────────────────────────────────

def sanitize_server(server):
    return {k: v.strip() if isinstance(v, str) else v for k, v in server.items()}


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
        st = speedtest.Speedtest(secure=True)
    except Exception:
        st = speedtest.Speedtest()
    for dist_list in st.servers.values():
        for s in dist_list:
            for key in s:
                if isinstance(s[key], str):
                    s[key] = s[key].strip()
    return st


def haversine(lat1, lon1, lat2, lon2):
    """Distance in km between two lat/lon points."""
    R = 6371
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(d_lon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_servers_near(user_lat, user_lon):
    """
    Fetch ALL speedtest.net servers and sort by distance from
    the user's actual lat/lon — not the server machine's location.
    """
    st = get_speedtest_instance()
    st.get_servers()   # loads full server list

    results = []
    for dist_list in st.servers.values():
        for s in dist_list:
            try:
                slat = float(str(s.get("lat", "0")).strip())
                slon = float(str(s.get("lon", "0")).strip())
                dist = haversine(user_lat, user_lon, slat, slon)
            except Exception:
                dist = 9999
            results.append({
                "id":       str(s.get("id",      "")).strip(),
                "name":     str(s.get("name",    "")).strip(),
                "country":  str(s.get("country", "")).strip(),
                "sponsor":  str(s.get("sponsor", "")).strip(),
                "distance": round(dist, 1),
                "host":     str(s.get("host",    "")).strip(),
                "lat":      str(s.get("lat",     "")).strip(),
                "lon":      str(s.get("lon",     "")).strip(),
            })

    results.sort(key=lambda x: x["distance"])
    return results[:12]


def get_system_stats():
    net = psutil.net_io_counters()
    return {
        "cpu":          round(psutil.cpu_percent(interval=None), 1),
        "ram":          round(psutil.virtual_memory().percent, 1),
        "ram_used_gb":  round(psutil.virtual_memory().used  / 1e9, 2),
        "ram_total_gb": round(psutil.virtual_memory().total / 1e9, 2),
        "net_sent_mb":  round(net.bytes_sent / 1e6, 2),
        "net_recv_mb":  round(net.bytes_recv / 1e6, 2),
        "timestamp":    datetime.datetime.now().strftime("%H:%M:%S"),
    }


# ── Background broadcaster ─────────────────────────────────
_broadcast_thread = None
_broadcast_lock   = threading.Lock()

def broadcast_loop():
    prev_net = psutil.net_io_counters()
    while True:
        socketio.sleep(2)
        if not connected_clients:
            continue
        net       = psutil.net_io_counters()
        sent_rate = round((net.bytes_sent - prev_net.bytes_sent) / 2 / 1024, 1)
        recv_rate = round((net.bytes_recv - prev_net.bytes_recv) / 2 / 1024, 1)
        prev_net  = net
        stats     = get_system_stats()
        stats["net_send_rate_kbps"] = sent_rate
        stats["net_recv_rate_kbps"] = recv_rate
        stats["clients"]            = len(connected_clients)
        socketio.emit("live_stats", stats, namespace="/ws")


# ── WebSocket events ───────────────────────────────────────

@socketio.on("connect", namespace="/ws")
def ws_connect():
    global _broadcast_thread
    sid = request.sid
    connected_clients[sid] = {
        "ip":           request.remote_addr,
        "connected_at": datetime.datetime.now().strftime("%H:%M:%S"),
    }
    emit("connected", {
        "sid":     sid,
        "clients": len(connected_clients),
        "message": "WebSocket connected",
        "stats":   get_system_stats(),
    })
    socketio.emit("client_update", {"clients": len(connected_clients)}, namespace="/ws")
    with _broadcast_lock:
        if _broadcast_thread is None or not _broadcast_thread.is_alive():
            _broadcast_thread = socketio.start_background_task(broadcast_loop)


@socketio.on("disconnect", namespace="/ws")
def ws_disconnect():
    connected_clients.pop(request.sid, None)
    socketio.emit("client_update", {"clients": len(connected_clients)}, namespace="/ws")


@socketio.on("ping_check", namespace="/ws")
def ws_ping(data):
    emit("pong_check", {
        "echo":      data,
        "server_ts": datetime.datetime.now().isoformat(),
        "clients":   len(connected_clients),
    })


@socketio.on("request_stats", namespace="/ws")
def ws_request_stats():
    emit("live_stats", get_system_stats())


@socketio.on("start_ws_speedtest", namespace="/ws")
def ws_speedtest(data):
    sid       = request.sid
    server_id = data.get("server_id") if data else None

    def run():
        def push(payload):
            socketio.emit("ws_test_update", payload, room=sid, namespace="/ws")

        push({"stage": "server", "status": "Connecting to server…"})
        try:
            st = get_speedtest_instance()
            if server_id:
                st.get_servers([int(server_id)])
            st.get_best_server()
            st.results.server = sanitize_server(st.results.server)

            server       = st.results.server
            server_label = f"{server.get('name','Unknown')}, {server.get('country','')}"

            push({
                "stage":    "server",
                "status":   "Connected",
                "server":   server_label,
                "sponsor":  server.get("sponsor", ""),
                "host":     server.get("host",    ""),
                "distance": round(server.get("d", 0), 1),
                "country":  server.get("country", ""),
            })
            time.sleep(0.2)

            push({"stage": "ping", "status": "Measuring ping…"})
            ping = round(st.results.ping, 2)
            push({"stage": "ping", "status": "Done", "value": ping})
            time.sleep(0.2)

            push({"stage": "download", "status": "Testing download…"})
            download = round(st.download() / 1_000_000, 2)
            push({"stage": "download", "status": "Done", "value": download})
            time.sleep(0.2)

            push({"stage": "upload", "status": "Testing upload…"})
            upload = round(st.upload() / 1_000_000, 2)
            push({"stage": "upload", "status": "Done", "value": upload})

            push({"stage": "complete", "ping": ping, "download": download, "upload": upload})

        except Exception as e:
            clean_msg = str(e).replace('\t', '').replace('\n', '').strip()
            push({"stage": "error", "message": clean_msg})

    socketio.start_background_task(run)


# ── HTTP Routes ────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/get-ip")
def get_ip():
    return jsonify({"ip": get_public_ip()})


@app.route("/get-geoip")
def get_geoip():
    try:
        with urllib.request.urlopen("https://ipinfo.io/json", timeout=6) as res:
            data = json.loads(res.read().decode())
        return jsonify({
            "ip":       data.get("ip",       "N/A"),
            "isp":      data.get("org",      "N/A"),
            "city":     data.get("city",     "N/A"),
            "region":   data.get("region",   "N/A"),
            "country":  data.get("country",  "N/A"),
            "loc":      data.get("loc",      "N/A"),
            "timezone": data.get("timezone", "N/A"),
            "hostname": data.get("hostname", "N/A"),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/get-servers")
def get_servers():
    """
    Now accepts ?lat=XX&lon=YY from the browser (user's real location via ipinfo.io).
    Falls back to server location if not provided.
    """
    try:
        lat_param = request.args.get("lat")
        lon_param = request.args.get("lon")

        if lat_param and lon_param:
            # ✅ Use USER's real lat/lon to find nearby servers
            user_lat = float(lat_param)
            user_lon = float(lon_param)
        else:
            # Fallback: use server location (old behaviour)
            try:
                with urllib.request.urlopen("https://ipinfo.io/json", timeout=5) as res:
                    geoip = json.loads(res.read().decode())
                loc = geoip.get("loc", "0,0").split(",")
                user_lat, user_lon = float(loc[0]), float(loc[1])
            except Exception:
                user_lat, user_lon = 0.0, 0.0

        servers = get_servers_near(user_lat, user_lon)
        return jsonify({"servers": servers})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/run-speedtest")
def run_speedtest_sse():
    server_id = request.args.get("server_id", None)

    def generate():
        try:
            yield f"data: {json.dumps({'stage': 'server', 'status': 'Connecting to server…'})}\n\n"

            st = get_speedtest_instance()

            if server_id:
                st.get_servers([int(server_id)])

            st.get_best_server()
            st.results.server = sanitize_server(st.results.server)

            server       = st.results.server
            server_label = f"{server.get('name','Unknown')}, {server.get('country','')}"

            yield f"data: {json.dumps({'stage': 'server', 'status': 'Connected', 'server': server_label, 'sponsor': server.get('sponsor',''), 'host': server.get('host',''), 'distance': round(server.get('d',0),1), 'country': server.get('country','')})}\n\n"
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
            yield f"data: {json.dumps({'stage': 'error', 'message': f'Config error: {str(e).strip()}'})}\n\n"
        except speedtest.NoMatchedServers:
            yield f"data: {json.dumps({'stage': 'error', 'message': 'No servers matched. Check firewall or retry.'})}\n\n"
        except speedtest.SpeedtestBestServerFailure:
            yield f"data: {json.dumps({'stage': 'error', 'message': 'Best server lookup failed. Retry.'})}\n\n"
        except ssl.SSLError as e:
            yield f"data: {json.dumps({'stage': 'error', 'message': f'SSL error: {str(e).strip()}'})}\n\n"
        except Exception as e:
            clean_msg = str(e).replace('\t', '').replace('\n', '').strip()
            yield f"data: {json.dumps({'stage': 'error', 'message': clean_msg})}\n\n"

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
