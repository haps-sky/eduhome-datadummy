const OperasionalPage = (() => {
  let allData         = [];
  let isFetched       = false;
  let lastDeletedData = null;
  let lastAction      = null;
  let lastAddedId     = null;
  let lastRestoredId  = null;
  let _cachedBukuOps  = null;
  let _activeMonth    = '';     // format YYYY-MM

  function inferArah(tr) {
    if (tr.arah) return tr.arah;
    const MASUK = ['SPP', 'PENDAFTARAN', 'BUKU_JUAL'];
    return MASUK.includes(String(tr.jenis || '').toUpperCase()) ? 'masuk' : 'keluar';
  }

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('ops-tbody');
    if (!tbody) return;

    if (forceRefresh) {
      lastDeletedData = null;
      lastAction      = null;
      lastRestoredId  = null;
    }

    if (!forceRefresh && isFetched && allData.length >= 0) {
      renderTable([...allData].reverse());
      updateSummary();
      return;
    }

    tbody.innerHTML = '<tr><td colspan="7" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data pengeluaran...</td></tr>';
    try {
      const res = await API.pembayaran.getAll();
      if (res.status === 'OK') {
        allData    = (res.data || [])
          .map(d => ({ ...d, arah: inferArah(d) }))
          .filter(d => d.arah === 'keluar');
        isFetched  = true;
        _cachedBukuOps = null;
        if (!_activeMonth) {
          const now = new Date();
          _activeMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        }
        _renderMonthNav();
        _renderMonthlySummary();
        renderTable([...allData].reverse());
        updateSummary();
      }
    } catch(e) {
      if (!isFetched) tbody.innerHTML = '<tr><td colspan="7" class="empty-row">Gagal memuat data.</td></tr>';
    }
  }

  function search(term) {
  Pagination.reset('ops');
    const t = term.toLowerCase();
    renderTable(allData.filter(p =>
      (p.keterangan || '').toLowerCase().includes(t) ||
      (p.jenis      || '').toLowerCase().includes(t) ||
      (p.id         || '').toLowerCase().includes(t)
    ));
  }

  function renderTable(data) {
    if (_activeMonth) {
      data = data.filter(p => p.tanggal && p.tanggal.startsWith(_activeMonth));
    }
    Pagination.setData('ops', data);
  }

  function renderRows(slice) {
  const rows = slice.map(p => `
    <tr>
      <td style="width:32px;">
        ${Selection.checkbox('ops', p.id)}
      </td>

      <td>${UI.formatDate(p.tanggal)}</td>

      <td>
        <span class="program-tag danger">
          ${UI.escape(p.jenis || '-')}
        </span>
      </td>

<td>${UI.escape(p.keterangan || '-')}</td>

      <td>${UI.formatCurrency(p.jumlah)}</td>

<td>${UI.escape(p.metode || '-')}</td>

      <td>
        <div class="action-btns">
          <button
            class="btn-icon btn-warning"
            onclick="OperasionalPage.openEdit('${p.id}')"
          >
            <i data-lucide="pencil"></i>
          </button>

          <button
            class="btn-icon btn-danger"
            data-delete-id="${p.id}"
            onclick="OperasionalPage.deleteItem('${p.id}','${(p.keterangan || '').replace(/'/g, "\\'")}')"
          >
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    </tr>
  `);

  UI.renderTable(
    'ops-tbody',
    rows,
    'Belum ada data pengeluaran'
  );

  lucide.createIcons({
    nodes: [document.getElementById('ops-tbody')]
  });
}

  function updateSummary() { /* handled by _renderMonthlySummary */ }

  function _getMonthLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${names[parseInt(m)-1]} ${y}`;
  }

  function _renderMonthNav() {
    const el = document.getElementById('ops-month-nav');
    if (!el) return;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="ctrl-btn icon-only" onclick="OperasionalPage.prevMonth()" title="Bulan sebelumnya">
          <i data-lucide="chevron-left"></i>
        </button>
        <button class="ctrl-btn" id="ops-month-label"
                onclick="OperasionalPage.openMonthPicker()"
                style="min-width:110px;font-weight:600;justify-content:center;gap:4px;">
          <i data-lucide="calendar"></i>
          ${_getMonthLabel(_activeMonth)}
        </button>
        <button class="ctrl-btn icon-only" onclick="OperasionalPage.nextMonth()" title="Bulan berikutnya">
          <i data-lucide="chevron-right"></i>
        </button>
      </div>`;
    lucide.createIcons({ nodes: [el] });
  }

  function _renderMonthlySummary() {
    const el = document.getElementById('ops-monthly-summary');
    if (!el) return;
    const monthData = _activeMonth
      ? allData.filter(p => p.tanggal && p.tanggal.startsWith(_activeMonth))
      : allData;

    const total  = monthData.reduce((s, p) => s + (Number(p.jumlah) || 0), 0);
    const buku   = monthData.filter(p => ['BUKU','BUKU_BELI'].includes(String(p.jenis||'').toUpperCase())).reduce((s, p) => s + (Number(p.jumlah) || 0), 0);
    const ops    = total - buku;
    const label  = _activeMonth ? _getMonthLabel(_activeMonth) : 'Semua';

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px;">
        <div class="pay-summary-card pay-summary-total" style="border-color:var(--danger);background:var(--danger-dim,#fee2e2);">
          <div class="pay-summary-label">Total Keluar ${label}</div>
          <div class="pay-summary-value" style="color:var(--danger);">${UI.formatCurrency(total)}</div>
        </div>
        <div class="pay-summary-card">
          <div class="pay-summary-label">Operasional</div>
          <div class="pay-summary-value" style="color:var(--warning);">${UI.formatCurrency(ops)}</div>
        </div>
        <div class="pay-summary-card">
          <div class="pay-summary-label">Buku</div>
          <div class="pay-summary-value" style="color:var(--primary);">${UI.formatCurrency(buku)}</div>
        </div>
      </div>
      ${_buildMonthChips()}`;
  }

  function _buildMonthChips() {
    const monthSet = {};
    allData.forEach(p => {
      if (p.tanggal && p.tanggal.length >= 7) {
        const ym = p.tanggal.slice(0, 7);
        if (!monthSet[ym]) monthSet[ym] = 0;
        monthSet[ym] += Number(p.jumlah) || 0;
      }
    });
    const months = Object.keys(monthSet).sort().reverse().slice(0, 12);
    if (!months.length) return '';
    return `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
        ${months.map(ym => `
          <button onclick="OperasionalPage.setMonth('${ym}')"
            style="padding:4px 10px;border-radius:20px;border:1px solid ${ym === _activeMonth ? 'var(--danger)' : 'var(--border)'};
                   background:${ym === _activeMonth ? 'var(--danger)' : 'var(--bg-surface)'};
                   color:${ym === _activeMonth ? '#fff' : 'var(--text-secondary)'};
                   font-size:0.75rem;font-weight:${ym === _activeMonth ? '700' : '500'};cursor:pointer;white-space:nowrap;">
            ${_getMonthLabel(ym)}
          </button>`).join('')}
      </div>`;
  }

  function setMonth(ym) {
    _activeMonth = ym;
    _renderMonthNav();
    _renderMonthlySummary();
    renderTable([...allData].reverse());
  }

  function prevMonth() {
    const [y, m] = _activeMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    _activeMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    _renderMonthNav();
    _renderMonthlySummary();
    renderTable([...allData].reverse());
  }

  function nextMonth() {
    const [y, m] = _activeMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    _activeMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    _renderMonthNav();
    _renderMonthlySummary();
    renderTable([...allData].reverse());
  }

  function openMonthPicker() {
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

    const existing = document.getElementById('ops-month-picker-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'ops-month-picker-popup';
    popup.style.cssText = `position:fixed;z-index:9999;background:var(--bg-card);border:1px solid var(--border);
      border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:260px;`;

    const btn = document.getElementById('ops-month-label');
    if (btn) {
      const r = btn.getBoundingClientRect();
      popup.style.top  = (r.bottom + 8) + 'px';
      popup.style.left = r.left + 'px';
    }

    let selYear = _activeMonth ? parseInt(_activeMonth.split('-')[0]) : new Date().getFullYear();

    const render = () => {
      popup.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <button id="ops-picker-prev" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">‹</button>
          <strong style="color:var(--text-primary);font-size:1rem;">${selYear}</strong>
          <button id="ops-picker-next" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px;">
          ${months.map((mn, i) => {
            const ym2   = selYear + '-' + String(i+1).padStart(2,'0');
            const active = ym2 === _activeMonth;
            return `<button onclick="OperasionalPage.setMonth('${ym2}');document.getElementById('ops-month-picker-popup')?.remove();"
              style="padding:7px 4px;border-radius:8px;border:1px solid ${active ? 'var(--danger)' : 'var(--border)'};
                     background:${active ? 'var(--danger)' : 'var(--bg-surface)'};
                     color:${active ? '#fff' : 'var(--text-primary)'};font-size:0.82rem;cursor:pointer;font-weight:${active ? '700' : '400'};">
              ${mn}
            </button>`;
          }).join('')}
        </div>
        <button onclick="OperasionalPage.setMonth('');document.getElementById('ops-month-picker-popup')?.remove();"
          style="width:100%;padding:7px;border-radius:8px;border:1px solid ${!_activeMonth ? 'var(--danger)' : 'var(--border)'};
                 background:${!_activeMonth ? 'var(--danger)' : 'var(--bg-surface)'};
                 color:${!_activeMonth ? '#fff' : 'var(--text-primary)'};font-size:0.82rem;cursor:pointer;font-weight:600;">
          Semua Bulan
        </button>`;

      popup.querySelector('#ops-picker-prev').addEventListener('click', (e) => { e.stopPropagation(); selYear--; render(); });
      popup.querySelector('#ops-picker-next').addEventListener('click', (e) => { e.stopPropagation(); selYear++; render(); });
    };

    render();
    document.body.appendChild(popup);
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!popup.contains(e.target) && e.target.id !== 'ops-month-label') {
          popup.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 100);
  }

  function _resetOpsForm() {
    ['ops-id-field', 'ops-deskripsi'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['ops-jumlah-pcs', 'ops-harga-satuan'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '1'; });
    const tgl = document.getElementById('ops-tanggal');
    if (tgl) tgl.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const kat = document.getElementById('ops-kategori');
    if (kat) kat.value = 'ATK';
    const met = document.getElementById('ops-metode');
    if (met) met.value = 'TUNAI';
    _updateTotal();
  }

  function _updateTotal() {
    const pcs    = Number(document.getElementById('ops-jumlah-pcs')?.value)    || 0;
    const satuan = Number(document.getElementById('ops-harga-satuan')?.value)  || 0;
    const total  = pcs * satuan;
    const totalEl= document.getElementById('ops-total-display');
    if (totalEl) totalEl.textContent = UI.formatCurrency(total);
    const hidEl  = document.getElementById('ops-jumlah-hidden');
    if (hidEl) hidEl.value = total;
  }

  function openAdd() {
    _resetOpsForm();
    const title = document.getElementById('modal-ops-title');
    if (title) title.textContent = 'Catat Pengeluaran';
    UI.openModal('modal-operasional');
    ['ops-jumlah-pcs', 'ops-harga-satuan'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.oninput = _updateTotal;
    });
    const katEl = document.getElementById('ops-kategori');
    if (katEl && !katEl._opsBound) {
      katEl._opsBound = true;
      katEl.addEventListener('change', () => { if (['BUKU', 'BUKU_BELI'].includes(katEl.value)) _openBukuPicker(); });
    }
  }

  function openEdit(id) {
    const p = allData.find(x => x.id === id);
    if (!p) return;
    _resetOpsForm();
    document.getElementById('modal-ops-title').textContent   = 'Edit Pengeluaran';
    document.getElementById('ops-id-field').value            = p.id;
    document.getElementById('ops-tanggal').value             = p.tanggal;
    document.getElementById('ops-kategori').value            = p.jenis || 'ATK';
    document.getElementById('ops-deskripsi').value           = p.keterangan || '';
    document.getElementById('ops-harga-satuan').value = p.harga_satuan || p.jumlah || 0;
    document.getElementById('ops-jumlah-pcs').value = p.jumlah_buku || 1;
    _updateTotal();
    UI.openModal('modal-operasional');
    ['ops-jumlah-pcs', 'ops-harga-satuan'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.oninput = _updateTotal;
    });
  }

  async function saveForm() {
    const btn      = document.querySelector('#modal-operasional .btn-primary');
    const id       = document.getElementById('ops-id-field').value;
    const tanggal  = document.getElementById('ops-tanggal').value;
    const kategori = document.getElementById('ops-kategori').value;
    const deskripsi= document.getElementById('ops-deskripsi').value.trim();
    const pcs      = Number(document.getElementById('ops-jumlah-pcs')?.value)   || 0;
    const satuan   = Number(document.getElementById('ops-harga-satuan')?.value) || 0;
    const total    = pcs * satuan;
    const metode   = document.getElementById('ops-metode').value;

    if (!kategori)       { UI.toast('Pilih kategori pengeluaran', 'error'); return; }
    if (!pcs || pcs <= 0){ UI.toast('Jumlah (pcs) harus lebih dari 0', 'error'); return; }
    if (!satuan || satuan <= 0) { UI.toast('Harga satuan harus lebih dari 0', 'error'); return; }
    if (total <= 0)      { UI.toast('Total harus lebih dari 0', 'error'); return; }

    const isBuku = ['BUKU_BELI', 'BUKU'].includes(kategori.toUpperCase());

    const payload = {
      tanggal:     tanggal || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
      id_murid:     '',
      nama:         'Operasional',
      jenis:        kategori,
      keterangan:   deskripsi || kategori,
      jumlah:       total,
      metode,
      arah:         'keluar',
      jumlah_buku:  isBuku ? pcs    : '',
      harga_satuan: isBuku ? satuan : ''
    };

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyimpan...'; }
      const res = id
        ? await API.pembayaran.update({ id, ...payload })
        : await API.pembayaran.add(payload);
      if (res.status === 'OK') {
        UI.toast(id ? 'Pengeluaran diperbarui' : `Pengeluaran ${UI.formatCurrency(total)} berhasil dicatat!`, 'success');
        if (!id) { lastAddedId = res.data?.id || null; lastAction = 'ADD'; }
        UI.closeModal('modal-operasional');
        _resetOpsForm();
        setTimeout(() => load(true), 500);
      } else {
        UI.toast(res.message || 'Gagal menyimpan', 'error');
      }
    } catch(e) { UI.toast('Gagal terhubung ke server', 'error'); }
    finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  async function deleteItem(id, label) {
    const p = allData.find(x => x.id === id);
    if (!await UI.confirmDelete(label, 'pengeluaran')) return;
    lastDeletedData = p ? JSON.parse(JSON.stringify(p)) : null;
    lastAction      = 'DELETE';
    const btn       = document.querySelector(`button[data-delete-id="${id}"]`);
    const ori       = btn ? btn.innerHTML : '';
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>'; btn.style.width = '40px'; }
      const res = await API.pembayaran.delete(id);
      if (res.status === 'OK') {
        UI.toast(`"${label}" dihapus. Klik Undo untuk membatalkan.`, 'warning');
        allData = allData.filter(x => x.id !== id);
        renderTable([...allData].reverse());
        updateSummary();
        const u = document.getElementById('ops-undo-btn');
        if (u) u.disabled = false;
      } else {
        UI.toast(res.message || 'Gagal menghapus', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = ori; btn.style.width = ''; }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = ori; btn.style.width = ''; }
    }
  }

  async function undo() {
    if (!lastAction || !lastDeletedData) return;
    const u = document.getElementById('ops-undo-btn');
    const r = document.getElementById('ops-redo-btn');
    try {
      if (u) u.disabled = true;
      if (lastAction === 'DELETE') {
        const res = await API.pembayaran.add(lastDeletedData);
        if (res.status === 'OK') {
          UI.toast('Undo: Pengeluaran dikembalikan!', 'success');
          lastRestoredId = res.data?.id || lastDeletedData.id;
          lastAction     = 'UNDO_DELETE';
          if (r) r.disabled = false;
          load(true);
        } else {
          UI.toast(res.message || 'Undo gagal', 'error');
          if (u) u.disabled = false;
        }
      }
    } catch(e) { UI.toast('Gagal Undo', 'error'); if (u) u.disabled = false; }
  }

  async function redo() {
    if (!lastRestoredId || lastAction !== 'UNDO_DELETE') return;
    const r = document.getElementById('ops-redo-btn');
    try {
      if (r) r.disabled = true;
      const res = await API.pembayaran.delete(lastRestoredId);
      if (res.status === 'OK') {
        UI.toast('Redo: Pengeluaran dihapus kembali!', 'success');
        lastAction     = 'DELETE';
        lastRestoredId = null;
        const u        = document.getElementById('ops-undo-btn');
        if (u) u.disabled = false;
        load(true);
      } else {
        UI.toast(res.message || 'Redo gagal', 'error');
        if (r) r.disabled = false;
      }
    } catch(e) { UI.toast('Gagal Redo', 'error'); if (r) r.disabled = false; }
  }

  function _renderBukuList(list) {
    const listEl = document.getElementById('ops-buku-list');
    if (!listEl) return;
    if (!list.length) {
      listEl.innerHTML = '<div class="picker-empty">Modul tidak ditemukan</div>';
      return;
    }
    listEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">
      ${list.map((b, i) => `
        <div class="picker-row" onclick="OperasionalPage._pilihBukuOps(${_cachedBukuOps.indexOf(b)})">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${UI.escape(b.nama_modul)}</div>
              <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">${UI.escape(b.jenjang || '-')} · ${UI.escape(b.program || '-')} · Stok: <strong>${b.stok}</strong></div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-weight:700;color:var(--primary);">${UI.formatCurrency(b.harga_beli)}</div>
              <div style="font-size:0.72rem;color:var(--text-secondary);">harga beli</div>
            </div>
          </div>
        </div>`).join('')}
    </div>`;
  }

  async function _openBukuPicker() {
    let overlay = document.getElementById('ops-buku-picker');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ops-buku-picker';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px;';
      overlay.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;width:100%;max-width:460px;overflow:hidden;display:flex;flex-direction:column;max-height:90vh;">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);flex-shrink:0;">
            <h3 style="margin:0;font-size:1rem;color:var(--text-primary);">Pilih Modul (Beli dari Pusat)</h3>
            <button onclick="document.getElementById('ops-buku-picker').style.display='none'"
                    style="background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:1.2rem;">✕</button>
          </div>
          <div style="padding:12px 16px;border-bottom:1px solid var(--border);flex-shrink:0;">
            <div style="position:relative;">
              <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--text-secondary);pointer-events:none;"
                   viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input id="ops-buku-search"
                     type="text"
                     placeholder="Ketik nama modul..."
                     oninput="OperasionalPage._filterBukuOps(this.value)"
                     style="width:100%;box-sizing:border-box;padding:9px 12px 9px 32px;border:1px solid var(--border);
                            border-radius:8px;font-size:0.88rem;background:var(--bg-surface);
                            color:var(--text-primary);outline:none;">
            </div>
          </div>
          <div id="ops-buku-list" style="padding:16px;overflow-y:auto;flex:1;">
            <div class="picker-loading"><div class="spinner spinner-sm" style="margin:0 auto 8px"></div>Memuat modul...</div>
          </div>
        </div>`;
      document.body.appendChild(overlay);
    }
    // Reset search setiap buka
    const searchEl = document.getElementById('ops-buku-search');
    if (searchEl) { searchEl.value = ''; setTimeout(() => searchEl.focus(), 100); }

    overlay.style.display = 'flex';
    const listEl = document.getElementById('ops-buku-list');
    try {
      if (!_cachedBukuOps) {
        const res      = await API.buku.getAll();
        _cachedBukuOps = res.data || [];
      }
      if (!_cachedBukuOps.length) { listEl.innerHTML = '<div class="picker-empty">Belum ada modul terdaftar</div>'; return; }
      _renderBukuList(_cachedBukuOps);
    } catch(e) { listEl.innerHTML = '<div class="picker-error">Gagal memuat data modul</div>'; }
  }

  function _filterBukuOps(q) {
    if (!_cachedBukuOps) return;
    const filtered = q.trim()
      ? _cachedBukuOps.filter(b =>
          (b.nama_modul || '').toLowerCase().includes(q.toLowerCase()) ||
          (b.program    || '').toLowerCase().includes(q.toLowerCase()) ||
          (b.jenjang    || '').toLowerCase().includes(q.toLowerCase())
        )
      : _cachedBukuOps;
    _renderBukuList(filtered);
  }

  function _pilihBukuOps(idx) {
    if (!_cachedBukuOps) return;
    const b = _cachedBukuOps[idx];
    if (!b) return;
    const desk = document.getElementById('ops-deskripsi');
    const sat  = document.getElementById('ops-harga-satuan');
    if (desk) desk.value = b.nama_modul;
    if (sat)  sat.value  = Number(b.harga_beli) || 0;
    _updateTotal();
    const overlay = document.getElementById('ops-buku-picker');
    if (overlay) overlay.style.display = 'none';
    UI.toast(`"${b.nama_modul}" dipilih — harga beli ${UI.formatCurrency(b.harga_beli)}`, 'success');
  }

  function deleteSelected()  { return Selection.deleteSelected('ops'); }
  function _getCurrentData() { return allData; }

  window._opsUpdateTotal = _updateTotal;

  // ── Export functions ─────────────────────────────────────────────────────
  function exportExcel() {
    const headers = ['ID', 'Tanggal', 'Kategori', 'Keterangan', 'Jumlah', 'Metode'];
    const rows    = allData.map(p => [p.id, UI.formatDate(p.tanggal), p.jenis || '-', p.keterangan || '-', p.jumlah, p.metode || '-']);
    UI.exportExcel(headers, rows, 'Data_Pengeluaran', 'Pengeluaran');
  }

  function exportPDF() {
    const headers = ['ID', 'Tanggal', 'Kategori', 'Keterangan', 'Jumlah', 'Metode'];
    const rows    = allData.map(p => [p.id, UI.formatDate(p.tanggal), p.jenis || '-', p.keterangan || '-', UI.formatCurrency(p.jumlah), p.metode || '-']);
    UI.exportPDF('Data Pengeluaran', headers, rows, {subtitle: 'Riwayat pengeluaran operasional'});
  }

  // ── Sort function ─────────────────────────────────────────────────────────
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


  return { load, search, openAdd, openEdit, saveForm, deleteItem, updateSummary, undo, redo, deleteSelected, renderTable, renderRows, _getCurrentData, sortBy, _pilihBukuOps, _filterBukuOps, _updateTotalPublic: _updateTotal,
    exportExcel, exportPDF, setMonth, prevMonth, nextMonth, openMonthPicker
  };

})();

window.OperasionalPage = OperasionalPage;