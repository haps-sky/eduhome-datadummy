// DataStatus — kartu "Status Data" di Dashboard.
// Menampilkan kapan DATA di database terakhir BERUBAH (tambah/edit/hapus),
// berdasarkan timestamp dari backend (getLastDataChange), bukan waktu refresh.
// Butuh: API.sync.getLastChange() di Api.js dan markup #ds-* di index.html.
const DataStatus = (() => {
  const POLL_MS  = 45000;  // cek ke server tiap 45 detik
  const RETRY_MS = 5000;   // sebelum ada data pertama (mis. belum login), coba tiap 5 detik

  let lastChange = 0;      // epoch ms, dari backend
  let offset     = 0;      // selisih jam browser - jam server
  let lastCheck  = 0;
  let hasData    = false;
  let inflight   = false;

  const $ = id => document.getElementById(id);

  // "Sekarang" versi server, supaya jam laptop yang meleset tidak mempengaruhi teks relatif.
  function _now() { return Date.now() - offset; }

  function _relative(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    if (s < 5)  return 'Baru saja';
    if (s < 60) return s + ' detik lalu';
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' menit lalu';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' jam lalu';
    return Math.floor(h / 24) + ' hari lalu';
  }

  // Contoh hasil: "3 November 2026, 08:39:17 WIB" (selalu zona Jakarta)
  function _absolute(ts) {
    const parts = new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(new Date(ts));
    const p = {};
    parts.forEach(x => { p[x.type] = x.value; });
    return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second} WIB`;
  }

  function _setBadge(ok) {
    const b = $('ds-badge');
    if (!b) return;
    b.textContent      = ok ? 'Tersinkron' : 'Gagal sinkron';
    b.style.background = ok ? 'var(--success-dim)' : 'var(--danger-dim, #fee2e2)';
    b.style.color      = ok ? 'var(--success)'     : 'var(--danger, #dc2626)';
  }

  function render() {
    const rel = $('ds-relative');
    const abs = $('ds-absolute');
    if (!rel || !abs) return;
    if (!lastChange) {
      rel.textContent = hasData ? 'Belum ada perubahan' : '—';
      abs.textContent = '';
      return;
    }
    rel.textContent = _relative(_now() - lastChange);
    abs.textContent = _absolute(lastChange);
  }

  async function check() {
    if (inflight || !API.getToken()) return;
    inflight  = true;
    lastCheck = Date.now();
    try {
      const res = await API.sync.getLastChange();
      if (res.status !== 'OK') throw new Error(res.message || 'Gagal');
      const d  = res.data || {};
      const ts = d.last_data_change ? Date.parse(d.last_data_change) : 0;
      lastChange = isNaN(ts) ? 0 : ts;
      if (d.server_time) {
        const st = Date.parse(d.server_time);
        if (!isNaN(st)) offset = Date.now() - st;
      }
      hasData = true;
      _setBadge(true);
    } catch (e) {
      _setBadge(false);
    } finally {
      inflight = false;
      render();
    }
  }

  // Tombol refresh di kartu: tarik ulang data dashboard + cek timestamp.
  // Timestamp sendiri TIDAK berubah karena refresh; hanya berubah kalau data di backend berubah.
  // Ikon berputar selama data dashboard + timestamp benar-benar selesai dimuat.
  let refreshing = false;
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    const btn = $('ds-refresh-btn');
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); }
    try {
      const jobs = [check(), new Promise(r => setTimeout(r, 500))]; // min 0,5 dtk supaya putarannya terlihat
      if (window.Dashboard && typeof Dashboard.load === 'function') jobs.push(Dashboard.load());
      await Promise.all(jobs);
    } finally {
      refreshing = false;
      if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); }
    }
  }

  function _tick() {
    render();
    if (document.hidden) return;
    if (Date.now() - lastCheck >= (hasData ? POLL_MS : RETRY_MS)) check();
  }

  function init() {
    setInterval(_tick, 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    _tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { check, refresh, render };
})();

window.DataStatus = DataStatus;