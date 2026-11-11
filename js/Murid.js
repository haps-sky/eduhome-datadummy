const MuridPage = (() => {
  let currentSort = { col: 'id', asc: true };
  const DAYS = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];

  let allData         = [];
  let isFetched       = false;
  let lastDeletedData = null;
  let lastAction      = null;
  let lastAddedId     = null;
  let lastRestoredId  = null;

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('murid-tbody');
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
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data terbaru...</td></tr>';

    try {
      const muridRes = await API.murid.getAll();


      if (muridRes.status === 'OK') {
        allData   = (muridRes.data || []).sort((a, b) => a.id.localeCompare(b.id));
        isFetched = true;
        renderTable(allData);
        updateSummary(allData);
      }

    } catch(e) {
      console.error('Gagal update data:', e);
      if (!allData || allData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Gagal terhubung ke server.</td></tr>';
      }
    }
  }

  function updateSummary(data) {
    const el = document.getElementById('murid-count');
    if (el) el.textContent = 'Total: ' + data.length + ' murid';
  }

  function sortBy(col) {
    currentSort.asc = currentSort.col === col ? !currentSort.asc : true;
    currentSort.col = col;
    allData.sort((a, b) => {
      const valA = (a[col] || '').toString().toLowerCase();
      const valB = (b[col] || '').toString().toLowerCase();
      return currentSort.asc
        ? valA.localeCompare(valB, undefined, { numeric: true })
        : valB.localeCompare(valA, undefined, { numeric: true });
    });
    renderTable(allData);
    updateSortIcons(col, currentSort.asc);
  }

  function updateSortIcons(activeCol, isAsc) {
    document.querySelectorAll('th i[data-lucide]').forEach(icon => {
      icon.setAttribute('data-lucide', 'chevrons-up-down');
      icon.classList.remove('active-sort');
    });
    const activeHeader = document.querySelector(`th[onclick*="'${activeCol}'"] i`);
    if (activeHeader) {
      activeHeader.setAttribute('data-lucide', isAsc ? 'arrow-up-narrow' : 'arrow-down-wide');
      activeHeader.classList.add('active-sort');
    }
    lucide.createIcons();
  }

  // ── renderTable: serahkan data ke Pagination, dia yang slice & render ──────
  function renderTable(data) {
    Pagination.setData('murid', data);
  }

  // ── renderRows: dipanggil oleh Pagination, hanya render slice halaman ini ──
  function renderRows(slice) {
    const role    = API.currentRole();
    const canEdit = role === 'ADMIN';
    const rows    = slice.map(m => {
      const color = m.jk === 'L' ? '#689bee' : '#e76fab';
      return `
      <tr>
        <td style="width:32px;">${Selection.checkbox('murid', m.id)}</td>
        <td><span class="id-badge">${UI.escape(m.id)}</span></td>
        <td>
          <div class="name-cell">
            <span class="avatar-initial">${(m.nama || '?')[0].toUpperCase()}</span>
            <div>
              <strong>${UI.escape(m.nama)}</strong>
              <small style="color:${color};font-weight:500;">
                ${m.jk === 'L' ? '♂ Laki-laki' : '♀ Perempuan'}
              </small>
            </div>
          </div>
        </td>
        <td>${UI.escape(m.kelas || '-')}</td>
        <td><span class="program-tag">${UI.escape(m.program)}</span></td>
        <td>${UI.formatDate(m.tgl_mulai)}</td>
        <td>
          ${UI.statusBadge(m.status)}
          ${m.auto_lanjut_spp === 'OFF' ? '<span title="Paket SPP tidak akan dilanjutkan otomatis" style="display:inline-block;margin-left:4px;font-size:0.68rem;padding:1px 6px;border-radius:10px;background:rgba(148,163,184,0.15);color:var(--text-secondary);border:1px solid var(--border);">Auto-lanjut OFF</span>' : ''}
        </td>
        <td>
          <div class="action-btns">
            <button class="btn-icon btn-info" onclick="MuridPage.viewSchedule('${m.id}','${m.nama.replace(/'/g,"\\'")}')">
              <i data-lucide="calendar"></i>
            </button>
            ${canEdit ? `
            <button class="btn-icon btn-warning" onclick="MuridPage.openEdit('${m.id}')">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-icon btn-danger" data-delete-id="${m.id}" onclick="MuridPage.deleteMurid('${m.id}','${m.nama.replace(/'/g,"\\'")}')">
              <i data-lucide="trash-2"></i>
            </button>` : ''}
          </div>
        </td>
      </tr>`;
    });
    UI.renderTable('murid-tbody', rows, 'Belum ada data murid');
    lucide.createIcons({ nodes: [document.getElementById('murid-tbody')] });
  }

  // ── search: reset ke halaman 1 dulu sebelum filter ────────────────────────
  function search(term) {
    Pagination.reset('murid');
    const filtered = allData.filter(m =>
      m.nama.toLowerCase().includes(term.toLowerCase())    ||
      m.program.toLowerCase().includes(term.toLowerCase()) ||
      m.id.toLowerCase().includes(term.toLowerCase())
    );
    renderTable(filtered);
  }

  async function populateProgramDropdown(selectedValue = '') {
    const select = document.getElementById('murid-program');
    if (!select) return;

    select.innerHTML = '<option value="">Memuat...</option>';
    select.disabled  = true;

    try {
      const res = await API.mentor.getAll();
      if (res.status !== 'OK') throw new Error('Gagal fetch mentor');

      const programs = [...new Set(
        (res.data || [])
          .filter(m => String(m.status).toUpperCase() === 'AKTIF')
          .flatMap(m => String(m.program).split(',').map(p => p.trim()))
          .filter(Boolean)
      )].sort();

      select.innerHTML = '<option value="">-- Pilih Program --</option>';
      programs.forEach(p => {
        const opt      = document.createElement('option');
        opt.value      = p;
        opt.textContent = p;
        if (p === selectedValue) opt.selected = true;
        select.appendChild(opt);
      });
    } catch(e) {
      console.error('Gagal load program:', e);
      select.innerHTML = '<option value="">-- Gagal memuat --</option>';
    } finally {
      select.disabled = false;
    }
  }

  function openAdd() {
    clearForm();
    document.getElementById('murid-modal-title').textContent = 'Tambah Murid Baru';
    document.getElementById('murid-id-field').value          = '';
    renderDayCheckboxes();
    UI.openModal('modal-murid');
    populateProgramDropdown();
  }

  function renderDayCheckboxes() {
    const container = document.getElementById('day-checkboxes');
    if (!container) return;
    container.innerHTML = '';

    const timeSlots = [
      '08.30-09.00','09.00-09.30','09.30-10.00','10.00-10.30','10.30-11.00',
      '11.00-11.30','11.30-12.00','12.00-12.30','12.30-13.00','13.00-13.30',
      '13.30-14.00','14.00-14.30','14.30-15.00','15.00-15.30','15.30-16.00',
      '16.00-16.30','16.30-17.00','17.00-17.30','17.30-18.00','18.00-18.30',
      '18.30-19.00','19.00-19.30'
    ];

    DAYS.forEach(day => {
      const dayVal = day.toUpperCase();
      const div    = document.createElement('div');
      div.className = 'day-card';
      div.id        = `card-${dayVal}`;
      div.innerHTML = `
        <label>
          <input type="checkbox" name="hari" value="${dayVal}"
                 onchange="MuridPage.toggleTimeInput('${dayVal}')">
          <span>${dayVal}</span>
        </label>
        <select id="time-${dayVal}" class="time-select-card" style="display:none">
          <option value="">-- Jam --</option>
          ${timeSlots.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>`;
      container.appendChild(div);
    });
  }

  function toggleTimeInput(day) {
    const cb     = document.querySelector(`input[value="${day}"]`);
    const select = document.getElementById(`time-${day}`);
    const card   = document.getElementById(`card-${day}`);
    if (select && card) {
      if (cb.checked) {
        select.style.display = 'block';
        card.classList.add('active');
      } else {
        select.style.display = 'none';
        card.classList.remove('active');
        select.value = '';
      }
    }
  }

  async function openEdit(id) {
    const m = allData.find(x => x.id === id);
    if (!m) return;

    document.getElementById('murid-modal-title').textContent = 'Edit Data Murid';
    document.getElementById('murid-id-field').value          = m.id;
    document.getElementById('murid-nama').value              = m.nama;
    document.getElementById('murid-jk').value                = m.jk;
    document.getElementById('murid-kelas').value             = m.kelas;
    document.getElementById('murid-tgl').value               = m.tgl_mulai;
    document.getElementById('murid-status').value            = m.status;
    const autoLanjut = document.getElementById('murid-auto-lanjut-spp');
    if (autoLanjut) autoLanjut.checked = m.auto_lanjut_spp !== 'OFF'; // default ON kalau data lama belum punya field ini

    renderDayCheckboxes();
    document.getElementById('murid-schedule-section').style.display = 'block';
    UI.openModal('modal-murid');
    populateProgramDropdown(m.program);

    API.jadwal.getByMurid(id).then(jadwalRes => {
      if (jadwalRes.status === 'OK' && jadwalRes.data.length > 0) {
        const hariSet = new Set(jadwalRes.data.map(j => j.hari));
        document.querySelectorAll('#day-checkboxes input[type="checkbox"]').forEach(cb => {
          const val = cb.value;
          if (hariSet.has(val)) {
            cb.checked = true;
            toggleTimeInput(val);
            const item = jadwalRes.data.find(j => j.hari === val);
            if (item) {
              const timeInput = document.getElementById(`time-${val}`);
              if (timeInput) timeInput.value = item.jam;
            }
          }
        });
      }
    }).catch(err => console.log('Jadwal gagal dimuat:', err));
  }

  function clearForm() {
    ['murid-nama','murid-jk','murid-kelas','murid-program','murid-tgl','murid-status'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const status = document.getElementById('murid-status');
    if (status) status.value = 'AKTIF';
    const autoLanjut = document.getElementById('murid-auto-lanjut-spp');
    if (autoLanjut) autoLanjut.checked = true; // default ON buat murid baru
    const schedSection = document.getElementById('murid-schedule-section');
    if (schedSection) schedSection.style.display = 'block';
  }

  async function saveForm() {
    const id      = document.getElementById('murid-id-field').value;
    const nama    = document.getElementById('murid-nama').value.trim();
    const jk      = document.getElementById('murid-jk').value;
    const kelas   = document.getElementById('murid-kelas').value.trim();
    const program = document.getElementById('murid-program').value.trim();
    const tgl     = document.getElementById('murid-tgl').value;
    const status  = document.getElementById('murid-status').value;
    const autoLanjutEl = document.getElementById('murid-auto-lanjut-spp');
    const auto_lanjut_spp = autoLanjutEl ? (autoLanjutEl.checked ? 'ON' : 'OFF') : 'ON';

    if (!nama || !program) { UI.toast('Nama dan program wajib diisi', 'error'); return; }

    const jadwalData = [];
    document.querySelectorAll('#day-checkboxes input[name="hari"]:checked').forEach(cb => {
      const day       = cb.value;
      const timeInput = document.getElementById(`time-${day}`);
      if (timeInput && timeInput.value) {
        jadwalData.push({ hari: day, jam: timeInput.value });
      }
    });

    const payload = { nama, jk, kelas, program, tgl_mulai: tgl, status, jadwal: jadwalData, auto_lanjut_spp };
    const btn     = document.getElementById('murid-save-btn');

    if (btn) { btn.disabled = true; btn.innerHTML = `<div class="spinner spinner-sm"></div> ${id ? 'Mengedit...' : 'Menambahkan...'}`; }

    try {
      const res = id
        ? await API.murid.update({ id, ...payload })
        : await API.murid.add(payload);

      if (res.status === 'OK') {
        UI.toast(id ? 'Data murid diperbarui' : 'Murid berhasil ditambahkan', 'success');
        if (!id) { lastAddedId = res.data?.id || res.id || null; lastAction = 'ADD'; }
        UI.closeModal('modal-murid');
        setTimeout(() => load(true), 800);
      } else {
        UI.toast(res.message || 'Gagal menyimpan', 'error');
      }
    } catch(e) {
      UI.toast('Error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  async function deleteMurid(id, nama) {
    const m = allData.find(x => x.id === id);
    if (!m) return;

    if (!await UI.confirmDelete(nama, 'murid')) return;

    lastDeletedData = JSON.parse(JSON.stringify(m));
    lastAction      = 'DELETE';

    const btn             = document.querySelector(`button[data-delete-id="${id}"]`);
    const originalContent = btn ? btn.innerHTML : '';

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>'; btn.style.width = '40px'; }
      const res = await API.murid.delete(id);
      if (res.status === 'OK') {
        UI.toast(`Data "${nama}" berhasil dihapus. Klik Undo untuk membatalkan.`, 'warning');
        allData = allData.filter(x => x.id !== id);
        renderTable(allData);
        updateSummary(allData);
        const undoBtn = document.getElementById('undo-btn');
        if (undoBtn) undoBtn.disabled = false;
      } else {
        UI.toast(res.message || 'Gagal menghapus', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
      }
    } catch(e) {
      console.error(e);
      UI.toast('Gagal terhubung ke server', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
    }
  }

  async function undo() {
    if (!lastAction) return;
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    try {
      if (undoBtn) undoBtn.disabled = true;
      let res;
      if (lastAction === 'DELETE' && lastDeletedData) {
        res = await API.murid.add(lastDeletedData);
        if (res.status === 'OK') {
          UI.toast('Undo Berhasil: Data dikembalikan!', 'success');
          lastRestoredId = res.data?.id || lastDeletedData.id;
          lastAction     = 'UNDO_DELETE';
          if (redoBtn) redoBtn.disabled = false;
        } else {
          UI.toast(res.message || 'Undo gagal', 'error');
          if (undoBtn) undoBtn.disabled = false;
        }
      } else if (lastAction === 'ADD' && lastAddedId) {
        res = await API.murid.delete(lastAddedId);
        if (res.status === 'OK') {
          UI.toast('Undo Berhasil: Pendaftaran dibatalkan!', 'warning');
          lastAction = null;
        } else {
          UI.toast(res.message || 'Undo gagal', 'error');
          if (undoBtn) undoBtn.disabled = false;
        }
      }
      load(true);
    } catch(e) {
      console.error('Error Undo:', e);
      UI.toast('Gagal melakukan Undo', 'error');
      if (undoBtn) undoBtn.disabled = false;
    }
  }

  async function redo() {
    if (!lastRestoredId || lastAction !== 'UNDO_DELETE') return;
    const redoBtn = document.getElementById('redo-btn');
    try {
      if (redoBtn) redoBtn.disabled = true;
      const res = await API.murid.delete(lastRestoredId);
      if (res.status === 'OK') {
        UI.toast('Redo Berhasil: Data dihapus kembali!', 'success');
        lastAction     = 'DELETE';
        lastRestoredId = null;
        const undoBtn  = document.getElementById('undo-btn');
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
    if (!await UI.confirmDanger(`PERINGATAN! Akan menghapus SEMUA (${total}) data murid beserta jadwalnya.`, 'HAPUS SEMUA MURID')) return;
    UI.toast('Sedang membersihkan database...', 'info');
    try {
      const res = await API.murid.deleteAll();
      if (res.status === 'OK') {
        UI.toast('Seluruh data berhasil dihapus!', 'success');
        load(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus semua data', 'error');
      }
    } catch(e) { UI.toast('Gagal menghapus semua data', 'error'); }
  }

  async function viewSchedule(id, nama) {
    const list = document.getElementById('schedule-detail-list');
    document.getElementById('schedule-modal-title').textContent = 'Jadwal: ' + nama;
    list.innerHTML = '<div class="empty-feed">Memuat jadwal...</div>';
    UI.openModal('modal-schedule');
    try {
      const res = await API.jadwal.getByMurid(id);
      if (res.status !== 'OK' || res.data.length === 0) {
        list.innerHTML = '<div class="empty-feed">Tidak ada jadwal terdaftar</div>';
      } else {
        const seen       = new Set();
        const uniqueData = res.data.filter(j => {
          const key = `${j.hari}-${j.jam}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        list.innerHTML = uniqueData.map(j => `
          <div class="schedule-row">
            <span><strong>${j.hari}</strong></span>
            <span>${j.jam}</span>
          </div>`).join('');
      }
    } catch(e) {
      list.innerHTML = '<div class="empty-feed">Gagal memuat jadwal</div>';
    }
  }

  function deleteSelected()  { return Selection.deleteSelected('murid'); }
  function _getCurrentData() { return allData; }


  // ── Export functions ─────────────────────────────────────────────────────
  function exportExcel() {
    const headers = ['ID', 'Nama', 'JK', 'Kelas', 'Program', 'Tgl Mulai', 'Status'];
    const rows    = allData.map(m => [m.id, m.nama, m.jk === 'L' ? 'Laki-laki' : 'Perempuan', m.kelas || '-', m.program, m.tgl_mulai || '-', m.status]);
    UI.exportExcel(headers, rows, 'Data_Murid', 'Murid');
  }

  function exportPDF() {
    const headers = ['ID', 'Nama', 'JK', 'Kelas', 'Program', 'Tgl Mulai', 'Status'];
    const rows    = allData.map(m => [m.id, m.nama, m.jk === 'L' ? 'Laki-laki' : 'Perempuan', m.kelas || '-', m.program, UI.formatDate(m.tgl_mulai), m.status]);
    UI.exportPDF('Data Murid', headers, rows, {subtitle: 'Daftar seluruh murid EduHome'});
  }

  return {
    load, search, openAdd, openEdit, saveForm, deleteMurid,
    renderDayCheckboxes, toggleTimeInput, viewSchedule,
    undo, redo, deleteAll, sortBy, deleteSelected,
    renderTable, renderRows, _getCurrentData,  // ← renderRows wajib di-export,
    exportExcel, exportPDF
  };

})();

window.MuridPage = MuridPage;