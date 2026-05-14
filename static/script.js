document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks   = document.querySelector(".nav-links");
  menuToggle.addEventListener("click", () => {
    navLinks.classList.toggle("active");
    const icon = menuToggle.querySelector("i");
    if (navLinks.classList.contains("active")) {
      icon.classList.remove("fa-bars"); icon.classList.add("fa-times");
    } else {
      icon.classList.remove("fa-times"); icon.classList.add("fa-bars");
    }
  });

  (function () {
    const el = document.getElementById("brand");
    const text = el.dataset.text || "DevSpireHub";
    let i = 0, isDeleting = false;
    const typeSpeed = 100, deleteSpeed = 50, pauseTime = 2000, restartPause = 500;
    function typeLoop() {
      el.textContent = text.slice(0, i);
      if (!isDeleting && i < text.length)       { i++;  setTimeout(typeLoop, typeSpeed);     }
      else if (!isDeleting && i === text.length) { isDeleting = true; setTimeout(typeLoop, pauseTime); }
      else if (isDeleting && i > 0)              { i--;  setTimeout(typeLoop, deleteSpeed);   }
      else                                       { isDeleting = false; setTimeout(typeLoop, restartPause); }
    }
    typeLoop();
  })();
});

/* ══════════════════════════════════════════════════════
   SPEEDOMETER
══════════════════════════════════════════════════════ */
const C   = document.getElementById("speedo"), ctx = C.getContext("2d");
const W   = C.width, H = C.height, CX = W / 2, CY = H / 2, MAX = 200;
const R_OUT = 120, R_IN = 97, R_T = 90, R_L = 77, R_G1 = 92, R_G2 = 80;
const SEG = 120, GAP = 0.018;
const A0  = (210 * Math.PI) / 180, AR = (300 * Math.PI) / 180;
const vA  = v => A0 + (Math.min(Math.max(v, 0), MAX) / MAX) * AR;

function sCol(i, n, lit) {
  const t = i / n; let r, g, b;
  if (t < 0.33) {
    const p = t / 0.33;
    r = Math.round(248 + (34  - 248) * p); g = Math.round(113 + (211 - 113) * p); b = Math.round(113 + (238 - 113) * p);
  } else if (t < 0.66) {
    const p = (t - 0.33) / 0.33;
    r = Math.round(34  + (129 - 34)  * p); g = Math.round(211 + (140 - 211) * p); b = Math.round(238 + (248 - 238) * p);
  } else {
    const p = (t - 0.66) / 0.34;
    r = Math.round(129 + (52  - 129) * p); g = Math.round(140 + (211 - 140) * p); b = Math.round(248 + (153 - 248) * p);
  }
  return `rgba(${r},${g},${b},${lit ? 0.9 : 0.07})`;
}

const SEGS  = Array.from({ length: SEG }, (_, i) => ({
  a0: A0 + (i / SEG) * AR,
  a1: A0 + (i / SEG) * AR + (AR / SEG) - GAP
}));
const TICKS = [0, 50, 100, 150, 200].map(v => {
  const a = vA(v), ca = Math.cos(a), sa = Math.sin(a);
  return { v, ox: CX + R_T * ca, oy: CY + R_T * sa,
               ix: CX + (R_T - 9) * ca, iy: CY + (R_T - 9) * sa,
               lx: CX + R_L * ca, ly: CY + R_L * sa };
});

function draw(val) {
  ctx.clearRect(0, 0, W, H);
  const lit = Math.round((val / MAX) * SEG);
  SEGS.forEach(({ a0, a1 }, i) => {
    ctx.beginPath(); ctx.arc(CX, CY, R_OUT, a0, a1); ctx.arc(CX, CY, R_IN, a1, a0, true);
    ctx.closePath(); ctx.fillStyle = sCol(i, SEG, i < lit); ctx.fill();
  });

  const f = ctx.createRadialGradient(CX, CY, 0, CX, CY, R_IN);
  f.addColorStop(0, "#141414"); f.addColorStop(1, "#0e0e0e");
  ctx.beginPath(); ctx.arc(CX, CY, R_IN - 2, 0, Math.PI * 2);
  ctx.fillStyle = f; ctx.fill();

  if (val > 1) {
    const ga = vA(val);
    ctx.save(); ctx.shadowBlur = 16; ctx.shadowColor = "#22d3ee";
    ctx.beginPath(); ctx.arc(CX, CY, R_G1, A0, ga);
    ctx.strokeStyle = "#22d3ee18"; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    ctx.save(); ctx.shadowBlur = 8; ctx.shadowColor = "#818cf8";
    ctx.beginPath(); ctx.arc(CX, CY, R_G2, A0, ga);
    ctx.strokeStyle = "#818cf815"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }

  TICKS.forEach(({ ox, oy, ix, iy, lx, ly, v }) => {
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ix, iy);
    ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.stroke();
    ctx.font = "600 8px Inter,Segoe UI,sans-serif"; ctx.fillStyle = "#3f3f46";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(v, lx, ly);
  });

  const na = vA(val), nt = R_IN - 7, ntl = 18, p2 = na + Math.PI / 2;
  const tx = CX + nt  * Math.cos(na), ty = CY + nt  * Math.sin(na);
  const bx = CX - ntl * Math.cos(na), by = CY - ntl * Math.sin(na);
  const p1x = CX + 4 * Math.cos(p2),  p1y = CY + 4 * Math.sin(p2);
  const p2x = CX - 4 * Math.cos(p2),  p2y = CY - 4 * Math.sin(p2);
  ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = "#22d3ee";
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(p1x, p1y);
  ctx.lineTo(bx, by); ctx.lineTo(p2x, p2y); ctx.closePath();
  const ng = ctx.createLinearGradient(bx, by, tx, ty);
  ng.addColorStop(0, "#111111"); ng.addColorStop(0.5, "#22d3ee"); ng.addColorStop(1, "#e0f9ff");
  ctx.fillStyle = ng; ctx.fill(); ctx.restore();

  const pg = ctx.createRadialGradient(CX, CY, 0, CX, CY, 12);
  pg.addColorStop(0, "#ffffff14"); pg.addColorStop(0.35, "#22d3ee");
  pg.addColorStop(0.7, "#0c3a4a"); pg.addColorStop(1, "#0a0a0a");
  ctx.beginPath(); ctx.arc(CX, CY, 12, 0, Math.PI * 2); ctx.fillStyle = pg; ctx.fill();
  ctx.beginPath(); ctx.arc(CX, CY, 12, 0, Math.PI * 2);
  ctx.strokeStyle = "#22d3ee20"; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.arc(CX, CY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "#22d3ee"; ctx.fill();

  const drVal = document.getElementById("dr-val");
  if (drVal) drVal.textContent = Math.round(val);
}

/* ── Needle physics ─────────────────────────────────────────────────────────── */
const C2 = { k:.045, f:.78, wk:.032, wf:.82, wa:.14, wa2:.04, wn:.025, wq:.038, wr:.30, ev:.018, ep:.04 };
let pos = 0, vel = 0, tgt = 0, md = "idle", wc = 0, wcl = 0, ph = 0, raf = null;

function tick() {
  if (md === "wobble") {
    if (wc < wcl) wc = Math.min(wc + C2.wr, wcl);
    ph += C2.wq;
    const o = Math.sin(ph) * wc * C2.wa + Math.sin(ph * 2.3) * wc * C2.wa2 + (Math.random() - .5) * wc * C2.wn;
    vel += (Math.max(0, wc + o) - pos) * C2.wk;
    vel *= C2.wf;
  } else {
    vel += (tgt - pos) * C2.k;
    vel *= C2.f;
    if (Math.abs(vel) < C2.ev && Math.abs(tgt - pos) < C2.ep) {
      pos = tgt; vel = 0; draw(pos); raf = null; return;
    }
  }
  pos = Math.max(0, pos + vel);
  draw(pos);
  raf = requestAnimationFrame(tick);
}
const loop  = () => { if (!raf) raf = requestAnimationFrame(tick); };
const nSet  = (v) => { md = "spring"; tgt = Math.min(v, MAX); loop(); };
const nWob  = (c) => { md = "wobble"; wcl = Math.min(c, MAX); wc = pos; ph = 0; vel *= 0.4; loop(); };
const nRst  = ()  => { md = "spring"; tgt = 0; loop(); };

/* ── Progressive needle sweep during active download / upload phases ── */
let _sweepInterval = null;

function startNeedleSweep(targetEstimate, durationMs) {
  stopNeedleSweep();
  const startVal = pos;
  const endVal   = Math.min(targetEstimate, MAX);
  const steps    = Math.ceil(durationMs / 80);
  let   step     = 0;

  _sweepInterval = setInterval(() => {
    step++;
    const t      = step / steps;
    const eased  = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const sweepVal = startVal + (endVal - startVal) * eased;
    const jitter = (Math.random() - 0.5) * 3;
    nSet(Math.max(0, Math.min(sweepVal + jitter, MAX)));
    if (step >= steps) stopNeedleSweep();
  }, 80);
}

function stopNeedleSweep() {
  if (_sweepInterval) { clearInterval(_sweepInterval); _sweepInterval = null; }
}

/* ── Loading bars ─────────────────────────────────────────────────────────── */
let lbInt = null;

function showLB(t) {
  const row  = document.getElementById(`lb-${t}`);
  const fill = document.getElementById(`lb-${t}-fill`);
  const pct  = document.getElementById(`lb-${t}-pct`);
  row.classList.remove("hidden");
  fill.style.width  = "0%";
  pct.textContent   = "0%";
  pct.className     = "lb-pct active";
  let p = 0;
  clearInterval(lbInt);
  lbInt = setInterval(() => {
    const s = Math.max(0.3, (92 - p) * 0.025);
    p = Math.min(p + s, 92);
    fill.style.width    = p + "%";
    pct.textContent     = Math.round(p) + "%";
    if (p >= 92) clearInterval(lbInt);
  }, 80);
}

function doneLB(t) {
  clearInterval(lbInt);
  const fill = document.getElementById(`lb-${t}-fill`);
  const pct  = document.getElementById(`lb-${t}-pct`);
  fill.style.transition = "width .5s ease";
  fill.style.width      = "100%";
  pct.textContent       = "100%";
  pct.className         = "lb-pct";
  setTimeout(() => {
    document.getElementById(`lb-${t}`).classList.add("hidden");
    fill.style.transition = "";
    fill.style.width      = "0%";
  }, 900);
}

function hideAllLB() {
  clearInterval(lbInt);
  ["dl", "ul"].forEach(t => {
    document.getElementById(`lb-${t}`).classList.add("hidden");
    document.getElementById(`lb-${t}-fill`).style.width = "0%";
    document.getElementById(`lb-${t}-pct`).textContent  = "0%";
  });
}

let _userLat = null, _userLon = null;

/* ── GeoIP ─────────────────────────────────────────────────────────────────── */
async function fetchGeoIP() {
  const badge = document.getElementById("geo-badge");
  badge.textContent = "Loading";
  ["geo-isp","geo-loc","geo-country","geo-tz","geo-host"].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = "—"; el.className = "geo-val loading";
  });
  try {
    const res = await fetch("https://ipinfo.io/json"), d = await res.json();
    if (d.error) throw new Error(d.error);

    if (d.loc) {
      const parts = d.loc.split(",");
      _userLat = parseFloat(parts[0]);
      _userLon = parseFloat(parts[1]);
    }

    const isp = (d.org || "").replace(/^AS\d+\s+/, "");
    function set(id, v) {
      const el = document.getElementById(id);
      el.textContent = v || "—"; el.className = "geo-val";
    }
    set("geo-isp",     isp);
    set("geo-loc",     d.city);
    set("geo-country", `${d.country} — ${d.region}`);
    set("geo-tz",      d.timezone);
    set("geo-host",    d.hostname || d.ip);
    badge.textContent = "Live";

    document.getElementById("conn-ip").textContent = d.ip || "—";
    document.getElementById("conn-ip").classList.add("hi");
    const chip = document.getElementById("ip-chip");
    chip.textContent = d.ip; chip.className = "chip live";

    if (_userLat !== null && _userLon !== null) fetchServers();

  } catch {
    badge.textContent = "Error";
    ["geo-isp","geo-loc","geo-country","geo-tz","geo-host"].forEach(id => {
      document.getElementById(id).textContent = "Unavailable";
    });
  }
}

/* ── Server selection ──────────────────────────────────────────────────────── */
let selSrvId = null;

function selectAuto() {
  selSrvId = null;
  document.querySelectorAll(".srv-row").forEach(e => e.classList.remove("active"));
  document.getElementById("srv-mode-lbl").textContent = "Auto";
  document.getElementById("srv-dropdown").value = "";
}

async function fetchServers(retryCount = 0) {
  const btn  = document.getElementById("srv-fetch-btn");
  const list = document.getElementById("srv-list");
  const dd   = document.getElementById("srv-dropdown");

  let lat = _userLat, lon = _userLon;

  if ((lat === null || lon === null) && retryCount < 5) {
    list.innerHTML = `<div class="srv-placeholder">Waiting for location… (${retryCount + 1}/5)</div>`;
    setTimeout(() => fetchServers(retryCount + 1), 600);
    return;
  }

  if (lat === null || lon === null) {
    try {
      const geoRes  = await fetch("https://ipinfo.io/json");
      const geoData = await geoRes.json();
      if (geoData.loc) {
        const parts = geoData.loc.split(",");
        lat = _userLat = parseFloat(parts[0]);
        lon = _userLon = parseFloat(parts[1]);
      }
    } catch {}
  }

  if (lat === null || lon === null) {
    list.innerHTML = `<div class="srv-placeholder srv-error">Unable to detect location — please retry</div>`;
    btn.disabled   = false;
    btn.textContent = "Fetch Nearby Servers";
    return;
  }

  btn.disabled    = true;
  btn.textContent = "Loading…";
  list.innerHTML  = `<div class="srv-placeholder">Fetching nearby servers…</div>`;

  try {
    const res = await fetch(`/get-servers?lat=${lat}&lon=${lon}`);
    const d   = await res.json();
    if (d.error) throw new Error(d.error);

    const srvs = d.servers;
    list.innerHTML = srvs.map(s => `
      <div class="srv-row" onclick="pickSrv('${s.id}','${esc(s.name)}','${esc(s.country)}',this)">
        <span class="srv-name">${esc(s.name)}, ${esc(s.country)}</span>
        <span class="srv-sponsor">${esc(s.sponsor)}</span>
        <span class="srv-dist">${s.distance} km</span>
      </div>`).join("");

    dd.innerHTML = `<option value="">Auto — Best Server</option>` +
      srvs.map(s => `<option value="${s.id}">${esc(s.name)}, ${esc(s.country)} (${s.distance} km)</option>`).join("");

  } catch (e) {
    list.innerHTML = `<div class="srv-placeholder srv-error">${e.message}</div>`;
  } finally {
    btn.disabled    = false;
    btn.textContent = "Fetch Nearby Servers";
  }
}

function pickSrv(id, name, country, el) {
  selSrvId = id;
  document.querySelectorAll(".srv-row").forEach(e => e.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("srv-mode-lbl").textContent = `${name}, ${country}`;
  document.getElementById("srv-dropdown").value = id;
}

document.getElementById("srv-dropdown").addEventListener("change", function () {
  selSrvId = this.value || null;
  document.querySelectorAll(".srv-row").forEach(e => e.classList.remove("active"));
  if (selSrvId) {
    const match = [...document.querySelectorAll(".srv-row")]
      .find(e => e.onclick && e.getAttribute("onclick") && e.getAttribute("onclick").includes(`'${selSrvId}'`));
    if (match) match.classList.add("active");
    document.getElementById("srv-mode-lbl").textContent = this.options[this.selectedIndex].text;
  } else {
    document.getElementById("srv-mode-lbl").textContent = "Auto";
  }
});

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

(async function () {
  try {
    const res = await fetch("https://ipinfo.io/json");
    const d   = await res.json();
    if (d.loc && _userLat === null) {
      const parts = d.loc.split(",");
      _userLat = parseFloat(parts[0]);
      _userLon = parseFloat(parts[1]);
    }
    const chip = document.getElementById("ip-chip");
    if (d.ip && d.ip !== "Unavailable") {
      chip.textContent = d.ip; chip.className = "chip live";
    } else {
      chip.textContent = "Unavailable"; chip.className = "chip error";
    }
  } catch {
    document.getElementById("ip-chip").textContent = "Unavailable";
  }
})();

/* ── Chart ─────────────────────────────────────────────────────────────────── */
let chartInst = null, curTab = "bar";

function switchTab(tab, e) {
  curTab = tab;
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  e.target.classList.add("active");
  renderChart();
}

function renderChart() {
  const h     = loadHist();
  const empty = document.getElementById("chart-empty");
  const wrap  = document.getElementById("chart-wrap");
  const canvas = document.getElementById("myChart");
  const badge = document.getElementById("chart-badge");
  if (!h.length) {
    empty.style.display = "flex"; wrap.style.display = "none";
    badge.textContent = "No data";
    if (chartInst) { chartInst.destroy(); chartInst = null; }
    return;
  }
  empty.style.display = "none"; wrap.style.display = "block";
  badge.textContent = `${h.length} run${h.length > 1 ? "s" : ""}`;
  const labels = h.map((_, i) => `#${i + 1}`);
  const opts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 400 },
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
      { label: "Upload",   data: ul, backgroundColor: "#818cf818", borderColor: "#818cf8", borderWidth: 1.5, borderRadius: 4 },
      { label: "Ping",     data: pg, backgroundColor: "#34d39918", borderColor: "#34d399", borderWidth: 1.5, borderRadius: 4 }
    ];
  } else {
    ds = [
      { label: "Download", data: dl, borderColor: "#22d3ee", backgroundColor: "#22d3ee0a", borderWidth: 1.5, pointBackgroundColor: "#22d3ee", pointRadius: 3, tension: 0.4, fill: true },
      { label: "Upload",   data: ul, borderColor: "#818cf8", backgroundColor: "#818cf80a", borderWidth: 1.5, pointBackgroundColor: "#818cf8", pointRadius: 3, tension: 0.4, fill: true },
      { label: "Ping",     data: pg, borderColor: "#34d399", backgroundColor: "#34d3990a", borderWidth: 1.5, pointBackgroundColor: "#34d399", pointRadius: 3, tension: 0.4, fill: true }
    ];
  }
  if (chartInst) { chartInst.destroy(); chartInst = null; }
  chartInst = new Chart(canvas, { type: curTab === "bar" ? "bar" : "line", data: { labels, datasets: ds }, options: opts });
}

/* ── History ────────────────────────────────────────────────────────────────── */
const SK = "netpulse_v2", MX = 10;
function loadHist()  { try { return JSON.parse(localStorage.getItem(SK)) || []; } catch { return []; } }
function saveResult(r) { const h = loadHist(); h.push(r); if (h.length > MX) h.shift(); localStorage.setItem(SK, JSON.stringify(h)); }
function clearHistory() { localStorage.removeItem(SK); renderHist(); renderChart(); }
function rating(dl) {
  if (dl >= 100) return { t: "Excellent", c: "excellent" };
  if (dl >=  50) return { t: "Good",      c: "good"      };
  if (dl >=  20) return { t: "Fair",      c: "fair"      };
  return { t: "Poor", c: "poor" };
}
function renderHist() {
  const h = loadHist(), body = document.getElementById("hist-scroll");
  if (!h.length) { body.innerHTML = `<div class="hist-empty">No tests recorded</div>`; return; }
  body.innerHTML = h.slice().reverse().map((r, i) => {
    const n  = h.length - i;
    const rt = rating(r.download);
    return `<div class="hist-row">
      <span class="hist-n">${n}</span>
      <span class="hist-meta">${r.time}${r.server ? " · " + r.server : ""}</span>
      <span class="hist-vals"><b>${r.download}</b> Mbps &nbsp;<b>${r.upload}</b> Mbps &nbsp;<b>${r.ping}</b> ms</span>
      <span class="hist-badge ${rt.c}">${rt.t}</span>
    </div>`;
  }).join("");
}

/* ── Speed Test SSE ─────────────────────────────────────────────────────────── */
const PROG = { server: 8, ping: 24, download: 62, upload: 88, complete: 100 };

function setBar(p)             { document.getElementById("bar").style.width = p + "%"; document.getElementById("pct").textContent = p + "%"; }
function setStatus(html, raw=false) { const el = document.getElementById("status"); raw ? (el.innerHTML = html) : (el.textContent = html); }
function setStage(t, live=false)    { const el = document.getElementById("dr-stage"); el.textContent = t; el.className = "dr-stage" + (live ? " live" : ""); }
function setSC(id, val, cls, badge) {
  document.getElementById(`sv-${id}`).textContent = val;
  document.getElementById(`sc-${id}`).className   = `stat-card ${cls}`;
  document.getElementById(`sb-${id}`).textContent = badge;
}
function setDot(a) { document.getElementById("dot").className = "status-dot" + (a ? " active" : ""); }

function resetUI() {
  setSC("ping","--","","—"); setSC("dl","--","","—"); setSC("ul","--","","—");
  hideAllLB(); stopNeedleSweep(); nRst(); setBar(0);
  setStatus("Ready"); setStage("Idle"); setDot(false);
  document.getElementById("server-chip").textContent = "";
}

function startTest() {
  const btn = document.getElementById("btn");
  const dd  = document.getElementById("srv-dropdown");
  if (dd.value) selSrvId = dd.value;
  btn.disabled    = true;
  btn.textContent = "Testing…";
  resetUI();
  setDot(true);

  const url = selSrvId ? `/run-speedtest?server_id=${selSrvId}` : "/run-speedtest";
  const es  = new EventSource(url);

  es.onmessage = ({ data }) => {
    const d = JSON.parse(data);
    if (PROG[d.stage]) setBar(PROG[d.stage]);

    switch (d.stage) {

      case "server":
        setStage("Connecting", true);
        setStatus(`${d.status}`, true);
        if (d.server) {
          document.getElementById("server-chip").textContent = d.server;
          setStatus("Connected");
          setStage("Server OK");
          document.getElementById("conn-server").textContent  = d.server   || "—";
          document.getElementById("conn-sponsor").textContent = d.sponsor  || "—";
          document.getElementById("conn-host").textContent    = d.host     || "—";
          document.getElementById("conn-dist").textContent    = d.distance ? d.distance + " km" : "—";
          document.getElementById("conn-badge").textContent   = d.country  || "";
          ["conn-server","conn-sponsor","conn-host","conn-dist"].forEach(id =>
            document.getElementById(id).classList.add("hi"));
        }
        break;

      case "ping":
        setSC("ping", "…", "active", "Testing");
        setStage("Ping", true);
        setStatus(`Measuring ping…`, true);
        if (d.value != null) {
          setSC("ping", d.value, "done", "Done");
          setStatus(`Ping: ${d.value} ms`);
          setStage(`${d.value} ms`);
        }
        break;

      case "download":
        setSC("dl", "…", "active", "Testing");
        setStage("Download", true);
        setStatus(`Testing download…`, true);
        showLB("dl");
        if (d.value == null) {
          startNeedleSweep(80, 12000);
        } else {
          stopNeedleSweep();
          doneLB("dl");
          nSet(d.value);
          setSC("dl", d.value, "done", "Done");
          setStatus(`Download: ${d.value} Mbps`);
          setStage(`${d.value} Mbps`);
        }
        break;

      case "upload":
        setSC("ul", "…", "active", "Testing");
        setStage("Upload", true);
        setStatus(`Testing upload…`, true);
        showLB("ul");
        if (d.value == null) {
          startNeedleSweep(40, 12000);
        } else {
          stopNeedleSweep();
          doneLB("ul");
          nSet(d.value);
          setSC("ul", d.value, "done", "Done");
          setStatus(`Upload: ${d.value} Mbps`);
          setStage(`${d.value} Mbps`);
        }
        break;

      case "complete":
        stopNeedleSweep();
        hideAllLB();
        setStage("Complete");
        setStatus(`Done — ${d.download} Mbps down, ${d.upload} Mbps up, ${d.ping} ms`);
        setDot(false);
        btn.disabled    = false;
        btn.textContent = "Run Again";
        es.close();
        const now = new Date();
        const ts  = now.toLocaleDateString("en-IN", { day:"2-digit", month:"short" })
                  + " " + now.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
        const srv = document.getElementById("conn-server").textContent;
        saveResult({ download: d.download, upload: d.upload, ping: d.ping, time: ts,
                     server: srv !== "—" ? srv : "" });
        renderHist(); renderChart();
        break;

      case "error":
        stopNeedleSweep();
        hideAllLB();
        nRst();
        setStage("Error");
        setStatus(d.message);
        setDot(false);
        btn.disabled    = false;
        btn.textContent = "Start Test";
        es.close();
        break;
    }
  };

  es.onerror = () => {
    stopNeedleSweep();
    hideAllLB(); nRst(); setDot(false);
    setStatus("Connection error — retry");
    setStage("Error");
    btn.disabled    = false;
    btn.textContent = "Start Test";
    es.close();
  };
}

/* ── Init ───────────────────────────────────────────────────────────────────── */
renderHist();
renderChart();
fetchGeoIP();
draw(0);
