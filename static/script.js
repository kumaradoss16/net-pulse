'use strict';

/* ================================================================
   NetPulse v6 — Direct Cloudflare speed.cloudflare.com API
   Fix: upload uses XHR (bypasses fetch CORS on __up)
   Fix: parallel download streams use ReadableStream (no blocking)
   Fix: server chip string fixed
   ================================================================ */

const round2 = v  => (v != null && isFinite(v)) ? Math.round(v * 100) / 100 : 0;
const sleep  = ms => new Promise(r => setTimeout(r, ms));
const avg    = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const median = arr => {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const CF = {
  meta:    'https://speed.cloudflare.com/meta',
  down:    bytes => `https://speed.cloudflare.com/__down?bytes=${bytes}&r=${Math.random()}`,
  up:      'https://speed.cloudflare.com/__up',
  latency: `https://speed.cloudflare.com/__down?bytes=0`,
};

// ── Quality Score ──────────────────────────────────────────────────────────────
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

// ── Gauge ──────────────────────────────────────────────────────────────────────
const Gauge = (() => {
  let _cur = 0, _tgt = 0;
  const MAX = 1000; // Mbps scale

  function draw(v) {
    const canvas = document.getElementById('speedo');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx  = canvas.width / 2;
    const cy  = canvas.height - 20;
    const R   = 110;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Soft glow behind gauge
    const glowGrad = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.1);
    glowGrad.addColorStop(0, 'rgba(56,189,248,0.25)');
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 14, Math.PI, 0, false);
    ctx.fill();

    // Background arc (track)
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, 0, false);
    ctx.lineWidth   = 18;
    ctx.strokeStyle = '#111827';
    ctx.stroke();

    // Value arc
    const frac  = Math.min(v / MAX, 1);
    const angle = Math.PI + frac * Math.PI;
    const grad  = ctx.createLinearGradient(cx - R, cy, cx + R, cy);
    grad.addColorStop(0,   '#22d3ee');
    grad.addColorStop(0.5, '#38bdf8');
    grad.addColorStop(1,   '#818cf8');

    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, angle, false);
    ctx.lineWidth   = 18;
    ctx.strokeStyle = grad;
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Tick marks + numeric labels
    const stops = [0, 100, 200, 300, 500, 750, 1000];
    ctx.fillStyle    = '#64748b';
    ctx.font         = '10px system-ui';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    stops.forEach(t => {
      const f  = t / MAX;
      const a  = Math.PI + f * Math.PI;
      const x1 = cx + (R - 24) * Math.cos(a);
      const y1 = cy + (R - 24) * Math.sin(a);
      const x2 = cx + (R - 10) * Math.cos(a);
      const y2 = cy + (R - 10) * Math.sin(a);
      const tx = cx + (R + 8)  * Math.cos(a);
      const ty = cy + (R + 8)  * Math.sin(a);

      // tick
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth   = 2;
      ctx.strokeStyle = '#1f2937';
      ctx.stroke();

      // label
      ctx.fillText(String(t), tx, ty);
    });
  }

  function animate() {
    _cur += (_tgt - _cur) * 0.12; // easing
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

// ── Live Chart ─────────────────────────────────────────────────────────────────
const LiveChart = (() => {
  let chart = null;
  let mode  = 'live'; // 'live' or 'history'

  function init() {
    const ctx = document.getElementById('myChart');
    if (!ctx || !window.Chart) return;

    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Mbps',
          data: [],
          borderColor: '#38bdf8',
          backgroundColor: 'rgba(56,189,248,0.07)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        animation: { duration: 0 },
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

  // Live (trend) mode
  function showLive() {
    if (!chart) return;
    mode = 'live';
    chart.config.type   = 'line';
    chart.data.labels   = [];
    chart.data.datasets = [{
      label: 'Mbps',
      data: [],
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56,189,248,0.07)',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.4,
      fill: true,
    }];
    chart.update('none');
    const b = $('chart-badge');
    if (b) b.textContent = 'Live';
    const w = $('chart-wrap'), e = $('chart-empty');
    if (w) w.style.display = 'none';
    if (e) e.style.display = 'flex';
  }

  // History bar chart
  function showHistory() {
    if (!chart) return;
    const hist = getHistory();
    if (!hist.length) {
      showLive(); // nothing to show, keep \"Run a test\" state
      return;
    }

    mode = 'history';
    const labels = hist.map((r, i) => `#${i + 1}`);
    const dls    = hist.map(r => r.download);
    const uls    = hist.map(r => r.upload);

    chart.config.type = 'bar';
    chart.data.labels = labels;
    chart.data.datasets = [
      {
        label: 'Download',
        data: dls,
        backgroundColor: 'rgba(34,211,238,0.6)',
      },
      {
        label: 'Upload',
        data: uls,
        backgroundColor: 'rgba(129,140,248,0.6)',
      },
    ];
    chart.options.plugins.legend.display = true;
    chart.update('none');

    const b = $('chart-badge');
    if (b) b.textContent = 'History';

    const w = $('chart-wrap'), e = $('chart-empty');
    if (w) w.style.display = 'block';
    if (e) e.style.display = 'none';
  }

  function push(v) {
    if (!chart || mode !== 'live') return;
    chart.data.labels.push('');
    chart.data.datasets[0].data.push(v);
    if (chart.data.labels.length > 80) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update('none');
    const w = $('chart-wrap'), e = $('chart-empty'), b = $('chart-badge');
    if (w) w.style.display = 'block';
    if (e) e.style.display = 'none';
    if (b) b.textContent = 'Live';
  }

  function reset() {
    if (!chart) return;
    if (mode === 'live') {
      chart.data.labels = [];
      chart.data.datasets[0].data = [];
      chart.update('none');
      const w = $('chart-wrap'), e = $('chart-empty'), b = $('chart-badge');
      if (w) w.style.display = 'none';
      if (e) e.style.display = 'flex';
      if (b) b.textContent = 'No data';
    } else {
      showHistory();
    }
  }

  return { init, push, reset, showHistory, showLive };
})();

// ── DOM Helpers ────────────────────────────────────────────────────────────────
const $      = id => document.getElementById(id);
const setVal = (id, v) => { const el = $(id); if (el) el.textContent = v; };
function setStatus(msg, pct) {
  setVal('status', msg);
  const bar = $('bar'), pctEl = $('pct');
  if (bar)   bar.style.width   = `${Math.min(pct ?? 0, 100)}%`;
  if (pctEl) pctEl.textContent = pct != null ? `${Math.round(pct)}%` : '';
}
function setStage(msg) { setVal('dr-stage', msg); }
function setDot(state) { const d = $('dot'); if (d) d.className = `status-dot ${state}`; }
function highlightCard(id) {
  ['sc-ping', 'sc-dl', 'sc-ul'].forEach(c => { const e = $(c); if (e) e.classList.remove('active'); });
  const el = $(id); if (el) el.classList.add('active');
}
function setLoadBar(which, pct) {
  const row = $(`lb-${which}`), fill = $(`lb-${which}-fill`), pctEl = $(`lb-${which}-pct`);
  if (row)   row.classList.remove('hidden');
  if (fill)  fill.style.width  = `${Math.min(pct, 100)}%`;
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;
}
function hideLoadBars() { ['dl', 'ul'].forEach(w => { const r = $(`lb-${w}`); if (r) r.classList.add('hidden'); }); }

// ── Cloudflare PoP ─────────────────────────────────────────────────────────────
let _popLabel = 'Cloudflare Edge (nearest PoP)';
async function fetchCFMeta() {
  try {
    const r = await fetch(CF.meta, { cache: 'no-store' });
    const d = await r.json();
    // d.colo = "MAA", d.city = "Chennai", d.country = "IN"
    if (d && d.colo) {
      const city    = d.city    ? `, ${d.city}`    : '';
      const country = d.country ? ` (${d.country})` : '';
      _popLabel = `Cloudflare ${d.colo}${city}${country}`;  // string, not object
    }
  } catch (_) {}
  setVal('conn-server', _popLabel);
  setVal('conn-sponsor', 'Cloudflare, Inc.');
  // Fix: server-chip should show short label like "☁ MAA"
  const sc = $('server-chip');
  if (sc) sc.textContent = `☁ ${_popLabel.split(' ')[1] || 'CF'}`;
}

// ── GeoIP ──────────────────────────────────────────────────────────────────────
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
    setVal('conn-ip',     d.ip);
    setVal('conn-dist',   '—');
    setVal('conn-host',   d.hostname !== 'N/A' ? d.hostname : '—');
    setVal('conn-coords', d.loc);
    const ipChip = $('ip-chip'); if (ipChip) ipChip.textContent = d.ip;
    const cb = $('conn-badge');  if (cb)     cb.textContent = d.country;
  } catch (_) {
    try {
      const r2 = await fetch('https://ip-api.com/json/?fields=status,country,countryCode,regionName,city,isp,org,query,lat,lon,timezone', { cache: 'no-store' });
      const d2 = await r2.json();
      if (d2.status !== 'success') return;
      setVal('geo-isp',     d2.org || d2.isp);
      setVal('geo-loc',     `${d2.city}, ${d2.regionName}`);
      setVal('geo-country', d2.country);
      setVal('geo-tz',      d2.timezone);
      setVal('conn-ip',     d2.query);
      setVal('conn-dist',   '—');
      setVal('conn-coords', `${d2.lat}, ${d2.lon}`);
      const ipChip = $('ip-chip'); if (ipChip) ipChip.textContent = d2.query;
      const badge  = $('geo-badge'); if (badge)  badge.textContent = d2.countryCode;
      const cb     = $('conn-badge'); if (cb)     cb.textContent = d2.countryCode;
    } catch (_) {}
  }
}

// ── Latency & Jitter ───────────────────────────────────────────────────────────
async function measureLatency(rounds = 20) {
  const samples = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = performance.now();
    try {
      await fetch(`${CF.latency}&t=${Date.now()}`, { cache: 'no-store' });
      samples.push(performance.now() - t0);
    } catch (_) {}
    await sleep(50);
  }
  samples.sort((a, b) => a - b);
  const trimmed = samples.slice(2, -2);
  const ping    = round2(median(trimmed));
  const diffs   = trimmed.slice(1).map((v, i) => Math.abs(v - trimmed[i]));
  const jitter  = round2(avg(diffs));
  return { ping, jitter };
}

// ── Download — aggregate bytes across all streams ─────────────────────────────
async function measureDownload(onTick) {
  const STREAMS  = 6;
  const BYTES    = 25_000_000;   // 25 MB requested per stream
  const DURATION = 15_000;       // 15 s cap

  let totalBytes = 0;
  const samples  = [];
  const start    = performance.now();
  const deadline = start + DURATION;

  async function runStream() {
    while (performance.now() < deadline) {
      const url = CF.down(BYTES);
      let streamBytes = 0;
      try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok || !resp.body) break;
        const reader = resp.body.getReader();

        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          const now = performance.now();
          const dt  = (now - start) / 1000;
          streamBytes += value.byteLength;
          totalBytes  += value.byteLength;

          if (dt > 0.2) {
            const inst = (totalBytes * 8) / (dt * 1_000_000); // Mbps
            samples.push(inst);
            onTick(round2(avg(samples.slice(-8)))); // smooth live chart/gauge
          }

          if (now >= deadline) {
            try { reader.cancel(); } catch (_) {}
            break;
          }
        }
      } catch (_) {
        break;
      }
    }
  }

  await Promise.allSettled(
    Array.from({ length: STREAMS }, (_, i) => sleep(i * 100).then(runStream))
  );

  if (!samples.length) return 0;
  samples.sort((a, b) => a - b);
  const cut   = Math.max(1, Math.floor(samples.length * 0.1));
  const clean = samples.slice(cut, samples.length - cut);
  return round2(avg(clean.length ? clean : samples));
}

// ── Upload — aggregate bytes, XHR to avoid CORS preflight ─────────────────────
function xhrPost(url, body) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'text/plain'); // simple request
    xhr.timeout = 30_000;
    xhr.onload    = () => resolve(xhr.responseText);
    xhr.onerror   = () => reject(new Error('XHR error'));
    xhr.ontimeout = () => reject(new Error('XHR timeout'));
    xhr.send(body);
  });
}

async function measureUpload(onTick) {
  const CHUNK_SIZE = 4_000_000;   // 4 MB "logical" payload per request
  const STREAMS    = 4;
  const DURATION   = 12_000;

  // build random payload (chunked to stay within crypto limit)
  const payload = new Uint8Array(CHUNK_SIZE);
  for (let off = 0; off < CHUNK_SIZE; off += 65536) {
    crypto.getRandomValues(
      new Uint8Array(payload.buffer, off, Math.min(65536, CHUNK_SIZE - off))
    );
  }
  const body = Array.from(payload).map(b => String.fromCharCode(b)).join('');

  let sentBytes = 0;
  const samples = [];
  const start   = performance.now();
  const deadline= start + DURATION;

  async function runStream() {
    while (performance.now() < deadline) {
      const t0 = performance.now();
      try {
        await xhrPost(`${CF.up}?r=${Math.random()}`, body);
        const now = performance.now();
        const dt  = (now - start) / 1000;
        const elapsed = (now - t0) / 1000;
        if (elapsed <= 0.02) continue;   // ignore ultra-short outliers

        sentBytes += CHUNK_SIZE;
        if (dt > 0.2) {
          const inst = (sentBytes * 8) / (dt * 1_000_000); // Mbps
          samples.push(inst);
          onTick(round2(avg(samples.slice(-4))));
        }
      } catch (_) {
        break;
      }
    }
  }

  await Promise.allSettled(
    Array.from({ length: STREAMS }, (_, i) => sleep(i * 150).then(runStream))
  );

  if (!samples.length) return 0;
  samples.sort((a, b) => a - b);
  const cut   = Math.max(1, Math.floor(samples.length * 0.1));
  const clean = samples.slice(cut, samples.length - cut);
  return round2(avg(clean.length ? clean : samples));
}

// ── Main Test ──────────────────────────────────────────────────────────────────
let isRunning = false;

async function startTest() {
  if (isRunning) return;
  isRunning = true;
  const btn = $('btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  Gauge.reset(); LiveChart.reset(); hideLoadBars();
  setVal('sv-ping', '--'); setVal('sb-ping', '—');
  setVal('sv-dl',   '--'); setVal('sb-dl',   '—');
  setVal('sv-ul',   '--'); setVal('sb-ul',   '—');
  setStatus('Starting…', 2); setStage('Starting'); setDot('running');

  try {
    // 1 — Latency
    setStatus('Measuring latency…', 5);
    setStage('Ping'); highlightCard('sc-ping');
    const { ping, jitter } = await measureLatency(20);
    setVal('sv-ping', ping);
    setVal('sb-ping', `Jitter ${jitter} ms`);
    setStatus(`Ping ${ping} ms · Jitter ${jitter} ms`, 18);
    await sleep(200);

    // 2 — Download
    setStatus('Testing download…', 20);
    setStage('Download'); highlightCard('sc-dl'); setLoadBar('dl', 0);
    let dlPct = 0;
    const download = await measureDownload(mbps => {
      Gauge.set(mbps); LiveChart.push(mbps); setVal('sv-dl', mbps);
      dlPct = Math.min(dlPct + 1.2, 99);
      setLoadBar('dl', dlPct);
      setStatus(`Download: ${mbps} Mbps`, Math.min(20 + dlPct * 0.45, 65));
    });
    setVal('sv-dl', download); setVal('sb-dl', `${download} Mbps`);
    setLoadBar('dl', 100); Gauge.set(download);
    setStatus(`Download: ${download} Mbps`, 65);
    await sleep(200);

        // 3 — Upload
    setStatus('Testing upload…', 67);
    setStage('Upload');
    highlightCard('sc-ul');
    setLoadBar('ul', 0);

    const ulStart   = performance.now();
    const UL_WINDOW = 12_000; // match DURATION inside measureUpload

    const upload = await measureUpload(mbps => {
      Gauge.set(mbps);
      LiveChart.push(mbps);
      setVal('sv-ul', mbps);

      const elapsed = performance.now() - ulStart;
      const frac    = Math.min(elapsed / UL_WINDOW, 0.99);
      const pct     = Math.round(frac * 100);

      setLoadBar('ul', pct);
      // 67 → 98 during upload
      setStatus(`Upload: ${mbps} Mbps`, 67 + frac * 31);
    });

    setVal('sv-ul', upload);
    setVal('sb-ul', `${upload} Mbps`);
    setLoadBar('ul', 100);
    Gauge.set(download);  // keep final gauge on download

    // 4 — Score
    const score = qualityScore({ download, upload, ping, jitter });
    const qi    = qualityInfo(score);
    setStatus(`Done — ${download} Mbps ↓  ${upload} Mbps ↑  ${ping} ms ping`, 100);
    setStage('Complete'); setDot('done');

    setVal('conn-server', _popLabel);
    saveHistory({ download, upload, ping, jitter, score, server: _popLabel, time: new Date().toLocaleTimeString() });
    renderHistory();

  } catch (err) {
    setStatus(`Error: ${err.message}`, 0);
    setStage('Error'); setDot('error');
  } finally {
    isRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Run Again'; }
  }
}

// ── Chart tab switcher ─────────────────────────────────────────────────────────
function switchTab(type, e) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  if (e && e.target) e.target.classList.add('active');
}

// ── Boot ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Gauge.init();
  LiveChart.init();
  fetchGeoIP();
  fetchCFMeta();
  renderHistory();
});
