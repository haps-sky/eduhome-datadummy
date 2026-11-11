const MoreMenu = (() => {
  let _activeKey      = null;
  let _isOpening      = false; // guard: window antara toggle() dipanggil sampai layout selesai
  let _ptrInsideBtn   = false; // guard: jari masih menekan .ctrl-more-btn (anti synthetic-scroll)

  // ── Pointer state guards ─────────────────────────────────
  // Mencegah scroll listener menutup menu saat jari masih menekan tombol.
  // Lebih stabil dari timeout karena berbasis interaction-state, bukan waktu.
  document.addEventListener('pointerdown', e => {
    _ptrInsideBtn = !!e.target.closest('.ctrl-more-btn');
  }, true);

  document.addEventListener('pointerup', () => {
    _ptrInsideBtn = false;
  }, true);

  // pointercancel: terjadi saat browser intercept gesture (mis. swipe scroll iOS)
  document.addEventListener('pointercancel', () => {
    _ptrInsideBtn = false;
  }, true);

  // ── Menu config ──────────────────────────────────────────
  const MENUS = {
    murid:    { refresh: () => MuridPage.load(true),       undo: () => MuridPage.undo(),       redo: () => MuridPage.redo(),       del: () => Selection.toggle('murid'),    excel: () => MuridPage.exportExcel(),       pdf: () => MuridPage.exportPDF()       },
    mentor:   { refresh: () => MentorPage.load(true),      undo: () => MentorPage.undo(),      redo: () => MentorPage.redo(),      del: () => Selection.toggle('mentor'),   excel: () => MentorPage.exportExcel(),      pdf: () => MentorPage.exportPDF()      },
    presensi: { refresh: () => PresensiPage.load(true),    undo: () => PresensiPage.undo(),    redo: () => PresensiPage.redo(),    del: () => Selection.toggle('presensi'), excel: () => PresensiPage.exportExcel(),    pdf: () => PresensiPage.exportPDF()    },
    pay:      { refresh: () => PembayaranPage.load(true),  undo: () => PembayaranPage.undo(),  redo: () => PembayaranPage.redo(),  del: () => Selection.toggle('pay'),      excel: () => PembayaranPage.exportExcel(),  pdf: () => PembayaranPage.exportPDF()  },
    ops:      { refresh: () => OperasionalPage.load(true), undo: () => OperasionalPage.undo(), redo: () => OperasionalPage.redo(), del: () => Selection.toggle('ops'),      excel: () => OperasionalPage.exportExcel(), pdf: () => OperasionalPage.exportPDF() },
    spp:      { refresh: () => SPPPage.load(true),         undo: () => SPPPage.undo(),         redo: () => SPPPage.redo(),         del: () => Selection.toggle('spp'),      excel: () => SPPPage.exportExcel(),         pdf: () => SPPPage.exportPDF()         },
    buku:     { refresh: () => BukuPage.load(true),        undo: () => BukuPage.undo(),        redo: () => BukuPage.redo(),        del: () => Selection.toggle('buku'),     excel: () => BukuPage.exportExcel(),        pdf: () => BukuPage.exportPDF()        },
    gaji:     { refresh: () => GajiPage.load(true),        undo: () => GajiPage.undo(),        redo: () => GajiPage.redo(),        del: () => Selection.toggle('gaji'),     excel: () => GajiPage.exportExcel(),        pdf: () => GajiPage.exportPDF()        },
  };

  // ── _resolveAnchor ───────────────────────────────────────
  // Cari elemen anchor yang benar-benar visible di viewport.
  // Fallback bertingkat: rawEl → button di wrapper → toolbar aktif → null
  function _resolveAnchor(rawEl) {
    if (!rawEl) return null;

    const hasSize = el => { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0; };

    if (hasSize(rawEl)) return rawEl;

    const wrapper = rawEl.closest ? rawEl.closest('.ctrl-more-btn') : null;
    if (wrapper) {
      const btn = wrapper.querySelector('button');
      if (btn && hasSize(btn)) return btn;
    }

    const activeSection = document.querySelector('.page-section.active');
    if (activeSection) {
      const toolbar = activeSection.querySelector('.ctrl-toolbar, .page-ctrl, .ctrl-more-btn');
      if (toolbar && hasSize(toolbar)) return toolbar;
    }

    return null;
  }

  // ── _positionMenu ────────────────────────────────────────
  // Hitung posisi menu dari anchorEl.
  // Dipanggil SETELAH RAF agar offsetHeight sudah final (post-Lucide render).
  function _positionMenu(menu, anchorEl) {
    const menuW = 176;

    // Pastikan visible untuk ukur tinggi, tapi di luar viewport
    menu.style.display  = 'block';
    menu.style.top      = '-9999px';
    menu.style.left     = '-9999px';
    menu.style.minWidth = menuW + 'px';

    const menuH = menu.offsetHeight;

    let rect;
    if (anchorEl) {
      rect = anchorEl.getBoundingClientRect();
    }

    // Fallback jika rect tidak valid: gunakan navbar atau estimasi konservatif
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const navbar = document.querySelector('.navbar, .app-header, header, #topbar, .top-bar');
      if (navbar) {
        const nr = navbar.getBoundingClientRect();
        rect = { top: nr.top, bottom: nr.bottom, right: window.innerWidth - 8, left: 0 };
      } else {
        rect = { top: 52, bottom: 60, right: window.innerWidth - 8, left: 0 };
      }
    }

    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const topPos     = spaceBelow >= menuH ? rect.bottom + 6 : rect.top - menuH - 6;

    let left = rect.right - menuW;
    if (left < 8) left = 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;

    menu.style.top  = Math.max(8, topPos) + 'px';
    menu.style.left = left + 'px';
  }

  // ── toggle ───────────────────────────────────────────────
  function toggle(key, rawEl) {
    if (_activeKey === key) { _close(); return; }
    _close();
    _activeKey = key;

    const cfg  = MENUS[key];
    const menu = document.getElementById('global-more-menu');
    if (!menu || !cfg) return;

    menu.dataset.activeKey = key;

    menu.innerHTML = `
      <style>
        #global-more-menu .ctrl-more-item i,
        #global-more-menu .ctrl-more-item svg,
        #global-more-menu .ctrl-more-item path,
        #global-more-menu .ctrl-more-item circle,
        #global-more-menu .ctrl-more-item line,
        #global-more-menu .ctrl-more-item polyline,
        #global-more-menu .ctrl-more-item rect {
          pointer-events: none;
        }
      </style>
      <button class="ctrl-more-item" data-action="refresh">
        <i data-lucide="refresh-cw"></i> Refresh
      </button>
      <button class="ctrl-more-item" data-action="undo">
        <i data-lucide="undo-2"></i> Undo
      </button>
      <button class="ctrl-more-item" data-action="redo">
        <i data-lucide="redo-2"></i> Redo
      </button>
      <div class="ctrl-more-divider"></div>
      <button class="ctrl-more-item" data-action="excel">
        <i data-lucide="file-spreadsheet"></i> Export Excel
      </button>
      <button class="ctrl-more-item" data-action="pdf">
        <i data-lucide="file-text"></i> Export PDF
      </button>
      <div class="ctrl-more-divider"></div>
      <button class="ctrl-more-item danger" data-action="del">
        <i data-lucide="trash-2"></i> Hapus Terpilih
      </button>`;

    // Set _isOpening SEBELUM operasi DOM apapun agar scroll listener
    // yang mungkin terpicu saat reflow tidak menutup menu prematur.
    // Ini melindungi window antara toggle() dipanggil sampai layout selesai.
    // _ptrInsideBtn melindungi skenario berbeda (jari masih menekan).
    // Keduanya tetap dipakai bersamaan.
    _isOpening = true;
    setTimeout(() => { _isOpening = false; }, 200); // sedikit lebih panjang untuk device lambat

    lucide.createIcons({ nodes: [menu] });

    // FIX: requestAnimationFrame memastikan _positionMenu dipanggil SETELAH
    // browser selesai me-render icon Lucide ke DOM, sehingga offsetHeight
    // yang dipakai untuk kalkulasi posisi sudah final.
    // Double RAF untuk Safari yang kadang butuh dua siklus layout.
    const anchorEl = _resolveAnchor(rawEl);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        _positionMenu(menu, anchorEl);
      });
    });
  }

  // ── _close / close ───────────────────────────────────────
  function _close() {
    const menu = document.getElementById('global-more-menu');
    if (menu) menu.style.display = 'none';
    _activeKey = null;
  }

  function close() { _close(); }

  // ── Click handler ─────────────────────────────────────────
  document.addEventListener('click', e => {
    const menu = document.getElementById('global-more-menu');

    if (menu && menu.style.display !== 'none') {
      const item = e.target.closest ? e.target.closest('[data-action]') : null;
      if (item && menu.contains(item)) {
        e.stopPropagation();
        const action = item.dataset.action;
        const key    = menu.dataset.activeKey;
        const cfg    = MENUS[key];
        _close();
        if (cfg && typeof cfg[action] === 'function') {
          cfg[action]();
        } else {
          console.warn(`MoreMenu: action "${action}" untuk key "${key}" tidak terdaftar.`);
        }
        return;
      }
    }

    if (!e.target.closest('#global-more-menu') && !e.target.closest('.ctrl-more-btn')) {
      _close();
    }
  });

  // ── Scroll handler ────────────────────────────────────────
  // FIX: cek _isOpening DAN _ptrInsideBtn sebelum menutup.
  // - _isOpening: guard untuk window antara toggle() dipanggil sampai layout selesai
  // - _ptrInsideBtn: guard untuk saat jari masih menekan tombol (anti synthetic micro-scroll)
  // Ini menghilangkan race condition utama yang menyebabkan "tombol kadang tidak responsif".
  window.addEventListener('scroll', () => {
    if (_isOpening || _ptrInsideBtn) return;
    _close();
  }, true);

  return { toggle, close };
})();

window.MoreMenu = MoreMenu;