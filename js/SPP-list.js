const SPPList = (() => {
  // ─── State ───────────────────────────────────────────────────────────────
  let _allSPP      = [];   // cache dari API
  let _level       = 1;   // 1 | 2 | 3
  let _selMurid    = null; // { id, nama }
  let _selPaket    = null; // objek paket SPP
  let _searchQuery = '';

  // ─── Mount point ─────────────────────────────────────────────────────────
  // Container di-inject ke #page-spp, menggantikan .table-wrap saat aktif
  const CONTAINER_ID = 'spp-list-view';

  // ─── Public: init ────────────────────────────────────────────────────────
  function init() {
    // Pasang tombol toggle di toolbar header jika belum ada
    _injectToggleButton();
  }

  function _injectToggleButton() {
    if (document.getElementById('btn-spp-listview')) return;
    const headerBtns = document.querySelector('#page-spp .page-header > div');
    if (!headerBtns) return;

    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.id        = 'btn-spp-listview';
    btn.className = 'btn btn-outline';
    btn.innerHTML = '<i data-lucide="users"></i> Lihat per Murid';
    btn.onclick   = () => show();

    // Sisipkan sebelum btn-batch-spp
    headerBtns.insertBefore(btn, headerBtns.firstChild);
    lucide.createIcons({ nodes: [btn] });
  }

  // ─── Public: show / hide ─────────────────────────────────────────────────
  async function show() {
    const tableWrap = document.querySelector('#page-spp .table-wrap');
    if (tableWrap) tableWrap.style.display = 'none';

    // Sembunyikan tombol header yg tidak relevan di list-view
    _setHeaderBtnsVisibility(false);

    let container = document.getElementById(CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = CONTAINER_ID;
      document.getElementById('page-spp').appendChild(container);
    }
    container.style.display = '';

    // Load data kalau belum ada
    _renderLoading(container, 'Memuat data...');
    try {
      const res = await API.spp.getAll();
      _allSPP   = (res.data || []).sort((a, b) => (a.nama_murid || '').localeCompare(b.nama_murid || ''));
    } catch(e) {
      _renderError(container, 'Gagal memuat data paket SPP.');
      return;
    }

    _level        = 1;
    _selMurid     = null;
    _selPaket     = null;
    _searchQuery  = '';
    _renderLevel1(container);
  }

  function hide() {
    const container = document.getElementById(CONTAINER_ID);
    if (container) container.style.display = 'none';

    const tableWrap = document.querySelector('#page-spp .table-wrap');
    if (tableWrap) tableWrap.style.display = '';

    _setHeaderBtnsVisibility(true);
  }

  function _setHeaderBtnsVisibility(show) {
    ['btn-buat-spp', 'btn-batch-spp'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      // Tombol ini punya display:none sendiri dari role-check,
      // simpan state aslinya agar tidak override
      if (show) {
        el.removeAttribute('data-lv-hidden');
      } else {
        el.setAttribute('data-lv-hidden', '1');
      }
    });

    const toggleBtn = document.getElementById('btn-spp-listview');
    if (toggleBtn) {
      if (show) {
        toggleBtn.innerHTML = '<i data-lucide="users"></i> Lihat per Murid';
        toggleBtn.onclick   = () => SPPList.show();
      } else {
        toggleBtn.innerHTML = '<i data-lucide="table-2"></i> Lihat Tabel';
        toggleBtn.onclick   = () => SPPList.hide();
      }
      lucide.createIcons({ nodes: [toggleBtn] });
    }
  }

  // ─── Breadcrumb ──────────────────────────────────────────────────────────
  function _breadcrumb() {
    const crumbs = [
      { label: 'Paket SPP', level: 1 }
    ];
    if (_level >= 2 && _selMurid) crumbs.push({ label: _selMurid.nama, level: 2 });
    if (_level === 3 && _selPaket) crumbs.push({ label: _selPaket.id, level: 3 });

    return `
      <nav class="spp-lv-breadcrumb" style="
        display:flex;align-items:center;gap:6px;
        font-size:0.82rem;color:var(--text-secondary);
        margin-bottom:16px;flex-wrap:wrap;
      ">
        ${crumbs.map((c, i) => `
          ${i > 0 ? `<i data-lucide="chevron-right" style="width:13px;height:13px;flex-shrink:0;"></i>` : ''}
          ${i < crumbs.length - 1
            ? `<button onclick="SPPList._goLevel(${c.level})"
                 style="background:none;border:none;padding:0;cursor:pointer;
                        color:var(--primary);font-size:0.82rem;font-weight:500;">
                 ${UI.escape(c.label)}
               </button>`
            : `<span style="color:var(--text-primary);font-weight:600;">${UI.escape(c.label)}</span>`
          }
        `).join('')}
      </nav>`;
  }

  // ─── Level 1: Daftar Murid ───────────────────────────────────────────────
  function _renderLevel1(container) {
    _level = 1;

    // Build murid map
    const muridMap = {};
    _allSPP.forEach(s => {
      if (!muridMap[s.id_murid]) {
        muridMap[s.id_murid] = {
          id:           s.id_murid,
          nama:         s.nama_murid,
          total:        0,
          unpaid:       0,
          aktif:        0,
          nonaktif:     0,
          totalTagihan: 0,
          programs:     new Set(),
        };
      }
      const m = muridMap[s.id_murid];
      m.total++;
      const isPaid  = (s.status_bayar || '').toUpperCase() === 'PAID';
      const isAktif = (s.status || '').toUpperCase() === 'AKTIF';
      if (!isPaid) {
        m.unpaid++;
        const sisa = Number(s.harga || 0) - Number(s.terbayar || 0);
        if (sisa > 0) m.totalTagihan += sisa;
      }
      if (isAktif)  m.aktif++;
      else          m.nonaktif++;
      if (s.program) m.programs.add(s.program);
    });

    let muridList = Object.values(muridMap).map(m => ({ ...m, programs: [...m.programs] })).sort((a, b) => a.nama.localeCompare(b.nama));

    container.innerHTML = `
      <div class="spp-lv-wrap" style="max-width:780px;margin:0 auto;">
        ${_breadcrumb()}

        <!-- Toolbar -->
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;">
          <div class="search-wrap" style="flex:1;min-width:180px;">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input class="search-input" type="text" id="spp-lv-search"
                   placeholder="Cari nama murid..."
                   style="width:100%;box-sizing:border-box;"
                   oninput="SPPList._searchMurid(this.value)">
          </div>
          <div style="font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;">
            <i data-lucide="users" style="width:13px;height:13px;vertical-align:middle;"></i>
            ${muridList.length} murid
          </div>
        </div>

        <!-- List -->
        <div id="spp-lv-murid-list" style="display:flex;flex-direction:column;gap:5px;">
          ${_buildMuridCards(muridList)}
        </div>
      </div>`;

    lucide.createIcons({ nodes: [container] });
    setTimeout(() => document.getElementById('spp-lv-search')?.focus(), 80);
  }

  function _buildMuridCards(list) {
    if (!list.length) return `
      <div style="text-align:center;padding:40px 20px;color:var(--text-secondary);">
        <i data-lucide="search-x" style="width:40px;height:40px;display:block;margin:0 auto 10px;opacity:.4;"></i>
        Murid tidak ditemukan
      </div>`;

    return list.map(m => {
      const initial   = (m.nama || '?').charAt(0).toUpperCase();
      const hasUnpaid = m.unpaid > 0;
      const programs  = (m.programs || []).slice(0, 2); // max 2 program tags
      const moreProgs = (m.programs || []).length - 2;

      return `
        <div class="spp-lv-card" onclick="SPPList._goMurid('${m.id}', '${_esc(m.nama)}')"
             style="
               display:flex;align-items:center;gap:12px;
               padding:10px 14px;border-radius:10px;
               border:1.5px solid var(--border);background:var(--bg-surface);
               cursor:pointer;transition:border-color .15s,background .15s;
             "
             onmouseover="this.style.borderColor='var(--primary)';this.style.background='var(--primary-dim,#eff6ff)'"
             onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg-surface)'">

          <!-- Avatar -->
          <div style="
            width:38px;height:38px;border-radius:50%;flex-shrink:0;
            background:var(--primary);color:#fff;
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:0.95rem;
          ">${initial}</div>

          <!-- Info kiri: nama + row bawah -->
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary);
                        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${UI.escape(m.nama)}
            </div>
            <div style="display:flex;align-items:center;gap:5px;margin-top:4px;flex-wrap:wrap;">

              <!-- Paket count -->
              <span style="font-size:0.72rem;color:var(--text-secondary);display:flex;align-items:center;gap:3px;">
                <i data-lucide="package-2" style="width:10px;height:10px;"></i>
                ${m.total} paket
              </span>

              <!-- Status aktif/nonaktif -->
              ${m.aktif > 0 ? `
                <span style="font-size:0.7rem;padding:1px 6px;border-radius:8px;
                             background:var(--success-dim,#dcfce7);color:var(--success,#16a34a);font-weight:600;">
                  ${m.aktif} aktif
                </span>` : ''}
              ${m.nonaktif > 0 && m.aktif === 0 ? `
                <span style="font-size:0.7rem;padding:1px 6px;border-radius:8px;
                             background:var(--bg-secondary,#f1f5f9);color:var(--text-secondary);font-weight:600;">
                  nonaktif
                </span>` : ''}

              <!-- Separator -->
              ${programs.length > 0 ? `<span style="color:var(--border);font-size:0.7rem;">·</span>` : ''}

              <!-- Program tags -->
              ${programs.map(p => `
                <span style="font-size:0.7rem;padding:1px 6px;border-radius:8px;
                             background:var(--primary-dim,#eff6ff);color:var(--primary);font-weight:500;">
                  ${UI.escape(p)}
                </span>`).join('')}
              ${moreProgs > 0 ? `
                <span style="font-size:0.7rem;color:var(--text-secondary);">+${moreProgs}</span>` : ''}
            </div>
          </div>

          <!-- Kanan: tagihan nominal + chevron -->
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;text-align:right;">
            <div>
              ${hasUnpaid ? `
                <div style="font-size:0.72rem;font-weight:700;color:var(--danger,#dc2626);">
                  ${UI.formatCurrency(m.totalTagihan)}
                </div>
                <div style="font-size:0.68rem;color:var(--text-secondary);margin-top:1px;">
                  ${m.unpaid} tagihan
                </div>` : `
                <div style="font-size:0.72rem;font-weight:600;color:var(--success,#16a34a);">
                  Lunas
                </div>`}
            </div>
            <i data-lucide="chevron-right" style="width:15px;height:15px;color:var(--text-secondary);"></i>
          </div>
        </div>`;
    }).join('');
  }

  function _searchMurid(q) {
    _searchQuery = q;
    const muridMap = {};
    _allSPP.forEach(s => {
      if (!muridMap[s.id_murid]) {
        muridMap[s.id_murid] = { id: s.id_murid, nama: s.nama_murid, total: 0, unpaid: 0, aktif: 0, nonaktif: 0, totalTagihan: 0, programs: new Set() };
      }
      const m = muridMap[s.id_murid];
      m.total++;
      const isPaid  = (s.status_bayar || '').toUpperCase() === 'PAID';
      const isAktif = (s.status || '').toUpperCase() === 'AKTIF';
      if (!isPaid) { m.unpaid++; const sisa = Number(s.harga||0)-Number(s.terbayar||0); if(sisa>0) m.totalTagihan+=sisa; }
      if (isAktif) m.aktif++; else m.nonaktif++;
      if (s.program) m.programs.add(s.program);
    });
    let list = Object.values(muridMap)
      .map(m => ({ ...m, programs: [...m.programs] }))
      .filter(m => m.nama.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.nama.localeCompare(b.nama));

    const el = document.getElementById('spp-lv-murid-list');
    if (el) {
      el.innerHTML = _buildMuridCards(list);
      lucide.createIcons({ nodes: [el] });
    }
  }

  // ─── Level 2: Daftar Paket SPP milik murid ───────────────────────────────
  function _goMurid(id, nama) {
    _selMurid = { id, nama };
    _level    = 2;
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const paketList = _allSPP
      .filter(s => s.id_murid === id)
      .sort((a, b) => b.periode_mulai.localeCompare(a.periode_mulai));

    container.innerHTML = `
      <div class="spp-lv-wrap" style="max-width:780px;margin:0 auto;">
        ${_breadcrumb()}

        <!-- Murid info strip -->
        <div style="
          display:flex;align-items:center;gap:12px;
          padding:12px 16px;border-radius:12px;
          background:var(--primary-dim,#eff6ff);
          border:1.5px solid var(--primary);
          margin-bottom:16px;
        ">
          <div style="
            width:38px;height:38px;border-radius:50%;flex-shrink:0;
            background:var(--primary);color:#fff;
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:0.95rem;
          ">${(nama || '?').charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight:700;color:var(--primary);font-size:0.95rem;">${UI.escape(nama)}</div>
            <div style="font-size:0.76rem;color:var(--text-secondary);margin-top:2px;">
              ${paketList.length} paket SPP
            </div>
          </div>
        </div>

        <!-- Paket list -->
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${paketList.length ? _buildPaketCards(paketList) : `
            <div style="text-align:center;padding:40px;color:var(--text-secondary);">
              <i data-lucide="package-x" style="width:40px;height:40px;display:block;margin:0 auto 10px;opacity:.4;"></i>
              Belum ada paket SPP
            </div>`}
        </div>
      </div>`;

    lucide.createIcons({ nodes: [container] });
  }

  function _buildPaketCards(list) {
    return list.map(s => {
      const hadir = s.hadir || 0;
      const total = s.total_pertemuan || 0;
      const sisa  = s.sisa_pertemuan ?? (total - hadir);
      const pct   = total > 0 ? Math.round((hadir / total) * 100) : 0;
      const isPaid   = (s.status_bayar || '').toUpperCase() === 'PAID';
      const isAktif  = (s.status || '').toUpperCase() === 'AKTIF';
      const terbayar = s.terbayar || 0;
      const sisaByr  = Number(s.harga) - Number(terbayar);

      return `
        <div class="spp-lv-card" onclick="SPPList._goDetail('${s.id}')"
             style="
               padding:14px 16px;border-radius:12px;
               border:1.5px solid var(--border);background:var(--bg-surface);
               cursor:pointer;transition:border-color .15s,background .15s;
             "
             onmouseover="this.style.borderColor='var(--primary)';this.style.background='var(--primary-dim,#eff6ff)'"
             onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg-surface)'">

          <!-- Row atas: ID + program + status + chevron -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span style="
              font-family:monospace;font-size:0.75rem;padding:2px 8px;border-radius:6px;
              background:var(--bg-secondary,#f1f5f9);color:var(--text-secondary);
              flex-shrink:0;
            ">${UI.escape(s.id)}</span>

            <span class="program-tag" style="flex-shrink:0;">${UI.escape(s.program)}</span>

            <div style="flex:1;"></div>

            <!-- Status periode -->
            ${UI.statusBadge(s.status || 'AKTIF')}

            <i data-lucide="chevron-right" style="width:15px;height:15px;color:var(--text-secondary);flex-shrink:0;"></i>
          </div>

          <!-- Periode -->
          <div style="
            display:flex;align-items:center;gap:6px;
            font-size:0.8rem;color:var(--text-secondary);margin-bottom:10px;
          ">
            <i data-lucide="calendar-range" style="width:13px;height:13px;"></i>
            ${UI.formatDate(s.periode_mulai)} – ${s.periode_akhir ? UI.formatDate(s.periode_akhir) : 'Siklus berjalan'}
          </div>

          <!-- Progress sesi -->
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
              <span style="font-size:0.75rem;color:var(--text-secondary);">
                <i data-lucide="book-open" style="width:11px;height:11px;vertical-align:middle;"></i>
                Hadir ${hadir} / ${total} sesi
              </span>
              <span style="font-size:0.75rem;font-weight:600;color:var(--primary);">${pct}%</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:99px;transition:width .3s;"></div>
            </div>
          </div>

          <!-- Row bawah: harga + status bayar -->
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
            <div style="font-size:0.8rem;">
              <span style="color:var(--text-secondary);">Harga:</span>
              <span style="font-weight:600;color:var(--text-primary);margin-left:4px;">${UI.formatCurrency(s.harga)}</span>
              ${!isPaid && sisaByr > 0 ? `
                <span style="color:var(--danger,#dc2626);font-size:0.75rem;margin-left:4px;">
                  (sisa ${UI.formatCurrency(sisaByr)})
                </span>` : ''}
            </div>
            ${UI.statusBadge(s.status_bayar || 'UNPAID')}
          </div>
        </div>`;
    }).join('');
  }

  // ─── Level 3: Detail Paket ────────────────────────────────────────────────
  function _goDetail(id) {
    _selPaket = _allSPP.find(s => s.id === id);
    if (!_selPaket) return;
    _level = 3;

    const s       = _selPaket;
    const hadir   = s.hadir || 0;
    const total   = s.total_pertemuan || 0;
    const sisa    = s.sisa_pertemuan ?? (total - hadir);
    const pct     = total > 0 ? Math.round((hadir / total) * 100) : 0;
    const terbayar = Number(s.terbayar || 0);
    const sisaByr  = Number(s.harga) - terbayar;
    const isPaid   = (s.status_bayar || '').toUpperCase() === 'PAID';
    const role     = API.currentRole();
    const canEdit  = role === 'ADMIN';

    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    container.innerHTML = `
      <div class="spp-lv-wrap" style="max-width:600px;margin:0 auto;">
        ${_breadcrumb()}

        <!-- Detail Card -->
        <div style="
          border-radius:14px;border:1.5px solid var(--border);
          background:var(--bg-surface);overflow:hidden;
        ">
          <!-- Header card -->
          <div style="
            padding:18px 20px;
            background:linear-gradient(135deg,var(--primary-dim,#eff6ff) 0%,var(--bg-surface) 100%);
            border-bottom:1px solid var(--border);
            display:flex;justify-content:space-between;align-items:flex-start;gap:12px;
          ">
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="
                  font-family:monospace;font-size:0.8rem;padding:2px 10px;border-radius:6px;
                  background:var(--primary);color:#fff;font-weight:600;
                ">${UI.escape(s.id)}</span>
                <span class="program-tag">${UI.escape(s.program)}</span>
              </div>
              <div style="font-size:1.05rem;font-weight:700;color:var(--text-primary);">${UI.escape(s.nama_murid)}</div>
              <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:4px;">
                <i data-lucide="calendar-range" style="width:12px;height:12px;vertical-align:middle;"></i>
                ${UI.formatDate(s.periode_mulai)} – ${s.periode_akhir ? UI.formatDate(s.periode_akhir) : 'Siklus berjalan'}
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              ${UI.statusBadge(s.status || 'AKTIF')}
            </div>
          </div>

          <!-- Body detail -->
          <div style="padding:20px;">

            <!-- Progress sesi -->
            <div style="margin-bottom:20px;">
              <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;
                          letter-spacing:.05em;color:var(--text-secondary);margin-bottom:10px;">
                Progress Kehadiran
              </div>
              <div style="
                display:grid;grid-template-columns:repeat(3,1fr);gap:10px;
                margin-bottom:12px;text-align:center;
              ">
                ${_statBox('Hadir', hadir, 'user-check', 'var(--success,#16a34a)')}
                ${_statBox('Sisa', sisa, 'clock', 'var(--warning,#d97706)')}
                ${_statBox('Total', total, 'layers', 'var(--primary)')}
              </div>
              <div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:99px;"></div>
              </div>
              <div style="text-align:right;font-size:0.75rem;font-weight:600;color:var(--primary);margin-top:4px;">
                ${pct}%
              </div>
            </div>

            <!-- Divider -->
            <div style="height:1px;background:var(--border);margin-bottom:20px;"></div>

            <!-- Info pembayaran -->
            <div style="margin-bottom:20px;">
              <div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;
                          letter-spacing:.05em;color:var(--text-secondary);margin-bottom:10px;">
                Pembayaran
              </div>

              <div style="display:flex;flex-direction:column;gap:10px;">
                ${_infoRow('Harga Paket', UI.formatCurrency(s.harga), 'tag')}
                ${_infoRow('Sudah Dibayar', UI.formatCurrency(terbayar), 'circle-check-big', terbayar > 0 ? 'var(--success,#16a34a)' : undefined)}
                ${!isPaid
                  ? _infoRow('Sisa Tagihan', UI.formatCurrency(sisaByr), 'circle-alert', 'var(--danger,#dc2626)')
                  : _infoRow('Status', 'LUNAS', 'check-circle', 'var(--success,#16a34a)')}
                ${_infoRow('Status Bayar', s.status_bayar || 'UNPAID', 'credit-card')}
              </div>
            </div>

            <!-- Divider -->
            <div style="height:1px;background:var(--border);margin-bottom:20px;"></div>

            <!-- Aksi -->
            ${canEdit ? `
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-outline" onclick="SPPPage.printNota('${s.id}')" style="flex:1;min-width:100px;">
                <i data-lucide="printer"></i> Cetak Nota
              </button>
              <button class="btn btn-outline" onclick="SPPPage.openEdit('${s.id}')" style="flex:1;min-width:100px;">
                <i data-lucide="pencil"></i> Edit Paket
              </button>
              <button class="btn btn-danger" id="spp-detail-delete-btn" onclick="SPPList._deleteFromDetail('${s.id}')" style="flex:1;min-width:100px;">
                <i data-lucide="trash-2"></i> Hapus
              </button>
            </div>` : `
            <div>
              <button class="btn btn-outline" onclick="SPPPage.printNota('${s.id}')" style="width:100%;">
                <i data-lucide="printer"></i> Cetak Nota
              </button>
            </div>`}
          </div>
        </div>
      </div>`;

    lucide.createIcons({ nodes: [container] });
  }

  // Helper: stat box kecil
  function _statBox(label, value, icon, color) {
    return `
      <div style="
        padding:10px 8px;border-radius:10px;
        background:var(--bg-secondary,#f8fafc);
        border:1px solid var(--border);
      ">
        <i data-lucide="${icon}" style="width:16px;height:16px;color:${color};display:block;margin:0 auto 4px;"></i>
        <div style="font-size:1.2rem;font-weight:700;color:${color};">${value}</div>
        <div style="font-size:0.72rem;color:var(--text-secondary);">${label}</div>
      </div>`;
  }

  // Helper: info row
  function _infoRow(label, value, icon, color) {
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
        <div style="display:flex;align-items:center;gap:7px;color:var(--text-secondary);font-size:0.82rem;">
          <i data-lucide="${icon}" style="width:14px;height:14px;flex-shrink:0;"></i>
          ${label}
        </div>
        <div style="font-weight:600;font-size:0.85rem;color:${color || 'var(--text-primary)'};text-align:right;">
          ${value}
        </div>
      </div>`;
  }

  // ─── Navigasi breadcrumb ─────────────────────────────────────────────────
  function _goLevel(level) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;
    if (level === 1) { _renderLevel1(container); }
    else if (level === 2 && _selMurid) { _goMurid(_selMurid.id, _selMurid.nama); }
  }

  async function _deleteFromDetail(id) {
    const btn = document.getElementById('spp-detail-delete-btn');
    await SPPPage.deleteSPP(id, btn);
    // Refresh cache lokal
    const res = await API.spp.getAll();
    _allSPP   = (res.data || []).sort((a, b) => (a.nama_murid || '').localeCompare(b.nama_murid || ''));
    // Kembali ke level 2
    if (_selMurid) _goMurid(_selMurid.id, _selMurid.nama);
    else {
      const container = document.getElementById(CONTAINER_ID);
      if (container) _renderLevel1(container);
    }
  }

  function _esc(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  function _renderLoading(container, msg) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text-secondary);">
        <div class="spinner" style="margin:0 auto 12px;"></div>
        ${msg || 'Memuat...'}
      </div>`;
  }

  function _renderError(container, msg) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--danger,#dc2626);">
        <i data-lucide="wifi-off" style="width:40px;height:40px;display:block;margin:0 auto 10px;opacity:.6;"></i>
        ${msg}
      </div>`;
    lucide.createIcons({ nodes: [container] });
  }

  return {
    init,
    show,
    hide,
    _goMurid,
    _goDetail,
    _goLevel,
    _searchMurid,
    _deleteFromDetail,
  };
})();

window.SPPList = SPPList;