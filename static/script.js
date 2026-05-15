'use strict';

// ── Math Utilities ───────────────────────────────────────────────────────────
const avg    = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const round2 = v   => Math.round(v * 100) / 100;
const sleep  = ms  => new Promise(r => setTimeout(r, ms));
const stddev = arr => {
  const m = avg(arr);
  return Math.sqrt(avg(arr.map(v => (v - m) ** 2)));
};

// ── CDN Server (Cloudflare Anycast → nearest PoP automatically) ──────────────
const SERVER = {
  label: "Cloudflare Edge (nearest PoP)",
  ping:  "https://speed.cloudflare.com/__down?bytes=0",
  down:  "https://speed.cloudflare.com/__down?bytes=",
  up:    "https://speed.cloudflare.com/__up",
};

const CFG = {
  PING_ROUNDS:    5,
  PROBE_TIMEOUT:  3000,
  WARMUP_STREAMS: 2,
  WARMUP_BYTES:   2  * 1024 * 1024,
  DL_STREAMS:     6,
  DL_BYTES:       25 * 1024 * 1024,
  DL_DURATION:    12000,
  UL_STREAMS:     4,
  UL_BYTES:       4  * 1024 * 1024,
  UL_DURATION:    10000,
  ROLLING_MS:     600,
  EMA_ALPHA:      0.3,
  STAGGER_MS:     80,
};

// ── Rolling Window + EMA ─────────────────────────────────────────────────────
function makeWindow() {
  const buf = [];
  let ema = 0;
  return {
    reset() { buf.length = 0; ema = 0; },
    push(bytes) {
      const now = performance.now();
      buf.push({ t: now, b: bytes });
      const cutoff = now - CFG.ROLLING_MS;
      let i = 0;
      while (i < buf.length && buf[i].t < cutoff) i++;
      if (i) buf.splice(0, i);
    },
    mbps() {
      if (buf.length < 2) return 0;
      const total = buf.reduce((s, e) => s + e.b, 0);
      const span  = (buf[buf.length - 1].t - buf[0].t) / 1000 || 0.001;
      const raw   = (total * 8) / (span * 1_000_000);
      ema = CFG.EMA_ALPHA * raw + (1 - CFG.EMA_ALPHA) * ema;
      return round2(ema);
    },
  };
}

// ── Ping + Jitter ────────────────────────────────────────────────────────────
async function measurePing() {
  const samples = [];
  for (let i = 0; i < CFG.PING_ROUNDS; i++) {
    const ac  = new AbortController();
    const tid = setTimeout(() => ac.abort(), CFG.PROBE_TIMEOUT);
    const t0  = performance.now();
    try {
      await fetch(`${SERVER.ping}&t=${Date.now()}`, { cache: 'no-store', signal: ac.signal });
      samples.push(performance.now() - t0);
    } catch (_) {
      samples.push(CFG.PROBE_TIMEOUT);
    } finally {
      clearTimeout(tid);
    }
    await sleep(100);
  }
  samples.sort((a, b) => a - b);
  const trimmed = samples.slice(1, -1);
  return { ping: round2(avg(trimmed)), jitter: round2(stddev(trimmed)) };
}

// ── Stream Helper ────────────────────────────────────────────────────────────
async function streamBytes(url, signal, onChunk) {
  try {
    const resp = await fetch(url, {
      cache:   'no-store',
      signal,
      headers: { 'Cache-Control': 'no-store, no-cache' },
    });
    if (!resp.ok || !resp.body) return;
    const reader = resp.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      onChunk(value.byteLength);
    }
  } catch (_) {}
}

// ── Download Engine ──────────────────────────────────────────────────────────
async function measureDownload(onTick) {
  // Warmup
  const wCtrl = Array.from({ length: CFG.WARMUP_STREAMS }, () => new AbortController());
  await Promise.allSettled(
    wCtrl.map((ac, i) =>
      sleep(i * CFG.STAGGER_MS).then(() =>
        streamBytes(
          `${SERVER.down}${CFG.WARMUP_BYTES}&r=${Date.now()}-${Math.random()}`,
          ac.signal, () => {}
        )
      )
    )
  );

  // Main
  const win       = makeWindow();
  const startTime = performance.now();
  const deadline  = startTime + CFG.DL_DURATION;
  let   total     = 0;
  const ctrl      = Array.from({ length: CFG.DL_STREAMS }, () => new AbortController());

  await Promise.allSettled(
    ctrl.map((ac, i) =>
      sleep(i * CFG.STAGGER_MS).then(() =>
        streamBytes(
          `${SERVER.down}${CFG.DL_BYTES}&r=${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ac.signal,
          (bytes) => {
            total += bytes;
            win.push(bytes);
            onTick(win.mbps());
            if (performance.now() >= deadline)
              ctrl.forEach(c => { try { c.abort(); } catch(_){} });
          }
        )
      )
    )
  );

  const elapsed = (performance.now() - startTime) / 1000;
  return round2((total * 8) / (elapsed * 1_000_000));
}

// ── Upload Engine ────────────────────────────────────────────────────────────
async function measureUpload(onTick) {
  const win       = makeWindow();
  const startTime = performance.now();
  const deadline  = startTime + CFG.UL_DURATION;
  let   total     = 0;
  const payload   = crypto.getRandomValues(new Uint8Array(CFG.UL_BYTES));
  const ctrl      = Array.from({ length: CFG.UL_STREAMS }, () => new AbortController());

  await Promise.allSettled(
    ctrl.map((ac, i) =>
      sleep(i * 100).then(async () => {
        while (performance.now() < deadline) {
          try {
            await fetch(SERVER.up, {
              method:  'POST',
              body:    payload,
              signal:  ac.signal,
              cache:   'no-store',
              headers: {
                'Content-Type':  'application/octet-stream',
                'Cache-Control': 'no-store',
                'X-Bust':        Date.now().toString(),
              },
            });
            total += CFG.UL_BYTES;
            win.push(CFG.UL_BYTES);
            onTick(win.mbps());
          } catch (_) { break; }
        }
      })
    )
  );

  ctrl.forEach(c => { try { c.abort(); } catch(_){} });
  const elapsed = (performance.now() - startTime) / 1000;
  return round2((total * 8) / (elapsed * 1_000_000));
}

// ── Outlier Filter ────────────────────────────────────────────────────────────
function filteredAvg(samples) {
  if (samples.length < 3) return round2(avg(samples));
  const m  = avg(samples);
  const sd = stddev(samples);
  if (sd === 0) return round2(m);
  const clean = samples.filter(v => Math.abs((v - m) / sd) < 2.5);
  return round2(avg(clean.length ? clean : samples));
}

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

// ── Speedometer Canvas ────────────────────────────────────────────────────────
// Targets your existing <canvas id="speedo"> in index.html
const Gauge = (() => {
  let _current = 0;
  let _target  = 0;
  const MAX    = 1000;

  function draw(value) {
    const canvas = document.getElementById('speedo');   // ← your HTML id
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx  = canvas.width  / 2;
    const cy  = canvas.height - 20;
    const R   = 110;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background track
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, 0, false);
    ctx.lineWidth   = 16;
    ctx.strokeStyle = '#1a1e2a';
    ctx.stroke();

    // Value arc
    const pct   = Math.min(value / MAX, 1);
    const angle = Math.PI + pct * Math.PI;
    const grad  = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0,   '#818cf8');
    grad.addColorStop(0.5, '#38bdf8');
    grad.addColorStop(1,   '#34d399');
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, angle, false);
    ctx.lineWidth   = 16;
    ctx.strokeStyle = grad;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Tick marks
    [0, 100, 200, 300, 500, 750, 1000].forEach(t => {
      const a  = Math.PI + (t / MAX) * Math.PI;
      const x1 = cx + (R - 22) * Math.cos(a);
      const y1 = cy + (R - 22) * Math.sin(a);
      const x2 = cx + (R -  8) * Math.cos(a);
      const y2 = cy + (R -  8) * Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth   = 2;
      ctx.strokeStyle = '#2a2f3f';
      ctx.stroke();
    });
  }

  function animate() {
    _current += (_target - _current) * 0.12;
    draw(_current);
    // ← your HTML ids: dr-val + dr-stage
    const numEl = document.getElementById('dr-val');
    if (numEl) numEl.textContent = _current.toFixed(1);
    requestAnimationFrame(animate);
  }

  return {
    init()  { requestAnimationFrame(animate); },
    set(v)  { _target = v; },
    reset() { _target = 0; },
  };
})();

// ── Live Trend Chart  ─────────────────────────────────────────────────────────
// Targets your existing <canvas id="myChart"> + wrapper #chart-wrap
const LiveChart = (() => {
  let chart = null;
  const MAX_POINTS = 60;

  function init() {
    const ctx = document.getElementById('myChart');   // ← your HTML id
    if (!ctx || !window.Chart) return;
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label:           'Mbps',
          data:            [],
          borderColor:     '#38bdf8',
          backgroundColor: 'rgba(56,189,248,0.07)',
          borderWidth:     2,
          pointRadius:     0,
          tension:         0.4,
          fill:            true,
        }],
      },
      options: {
        responsive:  true,
        animation:   { duration: 0 },
        scales: {
          x: { display: false },
          y: {
            beginAtZero: true,
            grid:  { color: '#1a1e2a' },
            ticks: { color: '#64748b', maxTicksLimit: 5 },
          },
        },
        plugins: {
          legend:  { display: false },
          tooltip: { enabled: false },
        },
      },
    });
  }

  function push(v) {
    if (!chart) return;
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(v);
    if (chart.data.labels.length > MAX_POINTS) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update('none');

    // Show the chart wrapper once data arrives
    const wrap  = document.getElementById('chart-wrap');
    const empty = document.getElementById('chart-empty');
    if (wrap)  wrap.style.display  = 'block';
    if (empty) empty.style.display = 'none';

    // Update badge
    const badge = document.getElementById('chart-badge');
    if (badge) badge.textContent = 'Live';
  }

  function reset() {
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update('none');
  }

  return { init, push, reset };
})();

// ── History ──────────────────────────────────────────────────────────────────
const HIST_KEY = 'netpulse_v3';
const HIST_MAX = 10;

function saveHistory(r) {
  const h = getHistory();
  h.push(r);
  if (h.length > HIST_MAX) h.shift();
  localStorage.setItem(HIST_KEY, JSON.stringify(h));
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; }
  catch (_) { return []; }
}

function renderHistory() {
  // Targets your existing <div id="hist-scroll">
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
      <div class="hist-item">
        <div class="hi-time">${r.time}</div>
        <div class="hi-row">
          <span class="hi-label">↓</span>
          <span class="hi-val" style="color:#34d399">${r.download} Mbps</span>
          <span class="hi-label">↑</span>
          <span class="hi-val" style="color:#818cf8">${r.upload} Mbps</span>
          <span class="hi-label">Ping</span>
          <span class="hi-val">${r.ping} ms</span>
        </div>
        <div class="hi-row">
          <span class="hi-badge" style="background:${qi.color}22;color:${qi.color};padding:2px 8px;border-radius:6px;font-size:0.78rem">
            ${r.score} — ${qi.label}
          </span>
          <span style="color:#64748b;font-size:0.75rem;margin-left:auto">${r.server}</span>
        </div>
      </div>`;
  }).join('');
}

function clearHistory() {
  localStorage.removeItem(HIST_KEY);
  renderHistory();
}

// ── DOM helpers targeting your HTML IDs ──────────────────────────────────────
const $  = id => document.getElementById(id);
const setVal = (id, v) => { const el = $(id); if (el) el.textContent = v; };

function setStatus(msg, pct) {
  // your HTML: id="status"  id="bar"  id="pct"
  setVal('status', msg);
  const bar  = $('bar');
  const pctEl = $('pct');
  if (bar)   bar.style.width    = `${pct ?? 0}%`;
  if (pctEl) pctEl.textContent  = pct != null ? `${Math.round(pct)}%` : '';
}

function setStage(msg) {
  // speedometer sub-label: id="dr-stage"
  setVal('dr-stage', msg);
}

function setStatCard(id, value, badge) {
  // your HTML: id="sv-ping"  id="sc-ping"  id="sb-ping" etc.
  setVal(id, value);
  if (badge) setVal(badge, '');
}

function highlightCard(id) {
  // your HTML: id="sc-ping" / sc-dl / sc-ul
  ['sc-ping','sc-dl','sc-ul'].forEach(c => {
    const el = $(c);
    if (el) el.classList.remove('active');
  });
  const el = $(id);
  if (el) el.classList.add('active');
}

// ── GeoIP  ────────────────────────────────────────────────────────────────────
// Targets your HTML IDs: geo-isp, geo-loc, geo-country, geo-tz, geo-host,
// geo-badge, conn-ip, conn-server, conn-sponsor, conn-dist, conn-host, conn-coords
async function fetchGeoIP() {
  try {
    const badge = $('geo-badge');
    if (badge) badge.textContent = 'Loading…';

    // Primary: your own /get-geoip Flask route
    const r = await fetch('/get-geoip', { cache: 'no-store' });
    const d = await r.json();
    if (d.error) throw new Error(d.error);

    // Network Info card
    setVal('geo-isp',     d.isp);
    setVal('geo-loc',     `${d.city}, ${d.region}`);
    setVal('geo-country', d.country);
    setVal('geo-tz',      d.timezone);
    setVal('geo-host',    d.hostname !== 'N/A' ? d.hostname : '—');
    if (badge) { badge.textContent = d.country; badge.className = 'sec-meta'; }

    // Connection card
    setVal('conn-ip',      d.ip);
    setVal('conn-server',  SERVER.label);
    setVal('conn-sponsor', 'Cloudflare, Inc.');
    setVal('conn-dist',    '—');   // no distance calc without server coords
    setVal('conn-host',    d.hostname !== 'N/A' ? d.hostname : '—');
    setVal('conn-coords',  d.loc);

    // Top-bar IP chip
    const ipChip = $('ip-chip');
    if (ipChip) ipChip.textContent = d.ip;

    // Server chip
    const sc = $('server-chip');
    if (sc) sc.textContent = '☁ Cloudflare';

    // conn-badge
    const cb = $('conn-badge');
    if (cb) cb.textContent = d.country;

  } catch (_) {
    // Fallback: ip-api.com (CORS-enabled, free)
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
      setVal('conn-server', SERVER.label);
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

// ── Progress bar helpers ──────────────────────────────────────────────────────
function setLoadBar(which, pct) {
  // your HTML: lb-dl / lb-ul, lb-dl-fill / lb-ul-fill, lb-dl-pct / lb-ul-pct
  const row  = $(`lb-${which}`);
  const fill = $(`lb-${which}-fill`);
  const pctEl = $(`lb-${which}-pct`);
  if (row)  row.classList.remove('hidden');
  if (fill)  fill.style.width    = `${Math.min(pct, 100)}%`;
  if (pctEl) pctEl.textContent   = `${Math.round(pct)}%`;
}
function hideLoadBars() {
  ['dl','ul'].forEach(w => {
    const row = $(`lb-${w}`);
    if (row) row.classList.add('hidden');
  });
}

// ── Status dot  ───────────────────────────────────────────────────────────────
function setDot(state) {
  // your HTML: id="dot"
  const dot = $('dot');
  if (!dot) return;
  dot.className = `status-dot ${state}`;  // idle / running / done / error
}

// ── Main Test Orchestrator ────────────────────────────────────────────────────
let isRunning = false;

async function startTest() {
  if (isRunning) return;
  isRunning = true;

  const btn = $('btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  // Reset
  Gauge.reset();
  LiveChart.reset();
  hideLoadBars();
  setVal('sv-ping', '--');
  setVal('sv-dl',   '--');
  setVal('sv-ul',   '--');
  setVal('sb-ping', '—');
  setVal('sb-dl',   '—');
  setVal('sb-ul',   '—');
  setStatus('Ready', 0);
  setStage('Idle');
  setDot('running');

  const dlSamples = [];
  const ulSamples = [];

  try {
    // ── 1. Ping ──────────────────────────────────────────────────────────────
    setStatus('Measuring latency…', 5);
    setStage('Ping');
    highlightCard('sc-ping');

    const { ping, jitter } = await measurePing();
    setVal('sv-ping', ping);
    setVal('sb-ping', `Jitter ${jitter} ms`);
    setStatus(`Ping: ${ping} ms · Jitter: ${jitter} ms`, 20);
    await sleep(300);

    // ── 2. Download ──────────────────────────────────────────────────────────
    setStatus('Warming up…', 25);
    setStage('Warmup');
    await sleep(200);

    setStatus('Testing download…', 30);
    setStage('Download');
    highlightCard('sc-dl');
    setLoadBar('dl', 0);

    let dlProgress = 0;
    const dlFinal = await measureDownload((mbps) => {
      Gauge.set(mbps);
      LiveChart.push(mbps);
      setVal('sv-dl', mbps);
      dlSamples.push(mbps);
      // Approximate progress from elapsed time
      dlProgress = Math.min(dlProgress + 1.2, 99);
      setLoadBar('dl', dlProgress);
      setStatus(`Download: ${mbps} Mbps`, 30 + dlProgress * 0.35);
    });

    const download = filteredAvg(dlSamples) || dlFinal;
    setVal('sv-dl',  download);
    setVal('sb-dl',  `${download} Mbps`);
    setLoadBar('dl', 100);
    setStatus(`Download: ${download} Mbps`, 65);
    Gauge.set(download);
    await sleep(300);

    // ── 3. Upload ─────────────────────────────────────────────────────────────
    setStatus('Testing upload…', 68);
    setStage('Upload');
    highlightCard('sc-ul');
    setLoadBar('ul', 0);

    let ulProgress = 0;
    const ulFinal = await measureUpload((mbps) => {
      Gauge.set(mbps);
      LiveChart.push(mbps);
      setVal('sv-ul', mbps);
      ulSamples.push(mbps);
      ulProgress = Math.min(ulProgress + 1.5, 99);
      setLoadBar('ul', ulProgress);
      setStatus(`Upload: ${mbps} Mbps`, 68 + ulProgress * 0.30);
    });

    const upload = filteredAvg(ulSamples) || ulFinal;
    setVal('sv-ul',  upload);
    setVal('sb-ul',  `${upload} Mbps`);
    setLoadBar('ul', 100);
    Gauge.set(download);
    setStatus(`Upload: ${upload} Mbps`, 98);
    await sleep(200);

    // ── 4. Quality + finish ───────────────────────────────────────────────────
    const score = qualityScore({ download, upload, ping, jitter });
    const qi    = qualityInfo(score);
    setStatus(`Done — ${qi.label} (${score}/100)`, 100);
    setStage('Done');
    setDot('done');

    saveHistory({
      download, upload, ping, jitter,
      score,
      server: SERVER.label,
      time:   new Date().toLocaleTimeString(),
    });
    renderHistory();

  } catch (err) {
    setStatus(`Error: ${err.message}`, 0);
    setStage('Error');
    setDot('error');
  } finally {
    isRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Start Test'; }
  }
}

// ── Chart tab switcher  ───────────────────────────────────────────────────────
// Keeps your existing onclick="switchTab('bar',event)" working
function switchTab(type, e) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
  // Chart type swap
  const myChart = window._liveChartInstance;
  if (myChart) {
    myChart.config.type = type;
    myChart.update();
  }
}

// ── Boot  ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Gauge.init();
  LiveChart.init();
  fetchGeoIP();
  renderHistory();
});
