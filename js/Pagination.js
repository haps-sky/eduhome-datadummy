const Pagination = (() => {
 
  // State per halaman, key = tableKey (e.g. 'murid', 'presensi')
  const _state = {};
 
  // Default page size options
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const DEFAULT_PAGE_SIZE = 25;
 
  // ─── Config tabel yang didaftarkan ───────────────────────────────────────
  // Daftar semua tabel yang pakai pagination.
  // page()      → fungsi yang mengembalikan Page module (MuridPage, dll)
  // tbodyId     → id elemen tbody di HTML
  // containerId → id elemen tempat pagination bar dirender
  const TABLES = {
    spplist:  { page: () => SPPList,         tbodyId: 'spp-lv-murid-list', containerId: 'spp-lv-pagination' },
    murid:    { page: () => MuridPage,       tbodyId: 'murid-tbody',    containerId: 'murid-pagination'    },
    mentor:   { page: () => MentorPage,      tbodyId: 'mentor-tbody',   containerId: 'mentor-pagination'   },
    presensi: { page: () => PresensiPage,    tbodyId: 'presensi-tbody', containerId: 'presensi-pagination' },
    pay:      { page: () => PembayaranPage,  tbodyId: 'pay-tbody',      containerId: 'pay-pagination'      },
    ops:      { page: () => OperasionalPage, tbodyId: 'ops-tbody',      containerId: 'ops-pagination'      },
    spp:      { page: () => SPPPage,         tbodyId: 'spp-tbody',      containerId: 'spp-pagination'      },
    buku:     { page: () => BukuPage,        tbodyId: 'buku-tbody',     containerId: 'buku-pagination'     },
    gaji:     { page: () => GajiPage,        tbodyId: 'gaji-tbody',     containerId: 'gaji-pagination'     },
    logs:     { page: () => LogsPage,        tbodyId: 'logs-tbody',     containerId: 'logs-pagination'     },
    program:  { page: () => ProgramPage,     tbodyId: 'program-tbody',  containerId: 'program-pagination'  },
    hadiahProgress: { page: () => HadiahPage.progressPager, tbodyId: 'hadiah-progress-list', containerId: 'hadiah-progress-pagination' },
    hadiahRiwayat:  { page: () => HadiahPage.riwayatPager,  tbodyId: 'hadiah-riwayat-tbody',  containerId: 'hadiah-riwayat-pagination'  },
    hadiahTier:     { page: () => HadiahPage.tierPager,     tbodyId: 'hadiah-tier-tbody',      containerId: 'hadiah-tier-pagination'     },
  };
 
  // ─── Init state untuk satu key ───────────────────────────────────────────
  function _getState(key) {
    if (!_state[key]) {
      _state[key] = {
        currentPage: 1,
        pageSize:    _loadPageSize(key),
        totalItems:  0,
        data:        []   // data lengkap yang sedang ditampilkan
      };
    }
    return _state[key];
  }
 
  // ─── Simpan preferensi page size ke localStorage ─────────────────────────
  function _savePageSize(key, size) {
    try { localStorage.setItem('eduhome_pgsize_' + key, size); } catch(e) {}
  }
 
  function _loadPageSize(key) {
    try {
      const saved = localStorage.getItem('eduhome_pgsize_' + key);
      const n     = parseInt(saved, 10);
      return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
    } catch(e) { return DEFAULT_PAGE_SIZE; }
  }
 
  // ─── Fungsi utama: set data dan render halaman pertama ───────────────────
  // Dipanggil dari renderTable() di tiap Page module sebagai pengganti
  // langsung render semua baris.
  function setData(key, data) {
    const s          = _getState(key);
    s.data           = data || [];
    s.totalItems     = s.data.length;
    s.currentPage    = 1;   // reset ke halaman 1 setiap data baru masuk
    _renderPage(key);
    _renderBar(key);
  }
 
  // ─── Render baris untuk halaman saat ini ─────────────────────────────────
  function _renderPage(key) {
    const s      = _getState(key);
    const cfg    = TABLES[key];
    const page   = cfg?.page();
    if (!page?.renderRows) return;
 
    const start  = (s.currentPage - 1) * s.pageSize;
    const slice  = s.data.slice(start, start + s.pageSize);
 
    // renderRows adalah fungsi BARU yang harus ada di tiap Page module
    // (lihat bagian modifikasi di bawah)
    page.renderRows(slice, s.data.length);
  }
 
  // ─── Render pagination bar di container ──────────────────────────────────
  function _renderBar(key) {
    const s         = _getState(key);
    const container = document.getElementById(TABLES[key]?.containerId);
    if (!container) return;
 
    const totalPages = Math.ceil(s.totalItems / s.pageSize) || 1;
    const from       = s.totalItems === 0 ? 0 : (s.currentPage - 1) * s.pageSize + 1;
    const to         = Math.min(s.currentPage * s.pageSize, s.totalItems);
 
    // Page number buttons — tampilkan max 5 halaman di sekitar current
    _currentKey    = key;   // ← fix: set sebelum _buildPageButtons dipanggil
    const pageBtns = _buildPageButtons(s.currentPage, totalPages);
 
    container.innerHTML = `
      <div class="pagination-bar">
        <div class="pagination-info">
          Menampilkan <strong>${from}–${to}</strong> dari <strong>${s.totalItems}</strong> data
        </div>
        <div class="pagination-controls">
          <button class="pg-btn pg-nav ${s.currentPage === 1 ? 'pg-disabled' : ''}"
                  onclick="Pagination.goTo('${key}', ${s.currentPage - 1})"
                  ${s.currentPage === 1 ? 'disabled' : ''} title="Sebelumnya">
            <i data-lucide="chevron-left"></i>
          </button>
          ${pageBtns}
          <button class="pg-btn pg-nav ${s.currentPage === totalPages ? 'pg-disabled' : ''}"
                  onclick="Pagination.goTo('${key}', ${s.currentPage + 1})"
                  ${s.currentPage === totalPages ? 'disabled' : ''} title="Berikutnya">
            <i data-lucide="chevron-right"></i>
          </button>
        </div>
        <div class="pagination-size">
          <label style="font-size:0.75rem;color:var(--text-secondary);">Baris:</label>
          <select class="pg-size-select" onchange="Pagination.setPageSize('${key}', parseInt(this.value))">
            ${PAGE_SIZE_OPTIONS.map(n =>
              `<option value="${n}" ${n === s.pageSize ? 'selected' : ''}>${n}</option>`
            ).join('')}
          </select>
        </div>
      </div>`;
 
    if (window.lucide) lucide.createIcons({ nodes: [container] });
  }
 
  // ─── Build page number buttons ────────────────────────────────────────────
  function _buildPageButtons(current, total) {
    if (total <= 1) return '';
 
    const pages = [];
    let   start = Math.max(1, current - 2);
    let   end   = Math.min(total, start + 4);
    if (end - start < 4) start = Math.max(1, end - 4);
 
    if (start > 1) {
      pages.push(`<button class="pg-btn" onclick="Pagination.goTo('${_currentKey}', 1)">1</button>`);
      if (start > 2) pages.push(`<span class="pg-ellipsis">…</span>`);
    }
 
    for (let i = start; i <= end; i++) {
      pages.push(`<button class="pg-btn ${i === current ? 'pg-active' : ''}"
        onclick="Pagination.goTo('${_currentKey}', ${i})">${i}</button>`);
    }
 
    if (end < total) {
      if (end < total - 1) pages.push(`<span class="pg-ellipsis">…</span>`);
      pages.push(`<button class="pg-btn" onclick="Pagination.goTo('${_currentKey}', ${total})">${total}</button>`);
    }
 
    return pages.join('');
  }
 
  // Trick: _currentKey dipakai saat build page buttons (closure issue di template literal)
  let _currentKey = '';
 
  // Override _renderBar untuk set _currentKey sebelum build buttons
  const _origRenderBar = _renderBar;
 
  // ─── Public: pindah ke halaman tertentu ──────────────────────────────────
  function goTo(key, page) {
    const s          = _getState(key);
    const totalPages = Math.ceil(s.totalItems / s.pageSize) || 1;
    s.currentPage    = Math.max(1, Math.min(page, totalPages));
    _currentKey      = key;
    _renderPage(key);
    _renderBar(key);
 
    // Scroll ke atas tabel
    const tbody = document.getElementById(TABLES[key]?.tbodyId);
    if (tbody) {
      const table = tbody.closest('.table-wrap') || tbody.closest('table');
      if (table) table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
 
  // ─── Public: ubah page size ───────────────────────────────────────────────
  function setPageSize(key, size) {
    if (!PAGE_SIZE_OPTIONS.includes(size)) return;
    const s       = _getState(key);
    s.pageSize    = size;
    s.currentPage = 1;
    _savePageSize(key, size);
    _currentKey   = key;
    _renderPage(key);
    _renderBar(key);
  }
 
  // ─── Public: reset ke halaman 1 (dipanggil saat search/filter) ───────────
  function reset(key) {
    const s       = _getState(key);
    s.currentPage = 1;
  }
 
  // ─── Public: ambil slice data saat ini (untuk keperluan export dll) ───────
  function getCurrentSlice(key) {
    const s     = _getState(key);
    const start = (s.currentPage - 1) * s.pageSize;
    return s.data.slice(start, start + s.pageSize);
  }
 
  // ─── CSS yang diinjeksi ke <head> ────────────────────────────────────────
  function _injectStyles() {
    if (document.getElementById('pagination-styles')) return;
    const style = document.createElement('style');
    style.id    = 'pagination-styles';
    style.textContent = `
      /* ── Pagination container ── */
      .pagination-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;

        gap: 10px;
        padding: 14px 18px;

        border-top: 1px solid var(--border);
      }
      .pagination-info {
        font-size: 0.75rem;
        color: var(--text-secondary);
        white-space: nowrap;
      }
      .pagination-controls {
        display: flex;
        align-items: center;
        gap: 3px;
        flex-wrap: wrap;

        margin-left: auto;
      }
      .pagination-size {
        display: flex;
        align-items: center;
        gap: 6px;
      }
 
      /* ── Buttons ── */
      .pg-btn {
        min-width: 30px;
        height: 30px;
        padding: 0 7px;
        border: 1px solid var(--border);
        border-radius: var(--radius, 6px);
        background: var(--bg-card);
        color: var(--text-primary);
        font-size: 0.78rem;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s, border-color 0.15s;
      }
      .pg-btn:hover:not(:disabled) {
        background: var(--bg-hover);
        border-color: var(--primary);
        color: var(--primary);
      }
      .pg-btn.pg-active {
        background: var(--primary);
        border-color: var(--primary);
        color: #fff;
        font-weight: 600;
      }
      .pg-btn.pg-disabled,
      .pg-btn:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
      .pg-btn.pg-nav i,
      .pg-btn.pg-nav svg {
        width: 13px;
        height: 13px;
      }
      .pg-ellipsis {
        font-size: 0.78rem;
        color: var(--text-secondary);
        padding: 0 2px;
        line-height: 30px;
      }
 
      /* ── Page size select ── */
      .pg-size-select {
        height: 30px;
        padding: 0 6px;
        border: 1px solid var(--border);
        border-radius: var(--radius, 6px);
        background: var(--bg-card);
        color: var(--text-primary);
        font-size: 0.78rem;
        cursor: pointer;
      }
      .pg-size-select:focus {
        outline: none;
        border-color: var(--primary);
      }
 
      /* ── Mobile: sembunyikan info, susun ulang ── */
      @media (max-width: 480px) {
        .pagination-bar {
          justify-content: center;
        }
        .pagination-info {
          display: none;
        }
        .pg-btn {
          min-width: 28px;
          height: 28px;
          font-size: 0.72rem;
        }
      }
    `;
    document.head.appendChild(style);
  }
 
  // Inject styles saat module dimuat
  _injectStyles();
 
  return { setData, goTo, setPageSize, reset, getCurrentSlice };
 
})();
 
window.Pagination = Pagination;