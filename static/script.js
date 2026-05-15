/* ================================================================
   NetPulse v3 — Client-Side Speed Test Engine
   Architecture: Browser → Cloudflare Edge (nearest PoP via Anycast)
   Zero backend bottleneck. No speedtest-cli. No server proxying.
   ================================================================ */

'use strict';

// ── Shared Math Utilities ───────────────────────────────────────────────────
const avg    = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const round2 = v   => Math.round(v * 100) / 100;
const sleep  = ms  => new Promise(r => setTimeout(r, ms));
const stddev = arr => {
  const m = avg(arr);
  return Math.sqrt(avg(arr.map(v => (v - m) ** 2)));
};

// ── CDN Server Config ────────────────────────────────────────────────────────
// speed.cloudflare.com uses Anycast — auto-routes every user to their
// nearest Cloudflare PoP (300+ globally). Chennai → Cloudflare Chennai,
// Frankfurt → Cloudflare Frankfurt, etc.
const SERVER = {
  id:    "cf-auto",
  label: "Cloudflare Edge (nearest PoP)",
  ping:  "https://speed.cloudflare.com/__down?bytes=0",
  down:  "https://speed.cloudflare.com/__down?bytes=",
  up:    "https://speed.cloudflare.com/__up",
};

const CFG = {
  PING_ROUNDS:    5,
  PROBE_TIMEOUT:  3000,
  WARMUP_STREAMS: 2,
  WARMUP_BYTES:   2  * 1024 * 1024,   // 2 MB per warmup stream
  DL_STREAMS:     6,
  DL_BYTES:       25 * 1024 * 1024,   // 25 MB per stream
  DL_DURATION:    12000,              // ms
  UL_STREAMS:     4,
  UL_BYTES:       4  * 1024 * 1024,   // 4 MB per upload POST
  UL_DURATION:    10000,
  ROLLING_MS:     600,                // sliding window width
  EMA_ALPHA:      0.3,                // smoothing factor
  STAGGER_MS:     80,                 // stream launch delay
};

// ── Rolling Window + EMA Factory ────────────────────────────────────────────
function makeWindow() {
  const buf = [];
  let ema = 0;
  return {
    reset() { buf.length = 0; ema = 0; },
    push(bytes) {
      const now = performance.now();
      buf.push({ t: now, b: bytes });
      // Prune entries older than rolling window
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
      // Exponential moving average for smooth gauge animation
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
      await fetch(`${SERVER.ping}&t=${Date.now()}`, {
        cache: 'no-store',
        signal: ac.signal,
      });
      samples.push(performance.now() - t0);
    } catch (_) {
      samples.push(CFG.PROBE_TIMEOUT);
    } finally {
      clearTimeout(tid);
    }
    await sleep(100);
  }
  // Trim highest + lowest outlier
  samples.sort((a, b) => a - b);
  const trimmed = samples.slice(1, -1);
  return {
    ping:   round2(avg(trimmed)),
    jitter: round2(stddev(trimmed)),
  };
}

// ── Stream Helper (ReadableStream reader loop) ───────────────────────────────
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
      onChunk(value.byteLength);  // bytes received from this chunk
    }
  } catch (_) {
    // AbortError is expected and normal — silently ignore
  }
}

// ── Download Engine ──────────────────────────────────────────────────────────
async function measureDownload(onTick) {
  // Phase 1: Warmup — primes TCP slow-start, results discarded
  const wCtrl = Array.from({ length: CFG.WARMUP_STREAMS }, () => new AbortController());
  await Promise.allSettled(
    wCtrl.map((ac, i) =>
      sleep(i * CFG.STAGGER_MS).then(() =>
        streamBytes(
          `${SERVER.down}${CFG.WARMUP_BYTES}&r=${Date.now()}-${Math.random()}`,
          ac.signal,
          () => {}    // discard warmup bytes
        )
      )
    )
  );

  // Phase 2: Main download — 6 parallel 25MB streams
  const win       = makeWindow();
  const startTime = performance.now();
  const deadline  = startTime + CFG.DL_DURATION;
  let   total     = 0;
  const ctrl      = Array.from({ length: CFG.DL_STREAMS }, () => new AbortController());

  const streams = ctrl.map((ac, i) =>
    sleep(i * CFG.STAGGER_MS).then(() =>
      streamBytes(
        `${SERVER.down}${CFG.DL_BYTES}&r=${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ac.signal,
        (bytes) => {
          total += bytes;
          win.push(bytes);
          onTick(win.mbps());
          // Hard-kill all streams when deadline reached
          if (performance.now() >= deadline)
            ctrl.forEach(c => { try { c.abort(); } catch(_){} });
        }
      )
    )
  );

  await Promise.allSettled(streams);
  const elapsed = (performance.now() - startTime) / 1000;
  return round2((total * 8) / (elapsed * 1_000_000));
}

// ── Upload Engine ────────────────────────────────────────────────────────────
async function measureUpload(onTick) {
  const win       = makeWindow();
  const startTime = performance.now();
  const deadline  = startTime + CFG.UL_DURATION;
  let   total     = 0;

  // crypto.getRandomValues() → incompressible data
  // Prevents HTTP compression from inflating upload Mbps
  const payload = crypto.getRandomValues(new Uint8Array(CFG.UL_BYTES));
  const ctrl    = Array.from({ length: CFG.UL_STREAMS }, () => new AbortController());

  const streams = ctrl.map((ac, i) =>
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
        } catch (_) {
          break;
        }
      }
    })
  );

  await Promise.allSettled(streams);
  ctrl.forEach(c => { try { c.abort(); } catch(_){} });
  const elapsed = (performance.now() - startTime) / 1000;
  return round2((total * 8) / (elapsed * 1_000_000));
}

// ── Outlier Filter (Z-score) ─────────────────────────────────────────────────
function filteredAvg(samples) {
  if (samples.length < 3) return round2(avg(samples));
  const m  = avg(samples);
  const sd = stddev(samples);
  if (sd === 0) return round2(m);
  const clean = samples.filter(v => Math.abs((v - m) / sd) < 2.5);
  return round2(avg(clean.length ? clean : samples));
}

// ── Quality Score ────────────────────────────────────────────────────────────
function qualityScore({ download, upload, ping, jitter }) {
  let s = 0;
  // Download — 40 pts
  s += download >= 200 ? 40 : download >= 100 ? 35 : download >= 50 ? 28 :
       download >= 25  ? 20 : download >= 10  ? 12 : download >= 5  ?  6 : 2;
  // Upload — 25 pts
  s += upload >= 100 ? 25 : upload >= 50 ? 20 : upload >= 20 ? 15 :
       upload >= 10  ? 10 : upload >= 5  ?  6 : 2;
  // Ping — 25 pts
  s += ping <= 5  ? 25 : ping <= 15 ? 22 : ping <= 30 ? 18 :
       ping <= 60 ? 13 : ping <= 100 ?  8 : ping <= 150 ? 4 : 1;
  // Jitter — 10 pts
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

// ── Canvas Gauge ─────────────────────────────────────────────────────────────
const Gauge = (() => {
  let _current = 0;
  let _target  = 0;
  const MAX    = 1000; // Mbps scale max

  function draw(value) {
    const canvas = document.getElementById('gauge-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx  = canvas.width  / 2;
    const cy  = canvas.height - 30;
    const R   = 130;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Track background
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, 0, false);
    ctx.lineWidth   = 18;
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
    ctx.lineWidth   = 18;
    ctx.strokeStyle = grad;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Tick marks
    [0, 100, 200, 300, 500, 750, 1000].forEach(t => {
      const a  = Math.PI + (t / MAX) * Math.PI;
      const x1 = cx + (R - 26) * Math.cos(a);
      const y1 = cy + (R - 26) * Math.sin(a);
      const x2 = cx + (R - 10) * Math.cos(a);
      const y2 = cy + (R - 10) * Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth   = 2;
      ctx.strokeStyle = '#2a2f3f';
      ctx.stroke();
    });
  }

  function animate() {
    _current += (_target - _current) * 0.12; // lerp
    draw(_current);
    const el = document.getElementById('gauge-number');
    if (el) el.textContent = _current.toFixed(1);
    requestAnimationFrame(animate);
  }

  return {
    init()  { requestAnimationFrame(animate); },
    set(v)  { _target = v; },
    reset() { _target = 0; },
  };
})();

// ── Live Chart (Chart.js) ────────────────────────────────────────────────────
const LiveChart = (() => {
  let chart = null;
  const MAX_POINTS = 60;

  function init() {
    const ctx = document.getElementById('chart-live');
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
  }

  function reset() {
    if (!chart) return;
    chart.data.labels              = [];
    chart.data.datasets[0].data   = [];
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
  const tbody = document.getElementById('history-body');
  if (!tbody) return;
  const hist = getHistory().slice().reverse();
  if (!hist.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px">No tests yet</td></tr>';
    return;
  }
  tbody.innerHTML = hist.map(r => {
    const qi = qualityInfo(r.score || 0);
    return `<tr>
      <td>${r.time}</td>
      <td style="color:#34d399;font-weight:700">${r.download} Mbps</td>
      <td style="color:#818cf8;font-weight:700">${r.upload} Mbps</td>
      <td>${r.ping} ms</td>
      <td>${r.jitter} ms</td>
      <td><span class="score-badge" style="background:${qi.color}22;color:${qi.color}">${r.score} — ${qi.label}</span></td>
      <td style="color:#64748b;font-size:0.8rem">${r.server}</td>
    </tr>`;
  }).join('');
}

// ── DOM Helpers ───────────────────────────────────────────────────────────────
const $      = id  => document.getElementById(id);
const setVal = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const setStatus = msg => setVal('status-text', msg);
function setActive(id) {
  document.querySelectorAll('.np-metric-card').forEach(c => c.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
}

// ── GeoIP Loader ──────────────────────────────────────────────────────────────
async function loadGeoIP() {
  try {
    // Primary: ip-api.com (free, no key, CORS-enabled)
    const r = await fetch(
      'http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,lat,lon,isp,org,query',
      { cache: 'no-store' }
    );
    const d = await r.json();
    if (d.status === 'success') {
      setVal('val-ip',       d.query);
      setVal('val-isp',      d.org || d.isp);
      setVal('val-location', `${d.city}, ${d.countryCode}`);
      return;
    }
  } catch (_) {}
  // Fallback: ipinfo.io
  try {
    const r2 = await fetch('https://ipinfo.io/json', { cache: 'no-store' });
    const d2 = await r2.json();
    setVal('val-ip',       d2.ip);
    setVal('val-isp',      d2.org);
    setVal('val-location', `${d2.city}, ${d2.country}`);
  } catch (_) {}
}

// ── Main Test Orchestrator ────────────────────────────────────────────────────
let isRunning = false;

async function runTest() {
  if (isRunning) return;
  isRunning = true;

  const btn = $('btn-start');
  if (btn) { btn.disabled = true; btn.classList.add('running'); }
  setVal('btn-label', '…');

  // Reset UI
  Gauge.reset();
  LiveChart.reset();
  ['val-ping','val-jitter','val-download','val-upload','val-quality'].forEach(id => setVal(id, '—'));
  setVal('val-quality-label', '');
  setVal('val-server', SERVER.label);
  setStatus('Starting…');

  const dlSamples = [];
  const ulSamples = [];

  try {
    // ── 1. Ping ──────────────────────────────────────────────────────────────
    setStatus('Measuring latency…');
    setActive('card-ping');
    const { ping, jitter } = await measurePing();
    setVal('val-ping',   ping);
    setVal('val-jitter', jitter);
    setStatus(`Ping: ${ping} ms  ·  Jitter: ${jitter} ms`);
    await sleep(300);

    // ── 2. Download ──────────────────────────────────────────────────────────
    setStatus('Warming up connection…');
    await sleep(200);
    setStatus('Testing download speed…');
    setActive('card-download');

    const dlFinal = await measureDownload((mbps) => {
      Gauge.set(mbps);
      LiveChart.push(mbps);
      setVal('val-download', mbps);
      dlSamples.push(mbps);
    });

    const download = filteredAvg(dlSamples) || dlFinal;
    setVal('val-download', download);
    Gauge.set(download);
    setStatus(`Download: ${download} Mbps`);
    await sleep(300);

    // ── 3. Upload ────────────────────────────────────────────────────────────
    setStatus('Testing upload speed…');
    setActive('card-upload');

    const ulFinal = await measureUpload((mbps) => {
      Gauge.set(mbps);
      LiveChart.push(mbps);
      setVal('val-upload', mbps);
      ulSamples.push(mbps);
    });

    const upload = filteredAvg(ulSamples) || ulFinal;
    setVal('val-upload', upload);
    Gauge.set(download); // reset gauge to download after upload
    setStatus(`Upload: ${upload} Mbps`);
    await sleep(200);

    // ── 4. Quality Score ──────────────────────────────────────────────────────
    const score = qualityScore({ download, upload, ping, jitter });
    const qi    = qualityInfo(score);
    setVal('val-quality', score);
    setVal('val-quality-label', qi.label);
    const qEl = $('val-quality');
    if (qEl) qEl.style.color = qi.color;
    setActive('card-quality');
    setStatus(`Done — ${qi.label} connection`);

    // ── 5. Save to history ────────────────────────────────────────────────────
    saveHistory({
      download, upload, ping, jitter,
      score,
      server: SERVER.label,
      time:   new Date().toLocaleTimeString(),
    });
    renderHistory();

  } catch (err) {
    setStatus(`Error: ${err.message}`);
  } finally {
    isRunning = false;
    if (btn) { btn.disabled = false; btn.classList.remove('running'); }
    setVal('btn-label', 'GO');
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Gauge.init();
  LiveChart.init();
  loadGeoIP();
  renderHistory();

  const clearBtn = $('btn-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem(HIST_KEY);
      renderHistory();
    });
  }
});
