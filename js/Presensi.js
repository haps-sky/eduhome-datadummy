  function _localDateStr(d = new Date()) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

const PresensiPage = (() => {
  let allData         = [];
  let filteredData    = [];
  let isFetched       = false;
  let lastDeletedData = null;
  let lastAction      = null;
  let lastRestoredId  = null;
  let _bukuCache      = {};
  let _bukuList       = [];

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('presensi-tbody');
    if (!tbody) return;

    if (forceRefresh) {
      lastDeletedData = null;
      lastAction      = null;
      lastRestoredId  = null;
    }

    if (!forceRefresh && isFetched) {
      if (Object.keys(_bukuCache).length === 0) {
        API.buku.getAll().then(r => {
          _bukuList  = (r.data || []).map(b => ({
            ...b,
            bab_list: (b.bab_list && b.bab_list.length)
              ? b.bab_list
              : (b.bab ? b.bab.split('|').map(x => x.trim()).filter(Boolean) : [])
          }));
          _bukuCache = _bukuList.reduce((acc, b) => { acc[b.id] = b.nama_modul; return acc; }, {});
          renderTable([...allData].reverse());
        });
      } else {
        _renderFiltered();
      }
      return;
    }

    tbody.innerHTML = '<tr><td colspan="10" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data presensi...</td></tr>';

    try {
      const [presRes, muridRes, mentorRes, bukuRes] = await Promise.all([
        API.presensi.getAll(),
        API.murid.getAll(),
        API.mentor.getAll(),
        API.buku.getAll()
      ]);
      if (presRes.status === 'OK') {
        allData    = presRes.data || [];
        isFetched  = true;
        _bukuList  = (bukuRes.data || []).map(b => ({
          ...b,
          bab_list: (b.bab_list && b.bab_list.length)
            ? b.bab_list
            : (b.bab ? b.bab.split('|').map(x => x.trim()).filter(Boolean) : [])
        }));
        _bukuCache = _bukuList.reduce((acc, b) => { acc[b.id] = b.nama_modul; return acc; }, {});
        populateDropdowns(
          muridRes.data  || [],
          mentorRes.data || [],
          _bukuList
        );
        _renderFiltered();
      }
    } catch(e) {
      console.error(e);
      tbody.innerHTML = '<tr><td colspan="10" class="empty-row">Gagal memuat.</td></tr>';
    }
  }

  // ── populateDropdowns — pakai SD (Searchable Dropdown) ───────────────────
  function populateDropdowns(murid, mentor, buku) {
    // Murid
    const muridItems = murid
      .filter(m => String(m.status).trim().toUpperCase() === 'AKTIF')
      .map(m => ({
        value: m.id,
        label: m.nama,
        badge: m.program,
        extra: { nama: m.nama, program: m.program }
      }));
    SD.populate('presensi-murid', muridItems);

    // Hadiah Bintang: refresh widget progress tiap kali murid berubah
    const muridSelEl = document.getElementById('presensi-murid');
    if (muridSelEl && !muridSelEl._progressListenerAttached) {
      muridSelEl.addEventListener('change', () => {
        if (window.HadiahPage) HadiahPage.refreshPresensiWidget(muridSelEl.value);
      });
      muridSelEl._progressListenerAttached = true;
    }

    // Mentor
    const mentorItems = mentor
      .filter(m => String(m.status).trim().toUpperCase() === 'AKTIF')
      .map(m => ({
        value: m.id,
        label: m.nama,
        extra: { nama: m.nama }
      }));
    SD.populate('presensi-mentor', mentorItems);

    // Buku
    _populateBukuDropdown(buku);
  }

  // ── _populateBukuDropdown — pakai SD ─────────────────────────────────────
  function _populateBukuDropdown(buku) {
    const bukuItems = buku.map(b => {
      const babList = b.bab_list || [];
      const label   = [
        b.nama_modul,
        b.jenjang   ? b.jenjang          : '',
        b.program   ? `(${b.program})`   : ''
      ].filter(Boolean).join(' - ');

      return {
        value: b.id,
        label: label,
        badge: b.jenjang || b.program || '',
        extra: {
          nama: b.nama_modul,
          bab:  JSON.stringify(babList)
        }
      };
    });

    SD.populate('presensi-buku', bukuItems);

    // Pasang listener change pada hidden <select> untuk trigger onBukuChange
    const bk = document.getElementById('presensi-buku');
    if (bk && !bk._bukuListenerAttached) {
      bk.addEventListener('change', onBukuChange);
      bk._bukuListenerAttached = true;
    }
  }

  // ── onBukuChange — tidak berubah, tetap baca dari hidden <select> ─────────
  function onBukuChange() {
    const bk      = document.getElementById('presensi-buku');
    const babSel  = document.getElementById('presensi-bab');
    const babWrap = document.getElementById('presensi-bab-wrap');
    if (!bk || !babSel) return;

    const selected = bk.options[bk.selectedIndex];
    if (!bk.value || !selected) {
      babSel.innerHTML = '<option value="">-- Pilih Bab --</option>';
      if (babWrap) babWrap.style.display = 'none';
      return;
    }

    let babList = [];
    try { babList = JSON.parse(selected.dataset.bab || '[]'); } catch(e) {}

    if (babList.length > 0) {
      babSel.innerHTML = '<option value="">-- Pilih Bab --</option>' +
        babList.map(b => `<option value="${b}">${b}</option>`).join('');
      if (babWrap) babWrap.style.display = 'block';
    } else {
      babSel.innerHTML = '<option value="">-- Belum ada bab --</option>';
      if (babWrap) babWrap.style.display = 'none';
    }
  }

  function search(term) {
    Pagination.reset('presensi');
    const filtered = allData.filter(p =>
      (p.nama_murid  || '').toLowerCase().includes(term.toLowerCase()) ||
      (p.nama_mentor || '').toLowerCase().includes(term.toLowerCase()) ||
      (p.program     || '').toLowerCase().includes(term.toLowerCase()) ||
      (p.nama_bab    || '').toLowerCase().includes(term.toLowerCase())
    );
    renderTable(filtered);
  }

  function renderTable(data) {
    Pagination.setData('presensi', data);
  }

  function renderRows(slice) {
    const role    = API.currentRole();
    const canEdit = role === 'ADMIN' || role === 'MENTOR';

    const rows = slice.map(p => `
      <tr>
        <td style="width:32px;">
          ${Selection.checkbox('presensi', p.id)}
        </td>

        <td>${UI.formatDate(p.tanggal)}</td>

        <td><strong>${UI.escape(p.nama_murid)}</strong></td>

        <td>${UI.escape(p.nama_mentor)}</td>

        <td>
          <span class="program-tag">
            ${UI.escape(p.program)}
          </span>
        </td>

        <td>${UI.statusBadge(p.status)}</td>

        <td>
          ${p.nama_bab
            ? `
              <div style="font-size:0.78rem;line-height:1.6;">
                <div style="color:var(--text-secondary);font-weight:500;">
                  ${UI.escape(_bukuCache[p.id_buku] || p.id_buku || '')}
                </div>
                <div style="color:var(--primary);font-weight:600;">
                  📖 ${UI.escape(p.nama_bab)}
                </div>
              </div>
            `
            : (p.id_buku
              ? `
                <div style="font-size:0.78rem;line-height:1.6;">
                  <div style="color:var(--text-secondary);font-weight:500;">
                    ${UI.escape(_bukuCache[p.id_buku] || p.id_buku || '')}
                  </div>
                  <div style="color:var(--text-dim);font-style:italic;">
                    Bab belum dipilih
                  </div>
                </div>
              `
              : '<span style="color:var(--text-dim)">-</span>'
            )
          }
        </td>

        <td>${UI.escape(p.catatan || '-')}</td>

        <td>${UI.stars(p.bintang)}</td>

        <td>
          <div class="action-btns">
            ${canEdit ? `
              ${p.status === 'IZIN' && p.status_efektif === 'IZIN' && p.id_spp ? `
                <button
                  class="btn-icon btn-info"
                  onclick='PresensiReschedule.open(${JSON.stringify(p).replace(/'/g, "&#39;")}, "admin")'
                  title="Jadwalkan Ulang (Makeup)"
                >
                  <i data-lucide="calendar-clock"></i>
                </button>
              ` : ''}

              <button
                class="btn-icon btn-warning"
                onclick="PresensiPage.openEdit('${p.id}')"
                title="Edit"
              >
                <i data-lucide="pencil"></i>
              </button>

              <button
                class="btn-icon btn-danger"
                data-delete-id="${p.id}"
                onclick="PresensiPage.deleteItem('${p.id}')"
                title="Hapus"
              >
                <i data-lucide="trash-2"></i>
              </button>
            ` : '-'}
          </div>
        </td>
      </tr>
    `);

    UI.renderTable(
      'presensi-tbody',
      rows,
      'Belum ada data presensi'
    );

    lucide.createIcons({
      nodes: [document.getElementById('presensi-tbody')]
    });
  }

  // ── Filter Mode (mirip MentorPresensiPage) ────────────────────────────────
  let _filterMode   = 'semua';
  let _filterBulan  = '';
  let _filterTanggal = '';

  function setFilterMode(mode) {
    _filterMode = mode;

    // Update tombol aktif
    ['semua','hari_ini','bulan','tanggal'].forEach(m => {
      const btn = document.getElementById('presensi-filter-btn-' + m);
      if (btn) btn.classList.toggle('filter-btn-active', m === mode);
    });

    // Show/hide input wrapper
    const bulanWrap   = document.getElementById('presensi-filter-bulan-wrap');
    const tanggalWrap = document.getElementById('presensi-filter-tanggal-wrap');
    if (bulanWrap)   bulanWrap.style.display   = mode === 'bulan'   ? 'flex' : 'none';
    if (tanggalWrap) tanggalWrap.style.display = mode === 'tanggal' ? 'flex' : 'none';

    // Set default value untuk input jika belum diisi
    if (mode === 'bulan' && !_filterBulan) {
      _filterBulan = 	_localDateStr().slice(0, 7);
      const el = document.getElementById('presensi-filter-bulan');
      if (el) el.value = _filterBulan;
    }
    if (mode === 'bulan') _renderMonthNav();
    if (mode === 'tanggal' && !_filterTanggal) {
      _filterTanggal = _localDateStr();
      const el = document.getElementById('presensi-filter-tanggal');
      if (el) el.value = _filterTanggal;
    }

    _renderFiltered();
  }

  function onFilterBulanChange() {
    const el = document.getElementById('presensi-filter-bulan');
    if (el) _filterBulan = el.value;
    _renderFiltered();
    _updateFilterCount();
  }

  // ── Month nav — gaya sama seperti Laporan Bulanan: panah prev/next + pill
  //    bulan yang bisa diklik buat buka picker bulan/tahun. Input
  //    type="month" tetap ada di DOM (disembunyikan) sebagai sumber
  //    kebenaran nilai, supaya _filterBulan & onFilterBulanChange existing
  //    tidak perlu diubah.
  function _getMonthLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${names[parseInt(m)-1]} ${y}`;
  }

  function _getActiveMonthValue() {
    const el = document.getElementById('presensi-filter-bulan');
    if (el?.value) return el.value;
    return 	_localDateStr().slice(0, 7);
  }

  function _setActiveMonthValue(ym) {
    const el = document.getElementById('presensi-filter-bulan');
    if (el) el.value = ym;
    onFilterBulanChange();
    _renderMonthNav();
  }

  function _renderMonthNav() {
    const el = document.getElementById('presensi-month-nav');
    if (!el) return;
    const ym = _getActiveMonthValue();
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="ctrl-btn icon-only" onclick="PresensiPage.prevMonth()" title="Bulan sebelumnya">
          <i data-lucide="chevron-left"></i>
        </button>
        <button class="ctrl-btn" id="presensi-month-label"
                onclick="PresensiPage.openMonthPicker()"
                style="min-width:110px;font-weight:600;justify-content:center;gap:4px;">
          <i data-lucide="calendar"></i> ${_getMonthLabel(ym)}
        </button>
        <button class="ctrl-btn icon-only" onclick="PresensiPage.nextMonth()" title="Bulan berikutnya">
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

    const existing = document.getElementById('presensi-month-picker-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'presensi-month-picker-popup';
    popup.style.cssText = `position:fixed;z-index:9999;background:var(--bg-card);border:1px solid var(--border);
      border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:260px;`;

    const btn = document.getElementById('presensi-month-label');
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
          <button id="presensi-picker-prev" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">‹</button>
          <strong style="color:var(--text-primary);font-size:1rem;">${selYear}</strong>
          <button id="presensi-picker-next" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
          ${months.map((mn, i) => {
            const ym2    = selYear + '-' + String(i+1).padStart(2,'0');
            const active = ym2 === activeYm;
            return `<button onclick="PresensiPage._setMonthFromPicker('${ym2}')"
              style="padding:7px 4px;border-radius:8px;border:1px solid ${active ? 'var(--primary)' : 'var(--border)'};
                     background:${active ? 'var(--primary)' : 'var(--bg-surface)'};
                     color:${active ? '#fff' : 'var(--text-primary)'};font-size:0.82rem;cursor:pointer;font-weight:${active ? '700' : '400'};">
              ${mn}
            </button>`;
          }).join('')}
        </div>`;

      popup.querySelector('#presensi-picker-prev').addEventListener('click', (e) => { e.stopPropagation(); selYear--; render(); });
      popup.querySelector('#presensi-picker-next').addEventListener('click', (e) => { e.stopPropagation(); selYear++; render(); });
    };

    render();
    document.body.appendChild(popup);
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!popup.contains(e.target) && e.target.id !== 'presensi-month-label') {
          popup.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 100);
  }

  function _setMonthFromPicker(ym) {
    _setActiveMonthValue(ym);
    document.getElementById('presensi-month-picker-popup')?.remove();
  }

  function onFilterTanggalChange() {
    const el = document.getElementById('presensi-filter-tanggal');
    if (el) _filterTanggal = el.value;
    _renderFiltered();
    _updateFilterCount();
  }

  function _renderFiltered() {
    const today = _localDateStr();
    let filtered;
    if (_filterMode === 'hari_ini') {
      filtered = allData.filter(p => p.tanggal === today);
    } else if (_filterMode === 'bulan' && _filterBulan) {
      filtered = allData.filter(p => p.tanggal && p.tanggal.startsWith(_filterBulan));
    } else if (_filterMode === 'tanggal' && _filterTanggal) {
      filtered = allData.filter(p => p.tanggal === _filterTanggal);
    } else {
      filtered = allData;
    }
    renderTable([...filtered].reverse());
    _updateFilterCount(filtered.length);
  }

  function _updateFilterCount(count) {
    const el = document.getElementById('presensi-filter-count');
    if (!el) return;
    if (count === undefined) { el.textContent = ''; return; }
    el.textContent = count + ' data';
  }

  // Tetap expose untuk kompatibilitas jika ada kode lain yang memanggilnya
  function filterByDate(date) {
    _filterTanggal = date || '';
    setFilterMode(date ? 'tanggal' : 'semua');
  }

  function filterByMonth(month) {
    _filterBulan = month || '';
    setFilterMode(month ? 'bulan' : 'semua');
  }

  async function openAdd() {
    if (_bukuList.length === 0) {
      try {
        const r = await API.buku.getAll();
        _bukuList  = (r.data || []).map(b => ({
          ...b,
          bab_list: (b.bab_list && b.bab_list.length)
            ? b.bab_list
            : (b.bab ? b.bab.split('|').map(x => x.trim()).filter(Boolean) : [])
        }));
        _bukuCache = _bukuList.reduce((acc, b) => { acc[b.id] = b.nama_modul; return acc; }, {});
      } catch(e) { console.error('Gagal fetch buku:', e); }
    }
    _populateBukuDropdown(_bukuList);
    clearForm();
    UI.openModal('modal-presensi');
  }

  async function openEdit(id) {
    const p = allData.find(x => x.id === id);
    if (!p) return;

    if (_bukuList.length === 0) {
      try {
        const r = await API.buku.getAll();
        _bukuList  = (r.data || []).map(b => ({
          ...b,
          bab_list: (b.bab_list && b.bab_list.length)
            ? b.bab_list
            : (b.bab ? b.bab.split('|').map(x => x.trim()).filter(Boolean) : [])
        }));
        _bukuCache = _bukuList.reduce((acc, b) => { acc[b.id] = b.nama_modul; return acc; }, {});
      } catch(e) { console.error('Gagal fetch buku:', e); }
    }
    _populateBukuDropdown(_bukuList);

    document.getElementById('modal-presensi-title').textContent = 'Edit Presensi';
    document.getElementById('presensi-id-field').value  = p.id;
    document.getElementById('presensi-tanggal').value   = p.tanggal;
    document.getElementById('presensi-status').value    = p.status;
    document.getElementById('presensi-catatan').value   = p.catatan || '';
    document.getElementById('presensi-bintang').value   = Math.min(p.bintang || 5, 6);

    SD.setValue('presensi-murid',  p.id_murid);
    SD.setValue('presensi-mentor', p.id_mentor);

    if (p.id_buku) {
      SD.setValue('presensi-buku', p.id_buku);
      // onBukuChange sudah terpanggil via dispatchEvent di SD._pick
      // Tunggu DOM lalu set bab; kalau option belum ada, buat manual
      setTimeout(() => {
        const babSel  = document.getElementById('presensi-bab');
        const babWrap = document.getElementById('presensi-bab-wrap');
        if (babSel && p.nama_bab) {
          const exists = [...babSel.options].some(o => o.value === p.nama_bab);
          if (!exists) {
            const opt       = document.createElement('option');
            opt.value       = p.nama_bab;
            opt.textContent = p.nama_bab;
            babSel.appendChild(opt);
          }
          babSel.value = p.nama_bab;
          if (babWrap) babWrap.style.display = 'block';
        }
      }, 120);
    } else {
      SD.clear('presensi-buku');
      onBukuChange();
    }

    const histWrap = document.getElementById('historical-mode-wrap');
    const histCb   = document.getElementById('presensi-is-historical');
    if (histWrap) histWrap.style.display = 'none';
    if (histCb)   histCb.checked = false;

    UI.openModal('modal-presensi');
  }

  function clearForm() {
    const titleEl = document.getElementById('modal-presensi-title');
    if (titleEl) titleEl.textContent = 'Catat Presensi Baru';
    document.getElementById('presensi-id-field').value  = '';

    const tglInput = document.getElementById('presensi-tanggal');
    if (tglInput) tglInput.value = '';

    document.getElementById('presensi-status').value  = 'HADIR';
    document.getElementById('presensi-catatan').value = '';

    const bintangEl = document.getElementById('presensi-bintang');
    if (bintangEl) { bintangEl.max = 6; bintangEl.value = 5; }

    // ── SD: clear semua dropdown ────────────────────────────────────────────
    SD.clear('presensi-murid');
    SD.clear('presensi-mentor');
    SD.clear('presensi-buku');
    onBukuChange();

    const progressWidget = document.getElementById('presensi-progress-widget');
    if (progressWidget) progressWidget.style.display = 'none';

    // ── Reset historical toggle ─────────────────────────────────────────────
    const histCb     = document.getElementById('presensi-is-historical');
    const histWrap   = document.getElementById('historical-mode-wrap');
    const histToggle = histWrap ? histWrap.querySelector('div[onclick]') : null;

    if (histCb) histCb.checked = false;

    if (histToggle) {
      histToggle.style.background  = 'var(--warning-dim)';
      histToggle.style.borderColor = 'var(--warning)';
      const dot   = histToggle.querySelector('.hist-dot');
      const title = histToggle.querySelector('.hist-title');
      const sub   = histToggle.querySelector('.hist-sub');
      if (dot)   { dot.style.background  = 'var(--warning)'; dot.style.transform = 'translateX(0)'; }
      if (title) title.style.color = 'var(--warning)';
      if (sub)   sub.style.color   = 'var(--text-secondary)';
    }

    const role = API.currentRole();
    if (histWrap) {
      histWrap.style.display = (role === 'ADMIN' || role === 'OWNER') ? 'block' : 'none';
    }

    UI.openModal('modal-presensi');
  }

  // ── saveForm — baca dari hidden <select> yang auto-sync oleh SD ───────────
  async function saveForm() {
    const id        = document.getElementById('presensi-id-field').value;
    const tanggal   = document.getElementById('presensi-tanggal').value;
    const muridSel  = document.getElementById('presensi-murid');
    const mentorSel = document.getElementById('presensi-mentor');
    const status    = document.getElementById('presensi-status').value;
    const catatan   = document.getElementById('presensi-catatan').value.trim();
    const bintang   = document.getElementById('presensi-bintang').value;

    const bukuSel  = document.getElementById('presensi-buku');
    const babSel   = document.getElementById('presensi-bab');
    const id_buku  = bukuSel ? bukuSel.value  : '';
    const nama_bab = babSel  ? babSel.value   : '';

    const histCb        = document.getElementById('presensi-is-historical');
    const is_historical = histCb ? histCb.checked : false;

    if (!tanggal || !muridSel.value) { UI.toast('Tanggal dan murid wajib diisi', 'error'); return; }
    if (id_buku && !nama_bab) { UI.toast('Modul sudah dipilih — pilih juga Bab yang dipelajari', 'error'); return; }

    // Validasi: tanggal lampau hanya boleh jika mode historis dicentang
    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const tglDate = new Date(tanggal); tglDate.setHours(0, 0, 0, 0);
    if (!id && tglDate < today && !is_historical) {
      UI.toast('Tanggal sudah lewat! Centang "Mode Historis" untuk mencatat presensi lampau.', 'error');
      return;
    }

    const muridOpt  = muridSel.options[muridSel.selectedIndex];
    const mentorOpt = mentorSel.options[mentorSel.selectedIndex];

    // ── Feedback instan begitu tombol diklik — SEBELUM fetch jadwal
    //    dimulai. Tanpa ini ada jeda beberapa detik tanpa perubahan visual
    //    apapun (nunggu API.jadwal.getByMurid), yang bikin user ngira
    //    klik-nya gak kedaftar terus klik berkali-kali.
    const btn = document.getElementById('presensi-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = `<div class="spinner spinner-sm"></div> Memeriksa jadwal...`; }

    // ── Validasi jadwal: cek apakah hari dari tanggal yang dipilih cocok
    //    sama hari terdaftar murid ini di DB JADWAL. Ini cuma PERINGATAN
    //    (via confirm), bukan blokir — bisa aja emang sengaja (sesi
    //    tambahan di luar jadwal reguler, jadwal baru belum diinput, dll).
    const jadwalRes = await API.jadwal.getByMurid(muridSel.value);
    if (jadwalRes.status === 'OK' && jadwalRes.data.length > 0) {
      const DAYS_ID     = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'];
      const hariTanggal = DAYS_ID[new Date(tanggal + 'T00:00:00').getDay()];
      const hariJadwal  = new Set(jadwalRes.data.map(j => String(j.hari).toUpperCase()));

      if (!hariJadwal.has(hariTanggal)) {
        const _cap       = s => s.charAt(0) + s.slice(1).toLowerCase();
        const namaMurid  = muridOpt ? muridOpt.dataset.nama : '';
        const daftarHari = [...hariJadwal].map(_cap).join(', ');

        // Kembalikan tombol ke keadaan normal selama dialog konfirmasi
        // tampil — jangan biarkan "disabled ngambang" pas user lagi baca.
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan Presensi'; lucide.createIcons({ nodes: [btn] }); }

        const ok = await UI.confirm(
          `<div style="font-size:0.875rem;line-height:1.6;">
            Tanggal ini jatuh di hari <b>${_cap(hariTanggal)}</b>, tapi jadwal terdaftar
            ${UI.escape(namaMurid)} adalah <b>${daftarHari}</b>.<br><br>
            Tetap simpan presensi di tanggal ini?
          </div>`,
          { title: 'Tanggal Di Luar Jadwal', okLabel: 'Tetap Simpan', okClass: 'btn btn-outline', icon: 'calendar-x' }
        );
        if (!ok) return;

        // Lanjut simpan — nyalain lagi status disabled/spinner-nya.
        if (btn) { btn.disabled = true; btn.innerHTML = `<div class="spinner spinner-sm"></div> ${id ? 'Memperbarui...' : 'Menyimpan...'}`; }
      }
    }

    try {
      const payload = {
        tanggal,
        id_murid:    muridSel.value,
        nama_murid:  muridOpt  ? muridOpt.dataset.nama    : '',
        id_mentor:   mentorSel.value,
        nama_mentor: mentorOpt ? mentorOpt.dataset.nama   : '',
        program:     muridOpt  ? muridOpt.dataset.program : '',
        status, catatan,
        bintang: Math.min(parseInt(bintang) || 0, 6),
        id_buku,
        nama_bab,
        is_historical
      };

      const res = id
        ? await API.presensi.update({ id, ...payload })
        : await API.presensi.add(payload);

      if (res.status === 'OK') {
        const msg = is_historical
          ? 'Presensi historis dicatat (kuota SPP dipotong)'
          : (id ? 'Presensi diperbarui' : 'Presensi berhasil dicatat!');
        UI.toast(msg, is_historical ? 'warning' : 'success');
        UI.closeModal('modal-presensi');
        setTimeout(() => load(true), 500);
      } else {
        UI.toast(res.message || 'Gagal menyimpan', 'error');
      }
    } catch(e) {
      UI.toast('Error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan Presensi'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  async function deleteItem(id) {
    const p = allData.find(x => x.id === id);
    if (!await UI.confirm('Hapus presensi ini? Sisa pertemuan murid akan bertambah kembali secara otomatis.', { title: 'Hapus Presensi', okLabel: 'Ya, Hapus', okClass: 'btn btn-danger', icon: 'trash-2' })) return;
    if (deleteItem._loading) return;
    deleteItem._loading = true;

    lastDeletedData = p ? JSON.parse(JSON.stringify(p)) : null;
    lastAction      = 'DELETE';

    const btn             = document.querySelector(`[data-delete-id="${id}"]`);
    const originalContent = btn ? btn.innerHTML : '';
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>'; }
      const res = await API.presensi.delete(id);
      if (res.status === 'OK') {
        UI.toast('Data presensi berhasil dihapus & kuota SPP dikembalikan', 'success');
        if (window.SPPPage) SPPPage.invalidateCache();
        await load(true);
        const undoBtn = document.getElementById('presensi-undo-btn');
        if (undoBtn) undoBtn.disabled = false;
      } else {
        UI.toast(res.message || 'Gagal menghapus', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server.', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
    } finally {
      deleteItem._loading = false;
    }
  }

  async function undo() {
    if (!lastAction || !lastDeletedData) return;
    const undoBtn = document.getElementById('presensi-undo-btn');
    const redoBtn = document.getElementById('presensi-redo-btn');
    try {
      if (undoBtn) undoBtn.disabled = true;
      if (lastAction === 'DELETE') {
        const res = await API.presensi.add(lastDeletedData);
        if (res.status === 'OK') {
          UI.toast('Undo Berhasil: Presensi dikembalikan!', 'success');
          lastRestoredId = res.data?.id || lastDeletedData.id;
          lastAction     = 'UNDO_DELETE';
          if (redoBtn) redoBtn.disabled = false;
          load(true);
        } else {
          UI.toast(res.message || 'Undo gagal', 'error');
          if (undoBtn) undoBtn.disabled = false;
        }
      }
    } catch(e) { UI.toast('Gagal melakukan Undo', 'error'); if (undoBtn) undoBtn.disabled = false; }
  }

  async function redo() {
    if (!lastRestoredId || lastAction !== 'UNDO_DELETE') return;
    const redoBtn = document.getElementById('presensi-redo-btn');
    try {
      if (redoBtn) redoBtn.disabled = true;
      const res = await API.presensi.delete(lastRestoredId);
      if (res.status === 'OK') {
        UI.toast('Redo Berhasil: Presensi dihapus kembali!', 'success');
        lastAction     = 'DELETE';
        lastRestoredId = null;
        const undoBtn  = document.getElementById('presensi-undo-btn');
        if (undoBtn) undoBtn.disabled = false;
        load(true);
      } else {
        UI.toast(res.message || 'Redo gagal', 'error');
        if (redoBtn) redoBtn.disabled = false;
      }
    } catch(e) { UI.toast('Gagal melakukan Redo', 'error'); if (redoBtn) redoBtn.disabled = false; }
  }

  async function deleteAll() {
    const total = allData.length;
    if (total === 0) return UI.toast('Tidak ada data untuk dihapus', 'info');
    if (!await UI.confirmDanger(`PERINGATAN! Akan menghapus SEMUA (${total}) data presensi.`, 'HAPUS SEMUA PRESENSI')) return;
    UI.toast('Sedang membersihkan database...', 'info');
    try {
      const res = await API.presensi.deleteAll();
      if (res.status === 'OK') {
        UI.toast('Seluruh data presensi berhasil dihapus!', 'success');
        load(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus semua data', 'error');
      }
    } catch(e) { UI.toast('Gagal menghapus semua data', 'error'); }
  }

  function deleteSelected()  { return Selection.deleteSelected('presensi'); }
  function _getCurrentData() { return allData; }

  // ── Export ────────────────────────────────────────────────────────────────
  function exportExcel() {
    const headers = ['ID', 'Tanggal', 'Murid', 'Mentor', 'Program', 'Status', 'Bintang', 'Materi', 'Catatan'];
    const rows    = allData.map(p => [p.id, UI.formatDate(p.tanggal), p.nama_murid, p.nama_mentor, p.program, p.status, p.bintang || 0, p.nama_bab || '-', p.catatan || '-']);
    UI.exportExcel(headers, rows, 'Data_Presensi', 'Presensi');
  }

  function exportPDF() {
    const headers = ['ID', 'Tanggal', 'Murid', 'Mentor', 'Program', 'Status', 'Bintang', 'Materi', 'Catatan'];
    const rows    = allData.map(p => [p.id, UI.formatDate(p.tanggal), p.nama_murid, p.nama_mentor, p.program, p.status, p.bintang || 0, p.nama_bab || '-', p.catatan || '-']);
    UI.exportPDF('Data Presensi', headers, rows, { subtitle: 'Riwayat presensi seluruh murid' });
  }

  // ── Sort ──────────────────────────────────────────────────────────────────
  let _currentSort = { col: 'tanggal', asc: false };
  function sortBy(col) {
    _currentSort.asc = _currentSort.col === col ? !_currentSort.asc : true;
    _currentSort.col = col;
    allData.sort((a, b) => {
      const valA = (a[col] || '').toString().toLowerCase();
      const valB = (b[col] || '').toString().toLowerCase();
      return _currentSort.asc
        ? valA.localeCompare(valB, undefined, { numeric: true })
        : valB.localeCompare(valA, undefined, { numeric: true });
    });
    renderTable(allData);
  }

  return {
    load, search, saveForm, filterByDate, filterByMonth,
    setFilterMode, onFilterBulanChange, onFilterTanggalChange,
    prevMonth, nextMonth, openMonthPicker, _setMonthFromPicker,
    openAdd, openEdit,
    deleteItem, undo, redo, deleteAll, deleteSelected,
    renderTable, renderRows, _getCurrentData, sortBy,
    exportExcel, exportPDF
  };

})();

window.PresensiPage = PresensiPage;