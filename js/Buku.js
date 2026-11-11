const BukuPage = (() => {
  let allData      = [];
  let isFetched    = false;
  let lastDeletedData = null;
  let lastAction      = null;
  let lastAddedId     = null;
  let lastRestoredId  = null;

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('buku-tbody');
    if (!tbody) return;

    if (forceRefresh) {
      lastDeletedData = null;
      lastAction      = null;
      lastRestoredId  = null;
    }

    if (!forceRefresh && isFetched) {
      renderTable(allData);
      return;
    }
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data modul belajar...</td></tr>';

    try {
      const bukuRes = await API.buku.getAll();
      if (bukuRes.status === 'OK') {
        allData = (bukuRes.data || []).map(b => ({
          id:         b.id,
          nama_modul: b.nama_modul || b.nama || '',
          jenjang:    b.jenjang    || '',
          program:    b.program    || '',
          stok:       Number(b.stok)       || 0,
          harga_beli: Number(b.harga_beli) || 0,
          harga_jual: Number(b.harga_jual) || 0,
          keterangan: b.keterangan || '',
          bab:        b.bab        || '',
          bab_list:   (b.bab_list && b.bab_list.length) ? b.bab_list : (b.bab ? b.bab.split('|').map(x => x.trim()).filter(Boolean) : [])
        }));
        isFetched    = true;
        renderTable(allData);
      }
    } catch(e) {
      console.error(e);
      if (!allData.length) tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Gagal memuat data.</td></tr>';
    }
  }

  function getData() { return allData; }

  function search(term) {
    Pagination.reset('buku');
    const filtered = allData.filter(b =>
      (b.nama_modul||'').toLowerCase().includes(term.toLowerCase()) ||
      (b.program   ||'').toLowerCase().includes(term.toLowerCase()) ||
      (b.jenjang   ||'').toLowerCase().includes(term.toLowerCase())
    );
    renderTable(filtered);
  }

  function renderTable(data) {
    Pagination.setData('buku', data);
  }

  function renderRows(slice) {
    const role    = API.currentRole();
    const canEdit = role === 'ADMIN';

    const rows = slice.map(b => {
      const keuntungan = (b.harga_jual || 0) - (b.harga_beli || 0);
      return `
        <tr>
          <td style="width:32px;">
            ${Selection.checkbox('buku', b.id)}
          </td>

          <td>
            <span class="id-badge">${b.id}</span>
          </td>

          <td>
            <strong>${UI.escape(b.nama_modul)}</strong>
          </td>

          <td>
            ${UI.escape(b.jenjang || '-')}
            ${b.program ? `<br><span class="program-tag">${UI.escape(b.program)}</span>` : ''}
          </td>

          <td>${b.stok}</td>

          <td>${UI.formatCurrency(b.harga_beli)}</td>

          <td>${UI.formatCurrency(b.harga_jual)}</td>

          <td style="color:${keuntungan >= 0 ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)'};">
            ${UI.formatCurrency(keuntungan)}
          </td>

          <td>
            <div class="action-btns">
              ${canEdit ? `
                <button
                  class="btn-icon btn-warning"
                  onclick="BukuPage.openEdit('${b.id}')"
                >
                  <i data-lucide="pencil"></i>
                </button>

                <button
                  class="btn-icon btn-danger"
                  data-delete-id="${b.id}"
                  onclick="BukuPage.deleteBuku('${b.id}','${(b.nama_modul || '').replace(/'/g, "\\'")}')"
                >
                  <i data-lucide="trash-2"></i>
                </button>
              ` : '-'}
            </div>
          </td>
        </tr>
      `;
    });

    UI.renderTable(
      'buku-tbody',
      rows,
      'Belum ada data modul'
    );

    lucide.createIcons({
      nodes: [document.getElementById('buku-tbody')]
    });
  }

  function _resetBukuForm() {
    ['buku-id-field','buku-nama','buku-jenjang','buku-program','buku-ket','buku-bab'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    ['buku-stok','buku-harga-beli','buku-harga-jual'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '0';
    });
  }

  function openAdd() {
    _resetBukuForm();
    const titleEl = document.getElementById('buku-modal-title');
    if (titleEl) titleEl.textContent = 'Tambah Modul';
    UI.openModal('modal-buku');
  }

  function openEdit(id) {
    const b = allData.find(x => x.id === id);
    if (!b) return;
    _resetBukuForm();
    document.getElementById('buku-modal-title').textContent  = 'Edit Modul';
    document.getElementById('buku-id-field').value           = b.id;
    document.getElementById('buku-nama').value               = b.nama_modul || '';
    document.getElementById('buku-jenjang').value            = b.jenjang    || '';
    document.getElementById('buku-program').value            = b.program    || '';
    document.getElementById('buku-stok').value               = b.stok       || 0;
    document.getElementById('buku-harga-beli').value         = b.harga_beli || 0;
    document.getElementById('buku-harga-jual').value         = b.harga_jual || 0;
    document.getElementById('buku-ket').value                = b.keterangan || '';
    const babEl = document.getElementById('buku-bab');
    if (babEl) babEl.value = (b.bab_list || []).join('\n');
    UI.openModal('modal-buku');
  }

  async function saveForm() {
    const btn        = document.querySelector('#modal-buku .btn-primary');
    const id         = document.getElementById('buku-id-field').value;
    const nama_modul = document.getElementById('buku-nama').value.trim();
    const jenjang    = document.getElementById('buku-jenjang').value.trim();
    const program    = document.getElementById('buku-program').value.trim();
    const stok       = Number(document.getElementById('buku-stok').value)       || 0;
    const harga_beli = Number(document.getElementById('buku-harga-beli').value) || 0;
    const harga_jual = Number(document.getElementById('buku-harga-jual').value) || 0;
    const keterangan = document.getElementById('buku-ket').value.trim();

    const babEl  = document.getElementById('buku-bab');
    const babRaw = babEl ? babEl.value : '';
    const bab    = babRaw
      .split('\n')
      .map(b => b.trim())
      .filter(Boolean)
      .join('|');

    if (!nama_modul) { UI.toast('Nama modul wajib diisi', 'error'); return; }
    if (stok < 0)       { UI.toast('Stok tidak boleh negatif', 'error'); return; }
    if (harga_beli < 0) { UI.toast('Harga modal tidak valid', 'error'); return; }
    if (harga_jual < 0) { UI.toast('Harga jual tidak valid', 'error'); return; }
    if (harga_jual > 0 && harga_beli > 0 && harga_jual < harga_beli) {
      if (!await UI.confirm(`Harga jual (${UI.formatCurrency(harga_jual)}) lebih rendah dari harga modal (${UI.formatCurrency(harga_beli)}). Lanjutkan?`, { title: 'Periksa Harga', okLabel: 'Lanjutkan', okClass: 'btn-warning', icon: 'alert-triangle' })) return;
    }

    const payload = { nama_modul, jenjang, program, stok, harga_beli, harga_jual, keterangan, bab };

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyimpan...'; }
      const res = id ? await API.buku.update({ id, ...payload }) : await API.buku.add(payload);
      if (res.status === 'OK') {
        UI.toast(id ? 'Modul diperbarui' : 'Modul berhasil ditambahkan!', 'success');
        if (!id) { lastAddedId = res.data?.id || null; lastAction = 'ADD'; }
        UI.closeModal('modal-buku');
        setTimeout(() => load(true), 500);
      } else {
        UI.toast(res.message || 'Gagal menyimpan modul', 'error');
      }
    } catch(e) {
      console.error('Error Buku Modul:', e);
      UI.toast('Gagal terhubung ke server', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  async function deleteBuku(id, nama) {
    const b = allData.find(x => x.id === id);
    if (!await UI.confirmDelete(nama, 'modul')) return;

    lastDeletedData = b ? JSON.parse(JSON.stringify(b)) : null;
    lastAction      = 'DELETE';

    const btn             = document.querySelector(`button[data-delete-id="${id}"]`);
    const originalContent = btn ? btn.innerHTML : '';
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>'; btn.style.width = '40px'; }
      const res = await API.buku.delete(id);
      if (res.status === 'OK') {
        UI.toast(`Modul "${nama}" berhasil dihapus. Klik Undo untuk membatalkan.`, 'warning');
        allData = allData.filter(x => x.id !== id);
        renderTable(allData);
        const undoBtn = document.getElementById('buku-undo-btn');
        if (undoBtn) undoBtn.disabled = false;
      } else {
        UI.toast(res.message || 'Gagal menghapus modul', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
    }
  }

  async function undo() {
    if (!lastAction) return;
    const undoBtn = document.getElementById('buku-undo-btn');
    const redoBtn = document.getElementById('buku-redo-btn');
    try {
      if (undoBtn) undoBtn.disabled = true;
      let res;
      if (lastAction === 'DELETE' && lastDeletedData) {
        res = await API.buku.add(lastDeletedData);
        if (res.status === 'OK') {
          UI.toast('Undo Berhasil: Modul dikembalikan!', 'success');
          lastRestoredId = res.data?.id || lastDeletedData.id;
          lastAction     = 'UNDO_DELETE';
          if (redoBtn) redoBtn.disabled = false;
        } else {
          UI.toast(res.message || 'Undo gagal', 'error');
          if (undoBtn) undoBtn.disabled = false;
        }
      } else if (lastAction === 'ADD' && lastAddedId) {
        res = await API.buku.delete(lastAddedId);
        if (res.status === 'OK') { UI.toast('Undo Berhasil: Penambahan modul dibatalkan!', 'warning'); lastAction = null; }
        else { UI.toast(res.message || 'Undo gagal', 'error'); if (undoBtn) undoBtn.disabled = false; }
      }
      load(true);
    } catch(e) { UI.toast('Gagal melakukan Undo', 'error'); if (undoBtn) undoBtn.disabled = false; }
  }

  async function redo() {
    if (!lastRestoredId || lastAction !== 'UNDO_DELETE') return;
    const redoBtn = document.getElementById('buku-redo-btn');
    try {
      if (redoBtn) redoBtn.disabled = true;
      const res = await API.buku.delete(lastRestoredId);
      if (res.status === 'OK') {
        UI.toast('Redo Berhasil: Modul dihapus kembali!', 'success');
        lastAction     = 'DELETE';
        lastRestoredId = null;
        const undoBtn  = document.getElementById('buku-undo-btn');
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
    if (!await UI.confirmDanger(`PERINGATAN! Akan menghapus SEMUA (${total}) modul buku.`, 'HAPUS SEMUA MODUL')) return;
    UI.toast('Sedang membersihkan database...', 'info');
    try {
      const res = await API.buku.deleteAll();
      if (res.status === 'OK') {
        UI.toast('Seluruh modul berhasil dihapus!', 'success');
        load(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus semua data', 'error');
      }
    } catch(e) { UI.toast('Gagal menghapus semua data', 'error'); }
  }

  function deleteSelected()  { return Selection.deleteSelected('buku'); }
  function _getCurrentData() { return allData; }

  function exportExcel() {
    const headers = ['ID', 'Nama Modul', 'Jenjang', 'Program', 'Stok', 'Harga Beli', 'Harga Jual', 'Margin'];
    const rows    = allData.map(b => [b.id, b.nama_modul, b.jenjang || '-', b.program || '-', b.stok, b.harga_beli, b.harga_jual, b.harga_jual - b.harga_beli]);
    UI.exportExcel(headers, rows, 'Data_Buku', 'Modul Buku');
  }

  function exportPDF() {
    const headers = ['ID', 'Nama Modul', 'Jenjang', 'Program', 'Stok', 'Harga Beli', 'Harga Jual', 'Margin'];
    const rows    = allData.map(b => [b.id, b.nama_modul, b.jenjang || '-', b.program || '-', b.stok, b.harga_beli, b.harga_jual, b.harga_jual - b.harga_beli]);
    UI.exportPDF('Data Modul Buku', headers, rows, {subtitle: 'Daftar modul pembelajaran'});
  }

  let _currentSort = { col: 'id', asc: false };
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


  return { load, search, openAdd, openEdit, saveForm, deleteBuku, undo, redo, deleteAll, getData, deleteSelected, renderTable, renderRows, _getCurrentData, sortBy,
    exportExcel, exportPDF
  };

})();

window.BukuPage = BukuPage;