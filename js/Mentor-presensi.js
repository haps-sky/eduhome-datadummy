function _localDateStr(d = new Date()) {
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }

const MentorPresensiPage = (() => {
  let myStudents  = [];
  let myPresensi  = [];
  let _bukuList   = [];
  let _submitting = false;
  let isFetched   = false;
  let _namaAsli   = '';
  let _idMentor   = '';

  // ── State filter aktif ────────────────────────────────────────────────────
  let _filterMode    = 'semua';   // 'semua' | 'hari_ini' | 'bulan' | 'tanggal'
  let _filterBulan   = '';        // format: 'YYYY-MM'
  let _filterTanggal = '';        // format: 'YYYY-MM-DD'
  let _searchQuery   = '';

  // ── Batas tanggal yang boleh diedit/hapus (H-7) ──────────────────────────
  function _batasEdit() {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return _localDateStr(d);
  }

  function _bisaEdit(tanggal) {
    return tanggal >= _batasEdit();
  }

  // ── Terapkan filter ke records ────────────────────────────────────────────
  function _applyFilter(records) {
    const today = _localDateStr();
    switch (_filterMode) {
      case 'hari_ini':
        return records.filter(p => p.tanggal === today);
      case 'bulan':
        if (!_filterBulan) return records;
        return records.filter(p => p.tanggal && p.tanggal.startsWith(_filterBulan));
      case 'tanggal':
        if (!_filterTanggal) return records;
        return records.filter(p => p.tanggal === _filterTanggal);
      default:
        return records;
    }
  }

  // ── Terapkan pencarian teks ke records ───────────────────────────────────
  function _applySearch(records) {
    if (!_searchQuery) return records;
    const q = _searchQuery.toLowerCase();
    return records.filter(p =>
      (p.nama_murid || '').toLowerCase().includes(q) ||
      (p.program    || '').toLowerCase().includes(q) ||
      (p.catatan    || '').toLowerCase().includes(q) ||
      (p.nama_bab   || '').toLowerCase().includes(q)
    );
  }

  function search(term) {
    _searchQuery = term || '';
    _renderFiltered();
  }

  // ── Update tampilan filter (badge aktif, visibility input) ─────────────────
  function _syncFilterUI() {
    ['semua', 'hari_ini', 'bulan', 'tanggal'].forEach(mode => {
      const btn = document.getElementById('filter-btn-' + mode);
      if (btn) btn.classList.toggle('filter-btn-active', _filterMode === mode);
    });

    const bulanWrap = document.getElementById('filter-bulan-wrap');
    const tglWrap   = document.getElementById('filter-tanggal-wrap');
    if (bulanWrap) bulanWrap.style.display = (_filterMode === 'bulan')   ? 'flex' : 'none';
    if (tglWrap)   tglWrap.style.display   = (_filterMode === 'tanggal') ? 'flex' : 'none';

    _updateFilterBadge();
  }

  function _updateFilterBadge() {
    const badge = document.getElementById('presensi-filter-count');
    if (!badge) return;
    const mine     = myPresensi.filter(p => _isMine(p));
    const filtered = _applySearch(_applyFilter(mine));
    const total    = mine.length;
    const shown    = filtered.length;

    if (_filterMode === 'semua' && !_searchQuery) {
      badge.textContent      = total + ' data';
      badge.style.background = '';
    } else {
      badge.textContent      = shown + ' dari ' + total;
      badge.style.background = shown > 0
        ? 'var(--color-background-info,#E6F1FB)'
        : 'var(--color-background-warning,#FAEEDA)';
    }
  }

  // ── Handler tombol filter ─────────────────────────────────────────────────
  function setFilterMode(mode) {
    _filterMode = mode;

    if (mode === 'bulan' && !_filterBulan) {
      _filterBulan = _localDateStr().slice(0, 7);
      const el = document.getElementById('filter-bulan-input');
      if (el) el.value = _filterBulan;
    }
    if (mode === 'tanggal' && !_filterTanggal) {
      _filterTanggal = _localDateStr();
      const el = document.getElementById('filter-tanggal-input');
      if (el) el.value = _filterTanggal;
    }

    _syncFilterUI();
    _renderFiltered();
  }

  function onFilterBulanChange() {
    const el = document.getElementById('filter-bulan-input');
    if (el) _filterBulan = el.value;
    _renderFiltered();
    _updateFilterBadge();
  }

  function onFilterTanggalChange() {
    const el = document.getElementById('filter-tanggal-input');
    if (el) _filterTanggal = el.value;
    _renderFiltered();
    _updateFilterBadge();
  }

  function _renderFiltered() {
    const mine = myPresensi.filter(p => _isMine(p));
    renderLog(_applySearch(_applyFilter(mine)));
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  async function load(forceRefresh = false) {
    const user  = API.currentUser();
    const today = _localDateStr();

    if (!forceRefresh && isFetched) {
      const mine = myPresensi.filter(p => _isMine(p));
      renderLog(_applySearch(_applyFilter(mine)));
      document.getElementById('mentor-presensi-tanggal').value = today;
      _syncFilterUI();
      return;
    }

    const tbody = document.getElementById('mentor-presensi-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data...</td></tr>';

    try {
      const [muridRes, presRes, mentorRes, bukuRes] = await Promise.all([
        API.murid.getAll(),
        API.presensi.getAll(),
        API.mentor.getAll(),
        API.buku.getAll()
      ]);

      myStudents = (muridRes.data || []).filter(m => m.status === 'AKTIF');
      myPresensi = presRes.data || [];
      _bukuList  = (bukuRes.data || []).map(b => ({
        ...b,
        bab_list: (b.bab_list && b.bab_list.length)
          ? b.bab_list
          : (b.bab ? b.bab.split('|').map(x => x.trim()).filter(Boolean) : [])
      })).filter(b => b.bab_list && b.bab_list.length > 0);

      const mentorId   = user.mentor_id || '';
      const mentorName = user.nama_mentor || user.username || '';
      const mentorData = (mentorRes.data || []).find(m =>
        m.id === mentorId || m.nama?.toLowerCase() === mentorName.toLowerCase()
      );
      _namaAsli = mentorData?.nama || mentorName;
      _idMentor = mentorData?.id   || mentorId;

      isFetched = true;

      populateStudentDropdown(myStudents);

      const mine = myPresensi.filter(p => _isMine(p));
      renderLog(_applySearch(_applyFilter(mine)));
      document.getElementById('mentor-presensi-tanggal').value = today;

      _syncFilterUI();
    } catch(e) { UI.toast('Gagal memuat data: ' + e.message, 'error'); }
  }

  // ── Cocokkan presensi ke mentor ini ──────────────────────────────────────
  function _isMine(p) {
    if (_idMentor && p.id_mentor && p.id_mentor === _idMentor) return true;
    if (_namaAsli && p.nama_mentor === _namaAsli) return true;
    return false;
  }

  // ── Populate dropdown murid (SD) ──────────────────────────────────────────
  function populateStudentDropdown(students) {
    const items = students.map(s => ({
      value: s.id,
      label: s.nama,
      badge: s.program,
      extra: { nama: s.nama, program: s.program }
    }));
    SD.populate('mentor-presensi-murid', items);
  }

  // ── Populate dropdown buku (SD) ───────────────────────────────────────────
  function populateBukuDropdown() {
    const items = _bukuList.map(b => {
      const label = [b.nama_modul, b.jenjang || '', b.program ? `(${b.program})` : '']
        .filter(Boolean).join(' - ');
      return {
        value: b.id,
        label: label,
        badge: b.jenjang || b.program || '',
        extra: { nama: b.nama_modul, bab: JSON.stringify(b.bab_list || []) }
      };
    });
    SD.populate('mentor-presensi-buku', items);

    const bk = document.getElementById('mentor-presensi-buku');
    if (bk && !bk._bukuListenerAttached) {
      bk.addEventListener('change', onBukuChange);
      bk._bukuListenerAttached = true;
    }
  }

  // ── onBukuChange — baca dari hidden <select> ──────────────────────────────
  function onBukuChange() {
    const bk      = document.getElementById('mentor-presensi-buku');
    const babSel  = document.getElementById('mentor-presensi-bab');
    const babWrap = document.getElementById('mentor-presensi-bab-wrap');
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

  // ── Buka modal untuk tambah ───────────────────────────────────────────────
  function openInputModal() {
    const idField   = document.getElementById('mentor-presensi-id-field');
    const tglEl     = document.getElementById('mentor-presensi-tanggal');
    const bintangEl = document.getElementById('mentor-presensi-bintang');
    const catatanEl = document.getElementById('mentor-presensi-catatan');
    const babWrap   = document.getElementById('mentor-presensi-bab-wrap');
    const titleEl   = document.getElementById('modal-mentor-title');

    if (idField)   idField.value   = '';
    if (tglEl)     tglEl.value     = _localDateStr();
    if (bintangEl) bintangEl.value = '5';
    if (catatanEl) catatanEl.value = '';
    if (babWrap)   babWrap.style.display = 'none';
    if (titleEl)   titleEl.textContent  = 'Input Presensi Murid Saya';

    SD.clear('mentor-presensi-murid');
    SD.clear('mentor-presensi-buku');
    populateBukuDropdown();
    if (myStudents.length) populateStudentDropdown(myStudents);
    onBukuChange();

    UI.openModal('modal-mentor-presensi');
  }

  // ── Buka modal untuk edit ─────────────────────────────────────────────────
  function openEditModal(id) {
    const p = myPresensi.find(x => x.id === id);
    if (!p) return;

    if (!_bisaEdit(p.tanggal)) {
      UI.toast('Presensi ini sudah lebih dari 7 hari, tidak bisa diedit. Hubungi admin.', 'error');
      return;
    }

    const idField   = document.getElementById('mentor-presensi-id-field');
    const tglEl     = document.getElementById('mentor-presensi-tanggal');
    const statusSel = document.getElementById('mentor-presensi-status');
    const bintangEl = document.getElementById('mentor-presensi-bintang');
    const catatanEl = document.getElementById('mentor-presensi-catatan');
    const titleEl   = document.getElementById('modal-mentor-title');

    if (idField)   idField.value   = p.id;
    if (tglEl)     tglEl.value     = p.tanggal;
    if (statusSel) statusSel.value = p.status;
    if (bintangEl) bintangEl.value = p.bintang || 5;
    if (catatanEl) catatanEl.value = p.catatan || '';
    if (titleEl)   titleEl.textContent = 'Edit Presensi';

    populateBukuDropdown();
    if (myStudents.length) populateStudentDropdown(myStudents);

    SD.setValue('mentor-presensi-murid', p.id_murid);

    if (p.id_buku) {
      SD.setValue('mentor-presensi-buku', p.id_buku);
      setTimeout(() => {
        const babSel = document.getElementById('mentor-presensi-bab');
        if (babSel && p.nama_bab) babSel.value = p.nama_bab;
      }, 120);
    } else {
      SD.clear('mentor-presensi-buku');
      onBukuChange();
    }

    UI.openModal('modal-mentor-presensi');
  }

  // ── Hapus presensi (hanya H-7) ────────────────────────────────────────────
  async function deleteItem(id) {
    const p = myPresensi.find(x => x.id === id);
    if (!p) return;

    if (!_bisaEdit(p.tanggal)) {
      UI.toast('Presensi ini sudah lebih dari 7 hari, tidak bisa dihapus. Hubungi admin.', 'error');
      return;
    }

    if (!await UI.confirm('Hapus presensi ini?', { title: 'Hapus Presensi', okLabel: 'Ya, Hapus', okClass: 'btn btn-danger', icon: 'trash-2' })) return;

    try {
      const res = await API.presensi.delete(id);
      if (res.status === 'OK') {
        UI.toast('Presensi berhasil dihapus', 'success');
        isFetched = false;
        await load(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus', 'error');
      }
    } catch(e) { UI.toast('Gagal terhubung ke server', 'error'); }
  }

  // ── Render tabel semua riwayat ────────────────────────────────────────────
  function renderLog(records) {
    const sorted = [...records].sort((a, b) => b.tanggal.localeCompare(a.tanggal));

    const rows = sorted.map(p => {
      const bolehEdit = _bisaEdit(p.tanggal);
      const bisaReschedule = p.status === 'IZIN' && p.status_efektif === 'IZIN' && !!p.id_spp;
      const rescheduleBtn = bisaReschedule
        ? `<button class="btn-icon btn-info" onclick='PresensiReschedule.open(${JSON.stringify(p).replace(/'/g, "&#39;")}, "mentor")' title="Jadwalkan Ulang (Makeup)">
            <i data-lucide="calendar-clock"></i>
          </button>`
        : '';
      const aksi = bolehEdit
        ? `<div class="action-btns">
            ${rescheduleBtn}
            <button class="btn-icon btn-warning" onclick="MentorPresensiPage.openEditModal('${p.id}')" title="Edit">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-icon btn-danger" onclick="MentorPresensiPage.deleteItem('${p.id}')" title="Hapus">
              <i data-lucide="trash-2"></i>
            </button>
          </div>`
        : (bisaReschedule
            ? `<div class="action-btns">${rescheduleBtn}</div>`
            : `<span style="font-size:0.72rem;color:var(--text-dim);" title="Lebih dari 7 hari">🔒 Terkunci</span>`);

      return `
        <tr>
          <td>${UI.formatDate(p.tanggal)}</td>
          <td><strong>${UI.escape(p.nama_murid)}</strong></td>
          <td><span class="program-tag">${UI.escape(p.program)}</span></td>
          <td>${UI.statusBadge(p.status)}</td>
          <td>${UI.stars(p.bintang)}</td>
          <td>${UI.escape(p.catatan || '-')}</td>
          <td>${UI.escape(p.nama_bab || '-')}</td>
          <td>${aksi}</td>
        </tr>`;
    });

    UI.renderTable('mentor-presensi-tbody', rows,
      (_filterMode === 'semua' && !_searchQuery)
        ? 'Belum ada riwayat presensi'
        : 'Tidak ada data yang cocok');
    lucide.createIcons({ nodes: [document.getElementById('mentor-presensi-tbody')] });

    _updateFilterBadge();
  }

  // ── Simpan (tambah / edit) ────────────────────────────────────────────────
  async function saveForm() {
    if (_submitting) return;

    const id       = document.getElementById('mentor-presensi-id-field').value;
    const tanggal  = document.getElementById('mentor-presensi-tanggal').value;
    const muridSel = document.getElementById('mentor-presensi-murid');
    const status   = document.getElementById('mentor-presensi-status').value;
    const bintang  = document.getElementById('mentor-presensi-bintang').value;
    const catatan  = document.getElementById('mentor-presensi-catatan').value;
    const bukuSel  = document.getElementById('mentor-presensi-buku');
    const babSel   = document.getElementById('mentor-presensi-bab');

    if (!tanggal || !muridSel.value) { UI.toast('Tanggal dan murid wajib diisi', 'error'); return; }

    if (!_bisaEdit(tanggal)) {
      UI.toast('Tanggal sudah lebih dari 7 hari yang lalu. Hubungi admin untuk input data lama.', 'error');
      return;
    }

    const duplikat = myPresensi.find(p =>
      p.id_murid === muridSel.value &&
      p.tanggal  === tanggal &&
      p.id       !== id &&
      _isMine(p)
    );
    if (duplikat) {
      UI.toast(`Presensi untuk murid ini pada ${tanggal} sudah dicatat.`, 'error');
      return;
    }

    const opt      = muridSel.options[muridSel.selectedIndex];
    const id_buku  = bukuSel?.value  || '';
    const nama_bab = babSel?.value   || '';

    if (id_buku && !nama_bab) {
      UI.toast('Modul sudah dipilih — pilih juga Bab yang dipelajari', 'error');
      return;
    }

    const payload = {
      tanggal,
      id_murid:    muridSel.value,
      nama_murid:  opt?.dataset.nama    || '',
      id_mentor:   _idMentor            || '',
      nama_mentor: _namaAsli            || '',
      program:     opt?.dataset.program || '',
      status,
      catatan,
      bintang:  parseInt(bintang) || 0,
      id_buku,
      nama_bab
    };

    const btn = document.getElementById('mentor-presensi-save-btn');
    _submitting = true;
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyimpan...'; }

    try {
      const res = id
        ? await API.presensi.update({ id, ...payload })
        : await API.presensi.add(payload);

      if (res.status === 'OK') {
        UI.toast(id ? 'Presensi diperbarui' : 'Presensi berhasil dicatat', 'success');
        UI.closeModal('modal-mentor-presensi');
        isFetched = false;
        await load(true);
      } else {
        UI.toast(res.message || 'Gagal menyimpan presensi', 'error');
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
    } finally {
      _submitting = false;
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  function refresh() {
    isFetched = false;
    load(true);
  }

  return {
    load, refresh, saveForm, search,
    openInputModal, openEditModal, deleteItem, onBukuChange,
    setFilterMode, onFilterBulanChange, onFilterTanggalChange
  };
})();

window.MentorPresensiPage = MentorPresensiPage;