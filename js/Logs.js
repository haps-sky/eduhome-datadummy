// ============================================================
// ============================================================
// LogsPage — Enhanced: toolbar, undo/redo, hapus, tampilan rapi
// ============================================================
const LogsPage = (() => {
  let allData = [];
  let lastDeletedData = null;
  let lastAction = null;

  const EVENT_LABELS = {
    'ADD_MURID':'Tambah Murid','UPDATE_MURID':'Edit Murid','DELETE_MURID':'Hapus Murid',
    'DELETE_ALL_MURID':'Hapus Semua Murid','ADD_MENTOR':'Tambah Mentor',
    'UPDATE_MENTOR':'Edit Mentor','DELETE_MENTOR':'Hapus Mentor',
    'DELETE_ALL_MENTOR':'Hapus Semua Mentor','ADD_PRESENSI':'Catat Presensi',
    'UPDATE_PRESENSI':'Edit Presensi','DELETE_PRESENSI':'Hapus Presensi',
    'DELETE_ALL_PRESENSI':'Hapus Semua Presensi','ADD_PEMBAYARAN':'Catat Pembayaran',
    'UPDATE_PEMBAYARAN':'Edit Pembayaran','DELETE_PEMBAYARAN':'Hapus Pembayaran',
    'DELETE_ALL_PEMBAYARAN':'Hapus Semua Pembayaran','ADD_BUKU':'Tambah Modul Buku',
    'UPDATE_BUKU':'Edit Modul Buku','DELETE_BUKU':'Hapus Modul Buku',
    'DELETE_ALL_BUKU':'Hapus Semua Modul','KURANGI_STOK_BUKU':'Stok Buku Berkurang',
    'KEMBALIKAN_STOK_BUKU':'Stok Buku Dikembalikan','CREATE_SPP':'Buat Paket SPP',
    'UPDATE_SPP':'Edit Paket SPP','DELETE_SPP':'Hapus Paket SPP',
    'DELETE_ALL_SPP':'Hapus Semua SPP','RECORD_GAJI':'Catat Gaji Mentor',
    'UPDATE_GAJI':'Edit Gaji','DELETE_GAJI':'Hapus Gaji','DELETE_ALL_GAJI':'Hapus Semua Gaji',
    'UNAUTHORIZED':'⚠ Akses Ditolak', 'MAINTENANCE_ON':'Maintenance Dinyalakan','MAINTENANCE_OFF':'Maintenance Dimatikan',
    'TEST_SESSION_START':'Testing Dimulai','TEST_SESSION_END':'Testing Selesai',
    'TEST_SESSION_RESTORE':'Restore Terverifikasi','TEST_SESSION_RESTORE_FAILED':'⚠ Restore Gagal',
    'DEV_ACTION_DENIED':'⚠ Aksi Dev Ditolak',
  };

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('logs-tbody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row"><div class="spinner spinner-sm" style="margin:0 auto 6px"></div> Memuat log...</td></tr>`;
    try {
      const res = await API.logs.getAll();
      if (res.status === 'OK') {
        allData = res.data || [];
        renderTable(allData);
        _updateBtns();
      } else {
        console.warn('[LogsPage] status bukan OK:', res);
        tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Gagal memuat log: ${res.message || res.status}</td></tr>`;
      }
    } catch(e) {
      console.error('[LogsPage] error:', e);
      tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Gagal memuat log: ${e.message}</td></tr>`;
    }
  }

  function renderTable(data) {
  Pagination.setData('logs', data);
  }

  function _formatTimestamp(ts) {
    if (!ts) return '-';
    try {
      const d = new Date(ts);
      if (isNaN(d)) return ts;
      const tgl  = d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
      const jam  = d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      return `${tgl} ${jam}`;
    } catch(e) { return ts; }
  }

  function renderRows(slice) {
  const rows = slice.map(l => `
    <tr>
      <td style="white-space:nowrap;">${_formatTimestamp(l.timestamp)}</td>

      <td>
        <span class="program-tag">
          ${EVENT_LABELS[l.event] || l.event}
        </span>
      </td>

      <td>${UI.escape(l.user || '-')}</td>

      <td style="max-width:500px;word-break:break-word;">
        ${UI.escape(l.detail || '-')}
      </td>
    </tr>
  `);

  UI.renderTable(
    'logs-tbody',
    rows,
    'Belum ada log sistem'
  );

  lucide.createIcons({
    nodes: [document.getElementById('logs-tbody')]
  });
}

  function search(term) {
  Pagination.reset('logs');
    if (!term.trim()) { renderTable(allData); return; }
    const t = term.toLowerCase();
    renderTable(allData.filter(l =>
      (l.event||'').toLowerCase().includes(t) ||
      (l.detail||'').toLowerCase().includes(t) ||
      (l.user||'').toLowerCase().includes(t) ||
      (EVENT_LABELS[l.event]||'').toLowerCase().includes(t)
    ));
  }

  async function clearLogs() {
    if (API.currentRole() !== 'OWNER') { UI.toast('Hanya Owner yang dapat menghapus log','error'); return; }
    if (!allData.length) { UI.toast('Log sudah kosong','info'); return; }
    if (!await UI.confirmDanger(`Hapus semua ${allData.length} log sistem? Tindakan ini tidak dapat dibatalkan.`, 'HAPUS LOG')) return;
    lastDeletedData = [...allData];
    lastAction = 'DELETE_ALL';
    UI.toast('Menghapus semua log...','info');
    try {
      const res = await API.logs.clearAll();
      if (res.status === 'OK') {
        allData = [];
        renderTable([]);
        UI.toast('Semua log berhasil dihapus. Data masih bisa dilihat via Undo (sesi ini).','warning');
        _updateBtns();
      } else {
        UI.toast(res.message || 'Gagal menghapus log','error');
        lastAction = null; lastDeletedData = null;
        _updateBtns();
      }
    } catch(e) { UI.toast('Gagal terhubung ke server','error'); lastAction = null; _updateBtns(); }
  }

  function undo() {
    if (lastAction !== 'DELETE_ALL' || !lastDeletedData?.length) return;
    // Log sudah dihapus dari server — tampilkan in-memory saja
    allData = lastDeletedData;
    renderTable(allData);
    lastAction = 'UNDO';
    _updateBtns();
    UI.toast('Menampilkan log sebelum dihapus (tampilan sementara sesi ini)','info');
  }

  function redo() {
    if (lastAction !== 'UNDO') return;
    allData = [];
    renderTable([]);
    lastAction = 'DELETE_ALL';
    _updateBtns();
  }

  function _updateBtns() {
    const u = document.getElementById('logs-undo-btn');
    const r = document.getElementById('logs-redo-btn');
    if (u) u.disabled = lastAction !== 'DELETE_ALL';
    if (r) r.disabled = lastAction !== 'UNDO';
  }


  // ── Export functions ─────────────────────────────────────────────────────
  function exportExcel() {
    const headers = ['Timestamp', 'Level', 'Event', 'Detail', 'User'];
    const rows    = allData.map(l => [l.timestamp, l.level || '-', l.event || '-', l.detail || '-', l.user || 'system']);
    UI.exportExcel(headers, rows, 'System_Logs', 'Logs');
  }

  function exportPDF() {
    const headers = ['Timestamp', 'Level', 'Event', 'Detail', 'User'];
    const rows    = allData.map(l => [l.timestamp, l.level || '-', l.event || '-', l.detail || '-', l.user || 'system']);
    UI.exportPDF('System Logs', headers, rows, {subtitle: 'Log aktivitas sistem EduHome'});
  }

  return { load, search, clearLogs, undo, redo, renderRows,
    exportExcel, exportPDF
  };

})();

window.LogsPage = LogsPage;