const MentorPage = (() => {
  let allData         = [];
  let filteredData    = [];
  let isFetched       = false;
  let lastDeletedData = null;
  let lastAction      = null;
  let lastAddedId     = null;
  let lastRestoredId  = null;

  // ── Pisahin nomor kontak yang TERSIMPAN jadi { cc, local }.
  //    Format BARU (sejak fitur kode negara): "<cc>-<nomor_lokal>", misal
  //    "62-812336007162" atau "60-123456789" — pakai separator biar GAK
  //    AMBIGU (banyak nomor HP Indonesia kebetulan diawali 81/82/86 dst yang
  //    bisa nabrak kode negara lain kalau cuma nebak dari digit doang).
  //    Data LAMA (sebelum fitur ini ada) gak punya separator sama sekali —
  //    itu tandanya bare nomor lokal Indonesia polos (mulai 8... atau 0...).
  function _parseKontakStored(stored) {
    const raw = String(stored || '').trim();
    if (!raw) return { cc: '62', local: '' };

    const m = raw.match(/^(\d{1,3})-(\d+)$/);
    if (m) return { cc: m[1], local: m[2] };

    // Legacy: gak ada separator -> pasti nomor Indonesia polos.
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = digits.slice(1);
    return { cc: '62', local: digits };
  }

  // ── Gabungin cc (dari dropdown) + input nomor lokal jadi satu string buat
  //    disimpan ke server, format "<cc>-<nomor_lokal>".
  //    Defensif: kalau user gak sengaja masih nulis 0 atau ngulang kode
  //    negaranya di kotak nomor, itu di-strip duluan.
  function _normalizeKontakForSave(localRaw, cc) {
    let digits = String(localRaw || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith(cc)) digits = digits.slice(cc.length);
    if (digits.startsWith('0')) digits = digits.slice(1);
    return `${cc}-${digits}`;
  }

  // ── Format nomor kontak (WA) buat DISPLAY, misal "+62 823-2603-9686".
  //    Bekerja baik utk data baru (ada cc eksplisit) maupun data lama (gak ada,
  //    di-asumsikan Indonesia lewat _parseKontakStored).
  //    Data mentah yang tersimpan/dikirim ke server tidak diubah sama sekali,
  //    ini murni kosmetik biar rapi dilihat & aman kalau di-export ke Excel
  //    (leading "0" gampang kepotong Excel, "+62" aman karena diawali non-angka).
  function _formatKontak(kontak) {
    if (!kontak) return '-';
    const { cc, local } = _parseKontakStored(kontak);
    if (!local) return '-';

    // Grouping ala nomor HP: 3 digit pertama, sisanya per 4 digit.
    const head = local.slice(0, 3);
    const rest = local.slice(3).match(/.{1,4}/g) || [];
    const grouped = [head, ...rest].join('-');

    return `+${cc} ${grouped}`;
  }

  // ── Daftar negara buat searchable dropdown kode negara. badge nampilin
  //    "+62" dst di sisi kanan opsi (lihat SD.js: it.badge).
  // Daftar lengkap ada di CountryCodes.js (window.COUNTRY_CODE_ITEMS_FULL).
  // Fallback singkat kalau file itu belum ke-load, biar tidak error.
  const _COUNTRY_CODE_ITEMS = window.COUNTRY_CODE_ITEMS_FULL || [
    { value: '62', label: 'Indonesia',        badge: '+62' },
    { value: '60', label: 'Malaysia',         badge: '+60' },
    { value: '65', label: 'Singapura',        badge: '+65' },
    { value: '1',  label: 'Amerika/Kanada',   badge: '+1'  },
    { value: '44', label: 'Inggris',          badge: '+44' },
    { value: '86', label: 'China',            badge: '+86' },
    { value: '91', label: 'India',            badge: '+91' },
    { value: '81', label: 'Jepang',           badge: '+81' },
    { value: '82', label: 'Korea Selatan',    badge: '+82' }
  ];

  function _ensureCountryCodeDropdown() {
    if (typeof SD !== 'undefined') SD.populate('mentor-kontak-cc', _COUNTRY_CODE_ITEMS);
  }

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('mentor-tbody');
    if (!tbody) return;

    if (forceRefresh) {
      lastDeletedData = null;
      lastAction      = null;
      lastRestoredId  = null;
    }

    if (!forceRefresh && isFetched) {
      renderTable(allData);
      updateSummary(allData);
      return;
    }
      tbody.innerHTML = '<tr><td colspan="8" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data mentor...</td></tr>';

    try {
      const res = await API.mentor.getAll();
      if (res.status === 'OK') {
        allData      = (res.data || []).sort((a, b) => a.id.localeCompare(b.id));
        filteredData = [...allData];
        isFetched    = true;
        renderTable(allData);
        updateSummary(allData);
      }
    } catch(e) {
      console.error('Error Load Mentor:', e);
      if (!allData.length) tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Gagal memuat data mentor.</td></tr>';
    }
  }

  function renderTable(data) {
    Pagination.setData('mentor', data);
  }

  function renderRows(slice) {
  const role    = API.currentRole();
  const canEdit = role === 'ADMIN';
  const rows    = slice.map(m => {
    const color  = m.jk === 'L' ? '#689bee' : '#e76fab';
    const jkText = m.jk === 'L' ? '♂ Laki-laki' : '♀ Perempuan';
    return `
      <tr>
        <td style="width:32px;">${Selection.checkbox('mentor', m.id)}</td>
        <td><span class="id-badge">${UI.escape(m.id)}</span></td>
        <td>
          <div class="name-cell">
            <span class="avatar-initial mentor-avatar" style="background:${color}20;color:${color};">
              ${UI.escape((m.nama || '?')[0].toUpperCase())}
            </span>
            <div>
              <strong>${UI.escape(m.nama)}</strong>
              <small style="display:block;color:${color};font-weight:500;margin-top:2px;">${jkText}</small>
            </div>
          </div>
        </td>
        <td>${UI.escape(_formatKontak(m.kontak))}</td>
        <td><span class="program-tag">${UI.escape(m.program)}</span></td>
        <td>${UI.statusBadge(m.status)}</td>
        <td>${UI.formatCurrency(m.fee_harian)}</td>
        <td>
          <div class="action-btns">
            ${canEdit ? `
            <button class="btn-icon btn-warning" onclick="MentorPage.openEdit('${m.id}')" title="Edit">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-icon btn-danger" data-delete-id="${m.id}" onclick="MentorPage.deleteMentor('${m.id}','${(m.nama||'').replace(/'/g,"\\'")}')">
              <i data-lucide="trash-2"></i>
            </button>` : '-'}
          </div>
        </td>
      </tr>`;
  });
  UI.renderTable('mentor-tbody', rows, 'Belum ada data mentor');
  lucide.createIcons({ nodes: [document.getElementById('mentor-tbody')] });
}

  function updateSummary(data) {
    const totalEl = document.getElementById('mentor-total-count');
    const aktifEl = document.getElementById('mentor-active-count');
    if (totalEl) totalEl.textContent = data.length;
    if (aktifEl) aktifEl.textContent = data.filter(m => m.status === 'AKTIF').length;
  }

  function search(term) {
    Pagination.reset('mentor');
    const filtered = allData.filter(m =>
      m.nama.toLowerCase().includes(term.toLowerCase())    ||
      m.program.toLowerCase().includes(term.toLowerCase()) ||
      m.id.toLowerCase().includes(term.toLowerCase())
    );
    renderTable(filtered);
  }

  function openAdd() {
    clearForm();
    _ensureCountryCodeDropdown();
    if (typeof SD !== 'undefined') SD.setValue('mentor-kontak-cc', '62');
    const title = document.getElementById('mentor-modal-title');
    if (title) title.textContent = 'Tambah Mentor Baru';
    UI.openModal('modal-mentor');
  }

  async function openEdit(id) {
    if (!allData.length) { UI.toast('Memuat data...', 'info'); await load(); }
    const m = allData.find(x => x.id === id);
    if (!m) { UI.toast('Data mentor tidak ditemukan', 'error'); return; }
    document.getElementById('mentor-modal-title').textContent  = 'Edit Mentor';
    document.getElementById('mentor-id-field').value  = m.id;
    document.getElementById('mentor-nama').value      = m.nama;
    const jkField = document.getElementById('mentor-jk');
    if (jkField) jkField.value = m.jk || 'L';
    _ensureCountryCodeDropdown();
    const { cc, local } = _parseKontakStored(m.kontak);
    if (typeof SD !== 'undefined') SD.setValue('mentor-kontak-cc', cc);
    document.getElementById('mentor-kontak').value    = local || '';
    document.getElementById('mentor-status').value    = m.status;
    document.getElementById('mentor-fee-harian').value = m.fee_harian;
    // Load program sebagai tags
    const progInput = document.getElementById('mentor-program-input');
    if (progInput) progInput.value = '';
    _setTags((m.program || '').split(',').map(t => t.trim()).filter(Boolean));
    _initTagInput();
    UI.openModal('modal-mentor');
  }

  // ── Tag Input helpers ──────────────────────────────────────────────────
  function _getTags() {
    const hidden = document.getElementById('mentor-program');
    if (!hidden || !hidden.value.trim()) return [];
    return hidden.value.split(',').map(t => t.trim()).filter(Boolean);
  }

  function _setTags(list) {
    const hidden = document.getElementById('mentor-program');
    const tagsEl = document.getElementById('mentor-program-tags');
    if (!hidden || !tagsEl) return;
    const unique = [...new Set(list.map(t => t.trim()).filter(Boolean))];
    hidden.value = unique.join(', ');
    tagsEl.innerHTML = unique.map(t =>
      `<span class="tag-chip">${UI.escape(t)}<span class="tag-remove" onclick="MentorPage.removeTag('${t.replace(/'/g, "\\'")}')">×</span></span>`
    ).join('');
  }

  function addTagFromInput() {
    const input = document.getElementById('mentor-program-input');
    if (!input) return;
    const raw = input.value.split(',').map(t => t.trim()).filter(Boolean);
    if (!raw.length) return;
    _setTags([..._getTags(), ...raw]);
    input.value = '';
  }

  function removeTag(tag) {
    _setTags(_getTags().filter(t => t !== tag));
  }

  function _initTagInput() {
    const input = document.getElementById('mentor-program-input');
    if (!input || input._tagListenerAttached) return;
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTagFromInput();
      } else if (e.key === 'Backspace' && !input.value) {
        const tags = _getTags();
        if (tags.length) _setTags(tags.slice(0, -1));
      }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) addTagFromInput(); });
    input._tagListenerAttached = true;
  }
  // ────────────────────────────────────────────────────────────────────────

  function clearForm() {
    ['mentor-id-field', 'mentor-nama', 'mentor-kontak', 'mentor-fee-harian'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const jk = document.getElementById('mentor-jk');
    if (jk) jk.selectedIndex = 0;
    const status = document.getElementById('mentor-status');
    if (status) status.value = 'AKTIF';
    if (typeof SD !== 'undefined') SD.clear('mentor-kontak-cc');
    _setTags([]);
    const input = document.getElementById('mentor-program-input');
    if (input) input.value = '';
    _initTagInput();
  }

  async function saveForm() {
    const id         = document.getElementById('mentor-id-field').value;
    const nama       = document.getElementById('mentor-nama').value.trim();
    const jk         = document.getElementById('mentor-jk').value;
    const program    = document.getElementById('mentor-program').value.trim();
    const cc         = (typeof SD !== 'undefined' ? SD.getValue('mentor-kontak-cc') : '') || '62';
    const kontakLocalRaw = document.getElementById('mentor-kontak').value;
    const kontak     = _normalizeKontakForSave(kontakLocalRaw, cc);
    const status     = document.getElementById('mentor-status').value;
    const fee_harian = document.getElementById('mentor-fee-harian').value;

    if (!nama)    return UI.toast('Nama mentor wajib diisi!', 'error');
    if (!jk)      return UI.toast('Jenis kelamin wajib dipilih!', 'error');
    if (!program) return UI.toast('Program wajib diisi!', 'error');
    if (!kontakLocalRaw.trim()) return UI.toast('Kontak WA wajib diisi!', 'error');
    // Aturan panjang nomor lokal (tanpa kode negara): Indonesia dipertahankan
    // sama seperti sebelumnya (min 11 digit); negara lain lebih longgar karena
    // format nomor lokalnya bervariasi.
    const localDigitsOnly = kontak.split('-')[1] || '';
    const minLen = cc === '62' ? 11 : 6;
    if (localDigitsOnly.length < minLen) {
      return UI.toast(`Nomor kontak minimal ${minLen} angka (tanpa kode negara)!`, 'error');
    }
    if (fee_harian === '') return UI.toast('Fee per sesi wajib diisi (boleh 0)!', 'error');

    // Anti-duplikat: cek nama yang sama saat tambah baru
    if (!id) {
      const duplikat = allData.find(m =>
        m.nama.trim().toLowerCase() === nama.toLowerCase()
      );
      if (duplikat) {
        UI.toast(`Mentor "${nama}" sudah terdaftar (${duplikat.id})`, 'error');
        return;
      }
    }

    const payload = { nama, jk, program, kontak, status, fee_harian: Number(fee_harian) };
    const btn     = document.getElementById('mentor-save-btn');

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyimpan...'; }
      const res = id ? await API.mentor.update({ id, ...payload }) : await API.mentor.add(payload);
      if (res.status === 'OK') {
        UI.toast(id ? 'Data mentor diperbarui' : 'Mentor berhasil ditambahkan', 'success');
        if (!id) { lastAddedId = res.data?.id || null; lastAction = 'ADD'; }
        UI.closeModal('modal-mentor');
        setTimeout(() => load(true), 800);
      } else {
        UI.toast(res.message || 'Gagal menyimpan data', 'error');
      }
    } catch(e) {
      console.error('Error Save Mentor:', e);
      UI.toast('Terjadi kesalahan koneksi', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  async function deleteMentor(id, nama) {
    const m = allData.find(x => x.id === id);
    if (!m) return;
    if (!await UI.confirmDelete(nama, 'mentor')) return;

    lastDeletedData = JSON.parse(JSON.stringify(m));
    lastAction      = 'DELETE';

    const btn             = document.querySelector(`button[data-delete-id="${id}"]`);
    const originalContent = btn ? btn.innerHTML : '';
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>'; btn.style.width = '40px'; }
      const res = await API.mentor.delete(id);
      if (res.status === 'OK') {
        UI.toast(`Mentor "${nama}" dihapus. Klik Undo untuk membatalkan.`, 'warning');
        allData = allData.filter(x => x.id !== id);
        renderTable(allData);
        const undoBtn = document.getElementById('mentor-undo-btn');
        if (undoBtn) undoBtn.disabled = false;
      } else {
        UI.toast(res.message || 'Gagal menghapus mentor', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
    }
  }

  async function undo() {
    if (!lastAction) return;
    const undoBtn = document.getElementById('mentor-undo-btn');
    const redoBtn = document.getElementById('mentor-redo-btn');
    try {
      if (undoBtn) undoBtn.disabled = true;
      let res;
      if (lastAction === 'DELETE' && lastDeletedData) {
        res = await API.mentor.add(lastDeletedData);
        if (res.status === 'OK') {
          UI.toast('Undo Berhasil: Data mentor dikembalikan!', 'success');
          lastRestoredId = res.data?.id || lastDeletedData.id;
          lastAction     = 'UNDO_DELETE';
          if (redoBtn) redoBtn.disabled = false;
        } else {
          UI.toast(res.message || 'Undo gagal', 'error');
          if (undoBtn) undoBtn.disabled = false;
        }
      } else if (lastAction === 'ADD' && lastAddedId) {
        res = await API.mentor.delete(lastAddedId);
        if (res.status === 'OK') { UI.toast('Undo Berhasil: Penambahan dibatalkan!', 'warning'); lastAction = null; }
        else { UI.toast(res.message || 'Undo gagal', 'error'); if (undoBtn) undoBtn.disabled = false; }
      }
      load(true);
    } catch(e) {
      UI.toast('Gagal melakukan Undo', 'error');
      if (undoBtn) undoBtn.disabled = false;
    }
  }

  async function redo() {
    if (!lastRestoredId || lastAction !== 'UNDO_DELETE') return;
    const redoBtn = document.getElementById('mentor-redo-btn');
    try {
      if (redoBtn) redoBtn.disabled = true;
      const res = await API.mentor.delete(lastRestoredId);
      if (res.status === 'OK') {
        UI.toast('Redo Berhasil: Data mentor dihapus kembali!', 'success');
        lastAction     = 'DELETE';
        lastRestoredId = null;
        const undoBtn  = document.getElementById('mentor-undo-btn');
        if (undoBtn) undoBtn.disabled = false;
        load(true);
      } else {
        UI.toast(res.message || 'Redo gagal', 'error');
        if (redoBtn) redoBtn.disabled = false;
      }
    } catch(e) {
      UI.toast('Gagal melakukan Redo', 'error');
      if (redoBtn) redoBtn.disabled = false;
    }
  }

  async function deleteAll() {
    const total = allData.length;
    if (total === 0) return UI.toast('Tidak ada data untuk dihapus', 'info');
    if (!await UI.confirmDanger(`PERINGATAN! Akan menghapus SEMUA (${total}) data mentor.`, 'HAPUS SEMUA MENTOR')) return;
    UI.toast('Sedang membersihkan database...', 'info');
    try {
      const res = await API.mentor.deleteAll();
      if (res.status === 'OK') {
        UI.toast('Seluruh data mentor berhasil dihapus!', 'success');
        load(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus semua data', 'error');
      }
    } catch(e) { UI.toast('Gagal menghapus semua data', 'error'); }
  }

  function deleteSelected()  { return Selection.deleteSelected('mentor'); }
  function _getCurrentData() { return allData; }


  // ── Export functions ─────────────────────────────────────────────────────
  function exportExcel() {
    const headers = ['ID', 'Nama', 'JK', 'Program', 'Kontak', 'Status', 'Fee/Sesi'];
    const rows    = allData.map(m => [m.id, m.nama, m.jk === 'L' ? 'Laki-laki' : 'Perempuan', m.program, _formatKontak(m.kontak), m.status, m.fee_harian]);
    UI.exportExcel(headers, rows, 'Data_Mentor', 'Mentor');
  }

  function exportPDF() {
    const headers = ['ID', 'Nama', 'JK', 'Program', 'Kontak', 'Status', 'Fee/Sesi'];
    const rows    = allData.map(m => [m.id, m.nama, m.jk === 'L' ? 'Laki-laki' : 'Perempuan', m.program, _formatKontak(m.kontak), m.status, UI.formatCurrency(m.fee_harian)]);
    UI.exportPDF('Data Mentor', headers, rows, {subtitle: 'Daftar seluruh mentor EduHome'});
  }


  // ── Sort function ─────────────────────────────────────────────────────────
  let _currentSort = { col: 'id', asc: true };
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

  return { load, search, openAdd, openEdit, saveForm, deleteMentor, updateSummary, undo, redo, deleteAll, deleteSelected, renderTable, renderRows, _getCurrentData, removeTag, addTagFromInput, sortBy,
    exportExcel, exportPDF
  };

})();

window.MentorPage = MentorPage;