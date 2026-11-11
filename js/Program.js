const ProgramPage = (() => {
  let allData         = [];
  let isFetched       = false;
  let lastDeletedData = null;
  let lastAction      = null;
  let lastRestoredId  = null;

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('program-tbody');
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

    tbody.innerHTML = '<tr><td colspan="4" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data program...</td></tr>';

    try {
      const res = await API.program.getAll();
      if (res.status === 'OK') {
        allData   = res.data || [];
        isFetched = true;
        renderTable(allData);
      } else {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Gagal memuat data.</td></tr>';
      }
    } catch(e) {
      console.error('Error Load Program:', e);
      tbody.innerHTML = '<tr><td colspan="4" class="empty-row">Gagal memuat data.</td></tr>';
    }
  }

  function search(term) {
    Pagination.reset('program');
    const filtered = allData.filter(p =>
      (p.nama || '').toLowerCase().includes(term.toLowerCase()) ||
      (p.id   || '').toLowerCase().includes(term.toLowerCase())
    );
    renderTable(filtered);
  }

  function renderTable(data) {
    Pagination.setData('program', data);
  }

  function renderRows(slice) {
    const role    = API.currentRole();
    const canEdit = role === 'ADMIN' || role === 'OWNER';

    const rows = slice.map(p => `
      <tr>
        <td style="width:32px;">
          ${Selection.checkbox('program', p.id)}
        </td>
        <td>
          <span class="id-badge">${UI.escape(p.id)}</span>
        </td>
        <td>
          <strong>${UI.escape(p.nama)}</strong>
        </td>
        <td>
          <span class="text-success" style="font-weight:600;">
            ${UI.formatCurrency(p.fee_anak || 0)}
          </span>
          <span style="font-size:0.75rem;color:var(--text-secondary);margin-left:4px;">/ sesi</span>
        </td>
        <td>
          <div class="action-btns">
            ${canEdit ? `
              <button
                class="btn-icon btn-warning"
                onclick="ProgramPage.openEdit('${p.id}')"
                title="Edit"
              >
                <i data-lucide="pencil"></i>
              </button>
              <button
                class="btn-icon btn-danger"
                data-delete-id="${p.id}"
                onclick="ProgramPage.deleteItem('${p.id}','${(p.nama||'').replace(/'/g,"\\'")}')"
                title="Hapus"
              >
                <i data-lucide="trash-2"></i>
              </button>
            ` : '-'}
          </div>
        </td>
      </tr>
    `);

    UI.renderTable('program-tbody', rows, 'Belum ada data program');
    lucide.createIcons({ nodes: [document.getElementById('program-tbody')] });
  }

  function openAdd() {
    clearForm();
    document.getElementById('modal-program-title').textContent = 'Tambah Program';
    document.getElementById('program-id-field').value = '';
    UI.openModal('modal-program');
  }

  function openEdit(id) {
    const p = allData.find(x => x.id === id);
    if (!p) return;
    clearForm();
    document.getElementById('modal-program-title').textContent = 'Edit Program';
    document.getElementById('program-id-field').value  = p.id;
    document.getElementById('program-nama').value      = p.nama || '';
    document.getElementById('program-fee-anak').value  = p.fee_anak || 0;
    UI.openModal('modal-program');
  }

  function clearForm() {
    ['program-id-field','program-nama','program-fee-anak'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  async function saveForm() {
    const btn      = document.querySelector('#modal-program .btn-primary');
    const id       = document.getElementById('program-id-field').value;
    const nama     = document.getElementById('program-nama').value.trim();
    const fee_anak = document.getElementById('program-fee-anak').value;

    if (!nama) { UI.toast('Nama program wajib diisi', 'error'); return; }

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyimpan...'; }
      const payload = { nama, fee_anak: Number(fee_anak) || 0 };
      const res     = id
        ? await API.program.update({ id, ...payload })
        : await API.program.add(payload);

      if (res.status === 'OK') {
        UI.toast(id ? 'Program berhasil diperbarui' : 'Program berhasil ditambahkan', 'success');
        UI.closeModal('modal-program');
        await load(true);
      } else {
        UI.toast(res.message || 'Gagal menyimpan', 'error');
      }
    } catch(e) {
      UI.toast('Terjadi kesalahan koneksi', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Simpan'; }
    }
  }

  async function deleteItem(id, nama) {
    if (!await UI.confirmDelete(nama, 'program')) return;

    const p = allData.find(x => x.id === id);
    lastDeletedData = p ? JSON.parse(JSON.stringify(p)) : null;
    lastAction      = 'DELETE';

    const btn             = document.querySelector(`[data-delete-id="${id}"]`);
    const originalContent = btn ? btn.innerHTML : '';
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>'; }
      const res = await API.program.delete(id);
      if (res.status === 'OK') {
        UI.toast(`Program "${nama}" berhasil dihapus. Klik Undo untuk membatalkan.`, 'warning');
        allData = allData.filter(x => x.id !== id);
        renderTable(allData);
        const undoBtn = document.getElementById('program-undo-btn');
        if (undoBtn) undoBtn.disabled = false;
      } else {
        UI.toast(res.message || 'Gagal menghapus', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = originalContent; }
    }
  }

  async function undo() {
    if (!lastAction || !lastDeletedData) return;
    const undoBtn = document.getElementById('program-undo-btn');
    const redoBtn = document.getElementById('program-redo-btn');
    try {
      if (undoBtn) undoBtn.disabled = true;
      if (lastAction === 'DELETE') {
        const res = await API.program.add(lastDeletedData);
        if (res.status === 'OK') {
          UI.toast('Undo Berhasil: Program dikembalikan!', 'success');
          lastRestoredId = res.data?.id || lastDeletedData.id;
          lastAction     = 'UNDO_DELETE';
          if (redoBtn) redoBtn.disabled = false;
          load(true);
        } else {
          UI.toast(res.message || 'Undo gagal', 'error');
          if (undoBtn) undoBtn.disabled = false;
        }
      }
    } catch(e) {
      UI.toast('Gagal melakukan Undo', 'error');
      if (undoBtn) undoBtn.disabled = false;
    }
  }

  async function redo() {
    if (!lastRestoredId || lastAction !== 'UNDO_DELETE') return;
    const redoBtn = document.getElementById('program-redo-btn');
    try {
      if (redoBtn) redoBtn.disabled = true;
      const res = await API.program.delete(lastRestoredId);
      if (res.status === 'OK') {
        UI.toast('Redo Berhasil: Program dihapus kembali!', 'success');
        lastAction     = 'DELETE';
        lastRestoredId = null;
        const undoBtn  = document.getElementById('program-undo-btn');
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
    if (!await UI.confirmDanger(`PERINGATAN! Akan menghapus SEMUA (${total}) data program.`, 'HAPUS SEMUA PROGRAM')) return;
    try {
      const res = await API.program.deleteAll();
      if (res.status === 'OK') {
        UI.toast('Seluruh data program berhasil dihapus!', 'success');
        load(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus semua data', 'error');
      }
    } catch(e) { UI.toast('Gagal menghapus semua data', 'error'); }
  }

  function invalidateCache() { isFetched = false; }
  function deleteSelected()  { return Selection.deleteSelected('program'); }
  function _getCurrentData() { return allData; }

  // Sort
  let _currentSort = { col: 'nama', asc: true };
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
    load, search, openAdd, openEdit, saveForm,
    deleteItem, undo, redo, deleteAll, deleteSelected,
    renderTable, renderRows, _getCurrentData, sortBy,
    invalidateCache
  };
})();

window.ProgramPage = ProgramPage;