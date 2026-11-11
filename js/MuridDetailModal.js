// MuridDetailModal.js — modal shared buat intip cepat riwayat satu murid:
// Paket SPP, Riwayat Pembayaran, dan Progress Bintang/Hadiah. Dipanggil
// dari halaman manapun (Pembayaran = pintu masuk utama lewat openPicker(),
// baris tabel Murid/SPP-list nantinya lewat open(id_murid) langsung).
const MuridDetailModal = (() => {
  const SD_KEY = 'md-murid';

  let _muridCache     = null; // cache biar gak fetch ulang tiap buka modal
  let _activeTab       = 'spp'; // 'spp' | 'pembayaran' | 'hadiah'
  let _currentMuridId = '';
  let _isLoading       = false; // true selama salah satu tab lagi fetch
  let _loadToken       = 0;     // dinaikkan tiap fetch baru — buat buang hasil basi

  async function _ensureMuridCache() {
    if (_muridCache) return _muridCache;
    const res   = await API.murid.getAll();
    _muridCache = res.status === 'OK' ? (res.data || []) : [];
    return _muridCache;
  }

  async function _ensurePickerReady() {
    const murid = await _ensureMuridCache();
    SD.populate(SD_KEY, murid.map(m => ({ value: m.id, label: m.nama, extra: { nama: m.nama, program: m.program } })));
    const sel = document.getElementById(SD_KEY);
    if (sel && !sel._mddListenerAttached) {
      sel.addEventListener('change', () => _loadMurid(sel.value));
      sel._mddListenerAttached = true;
    }
    return murid;
  }

  function _setHeader(m) {
    const nameEl = document.getElementById('murid-detail-name');
    const progEl = document.getElementById('murid-detail-program');
    if (nameEl) nameEl.textContent = m ? m.nama : 'Pilih Murid';
    if (progEl) progEl.textContent = m ? (m.program || '') : '';
  }

  function _showEmptyState() {
    const body = document.getElementById('murid-detail-body');
    if (body) body.innerHTML = `<div class="empty-feed">Pilih murid dulu buat lihat riwayatnya</div>`;
  }

  function _loadMurid(id_murid) {
    if (!id_murid) return;
    _currentMuridId = id_murid;
    const m = (_muridCache || []).find(x => String(x.id) === String(id_murid));
    _setHeader(m);
    _switchTab(_activeTab || 'spp');
  }

  // ── Pintu masuk 1: dari tombol "Cek Riwayat Murid" — modal kosong, admin
  //    cari murid sendiri lewat dropdown.
  async function openPicker() {
    await _ensurePickerReady();
    SD.clear(SD_KEY);
    _currentMuridId = '';
    _setHeader(null);
    _showEmptyState();
    UI.openModal('modal-murid-detail');
  }

  // ── Pintu masuk 2: dari icon baris tabel manapun (Murid.js, SPP-list.js,
  //    dst nanti) — langsung buka modal dengan murid yang udah ditentukan.
  async function open(id_murid) {
    await _ensurePickerReady();
    UI.openModal('modal-murid-detail');
    _loadMurid(id_murid);
  }

  function switchTab(tab) {
    if (_isLoading) return; // lagi ada fetch jalan — abaikan klik tab lain
    _activeTab = tab;
    ['spp', 'pembayaran', 'hadiah'].forEach(t => {
      const btn = document.getElementById('mdd-tab-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
    });
    if (!_currentMuridId) return;
    if (tab === 'spp')        _renderSPP();
    if (tab === 'pembayaran') _renderPembayaran();
    if (tab === 'hadiah')     _renderHadiah();
  }
  const _switchTab = switchTab;

  // Kunci/buka 3 tombol tab selama proses fetch, biar gak bisa
  // pindah tab (dan ketuker kontennya) sebelum data lama selesai render.
  function _setTabsDisabled(disabled) {
    ['spp', 'pembayaran', 'hadiah'].forEach(t => {
      const btn = document.getElementById('mdd-tab-' + t);
      if (btn) btn.disabled = disabled;
    });
  }

  // Dipanggil di awal tiap render_X() — kunci tab & kasih token unik
  // buat request ini. Kalau ada request lebih baru mulai sebelum yang
  // ini selesai, _loadToken sudah berubah duluan.
  function _beginLoad() {
    _isLoading = true;
    _loadToken += 1;
    _setTabsDisabled(true);
    return _loadToken;
  }

  // Dipanggil di akhir tiap render_X(). Kalau token yang dibawa bukan
  // token terbaru, berarti ada request lain yang sudah mulai duluan —
  // biarkan request itu yang nanti buka kunci, jangan dibuka di sini.
  function _endLoad(token) {
    if (token !== _loadToken) return;
    _isLoading = false;
    _setTabsDisabled(false);
  }

  function _loading(msg) {
    return `<div class="empty-feed"><div class="spinner spinner-sm"></div> ${msg}</div>`;
  }

  async function _renderSPP() {
    const body    = document.getElementById('murid-detail-body');
    if (!body) return;
    const myMurid = _currentMuridId;
    const token   = _beginLoad();
    body.innerHTML = _loading('Memuat riwayat SPP...');
    const res = await API.spp.getByMurid(myMurid);
    // Murid/tab udah ganti selagi fetch jalan → buang hasil ini, jangan dirender
    if (token !== _loadToken || myMurid !== _currentMuridId) { _endLoad(token); return; }
    if (res.status !== 'OK' || !(res.data || []).length) {
      body.innerHTML = '<div class="empty-feed">Belum ada riwayat paket SPP</div>';
      _endLoad(token);
      return;
    }
    const sorted = [...res.data].sort((a, b) => (b.periode_mulai || '').localeCompare(a.periode_mulai || ''));
    body.innerHTML = sorted.map(s => `
      <div style="border-bottom:1px solid var(--border);padding:10px 0;font-size:0.82rem;">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
          <span class="id-badge">${UI.escape(s.id)}</span>
          <strong>${UI.escape(s.program)}</strong>
          ${UI.statusBadge(s.status)}
        </div>
        <div style="color:var(--text-secondary);">
          ${s.jenis_siklus === 'BARU'
            ? `${s.periode_mulai} &mdash; ${s.periode_akhir || '(siklus berjalan)'} &middot; ${s.hadir}/${s.total_pertemuan} sesi`
            : `${s.periode_mulai} s/d ${s.periode_akhir || '-'} &middot; ${s.hadir}/${s.total_pertemuan} sesi`
          }
        </div>
        <div style="color:var(--text-secondary);margin-top:2px;">
          ${UI.formatCurrency(s.harga)} &middot; ${UI.statusBadge(s.status_bayar)}
        </div>
      </div>
    `).join('');
    _endLoad(token);
  }

  // Kelompokkan riwayat pembayaran per kategori (SPP / Biaya Masuk / Buku)
  // supaya kelihatan sekilas murid ini udah bayar apa aja — bukan cuma
  // daftar transaksi mentah yang harus dibaca satu-satu.
  function _buildPembayaranSummary(data) {
    const kategori = {
      SPP:         { label: 'SPP',         icon: 'book-open', total: 0, ada: false },
      PENDAFTARAN: { label: 'Biaya Masuk', icon: 'user-plus',  total: 0, ada: false },
      BUKU_JUAL:   { label: 'Buku',        icon: 'library',    total: 0, ada: false, items: [] }
    };
    data.forEach(p => {
      const jenis = String(p.jenis || '').toUpperCase();
      const key   = jenis === 'BUKU' ? 'BUKU_JUAL' : jenis; // normalisasi label 'BUKU' vs 'BUKU_JUAL'
      if (!kategori[key]) return;
      kategori[key].total += Number(p.jumlah || 0);
      kategori[key].ada    = true;
      if (key === 'BUKU_JUAL' && p.keterangan) kategori[key].items.push(p.keterangan);
    });

    const chips = Object.values(kategori).map(k => `
      <span style="
        display:inline-flex;align-items:center;gap:5px;
        padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:600;
        background:${k.ada ? 'var(--success-dim,#dcfce7)' : 'var(--bg-secondary,#f1f5f9)'};
        color:${k.ada ? 'var(--success,#16a34a)' : 'var(--text-secondary)'};
        margin-right:6px;margin-bottom:6px;
      ">
        <i data-lucide="${k.ada ? 'check-circle' : 'circle-dashed'}" style="width:12px;height:12px;"></i>
        ${k.label}${k.ada ? ' &middot; ' + UI.formatCurrency(k.total) : ' &middot; belum ada'}
      </span>`).join('');

    const bukuList = kategori.BUKU_JUAL.items.length
      ? `<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:6px;">Buku: ${kategori.BUKU_JUAL.items.map(x => UI.escape(x)).join(', ')}</div>`
      : '';

    return `
      <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:14px;">
        <div style="font-size:0.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-secondary);margin-bottom:8px;">
          Ringkasan Pembayaran
        </div>
        <div>${chips}</div>
        ${bukuList}
      </div>`;
  }

  async function _renderPembayaran() {
    const body    = document.getElementById('murid-detail-body');
    if (!body) return;
    const myMurid = _currentMuridId;
    const token   = _beginLoad();
    body.innerHTML = _loading('Memuat riwayat pembayaran...');
    const res = await API.pembayaran.getByMurid(myMurid);
    if (token !== _loadToken || myMurid !== _currentMuridId) { _endLoad(token); return; }
    if (res.status !== 'OK' || !(res.data || []).length) {
      body.innerHTML = '<div class="empty-feed">Belum ada riwayat pembayaran</div>';
      _endLoad(token);
      return;
    }
    const data      = res.data;
    const sorted    = [...data].sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
    const listHTML  = sorted.map(p => `
      <div style="border-bottom:1px solid var(--border);padding:10px 0;font-size:0.82rem;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="color:var(--text-secondary);">${UI.formatDate(p.tanggal)}</span>
          <strong>${UI.escape(p.jenis)}</strong>
          <span style="margin-left:auto;font-weight:700;font-family:var(--font-mono,monospace);">${UI.formatCurrency(p.jumlah)}</span>
        </div>
        <div style="color:var(--text-secondary);margin-top:2px;">
          ${UI.escape(p.keterangan || '-')} &middot; ${UI.escape(p.metode || '-')}
          ${p.status_bayar === 'HUTANG' ? ' &middot; <span style="color:var(--danger,#ef4444);font-weight:600;">HUTANG</span>' : ''}
        </div>
      </div>
    `).join('');

    body.innerHTML = _buildPembayaranSummary(data) + listHTML;
    lucide.createIcons({ nodes: [body] });
    _endLoad(token);
  }

  async function _renderHadiah() {
    const body    = document.getElementById('murid-detail-body');
    if (!body) return;
    const myMurid = _currentMuridId;
    const token   = _beginLoad();
    body.innerHTML = _loading('Memuat progress bintang...');
    const [progRes, riwRes] = await Promise.all([
      API.hadiah.getProgress(myMurid),
      API.hadiah.getRiwayat(myMurid)
    ]);
    if (token !== _loadToken || myMurid !== _currentMuridId) { _endLoad(token); return; }
    const prog    = progRes.status === 'OK' ? progRes.data : null;
    const riwayat = riwRes.status  === 'OK' ? (riwRes.data || []) : [];

    let progressHTML = '<div class="empty-feed">Belum ada progress bintang</div>';
    if (prog) {
      const target = prog.target_sekarang || 0;
      const pct    = target > 0 ? Math.min(100, Math.round((prog.bintang_terkumpul / target) * 100)) : 0;
      progressHTML = `
        <div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:8px;">
            <span>${prog.hadiah_sekarang ? 'Menuju ' + UI.escape(prog.hadiah_sekarang) : 'Belum ada tier hadiah'}</span>
            <span style="font-weight:600;">${prog.bintang_terkumpul} / ${target || '-'}</span>
          </div>
          <div style="height:6px;border-radius:3px;background:var(--border);overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:var(--primary,#3b82f6);"></div>
          </div>
        </div>`;
    }

    const riwayatHTML = riwayat.length
      ? riwayat.map(r => `
          <div style="border-bottom:1px solid var(--border);padding:8px 0;font-size:0.82rem;display:flex;align-items:center;gap:8px;">
            <span style="color:var(--text-secondary);">${UI.formatDate(r.tanggal)}</span>
            <strong>${UI.escape(r.nama_hadiah)}</strong>
            <span style="margin-left:auto;color:var(--text-secondary);">Tier ${r.tier_ke}</span>
          </div>`).join('')
      : '<div class="empty-feed">Belum pernah ambil hadiah</div>';

    body.innerHTML = progressHTML + riwayatHTML;
    lucide.createIcons({ nodes: [body] });
    _endLoad(token);
  }

  return { openPicker, open, switchTab };
})();

window.MuridDetailModal = MuridDetailModal;