const RBAC = {
  pages: {
    OWNER:  ['dashboard', 'owner-finance', 'laporan', 'laporan-wali', 'murid', 'presensi', 'spp', 'gaji', 'logs', 'hadiah-bintang'],
    ADMIN:  ['dashboard', 'murid', 'mentor', 'program', 'presensi', 'pembayaran', 'pengeluaran', 'spp', 'buku', 'gaji', 'laporan', 'laporan-wali', 'hadiah-bintang', 'panduan'],
    MENTOR: ['dashboard', 'mentor-students', 'mentor-presensi', 'hadiah-bintang']
  },

  titles: {
    'dashboard':        'Dashboard',
    'owner-finance':    'Laporan Keuangan',
    'laporan':          'Laporan Laba Rugi',
    'murid':            'Data Murid',
    'mentor':           'Data Mentor',
    'presensi':         'Presensi',
    'pembayaran':       'Pembayaran',
    'pengeluaran':      'Pengeluaran',
    'spp':              'Paket SPP',
    'buku':             'Modul Belajar',
    'program':          'Master Program',
    'gaji':             'Penggajian',
    'logs':             'System Logs',
    'mentor-students':  'Murid Saya',
    'mentor-presensi':  'Catat Presensi',
    'laporan-wali':     'Laporan Wali',
    'hadiah-bintang':   'Hadiah Bintang',
    'panduan':          'Panduan Admin'
  },

  defaultPage: {
    OWNER:  'dashboard',
    ADMIN:  'dashboard',
    MENTOR: 'dashboard'
  },

  groups: {
    OWNER: [
      { label: 'Utama',    pages: ['dashboard'] },
      { label: 'Laporan',  pages: ['owner-finance', 'laporan', 'laporan-wali', 'murid', 'presensi', 'spp', 'gaji'] },
      { label: 'Sistem',   pages: ['logs'] },
      { label: 'Hadiah',   pages: ['hadiah-bintang'] }
    ],
    ADMIN: [
      { label: 'Utama',      pages: ['dashboard'] },
      { label: 'Manajemen',  pages: ['murid', 'mentor', 'program', 'spp', 'buku'] },
      { label: 'Transaksi',  pages: ['presensi', 'pembayaran', 'pengeluaran', 'gaji', 'laporan', 'laporan-wali'] },
      { label: 'Hadiah',     pages: ['hadiah-bintang'] },
      { label: 'Bantuan',    pages: ['panduan'] }
    ],
    MENTOR: [
      { label: 'Utama',      pages: ['dashboard'] },
      { label: 'Kelas Saya', pages: ['mentor-students', 'mentor-presensi', 'hadiah-bintang'] }
    ]
  },

  icons: {
    'dashboard':       'layout-dashboard',
    'owner-finance':   'bar-chart-2',
    'laporan':         'file-bar-chart',
    'murid':           'users',
    'mentor':          'user-check',
    'presensi':        'calendar-check',
    'pembayaran':      'credit-card',
    'pengeluaran':     'trending-down',
    'spp':             'package',
    'buku':            'book-open',
    'program':         'layout-grid',
    'gaji':            'banknote',
    'logs':            'scroll-text',
    'mentor-students': 'users',
    'mentor-presensi': 'calendar-check',
    'laporan-wali': 'file-text',
    'hadiah-bintang': 'star',
    'panduan': 'book-open'
  },

  badges: {
    OWNER:  { cls: 'role-owner',  label: 'Owner' },
    ADMIN:  { cls: 'role-admin',  label: 'Admin' },
    MENTOR: { cls: 'role-mentor', label: 'Mentor' }
  },

  canAccess(role, page) {
    return (this.pages[role] || []).includes(page);
  }
};

const App = (() => {
  const state = {
    user: null,
    currentPage: 'dashboard',
    cache: {}
  };

  function getSession() {
    const s = localStorage.getItem('eduhome_user');
    return s ? JSON.parse(s) : null;
  }

  function setSession(user) {
    localStorage.setItem('eduhome_user', JSON.stringify(user));
    state.user = user;
  }

  function clearSession() {
    localStorage.removeItem('eduhome_user');
    state.user = null;
  }

  function buildSidebar(role) {
    const nav   = document.getElementById('sidebar-nav');
    const brand = document.getElementById('sidebar-role-label');
    if (!nav) return;

    const groups = RBAC.groups[role] || [];
    const badge  = RBAC.badges[role] || { cls: '', label: role };
    if (brand) { brand.textContent = badge.label; brand.className = 'role-badge ' + badge.cls; }

    nav.innerHTML = groups.map(g => `
      <div class="nav-section-label">${g.label}</div>
      ${g.pages.map(p => `
        <div class="nav-item" data-page="${p}">
          <i data-lucide="${RBAC.icons[p] || 'circle'}"></i>
          ${RBAC.titles[p] || p}
        </div>`).join('')}
    `).join('');

    nav.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', () => {
        navigate(el.dataset.page);
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('open');
        const menuBtn = document.getElementById('mobile-menu-btn');
        if (menuBtn) menuBtn.classList.remove('burger-hidden');
      });
    });

    // Menu Panel Developer — hanya muncul di browser yang menyimpan kode developer
      if (role === 'ADMIN') {
      nav.insertAdjacentHTML('beforeend', `
        <div class="nav-section-label">Developer</div>
        <div class="nav-item" id="nav-dev-panel">
          <i data-lucide="wrench"></i>
          Panel Developer
        </div>`);
      document.getElementById('nav-dev-panel').addEventListener('click', () => {
        window.location.href = 'dev-panel.html';
      });
    }

    lucide.createIcons({ nodes: [nav] });
  }

  function navigate(page) {
    const role = state.user ? state.user.role : null;
    if (!role) return;

    if (!RBAC.canAccess(role, page)) {
      UI.toast('Akses ditolak: halaman ini tidak tersedia untuk role Anda', 'error');
      return;
    }

    state.currentPage = page;

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    document.querySelectorAll('.page-section').forEach(el => {
      el.style.display = el.id === 'page-' + page ? 'block' : 'none';
    });

    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = RBAC.titles[page] || page;

    loadPage(page);
  }

  function loadPage(page) {
    switch (page) {
      case 'dashboard':        Dashboard.load();                              break;
      case 'owner-finance':    OwnerFinancePage.load();                      break;
      case 'laporan':          LaporanBulananPage.init(); LaporanBulananPage.load(); break;
      case 'murid':            MuridPage.load();                             break;
      case 'mentor':           MentorPage.load();                            break;
      case 'presensi':         PresensiPage.load();                          break;
      case 'pembayaran':       PembayaranPage.load();                        break;
      case 'pengeluaran':      OperasionalPage.load();                       break;
      case 'spp':              SPPPage.load(); SPPList.init();               break;
      case 'buku':             BukuPage.load();                              break;
      case 'program':          ProgramPage.load();                           break;
      case 'gaji':             GajiPage.load();                              break;
      case 'logs':             LogsPage.load();                              break;
      case 'mentor-students':  MentorStudentsPage.load();                    break;
      case 'mentor-presensi':  MentorPresensiPage.load();                    break;
      case 'laporan-wali': LaporanWaliPage.load();                           break;
      case 'hadiah-bintang': HadiahPage.load();                              break;
      case 'panduan':          PanduanPage.load();                          break;
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const btn      = document.getElementById('login-btn');

    if (!username || !password) {
      UI.toast('Username dan password diperlukan', 'error');
      return;
    }

    btn.disabled  = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner spinner-sm"></div> Loading...';

    try {
      const res = await API.auth.login(username, password);
      if (res.status === 'OK') {
        setSession(res.data);

        // Cek maintenance mode SEKALI LAGI segera setelah login berhasil —
        // menutup celah antara "login lolos" (action 'login' sengaja dibiarkan
        // lewat maintenance check di backend) dan watcher berkala 60 detik.
        // Tanpa ini, user yang login pas maintenance lagi nyala akan nyangkut
        // di layar loading sampai watcher berikutnya baru redirect.
        try {
          const mres = await API.maintenance.check();
          if (mres?.data?.maintenance === true && !mres?.data?.exempt) {
            const msg      = encodeURIComponent(mres.data.message  || '');
            const estimasi = encodeURIComponent(mres.data.estimasi || '');
            const progress = mres.data.progress !== undefined && mres.data.progress !== null
              ? encodeURIComponent(mres.data.progress) : '';
            window.location.replace(`maintenance.html?msg=${msg}&est=${estimasi}&prog=${progress}`);
            return;
          }
        } catch(mErr) {
          // Gagal cek maintenance (network dsb) — jangan blokir login karena ini,
          // biarkan lanjut normal; watcher 60 detik tetap jadi jaring pengaman.
        }

        showApp(res.data);
        navigate(RBAC.defaultPage[res.data.role] || 'dashboard');
        UI.toast('Selamat datang, ' + res.data.username + '!', 'success');
      } else {
        UI.toast(res.message || 'Login gagal', 'error');
      }
    } catch(err) {
      console.error(err);
      UI.toast('Koneksi gagal. Periksa URL API.', 'error');
    } finally {
      btn.disabled  = false;
      btn.innerHTML = originalText;
    }
  }

  function handleLogout() {
    document.body.classList.remove('light-mode');
    API.logout(); // invalidate token di server, hapus session, lalu redirect ke index.html
  }

  const Theme = (() => {
    function _getUsername() {
      try {
        const s = localStorage.getItem('eduhome_user');
        return s ? JSON.parse(s).username : 'guest';
      } catch { return 'guest'; }
    }

    function _storageKey() { return 'theme_' + _getUsername().toLowerCase(); }

    function _updateIcon(isLight) {
      const btn  = document.getElementById('theme-toggle-btn');
      if (!btn) return;
      const moon = btn.querySelector('[data-lucide="moon"], svg[data-lucide="moon"]')
                 || document.getElementById('theme-icon-moon');
      const sun  = btn.querySelector('[data-lucide="sun"],  svg[data-lucide="sun"]')
                 || document.getElementById('theme-icon-sun');
      if (moon) moon.style.display = isLight ? 'none' : '';
      if (sun)  sun.style.display  = isLight ? ''     : 'none';
    }

    function _apply(isLight) {
      document.body.classList.toggle('light-mode', isLight);
      _updateIcon(isLight);
    }

    function init() {
      const saved   = localStorage.getItem(_storageKey());
      const isLight = saved === 'light';
      _apply(isLight);
    }

    function toggle() {
      const isCurrentlyLight = document.body.classList.contains('light-mode');
      const next = !isCurrentlyLight;
      localStorage.setItem(_storageKey(), next ? 'light' : 'dark');
      _apply(next);
    }

    return { init, toggle };
  })();

  window.Theme = Theme;

  function showApp(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display    = 'flex';

    const el = document.getElementById('current-date');
    if (el) {
      el.textContent = new Date().toLocaleDateString('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
    }

    const badge       = RBAC.badges[user.role] || { cls: '', label: user.role };
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) {
      userDisplay.innerHTML = `<strong>${user.username}</strong><span class="role-badge ${badge.cls}">${badge.label}</span>`;
    }

    const av = document.getElementById('user-avatar');
    if (av) av.textContent = (user.username || '?')[0].toUpperCase();

    buildSidebar(user.role);
    applyPageVisibility(user.role);
    Theme.init();
  }

  function applyPageVisibility(role) {
    const adminBtns = [
      'btn-tambah-murid', 'btn-tambah-mentor', 'btn-tambah-program',
      'btn-tambah-presensi', 'btn-tambah-pembayaran',
      'btn-tambah-pengeluaran',
      'btn-buat-spp', 'btn-batch-spp', 'btn-tambah-buku', 'btn-bayar-gaji',
      'btn-auto-renew-spp'
    ];
    adminBtns.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = (role === 'ADMIN') ? 'inline-flex' : 'none';
    });

    const financeSection = document.getElementById('dash-finance-section');
    if (financeSection) {
      financeSection.style.display = (role === 'MENTOR') ? 'none' : 'block';
    }

    const mentorStats = document.getElementById('dash-mentor-stats');
    if (mentorStats) {
      mentorStats.style.display = (role === 'MENTOR') ? 'block' : 'none';
    }

    ['kpi-card-pembayaran', 'kpi-card-unpaid'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = (role === 'MENTOR') ? 'none' : 'block';
    });

    if (role === 'OWNER') {
      adminBtns.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    }

    // Tombol admin tools — di luar blok OWNER agar ADMIN juga kena
    const reconcileBtn = document.getElementById('btn-reconcile-spp');
    const migrateBtn   = document.getElementById('btn-migrate-buku');
    if (reconcileBtn) reconcileBtn.style.display = (role === 'ADMIN' || role === 'OWNER') ? 'inline-flex' : 'none';
    if (migrateBtn)   migrateBtn.style.display   = role === 'OWNER' ? 'inline-flex' : 'none';
  }

  // ── Maintenance mode watcher ────────────────────────────────────────────
  // Polling ringan tiap 60 detik selama user (non-OWNER) aktif di dalam app.
  // Kalau OWNER nyalain maintenance mode saat user lain lagi kerja, mereka
  // di-redirect otomatis ke maintenance.html alih-alih dapet toast error
  // "Sistem sedang dalam perbaikan" berulang-ulang di tiap aksi.
  let _maintenanceWatcherId = null;

  function startMaintenanceWatcher() {
    if (_maintenanceWatcherId) return; // sudah jalan, jangan dobel
    _maintenanceWatcherId = setInterval(async () => {
      if (!state.user) return; // OWNER ikut dicek: kalau bukan pemegang dev key, di-redirect saat maintenance aktif
      try {
        const res = await API.maintenance.check();
        if (res?.data?.maintenance === true && !res?.data?.exempt) {
          window.location.href = 'maintenance.html';
        }
      } catch(e) { /* silent — jangan ganggu user kalau network bermasalah */ }
    }, 60000);
  }

  function init() {
    const saved = getSession();
    if (saved) {
      state.user = saved;
      showApp(saved);
      navigate(RBAC.defaultPage[saved.role] || 'dashboard');
    } else {
      document.getElementById('login-screen').style.display = 'flex';
      document.getElementById('app-shell').style.display    = 'none';
    }

    startMaintenanceWatcher();

    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.getElementById('mobile-menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const sidebar = document.getElementById('sidebar');
      const menuBtn = document.getElementById('mobile-menu-btn');
      sidebar.classList.toggle('open');
      menuBtn.classList.toggle('burger-hidden', sidebar.classList.contains('open'));
    });
  }

  return { init, navigate, state, RBAC };
})();

const UI = {
  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
      success: 'check-circle',
      error:   'x-circle',
      info:    'info',
      warning: 'alert-triangle'
    };

    toast.innerHTML = `<i data-lucide="${icons[type] || 'info'}"></i><span>${message}</span>`;
    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }, 3500);
  },

  formatCurrency(val) {
    return 'Rp ' + Number(val || 0).toLocaleString('id-ID');
  },

  formatDate(str) {
    if (!str) return '-';
    return new Date(str).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  },

  statusBadge(status) {
    const map = {
      'AKTIF':    'badge-success',
      'NONAKTIF': 'badge-danger',
      'HADIR':    'badge-success',
      'ABSEN':    'badge-danger',
      'IZIN':     'badge-warning',
      'PAID':     'badge-success',
      'PARTIAL':  'badge-warning',
      'UNPAID':   'badge-danger',
      'HABIS':    'badge-muted',
      'EXPIRED':  'badge-muted',
      'TIDAK ADA':'badge-muted'
    };
    return `<span class="badge ${map[status] || 'badge-muted'}">${UI.escape(status)}</span>`;
  },

  stars(count) {
    const n = parseInt(count) || 0;
    return '<span class="stars">★</span>'.repeat(Math.min(n, 10)) + ' <small>' + n + '</small>';
  },

  renderTable(tbodyId, rows, emptyMsg = 'Tidak ada data') {
    const el = document.getElementById(tbodyId);
    if (!el) return;
    if (!rows || rows.length === 0) {
      const cols = el.closest('table')?.querySelector('thead tr')?.children.length || 5;
      el.innerHTML = `<tr><td colspan="${cols}" class="empty-row">${emptyMsg}</td></tr>`;
      return;
    }
    el.innerHTML = rows.join('');
    lucide.createIcons({ nodes: [el] });
  },

  openModal(id) {
    const el = document.getElementById(id);
    if (el) { el.style.display = 'flex'; lucide.createIcons({ nodes: [el] }); }
  },

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  },

  closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
  },

  // ── Tanggal lokal (zona waktu perangkat/WIB), format YYYY-MM-DD.
  // Jangan pakai new Date().toISOString() untuk "hari ini": itu UTC dan
  // salah hari antara 00:00-07:00 WIB.
  today(d = new Date()) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  },

  // ── escapeHTML: wajib dipakai untuk semua data user yang dirender ke innerHTML
  // Mencegah XSS — gunakan: UI.escape(m.nama) bukan langsung ${m.nama}
  escape(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // ── Export ke Excel menggunakan SheetJS ──────────────────────────────────
  // headers: ['Kolom A', 'Kolom B', ...]
  // rows:    [[val1, val2], [val1, val2], ...]
  // filename: 'nama-file' (tanpa .xlsx)
  exportExcel(headers, rows, filename = 'export', sheetName = 'Data') {
    if (typeof XLSX === 'undefined') {
      UI.toast('Library Excel belum dimuat. Coba refresh halaman.', 'error');
      return;
    }
    if (!rows || rows.length === 0) {
      UI.toast('Tidak ada data untuk diekspor', 'warning');
      return;
    }

    try {
      const wsData  = [headers, ...rows];
      const ws      = XLSX.utils.aoa_to_sheet(wsData);

      // Auto column width berdasarkan konten
      const colWidths = headers.map((h, i) => {
        const maxLen = Math.max(
          String(h).length,
          ...rows.map(r => String(r[i] ?? '').length)
        );
        return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
      });
      ws['!cols'] = colWidths;

      // Style header row (bold) — SheetJS Community tidak support rich style,
      // tapi kita bisa set !rows untuk freeze
      ws['!freeze'] = { xSplit: 0, ySplit: 1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const tanggal = UI.today();
      XLSX.writeFile(wb, `${filename}_${tanggal}.xlsx`);
      UI.toast(`File "${filename}_${tanggal}.xlsx" berhasil diunduh!`, 'success');
    } catch(e) {
      console.error('Export Excel error:', e);
      UI.toast('Gagal mengekspor ke Excel', 'error');
    }
  },

  // ── Export ke PDF via print dialog ──────────────────────────────────────
  // title:   judul dokumen
  // headers: ['Kolom A', 'Kolom B', ...]
  // rows:    [[val1, val2], ...]
  // meta:    { subtitle, info } (opsional)
  exportPDF(title, headers, rows, meta = {}) {
    if (!rows || rows.length === 0) {
      UI.toast('Tidak ada data untuk diekspor', 'warning');
      return;
    }

    const tanggal   = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    const subtitle  = meta.subtitle || '';
    const info      = meta.info     || '';

    // Build table rows HTML
    const thCells   = headers.map(h => `<th>${h}</th>`).join('');
    const trRows    = rows.map((row) => {
      const tds = row.map(v => `<td>${v ?? '-'}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 14px; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 20px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #0f2d6e; }
  .header-left h1 { font-size: 20px; font-weight: 700; color: #0f2d6e; }
  .header-left p  { font-size: 13px; color: #6b7280; margin-top: 2px; }
  .header-right   { text-align: right; font-size: 12px; color: #9ca3af; }
  .meta { display: flex; gap: 24px; margin-bottom: 14px; font-size: 12px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #0f2d6e; color: #fff; padding: 9px 10px; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #374151; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer { border-top: 1px solid #e5e7eb; padding-top: 10px; font-size: 11px; color: #9ca3af; text-align: center; }
  @media print {
    body { padding: 0; }
    @page { size: A4 landscape; margin: 10mm 12mm; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${title}</h1>
      ${subtitle ? `<p>${subtitle}</p>` : ''}
    </div>
    <div class="header-right">
      EduHome — Sistem Manajemen Bimbel<br>
      Dicetak: ${tanggal}
    </div>
  </div>
  ${info ? `<div class="meta">${info}</div>` : ''}
  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${trRows}</tbody>
  </table>
  <div class="footer">
    Total: ${rows.length} baris data — EduHome © ${new Date().getFullYear()}
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=1000,height=700');
    if (!win) { UI.toast('Popup diblokir browser. Izinkan popup untuk mengekspor PDF.', 'error'); return; }
    win.document.write(html);
    win.document.close();
  },

  // ── Modal konfirmasi generik ─────────────────────────────────────────────
  // Mengembalikan Promise<boolean> — true jika user klik OK, false jika batal.
  // opts: { title, okLabel, okClass, cancelLabel, icon }
  confirm(message, opts = {}) {
    return new Promise(resolve => {
      // Hapus modal lama kalau masih ada
      document.getElementById('_ui-confirm-modal')?.remove();

      const {
        title       = 'Konfirmasi',
        okLabel     = 'OK',
        okClass     = 'btn-primary',
        cancelLabel = 'Batal',
        icon        = 'help-circle'
      } = opts;

      const modal = document.createElement('div');
      modal.id    = '_ui-confirm-modal';
      modal.style.cssText = `
        position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
        background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);animation:fadeIn .15s ease;
      `;
      modal.innerHTML = `
        <div style="background:var(--bg-card);border-radius:var(--radius-lg);padding:28px 24px 20px;
          max-width:420px;width:90%;box-shadow:var(--shadow-lg);position:relative;border:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">
            <i data-lucide="${icon}" style="width:22px;height:22px;color:var(--primary);flex-shrink:0;"></i>
            <strong style="font-size:1rem;color:var(--text-primary);">${title}</strong>
          </div>
          <div style="font-size:0.875rem;color:var(--text-secondary);line-height:1.6;margin-bottom:20px;">${message}</div>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button id="_ui-confirm-cancel" class="btn btn-outline" style="min-width:80px;">${cancelLabel}</button>
            <button id="_ui-confirm-ok"     class="${okClass.includes('btn') ? okClass : 'btn '+okClass}" style="min-width:80px;">${okLabel}</button>
          </div>
        </div>`;

      document.body.appendChild(modal);
      lucide.createIcons({ nodes: [modal] });

      const cleanup = (result) => { modal.remove(); resolve(result); };
      modal.querySelector('#_ui-confirm-ok').addEventListener('click',     () => cleanup(true));
      modal.querySelector('#_ui-confirm-cancel').addEventListener('click', () => cleanup(false));
      modal.addEventListener('click', e => { if (e.target === modal) cleanup(false); });
    });
  },

  // ── Konfirmasi hapus satuan ──────────────────────────────────────────────
  // nama: nama item yang akan dihapus, jenis: 'murid'/'mentor'/dll
  confirmDelete(nama, jenis = 'data') {
    return UI.confirm(
      `Yakin ingin menghapus <strong>${UI.escape(nama)}</strong>?<br>
       <span style="color:var(--danger,#ef4444);font-size:0.8rem;">Data ${jenis} ini tidak dapat dikembalikan setelah dihapus.</span>`,
      { title: `Hapus ${jenis.charAt(0).toUpperCase()+jenis.slice(1)}`, okLabel: 'Ya, Hapus', okClass: 'btn btn-danger', icon: 'trash-2' }
    );
  },

  // ── Konfirmasi hapus massal (butuh ketik ulang teks) ────────────────────
  // message: pesan peringatan, confirmText: teks yang harus diketik user
  async confirmDanger(message, confirmText = 'HAPUS') {
    const step1 = await UI.confirm(
      `${message}<br><br>
       <span style="color:var(--danger,#ef4444);font-weight:600;">⚠ Tindakan ini TIDAK DAPAT dibatalkan!</span>`,
      { title: '⚠ Peringatan', okLabel: 'Lanjutkan', okClass: 'btn btn-danger', icon: 'alert-triangle' }
    );
    if (!step1) return false;

    const typed = prompt(`Ketik "${confirmText}" untuk mengkonfirmasi penghapusan massal:`);
    return typed === confirmText;
  },

};

const AdminTools = (() => {
  async function reconcile() {
    // Backend GAS belum mengimplementasi reconcileSPP
    UI.toast('Fitur Reconcile SPP belum tersedia di backend.', 'warning');
    return;
    // eslint-disable-next-line no-unreachable
    try {
      const res = await API.laporan.reconcileSPP();
      if (res.status !== 'OK') { UI.toast(res.message || 'Gagal', 'error'); return; }
      const d       = res.data;
      const panel   = document.getElementById('laporan-reconcile-panel');
      const summary = document.getElementById('laporan-reconcile-summary');
      const tbody   = document.getElementById('laporan-reconcile-tbody');
      if (!panel) return;

      if (summary) {
        summary.textContent = `Diperiksa: ${d.summary.total_checked} paket SPP · Mismatch: ${d.summary.total_mismatch}`;
      }

      const rows = (d.items || []).map(r => `
        <tr>
          <td><span class="id-badge">${r.id_spp}</span></td>
          <td>${r.nama_murid || r.id_murid}</td>
          <td>${r.expected_hadir}</td>
          <td>${r.actual_hadir}</td>
          <td>${r.sisa_pertemuan}</td>
          <td><span class="badge ${r.status === 'MATCH' ? 'badge-success' : 'badge-danger'}">${r.status}</span></td>
        </tr>`);

      if (tbody) {
        tbody.innerHTML = rows.length
          ? rows.join('')
          : '<tr><td colspan="6" class="empty-row">Semua paket SPP konsisten</td></tr>';
      }

      panel.style.display = 'block';
      lucide.createIcons({ nodes: [panel] });
      UI.toast(`Reconciliation selesai. ${d.summary.total_mismatch} mismatch ditemukan.`,
        d.summary.total_mismatch > 0 ? 'warning' : 'success');
    } catch(e) {
      UI.toast('Gagal menjalankan reconciliation', 'error');
    }
  }

  async function migrateBuku() {
    // Backend GAS belum mengimplementasi migrateLegacyBuku
    UI.toast('Fitur Migrate Buku belum tersedia di backend.', 'warning');
    return;
    // eslint-disable-next-line no-unreachable
    if (!await UI.confirm('Migrasi data BUKU lama?', { title: 'Konfirmasi Migrasi', okLabel: 'Jalankan', okClass: 'btn-warning', icon: 'database' })) return;
    UI.toast('Menjalankan migrasi BUKU...', 'info');
    try {
      const res = await API.laporan.migrateLegacyBuku();
      if (res.status !== 'OK') { UI.toast(res.message || 'Gagal', 'error'); return; }
      const d = res.data;
      UI.toast(`Migrasi selesai. Diupdate: ${d.updated}, Dilewati: ${d.skipped}, Peringatan: ${d.warnings.length}`,
        d.warnings.length > 0 ? 'warning' : 'success');
      if (d.warnings.length > 0) {
        console.warn('BUKU migration warnings:', d.warnings);
      }
    } catch(e) {
      UI.toast('Gagal menjalankan migrasi', 'error');
    }
  }

  return { reconcile, migrateBuku };
})();

document.addEventListener('DOMContentLoaded', () => {
  App.init();

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => {
      if (e.target === modal) UI.closeAllModals();
    });
  });

  const mainArea = document.getElementById('main-area');
  if (mainArea) {
    mainArea.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        const menuBtn = document.getElementById('mobile-menu-btn');
        if (menuBtn) menuBtn.classList.remove('burger-hidden');
      }
    });
  }

  const updateDate = () => {
    const el = document.getElementById('current-date');
    if (el) el.textContent = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  };
  updateDate();

  const localDate = UI.today();
  ['presensi-tanggal','pay-tanggal','gaji-tgl','murid-tgl','mentor-presensi-tanggal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = localDate;
  });

  lucide.createIcons();
});

function openProfileModal() {
  UI.openModal('modal-profile');
  GantiPasswordPage.load();
}