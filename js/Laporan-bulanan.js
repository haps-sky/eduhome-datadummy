const LaporanBulananPage = (() => {
  let _lastData   = null;
  let _ownerPct   = 65;
  let _savingsPct = 15;
  let _activeTab  = 'pemasukan';

  const monthNames = ['','Januari','Februari','Maret','April','Mei','Juni',
                      'Juli','Agustus','September','Oktober','November','Desember'];

  async function load(month, year) {
    const now = new Date();
    month = month || (now.getMonth() + 1);
    year  = year  || now.getFullYear();

    _setLoadingState(true);

    try {
      const res = await API.laporan.getBulanan(month, year, _ownerPct, _savingsPct);
      console.log('DATA LAPORAN:', res);

      if (res.status !== 'OK') {
        UI.toast(res.message || 'Gagal memuat laporan', 'error');
        _renderFullEmpty(month, year);
        return;
      }

      _lastData = res.data;
      _render(res.data, month, year);

    } catch(e) {
      console.error('LaporanBulanan load error:', e);
      UI.toast('Gagal terhubung ke server', 'error');
      _renderFullEmpty(month, year);
    } finally {
      _setLoadingState(false);
    }
  }

  function _render(d, month, year) {
    if (!d) { _renderFullEmpty(month, year); return; }

    // Baca dari input type=month jika ada, fallback ke select
    const _monthInputVal = document.getElementById('laporan-month-input')?.value;
    const _month = d.month
      || month
      || (_monthInputVal ? parseInt(_monthInputVal.split('-')[1]) : null)
      || parseInt(document.getElementById('laporan-month-select')?.value)
      || (new Date().getMonth() + 1);
    const _year = d.year
      || year
      || (_monthInputVal ? parseInt(_monthInputVal.split('-')[0]) : null)
      || parseInt(document.getElementById('laporan-year-select')?.value)
      || new Date().getFullYear();

    const periodEl = document.getElementById('laporan-period-label');
    if (periodEl) periodEl.textContent = `${monthNames[_month] || '-'} ${_year}`;

    _setVal('laporan-rev-spp',         d.revenue?.spp);
    _setVal('laporan-rev-buku',        d.revenue?.buku);
    _setVal('laporan-rev-pendaftaran', d.revenue?.pendaftaran);
    _setVal('laporan-rev-lain',        d.revenue?.lain);
    _setVal('laporan-rev-total',       d.revenue?.total);

    _setVal('laporan-exp-gaji',        d.expense?.gaji);
    _setVal('laporan-exp-buku',        d.expense?.buku);
    _setVal('laporan-exp-operasional', d.expense?.operasional);
    _setVal('laporan-exp-total',       d.expense?.total);

    const net   = d.net_profit ?? 0;
    const netEl = document.getElementById('laporan-net-profit');
    if (netEl) {
      netEl.textContent = UI.formatCurrency(net);
      netEl.className   = net >= 0 ? 'laporan-value profit-positive' : 'laporan-value profit-negative';
    }

    _setVal('laporan-dist-owner',   d.distribution?.owner);
    _setVal('laporan-dist-savings', d.distribution?.savings);

    const pctOwnerEl = document.getElementById('laporan-owner-pct-display');
    if (pctOwnerEl) pctOwnerEl.textContent = `${d.distribution?.owner_pct ?? _ownerPct}%`;
    const pctSavEl = document.getElementById('laporan-savings-pct-display');
    if (pctSavEl) pctSavEl.textContent = `${d.distribution?.savings_pct ?? _savingsPct}%`;

    const meta   = d.meta || {};
    const metaEl = document.getElementById('laporan-meta');
    if (metaEl) {
      const masuk  = meta.total_transaksi_masuk  ?? 0;
      const keluar = meta.total_transaksi_keluar ?? 0;
      const gaji   = meta.total_gaji_records     ?? 0;
      metaEl.textContent = `${masuk} transaksi masuk · ${keluar} transaksi keluar · ${gaji} catatan gaji`;
    }

    _renderEmptyBanner(d, _month, _year);
    _renderProfitIndicator(d);
    _renderTabUI();
    _renderActiveTab(d);
  }

  let _isLoading = false;

  function _setLoadingState(loading) {
    _isLoading = loading;
    const tbody    = document.getElementById('laporan-gaji-tbody');
    const bannerEl = document.getElementById('laporan-empty-banner');
    const contentEl = document.getElementById('laporan-content');

    if (contentEl) {
      contentEl.style.opacity        = loading ? '0.45' : '1';
      contentEl.style.pointerEvents  = loading ? 'none' : '';
      contentEl.style.transition     = 'opacity .15s ease';
    }
    // Nonaktifkan tombol nav bulan selama fetch — cegah klik beruntun yang
    // bikin request tabrakan (misal spam panah kanan pas belum selesai load).
    _renderMonthNav();

    if (loading) {
      _renderTabUI();
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="laporan-loading-cell">
              <span class="laporan-loading-spinner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Memuat laporan...
              </span>
            </td>
          </tr>`;
      }
      if (bannerEl) bannerEl.style.display = 'none';
    }
  }

  function _renderEmptyBanner(d, month, year) {
    const bannerEl = document.getElementById('laporan-empty-banner');
    if (!bannerEl) return;

    const revTotal = d.revenue?.total  ?? 0;
    const expTotal = d.expense?.total  ?? 0;
    const isEmpty  = revTotal === 0 && expTotal === 0;

    if (isEmpty) {
      bannerEl.style.display = 'block';
      bannerEl.innerHTML = `
        <div class="laporan-empty-box">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning,#f59e0b)" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>
            Belum ada transaksi pada
            <strong>${monthNames[month] || '-'} ${year}</strong>.
            Semua nilai ditampilkan sebagai <strong>Rp 0</strong>.
          </span>
        </div>`;
    } else {
      bannerEl.style.display = 'none';
      bannerEl.innerHTML = '';
    }
  }

  function _renderFullEmpty(month, year) {
    const now    = new Date();
    const _month = month || (now.getMonth() + 1);
    const _year  = year  || now.getFullYear();

    _setVal('laporan-rev-spp', 0);         _setVal('laporan-rev-buku', 0);
    _setVal('laporan-rev-pendaftaran', 0); _setVal('laporan-rev-lain', 0);
    _setVal('laporan-rev-total', 0);

    _setVal('laporan-exp-gaji', 0);        _setVal('laporan-exp-buku', 0);
    _setVal('laporan-exp-operasional', 0); _setVal('laporan-exp-total', 0);
    _setVal('laporan-dist-owner', 0);      _setVal('laporan-dist-savings', 0);

    const netEl = document.getElementById('laporan-net-profit');
    if (netEl) { netEl.textContent = UI.formatCurrency(0); netEl.className = 'laporan-value profit-positive'; }

    const metaEl = document.getElementById('laporan-meta');
    if (metaEl) metaEl.textContent = '0 transaksi masuk · 0 transaksi keluar · 0 catatan gaji';

    const tbody = document.getElementById('laporan-gaji-tbody');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="laporan-loading-cell">
            Belum ada data untuk periode ini
          </td>
        </tr>`;
    }

    const bar = document.getElementById('laporan-profit-bar');
    if (bar) {
      bar.innerHTML = `
        <div class="laporan-profit-bar-empty"></div>
        <div class="laporan-profit-bar-empty-label">
          <span>Belum ada data</span><span>—</span>
        </div>`;
    }

    _renderEmptyBanner({ revenue: { total: 0 }, expense: { total: 0 } }, _month, _year);
  }

  function _renderTabUI() {
    const container = document.getElementById('laporan-gaji-tbody')?.closest('.card');
    if (!container) return;
    if (container.querySelector('.laporan-tab-bar')) return;

    const headerTitle = container.querySelector('.card-title');
    if (headerTitle) headerTitle.innerHTML = '<i data-lucide="list"></i> Detail Transaksi Bulan Ini';

    const tableEl = container.querySelector('table');
    if (!tableEl) return;

    const tabBar = document.createElement('div');
    tabBar.className = 'laporan-tab-bar';
    tabBar.innerHTML = `
      <button id="tab-btn-pemasukan" class="laporan-tab-btn active-pemasukan"
        onclick="LaporanBulananPage.switchTab('pemasukan')">
        ↑ Pemasukan
      </button>
      <button id="tab-btn-pengeluaran" class="laporan-tab-btn"
        onclick="LaporanBulananPage.switchTab('pengeluaran')">
        ↓ Pengeluaran
      </button>`;

    const tableWrapper = tableEl.parentNode;
    tableWrapper.insertBefore(tabBar, tableEl);

    const thead = tableEl.querySelector('thead');
    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Tanggal</th><th>Nama</th><th>Jenis</th>
          <th>Keterangan</th><th>Jumlah</th><th>Metode</th>
        </tr>`;
    }

    if (window.lucide) lucide.createIcons({ nodes: [container] });
  }

  function switchTab(tab) {
    _activeTab = tab;
    const btnMasuk  = document.getElementById('tab-btn-pemasukan');
    const btnKeluar = document.getElementById('tab-btn-pengeluaran');
    if (btnMasuk) {
      btnMasuk.classList.toggle('active-pemasukan',   tab === 'pemasukan');
    }
    if (btnKeluar) {
      btnKeluar.classList.toggle('active-pengeluaran', tab === 'pengeluaran');
    }
    if (_lastData) _renderActiveTab(_lastData);
  }

  function _renderActiveTab(d) {
    if (_activeTab === 'pemasukan') {
      _renderDetailTable(d.detail?.pemasukan || [], 'masuk');
    } else {
      _renderDetailTable(d.detail?.pengeluaran || [], 'keluar');
    }
  }

  function _renderDetailTable(list, arah) {
    const tbody = document.getElementById('laporan-gaji-tbody');
    if (!tbody) return;

    if (!list || !list.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="laporan-empty-cell">
            Tidak ada ${arah === 'masuk' ? 'pemasukan' : 'pengeluaran'} bulan ini
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = list.map(item => {
      const isGaji    = item.kategori === 'gaji';
      const jenisHtml = isGaji
        ? `<span class="laporan-badge laporan-badge-gaji">GAJI</span>`
        : `<span class="laporan-badge laporan-badge-default">${item.jenis || '-'}</span>`;
      return `
        <tr>
          <td class="laporan-td-tanggal">${item.tanggal ? UI.formatDate(item.tanggal) : '-'}</td>
          <td><strong>${item.nama || '-'}</strong></td>
          <td>${jenisHtml}</td>
          <td class="laporan-td-keterangan">${item.keterangan || '-'}</td>
          <td class="laporan-td-jumlah ${arah}">${UI.formatCurrency(item.jumlah ?? 0)}</td>
          <td class="laporan-td-metode">${item.metode || '-'}</td>
        </tr>`;
    }).join('');
  }

  function _renderProfitIndicator(d) {
    const el       = document.getElementById('laporan-profit-bar');
    if (!el) return;
    const revTotal = d?.revenue?.total ?? 0;
    const expTotal = d?.expense?.total ?? 0;

    if (revTotal === 0) {
      el.innerHTML = `
        <div class="laporan-profit-bar-empty"></div>
        <div class="laporan-profit-bar-empty-label">
          <span>Belum ada pemasukan</span><span>—</span>
        </div>`;
      return;
    }

    const expPct  = Math.min(100, Math.round((expTotal / revTotal) * 100));
    const profPct = 100 - expPct;
    el.innerHTML = `
      <div class="laporan-profit-bar-wrap">
        <div class="laporan-profit-bar-segment profit" style="flex:${profPct||1}" title="Profit ${profPct}%"></div>
        <div class="laporan-profit-bar-segment expense" style="flex:${expPct||1}" title="Expense ${expPct}%"></div>
      </div>
      <div class="laporan-profit-bar-labels">
        <span>Profit ${profPct}%</span><span>Expense ${expPct}%</span>
      </div>`;
  }

  function _setVal(id, amount) {
    const el = document.getElementById(id);
    if (el) el.textContent = UI.formatCurrency(amount ?? 0);
  }

  function onMonthChange() {
    // Sync dari input type=month ke hidden selects
    const monthInput = document.getElementById('laporan-month-input');
    let month = null, year = null;
    if (monthInput && monthInput.value) {
      const [y, m] = monthInput.value.split('-');
      month = parseInt(m);
      year  = parseInt(y);
      const monthSel = document.getElementById('laporan-month-select');
      const yearSel  = document.getElementById('laporan-year-select');
      if (monthSel) monthSel.value = month;
      if (yearSel)  yearSel.value  = year;
    }
    _renderMonthNav();
    // WAJIB kirim month/year eksplisit — load() tanpa argumen fallback ke
    // bulan kalender hari ini, bukan bulan yang baru dipilih via nav/picker.
    load(month, year);
  }

  // ── Month nav — gaya sama seperti PembayaranPage: panah prev/next + pill
  //    bulan yang bisa diklik buat buka picker bulan/tahun. Input
  //    type="month" tetap ada di DOM (disembunyikan) sebagai sumber
  //    kebenaran nilai, supaya semua logic lain (load, refresh,
  //    _getActivePeriod, export) yang sudah baca dari situ tidak perlu diubah.
  function _getMonthLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${names[parseInt(m)-1]} ${y}`;
  }

  function _getActiveMonthValue() {
    const monthInput = document.getElementById('laporan-month-input');
    if (monthInput?.value) return monthInput.value;
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  function _setActiveMonthValue(ym) {
    const monthInput = document.getElementById('laporan-month-input');
    if (monthInput) monthInput.value = ym;
    onMonthChange();
  }

  function _renderMonthNav() {
    const el = document.getElementById('laporan-month-nav');
    if (!el) return;
    const ym = _getActiveMonthValue();
    const dis = _isLoading ? 'disabled' : '';
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="ctrl-btn icon-only" ${dis} onclick="LaporanBulananPage.prevMonth()" title="Bulan sebelumnya">
          <i data-lucide="chevron-left"></i>
        </button>
        <button class="ctrl-btn" id="laporan-month-label" ${dis}
                onclick="LaporanBulananPage.openMonthPicker()"
                style="min-width:110px;font-weight:600;justify-content:center;gap:4px;">
          ${_isLoading
            ? '<div class="spinner spinner-sm"></div>'
            : '<i data-lucide="calendar"></i>'}
          ${_getMonthLabel(ym)}
        </button>
        <button class="ctrl-btn icon-only" ${dis} onclick="LaporanBulananPage.nextMonth()" title="Bulan berikutnya">
          <i data-lucide="chevron-right"></i>
        </button>
      </div>`;
    lucide.createIcons({ nodes: [el] });
  }

  function prevMonth() {
    const [y, m] = _getActiveMonthValue().split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    _setActiveMonthValue(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }

  function nextMonth() {
    const [y, m] = _getActiveMonthValue().split('-').map(Number);
    const d = new Date(y, m, 1);
    _setActiveMonthValue(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  }

  function openMonthPicker() {
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

    const existing = document.getElementById('laporan-month-picker-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'laporan-month-picker-popup';
    popup.style.cssText = `position:fixed;z-index:9999;background:var(--bg-card);border:1px solid var(--border);
      border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:260px;`;

    const btn = document.getElementById('laporan-month-label');
    if (btn) {
      const r = btn.getBoundingClientRect();
      popup.style.top  = (r.bottom + 8) + 'px';
      popup.style.left = r.left + 'px';
    }

    const activeYm = _getActiveMonthValue();
    let selYear = parseInt(activeYm.split('-')[0]);

    const render = () => {
      popup.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <button id="laporan-picker-prev" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">‹</button>
          <strong style="color:var(--text-primary);font-size:1rem;">${selYear}</strong>
          <button id="laporan-picker-next" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
          ${months.map((mn, i) => {
            const ym2    = selYear + '-' + String(i+1).padStart(2,'0');
            const active = ym2 === activeYm;
            return `<button onclick="LaporanBulananPage._setMonthFromPicker('${ym2}')"
              style="padding:7px 4px;border-radius:8px;border:1px solid ${active ? 'var(--primary)' : 'var(--border)'};
                     background:${active ? 'var(--primary)' : 'var(--bg-surface)'};
                     color:${active ? '#fff' : 'var(--text-primary)'};font-size:0.82rem;cursor:pointer;font-weight:${active ? '700' : '400'};">
              ${mn}
            </button>`;
          }).join('')}
        </div>`;

      popup.querySelector('#laporan-picker-prev').addEventListener('click', (e) => { e.stopPropagation(); selYear--; render(); });
      popup.querySelector('#laporan-picker-next').addEventListener('click', (e) => { e.stopPropagation(); selYear++; render(); });
    };

    render();
    document.body.appendChild(popup);
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!popup.contains(e.target) && e.target.id !== 'laporan-month-label') {
          popup.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 100);
  }

  function _setMonthFromPicker(ym) {
    _setActiveMonthValue(ym);
    document.getElementById('laporan-month-picker-popup')?.remove();
  }

  function onPctChange() {
    const ownerInput   = document.getElementById('laporan-owner-pct');
    const savingsInput = document.getElementById('laporan-savings-pct');
    if (!ownerInput || !savingsInput) return;
    const newOwner   = Math.min(100, Math.max(0, parseInt(ownerInput.value)   || 0));
    const newSavings = Math.min(100, Math.max(0, parseInt(savingsInput.value) || 0));
    if (newOwner + newSavings > 100) { UI.toast('Total persentase tidak boleh > 100%', 'error'); return; }
    _ownerPct   = newOwner;
    _savingsPct = newSavings;
    if (_lastData) {
      const net     = _lastData.net_profit ?? 0;
      const owner   = net > 0 ? Math.round(net * (_ownerPct   / 100)) : 0;
      const savings = net > 0 ? Math.round(net * (_savingsPct / 100)) : 0;
      _setVal('laporan-dist-owner',   owner);
      _setVal('laporan-dist-savings', savings);
      const pctOwnerEl = document.getElementById('laporan-owner-pct-display');
      if (pctOwnerEl) pctOwnerEl.textContent = `${_ownerPct}%`;
      const pctSavEl = document.getElementById('laporan-savings-pct-display');
      if (pctSavEl) pctSavEl.textContent = `${_savingsPct}%`;
    }
  }

  function refresh() {
    const monthInput = document.getElementById('laporan-month-input');
    if (monthInput?.value) {
      const [y, m] = monthInput.value.split('-');
      load(parseInt(m), parseInt(y));
    } else {
      const m = document.getElementById('laporan-month-select')?.value;
      const y = document.getElementById('laporan-year-select')?.value;
      load(parseInt(m) || null, parseInt(y) || null);
    }
  }

  // ── Helper: ambil periode aktif ───────────────────────────────────────────
  function _getActivePeriod() {
    const monthInput = document.getElementById('laporan-month-input');
    let m, y;
    if (monthInput?.value) {
      const parts = monthInput.value.split('-');
      y = parseInt(parts[0]);
      m = parseInt(parts[1]);
    } else {
      m = parseInt(document.getElementById('laporan-month-select')?.value) || (new Date().getMonth() + 1);
      y = parseInt(document.getElementById('laporan-year-select')?.value)  || new Date().getFullYear();
    }
    return { month: m, year: y, label: `${monthNames[m]} ${y}` };
  }

  // ── Helper: format angka ke Rupiah plain text (untuk export) ──────────────
  function _fmtRp(val) {
    const n = val ?? 0;
    return 'Rp ' + Number(n).toLocaleString('id-ID');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPORT EXCEL
  // Menggunakan SheetJS (xlsx) — pastikan sudah di-load di HTML:
  // <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
  // ════════════════════════════════════════════════════════════════════════════
  function exportExcel() {
    if (!_lastData) { UI.toast('Belum ada data laporan untuk diekspor', 'warning'); return; }
    if (typeof XLSX === 'undefined') {
      UI.toast('Library SheetJS belum dimuat. Tambahkan script XLSX di HTML.', 'error');
      console.error('exportExcel: XLSX (SheetJS) is not loaded.');
      return;
    }

    const d = _lastData;
    const { label } = _getActivePeriod();

    // ── Sheet 1: Ringkasan ────────────────────────────────────────────────────
    const ringkasan = [
      ['LAPORAN LABA RUGI — EduHome Bimbel'],
      [`Periode: ${label}`],
      [`Dicetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`],
      [],
      ['PEMASUKAN', ''],
      ['Pembayaran SPP',   d.revenue?.spp         ?? 0],
      ['Penjualan Buku',   d.revenue?.buku         ?? 0],
      ['Pendaftaran',      d.revenue?.pendaftaran  ?? 0],
      ['Lain-lain',        d.revenue?.lain         ?? 0],
      ['Total Pemasukan',  d.revenue?.total        ?? 0],
      [],
      ['PENGELUARAN', ''],
      ['Gaji Mentor',      d.expense?.gaji         ?? 0],
      ['Pembelian Buku',   d.expense?.buku         ?? 0],
      ['Operasional',      d.expense?.operasional  ?? 0],
      ['Total Pengeluaran',d.expense?.total        ?? 0],
      [],
      ['LABA BERSIH',      d.net_profit            ?? 0],
      [],
      ['DISTRIBUSI', ''],
      [`Pemilik (${d.distribution?.owner_pct ?? _ownerPct}%)`,   d.distribution?.owner   ?? 0],
      [`Tabungan (${d.distribution?.savings_pct ?? _savingsPct}%)`, d.distribution?.savings ?? 0],
    ];

    const wsRingkasan = XLSX.utils.aoa_to_sheet(ringkasan);

    // Style lebar kolom
    wsRingkasan['!cols'] = [{ wch: 30 }, { wch: 20 }];

    // ── Sheet 2: Detail Transaksi ──────────────────────────────────────────────
    const header = ['Tanggal', 'Nama', 'Jenis', 'Kategori', 'Keterangan', 'Jumlah', 'Metode', 'Arah'];
    const pemasukan  = (d.detail?.pemasukan  || []).map(r => [
      r.tanggal ? UI.formatDate(r.tanggal) : '-',
      r.nama || '-', r.jenis || '-', r.kategori || '-',
      r.keterangan || '-', r.jumlah ?? 0, r.metode || '-', 'Pemasukan'
    ]);
    const pengeluaran = (d.detail?.pengeluaran || []).map(r => [
      r.tanggal ? UI.formatDate(r.tanggal) : '-',
      r.nama || '-', r.jenis || '-', r.kategori || '-',
      r.keterangan || '-', r.jumlah ?? 0, r.metode || '-', 'Pengeluaran'
    ]);

    const wsDetail = XLSX.utils.aoa_to_sheet([header, ...pemasukan, ...pengeluaran]);
    wsDetail['!cols'] = [
      { wch: 14 }, { wch: 22 }, { wch: 16 }, { wch: 14 },
      { wch: 30 }, { wch: 18 }, { wch: 12 }, { wch: 12 }
    ];

    // ── Buat workbook & download ──────────────────────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsRingkasan, 'Ringkasan');
    XLSX.utils.book_append_sheet(wb, wsDetail,    'Detail Transaksi');

    const fileName = `LaporanLabaRugi_${label.replace(' ', '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
    UI.toast(`Excel berhasil diunduh: ${fileName}`, 'success');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXPORT PDF
  // Menggunakan jsPDF + autoTable — pastikan sudah di-load di HTML:
  // <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  // <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
  // ════════════════════════════════════════════════════════════════════════════
  function exportPDF() {
    if (!_lastData) { UI.toast('Belum ada data laporan untuk diekspor', 'warning'); return; }

    const d             = _lastData;
    const { label }     = _getActivePeriod();
    const tglCetak      = new Date().toLocaleDateString('id-ID', { dateStyle: 'long' });
    const fileName      = `LaporanLabaRugi_${label.replace(/\s/g, '_')}.pdf`;
    const net           = d.net_profit ?? 0;
    const netColor      = net >= 0 ? '#1a7a52' : '#b43c3c';
    const ownerPct      = d.distribution?.owner_pct   ?? _ownerPct;
    const savPct        = d.distribution?.savings_pct ?? _savingsPct;
    const ownerVal      = d.distribution?.owner       ?? 0;
    const savVal        = d.distribution?.savings     ?? 0;

    const fmtRp = v => 'Rp ' + Number(v || 0).toLocaleString('id-ID');

    // ── Baris detail pemasukan ────────────────────────────────────────────────
    const rowsPemasukan = (d.detail?.pemasukan || []).map(r => `
      <tr>
        <td>${r.tanggal ? UI.formatDate(r.tanggal) : '-'}</td>
        <td>${r.nama || '-'}</td>
        <td>${r.jenis || '-'}</td>
        <td>${r.keterangan || '-'}</td>
        <td style="text-align:right;font-weight:600;color:#1a7a52">${fmtRp(r.jumlah)}</td>
        <td>${r.metode || '-'}</td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#9ca3af">Tidak ada transaksi</td></tr>';

    // ── Baris detail pengeluaran ──────────────────────────────────────────────
    const rowsPengeluaran = (d.detail?.pengeluaran || []).map(r => `
      <tr>
        <td>${r.tanggal ? UI.formatDate(r.tanggal) : '-'}</td>
        <td>${r.nama || '-'}</td>
        <td>${r.jenis || '-'}</td>
        <td>${r.keterangan || '-'}</td>
        <td style="text-align:right;font-weight:600;color:#b43c3c">${fmtRp(r.jumlah)}</td>
        <td>${r.metode || '-'}</td>
      </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:#9ca3af">Tidak ada transaksi</td></tr>';

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>${fileName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1f2937; background: #f1f4f9; }

  /* ── Header profesional dengan gradient ── */
  .header-wrap {
    background: linear-gradient(135deg, #1a3a6e 0%, #2d5499 60%, #3d6abf 100%);
    padding: 0 0 0 0;
    position: relative;
    overflow: hidden;
  }
  .header-wrap::before {
    content: '';
    position: absolute;
    top: -30px; right: -30px;
    width: 160px; height: 160px;
    background: rgba(255,255,255,.06);
    border-radius: 50%;
  }
  .header-wrap::after {
    content: '';
    position: absolute;
    bottom: -20px; left: 30%;
    width: 200px; height: 100px;
    background: rgba(255,255,255,.04);
    border-radius: 50%;
  }
  .header-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 28px 16px;
    position: relative;
    z-index: 1;
  }
  .header-logo-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .header-icon {
    width: 44px; height: 44px;
    background: rgba(255,255,255,.18);
    border: 2px solid rgba(255,255,255,.35);
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
  }
  .header-title { color: #fff; }
  .header-title h1 { font-size: 18px; font-weight: 700; letter-spacing: -.3px; margin-bottom: 3px; }
  .header-title p  { font-size: 10.5px; opacity: .75; letter-spacing: .02em; }
  .header-meta {
    text-align: right;
    color: rgba(255,255,255,.85);
    font-size: 10px;
    line-height: 1.9;
  }
  .header-meta .badge {
    display: inline-block;
    background: rgba(255,255,255,.18);
    border: 1px solid rgba(255,255,255,.3);
    border-radius: 20px;
    padding: 2px 10px;
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: .04em;
    margin-bottom: 4px;
  }
  .header-stripe {
    height: 5px;
    background: linear-gradient(90deg, #f59e0b 0%, #fbbf24 40%, #34d399 100%);
  }

  /* ── Body ── */
  .body { padding: 20px 24px; background: #f1f4f9; }

  /* ── Ringkasan dua kolom ── */
  .summary-row { display: flex; gap: 14px; margin-bottom: 14px; }
  .summary-box { flex: 1; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .summary-box-head { padding: 8px 14px; font-size: 9px; font-weight: 700; color: #fff; text-transform: uppercase; letter-spacing: .07em; display: flex; align-items: center; gap: 6px; }
  .summary-box-head.green { background: linear-gradient(90deg, #166534, #16a34a); }
  .summary-box-head.red   { background: linear-gradient(90deg, #991b1b, #dc2626); }
  .summary-box-body { padding: 12px 14px; }
  .summary-row-item { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 7px; color: #374151; }
  .summary-divider { border: none; border-top: 1px solid #e5e7eb; margin: 7px 0; }
  .summary-total { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; }
  .summary-total.green { color: #15803d; }
  .summary-total.red   { color: #dc2626; }

  /* ── Laba bersih ── */
  .net-box {
    border-radius: 8px; padding: 13px 18px;
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 14px; color: #fff; font-weight: 700; font-size: 13px;
    box-shadow: 0 2px 8px rgba(0,0,0,.15);
    letter-spacing: .01em;
  }
  .net-box .net-label { font-size: 10px; font-weight: 500; opacity: .85; margin-top: 2px; }

  /* ── Distribusi ── */
  .dist-box {
    background: #fff; border-radius: 8px;
    padding: 14px 16px; margin-bottom: 18px;
    box-shadow: 0 1px 4px rgba(0,0,0,.07);
  }
  .dist-title {
    font-size: 10.5px; font-weight: 700; color: #1a3a6e;
    margin-bottom: 10px; padding-bottom: 6px;
    border-bottom: 2px solid #e5e7eb;
    display: flex; align-items: center; gap: 6px;
  }
  .dist-row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 6px; color: #374151; }
  .dist-row strong { color: #1f2937; }

  /* ── Tabel detail ── */
  .section-title {
    font-size: 11px; font-weight: 700; color: #1a3a6e;
    margin-bottom: 8px; padding: 6px 10px;
    background: #e8eef7; border-left: 4px solid #2d5499;
    border-radius: 0 4px 4px 0;
  }
  .table-wrap { background: #fff; border-radius: 8px; overflow: hidden; margin-bottom: 18px; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: linear-gradient(90deg, #1a3a6e, #2d5499); color: #fff; padding: 7px 10px; text-align: left; font-size: 9.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  td { padding: 6px 10px; border-bottom: 1px solid #f0f2f5; color: #374151; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #f8fafc; }
  tr:hover td { background: #eff4fb; }

  /* ── Footer ── */
  .footer-wrap { margin-top: 8px; padding: 12px 0 4px; border-top: 1px solid #dde3ed; text-align: center; }
  .footer { font-size: 9px; color: #9ca3af; }

  @media print {
    body { font-size: 10px; background: #fff; }
    .body { padding: 10px 16px; background: #fff; }
    .table-wrap, .summary-box, .dist-box, .net-box { box-shadow: none; }
    .header-wrap::before, .header-wrap::after { display: none; }
    @page { size: A4 portrait; margin: 8mm; }
  }
</style>
</head>
<body>
  <!-- Header -->
  <div class="header-wrap">
    <div class="header-inner">
      <div class="header-logo-row">
        <div class="header-icon">L/R</div>
        <div class="header-title">
          <h1>Laporan Laba Rugi</h1>
          <p>EduHome — Sistem Manajemen Bimbel</p>
        </div>
      </div>
      <div class="header-meta">
        <div class="badge">Periode: ${label}</div><br>
        Dicetak: ${tglCetak}
      </div>
    </div>
  </div>
  <div class="header-stripe"></div>

  <div class="body">
    <!-- Ringkasan -->
    <div class="summary-row">
      <div class="summary-box">
        <div class="summary-box-head green">▲ &nbsp;Pemasukan</div>
        <div class="summary-box-body">
          <div class="summary-row-item"><span>Pembayaran SPP</span><strong>${fmtRp(d.revenue?.spp)}</strong></div>
          <div class="summary-row-item"><span>Penjualan Buku</span><strong>${fmtRp(d.revenue?.buku)}</strong></div>
          <div class="summary-row-item"><span>Pendaftaran</span><strong>${fmtRp(d.revenue?.pendaftaran)}</strong></div>
          <div class="summary-row-item"><span>Lain-lain</span><strong>${fmtRp(d.revenue?.lain)}</strong></div>
          <hr class="summary-divider">
          <div class="summary-total green"><span>Total Pemasukan</span><span>${fmtRp(d.revenue?.total)}</span></div>
        </div>
      </div>
      <div class="summary-box">
        <div class="summary-box-head red">▼ &nbsp;Pengeluaran</div>
        <div class="summary-box-body">
          <div class="summary-row-item"><span>Gaji Mentor</span><strong>${fmtRp(d.expense?.gaji)}</strong></div>
          <div class="summary-row-item"><span>Pembelian Buku</span><strong>${fmtRp(d.expense?.buku)}</strong></div>
          <div class="summary-row-item"><span>Operasional</span><strong>${fmtRp(d.expense?.operasional)}</strong></div>
          <hr class="summary-divider">
          <div class="summary-total red"><span>Total Pengeluaran</span><span>${fmtRp(d.expense?.total)}</span></div>
        </div>
      </div>
    </div>

    <!-- Laba Bersih -->
    <div class="net-box" style="background:linear-gradient(135deg,${netColor},${netColor}cc)">
      <div>
        <div>Laba Bersih</div>
        <div class="net-label">Periode ${label}</div>
      </div>
      <span style="font-size:15px">${fmtRp(net)}</span>
    </div>

    <!-- Distribusi -->
    <div class="dist-box">
      <div class="dist-title">Distribusi Laba</div>
      <div class="dist-row"><span>Pemilik (${ownerPct}%)</span><strong>${fmtRp(ownerVal)}</strong></div>
      <div class="dist-row"><span>Tabungan (${savPct}%)</span><strong>${fmtRp(savVal)}</strong></div>
    </div>

    <!-- Detail Pemasukan -->
    <div class="section-title">▲ &nbsp;Detail Pemasukan</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tanggal</th><th>Nama</th><th>Jenis</th><th>Keterangan</th><th>Jumlah</th><th>Metode</th></tr></thead>
        <tbody>${rowsPemasukan}</tbody>
      </table>
    </div>

    <!-- Detail Pengeluaran -->
    <div class="section-title">▼ &nbsp;Detail Pengeluaran</div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Tanggal</th><th>Nama</th><th>Jenis</th><th>Keterangan</th><th>Jumlah</th><th>Metode</th></tr></thead>
        <tbody>${rowsPengeluaran}</tbody>
      </table>
    </div>

    <div class="footer-wrap">
      <div class="footer">EduHome Bimbel &nbsp;·&nbsp; Laporan Laba Rugi ${label} &nbsp;·&nbsp; Dicetak ${tglCetak}</div>
    </div>
  </div>
  <script>window.onload = () => { window.focus(); window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { UI.toast('Popup diblokir browser. Izinkan popup untuk mengekspor PDF.', 'error'); return; }
    win.document.write(html);
    win.document.close();
    UI.toast(`PDF siap dicetak: ${fileName}`, 'success');
  }


  // ── Preview PDF (buka di tab baru) ───────────────────────────────────────
  function previewPDF() {
    if (!_lastData) { UI.toast('Belum ada data laporan untuk dipreview', 'warning'); return; }
    if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      UI.toast('Library jsPDF belum dimuat.', 'error'); return;
    }
    // Pakai exportPDF tapi output ke blob URL
    const { jsPDF: JSPDF } = window.jspdf || { jsPDF };
    const d    = _lastData;
    const { label } = _getActivePeriod();

    const PRIMARY   = [51,  90, 149];
    const SUCCESS   = [39, 121,  89];
    const DANGER    = [180,  60,  60];
    const GRAY_DARK = [40,  40,  40];
    const GRAY_MID  = [110, 110, 110];
    const GRAY_LITE = [248, 249, 251];
    const GRAY_BOX  = [235, 239, 245];
    const WHITE     = [255, 255, 255];

    const doc  = new JSPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 0;

    // Header
    doc.setFillColor(...PRIMARY);
    doc.rect(0, 0, pageW, 30, 'F');
    doc.setFillColor(70, 120, 190);
    doc.rect(0, 27, pageW, 3, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Laporan Laba Rugi', 14, 11);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
    doc.text('EduHome Bimbel', 14, 19);
    doc.text(`Periode: ${label}`, pageW - 14, 11, { align: 'right' });
    doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, pageW - 14, 19, { align: 'right' });
    y = 38;

    const colW = (pageW - 28 - 6) / 2;
    const colL = 14, colR = 14 + colW + 6;

    function _box(x, title, rows, totalLabel, totalVal, accent) {
      const bH = 12 + rows.length * 8 + 12;
      doc.setFillColor(...GRAY_BOX); doc.roundedRect(x, y, colW, bH, 3, 3, 'F');
      doc.setFillColor(...accent); doc.roundedRect(x, y, colW, 9, 3, 3, 'F');
      doc.rect(x, y + 4, colW, 5, 'F');
      doc.setTextColor(...WHITE); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(title, x + 5, y + 6.5);
      let ry = y + 18;
      doc.setTextColor(...GRAY_DARK); doc.setFontSize(8);
      rows.forEach(([lbl, val]) => {
        if (!lbl) { ry += 8; return; }
        doc.setFont('helvetica', 'normal'); doc.text(lbl, x + 5, ry);
        doc.setFont('helvetica', 'bold'); doc.text(_fmtRp(val), x + colW - 5, ry, { align: 'right' });
        ry += 8;
      });
      doc.setDrawColor(...accent); doc.setLineWidth(0.35);
      doc.line(x + 5, ry - 2, x + colW - 5, ry - 2);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...accent);
      doc.text(totalLabel, x + 5, ry + 5);
      doc.text(_fmtRp(totalVal), x + colW - 5, ry + 5, { align: 'right' });
      return bH;
    }

    const rP = [['Pembayaran SPP', d.revenue?.spp ?? 0],['Penjualan Buku', d.revenue?.buku ?? 0],['Pendaftaran', d.revenue?.pendaftaran ?? 0],['Lain-lain', d.revenue?.lain ?? 0]];
    const rE = [['Gaji Mentor', d.expense?.gaji ?? 0],['Pembelian Buku', d.expense?.buku ?? 0],['Operasional', d.expense?.operasional ?? 0]];
    const maxR = Math.max(rP.length, rE.length);
    while (rP.length < maxR) rP.push(['', '']);
    while (rE.length < maxR) rE.push(['', '']);

    const bH = _box(colL, '↑  Pemasukan', rP, 'Total Pemasukan', d.revenue?.total ?? 0, SUCCESS);
    _box(colR, '↓  Pengeluaran', rE, 'Total Pengeluaran', d.expense?.total ?? 0, DANGER);
    y += bH + 8;

    const net = d.net_profit ?? 0;
    const netC = net >= 0 ? SUCCESS : DANGER;
    doc.setFillColor(...netC); doc.roundedRect(14, y, pageW - 28, 13, 3, 3, 'F');
    doc.setTextColor(...WHITE); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text('Laba Bersih', 20, y + 8.5);
    doc.text(_fmtRp(net), pageW - 20, y + 8.5, { align: 'right' });
    y += 21;

    doc.setFillColor(...GRAY_BOX); doc.roundedRect(14, y, pageW - 28, 28, 3, 3, 'F');
    doc.setTextColor(...PRIMARY); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text('Distribusi Laba', 20, y + 8);
    doc.setTextColor(...GRAY_DARK); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const ownerPct = d.distribution?.owner_pct ?? _ownerPct;
    const savPct   = d.distribution?.savings_pct ?? _savingsPct;
    doc.text(`Pemilik (${ownerPct}%)`, 20, y + 17);
    doc.setFont('helvetica', 'bold');
    doc.text(_fmtRp(d.distribution?.owner ?? 0), pageW - 20, y + 17, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`Tabungan (${savPct}%)`, 20, y + 25);
    doc.setFont('helvetica', 'bold');
    doc.text(_fmtRp(d.distribution?.savings ?? 0), pageW - 20, y + 25, { align: 'right' });
    y += 36;

    const allTx = [
      ...(d.detail?.pemasukan || []).map(r => [r.tanggal ? UI.formatDate(r.tanggal) : '-', r.nama || '-', r.jenis || '-', r.keterangan || '-', _fmtRp(r.jumlah), r.metode || '-', 'Pemasukan']),
      ...(d.detail?.pengeluaran || []).map(r => [r.tanggal ? UI.formatDate(r.tanggal) : '-', r.nama || '-', r.jenis || '-', r.keterangan || '-', _fmtRp(r.jumlah), r.metode || '-', 'Pengeluaran']),
    ];
    doc.autoTable({
      startY: y,
      head: [['Tanggal','Nama','Jenis','Keterangan','Jumlah','Metode','Arah']],
      body: allTx.length ? allTx : [['—','Tidak ada transaksi','','','','','']],
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: GRAY_LITE },
      columnStyles: { 0:{cellWidth:22},1:{cellWidth:32},2:{cellWidth:22},3:{cellWidth:45},4:{cellWidth:28,halign:'right'},5:{cellWidth:20},6:{cellWidth:18} },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 6) {
          data.cell.styles.textColor = data.cell.raw === 'Pemasukan' ? SUCCESS : DANGER;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { left: 14, right: 14 },
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7.5); doc.setTextColor(...GRAY_MID);
      doc.text(`EduHome Bimbel · Laporan Laba Rugi ${label} · Halaman ${i} / ${pageCount}`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
    }

    const blob = doc.output('blob');
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    UI.toast('Preview PDF dibuka di tab baru', 'success');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    // Setup input type=month (baru)
    const monthInput = document.getElementById('laporan-month-input');
    if (monthInput && !monthInput.value) {
      const now = new Date();
      monthInput.value = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    }

    // Sync ke hidden selects (backward compat)
    const monthSel = document.getElementById('laporan-month-select');
    if (monthSel && monthSel.options.length === 0) {
      monthNames.slice(1).forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i + 1; opt.textContent = m;
        monthSel.appendChild(opt);
      });
      monthSel.value = new Date().getMonth() + 1;
    }
    const yearSel = document.getElementById('laporan-year-select');
    if (yearSel && yearSel.options.length === 0) {
      const cy = new Date().getFullYear();
      for (let y = cy - 2; y <= cy + 1; y++) {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        yearSel.appendChild(opt);
      }
      yearSel.value = cy;
    }

    _renderMonthNav();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  // exportPDF dan exportExcel sekarang sudah di-expose!
  return {
    init, load, onMonthChange, onPctChange, refresh, switchTab, exportPDF, exportExcel, previewPDF,
    prevMonth, nextMonth, openMonthPicker, _setMonthFromPicker
  };
})();

window.LaporanBulananPage = LaporanBulananPage;