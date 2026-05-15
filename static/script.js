document.addEventListener("DOMContentLoaded", () => {
    const menuToggle = document.querySelector(".menu-toggle");
    const navLinks = document.querySelector(".nav-links");

    menuToggle.addEventListener("click", () => {
        navLinks.classList.toggle("active");
        const icon = menuToggle.querySelector("i");
        if (navLinks.classList.contains("active")) {
            icon.classList.remove("fa-bars");
            icon.classList.add("fa-times");
        } else {
            icon.classList.remove("fa-times");
            icon.classList.add("fa-bars");
        }
    });

    (function () {
        const el = document.getElementById("brand");
        const text = el.dataset.text || "DevSpireHub";
        let i = 0;
        let isDeleting = false;

        const typeSpeed = 100;    // typing speed (ms)
        const deleteSpeed = 50;   // deleting speed (ms)
        const pauseTime = 2000;   // pause at end before deleting (ms)
        const restartPause = 500; // pause before restarting (ms)

        function typeLoop() {
            const currentText = text.slice(0, i);
            el.textContent = currentText;

            if (!isDeleting && i < text.length) {
                // Typing forward
                i++;
                setTimeout(typeLoop, typeSpeed);
            } else if (!isDeleting && i === text.length) {
                // Finished typing, pause then start deleting
                isDeleting = true;
                setTimeout(typeLoop, pauseTime);
            } else if (isDeleting && i > 0) {
                // Deleting
                i--;
                setTimeout(typeLoop, deleteSpeed);
            } else if (isDeleting && i === 0) {
                // Finished deleting, restart
                isDeleting = false;
                setTimeout(typeLoop, restartPause);
            }
        }

        typeLoop();
    })();
});

/* ══════════════════════════════════════════════════════
    SPEEDOMETER
══════════════════════════════════════════════════════ */
const C = document.getElementById("speedo"), ctx = C.getContext("2d");
const W = C.width, H = C.height, CX = W / 2, CY = H / 2, MAX = 200;
const R_OUT = 120, R_IN = 97, R_T = 90, R_L = 77, R_G1 = 92, R_G2 = 80;
const SEG = 120, GAP = 0.018;
const A0 = (210 * Math.PI) / 180, AR = (300 * Math.PI) / 180;
const vA = v => A0 + (Math.min(Math.max(v, 0), MAX) / MAX) * AR;

function sCol(i, n, lit) {
    const t = i / n; let r, g, b;
    if (t < 0.33) { const p = t / 0.33; r = Math.round(248 + (34 - 248) * p); g = Math.round(113 + (211 - 113) * p); b = Math.round(113 + (238 - 113) * p); }
    else if (t < 0.66) { const p = (t - 0.33) / 0.33; r = Math.round(34 + (129 - 34) * p); g = Math.round(211 + (140 - 211) * p); b = Math.round(238 + (248 - 238) * p); }
    else { const p = (t - 0.66) / 0.34; r = Math.round(129 + (52 - 129) * p); g = Math.round(140 + (211 - 140) * p); b = Math.round(248 + (153 - 248) * p); }
    return `rgba(${r},${g},${b},${lit ? 0.9 : 0.07})`;
}
const SEGS = Array.from({ length: SEG }, (_, i) => ({ a0: A0 + (i / SEG) * AR, a1: A0 + (i / SEG) * AR + (AR / SEG) - GAP }));
const TICKS = [0, 50, 100, 150, 200].map(v => { const a = vA(v), ca = Math.cos(a), sa = Math.sin(a); return { v, ox: CX + R_T * ca, oy: CY + R_T * sa, ix: CX + (R_T - 9) * ca, iy: CY + (R_T - 9) * sa, lx: CX + R_L * ca, ly: CY + R_L * sa }; });

function draw(val) {
    ctx.clearRect(0, 0, W, H);
    const lit = Math.round((val / MAX) * SEG);
    SEGS.forEach(({ a0, a1 }, i) => { ctx.beginPath(); ctx.arc(CX, CY, R_OUT, a0, a1); ctx.arc(CX, CY, R_IN, a1, a0, true); ctx.closePath(); ctx.fillStyle = sCol(i, SEG, i < lit); ctx.fill(); });
    const f = ctx.createRadialGradient(CX, CY, 0, CX, CY, R_IN); f.addColorStop(0, "#141414"); f.addColorStop(1, "#0e0e0e");
    ctx.beginPath(); ctx.arc(CX, CY, R_IN - 2, 0, Math.PI * 2); ctx.fillStyle = f; ctx.fill();
    if (val > 1) {
        const ga = vA(val);
        ctx.save(); ctx.shadowBlur = 16; ctx.shadowColor = "#22d3ee"; ctx.beginPath(); ctx.arc(CX, CY, R_G1, A0, ga); ctx.strokeStyle = "#22d3ee18"; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
        ctx.save(); ctx.shadowBlur = 8; ctx.shadowColor = "#818cf8"; ctx.beginPath(); ctx.arc(CX, CY, R_G2, A0, ga); ctx.strokeStyle = "#818cf815"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    }
    TICKS.forEach(({ ox, oy, ix, iy, lx, ly, v }) => { ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ix, iy); ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.stroke(); ctx.font = "600 8px Inter,Segoe UI,sans-serif"; ctx.fillStyle = "#3f3f46"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(v, lx, ly); });
    const na = vA(val), nt = R_IN - 7, ntl = 18, p2 = na + Math.PI / 2;
    const tx = CX + nt * Math.cos(na), ty = CY + nt * Math.sin(na), bx = CX - ntl * Math.cos(na), by = CY - ntl * Math.sin(na);
    const p1x = CX + 4 * Math.cos(p2), p1y = CY + 4 * Math.sin(p2), p2x = CX - 4 * Math.cos(p2), p2y = CY - 4 * Math.sin(p2);
    ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = "#22d3ee"; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p1x, p1y); ctx.lineTo(bx, by); ctx.lineTo(p2x, p2y); ctx.closePath();
    const ng = ctx.createLinearGradient(bx, by, tx, ty); ng.addColorStop(0, "#111111"); ng.addColorStop(0.5, "#22d3ee"); ng.addColorStop(1, "#e0f9ff"); ctx.fillStyle = ng; ctx.fill(); ctx.restore();
    const pg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 12); pg.addColorStop(0, "#ffffff14"); pg.addColorStop(0.35, "#22d3ee"); pg.addColorStop(0.7, "#0c3a4a"); pg.addColorStop(1, "#0a0a0a");
    ctx.beginPath(); ctx.arc(CX, CY, 12, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
    ctx.beginPath(); ctx.arc(CX, CY, 12, 0, Math.PI * 2); ctx.strokeStyle = "#22d3ee20"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(CX, CY, 2.5, 0, Math.PI * 2); ctx.fillStyle = "#22d3ee"; ctx.fill();
    document.getElementById("dr-val").textContent = Math.round(val);
}

/* Needle physics */
const C2 = { k: .045, f: .78, wk: .032, wf: .82, wa: .14, wa2: .04, wn: .025, wq: .038, wr: .30, ev: .018, ep: .04 };
let pos = 0, vel = 0, tgt = 0, md = "idle", wc = 0, wcl = 0, ph = 0, raf = null;
function tick() {
    if (md === "wobble") { if (wc < wcl) wc = Math.min(wc + C2.wr, wcl); ph += C2.wq; const o = Math.sin(ph) * wc * C2.wa + Math.sin(ph * 2.3) * wc * C2.wa2 + (Math.random() - .5) * wc * C2.wn; vel += (Math.max(0, wc + o) - pos) * C2.wk; vel *= C2.wf; }
    else { vel += (tgt - pos) * C2.k; vel *= C2.f; if (Math.abs(vel) < C2.ev && Math.abs(tgt - pos) < C2.ep) { pos = tgt; vel = 0; draw(pos); raf = null; return; } }
    pos = Math.max(0, pos + vel); draw(pos); raf = requestAnimationFrame(tick);
}
const loop = () => { if (!raf) raf = requestAnimationFrame(tick); };
const nSet = (v) => { md = "spring"; tgt = Math.min(v, MAX); loop(); };
const nWob = (c) => { md = "wobble"; wcl = Math.min(c, MAX); wc = pos; ph = 0; vel *= 0.4; loop(); };
const nRst = () => { md = "spring"; tgt = 0; loop(); };
draw(0);

/* ══ Loading bars ══ */
let lbInt = null;
function showLB(t) {
    const row = document.getElementById(`lb-${t}`), fill = document.getElementById(`lb-${t}-fill`), pct = document.getElementById(`lb-${t}-pct`);
    row.classList.remove("hidden"); fill.style.width = "0%"; pct.textContent = "0%"; pct.className = "lb-pct active";
    let p = 0; clearInterval(lbInt);
    lbInt = setInterval(() => { const s = Math.max(0.3, (92 - p) * 0.025); p = Math.min(p + s, 92); fill.style.width = p + "%"; pct.textContent = Math.round(p) + "%"; if (p >= 92) clearInterval(lbInt); }, 80);
}
function doneLB(t) {
    clearInterval(lbInt);
    const fill = document.getElementById(`lb-${t}-fill`), pct = document.getElementById(`lb-${t}-pct`);
    fill.style.transition = "width .5s ease"; fill.style.width = "100%"; pct.textContent = "100%"; pct.className = "lb-pct";
    setTimeout(() => { document.getElementById(`lb-${t}`).classList.add("hidden"); fill.style.transition = ""; fill.style.width = "0%"; }, 900);
}
function hideAllLB() {
    clearInterval(lbInt);
    ["dl", "ul"].forEach(t => { document.getElementById(`lb-${t}`).classList.add("hidden"); document.getElementById(`lb-${t}-fill`).style.width = "0%"; document.getElementById(`lb-${t}-pct`).textContent = "0%"; });
}

/* ══ GeoIP ══ */
async function fetchGeoIP() {
    const badge = document.getElementById("geo-badge"); badge.textContent = "Loading";
    ["geo-isp", "geo-loc", "geo-country", "geo-tz", "geo-host"].forEach(id => { const el = document.getElementById(id); el.textContent = "—"; el.className = "geo-val loading"; });
    try {
        // Step 1: Get the real client IP directly from ipinfo.io in the browser.
        // This avoids the server returning its own (Render hosting) IP instead of yours.
        const ipRes = await fetch("https://ipinfo.io/json");
        const ipData = await ipRes.json();
        const realIp = ipData.ip;

        // Step 2: Pass the real IP to our backend so it queries ipinfo.io for the right address.
        const res = await fetch(`/get-geoip?ip=${encodeURIComponent(realIp)}`), d = await res.json();
        if (d.error) throw new Error(d.error);
        const isp = d.isp.replace(/^AS\d+\s+/, "");
        function set(id, v) { const el = document.getElementById(id); el.textContent = v || "—"; el.className = "geo-val"; }
        set("geo-isp", isp); set("geo-loc", d.city); set("geo-country", `${d.country} — ${d.region}`); set("geo-tz", d.timezone); set("geo-host", d.hostname !== "N/A" ? d.hostname : d.ip);
        badge.textContent = "Live";
        document.getElementById("conn-ip").textContent = realIp || "—";
        document.getElementById("conn-ip").classList.add("hi");
        const chip = document.getElementById("ip-chip"); chip.textContent = realIp; chip.className = "chip live";

        // Also pass loc to server selector for accurate nearby servers
        if (ipData.loc) {
            const [lat, lon] = ipData.loc.split(",");
            window._userLat = parseFloat(lat);
            window._userLon = parseFloat(lon);
        }
    } catch {
        badge.textContent = "Error";
        ["geo-isp", "geo-loc", "geo-country", "geo-tz", "geo-host"].forEach(id => { const el = document.getElementById(id); el.textContent = "Unavailable"; });
    }
}

/* ══ Server selection (auto — no UI selector) ══ */
let selSrvId = null;

/* ══════════════════════════════════════════════════════
   WiFi vs Wired Detector + Signal Quality
══════════════════════════════════════════════════════ */

function detectConnectionQuality() {
    const nc = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    // --- DOM refs ---
    const badge       = document.getElementById("conn-type-badge");
    const typeName    = document.getElementById("conn-type-name");
    const typeSub     = document.getElementById("conn-type-sub");
    const typeIco     = document.getElementById("conn-type-ico");
    const ringFg      = document.getElementById("ring-fg");
    const ringLabel   = document.getElementById("ring-label");
    const sigEtype    = document.getElementById("sig-etype");
    const sigDownlink = document.getElementById("sig-downlink");
    const sigRtt      = document.getElementById("sig-rtt");
    const sigSavedata = document.getElementById("sig-savedata");
    const qualFill    = document.getElementById("sig-quality-fill");
    const qualPct     = document.getElementById("sig-quality-pct");
    const qualDesc    = document.getElementById("sig-quality-desc");

    if (!nc) {
        badge.textContent     = "Unsupported";
        typeName.textContent  = "API Unavailable";
        typeSub.textContent   = "navigator.connection not supported in this browser";
        typeIco.className     = "fas fa-question-circle";
        sigEtype.textContent  = "N/A";
        sigDownlink.textContent = "N/A";
        sigRtt.textContent    = "N/A";
        sigSavedata.textContent = "N/A";
        qualDesc.textContent  = "Try Chrome or Edge for full Network Information API support.";
        return;
    }

    /* ── Connection type classification ── */
    const type      = (nc.type         || "").toLowerCase();        // wifi / ethernet / cellular / none / other
    const etype     = (nc.effectiveType || "").toLowerCase();       // slow-2g / 2g / 3g / 4g
    const downlink  = nc.downlink  ?? null;   // Mbps hint (float)
    const rtt       = nc.rtt       ?? null;   // ms
    const saveData  = nc.saveData  ?? false;

    /* Classify to a friendly type */
    let connLabel, iconClass, colorClass, typeDetail;
    if (type === "ethernet") {
        connLabel  = "Wired (Ethernet)";
        iconClass  = "fas fa-network-wired";
        colorClass = "conn-wired";
        typeDetail = "Stable, low-latency wired connection";
    } else if (type === "wifi") {
        connLabel  = "WiFi";
        iconClass  = "fas fa-wifi";
        colorClass = "conn-wifi";
        typeDetail = "Wireless LAN connection";
    } else if (type === "cellular") {
        const cLabel = etype === "4g" ? "4G/LTE" : etype === "3g" ? "3G" : etype === "2g" ? "2G" : etype === "slow-2g" ? "Slow 2G" : "Cellular";
        connLabel  = `Cellular (${cLabel})`;
        iconClass  = "fas fa-signal";
        colorClass = "conn-cellular";
        typeDetail = "Mobile network connection";
    } else if (type === "none") {
        connLabel  = "Offline";
        iconClass  = "fas fa-times-circle";
        colorClass = "conn-offline";
        typeDetail = "No network detected";
    } else {
        /* API supported but type not exposed — infer from etype */
        if (etype === "4g") {
            connLabel  = downlink > 50 ? "Wired / Fast WiFi" : "WiFi / 4G";
            iconClass  = downlink > 50 ? "fas fa-network-wired" : "fas fa-wifi";
            colorClass = "conn-wifi";
            typeDetail = "High-speed connection detected";
        } else {
            connLabel  = "Unknown";
            iconClass  = "fas fa-globe";
            colorClass = "";
            typeDetail = `Effective type: ${etype || "unknown"}`;
        }
    }

    /* ── Signal quality score 0–100 ── */
    let score = 0;
    if (etype === "4g")      score += 50;
    else if (etype === "3g") score += 30;
    else if (etype === "2g") score += 15;
    else if (etype === "slow-2g") score += 5;
    else                     score += 50;   // unknown = assume decent

    if (downlink !== null) {
        if      (downlink >= 100) score += 50;
        else if (downlink >= 50)  score += 40;
        else if (downlink >= 20)  score += 30;
        else if (downlink >= 5)   score += 20;
        else if (downlink >= 1)   score += 10;
        else                      score +=  5;
    } else { score += 25; }  // unknown → neutral

    if (rtt !== null) {
        if      (rtt <= 20)  score = Math.min(score, 100);
        else if (rtt <= 50)  score = Math.min(score * 0.95, 100);
        else if (rtt <= 100) score = Math.min(score * 0.85, 100);
        else if (rtt <= 200) score *= 0.70;
        else                 score *= 0.50;
    }

    if (saveData) score *= 0.75;
    if (type === "none") score = 0;

    score = Math.min(100, Math.round(score));

    /* ── Quality label ── */
    let qualLabel, qualDescText, qualFillColor;
    if (score >= 80)      { qualLabel = "Excellent"; qualDescText = "Great connection — speed test should run smoothly.";          qualFillColor = "#22d3ee"; }
    else if (score >= 60) { qualLabel = "Good";      qualDescText = "Solid connection — expect reliable results.";                qualFillColor = "#34d399"; }
    else if (score >= 40) { qualLabel = "Fair";      qualDescText = "Moderate connection — results may vary slightly.";           qualFillColor = "#fbbf24"; }
    else if (score >= 20) { qualLabel = "Poor";      qualDescText = "Weak signal — speed test results may be inconsistent.";     qualFillColor = "#f87171"; }
    else                  { qualLabel = "Critical";  qualDescText = "Very poor or no connection — testing may fail.";            qualFillColor = "#ef4444"; }

    /* ── Render ── */
    badge.textContent         = qualLabel;
    typeName.textContent      = connLabel;
    typeSub.textContent       = typeDetail;
    typeIco.className         = iconClass;
    document.getElementById("conn-type-hero").className = `conn-type-hero ${colorClass}`;

    sigEtype.textContent      = etype    ? etype.toUpperCase()             : "N/A";
    sigDownlink.textContent   = downlink !== null ? `${downlink} Mbps`     : "N/A";
    sigRtt.textContent        = rtt      !== null ? `${rtt} ms`            : "N/A";
    sigSavedata.textContent   = saveData ? "Enabled ⚡" : "Off";
    sigSavedata.style.color   = saveData ? "#fbbf24" : "";

    qualFill.style.background = qualFillColor;
    qualFill.style.width      = score + "%";
    qualPct.textContent       = score + "%";
    qualDesc.textContent      = qualDescText;

    /* Ring arc: circumference = 2πr ≈ 113 for r=18 */
    const offset = 113 - (score / 100) * 113;
    ringFg.style.stroke           = qualFillColor;
    ringFg.style.strokeDashoffset = offset;
    ringLabel.textContent         = score;
    ringLabel.style.color         = qualFillColor;

    /* Live update on change */
    nc.onchange = detectConnectionQuality;
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/* ══ Public IP ══ */
(async function () {
    try {
        // Fetch IP directly in the browser — avoids returning the Render server's IP
        const res = await fetch("https://ipinfo.io/json"), d = await res.json();
        const chip = document.getElementById("ip-chip");
        if (d.ip) { chip.textContent = d.ip; chip.className = "chip live"; }
        else { chip.textContent = "Unavailable"; chip.className = "chip error"; }
    } catch { document.getElementById("ip-chip").textContent = "Unavailable"; }
})();

/* ══ Chart ══ */
let chartInst = null, curTab = "bar";
function switchTab(tab, e) {
    curTab = tab;
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    e.target.classList.add("active"); renderChart();
}
function renderChart() {
    const h = loadHist();
    const empty = document.getElementById("chart-empty"), wrap = document.getElementById("chart-wrap"), canvas = document.getElementById("myChart"), badge = document.getElementById("chart-badge");
    if (!h.length) { empty.style.display = "flex"; wrap.style.display = "none"; badge.textContent = "No data"; if (chartInst) { chartInst.destroy(); chartInst = null; } return; }
    empty.style.display = "none"; wrap.style.display = "block"; badge.textContent = `${h.length} run${h.length > 1 ? "s" : ""}`;
    const labels = h.map((_, i) => `#${i + 1}`);
    const opts = {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: {
            legend: { position: "bottom", labels: { color: "#52525b", font: { size: 10, family: "Inter,Segoe UI,sans-serif" }, boxWidth: 8, padding: 12 } },
            tooltip: { backgroundColor: "#111111", borderColor: "#222222", borderWidth: 1, titleColor: "#71717a", bodyColor: "#e4e4e7", padding: 10, titleFont: { size: 10 }, bodyFont: { size: 11, weight: "bold" } }
        },
        scales: {
            x: { ticks: { color: "#3f3f46", font: { size: 9 } }, grid: { color: "#1c1c1c" }, border: { color: "#222222" } },
            y: { ticks: { color: "#3f3f46", font: { size: 9 } }, grid: { color: "#1c1c1c" }, border: { color: "#222222" }, beginAtZero: true }
        }
    };
    const dl = h.map(r => r.download), ul = h.map(r => r.upload), pg = h.map(r => r.ping);
    let ds;
    if (curTab === "bar") {
        ds = [
            { label: "Download", data: dl, backgroundColor: "#22d3ee18", borderColor: "#22d3ee", borderWidth: 1.5, borderRadius: 4 },
            { label: "Upload", data: ul, backgroundColor: "#818cf818", borderColor: "#818cf8", borderWidth: 1.5, borderRadius: 4 },
            { label: "Ping", data: pg, backgroundColor: "#34d39918", borderColor: "#34d399", borderWidth: 1.5, borderRadius: 4 }];
    } else {
        ds = [
            { label: "Download", data: dl, borderColor: "#22d3ee", backgroundColor: "#22d3ee0a", borderWidth: 1.5, pointBackgroundColor: "#22d3ee", pointRadius: 3, tension: 0.4, fill: true },
            { label: "Upload", data: ul, borderColor: "#818cf8", backgroundColor: "#818cf80a", borderWidth: 1.5, pointBackgroundColor: "#818cf8", pointRadius: 3, tension: 0.4, fill: true },
            { label: "Ping", data: pg, borderColor: "#34d399", backgroundColor: "#34d3990a", borderWidth: 1.5, pointBackgroundColor: "#34d399", pointRadius: 3, tension: 0.4, fill: true }];
    }
    if (chartInst) { chartInst.destroy(); chartInst = null; }
    chartInst = new Chart(canvas, { type: curTab === "bar" ? "bar" : "line", data: { labels, datasets: ds }, options: opts });
}

/* ══ History ══ */
const SK = "netpulse_v2", MX = 10;
function loadHist() { try { return JSON.parse(localStorage.getItem(SK)) || []; } catch { return []; } }
function saveResult(r) { const h = loadHist(); h.push(r); if (h.length > MX) h.shift(); localStorage.setItem(SK, JSON.stringify(h)); }
function clearHistory() { localStorage.removeItem(SK); renderHist(); renderChart(); }
function rating(dl) { if (dl >= 100) return { t: "Excellent", c: "excellent" }; if (dl >= 50) return { t: "Good", c: "good" }; if (dl >= 20) return { t: "Fair", c: "fair" }; return { t: "Poor", c: "poor" }; }
function renderHist() {
    const h = loadHist(), body = document.getElementById("hist-scroll");
    if (!h.length) { body.innerHTML = `<div class="hist-empty">No tests recorded</div>`; return; }
    body.innerHTML = h.slice().reverse().map((r, i) => {
        const n = h.length - i; const rt = rating(r.download); return `
<div class="hist-item">
<span class="hist-index">${n}</span>
<div class="hist-bar"></div>
<div class="hist-content">
<div class="hist-time">${r.time}${r.server ? " · " + r.server : ""}</div>
<div class="hist-vals">
    <span class="hv dl"><b>${r.download}</b> Mbps</span>
    <span class="hv ul"><b>${r.upload}</b> Mbps</span>
    <span class="hv pg"><b>${r.ping}</b> ms</span>
</div>
</div>
<span class="hist-badge ${rt.c}">${rt.t}</span>
</div>`;
    }).join("");
}

/* ══ Speed Test SSE ══ */
const PROG = { server: 8, ping: 24, download: 62, upload: 88, complete: 100 };
function setBar(p) { document.getElementById("bar").style.width = p + "%"; document.getElementById("pct").textContent = p + "%"; }
function setStatus(html, raw = false) { const el = document.getElementById("status"); raw ? (el.innerHTML = html) : (el.textContent = html); }
function setStage(t, live = false) { const el = document.getElementById("dr-stage"); el.textContent = t; el.className = "dr-stage" + (live ? " live" : ""); }
function setSC(id, val, cls, badge) { document.getElementById(`sv-${id}`).textContent = val; document.getElementById(`sc-${id}`).className = `stat-card ${cls}`; document.getElementById(`sb-${id}`).textContent = badge; }
function setDot(a) { document.getElementById("dot").className = "status-dot" + (a ? " active" : ""); }

function resetUI() {
    setSC("ping", "--", "", "—"); setSC("dl", "--", "", "—"); setSC("ul", "--", "", "—");
    hideAllLB(); nRst(); setBar(0); setStatus("Ready"); setStage("Idle"); setDot(false);
    document.getElementById("server-chip").textContent = "";
}

function startTest() {
    const btn = document.getElementById("btn");
    btn.disabled = true; btn.textContent = "Testing…";
    resetUI(); setDot(true);
    const url = selSrvId ? `/run-speedtest?server_id=${selSrvId}` : "/run-speedtest";
    const es = new EventSource(url);
    es.onmessage = ({ data }) => {
        const d = JSON.parse(data);
        if (PROG[d.stage]) setBar(PROG[d.stage]);
        switch (d.stage) {
            case "server":
                setStage("Connecting", true); setStatus(`<span class="spin"></span>${d.status}`, true);
                if (d.server) {
                    document.getElementById("server-chip").textContent = d.server; setStatus("Connected"); setStage("Server OK");
                    document.getElementById("conn-server").textContent = d.server || "—";
                    document.getElementById("conn-sponsor").textContent = d.sponsor || "—";
                    document.getElementById("conn-host").textContent = d.host || "—";
                    document.getElementById("conn-dist").textContent = d.distance ? d.distance + " km" : "—";
                    document.getElementById("conn-badge").textContent = d.country || "";
                    ["conn-server", "conn-sponsor", "conn-host", "conn-dist"].forEach(id => document.getElementById(id).classList.add("hi"));
                } break;
            case "ping":
                setSC("ping", "…", "active", "Testing"); setStage("Ping", true); setStatus(`<span class="spin"></span>Measuring ping…`, true);
                if (d.value != null) { setSC("ping", d.value, "done", "Done"); setStatus(`Ping: ${d.value} ms`); setStage(`${d.value} ms`); }
                break;
            case "download":
                setSC("dl", "…", "active", "Testing"); setStage("Download", true); setStatus(`<span class="spin"></span>Testing download…`, true);
                showLB("dl"); nWob(90);
                if (d.value != null) { doneLB("dl"); nSet(d.value); setSC("dl", d.value, "done", "Done"); setStatus(`Download: ${d.value} Mbps`); setStage(`${d.value} Mbps`); }
                break;
            case "upload":
                setSC("ul", "…", "active", "Testing"); setStage("Upload", true); setStatus(`<span class="spin"></span>Testing upload…`, true);
                showLB("ul"); nWob(42);
                if (d.value != null) { doneLB("ul"); nSet(d.value); setSC("ul", d.value, "done", "Done"); setStatus(`Upload: ${d.value} Mbps`); setStage(`${d.value} Mbps`); }
                break;
            case "complete":
                hideAllLB(); setStage("Complete"); setStatus(`Done — ${d.download} Mbps down, ${d.upload} Mbps up, ${d.ping} ms`);
                setDot(false); btn.disabled = false; btn.textContent = "Run Again"; es.close();
                const now = new Date();
                const ts = now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) + " " + now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
                const srv = document.getElementById("conn-server").textContent;
                saveResult({ download: d.download, upload: d.upload, ping: d.ping, time: ts, server: srv !== "—" ? srv : "" });
                renderHist(); renderChart();
                break;
            case "error":
                hideAllLB(); nRst(); setStage("Error"); setStatus(d.message); setDot(false); btn.disabled = false; btn.textContent = "Start Test"; es.close(); break;
        }
    };
    es.onerror = () => { hideAllLB(); nRst(); setDot(false); setStatus("Connection error — check Flask on port 8080"); setStage("Error"); btn.disabled = false; btn.textContent = "Start Test"; es.close(); };
}

/* Init */
renderHist();
renderChart();
fetchGeoIP();
detectConnectionQuality();
