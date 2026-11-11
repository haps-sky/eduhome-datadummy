const PembayaranPage = (() => {
  let allData         = [];   // hanya transaksi arah=masuk (LUNAS / non-buku)
  let piutangData     = [];   // transaksi BUKU_JUAL status_bayar=HUTANG
  let isFetched       = false;
  let sppData         = [];
  let lastDeletedData = null;
  let lastAction      = null;
  let lastRestoredId  = null;
  let _activeTab      = 'lunas'; // 'lunas' | 'piutang'
  let _activeMonth    = '';     // format YYYY-MM, '' = semua

  function inferArah(tr) {
    if (tr.arah) return tr.arah;
    const MASUK = ['SPP', 'PENDAFTARAN', 'BUKU_JUAL'];
    return MASUK.includes(String(tr.jenis || '').toUpperCase()) ? 'masuk' : 'keluar';
  }

  // ── Status badge helper ───────────────────────────────────────────────────
  function statusBayarBadge(status) {
    if (status === 'HUTANG') return `<span class="program-tag" style="background:var(--danger-dim,#fee2e2);color:var(--danger,#ef4444);border:1px solid var(--danger,#ef4444)20;">Hutang</span>`;
    return `<span class="program-tag" style="background:var(--success-dim,#dcfce7);color:var(--success,#22c55e);border:1px solid var(--success,#22c55e)20;">Lunas</span>`;
  }

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('pay-tbody');
    if (!tbody) return;

    if (forceRefresh) {
      lastDeletedData = null;
      lastAction      = null;
      lastRestoredId  = null;
    }

    if (!forceRefresh && isFetched) {
      renderTable(allData);
      updateSummary();
      return;
    }
    tbody.innerHTML = '<tr><td colspan="9" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data pembayaran...</td></tr>';

    try {
      const [payRes, muridRes, sppRes] = await Promise.all([
        API.pembayaran.getAll(), API.murid.getAll(), API.spp.getAll()
      ]);
      if (payRes.status === 'OK') {
        const mapped = (payRes.data || []).map(d => ({ ...d, arah: inferArah(d) }));
        // LUNAS: semua transaksi masuk yang bukan HUTANG
        allData = mapped.filter(d =>
          d.arah === 'masuk' && !(d.jenis === 'BUKU_JUAL' && d.status_bayar === 'HUTANG')
        );
        // PIUTANG: BUKU_JUAL yang belum dibayar
        piutangData = mapped.filter(d =>
          d.jenis === 'BUKU_JUAL' && d.status_bayar === 'HUTANG'
        );
        sppData      = sppRes.data || [];
        isFetched    = true;
        populateMuridDropdown(muridRes.data || []);
        // Set default bulan ini jika belum ada
        if (!_activeMonth) {
          const now = new Date();
          _activeMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        }
        _renderTabs();
        _renderMonthNav();
        _renderMonthlySummary();
        renderTable(_activeTab === 'piutang' ? piutangData : allData);
        updateSummary();
      }
    } catch(e) {
      console.error('Error Load Pembayaran:', e);
      if (!allData.length) tbody.innerHTML = '<tr><td colspan="9" class="empty-row">Gagal memuat data.</td></tr>';
    }
  }

  function search(term) {
  Pagination.reset('pay');
    const source   = _activeTab === 'piutang' ? piutangData : allData;
    const filtered = source.filter(p =>
      (p.nama  || '').toLowerCase().includes(term.toLowerCase()) ||
      (p.jenis || '').toLowerCase().includes(term.toLowerCase()) ||
      (p.id    || '').toLowerCase().includes(term.toLowerCase())
    );
    renderTable(filtered);
  }

  function _renderTabs() {
    const tabWrap = document.getElementById('pay-tabs');
    if (!tabWrap) return;
    const countP = piutangData.length;
    tabWrap.innerHTML = `
      <button class="pay-tab ${_activeTab === 'lunas' ? 'active' : ''}"
              onclick="PembayaranPage.switchTab('lunas')">
        <i data-lucide="check-circle" style="width:14px;height:14px;"></i> Pemasukan
      </button>
      <button class="pay-tab ${_activeTab === 'piutang' ? 'active' : ''}"
              onclick="PembayaranPage.switchTab('piutang')">
        <i data-lucide="clock" style="width:14px;height:14px;"></i> Piutang Buku
        ${countP > 0 ? `<span class="pay-tab-badge">${countP}</span>` : ''}
      </button>`;
    lucide.createIcons({ nodes: [tabWrap] });
  }

  function switchTab(tab) {
    _activeTab = tab;
    _renderTabs();
    _renderMonthlySummary();
    renderTable(tab === 'piutang' ? piutangData : allData);
  }


  // ── Murid Dropdown — pakai SD (Searchable Dropdown) ─────────────────────
  function populateMuridDropdown(murid) {
    const muridItems = murid.map(m => ({
      value: m.id,
      label: m.nama,
      extra: { nama: m.nama }
    }));
    SD.populate('pay-murid', muridItems);

    // Pasang listener change pada hidden <select> untuk trigger loadSPPForMurid
    const sel = document.getElementById('pay-murid');
    if (sel && !sel._sppListenerAttached) {
      sel.addEventListener('change', () => loadSPPForMurid(sel.value));
      sel._sppListenerAttached = true;
    }
  }

  async function loadSPPForMurid(id_murid) {
    if (!id_murid) return;
    const sppSel = document.getElementById('pay-spp');
    if (!sppSel) return;
    const relevant = sppData.filter(s => s.id_murid === id_murid && s.status_bayar !== 'PAID');
    sppSel.innerHTML = '<option value="">-- Pilih Paket SPP (opsional) --</option>' +
      relevant.map(s =>
        `<option value="${s.id}" data-harga="${s.harga}" data-terbayar="${s.terbayar}">${s.program} | ${s.periode_mulai} s/d ${s.periode_akhir || '(siklus berjalan)'} | ${UI.statusBadge(s.status_bayar)}</option>`
      ).join('');
    sppSel.onchange = () => {
      const opt      = sppSel.options[sppSel.selectedIndex];
      const harga    = parseFloat(opt.dataset.harga)    || 0;
      const terbayar = parseFloat(opt.dataset.terbayar) || 0;
      const sisa     = harga - terbayar;
      const sisaEl   = document.getElementById('pay-sisa-info');
      if (sisaEl) sisaEl.textContent = sisa > 0 ? `Sisa tagihan: ${UI.formatCurrency(sisa)}` : '';
    };
  }

  function renderTable(data) {
    // Filter per bulan untuk semua tab (lunas maupun piutang)
    if (_activeMonth) {
      data = data.filter(p => p.tanggal && p.tanggal.startsWith(_activeMonth));
    }
    Pagination.setData('pay', data);
  }

  function renderRows(slice) {
  const role    = API.currentRole();
  const canEdit = role === 'ADMIN';
  const isPiutangTab = _activeTab === 'piutang';

  const rows = slice.map(p => `
    <tr>
      <td style="width:32px;">
        ${Selection.checkbox('pay', p.id)}
      </td>

      <td>${UI.formatDate(p.tanggal)}</td>

      <td>
        <strong>${UI.escape(p.nama)}</strong>
      </td>

      <td>
        <span class="program-tag">
          ${UI.escape(p.jenis)}
        </span>
      </td>

      <td style="display:none;">${UI.escape(p.periode || '-')}</td>

      <td>${UI.formatCurrency(p.jumlah)}</td>

      <td>
        ${isPiutangTab
          ? statusBayarBadge('HUTANG')
          : (p.metode ? UI.escape(p.metode) : '-')}
      </td>

      <td>${UI.escape(p.keterangan || '-')}</td>

      <td>
        <div class="action-btns">
          ${canEdit && isPiutangTab ? `
            <button
              class="btn-icon btn-success"
              title="Tandai Lunas"
              onclick="PembayaranPage.lunaskanPiutang('${p.id}','${(p.nama || '').replace(/'/g, "\\'")}','${p.jumlah}')"
            >
              <i data-lucide="check-circle"></i>
            </button>
          ` : ''}
          ${canEdit ? `
            <button
              class="btn-icon btn-warning"
              onclick="PembayaranPage.openEdit('${p.id}')"
            >
              <i data-lucide="pencil"></i>
            </button>

            <button
              class="btn-icon btn-danger"
              data-delete-id="${p.id}"
              onclick="PembayaranPage.deletePembayaran('${p.id}','${(p.nama || '').replace(/'/g, "\\'")}')"
            >
              <i data-lucide="trash-2"></i>
            </button>
          ` : '-'}
        </div>
      </td>
    </tr>
  `);

  UI.renderTable(
    'pay-tbody',
    rows,
    isPiutangTab ? 'Tidak ada piutang buku' : 'Belum ada data pembayaran'
  );

  lucide.createIcons({
    nodes: [document.getElementById('pay-tbody')]
  });
}

  function openAdd() {
    clearForm();
    const title = document.getElementById('modal-pembayaran-title');
    if (title) title.textContent = 'Catat Pembayaran Baru';
    document.getElementById('pay-id-field').value = '';
    const muridSel = document.getElementById('pay-murid');
    if (muridSel) { muridSel.value = ''; muridSel.disabled = false; }
    SD.clear('pay-murid');
    const sisaInfo = document.getElementById('pay-sisa-info');
    if (sisaInfo) sisaInfo.textContent = '';
    UI.openModal('modal-pembayaran');
  }

  function openEdit(id) {
    const source = _activeTab === 'piutang' ? piutangData : allData;
    const p = source.find(x => x.id === id) || allData.find(x => x.id === id) || piutangData.find(x => x.id === id);
    if (!p) return;
    clearForm();
    document.getElementById('modal-pembayaran-title').textContent = 'Edit Pembayaran';
    document.getElementById('pay-id-field').value   = p.id;
    document.getElementById('pay-tanggal').value    = p.tanggal;
    document.getElementById('pay-jenis').value      = p.jenis === 'BUKU_JUAL' ? 'BUKU' : p.jenis;
    document.getElementById('pay-jumlah').value     = p.jumlah;
    document.getElementById('pay-metode').value     = p.metode;
    document.getElementById('pay-keterangan').value = p.keterangan || '';

    // ── SD: set murid (disabled saat edit) ───────────────────────────────────
    SD.setValue('pay-murid', p.id_murid);
    const sdInput  = document.getElementById('sd-input-pay-murid');
    const sdArrow  = document.getElementById('sd-arrow-pay-murid');
    const sdWrap   = sdInput ? sdInput.closest('.sd-wrap') : null;
    if (sdWrap)  sdWrap.style.pointerEvents = 'none';
    if (sdInput) sdInput.disabled = true;
    if (sdArrow) sdArrow.style.display = 'none';
    // Sync hidden select juga
    const muridSel = document.getElementById('pay-murid');
    if (muridSel) { muridSel.value = p.id_murid; muridSel.disabled = true; }

    // Restore status_bayar jika ada
    if (p.jenis === 'BUKU_JUAL') {
      const sb = p.status_bayar || 'LUNAS';
      const radio = document.querySelector(`input[name="pay-status-bayar"][value="${sb}"]`);
      if (radio) radio.checked = true;
      if (typeof window._editSelectStatus === 'function') window._editSelectStatus(sb);
    }
    if (typeof window._toggleStatusBayarWrap === 'function') window._toggleStatusBayarWrap();

    UI.openModal('modal-pembayaran');
  }

  function updateSummary() {
    const totalPiutang = piutangData.reduce((s, p) => s + (Number(p.jumlah) || 0), 0);
    const el = document.getElementById('pay-today-summary');
    if (el) {
      el.innerHTML = totalPiutang > 0
        ? `<span style="color:var(--danger,#ef4444);">Piutang buku: <strong>${UI.formatCurrency(totalPiutang)}</strong> (${piutangData.length} transaksi)</span>`
        : '';
    }
  }

  function _getMonthLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${names[parseInt(m)-1]} ${y}`;
  }

  function _renderMonthNav() {
    const el = document.getElementById('pay-month-nav');
    if (!el) return;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <button class="ctrl-btn icon-only" onclick="PembayaranPage.prevMonth()" title="Bulan sebelumnya">
          <i data-lucide="chevron-left"></i>
        </button>
        <button class="ctrl-btn" id="pay-month-label"
                onclick="PembayaranPage.openMonthPicker()"
                style="min-width:110px;font-weight:600;justify-content:center;gap:4px;">
          <i data-lucide="calendar"></i>
          ${_getMonthLabel(_activeMonth)}
        </button>
        <button class="ctrl-btn icon-only" onclick="PembayaranPage.nextMonth()" title="Bulan berikutnya">
          <i data-lucide="chevron-right"></i>
        </button>
      </div>`;
    lucide.createIcons({ nodes: [el] });
  }

  function _renderMonthlySummary() {
    const el = document.getElementById('pay-monthly-summary');
    if (!el) return;
    const monthData = _activeMonth
      ? allData.filter(p => p.tanggal && p.tanggal.startsWith(_activeMonth))
      : allData;
    const monthPiutang = _activeMonth
      ? piutangData.filter(p => p.tanggal && p.tanggal.startsWith(_activeMonth))
      : piutangData;

    const total   = monthData.reduce((s, p) => s + (Number(p.jumlah) || 0), 0);
    const spp     = monthData.filter(p => p.jenis === 'SPP').reduce((s, p) => s + (Number(p.jumlah) || 0), 0);
    const daftar  = monthData.filter(p => p.jenis === 'PENDAFTARAN').reduce((s, p) => s + (Number(p.jumlah) || 0), 0);
    const lainnya = monthData.filter(p => !['SPP','PENDAFTARAN'].includes(p.jenis)).reduce((s, p) => s + (Number(p.jumlah) || 0), 0);
    const piutang = monthPiutang.reduce((s, p) => s + (Number(p.jumlah) || 0), 0);
    const label   = _activeMonth ? _getMonthLabel(_activeMonth) : 'Semua';

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px;">
        <div class="pay-summary-card pay-summary-total">
          <div class="pay-summary-label">Pemasukan ${label}</div>
          <div class="pay-summary-value">${UI.formatCurrency(total)}</div>
        </div>
        <div class="pay-summary-card">
          <div class="pay-summary-label">SPP</div>
          <div class="pay-summary-value" style="color:var(--primary);">${UI.formatCurrency(spp)}</div>
        </div>
        <div class="pay-summary-card">
          <div class="pay-summary-label">Pendaftaran</div>
          <div class="pay-summary-value" style="color:var(--success);">${UI.formatCurrency(daftar)}</div>
        </div>
        <div class="pay-summary-card">
          <div class="pay-summary-label">Lainnya</div>
          <div class="pay-summary-value" style="color:var(--warning);">${UI.formatCurrency(lainnya)}</div>
        </div>
        ${piutang > 0 ? `
        <div class="pay-summary-card" style="border:1px solid var(--danger,#ef4444);background:var(--danger-dim,#fee2e2);">
          <div class="pay-summary-label" style="color:var(--danger,#ef4444);">Piutang Buku</div>
          <div class="pay-summary-value" style="color:var(--danger,#ef4444);">${UI.formatCurrency(piutang)}</div>
        </div>` : ''}
      </div>
      ${_buildMonthChips()}`;
  }

  function _buildMonthChips() {
    // Kumpulkan semua bulan unik dari data
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
          <button onclick="PembayaranPage.setMonth('${ym}')"
            style="padding:4px 10px;border-radius:20px;border:1px solid ${ym === _activeMonth ? 'var(--primary)' : 'var(--border)'};
                   background:${ym === _activeMonth ? 'var(--primary)' : 'var(--bg-surface)'};
                   color:${ym === _activeMonth ? '#fff' : 'var(--text-secondary)'};
                   font-size:0.75rem;font-weight:${ym === _activeMonth ? '700' : '500'};cursor:pointer;
                   white-space:nowrap;">
            ${_getMonthLabel(ym)}
          </button>`).join('')}
      </div>`;
  }

  function setMonth(ym) {
    _activeMonth = ym;
    _renderMonthNav();
    _renderMonthlySummary();
    renderTable(_activeTab === 'piutang' ? piutangData : allData);
  }

  function prevMonth() {
    const [y, m] = _activeMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    _activeMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    _renderMonthNav();
    _renderMonthlySummary();
    renderTable(_activeTab === 'piutang' ? piutangData : allData);
  }

  function nextMonth() {
    const [y, m] = _activeMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    _activeMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    _renderMonthNav();
    _renderMonthlySummary();
    renderTable(_activeTab === 'piutang' ? piutangData : allData);
  }

  function openMonthPicker() {
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

    const existing = document.getElementById('pay-month-picker-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'pay-month-picker-popup';
    popup.style.cssText = `position:fixed;z-index:9999;background:var(--bg-card);border:1px solid var(--border);
      border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:260px;`;

    const btn = document.getElementById('pay-month-label');
    if (btn) {
      const r = btn.getBoundingClientRect();
      popup.style.top  = (r.bottom + 8) + 'px';
      popup.style.left = r.left + 'px';
    }

    let selYear = _activeMonth ? parseInt(_activeMonth.split('-')[0]) : new Date().getFullYear();

    const render = () => {
      popup.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <button id="pay-picker-prev" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">‹</button>
          <strong style="color:var(--text-primary);font-size:1rem;">${selYear}</strong>
          <button id="pay-picker-next" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px;">
          ${months.map((mn, i) => {
            const ym2   = selYear + '-' + String(i+1).padStart(2,'0');
            const active = ym2 === _activeMonth;
            return `<button onclick="PembayaranPage.setMonth('${ym2}');document.getElementById('pay-month-picker-popup')?.remove();"
              style="padding:7px 4px;border-radius:8px;border:1px solid ${active ? 'var(--primary)' : 'var(--border)'};
                     background:${active ? 'var(--primary)' : 'var(--bg-surface)'};
                     color:${active ? '#fff' : 'var(--text-primary)'};font-size:0.82rem;cursor:pointer;font-weight:${active ? '700' : '400'};">
              ${mn}
            </button>`;
          }).join('')}
        </div>
        <button onclick="PembayaranPage.setMonth('');document.getElementById('pay-month-picker-popup')?.remove();"
          style="width:100%;padding:7px;border-radius:8px;border:1px solid ${!_activeMonth ? 'var(--primary)' : 'var(--border)'};
                 background:${!_activeMonth ? 'var(--primary)' : 'var(--bg-surface)'};
                 color:${!_activeMonth ? '#fff' : 'var(--text-primary)'};font-size:0.82rem;cursor:pointer;font-weight:600;">
          Semua Bulan
        </button>`;

      popup.querySelector('#pay-picker-prev').addEventListener('click', (e) => { e.stopPropagation(); selYear--; render(); });
      popup.querySelector('#pay-picker-next').addEventListener('click', (e) => { e.stopPropagation(); selYear++; render(); });
    };

    render();
    document.body.appendChild(popup);
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!popup.contains(e.target) && e.target.id !== 'pay-month-label') {
          popup.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 100);
  }

  function clearForm() {
    const form = document.getElementById('form-pembayaran');
    if (form) form.reset();
    const idField  = document.getElementById('pay-id-field');
    const sisaInfo = document.getElementById('pay-sisa-info');
    const sppId    = document.getElementById('pay-spp-id-hidden');
    const labelEl  = document.getElementById('pay-item-label');

    if (idField)  idField.value       = '';
    if (sppId)    sppId.value         = '';
    if (sisaInfo) sisaInfo.textContent = '';
    if (labelEl)  labelEl.innerHTML   = 'Klik untuk memilih item (SPP / Pendaftaran / Buku)';

    const tglInput = document.getElementById('pay-tanggal');
    if (tglInput) tglInput.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

    // ── SD: clear murid & restore interaksi ──────────────────────────────────
    SD.clear('pay-murid');
    const sdInput  = document.getElementById('sd-input-pay-murid');
    const sdArrow  = document.getElementById('sd-arrow-pay-murid');
    const sdWrap   = sdInput ? sdInput.closest('.sd-wrap') : null;
    if (sdWrap)  sdWrap.style.pointerEvents = '';
    if (sdInput) sdInput.disabled = false;
    if (sdArrow) sdArrow.style.display = '';
    const muridSel = document.getElementById('pay-murid');
    if (muridSel) muridSel.disabled = false;

    _pickerState.cachedSPP  = null;
    _pickerState.cachedBuku = null;
  }

  async function saveForm() {
    const btn        = document.querySelector('#modal-pembayaran .btn-primary');
    const id         = document.getElementById('pay-id-field')?.value;
    const muridSel   = document.getElementById('pay-murid');
    const sppId      = document.getElementById('pay-spp-id-hidden')?.value || '';
    const tanggal    = document.getElementById('pay-tanggal').value;
    const jumlah     = parseFloat(document.getElementById('pay-jumlah').value) || 0;
    const metode     = document.getElementById('pay-metode').value;
    const jenis      = document.getElementById('pay-jenis').value;
    const keterangan = document.getElementById('pay-keterangan').value;
    // Status bayar buku: ambil dari radio jika ada, default LUNAS
    const statusBayarEl = document.querySelector('input[name="pay-status-bayar"]:checked');
    const statusBayar   = statusBayarEl ? statusBayarEl.value : 'LUNAS';

    if (!muridSel.value || jumlah <= 0) { UI.toast('Pilih murid dan masukkan jumlah yang valid', 'error'); return; }

    const muridOpt  = muridSel.options[muridSel.selectedIndex];
    // Ambil nama dari dataset option (di-sync oleh SD.populate via extra.nama)
    const namaMurid = muridOpt?.dataset?.nama || '';
    const bukuQty  = (jenis === 'BUKU' && _pickerState.bukuQty)  ? _pickerState.bukuQty  : 1;
    const bukuNama = (jenis === 'BUKU' && _pickerState.bukuNama) ? _pickerState.bukuNama : keterangan;

    const jenisKirim = jenis === 'BUKU' ? 'BUKU_JUAL' : jenis;

    // Opsi A: logika arah berdasarkan status bayar
    // HUTANG → arah='piutang' (stok terpotong, pemasukan BELUM masuk)
    // LUNAS  → arah='masuk'   (stok terpotong, pemasukan langsung masuk)
    const arahKirim = (jenisKirim === 'BUKU_JUAL' && statusBayar === 'HUTANG')
      ? 'piutang'
      : 'masuk';

    const payload = {
      tanggal:     tanggal || new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0],
      id_murid:    muridSel.value,
      nama:        namaMurid,
      jenis:       jenisKirim,
      jumlah, metode,
      keterangan:  jenis === 'BUKU' ? bukuNama : keterangan,
      spp_id:      sppId,
      arah:        arahKirim,
      jumlah_buku: bukuQty,
      status_bayar: jenisKirim === 'BUKU_JUAL' ? statusBayar : undefined
    };

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Memproses...'; }
      const res = id
        ? await API.pembayaran.update({ id, ...payload })
        : await API.pembayaran.add(payload);
      if (res.status === 'OK') {
        const msg = (jenisKirim === 'BUKU_JUAL' && statusBayar === 'HUTANG')
          ? 'Buku diserahkan, dicatat sebagai piutang!'
          : (id ? 'Data pembayaran diperbarui' : 'Pembayaran berhasil dicatat!');
        UI.toast(msg, 'success');
        UI.closeModal('modal-pembayaran');
        _pickerState.bukuQty  = null;
        _pickerState.bukuNama = null;
        _pickerState.cachedBuku = null;
        load(true);
      } else {
        UI.toast(res.message || 'Gagal menyimpan pembayaran', 'error');
      }
    } catch(e) {
      console.error('Error Payment:', e);
      UI.toast('Terjadi kesalahan pada server', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan Pembayaran'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  // ── Lunaskan piutang buku ─────────────────────────────────────────────────
  async function lunaskanPiutang(id, nama, jumlah) {
    const confirmed = await UI.confirm(
      `Tandai lunas piutang buku <strong>"${nama}"</strong> sebesar <strong>${UI.formatCurrency(Number(jumlah))}</strong>?<br>
       <span style="color:var(--success);font-size:0.8rem;">Status akan berubah menjadi Lunas dan pemasukan akan dicatat.</span>`,
      { title: 'Tandai Lunas', okLabel: 'Ya, Lunas', okClass: 'btn btn-success', icon: 'check-circle' }
    );
    if (!confirmed) return;

    try {
      const res = await API.pembayaran.update({
        id,
        status_bayar: 'LUNAS',
        arah:         'masuk'
      });
      if (res.status === 'OK') {
        UI.toast(`Piutang "${nama}" berhasil dilunasi! Pemasukan dicatat.`, 'success');
        load(true);
      } else {
        UI.toast(res.message || 'Gagal melunasi piutang', 'error');
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
    }
  }

  async function deletePembayaran(id, nama) {
    const source = _activeTab === 'piutang' ? piutangData : allData;
    const p = source.find(x => x.id === id);
    if (!await UI.confirmDelete(nama, 'pembayaran')) return;

    lastDeletedData = p ? JSON.parse(JSON.stringify(p)) : null;
    lastAction      = 'DELETE';

    const btn             = document.querySelector(`button[data-delete-id="${id}"]`);
    const originalContent = btn ? btn.innerHTML : '';
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>'; btn.style.width = '40px'; }
      const res = await API.pembayaran.delete(id);
      if (res.status === 'OK') {
        UI.toast(`Pembayaran "${nama}" berhasil dihapus. Klik Undo untuk membatalkan.`, 'warning');
        if (_activeTab === 'piutang') {
          piutangData = piutangData.filter(x => x.id !== id);
          renderTable(piutangData);
        } else {
          allData = allData.filter(x => x.id !== id);
          renderTable(allData);
        }
        updateSummary();
        const undoBtn = document.getElementById('pay-undo-btn');
        if (undoBtn) undoBtn.disabled = false;
      } else {
        UI.toast(res.message || 'Gagal menghapus pembayaran', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
    }
  }

  async function undo() {
    if (!lastAction || !lastDeletedData) return;
    const undoBtn = document.getElementById('pay-undo-btn');
    const redoBtn = document.getElementById('pay-redo-btn');
    try {
      if (undoBtn) undoBtn.disabled = true;
      if (lastAction === 'DELETE') {
        const res = await API.pembayaran.add(lastDeletedData);
        if (res.status === 'OK') {
          UI.toast('Undo Berhasil: Pembayaran dikembalikan!', 'success');
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
    const redoBtn = document.getElementById('pay-redo-btn');
    try {
      if (redoBtn) redoBtn.disabled = true;
      const res = await API.pembayaran.delete(lastRestoredId);
      if (res.status === 'OK') {
        UI.toast('Redo Berhasil: Pembayaran dihapus kembali!', 'success');
        lastAction     = 'DELETE';
        lastRestoredId = null;
        const undoBtn  = document.getElementById('pay-undo-btn');
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
    if (!await UI.confirmDanger(`PERINGATAN! Akan menghapus SEMUA (${total}) data pembayaran.`, 'HAPUS SEMUA PEMBAYARAN')) return;
    UI.toast('Sedang membersihkan database...', 'info');
    try {
      const res = await API.pembayaran.deleteAll();
      if (res.status === 'OK') {
        UI.toast('Seluruh data pembayaran berhasil dihapus!', 'success');
        load(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus semua data', 'error');
      }
    } catch(e) { UI.toast('Gagal menghapus semua data', 'error'); }
  }

  // ── Item Picker ───────────────────────────────────────────
  let _pickerState = { step: 'kategori', bukuMode: null, cachedSPP: null, cachedBuku: null, selectedBuku: null, bukuQty: null, bukuNama: null };

  function openItemPicker() {
    // Reset field item sebelum buka picker
    const jenisEl  = document.getElementById('pay-jenis');
    const jumlahEl = document.getElementById('pay-jumlah');
    const ketEl    = document.getElementById('pay-keterangan');
    const sppIdEl  = document.getElementById('pay-spp-id-hidden');
    const labelEl  = document.getElementById('pay-item-label');
    const sisaEl   = document.getElementById('pay-sisa-info');
    if (jenisEl)  jenisEl.value    = '';
    if (jumlahEl) jumlahEl.value   = '';
    if (ketEl)    ketEl.value      = '';
    if (sppIdEl)  sppIdEl.value    = '';
    if (sisaEl)   sisaEl.textContent = '';
    if (labelEl)  labelEl.innerHTML = 'Klik untuk memilih item (SPP / Pendaftaran / Buku)';
    _pickerState.bukuQty    = null;
    _pickerState.bukuNama   = null;
    _pickerState.bukuStatus = 'LUNAS';
    _pickerState.step = 'kategori';
    _showPickerStep();
    UI.openModal('modal-item-picker');
  }

  function itemPickerBack() {
    if (_pickerState.step === 'buku-qty')       _pickerState.step = 'buku-list';
    else if (_pickerState.step === 'buku-list') _pickerState.step = 'kategori';
    else if (_pickerState.step === 'spp-detail') _pickerState.step = 'spp-list';
    else if (_pickerState.step === 'spp-list')  _pickerState.step = 'kategori';
    else if (_pickerState.step === 'daftar')    _pickerState.step = 'kategori';
    else _pickerState.step = 'kategori';
    _showPickerStep();
  }

  function _showPickerStep() {
    const body    = document.getElementById('item-picker-body');
    const title   = document.getElementById('item-picker-title');
    const backBtn = document.getElementById('item-picker-back');
    if (!body) return;
    const isRoot = _pickerState.step === 'kategori';
    if (backBtn) backBtn.style.display = isRoot ? 'none' : 'inline-flex';
    switch (_pickerState.step) {
      case 'kategori':   return _renderKategori(body, title);
      case 'spp-list':   return _renderSPPList(body, title);
      case 'spp-detail': return _showSPPForMurid(_pickerState.sppDetailMuridId, _pickerState.sppDetailMuridNama, true);
      case 'daftar':     return _renderDaftar(body, title);
      case 'buku-mode':  return _renderBukuMode(body, title);
      case 'buku-list':  return _renderBukuList(body, title);
      case 'buku-qty':   return _renderBukuQty(body, title);
    }
  }

  function _renderKategori(body, title) {
    title.textContent = 'Pilih Kategori';
    const kategori = [
      { key:'spp',    icon:'calendar-check', label:'SPP',         sub:'Tagihan paket belajar belum lunas',    color:'var(--primary)', bg:'var(--primary-dim)' },
      { key:'daftar', icon:'user-plus',      label:'Pendaftaran', sub:'Biaya pendaftaran murid baru',          color:'var(--success)', bg:'var(--success-dim)' },
      { key:'buku',   icon:'shopping-bag',   label:'Buku (Jual)', sub:'Jual modul ke murid — stok berkurang', color:'var(--warning)', bg:'var(--warning-dim)' },
    ];
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px;padding:4px 0;">
        ${kategori.map(k => `
          <div class="picker-item" onclick="PembayaranPage._pilihKategori('${k.key}')">
            <div class="picker-icon" style="background:${k.bg};">
              <i data-lucide="${k.icon}" style="width:20px;height:20px;color:${k.color}"></i>
            </div>
            <div style="flex:1;">
              <div class="picker-item-title">${k.label}</div>
              <div class="picker-item-sub">${k.sub}</div>
            </div>
            <i data-lucide="chevron-right" style="width:16px;height:16px;color:var(--text-dim)"></i>
          </div>`).join('')}
      </div>`;
    lucide.createIcons({ nodes: [body] });
  }

  function _pilihKategori(key) {
    _pickerState.step = key === 'buku' ? 'buku-mode' : key === 'spp' ? 'spp-list' : 'daftar';
    _showPickerStep();
  }

  async function _renderSPPList(body, title) {
    title.textContent = 'Pilih Tagihan SPP';

    // Load semua SPP ke cache dulu
    body.innerHTML = `<div class="picker-loading"><div class="spinner spinner-sm" style="margin:0 auto 8px"></div> Memuat tagihan...</div>`;
    try {
      if (!_pickerState.cachedSPP) {
        const res = await API.spp.getAll();
        // Tagihan ditentukan dari status_bayar, BUKAN status periode.
        // Paket yang sudah EXPIRED tapi belum lunas tetap harus bisa dibayar (piutang).
        _pickerState.cachedSPP = (res.data || []).filter(s => s.status_bayar !== 'PAID');
      }
    } catch(e) {
      body.innerHTML = `<div class="picker-error">Gagal memuat data SPP</div>`;
      return;
    }

    const allSPP = _pickerState.cachedSPP;
    if (!allSPP.length) {
      body.innerHTML = `<div class="picker-empty"><i data-lucide="check-circle" style="width:32px;height:32px;margin-bottom:8px;color:var(--success)"></i><div>Semua tagihan SPP sudah lunas 🎉</div></div>`;
      lucide.createIcons({ nodes: [body] });
      return;
    }

    // Ambil daftar murid unik dari SPP yang belum lunas
    const muridMap = {};
    allSPP.forEach(s => {
      if (!muridMap[s.id_murid]) muridMap[s.id_murid] = { id: s.id_murid, nama: s.nama_murid, count: 0 };
      muridMap[s.id_murid].count++;
    });
    const muridList = Object.values(muridMap).sort((a, b) => a.nama.localeCompare(b.nama));

    // Render step 1: pilih murid dengan searchable list
    _renderSPPMuridStep(body, muridList, allSPP);
  }

  function _renderSPPMuridStep(body, muridList, allSPP) {
    body.innerHTML = `
      <div style="margin-bottom:12px;">
        <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:8px;">
          ${muridList.length} murid punya tagihan belum lunas
        </div>
        <div class="search-wrap" style="width:100%;">
          <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input id="spp-murid-search" class="search-input" type="text"
                 placeholder="Ketik nama murid..."
                 style="width:100%;box-sizing:border-box;"
                 oninput="PembayaranPage._filterSPPMurid(this.value)">
        </div>
      </div>
      <div id="spp-murid-list" style="display:flex;flex-direction:column;gap:6px;max-height:340px;overflow-y:auto;">
        ${_buildMuridRows(muridList)}
      </div>`;

    // Simpan data ke state untuk filtering
    _pickerState.sppMuridList = muridList;
    _pickerState.sppAllData   = allSPP;

    setTimeout(() => document.getElementById('spp-murid-search')?.focus(), 100);
  }

  function _buildMuridRows(list) {
    if (!list.length) return `<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:0.85rem;">Murid tidak ditemukan</div>`;
    return list.map(m => `
      <div class="picker-row" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;"
           onclick="PembayaranPage._showSPPForMurid('${m.id}','${m.nama.replace(/'/g,"\'")}')">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:50%;background:var(--primary);color:#fff;
                      display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.85rem;flex-shrink:0;">
            ${m.nama.charAt(0).toUpperCase()}
          </div>
          <div style="font-weight:600;color:var(--text-primary);">${m.nama}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:0.75rem;background:var(--primary-dim,#eff6ff);color:var(--primary);
                       padding:2px 8px;border-radius:12px;font-weight:600;">
            ${m.count} tagihan
          </span>
          <svg style="width:14px;height:14px;color:var(--text-secondary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </div>
      </div>`).join('');
  }

  function _filterSPPMurid(q) {
    const list    = (_pickerState.sppMuridList || []).filter(m =>
      m.nama.toLowerCase().includes(q.toLowerCase())
    );
    const el = document.getElementById('spp-murid-list');
    if (el) el.innerHTML = _buildMuridRows(list);
  }

  function _showSPPForMurid(id_murid, nama_murid, fromBack = false) {
    const body  = document.getElementById('item-picker-body');
    const title = document.getElementById('item-picker-title');
    if (!body || !title) return;

    // Simpan step dan info murid supaya tombol Kembali bisa balik ke sini
    if (!fromBack) {
      _pickerState.step             = 'spp-detail';
      _pickerState.sppDetailMuridId   = id_murid;
      _pickerState.sppDetailMuridNama = nama_murid;
    }

    title.textContent = `SPP · ${nama_murid}`;

    const list = (_pickerState.sppAllData || _pickerState.cachedSPP || [])
      .filter(s => s.id_murid === id_murid);

    if (!list.length) {
      body.innerHTML = `<div class="picker-empty">Tidak ada tagihan untuk murid ini</div>`;
      return;
    }

    // Simpan index relatif ke cachedSPP untuk _pilihSPP
    body.innerHTML = `
      <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:10px;">
        ${list.length} tagihan belum lunas
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto;">
        ${list.map(s => {
          const idx  = _pickerState.cachedSPP.indexOf(s);
          const sisa = Number(s.harga) - Number(s.terbayar || 0);
          const pct  = s.harga > 0 ? Math.round((s.terbayar / s.harga) * 100) : 0;
          const isExpired = (s.status || '').toUpperCase() !== 'AKTIF';
          return `
          <div class="picker-row" onclick="PembayaranPage._pilihSPP(${idx})">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <div>
                <div style="font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:6px;">
                  ${s.program}
                  ${isExpired ? `<span style="font-size:0.65rem;padding:1px 6px;border-radius:8px;background:var(--danger-dim,#fee2e2);color:var(--danger,#dc2626);font-weight:700;text-transform:uppercase;">Lewat periode</span>` : ''}
                </div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">${s.periode_mulai} s/d ${s.periode_akhir || '(siklus berjalan)'}</div>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="font-weight:700;color:var(--primary);">${UI.formatCurrency(sisa)}</div>
                <div style="font-size:0.72rem;color:var(--text-secondary);">sisa tagihan</div>
              </div>
            </div>
            <div class="picker-progress-track"><div class="picker-progress-fill" style="width:${pct}%"></div></div>
            <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:3px;">Terbayar ${pct}% · Total ${UI.formatCurrency(s.harga)}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  function _pilihSPP(idx) {
    const s = _pickerState.cachedSPP[idx];
    if (!s) return;
    const sisa = Number(s.harga) - Number(s.terbayar || 0);

    // Auto-fill murid via SD
    if (s.id_murid) {
      SD.setValue('pay-murid', s.id_murid);
      loadSPPForMurid(s.id_murid);
    }

    _autoFill({
      jenis:      'SPP',
      jumlah:     sisa,
      keterangan: `SPP ${s.program} ${s.periode_mulai} s/d ${s.periode_akhir || '(siklus berjalan)'}`,
      spp_id:     s.id,
      label:      `SPP · ${s.nama_murid} · sisa ${UI.formatCurrency(sisa)}`
    });
    UI.closeModal('modal-item-picker');
  }

  function _renderDaftar(body, title) {
    title.textContent = 'Biaya Pendaftaran';
    body.innerHTML    = `
      <div style="padding:8px 0;">
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px;">Masukkan nominal biaya pendaftaran murid baru.</p>
        <div class="form-group">
          <label>Nominal (Rp) *</label>
          <input type="number" id="picker-daftar-nominal" placeholder="Contoh: 150000" min="0"
                 style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.9rem;background:var(--bg-surface);color:var(--text-primary);outline:none;">
        </div>
        <div class="form-group" style="margin-top:12px;">
          <label>Keterangan (opsional)</label>
          <input type="text" id="picker-daftar-ket" placeholder="Contoh: Pendaftaran semester ganjil"
                 style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:0.9rem;background:var(--bg-surface);color:var(--text-primary);outline:none;">
        </div>
        <button class="picker-btn-confirm"
                style="background:var(--success);margin-top:16px;width:100%;padding:12px;border-radius:10px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:0.95rem;color:#fff;"
                onclick="PembayaranPage._pilihDaftar()">
          <i data-lucide="check-circle" style="width:18px;height:18px;"></i> Gunakan Nominal Ini
        </button>
      </div>`;
    lucide.createIcons({ nodes: [body] });
    setTimeout(() => document.getElementById('picker-daftar-nominal')?.focus(), 100);
  }

  function _pilihDaftar() {
    const nominal = parseFloat(document.getElementById('picker-daftar-nominal')?.value) || 0;
    const ket     = document.getElementById('picker-daftar-ket')?.value || 'Biaya Pendaftaran';
    if (nominal <= 0) { UI.toast('Masukkan nominal yang valid', 'error'); return; }
    _autoFill({ jenis: 'PENDAFTARAN', jumlah: nominal, keterangan: ket, label: `Pendaftaran · ${UI.formatCurrency(nominal)}` });
    UI.closeModal('modal-item-picker');
  }

  function _renderBukuMode(body, title) {
    _pickerState.bukuMode = 'jual';
    _pickerState.step     = 'buku-list';
    _showPickerStep();
  }

  async function _pilihBukuMode(mode) {
    _pickerState.bukuMode = mode;
    _pickerState.step     = 'buku-list';
    _showPickerStep();
  }

  function _renderBukuOptions(container, list) {
    if (!list.length) {
      container.innerHTML = `<div class="picker-empty">Modul tidak ditemukan</div>`;
      return;
    }
    container.innerHTML = list.map((b, i) => {
      const harga  = Number(b.harga_jual);
      const untung = Number(b.harga_jual) - Number(b.harga_beli);
      // pakai index di cachedBuku (bukan filtered list) agar _pilihBuku tetap benar
      const realIdx = (_pickerState.cachedBuku || []).filter(x => Number(x.stok) > 0).indexOf(b);
      return `
        <div class="picker-row" onclick="PembayaranPage._pilihBuku(${realIdx})">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <div>
              <div style="font-weight:600;color:var(--text-primary);">${UI.escape(b.nama_modul)}</div>
              <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:2px;">${UI.escape(b.jenjang||'-')} · ${UI.escape(b.program||'-')} · Stok: <strong>${b.stok}</strong></div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-weight:700;color:var(--warning);">${UI.formatCurrency(harga)}</div>
              <div style="font-size:0.72rem;color:var(--success);">+${UI.formatCurrency(untung)} untung</div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  async function _renderBukuList(body, title) {
    title.textContent = 'Pilih Modul (Jual)';
    body.innerHTML    = `<div class="picker-loading"><div class="spinner spinner-sm" style="margin:0 auto 8px"></div> Memuat modul...</div>`;
    try {
      if (!_pickerState.cachedBuku) {
        const res = await API.buku.getAll();
        _pickerState.cachedBuku = res.data || [];
      }
      const list = _pickerState.cachedBuku.filter(b => Number(b.stok) > 0);
      if (!list.length) {
        body.innerHTML = `<div class="picker-empty">Semua stok habis</div>`;
        return;
      }
      body.innerHTML = `
        <div style="position:relative;margin-bottom:10px;">
          <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:var(--text-secondary);pointer-events:none;"
               viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input id="pay-buku-search"
                 type="text"
                 placeholder="Ketik nama modul..."
                 oninput="PembayaranPage._filterBukuPay(this.value)"
                 style="width:100%;box-sizing:border-box;padding:9px 12px 9px 32px;border:1px solid var(--border);
                        border-radius:8px;font-size:0.88rem;background:var(--bg-surface);
                        color:var(--text-primary);outline:none;">
        </div>
        <div id="pay-buku-options" style="display:flex;flex-direction:column;gap:8px;max-height:320px;overflow-y:auto;"></div>`;
      const container = body.querySelector('#pay-buku-options');
      _renderBukuOptions(container, list);
      setTimeout(() => body.querySelector('#pay-buku-search')?.focus(), 50);
    } catch(e) {
      body.innerHTML = `<div class="picker-error">Gagal memuat data modul</div>`;
    }
  }

  function _filterBukuPay(q) {
    const all = (_pickerState.cachedBuku || []).filter(b => Number(b.stok) > 0);
    const filtered = q.trim()
      ? all.filter(b =>
          (b.nama_modul || '').toLowerCase().includes(q.toLowerCase()) ||
          (b.program    || '').toLowerCase().includes(q.toLowerCase()) ||
          (b.jenjang    || '').toLowerCase().includes(q.toLowerCase())
        )
      : all;
    const container = document.getElementById('pay-buku-options');
    if (container) _renderBukuOptions(container, filtered);
  }

  function _pilihBuku(idx) {
    const list = _pickerState.cachedBuku ? _pickerState.cachedBuku.filter(b => Number(b.stok) > 0) : [];
    const b    = list[idx];
    if (!b) return;
    _pickerState.selectedBuku = b;
    _pickerState.step         = 'buku-qty';
    _showPickerStep();
  }

  function _renderBukuQty(body, title) {
    const b = _pickerState.selectedBuku;
    if (!b) return;
    const harga = Number(b.harga_jual);
    title.textContent = 'Jumlah & Pembayaran';
    // default status ke LUNAS
    _pickerState.bukuStatus = _pickerState.bukuStatus || 'LUNAS';
    body.innerHTML = `
      <div style="padding:4px 0;">
        <!-- Info Buku -->
        <div style="background:var(--bg-hover);border-radius:10px;padding:12px 14px;margin-bottom:14px;">
          <div style="font-weight:600;color:var(--text-primary);">${b.nama_modul}</div>
          <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:2px;">
            ${b.jenjang||'-'} · ${b.program||'-'} · Stok: <strong style="color:var(--success)">${b.stok}</strong>
          </div>
          <div style="font-weight:700;color:var(--warning);margin-top:4px;">${UI.formatCurrency(harga)} / buku</div>
        </div>

        <!-- Jumlah -->
        <div class="form-group" style="margin-bottom:14px;">
          <label style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;">Jumlah Buku *</label>
          <input type="number" id="buku-qty-input" min="1" max="${b.stok}" value="1"
                 style="width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:8px;font-size:1rem;background:var(--bg-surface);color:var(--text-primary);margin-top:6px;"
                 oninput="PembayaranPage._updateBukuQtyTotal()">
        </div>

        <!-- Toggle Lunas / Hutang -->
        <div style="margin-bottom:14px;">
          <div style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px;">Status Pembayaran</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div id="btn-status-lunas" onclick="PembayaranPage._setBukuStatus('LUNAS')" style="
              padding:10px 12px;border-radius:8px;cursor:pointer;text-align:center;transition:.15s;
              border:2px solid var(--success);background:var(--success-dim);">
              <i data-lucide="check-circle" style="width:18px;height:18px;color:var(--success);margin-bottom:4px;"></i>
              <div style="font-weight:700;color:var(--success);font-size:0.85rem;">Lunas</div>
              <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:2px;">Bayar sekarang</div>
            </div>
            <div id="btn-status-hutang" onclick="PembayaranPage._setBukuStatus('HUTANG')" style="
              padding:10px 12px;border-radius:8px;cursor:pointer;text-align:center;transition:.15s;
              border:2px solid var(--border);background:var(--bg-surface);">
              <i data-lucide="clock" style="width:18px;height:18px;color:var(--text-secondary);margin-bottom:4px;"></i>
              <div style="font-weight:700;color:var(--text-secondary);font-size:0.85rem;">Hutang</div>
              <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:2px;">Bayar nanti</div>
            </div>
          </div>
          <div id="buku-status-info" style="font-size:0.75rem;color:var(--success);margin-top:6px;padding:0 2px;">
            Stok berkurang, pemasukan langsung tercatat
          </div>
        </div>

        <!-- Total -->
        <div style="background:var(--warning-dim);border:1px solid var(--warning);border-radius:10px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <span style="font-size:0.85rem;color:var(--text-secondary);">Total</span>
          <span id="buku-qty-total" style="font-weight:700;font-size:1.05rem;color:var(--warning);">${UI.formatCurrency(harga)}</span>
        </div>

        <!-- Tombol Konfirmasi -->
        <button class="picker-btn-confirm" id="btn-konfirmasi-buku"
                style="background:var(--success);margin-top:0;width:100%;padding:12px;border-radius:10px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:0.95rem;color:#fff;"
                onclick="PembayaranPage._konfirmasiBuku()">
          <i data-lucide="check-circle" style="width:18px;height:18px;"></i>
          Konfirmasi — Lunas
        </button>
      </div>`;
    lucide.createIcons({ nodes: [body] });
    setTimeout(() => document.getElementById('buku-qty-input')?.focus(), 100);
  }

  function _setBukuStatus(status) {
    _pickerState.bukuStatus = status;
    const btnLunas  = document.getElementById('btn-status-lunas');
    const btnHutang = document.getElementById('btn-status-hutang');
    const infoEl    = document.getElementById('buku-status-info');
    const konfBtn   = document.getElementById('btn-konfirmasi-buku');
    if (!btnLunas || !btnHutang) return;

    if (status === 'LUNAS') {
      btnLunas.style.border     = '2px solid var(--success)';
      btnLunas.style.background = 'var(--success-dim)';
      btnLunas.querySelector('div:nth-child(2)').style.color = 'var(--success)';
      btnHutang.style.border     = '2px solid var(--border)';
      btnHutang.style.background = 'var(--bg-surface)';
      btnHutang.querySelector('div:nth-child(2)').style.color = 'var(--text-secondary)';
      if (infoEl) { infoEl.style.color = 'var(--success)'; infoEl.textContent = 'Stok berkurang, pemasukan langsung tercatat'; }
      if (konfBtn) { konfBtn.style.background = 'var(--success)'; konfBtn.innerHTML = '<i data-lucide="check-circle" style="width:18px;height:18px;"></i> Konfirmasi — Lunas'; lucide.createIcons({ nodes: [konfBtn] }); }
    } else {
      btnHutang.style.border     = '2px solid var(--warning)';
      btnHutang.style.background = 'var(--warning-dim)';
      btnHutang.querySelector('div:nth-child(2)').style.color = 'var(--warning)';
      btnLunas.style.border     = '2px solid var(--border)';
      btnLunas.style.background = 'var(--bg-surface)';
      btnLunas.querySelector('div:nth-child(2)').style.color = 'var(--text-secondary)';
      if (infoEl) { infoEl.style.color = 'var(--warning)'; infoEl.textContent = 'Stok berkurang, pemasukan dicatat saat murid bayar'; }
      if (konfBtn) { konfBtn.style.background = 'var(--warning)'; konfBtn.innerHTML = '<i data-lucide="clock" style="width:18px;height:18px;"></i> Konfirmasi — Hutang'; lucide.createIcons({ nodes: [konfBtn] }); }
    }
  }

  function _updateBukuQtyTotal() {
    const b = _pickerState.selectedBuku;
    if (!b) return;
    const qty   = parseInt(document.getElementById('buku-qty-input')?.value) || 1;
    const total = qty * Number(b.harga_jual);
    const el    = document.getElementById('buku-qty-total');
    if (el) el.textContent = UI.formatCurrency(total);
  }

  async function _konfirmasiBuku() {
    const b = _pickerState.selectedBuku;
    if (!b) return;
    const qty    = parseInt(document.getElementById('buku-qty-input')?.value) || 1;
    const status = _pickerState.bukuStatus || 'LUNAS';
    if (qty <= 0)             { UI.toast('Jumlah harus lebih dari 0', 'error'); return; }
    if (qty > Number(b.stok)) { UI.toast(`Stok hanya ${b.stok}`, 'error'); return; }

    // Cek apakah murid ini pernah beli buku yang sama
    const muridSel  = document.getElementById('pay-murid');
    const id_murid  = muridSel ? muridSel.value : '';
    const namaMurid = muridSel ? muridSel.options[muridSel.selectedIndex]?.dataset?.nama : '';
    const semuaData = [...allData, ...piutangData];
    const sudahBeli = semuaData.some(p =>
      p.id_murid === id_murid &&
      p.jenis === 'BUKU_JUAL' &&
      (p.keterangan || '').toLowerCase().includes(b.nama_modul.toLowerCase())
    );
    if (sudahBeli) {
      const lanjut = await UI.confirm(
        `<strong>${namaMurid}</strong> sebelumnya sudah pernah membeli buku <strong>"${b.nama_modul}"</strong>.<br><br>
         <span style="color:var(--text-secondary);font-size:0.85rem;">Mungkin buku hilang atau rusak? Tetap lanjutkan pembelian ulang?</span>`,
        { title: 'Pembelian Buku Ganda', okLabel: 'Ya, Lanjutkan', okClass: 'btn btn-warning', icon: 'alert-triangle' }
      );
      if (!lanjut) return;
    }
    const total       = qty * Number(b.harga_jual);
    const statusLabel = status === 'HUTANG' ? ' · HUTANG' : '';
    _autoFill({
      jenis:      'BUKU',
      jumlah:     total,
      keterangan: `${b.nama_modul} (${qty} buku)`,
      label:      `Jual ${qty} Buku · ${b.nama_modul} · ${UI.formatCurrency(total)}${statusLabel}`
    });
    _pickerState.bukuQty    = qty;
    _pickerState.bukuNama   = b.nama_modul;
    _pickerState.bukuStatus = status;
    // Simpan ke hidden input dan sync radio di modal
    const statusEl = document.getElementById('pay-status-buku');
    if (statusEl) statusEl.value = status;
    const radio = document.querySelector(`input[name="pay-status-bayar"][value="${status}"]`);
    if (radio) radio.checked = true;
    // Sembunyikan wrap radio — status sudah dipilih di picker
    const statusWrap = document.getElementById('pay-status-bayar-wrap');
    if (statusWrap) statusWrap.style.display = 'none';
    // Badge hutang di label
    if (status === 'HUTANG') {
      const sisaEl = document.getElementById('pay-sisa-info');
      if (sisaEl) { sisaEl.style.color = 'var(--warning)'; sisaEl.textContent = 'Buku diserahkan, pembayaran belum diterima'; }
    }
    // Reset status untuk picker berikutnya
    _pickerState.bukuStatus = 'LUNAS';
    UI.closeModal('modal-item-picker');
  }

  function _autoFill({ jenis, jumlah, keterangan, spp_id, label }) {
    const jenisEl  = document.getElementById('pay-jenis');
    const jumlahEl = document.getElementById('pay-jumlah');
    const ketEl    = document.getElementById('pay-keterangan');
    const sppIdEl  = document.getElementById('pay-spp-id-hidden');
    const labelEl  = document.getElementById('pay-item-label');
    const sisaEl   = document.getElementById('pay-sisa-info');

    if (jenisEl)  jenisEl.value  = jenis;
    if (jumlahEl) jumlahEl.value = jumlah;
    if (ketEl)    ketEl.value    = keterangan;
    if (sppIdEl)  sppIdEl.value  = spp_id || '';

    // Toggle status-bayar wrap
    if (typeof window._toggleStatusBayarWrap === 'function') window._toggleStatusBayarWrap();

    if (labelEl) {
      labelEl.innerHTML = `<span class="program-tag" style="font-size:0.75rem;">${jenis}</span>
        <span style="margin-left:6px;font-weight:500;">${label}</span>`;
    }
    if (sisaEl) {
      sisaEl.textContent = jenis === 'SPP' ? `Sisa tagihan: ${UI.formatCurrency(jumlah)}` : '';
    }

    _pickerState.cachedSPP  = null;
    _pickerState.cachedBuku = null;
  }

  function deleteSelected()  { return Selection.deleteSelected('pay'); }
  function _getCurrentData() { return _activeTab === 'piutang' ? piutangData : allData; }

  // ── Export functions ─────────────────────────────────────────────────────
  function exportExcel() {
    const headers = ['ID', 'Tanggal', 'Nama Murid', 'Jenis', 'Keterangan', 'Jumlah', 'Metode'];
    const rows    = allData.map(p => [
      p.id,
      UI.formatDate(p.tanggal),
      p.nama || '-',
      p.jenis || '-',
      p.keterangan || '-',
      p.jumlah || 0,
      p.metode || '-'
    ]);
    UI.exportExcel(headers, rows, 'Data_Pembayaran', 'Pembayaran');
  }

  function exportPDF() {
    const headers = ['ID', 'Tanggal', 'Nama Murid', 'Jenis', 'Keterangan', 'Jumlah', 'Metode'];
    const rows    = allData.map(p => [
      p.id,
      UI.formatDate(p.tanggal),
      p.nama || '-',
      p.jenis || '-',
      p.keterangan || '-',
      UI.formatCurrency(p.jumlah || 0),
      p.metode || '-'
    ]);
    UI.exportPDF('Data Pembayaran', headers, rows, { subtitle: 'Riwayat pembayaran masuk EduHome' });
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

  return {
    load, search, saveForm, openAdd, openEdit, deletePembayaran, updateSummary,
    undo, redo, deleteAll, openItemPicker, itemPickerBack,
    _pilihKategori, _pilihSPP, _filterSPPMurid, _showSPPForMurid, _pilihDaftar, _pilihBukuMode, _pilihBuku, _filterBukuPay,
    deleteSelected, renderTable, renderRows, _getCurrentData, _updateBukuQtyTotal, _konfirmasiBuku,
    _setBukuStatus,
    exportExcel, exportPDF, sortBy, switchTab, lunaskanPiutang,
    setMonth, prevMonth, nextMonth, openMonthPicker
  };
})();

window.PembayaranPage = PembayaranPage;