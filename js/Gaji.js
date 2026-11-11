const GajiPage = (() => {
  let allData         = [];
  let isFetched       = false;
  let lastDeletedData = null;
  let lastAction      = null;
  let lastRestoredId  = null;

  let _extraDays = [];
  let _previewLoading = false;
  let _lastSessionOnlyDays = [];

  function _setBulanInput(yyyymm) {
    const el = document.getElementById('gaji-bulan');
    if (el) el.value = yyyymm || '';
    _renderBulanNav();
  }

  function _getBulanValue() {
    return document.getElementById('gaji-bulan')?.value || '';
  }

  function _defaultBulanValue() {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }

  function _getMonthLabelID(ym) {
    if (!ym) return '-';
    const [y, m] = ym.split('-');
    const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${names[parseInt(m, 10) - 1] || '-'} ${y}`;
  }

  // ── Nav bulan bergaya sama seperti LaporanBulananPage: panah prev/next +
  //    pill bulan yang bisa diklik buat buka picker bulan/tahun. Input
  //    type="month" asli (#gaji-bulan) tetap ada di DOM (disembunyikan)
  //    sebagai sumber kebenaran nilai — semua logic lain (save, preview,
  //    validasi extra day) yang sudah baca dari situ tidak perlu diubah.
  function _ensureBulanNavMounted() {
    const input = document.getElementById('gaji-bulan');
    if (!input || input.dataset.navMounted === '1') return;
    input.style.display = 'none';
    const nav = document.createElement('div');
    nav.id = 'gaji-bulan-nav';
    nav.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
    input.insertAdjacentElement('afterend', nav);
    input.dataset.navMounted = '1';
  }

  function _renderBulanNav() {
    _ensureBulanNavMounted();
    const nav = document.getElementById('gaji-bulan-nav');
    if (!nav) return;
    const ym = _getBulanValue() || _defaultBulanValue();
    const dis      = _previewLoading ? 'disabled' : '';
    const disStyle = _previewLoading ? 'opacity:.45;cursor:not-allowed;' : '';
    nav.innerHTML = `
      <button type="button" class="ctrl-btn icon-only" ${dis} style="${disStyle}" onclick="GajiPage._prevBulan()" title="Bulan sebelumnya">
        <i data-lucide="chevron-left"></i>
      </button>
      <button type="button" class="ctrl-btn" id="gaji-bulan-label" ${dis}
              onclick="GajiPage._openBulanPicker()"
              style="min-width:110px;font-weight:600;justify-content:center;gap:4px;${disStyle}">
        <i data-lucide="calendar"></i>
        ${_getMonthLabelID(ym)}
      </button>
      <button type="button" class="ctrl-btn icon-only" ${dis} style="${disStyle}" onclick="GajiPage._nextBulan()" title="Bulan berikutnya">
        <i data-lucide="chevron-right"></i>
      </button>`;
    if (window.lucide) lucide.createIcons({ nodes: [nav] });
  }

  function _prevBulan() {
    const [y, m] = (_getBulanValue() || _defaultBulanValue()).split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    _setBulanInput(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    _onMentorOrBulanChange();
  }

  function _nextBulan() {
    const [y, m] = (_getBulanValue() || _defaultBulanValue()).split('-').map(Number);
    const d = new Date(y, m, 1);
    _setBulanInput(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
    _onMentorOrBulanChange();
  }

  function _openBulanPicker() {
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

    const existing = document.getElementById('gaji-bulan-picker-popup');
    if (existing) { existing.remove(); return; }

    const popup = document.createElement('div');
    popup.id = 'gaji-bulan-picker-popup';
    popup.style.cssText = `position:fixed;z-index:9999;background:var(--bg-card);border:1px solid var(--border);
      border-radius:12px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,0.18);min-width:260px;`;

    const btn = document.getElementById('gaji-bulan-label');
    if (btn) {
      const r = btn.getBoundingClientRect();
      popup.style.top  = (r.bottom + 8) + 'px';
      popup.style.left = r.left + 'px';
    }

    const activeYm = _getBulanValue() || _defaultBulanValue();
    let selYear = parseInt(activeYm.split('-')[0], 10);

    const render = () => {
      popup.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <button id="gaji-picker-prev" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">‹</button>
          <strong style="color:var(--text-primary);font-size:1rem;">${selYear}</strong>
          <button id="gaji-picker-next" style="background:none;border:1px solid var(--border);border-radius:6px;padding:4px 10px;cursor:pointer;color:var(--text-primary);font-size:1rem;">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
          ${months.map((mn, i) => {
            const ym2    = selYear + '-' + String(i + 1).padStart(2, '0');
            const active = ym2 === activeYm;
            return `<button onclick="GajiPage._setBulanFromPicker('${ym2}')"
              style="padding:7px 4px;border-radius:8px;border:1px solid ${active ? 'var(--primary)' : 'var(--border)'};
                     background:${active ? 'var(--primary)' : 'var(--bg-surface)'};
                     color:${active ? '#fff' : 'var(--text-primary)'};font-size:0.82rem;cursor:pointer;font-weight:${active ? '700' : '400'};">
              ${mn}
            </button>`;
          }).join('')}
        </div>`;

      popup.querySelector('#gaji-picker-prev').addEventListener('click', (e) => { e.stopPropagation(); selYear--; render(); });
      popup.querySelector('#gaji-picker-next').addEventListener('click', (e) => { e.stopPropagation(); selYear++; render(); });
    };

    render();
    document.body.appendChild(popup);
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!popup.contains(e.target) && e.target.id !== 'gaji-bulan-label') {
          popup.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 100);
  }

  function _setBulanFromPicker(ym) {
    _setBulanInput(ym);
    _onMentorOrBulanChange();
    document.getElementById('gaji-bulan-picker-popup')?.remove();
  }

  function _syncBulanGaji() {}

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('gaji-tbody');
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
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data gaji...</td></tr>';

    try {
      const [gajiRes, mentorRes] = await Promise.all([API.gaji.getAll(), API.mentor.getAll()]);
      if (gajiRes.status === 'OK') {
        allData      = gajiRes.data || [];
        isFetched    = true;
        const sel    = document.getElementById('gaji-mentor');
        if (sel && sel.options.length <= 1) populateMentor(mentorRes.data || []);
        renderTable(allData);
      }
    } catch(e) {
      console.error('Error Load Gaji:', e);
      if (!allData.length) tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Gagal memuat data.</td></tr>';
    }
  }

  function search(term) {
    Pagination.reset('gaji');
    const filtered = allData.filter(g =>
      (g.nama_mentor||'').toLowerCase().includes(term.toLowerCase()) ||
      (g.bulan_gaji ||'').toLowerCase().includes(term.toLowerCase()) ||
      (g.id_trx    ||'').toLowerCase().includes(term.toLowerCase())
    );
    renderTable(filtered);
  }

  function populateMentor(mentors) {
    const sel = document.getElementById('gaji-mentor');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Pilih Mentor --</option>' +
      mentors.map(m => `<option value="${m.id}">${m.nama}</option>`).join('');
  }

  function _formatBulanGaji(raw) {
    if (!raw) return '-';
    try {
      const d = new Date(raw);
      if (!isNaN(d)) return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    } catch(e) {}
    return raw;
  }

  function renderTable(data) {
    Pagination.setData('gaji', data);
  }

  function renderRows(slice) {
    const role    = API.currentRole();
    const canEdit = role === 'ADMIN';

    const rows = slice.map(g => `
      <tr>
        <td style="width:32px;">
          ${Selection.checkbox('gaji', g.id_trx)}
        </td>

        <td>
          <span class="id-badge">
            ${UI.escape(g.id_trx)}
          </span>
        </td>

        <td>${UI.formatDate(g.tgl_bayar)}</td>

        <td>${_formatBulanGaji(g.bulan_gaji)}</td>

        <td>
          <strong>${UI.escape(g.nama_mentor)}</strong>
        </td>

        <td>${UI.formatCurrency(g.jumlah || 0)}</td>

        <td>
          <span class="program-tag">
            ${UI.escape(g.metode || '-')}
          </span>
        </td>

        <td>
          <div class="action-btns">
            ${canEdit ? `
              <button
                class="btn-icon btn-info"
                onclick="GajiPage.printSlipGaji('${g.id_trx}')"
                title="Cetak Slip Gaji"
              >
                <i data-lucide="printer"></i>
              </button>

              <button
                class="btn-icon btn-warning"
                onclick="GajiPage.openEdit('${g.id_trx}')"
              >
                <i data-lucide="pencil"></i>
              </button>

              <button
                class="btn-icon btn-danger"
                data-delete-id="${g.id_trx}"
                onclick="GajiPage.deleteGaji('${g.id_trx}','${(g.nama_mentor || '').replace(/'/g, "\\'")}')"
              >
                <i data-lucide="trash-2"></i>
              </button>
            ` : '-'}
          </div>
        </td>
      </tr>
    `);

    UI.renderTable(
      'gaji-tbody',
      rows,
      'Belum ada data gaji'
    );

    lucide.createIcons({
      nodes: [document.getElementById('gaji-tbody')]
    });
  }

  function openAdd() {
    clearForm();
    const title = document.getElementById('modal-gaji-title');
    if (title) title.textContent = 'Hitung & Bayar Gaji Mentor';
    document.getElementById('gaji-id-field').value = '';
    const mentorSel = document.getElementById('gaji-mentor');
    if (mentorSel) { mentorSel.value = ''; mentorSel.disabled = false; }

    const now = new Date();
    const bulanOtomatis = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    _setBulanInput(bulanOtomatis);
    document.getElementById('gaji-tgl').value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    _extraDays = [];
    _clearPreview();
    _renderExtraDays();
    document.getElementById('gaji-extra-day-input').value = '';
    _onExtraDayDateChange();  
    UI.openModal('modal-gaji');
  }

  function openEdit(id) {
    const g = allData.find(x => x.id_trx === id);
    if (!g) return;
    clearForm();
    document.getElementById('modal-gaji-title').textContent = 'Edit Catatan Gaji';
    document.getElementById('gaji-id-field').value          = g.id_trx;
    document.getElementById('gaji-mentor').value            = g.id_mentor;
    const bulanForInput = g.bulan_gaji && g.bulan_gaji.match(/^\d{2}-\d{4}$/)
      ? g.bulan_gaji.split('-').reverse().join('-')
      : g.bulan_gaji;
    _setBulanInput(bulanForInput);
    document.getElementById('gaji-tgl').value    = g.tgl_bayar;
    document.getElementById('gaji-metode').value = g.metode;
    const mentorSel = document.getElementById('gaji-mentor');
    if (mentorSel) mentorSel.disabled = true;
    const extraSection = document.getElementById('gaji-extra-days-section');
    if (extraSection) extraSection.style.display = 'none';
    UI.openModal('modal-gaji');
  }

  function clearForm() {
    const idField = document.getElementById('gaji-id-field');
    if (idField) idField.value = '';
    const mentorSel = document.getElementById('gaji-mentor');
    if (mentorSel) { mentorSel.value = ''; mentorSel.disabled = false; }
    const bulanInput = document.getElementById('gaji-bulan');
    if (bulanInput) {
      _setBulanInput(_defaultBulanValue());
    }
    const tglInput = document.getElementById('gaji-tgl');
    if (tglInput) tglInput.value = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
    const metodeInput = document.getElementById('gaji-metode');
    if (metodeInput) metodeInput.value = 'TRANSFER';
    _extraDays = [];
    _clearPreview();
    _renderExtraDays();
    document.getElementById('gaji-extra-day-input').value = '';
    _onExtraDayDateChange();
    const extraSection = document.getElementById('gaji-extra-days-section');
    if (extraSection) extraSection.style.display = '';
  }

  function _renderExtraDays() {
    const list = document.getElementById('gaji-extra-days-list');
    if (!list) return;

    if (!_extraDays.length) {
      list.innerHTML = `<div style="font-size:0.78rem;color:var(--text-secondary);padding:6px 0;">
        Belum ada hari tambahan
      </div>`;
    } else {
      list.innerHTML = _extraDays.map((d, i) => {
        const label   = new Date(d.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });
        const catatan = d.catatan ? `<div style="font-size:0.72rem;color:var(--text-secondary);margin-top:1px;">${UI.escape(d.catatan)}</div>` : '';
        const badge   = _lastSessionOnlyDays.includes(d.tanggal)
          ? `<span style="font-size:0.68rem;color:var(--warning,#f59e0b);margin-left:6px;">(sudah kehitung dari sesi)</span>`
          : '';
        return `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:0.82rem;">
            <div>
              <span>★ ${label}${badge}</span>
              ${catatan}
            </div>
            <button type="button"
              onclick="GajiPage._removeExtraDay(${i})"
              style="background:none;border:none;cursor:pointer;color:var(--danger,#ef4444);padding:2px 6px;font-size:0.85rem;flex-shrink:0;">
              ✕
            </button>
          </div>`;
      }).join('');
    }

    _onMentorOrBulanChange();
  }

  async function _addExtraDay() {
    const input        = document.getElementById('gaji-extra-day-input');
    const catatanInput = document.getElementById('gaji-extra-day-catatan');
    if (!input || !input.value) { UI.toast('Pilih tanggal dulu', 'error'); return; }
    const val     = input.value;
    const catatan = (catatanInput?.value || '').trim();

    if (!catatan) {
      UI.toast('Catatan kegiatan wajib diisi', 'error');
      catatanInput?.focus();
      return;
    }

    if (_extraDays.some(d => d.tanggal === val)) { UI.toast('Tanggal sudah ada di daftar', 'error'); return; }
    

    const bulanRaw = _getBulanValue();
    if (bulanRaw && !val.startsWith(bulanRaw)) {
      UI.toast('Tanggal harus dalam bulan yang dipilih', 'error'); return;
    }

    // Kalau tanggal ini kebetulan udah ada sesi presensi buat mentor ini,
    // nambahinnya gak akan nambah fee harian sama sekali — kasih tahu dulu.
    if (_lastSessionOnlyDays.includes(val)) {
      const lbl = new Date(val + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
      const ok = await UI.confirm(
        `<div style="font-size:0.875rem;line-height:1.6;">
          Tanggal <b>${lbl}</b> sudah ada sesi presensi untuk mentor ini.<br><br>
          Fee harian di hari itu <b>sudah otomatis terhitung</b> dari sesi tersebut — menambahkannya di sini
          <b>tidak akan menambah nominal gaji</b>.<br><br>
          Tetap tambahkan ke daftar (cuma buat catatan)?
        </div>`,
        { title: 'Tanggal Sudah Ada Sesi', okLabel: 'Tetap Tambahkan', okClass: 'btn btn-outline', icon: 'info' }
      );
      if (!ok) return;
    }

    _extraDays.push({ tanggal: val, catatan });
    _extraDays.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    input.value = '';
    if (catatanInput) catatanInput.value = '';
    _onExtraDayDateChange();
    _renderExtraDays();
  }

  function _removeExtraDay(idx) {
    _extraDays.splice(idx, 1);
    _renderExtraDays();
  }

    function _onExtraDayDateChange() {
    const input = document.getElementById('gaji-extra-day-input');
    const wrap  = document.getElementById('gaji-extra-day-catatan-wrap');
    if (!wrap) return;
    wrap.style.display = input?.value ? '' : 'none';
    if (!input?.value) {
      const catatanInput = document.getElementById('gaji-extra-day-catatan');
      if (catatanInput) catatanInput.value = '';
    }
  }

    function _setDuplicateWarning(html) {
    const warnBox = document.getElementById('gaji-duplicate-warning');
    if (!warnBox) return;
    if (!html) {
      warnBox.style.display = 'none';
      warnBox.innerHTML = '';
      return;
    }
    warnBox.style.display = 'block';
    warnBox.innerHTML = html;
    if (window.lucide) lucide.createIcons({ nodes: [warnBox] });
  }

  function _clearPreview() {
    _previewRequestId++;
    _previewLoading = false;
    _lastSessionOnlyDays = [];   // ← baru
    _renderBulanNav();
    _setDuplicateWarning(null);
    const box = document.getElementById('gaji-preview-box');
    const saveBtn = document.getElementById('gaji-save-btn');
    if (saveBtn) saveBtn.disabled = false;
    if (!box) return;
    box.innerHTML = `
      <span style="color:var(--text-secondary,#9ca3af);font-size:0.82rem;display:flex;align-items:center;gap:6px;">
        <i data-lucide="calculator" style="width:15px;height:15px;"></i>
        Pilih mentor dan bulan untuk melihat estimasi gaji
      </span>`;
    lucide.createIcons({ nodes: [box] });
  }

  let _previewTimeout = null;
  let _previewRequestId = 0;

  function _onMentorOrBulanChange() {
    clearTimeout(_previewTimeout);
    _previewLoading = true;
    _renderBulanNav();
    _previewTimeout = setTimeout(_fetchPreview, 500);
  }

    async function _fetchPreview() {
    const mentorSel  = document.getElementById('gaji-mentor');
    const bulanInput = document.getElementById('gaji-bulan');
    const id_mentor  = mentorSel?.value;
    const bulan_raw  = bulanInput?.value?.trim();
    const idField    = document.getElementById('gaji-id-field')?.value || '';
    const saveBtn    = document.getElementById('gaji-save-btn');
    const box        = document.getElementById('gaji-preview-box');

    if (!id_mentor || !bulan_raw) { _clearPreview(); return; }

    // Token buat guard race condition — tiap panggilan _fetchPreview dapat
    // id unik. Kalau ada request lain yang lebih baru selesai duluan (user
    // ganti bulan/mentor lagi sebelum response ini balik), response yang
    // telat ini di-ignore total, gak nyentuh DOM sama sekali.
    const requestId = ++_previewRequestId;

    const bulan_gaji = bulan_raw;

    // ── Cek duplikat — sekarang ditampilkan di box TERPISAH
    //    (#gaji-duplicate-warning) DI ATAS box perhitungan, bukan gantiin
    //    box perhitungan. Perhitungan tetap lanjut dihitung & ditampilkan
    //    di bawahnya, supaya admin tetap lihat rincian sesi walau
    //    gajinya udah tercatat.
    const duplikat = allData.find(g =>
      g.id_mentor === id_mentor && g.bulan_gaji === bulan_gaji && g.id_trx !== idField
    );
    if (duplikat) {
      const namaMentor = mentorSel.options[mentorSel.selectedIndex]?.text || id_mentor;
      const bulanLabel = _getMonthLabelID(bulan_gaji);
      _setDuplicateWarning(`
        <div style="display:flex;align-items:flex-start;gap:8px;padding:10px;border:1px solid var(--danger,#ef4444);border-radius:8px;background:color-mix(in srgb, var(--danger,#ef4444) 10%, transparent);">
          <i data-lucide="alert-triangle" style="width:18px;height:18px;flex-shrink:0;color:var(--danger,#ef4444);margin-top:1px;"></i>
          <div style="font-size:0.82rem;color:var(--danger,#ef4444);line-height:1.5;">
            <b>Sudah pernah dibayar!</b><br>
            Gaji ${UI.escape(namaMentor)} untuk ${bulanLabel} sudah tercatat (${UI.escape(duplikat.id_trx)}).
          </div>
        </div>`);
      if (saveBtn) saveBtn.disabled = true;
    } else {
      _setDuplicateWarning(null);
      if (saveBtn) saveBtn.disabled = false;
    }

    if (box) box.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--text-secondary);">
        <div class="spinner spinner-sm"></div> Menghitung estimasi gaji...
      </div>`;

    const res = await API.gaji.preview(id_mentor, bulan_gaji, _extraDays);

    // Guard utama: kalau selama nunggu response ini ada _fetchPreview lain
    // yang udah jalan duluan (requestId berubah), response ini basi —
    // stop di sini, jangan sentuh DOM.
    if (requestId !== _previewRequestId) return;
    _previewLoading = false;
    _renderBulanNav();

    if (!box) return;

    if (res.status !== 'OK') {
      _lastSessionOnlyDays = [];
      box.innerHTML = `
        <span style="color:var(--danger,#ef4444);font-size:0.82rem;display:flex;align-items:center;gap:6px;">
          <i data-lucide="alert-circle" style="width:15px;height:15px;"></i>
          ${UI.escape(res.message || 'Gagal menghitung gaji')}
        </span>`;
      lucide.createIcons({ nodes: [box] });
      return;
    }

    const d = res.data;
    _lastSessionOnlyDays = d.session_only_days || [];

    const extraDaysInBulan = d.extra_days || [];
    const totalUniqueDays  = d.unique_days || 0;

    const feeHarian       = d.fee_harian || 0;
    const subtotalHarian  = totalUniqueDays * feeHarian;
    const subtotalAnak    = d.subtotal_anak || 0;
    const grandTotal      = subtotalAnak + subtotalHarian;

    const hasData = d.total_sessions > 0 || totalUniqueDays > 0;

    const breakdownRows = (d.breakdown || []).map(b => `
      <span style="color:var(--text-secondary);">
        ${UI.escape(b.nama_program)}
        <span style="font-size:0.75rem;">(${b.jumlah_sesi} sesi &times; ${UI.formatCurrency(b.fee_anak)})</span>
      </span>
      <span style="text-align:right;font-family:var(--font-mono,monospace);">
        <b>${UI.formatCurrency(b.subtotal)}</b>
      </span>
    `).join('');

    const extraRows = extraDaysInBulan.length ? `
      <span style="color:var(--text-secondary);grid-column:1/-1;font-size:0.75rem;margin-top:4px;margin-bottom:2px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;">
        Hari tambahan (tanpa murid):
      </span>
      ${extraDaysInBulan.map(item => {
        const lbl = new Date(item.tanggal + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' });
        const catatanText = item.catatan ? ` — ${UI.escape(item.catatan)}` : '';
        return `<span style="color:var(--text-secondary);padding-left:8px;">★ ${lbl}${catatanText}</span><span></span>`;
      }).join('')}
    ` : '';

    box.innerHTML = hasData ? `
      <div style="width:100%;">
        <div style="font-size:0.7rem;font-weight:700;color:var(--text-secondary,#9ca3af);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;display:flex;align-items:center;gap:5px;">
          <i data-lucide="bar-chart-2" style="width:13px;height:13px;"></i> Estimasi Gaji &mdash; ${UI.escape(d.nama_mentor)}
        </div>
        <div style="display:grid;grid-template-columns:1fr auto;gap:4px 12px;font-size:0.82rem;margin-bottom:10px;">
          ${breakdownRows}
          ${extraRows}
          <span style="color:var(--text-secondary);">Fee harian (${totalUniqueDays} hari &times; ${UI.formatCurrency(feeHarian)})</span>
          <span style="text-align:right;font-family:var(--font-mono,monospace);">
            <b>${UI.formatCurrency(subtotalHarian)}</b>
          </span>
        </div>
        <div style="border-top:1px solid var(--border,#374151);padding-top:10px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;font-size:0.85rem;">Total Gaji</span>
          <span style="font-size:1.15rem;font-weight:700;color:var(--primary,#3b82f6);font-family:var(--font-mono,monospace);">
            ${UI.formatCurrency(grandTotal)}
          </span>
        </div>
      </div>` : `
      <span style="color:var(--warning,#f59e0b);font-size:0.82rem;display:flex;align-items:center;gap:6px;">
        <i data-lucide="info" style="width:15px;height:15px;"></i>
        Tidak ada sesi ditemukan untuk bulan ini
      </span>`;
    lucide.createIcons({ nodes: [box] });
  }

  async function saveForm() {
    const btn        = document.querySelector('#modal-gaji .btn-primary');
    const id         = document.getElementById('gaji-id-field').value;
    const mentorSel  = document.getElementById('gaji-mentor');
    const bulan_gaji = document.getElementById('gaji-bulan').value;
    const tgl_bayar  = document.getElementById('gaji-tgl').value;
    const metode     = document.getElementById('gaji-metode').value;

    if (!mentorSel.value || !bulan_gaji) { UI.toast('Mentor dan bulan gaji wajib diisi', 'error'); return; }

    const duplikat = allData.find(g =>
      g.id_mentor === mentorSel.value && g.bulan_gaji === bulan_gaji && g.id_trx !== id
    );
    if (duplikat) {
      const namaMentor = mentorSel.options[mentorSel.selectedIndex]?.text || mentorSel.value;
      const bulanLabel = new Date(bulan_gaji + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
      UI.toast(`Gaji ${namaMentor} untuk ${bulanLabel} sudah pernah dicatat (${duplikat.id_trx})`, 'error');
      return;
    }

    const payload = { id_mentor: mentorSel.value, bulan_gaji, tgl_bayar, metode, extra_days: _extraDays };

    if (!id) {
      const namaMentor = mentorSel.options[mentorSel.selectedIndex]?.text || mentorSel.value;
      const bulanLabel = new Date(bulan_gaji + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

      const extraInfo = _extraDays.length
        ? `<div style="margin-top:6px;color:var(--text-secondary,#6b7280);font-size:0.8rem;">
             ★ ${_extraDays.length} hari hadir tambahan (tanpa murid) akan dihitung.
           </div>`
        : '';

      const ok = await UI.confirm(
        `<div style="line-height:1.8;font-size:0.875rem;">
          <div><b>Mentor &nbsp;:</b> ${UI.escape(namaMentor)}</div>
          <div><b>Bulan &nbsp;&nbsp;:</b> ${bulanLabel}</div>
          <div><b>Tgl Bayar:</b> ${tgl_bayar || '-'}</div>
          <div><b>Metode &nbsp;:</b> ${metode}</div>
          <hr style="margin:10px 0;border-color:var(--border,#e5e7eb);">
          ${extraInfo}
          <div style="color:var(--text-secondary,#6b7280);font-size:0.8rem;margin-top:4px;">
            💡 Jumlah gaji dihitung otomatis dari data presensi bulan tersebut.
          </div>
        </div>`,
        { title: 'Konfirmasi Penggajian', okLabel: 'Ya, Simpan', okClass: 'btn btn-primary', icon: 'banknote' }
      );
      if (!ok) return;
    }

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Memproses...'; }
      const res = id ? await API.gaji.update({ id, ...payload }) : await API.gaji.record(payload);
      if (res.status === 'OK') {
        UI.toast(id ? 'Data gaji berhasil diperbarui' : 'Gaji berhasil dicatat!', 'success');
        UI.closeModal('modal-gaji');
        await load(true);
      } else { UI.toast(res.message || 'Gagal menyimpan data', 'error'); }
    } catch(e) { UI.toast('Terjadi kesalahan koneksi ke server', 'error'); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Simpan Penggajian'; } }
  }

  async function deleteGaji(id, nama) {
    const g = allData.find(x => x.id_trx === id);
    if (!await UI.confirmDelete(nama, 'catatan gaji')) return;

    lastDeletedData = g ? JSON.parse(JSON.stringify(g)) : null;
    lastAction      = 'DELETE';

    const btn             = document.querySelector(`button[data-delete-id="${id}"]`);
    const originalContent = btn ? btn.innerHTML : '';
    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div>'; btn.style.width = '40px'; }
      const res = await API.gaji.delete(id);
      if (res.status === 'OK') {
        UI.toast(`Catatan gaji "${nama}" berhasil dihapus. Klik Undo untuk membatalkan.`, 'warning');
        allData = allData.filter(x => x.id_trx !== id);
        renderTable(allData);
        const undoBtn = document.getElementById('gaji-undo-btn');
        if (undoBtn) undoBtn.disabled = false;
      } else {
        UI.toast(res.message || 'Gagal menghapus', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = originalContent; btn.style.width = ''; }
    }
  }

  async function undo() {
    if (!lastAction || !lastDeletedData) return;
    const undoBtn = document.getElementById('gaji-undo-btn');
    const redoBtn = document.getElementById('gaji-redo-btn');
    try {
      if (undoBtn) undoBtn.disabled = true;
      if (lastAction === 'DELETE') {
        const res = await API.gaji.record(lastDeletedData);
        if (res.status === 'OK') {
          UI.toast('Undo Berhasil: Catatan gaji dikembalikan!', 'success');
          lastRestoredId = res.data?.id || lastDeletedData.id_trx;
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
    const redoBtn = document.getElementById('gaji-redo-btn');
    try {
      if (redoBtn) redoBtn.disabled = true;
      const res = await API.gaji.delete(lastRestoredId);
      if (res.status === 'OK') {
        UI.toast('Redo Berhasil: Catatan gaji dihapus kembali!', 'success');
        lastAction     = 'DELETE';
        lastRestoredId = null;
        const undoBtn  = document.getElementById('gaji-undo-btn');
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
    if (!await UI.confirmDanger(`PERINGATAN! Akan menghapus SEMUA (${total}) catatan gaji.`, 'HAPUS SEMUA GAJI')) return;
    UI.toast('Sedang membersihkan database...', 'info');
    try {
      const res = await API.gaji.deleteAll();
      if (res.status === 'OK') {
        UI.toast('Seluruh catatan gaji berhasil dihapus!', 'success');
        load(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus semua data', 'error');
      }
    } catch(e) { UI.toast('Gagal menghapus semua data', 'error'); }
  }

  function deleteSelected()  { return Selection.deleteSelected('gaji'); }
  function _getCurrentData() { return allData; }

  async function printSlipGaji(id_trx) {
    const g = allData.find(x => x.id_trx === id_trx);
    if (!g) { UI.toast('Data gaji tidak ditemukan', 'error'); return; }

    const bulanForApi = g.bulan_gaji && g.bulan_gaji.match(/^\d{2}-\d{4}$/)
      ? g.bulan_gaji
      : g.bulan_gaji;

    const extraDaysDetail = g.extra_days_detail || [];

    UI.toast('Memuat detail slip gaji...', 'info');
    let salaryDetail = null;

    try {
      const res = await API.gaji.preview(
        g.id_mentor,
        bulanForApi,
        extraDaysDetail
      );

      if (res.status === 'OK') salaryDetail = res.data;
    } catch(e) {}

    const admin    = API.currentUser();
    const tglCetak = new Date().toLocaleDateString('id-ID', { dateStyle: 'long' });
    const fmtRp    = v => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
    const fmtTgl   = str => str
      ? new Date(str + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle: 'long' })
      : '-';

    const bulanLabel = _formatBulanGaji(g.bulan_gaji);

    let breakdownHTML  = '';
    let hariHadirHTML  = '';
    let totalSessions  = 0;
    let uniqueDays     = 0;
    let feeHarian      = 0;
    let subtotalAnak   = 0;
    let subtotalHarian = 0;

    if (salaryDetail) {
      totalSessions  = salaryDetail.total_sessions || 0;
      uniqueDays     = salaryDetail.unique_days || 0;
      feeHarian      = salaryDetail.fee_harian || 0;
      subtotalAnak   = salaryDetail.subtotal_anak || 0;
      subtotalHarian = salaryDetail.subtotal_harian || 0;

      breakdownHTML = (salaryDetail.breakdown || []).map(b => `
        <div class="slip-row">
          <span>Fee Murid — ${UI.escape(b.nama_program)}</span>
          <span class="slip-detail">${b.jumlah_sesi} sesi × ${fmtRp(b.fee_anak)}</span>
          <span class="slip-amount">${fmtRp(b.subtotal)}</span>
        </div>`).join('');

      hariHadirHTML = `
        <div class="slip-row">
          <span>Fee Kehadiran</span>
          <span class="slip-detail">${uniqueDays} hari × ${fmtRp(feeHarian)}</span>
          <span class="slip-amount">${fmtRp(subtotalHarian)}</span>
        </div>`;

      if (extraDaysDetail.length) {
        const extraList = extraDaysDetail.map(item => {
          const lbl = new Date(item.tanggal + 'T00:00:00')
            .toLocaleDateString('id-ID', {
              weekday: 'long',
              day: '2-digit',
              month: 'short'
            });

          const catatanHTML = item.catatan
            ? ` — <span style="color:#4b5563;">${UI.escape(item.catatan)}</span>`
            : '';

          return `<li>★ ${lbl} <em style="color:#9ca3af;">(tanpa murid)</em>${catatanHTML}</li>`;
        }).join('');

        hariHadirHTML += `
          <div style="margin:6px 0 4px 0;font-size:9px;color:#6b7280;">
            <ul style="margin:0;padding-left:16px;line-height:1.8;">
              ${extraList}
            </ul>
          </div>`;
      }

    } else {
      breakdownHTML = `<div class="slip-row"><span>Rincian tidak tersedia</span><span></span><span class="slip-amount">${fmtRp(g.jumlah)}</span></div>`;
    }

    const logoHTML = `
      <div style="
        width:54px; height:54px;
        background:linear-gradient(135deg,#1a3a6e,#3d6abf);
        border-radius:12px;
        display:flex; align-items:center; justify-content:center;
        font-size:18px; font-weight:800; color:#fff;
        letter-spacing:-1px; flex-shrink:0;
      ">EH</div>`;

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Slip Gaji - ${UI.escape(g.nama_mentor)} - ${bulanLabel}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#1f2937; background:#f1f4f9; }

  .page {
    max-width: 720px;
    margin: 24px auto;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(0,0,0,.12);
  }

  .header {
    background: linear-gradient(135deg,#064e3b 0%,#065f46 60%,#047857 100%);
    padding: 24px 28px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
    overflow: hidden;
  }
  .header::after {
    content:'';
    position:absolute; top:-40px; right:-40px;
    width:160px; height:160px;
    background:rgba(255,255,255,.06);
    border-radius:50%;
  }
  .header-left { display:flex; align-items:center; gap:14px; position:relative; z-index:1; }
  .header-text h1 { font-size:18px; font-weight:800; color:#fff; letter-spacing:-.3px; }
  .header-text p  { font-size:10px; color:rgba(255,255,255,.75); margin-top:3px; }
  .header-right   { text-align:right; position:relative; z-index:1; }
  .nota-badge {
    background:rgba(255,255,255,.18);
    border:1px solid rgba(255,255,255,.3);
    border-radius:20px;
    padding:4px 14px;
    font-size:10px; font-weight:700;
    color:#fff; letter-spacing:.06em;
    text-transform:uppercase;
    margin-bottom:6px; display:inline-block;
  }
  .header-right p { font-size:9.5px; color:rgba(255,255,255,.75); line-height:1.8; }
  .header-stripe {
    height:4px;
    background:linear-gradient(90deg,#f59e0b,#fbbf24 40%,#34d399);
  }

  .body { padding:24px 28px; }

  .mentor-card {
    background:linear-gradient(135deg,#ecfdf5,#d1fae5);
    border:1px solid #a7f3d0;
    border-radius:10px;
    padding:16px 20px;
    margin-bottom:18px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:12px;
  }
  .mentor-card-left h2 { font-size:15px; font-weight:700; color:#064e3b; margin-bottom:4px; }
  .mentor-card-left p  { font-size:10px; color:#4b5563; }
  .bulan-pill {
    background:linear-gradient(135deg,#064e3b,#047857);
    color:#fff; font-size:10px; font-weight:700;
    padding:5px 14px; border-radius:20px;
    white-space:nowrap;
  }

  .info-grid {
    display:grid; grid-template-columns:1fr 1fr 1fr;
    gap:10px; margin-bottom:18px;
  }
  .info-box {
    background:#f8fafc; border:1px solid #e5e7eb;
    border-radius:8px; padding:12px 14px;
  }
  .info-box-label { font-size:8.5px; text-transform:uppercase; letter-spacing:.07em; color:#6b7280; font-weight:600; margin-bottom:5px; }
  .info-box-value { font-size:12px; font-weight:700; color:#1f2937; }

  .section-title { font-size:10px; font-weight:700; color:#064e3b; text-transform:uppercase; letter-spacing:.07em; margin-bottom:10px; padding-bottom:6px; border-bottom:2px solid #d1fae5; }

  .slip-section { margin-bottom:18px; }
  .slip-row {
    display:grid;
    grid-template-columns:1fr auto auto;
    gap:8px;
    align-items:center;
    padding:7px 0;
    border-bottom:1px solid #f3f4f6;
    font-size:10.5px;
    color:#374151;
  }
  .slip-row:last-child { border-bottom:none; }
  .slip-detail { color:#6b7280; font-size:9.5px; text-align:right; }
  .slip-amount { font-weight:700; text-align:right; min-width:90px; font-family:'Courier New',monospace; }

  .slip-subtotal {
    display:flex; justify-content:space-between;
    padding:8px 0; font-size:10.5px; color:#374151;
    border-bottom:1px dashed #e5e7eb;
  }
  .slip-total {
    display:flex; justify-content:space-between; align-items:center;
    padding:12px 0 6px;
    font-size:13px; font-weight:800; color:#064e3b;
    border-top:2px solid #064e3b; margin-top:4px;
  }
  .slip-total-amount {
    font-size:16px; font-weight:800; color:#047857;
    font-family:'Courier New',monospace;
  }

  .footer-nota {
    margin-top:20px;
    display:flex; justify-content:space-between;
    align-items:flex-end; gap:20px;
  }
  .ttd-box { text-align:center; flex:1; }
  .ttd-box p  { font-size:9.5px; color:#4b5563; margin-bottom:48px; }
  .ttd-box .ttd-name { font-size:10px; font-weight:700; border-top:1px solid #6b7280; padding-top:6px; display:inline-block; min-width:120px; }
  .note-box {
    flex:1; background:#f0fdf4; border:1px solid #bbf7d0;
    border-radius:8px; padding:12px 14px; font-size:9.5px; color:#14532d; line-height:1.6;
  }
  .note-box strong { display:block; margin-bottom:4px; color:#052e16; }

  .footer-bar {
    margin-top:20px; padding:12px 28px;
    background:#f8fafc; border-top:1px solid #e5e7eb;
    text-align:center; font-size:8.5px; color:#9ca3af;
  }

  @media print {
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      color-adjust: exact !important;
    }
    body { background:#fff; }
    .page { margin:0; box-shadow:none; border-radius:0; }
    @page { size:A5 portrait; margin:6mm; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      ${logoHTML}
      <div class="header-text">
        <h1>EduHome</h1>
        <p>Sistem Manajemen Bimbingan Belajar</p>
      </div>
    </div>
    <div class="header-right">
      <div class="nota-badge">Slip Gaji</div>
      <p>No: ${UI.escape(g.id_trx)}<br>Dicetak: ${tglCetak}</p>
    </div>
  </div>
  <div class="header-stripe"></div>

  <div class="body">

    <!-- Info Mentor -->
    <div class="mentor-card">
      <div class="mentor-card-left">
        <h2>${UI.escape(g.nama_mentor)}</h2>
        <p>ID Mentor: ${UI.escape(g.id_mentor || '-')} &nbsp;·&nbsp; ID Transaksi: ${UI.escape(g.id_trx)}</p>
      </div>
      <div class="bulan-pill">${bulanLabel}</div>
    </div>

    <!-- Info Grid -->
    <div class="info-grid">
      <div class="info-box">
        <div class="info-box-label">Tanggal Bayar</div>
        <div class="info-box-value">${fmtTgl(g.tgl_bayar)}</div>
      </div>
      <div class="info-box">
        <div class="info-box-label">Metode</div>
        <div class="info-box-value">${UI.escape(g.metode || '-')}</div>
      </div>
      <div class="info-box">
        <div class="info-box-label">Total Sesi Mengajar</div>
        <div class="info-box-value">${totalSessions} sesi (${uniqueDays} hari)</div>
      </div>
    </div>

    <!-- Rincian Gaji -->
    <div class="slip-section">
      <div class="section-title">Rincian Gaji</div>

      ${breakdownHTML}

      <div style="height:6px;"></div>
      ${hariHadirHTML}

      <div class="slip-total">
        <span>Total Gaji Diterima</span>
        <span class="slip-total-amount">${fmtRp(g.jumlah)}</span>
      </div>
    </div>

    <!-- Footer nota -->
    <div class="footer-nota">
      <div class="note-box">
        <strong>Catatan:</strong>
        Slip ini adalah bukti pembayaran gaji mentor EduHome Bimbel bulan ${bulanLabel}.
        Harap simpan sebagai bukti yang sah.
      </div>
      <div class="ttd-box">
        <p>Dibayarkan oleh,</p>
        <div class="ttd-name">${UI.escape(admin.username || 'Admin')}</div>
      </div>
    </div>

  </div>

  <div class="footer-bar">
    EduHome Bimbel &nbsp;·&nbsp; Slip Gaji ${UI.escape(g.id_trx)} &nbsp;·&nbsp; Dicetak ${tglCetak}
  </div>
</div>
<script>window.onload = () => { window.focus(); window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=800,height=700');
    if (!win) { UI.toast('Popup diblokir browser. Izinkan popup untuk mencetak slip.', 'error'); return; }
    win.document.write(html);
    win.document.close();
  }

  function exportExcel() {
    const headers = ['ID Transaksi', 'Nama Mentor', 'Bulan Gaji', 'Tgl Bayar', 'Jumlah', 'Metode'];
    const rows    = allData.map(g => [g.id_trx, g.nama_mentor, _formatBulanGaji(g.bulan_gaji), UI.formatDate(g.tgl_bayar), g.jumlah || 0, g.metode || '-']);
    UI.exportExcel(headers, rows, 'Data_Gaji', 'Gaji Mentor');
  }

  function exportPDF() {
    const headers = ['ID Transaksi', 'Nama Mentor', 'Bulan Gaji', 'Tgl Bayar', 'Jumlah', 'Metode'];
    const rows    = allData.map(g => [g.id_trx, g.nama_mentor, _formatBulanGaji(g.bulan_gaji), UI.formatDate(g.tgl_bayar), UI.formatCurrency(g.jumlah || 0), g.metode || '-']);
    UI.exportPDF('Data Penggajian Mentor', headers, rows, {subtitle: 'Riwayat pembayaran gaji mentor'});
  }

  let _currentSort = { col: 'tgl_bayar', asc: false };
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
    load, search, saveForm, openAdd, openEdit, deleteGaji, clearForm,
    undo, redo, deleteAll, deleteSelected, renderTable, renderRows,
    _getCurrentData, sortBy, _syncBulanGaji, _onMentorOrBulanChange,
    printSlipGaji,
    _addExtraDay, _removeExtraDay, _onExtraDayDateChange,
    _prevBulan, _nextBulan, _openBulanPicker, _setBulanFromPicker,
    exportExcel, exportPDF
  };

})();

window.GajiPage = GajiPage;