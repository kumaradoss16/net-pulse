'use strict';

/* ================================================================
   NetPulse v4 — Powered by @cloudflare/speedtest (official engine)
   CDN: https://unpkg.com/@cloudflare/speedtest@latest/dist/index.js
   Nearest Cloudflare PoP selected automatically via Anycast.
   ================================================================ */

// ── Quality Score ─────────────────────────────────────────────────────────────
function qualityScore({ download, upload, ping, jitter }) {
  let s = 0;
  s += download >= 200 ? 40 : download >= 100 ? 35 : download >= 50 ? 28 :
       download >= 25  ? 20 : download >= 10  ? 12 : download >= 5  ?  6 : 2;
  s += upload >= 100 ? 25 : upload >= 50 ? 20 : upload >= 20 ? 15 :
       upload >= 10  ? 10 : upload >= 5  ?  6 : 2;
  s += ping <= 5  ? 25 : ping <= 15 ? 22 : ping <= 30 ? 18 :
       ping <= 60 ? 13 : ping <= 100 ?  8 : ping <= 150 ? 4 : 1;
  s += jitter <= 1 ? 10 : jitter <= 3 ? 8 : jitter <= 8 ? 6 :
       jitter <= 15 ? 3 : 0;
  return Math.min(100, Math.round(s));
}
function qualityInfo(score) {
  if (score >= 85) return { label: 'Excellent', color: '#22d3ee' };
  if (score >= 70) return { label: 'Good',      color: '#34d399' };
  if (score >= 50) return { label: 'Fair',      color: '#fbbf24' };
  if (score >= 30) return { label: 'Poor',      color: '#f87171' };
  return               { label: 'Critical',  color: '#ef4444' };
}

const round2 = v => (v != null && isFinite(v)) ? Math.round(v * 100) / 100 : 0;
const bpsToMbps = bps => round2((bps || 0) / 1_000_000);
const sleep     = ms  => new Promise(r => setTimeout(r, ms));

// ── Canvas Gauge → <canvas id="speedo"> ──────────────────────────────────────
const Gauge = (() => {
  let _cur = 0, _tgt = 0;
  const MAX = 1000;

  function draw(v) {
    const canvas = document.getElementById('speedo');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx  = canvas.width / 2;
    const cy  = canvas.height - 20;
    const R   = 110;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, 0, false);
    ctx.lineWidth = 16; ctx.strokeStyle = '#1a1e2a'; ctx.stroke();

    // Value arc
    const angle = Math.PI + Math.min(v / MAX, 1) * Math.PI;
    const grad  = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0, '#818cf8'); grad.addColorStop(0.5, '#38bdf8'); grad.addColorStop(1, '#34d399');
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, angle, false);
    ctx.lineWidth = 16; ctx.strokeStyle = grad; ctx.lineCap = 'round'; ctx.stroke();

    // Ticks
    [0, 100, 200, 300, 500, 750, 1000].forEach(t => {
      const a  = Math.PI + (t / MAX) * Math.PI;
      const x1 = cx + (R - 22) * Math.cos(a), y1 = cy + (R - 22) * Math.sin(a);
      const x2 = cx + (R -  8) * Math.cos(a), y2 = cy + (R -  8) * Math.sin(a);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.lineWidth = 2; ctx.strokeStyle = '#2a2f3f'; ctx.stroke();
    });
  }

  function animate() {
    _cur += (_tgt - _cur) * 0.12;
    draw(_cur);
    const el = document.getElementById('dr-val');
    if (el) el.textContent = _cur.toFixed(1);
    requestAnimationFrame(animate);
  }

  return {
    init()  { requestAnimationFrame(animate); },
    set(v)  { _tgt = v; },
    reset() { _tgt = 0; },
  };
})();

// ── Live Chart → <canvas id="myChart"> ───────────────────────────────────────
const LiveChart = (() => {
  let chart = null;
  const MAX_PTS = 80;

  function init() {
    const ctx = document.getElementById('myChart');
    if (!ctx || !window.Chart) return;
    chart = new Chart(ctx, {
      type: 'line',
      data: { labels: [], datasets: [{
        label: 'Mbps', data: [],
        borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.07)',
        borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true,
      }]},
      options: {
        responsive: true, animation: { duration: 0 },
        scales: {
          x: { display: false },
          y: { beginAtZero: true, grid: { color: '#1a1e2a' }, ticks: { color: '#64748b', maxTicksLimit: 5 } },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
  }

  function push(v) {
    if (!chart) return;
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(v);
    if (chart.data.labels.length > MAX_PTS) {
      chart.data.labels.shift(); chart.data.datasets[0].data.shift();
    }
    chart.update('none');
    const wrap  = document.getElementById('chart-wrap');
    const empty = document.getElementById('chart-empty');
    const badge = document.getElementById('chart-badge');
    if (wrap)  wrap.style.display  = 'block';
    if (empty) empty.style.display = 'none';
    if (badge) badge.textContent   = 'Live';
  }

  function reset() {
    if (!chart) return;
    chart.data.labels = []; chart.data.datasets[0].data = []; chart.update('none');
    const wrap  = document.getElementById('chart-wrap');
    const empty = document.getElementById('chart-empty');
    const badge = document.getElementById('chart-badge');
    if (wrap)  wrap.style.display  = 'none';
    if (empty) empty.style.display = 'block';
    if (badge) badge.textContent   = 'No data';
  }

  return { init, push, reset };
})();

// ── History → <div id="hist-scroll"> ─────────────────────────────────────────
const HIST_KEY = 'netpulse_v4';
const HIST_MAX = 10;

function saveHistory(r) {
  const h = getHistory();
  h.push(r);
  if (h.length > HIST_MAX) h.shift();
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch (_) { return []; }
}
function renderHistory() {
  const container = document.getElementById('hist-scroll');
  if (!container) return;
  const hist = getHistory().slice().reverse();
  if (!hist.length) {
    container.innerHTML = '<div class="hist-empty">No tests recorded</div>';
    return;
  }
  container.innerHTML = hist.map(r => {
    const qi = qualityInfo(r.score || 0);
    return `
      <div class="hist-item" style="padding:10px 0;border-bottom:1px solid #1a1e2a">
        <div style="font-size:0.75rem;color:#64748b;margin-bottom:4px">${r.time} · ${r.server}</div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <span style="color:#34d399;font-weight:700">↓ ${r.download} Mbps</span>
          <span style="color:#818cf8;font-weight:700">↑ ${r.upload} Mbps</span>
          <span style="color:#94a3b8">Ping ${r.ping} ms</span>
          <span style="color:#94a3b8">Jitter ${r.jitter} ms</span>
          <span style="background:${qi.color}22;color:${qi.color};padding:2px 8px;border-radius:6px;font-size:0.78rem;margin-left:auto">
            ${r.score} — ${qi.label}
          </span>
        </div>
      </div>`;
  }).join('');
}
function clearHistory() {
  localStorage.removeItem(HIST_KEY);
  renderHistory();
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $      = id  => document.getElementById(id);
const setVal = (id, v) => { const el = $(id); if (el) el.textContent = v; };

function setStatus(msg, pct) {
  setVal('status', msg);
  const bar   = $('bar');
  const pctEl = $('pct');
  if (bar)   bar.style.width   = `${Math.min(pct ?? 0, 100)}%`;
  if (pctEl) pctEl.textContent = pct != null ? `${Math.round(pct)}%` : '';
}
function setStage(msg)  { setVal('dr-stage', msg); }
function setDot(state)  { const d = $('dot'); if (d) d.className = `status-dot ${state}`; }

function setLoadBar(which, pct) {
  const row   = $(`lb-${which}`);
  const fill  = $(`lb-${which}-fill`);
  const pctEl = $(`lb-${which}-pct`);
  if (row)   row.classList.remove('hidden');
  if (fill)  fill.style.width  = `${Math.min(pct, 100)}%`;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
}
function hideLoadBars() {
  ['dl','ul'].forEach(w => { const r = $(`lb-${w}`); if (r) r.classList.add('hidden'); });
}
function highlightCard(id) {
  ['sc-ping','sc-dl','sc-ul'].forEach(c => { const e = $(c); if (e) e.classList.remove('active'); });
  const el = $(id); if (el) el.classList.add('active');
}

// ── GeoIP ─────────────────────────────────────────────────────────────────────
async function fetchGeoIP() {
  try {
    const badge = $('geo-badge');
    if (badge) badge.textContent = 'Loading…';

    const r = await fetch('/get-geoip', { cache: 'no-store' });
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    setVal('geo-isp',     d.isp);
    setVal('geo-loc',     `${d.city}, ${d.region}`);
    setVal('geo-country', d.country);
    setVal('geo-tz',      d.timezone);
    setVal('geo-host',    d.hostname !== 'N/A' ? d.hostname : '—');
    if (badge) badge.textContent = d.country;

    setVal('conn-ip',      d.ip);
    setVal('conn-server',  'Cloudflare Edge (nearest PoP)');
    setVal('conn-sponsor', 'Cloudflare, Inc.');
    setVal('conn-dist',    '—');
    setVal('conn-host',    d.hostname !== 'N/A' ? d.hostname : '—');
    setVal('conn-coords',  d.loc);

    const ipChip = $('ip-chip');
    if (ipChip) ipChip.textContent = d.ip;
    const sc = $('server-chip');
    if (sc) sc.textContent = '☁ Cloudflare';
    const cb = $('conn-badge');
    if (cb) cb.textContent = d.country;

  } catch (_) {
    try {
      const r2 = await fetch(
        'http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,isp,org,query,lat,lon,timezone',
        { cache: 'no-store' }
      );
      const d2 = await r2.json();
      if (d2.status !== 'success') return;

      setVal('geo-isp',     d2.org || d2.isp);
      setVal('geo-loc',     `${d2.city}, ${d2.regionName}`);
      setVal('geo-country', d2.country);
      setVal('geo-tz',      d2.timezone);
      setVal('geo-host',    '—');
      setVal('conn-ip',     d2.query);
      setVal('conn-server', 'Cloudflare Edge (nearest PoP)');
      setVal('conn-sponsor','Cloudflare, Inc.');
      setVal('conn-dist',   '—');
      setVal('conn-host',   '—');
      setVal('conn-coords', `${d2.lat}, ${d2.lon}`);

      const ipChip = $('ip-chip');
      if (ipChip) ipChip.textContent = d2.query;
      const sc = $('server-chip');
      if (sc) sc.textContent = '☁ Cloudflare';
      const badge = $('geo-badge');
      if (badge) badge.textContent = d2.countryCode;
      const cb = $('conn-badge');
      if (cb) cb.textContent = d2.countryCode;
    } catch (_) {}
  }
}

// ── Cloudflare Speedtest Engine ───────────────────────────────────────────────
// @cloudflare/speedtest is an ES module — must be imported, not loaded as a
// plain <script>. We use a dynamic import() so no build step is needed.
let isRunning = false;
let _engine   = null;
let _SpeedTest = null;  // will hold the imported class

async function loadEngine() {
  if (_SpeedTest) return _SpeedTest;
  setStatus('Loading engine…', 0);
  const mod = await import('https://unpkg.com/@cloudflare/speedtest@1.8.5/dist/speedtest.js');
  _SpeedTest = mod.default;
  if (!_SpeedTest) throw new Error('SpeedTest class not found');
  return _SpeedTest;
}

async function startTest() {
  if (isRunning) return;

  isRunning = true;
  const btn = $('btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  // Reset UI
  Gauge.reset();
  LiveChart.reset();
  hideLoadBars();
  setVal('sv-ping', '--'); setVal('sb-ping', '—');
  setVal('sv-dl',   '--'); setVal('sb-dl',   '—');
  setVal('sv-ul',   '--'); setVal('sb-ul',   '—');
  setStatus('Connecting to nearest server…', 2);
  setStage('Starting');
  setDot('running');

  let lastDl = 0, lastUl = 0, lastPing = 0, lastJitter = 0;

  try {
    const SpeedTestClass = await loadEngine();

    await new Promise((resolve, reject) => {
      if (_engine) { try { _engine.pause(); } catch(_){} _engine = null; }

      _engine = new SpeedTestClass({ autoStart: false });

      _engine.onResultsChange = () => {
        const r = _engine.results;

        const ping   = r.getUnloadedLatency();
        const jitter = r.getUnloadedJitter();
        if (ping   != null) { lastPing   = round2(ping);   setVal('sv-ping', lastPing);   highlightCard('sc-ping'); }
        if (jitter != null) { lastJitter = round2(jitter); setVal('sb-ping', `Jitter ${lastJitter} ms`); }

        const dlBps = r.getDownloadBandwidth();
        if (dlBps != null) {
          const dl = bpsToMbps(dlBps);
          if (dl > 0) {
            lastDl = dl;
            setVal('sv-dl', dl); setVal('sb-dl', `${dl} Mbps`);
            Gauge.set(dl); LiveChart.push(dl);
            highlightCard('sc-dl');
            const pts = r.getDownloadBandwidthPoints() || [];
            setLoadBar('dl', Math.min((pts.length / 14) * 100, 99));
            setStatus(`Download: ${dl} Mbps`, Math.min(20 + pts.length * 3, 65));
            setStage('Download');
          }
        }

        const ulBps = r.getUploadBandwidth();
        if (ulBps != null) {
          const ul = bpsToMbps(ulBps);
          if (ul > 0) {
            lastUl = ul;
            setVal('sv-ul', ul); setVal('sb-ul', `${ul} Mbps`);
            Gauge.set(ul); LiveChart.push(ul);
            highlightCard('sc-ul');
            const pts = r.getUploadBandwidthPoints() || [];
            setLoadBar('ul', Math.min((pts.length / 10) * 100, 99));
            setStatus(`Upload: ${ul} Mbps`, Math.min(65 + pts.length * 3, 97));
            setStage('Upload');
          }
        }
      };

      _engine.onFinish = (results) => {
        const download = bpsToMbps(results.getDownloadBandwidth()) || lastDl;
        const upload   = bpsToMbps(results.getUploadBandwidth())   || lastUl;
        const ping     = round2(results.getUnloadedLatency())      || lastPing;
        const jitter   = round2(results.getUnloadedJitter())       || lastJitter;

        setVal('sv-dl',   download); setVal('sb-dl',   `${download} Mbps`);
        setVal('sv-ul',   upload);   setVal('sb-ul',   `${upload} Mbps`);
        setVal('sv-ping', ping);     setVal('sb-ping', `Jitter ${jitter} ms`);
        setLoadBar('dl', 100); setLoadBar('ul', 100);
        Gauge.set(download);

        const score = qualityScore({ download, upload, ping, jitter });
        const qi    = qualityInfo(score);
        setStatus(`Done — ${download} Mbps ↓  ${upload} Mbps ↑  ${ping} ms`, 100);
        setStage('Complete');
        setDot('done');

        fetchCFPop().then(pop => {
          const serverLabel = pop ? `Cloudflare ${pop} (nearest PoP)` : 'Cloudflare Edge (nearest PoP)';
          setVal('conn-server', serverLabel);
          saveHistory({ download, upload, ping, jitter, score, server: serverLabel, time: new Date().toLocaleTimeString() });
          renderHistory();
        });

        resolve();
      };

      _engine.onError = (err) => reject(new Error(String(err)));

      _engine.play();
    });

  } catch (err) {
    setStatus(`Error: ${err.message}`, 0);
    setStage('Error');
    setDot('error');
  } finally {
    isRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Run Again'; }
  }
}

// ── Cloudflare PoP from /meta ─────────────────────────────────────────────────
async function fetchCFPop() {
  try {
    const r = await fetch('https://speed.cloudflare.com/meta', { cache: 'no-store' });
    const d = await r.json();
    if (d.colo) {
      const city    = d.city    ? `, ${d.city}`    : '';
      const country = d.country ? ` (${d.country})`: '';
      return `${d.colo}${city}${country}`;
    }
    return null;
  } catch (_) { return null; }
}

// ── Chart tab switcher ────────────────────────────────────────────────────────
function switchTab(type, e) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Gauge.init();
  LiveChart.init();
  fetchGeoIP();
  renderHistory();
  // Preload engine silently in background
  loadEngine().catch(() => {});
});
