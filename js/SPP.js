const SPPPage = (() => {
  let allData         = [];
  let filteredData    = [];
  let isFetched       = false;
  let lastDeletedData = null;
  let lastAction      = null;
  let lastRestoredId  = null;
  let lastAddedId     = null;

  async function load(forceRefresh = false) {
    const tbody = document.getElementById('spp-tbody');
    if (!tbody) return;

    if (forceRefresh) {
      // Jangan reset lastAction/lastAddedId/lastDeletedData di sini —
      // undo/redo harus tetap bisa dipakai setelah tabel di-refresh.
      // State di-reset hanya saat aksi baru dimulai (lihat deleteSPP, saveForm).
    }

    if (!forceRefresh && isFetched) {
      renderTable(allData);
      initLiveCount();
      return;
    }

    tbody.innerHTML = '<tr><td colspan="13" class="empty-row"><div class="spinner spinner-sm"></div> Memuat data paket SPP...</td></tr>';

    try {
      const [sppRes, muridRes] = await Promise.all([API.spp.getAll(), API.murid.getAll()]);
      if (sppRes.status === 'OK') {
        allData      = (sppRes.data || []).sort((a, b) => a.id.localeCompare(b.id));
        isFetched    = true;
        const sel    = document.getElementById('spp-murid');
        if (sel && sel.options.length <= 1) populateMurid(muridRes.data || []);
        renderTable(allData);
        setTimeout(() => checkSPPWarning(), 300);
      }
    } catch(e) {
      console.error('Gagal load SPP:', e);
      tbody.innerHTML = '<tr><td colspan="13" class="empty-row">Gagal memuat data paket SPP.</td></tr>';
    }
    initLiveCount();
  }

  function search(term) {
  Pagination.reset('spp');
    const filtered = allData.filter(s =>
      (s.nama_murid || '').toLowerCase().includes(term.toLowerCase()) ||
      (s.program    || '').toLowerCase().includes(term.toLowerCase()) ||
      (s.id         || '').toLowerCase().includes(term.toLowerCase())
    );
    renderTable(filtered);
  }

  function initLiveCount() {
    ['spp-mulai', 'spp-akhir'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.removeEventListener('change', calculateLiveSessions);
        el.addEventListener('change', calculateLiveSessions);
      }
    });
  }

  function _onMuridChange(e) {
    // Paket baru SELALU siklus 12-sesi — jangan jalanin logic periode manual
    // peninggalan SPP LAMA ini kecuali lagi edit paket LAMA yang sudah ada.
    const idField = document.getElementById('spp-id-field');
    if (!idField || !idField.value) return;
    autoFillNextPeriod(e.target.value);
  }

  // Tampilin peringatan kalau murid yang dipilih (mode buat paket baru)
  // masih punya paket BARU berstatus AKTIF — backend bakal nolak create-nya,
  // jadi kasih tau di form SEBELUM admin sempat isi tanggal/harga & submit.
  function _checkAktifWarning(idMurid) {
    const warnEl = document.getElementById('spp-aktif-warning');
    const saveBtn = document.getElementById('spp-save-btn');
    if (!warnEl) return;
    if (!idMurid) { warnEl.style.display = 'none'; if (saveBtn) saveBtn.disabled = false; return; }
    const aktif = allData.find(p =>
      p.id_murid === idMurid &&
      p.jenis_siklus === 'BARU' &&
      String(p.status).toUpperCase() === 'AKTIF'
    );
    if (aktif) {
      warnEl.style.display = '';
      warnEl.innerHTML = `⚠️ Murid ini masih punya paket aktif <strong>${UI.escape(aktif.id)}</strong> (sisa ${aktif.sisa_pertemuan ?? '-'} dari 12 sesi) — selesaikan siklus itu dulu sebelum bisa buat paket baru.`;
      if (saveBtn) saveBtn.disabled = true;
    } else {
      warnEl.style.display = 'none';
      if (saveBtn) saveBtn.disabled = false;
    }
  }

    async function calculateLiveSessions() {
    const akhirGroup = document.getElementById('spp-akhir-group');
    if (akhirGroup && akhirGroup.style.display === 'none') return;
    const id_murid = document.getElementById('spp-murid').value;
    const mulai    = document.getElementById('spp-mulai').value;
    const akhir    = document.getElementById('spp-akhir').value;
    const display  = document.getElementById('spp-count-preview');
    if (!id_murid || !mulai || !akhir || !display) return;
    display.innerHTML = '<div class="spinner-sm"></div> Menghitung...';
    try {
      const res     = await API.jadwal.getByMurid(id_murid);
      const hariLes = (res.data || []).map(j => j.hari.trim().toLowerCase());
      if (!hariLes.length) { display.textContent = 'Total: 0 Sesi (Jadwal kosong)'; return; }
      const dayMap     = { minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6 };
      const targetDays = hariLes.map(h => dayMap[h]);
      const startDate  = new Date(mulai.replace(/-/g, '\/'));
      const endDate    = new Date(akhir.replace(/-/g, '\/'));
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(0, 0, 0, 0);
      let count = 0, cur = new Date(startDate);
      while (cur <= endDate) { if (targetDays.includes(cur.getDay())) count++; cur.setDate(cur.getDate() + 1); }
      display.innerHTML = `Total: <strong>${count}</strong> Sesi`;
    } catch(e) { display.textContent = 'Gagal menghitung'; }
  }

  function populateMurid(murid) {
    const items = murid
      .filter(m => String(m.status).trim().toUpperCase() === 'AKTIF')
      .map(m => ({
        value: m.id,
        label: m.nama,
        badge: m.program,
        extra: { nama: m.nama, program: m.program }
      }));
    SD.populate('spp-murid', items);

    // Pasang listener change pada hidden <select> agar initLiveCount tetap jalan
    const sel = document.getElementById('spp-murid');
    if (sel && !sel._sppListenerAttached) {
      sel.addEventListener('change', e => {
        const idField = document.getElementById('spp-id-field');
        if (!idField || !idField.value) {
          // Mode buat paket baru: selalu siklus 12-sesi, jangan hitung ulang
          // pakai logic lama (LAMA) yang basis-nya jadwal hari — tapi tetap
          // cek & tampilin kalau muridnya masih punya paket aktif berjalan.
          _checkAktifWarning(e.target.value);
          return;
        }
        calculateLiveSessions();
        _onMuridChange(e);
      });
      sel._sppListenerAttached = true;
    }
  }

  function renderTable(data) {
  Pagination.setData('spp', data);
  }

  function renderRows(slice) {
  const role    = API.currentRole();
  const canEdit = role === 'ADMIN';

  const rows = slice.map(s => `
    <tr>
      <td style="width:32px;">
        ${Selection.checkbox('spp', s.id)}
      </td>

      <td>
        <span class="id-badge">
          ${UI.escape(s.id)}
        </span>
      </td>

      <td>
        <strong>${UI.escape(s.nama_murid)}</strong>
      </td>

      <td>
        <span class="program-tag">
          ${UI.escape(s.program)}
        </span>
      </td>

      <td>${UI.formatDate(s.periode_mulai)} – ${s.periode_akhir ? UI.formatDate(s.periode_akhir) : 'Siklus berjalan'}</td>

      <td>${s.total_pertemuan ?? '-'}</td>

      <td>${s.hadir ?? 0} / ${s.sisa_pertemuan ?? '-'}</td>

      <td>
        ${(() => {
          const total = s.total_pertemuan || 0;
          const hadir = s.hadir          || 0;
          const pct   = total > 0 ? Math.round((hadir / total) * 100) : 0;
          return `<div style="display:flex;align-items:center;gap:6px;">
            <div style="flex:1;height:6px;background:var(--border);border-radius:99px;min-width:60px;">
              <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:99px;"></div>
            </div>
            <span style="font-size:0.72rem;color:var(--text-secondary);white-space:nowrap;">${pct}%</span>
          </div>`;
        })()}
      </td>

      <td>
        ${UI.statusBadge(s.status || 'AKTIF')}
      </td>

      <td>${UI.formatCurrency(s.harga)}</td>

      <td>${UI.formatCurrency(s.terbayar || 0)}</td>

      <td>
        ${UI.statusBadge(s.status_bayar || 'UNPAID')}
      </td>

      <td>
        <div class="action-btns">
          ${canEdit ? `
            <button
              class="btn-icon btn-info"
              onclick="SPPPage.printNota('${s.id}')"
              title="Cetak Nota"
            >
              <i data-lucide="printer"></i>
            </button>

            <button
              class="btn-icon btn-warning"
              onclick="SPPPage.openEdit('${s.id}')"
            >
              <i data-lucide="pencil"></i>
            </button>

            <button
              class="btn-icon btn-danger"
              onclick="SPPPage.deleteSPP('${s.id}')"
            >
              <i data-lucide="trash-2"></i>
            </button>
          ` : `
            <button
              class="btn-icon btn-info"
              onclick="SPPPage.printNota('${s.id}')"
              title="Cetak Nota"
            >
              <i data-lucide="printer"></i>
            </button>
          `}
        </div>
      </td>
    </tr>
  `);

  UI.renderTable(
    'spp-tbody',
    rows,
    'Belum ada data paket SPP'
  );

  lucide.createIcons({
    nodes: [document.getElementById('spp-tbody')]
  });
}

function _setModalMode(mode, s) {
  // mode: 'create' | 'edit-baru' | 'edit-lama'
  const isCreate = mode === 'create';
  const isBaru   = mode === 'edit-baru';
  const mulaiEl  = document.getElementById('spp-mulai');
  const akhirEl  = document.getElementById('spp-akhir');
  const sdWrap   = document.querySelector('#modal-spp .sd-wrap');
  const saveBtn  = document.getElementById('spp-save-btn');

  document.getElementById('spp-modal-title').textContent = isCreate ? 'Buat Paket SPP' : 'Edit Paket SPP';
  if (saveBtn) {
    saveBtn.innerHTML = `<i data-lucide="save"></i> ${isCreate ? 'Buat Paket' : 'Simpan Perubahan'}`;
    lucide.createIcons({ nodes: [saveBtn] });
  }
  if (sdWrap) sdWrap.style.pointerEvents = isCreate ? '' : 'none';
  if (mulaiEl) mulaiEl.disabled = false;
  document.getElementById('spp-akhir-group').style.display = (isCreate || isBaru) ? 'none' : '';
  if (akhirEl) akhirEl.disabled = false;
}

  function openAdd() {
    document.getElementById('spp-id-field').value = '';
    SD.clear('spp-murid');
    document.getElementById('spp-mulai').value = '';
    // Paket baru SELALU siklus 12-sesi (jenis_siklus=BARU) — periode_akhir
    // TIDAK diisi manual, sistem yang mengisi otomatis begitu 12/12 resolved.
    const akhirEl = document.getElementById('spp-akhir');
    if (akhirEl) akhirEl.value = '';
    document.getElementById('spp-harga').value = '';
    const display = document.getElementById('spp-count-preview');
    if (display) display.innerHTML = 'Total: <strong>12</strong> Sesi (siklus otomatis)';
    const hint = document.getElementById('spp-period-hint');
    if (hint) hint.innerHTML = '<span style="font-size:0.78rem;color:var(--text-secondary);">Periode akhir terisi otomatis setelah 12 sesi selesai.</span>';
    // Reset state navigasi periode — navigasi bulan tidak berlaku lagi utk siklus 12-sesi
    _periodOffset = 0;
    _periodAnchor = null;
    // Reset banner peringatan paket aktif (kalau ada sisa dari sesi sebelumnya)
    _checkAktifWarning('');
    _setModalMode('create');
    UI.openModal('modal-spp');
  }

  async function openEdit(id) {
    document.getElementById('spp-modal-title').textContent = 'Edit Paket SPP';
    UI.openModal('modal-spp');
    // Banner ini cuma relevan di mode create — pastikan bersih & save button aktif
    const warnEl = document.getElementById('spp-aktif-warning');
    if (warnEl) warnEl.style.display = 'none';
    const saveBtn = document.getElementById('spp-save-btn');
    if (saveBtn) saveBtn.disabled = false;
    const muridSel = document.getElementById('spp-murid');
    if (!allData.length || (muridSel && muridSel.options.length <= 1)) {
      const display = document.getElementById('spp-count-preview');
      if (display) display.innerHTML = '<span class="spinner"></span> Sinkronisasi data...';
      await load(true);
    }
    const s = allData.find(x => x.id === id);
    if (!s) { UI.toast('Data paket tidak ditemukan', 'error'); UI.closeModal('modal-spp'); return; }
    document.getElementById('spp-id-field').value = s.id;

    const isBaru = s.jenis_siklus === 'BARU';
    // Atur tampilan & kunci field sesuai mode (murid, periode, label tombol)
    _setModalMode(isBaru ? 'edit-baru' : 'edit-lama', s);

    SD.setValue('spp-murid', s.id_murid);
    document.getElementById('spp-mulai').value = s.periode_mulai;
    const akhirEl = document.getElementById('spp-akhir');
    if (akhirEl) akhirEl.value = s.periode_akhir || '';
    document.getElementById('spp-harga').value = s.harga;

    const display = document.getElementById('spp-count-preview');
    if (isBaru) {
      if (display) display.innerHTML = `Total: <strong>12</strong> Sesi — <strong>${s.hadir ?? 0}</strong> resolved, <strong>${s.sisa_pertemuan ?? 12}</strong> sisa`;
      const hint = document.getElementById('spp-period-hint');
      if (hint) hint.innerHTML = '<span style="font-size:0.78rem;color:var(--text-secondary);">Siklus 12-sesi — periode & jumlah sesi dikelola otomatis oleh sistem.</span>';
    } else {
      setTimeout(() => calculateLiveSessions(), 50);
    }
  }

  // Tambah N bulan ke date dengan clamp ke hari terakhir bulan tujuan
  // (fix overflow: 31 Jan + 1 bln → 28/29 Feb, bukan 2/3 Mar)
  function _addMonthClamped(date, months) {
    const rawMonth   = date.getMonth() + months;
    const targetYear = date.getFullYear() + Math.floor(rawMonth / 12);
    const normMonth  = ((rawMonth % 12) + 12) % 12;
    const lastDay    = new Date(targetYear, normMonth + 1, 0).getDate();
    return new Date(targetYear, normMonth, Math.min(date.getDate(), lastDay));
  }

  // Terapkan offset dari anchor ke field periode + hitung sesi
  // existingPaket: array paket murid yang sudah ada (untuk deteksi overlap di navigasi)
  function _applyPeriodOffset(existingPaket) {
    if (!_periodAnchor) return;

    const anchorMulai = new Date(_periodAnchor.mulai + 'T00:00:00');
    // Mulai = anchor + offset bulan (dengan clamp hari)
    const mulaiDate   = _addMonthClamped(anchorMulai, _periodOffset);
    // Akhir = mulai + 1 bulan (clamp) - 1 hari
    const akhirPlus   = _addMonthClamped(mulaiDate, 1);
    const akhirDate   = new Date(akhirPlus);
    akhirDate.setDate(akhirDate.getDate() - 1);

    document.getElementById('spp-mulai').value = _toInput(mulaiDate);
    document.getElementById('spp-akhir').value = _toInput(akhirDate);

    // Cek apakah periode ini overlap dengan paket yang sudah ada
    const mulaiNew = mulaiDate;
    const akhirNew = akhirDate;
    let isOverlap  = false;
    if (existingPaket && existingPaket.length) {
      for (const p of existingPaket) {
        const s = new Date(p.periode_mulai + 'T00:00:00');
        const e = new Date(p.periode_akhir + 'T00:00:00');
        if (mulaiNew <= e && akhirNew >= s) { isOverlap = true; break; }
      }
    }

    // Update hint + tombol navigasi
    const fmt  = str => new Date(str + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    const hint = document.getElementById('spp-period-hint');
    if (hint) {
      const mulaiStr = _toInput(mulaiDate);
      const akhirStr = _toInput(akhirDate);
      let label;
      if (_periodOffset === 0)    label = '↻ Lanjut dari paket sebelumnya';
      else if (_periodOffset < 0) label = `↩ Mundur ${Math.abs(_periodOffset)} bulan`;
      else                        label = `↪ Maju ${_periodOffset} bulan`;

      const overlapWarning = isOverlap
        ? `<span style="color:var(--danger,#ef4444);font-size:0.78rem;display:block;margin-top:4px;">
             ⚠️ Periode ini sudah ada paket — geser lagi atau ubah manual
           </span>`
        : '';

      hint.innerHTML = `
        <div style="margin-top:6px;">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;">
            <button type="button" onclick="SPPPage.shiftPeriod(-1)"
              style="flex-shrink:0;padding:3px 10px;border-radius:6px;border:1px solid var(--border);
                     background:var(--bg-card);color:var(--text-primary);cursor:pointer;font-size:0.8rem;">
              ← Mundur
            </button>
            <span style="flex:1;min-width:0;font-size:0.82rem;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${isOverlap ? 'var(--danger,#ef4444)' : 'var(--text-secondary)'};">
              ${label}: <strong>${fmt(mulaiStr)} – ${fmt(akhirStr)}</strong>
            </span>
            <button type="button" onclick="SPPPage.shiftPeriod(+1)"
              style="flex-shrink:0;padding:3px 10px;border-radius:6px;border:1px solid var(--border);
                     background:var(--bg-card);color:var(--text-primary);cursor:pointer;font-size:0.8rem;">
              Maju →
            </button>
          </div>
          ${overlapWarning}
        </div>`;
    }

    calculateLiveSessions();
  }

  // Geser offset +1 (maju) atau -1 (mundur) lalu re-apply
  function shiftPeriod(delta) {
    _periodOffset += delta;
    // Ambil paket murid yang ada untuk cek overlap di hint
    const muridId      = document.getElementById('spp-murid')?.value;
    const existingPaket = muridId
      ? allData.filter(p => p.id_murid === muridId)
      : [];
    _applyPeriodOffset(existingPaket);
  }

  async function autoFillNextPeriod(idMurid) {
    if (!idMurid) return;

    const hint = document.getElementById('spp-period-hint');

    // Cari paket terakhir murid ini (urutkan descending by periode_akhir)
    const paketMurid = allData
      .filter(p => p.id_murid === idMurid)
      .sort((a, b) => b.periode_akhir.localeCompare(a.periode_akhir));

    if (!paketMurid.length) {
      if (hint) hint.textContent = '';
      _periodAnchor = null;
      _periodOffset = 0;
      return;
    }

    const last = paketMurid[0];

    // Anchor = mulai baru default (akhir lama + 1 hari)
    const anchorMulai = new Date(last.periode_akhir + 'T00:00:00');
    anchorMulai.setDate(anchorMulai.getDate() + 1);
    // anchorAkhir hanya untuk referensi, _applyPeriodOffset yang hitung ulang
    const anchorAkhirPlus = _addMonthClamped(anchorMulai, 1);
    const anchorAkhir     = new Date(anchorAkhirPlus);
    anchorAkhir.setDate(anchorAkhir.getDate() - 1);

    _periodAnchor = { mulai: _toInput(anchorMulai), akhir: _toInput(anchorAkhir) };
    _periodOffset = 0; // reset ke default "berikutnya"

    _applyPeriodOffset(paketMurid);
  }

  async function saveForm() {
    const id       = document.getElementById('spp-id-field').value;
    const btn      = document.getElementById('spp-save-btn');
    const muridSel = document.getElementById('spp-murid');
    const mulai    = document.getElementById('spp-mulai').value;
    const akhirEl  = document.getElementById('spp-akhir');
    const akhir    = akhirEl ? akhirEl.value : '';
    const harga    = parseFloat(document.getElementById('spp-harga').value) || 0;

    // Existing record (untuk edit) — dipakai menentukan apakah ini siklus BARU.
    const existing   = id ? allData.find(x => x.id === id) : null;
    const isBaruEdit = existing && existing.jenis_siklus === 'BARU';
    // Create baru SELALU jadi siklus 12-sesi (jenis_siklus=BARU) di backend.
    const isBaruCreate = !id;

    if (!muridSel.value || !mulai) { UI.toast('Murid dan tanggal mulai wajib diisi', 'error'); return; }
    if (!isBaruCreate && !isBaruEdit && !akhir) { UI.toast('Semua field wajib diisi', 'error'); return; }
    if (!isBaruCreate && !isBaruEdit && new Date(mulai + 'T00:00:00') > new Date(akhir + 'T00:00:00')) {
      UI.toast('Periode akhir harus sama atau setelah periode mulai', 'error'); return;
    }

    const selectedOption = muridSel.options[muridSel.selectedIndex];

    let payload;
    if (isBaruCreate) {
      payload = {
        id_murid: muridSel.value,
        nama_murid: selectedOption?.dataset?.nama || '',
        program: selectedOption?.dataset?.program || '',
        periode_mulai: mulai,
        harga
      };
    } else if (isBaruEdit) {
      payload = { id, harga, periode_mulai: mulai };
    } else {
      // Edit paket LAMA — behavior existing dipertahankan utuh.
      payload = {
        id,
        id_murid: muridSel.value,
        nama_murid: selectedOption?.dataset?.nama || '',
        program: selectedOption?.dataset?.program || '',
        periode_mulai: mulai,
        periode_akhir: akhir,
        harga
      };

      const paketMurid = allData.filter(p =>
        p.id_murid === muridSel.value &&
        p.id !== id
      );
      for (const p of paketMurid) {
        if (!p.periode_akhir) continue; // paket BARU yang masih berjalan — skip, tidak relevan utk overlap tanggal
        const s        = new Date(p.periode_mulai + 'T00:00:00');
        const e        = new Date(p.periode_akhir + 'T00:00:00');
        const mulaiNew = new Date(mulai + 'T00:00:00');
        const akhirNew = new Date(akhir + 'T00:00:00');
        // Tumpang tindih nyata (bersebelahan sudah otomatis aman: mulaiNew > e)
        if (mulaiNew <= e && akhirNew >= s) {
          const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
          UI.toast(`Periode tumpang tindih dengan paket ${p.id} (${fmt(p.periode_mulai)} – ${fmt(p.periode_akhir)}).`, 'error');
          return;
        }
      }
    }

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyimpan paket...'; }
      const res = id ? await API.spp.update(payload) : await API.spp.create(payload);
      if (res.status === 'OK') {
        const msg = id
          ? 'Paket SPP berhasil diperbarui'
          : `Berhasil! ${res.data.total_pertemuan} sesi di periode ini.`;
        UI.toast(msg, 'success');
        // Catat untuk undo jika ini tambah baru
        if (!id && res.data?.id) {
          // Reset state undo sebelumnya sebelum catat aksi baru
          lastDeletedData = null;
          lastRestoredId  = null;
          lastAddedId     = res.data.id;
          lastAction      = 'ADD';
          const undoBtn = document.getElementById('spp-undo-btn');
          if (undoBtn) undoBtn.disabled = false;
        }
        UI.closeModal('modal-spp');
        load(true);
      } else { UI.toast(res.message || 'Gagal memproses paket SPP', 'error'); }
    } catch(e) { UI.toast('Gagal terhubung ke server', 'error'); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = 'Simpan Paket'; } }
  }

  async function deleteSPP(id, btnOverride) {
    const isDetailBtn     = !!btnOverride;
    const btn             = btnOverride || document.querySelector(`button[onclick*="deleteSPP('${id}'"]`);
    const originalContent = btn ? btn.innerHTML : '';
    const originalWidth   = btn ? btn.style.width : '';

    const _setLoading = (loading) => {
      if (!btn) return;
      if (loading) {
        btn.disabled = true;
        if (isDetailBtn) {
          btn.innerHTML = '<div class="spinner spinner-sm"></div> Menghapus...';
        } else {
          btn.innerHTML = '<div class="spinner spinner-sm"></div>';
          btn.style.width = '40px';
        }
      } else {
        btn.disabled  = false;
        btn.innerHTML = originalContent;
        btn.style.width = originalWidth;
      }
    };

    // ── Nyalain loading dari SEBELUM previewDelete, bukan cuma pas delete
    //    beneran — biar gak ada jeda diam antara klik & munculnya dialog
    //    konfirmasi.
    _setLoading(true);

    let pesanKonfirmasi = `paket SPP ${id}`;
    try {
      const preview = await API.spp.previewDelete(id);
      if (preview.status === 'OK' && preview.data) {
        const p = preview.data;
        pesanKonfirmasi = `paket ${p.nama_murid} (${p.periode}), sisa ${p.sisa_pertemuan} sesi`;
        if (p.presensi_akan_yatim && p.presensi_akan_yatim.length) {
          const tglList = p.presensi_akan_yatim.map(x => x.tanggal).join(', ');
          pesanKonfirmasi += `. ⚠️ ${p.presensi_akan_yatim.length} presensi (${tglList}) tidak akan terhitung ke paket manapun setelah paket ini dihapus.`;
        }
      }
    } catch(e) {
      // Kalau preview gagal, tetap lanjut ke konfirmasi standar — jangan blokir hapus
    }

    if (!await UI.confirmDelete(pesanKonfirmasi, 'SPP')) { _setLoading(false); return; }

    const s         = allData.find(x => x.id === id);
    lastAddedId     = null;
    lastRestoredId  = null;
    lastDeletedData = s ? JSON.parse(JSON.stringify(s)) : null;
    lastAction      = 'DELETE';

    try {
      const res = await API.spp.delete(id);
      if (res.status === 'OK') {
        UI.toast('Paket berhasil dihapus. Klik Undo untuk membatalkan.', 'warning');
        allData = allData.filter(x => x.id !== id);
        renderTable(allData);
        const undoBtn = document.getElementById('spp-undo-btn');
        if (undoBtn) undoBtn.disabled = false;
        const redoBtn = document.getElementById('spp-redo-btn');
        if (redoBtn) redoBtn.disabled = true;
      } else {
        UI.toast(res.message || 'Gagal menghapus', 'error');
        _setLoading(false);
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
      _setLoading(false);
    }
  }

  async function undo() {
    if (!lastAction || (!lastDeletedData && !lastAddedId)) return;
    const undoBtn = document.getElementById('spp-undo-btn');
    const redoBtn = document.getElementById('spp-redo-btn');
    try {
      if (undoBtn) undoBtn.disabled = true;

      if (lastAction === 'DELETE' && lastDeletedData) {
        // Restore paket yang dihapus — create fresh (hadir=0, sisa=total dari jadwal)
        // Catatan: nilai hadir asli tidak bisa direstore karena backend selalu hitung ulang
        const res = await API.spp.create(lastDeletedData);
        if (res.status === 'OK') {
          UI.toast('Undo berhasil: Paket SPP dikembalikan (sesi hadir direset ke 0).', 'success');
          lastRestoredId = res.data?.id || lastDeletedData.id;
          lastAction     = 'UNDO_DELETE';
          if (redoBtn) redoBtn.disabled = false;
          load(true);
        } else {
          UI.toast(res.message || 'Undo gagal', 'error');
          if (undoBtn) undoBtn.disabled = false;
        }

      } else if (lastAction === 'ADD' && lastAddedId) {
        // Batalkan tambah paket — hapus yang baru dibuat
        const res = await API.spp.delete(lastAddedId);
        if (res.status === 'OK') {
          UI.toast('Undo berhasil: Penambahan paket SPP dibatalkan.', 'warning');
          lastAddedId = null;
          lastAction  = null;
          const redoBtnEl = document.getElementById('spp-redo-btn');
          if (redoBtnEl) redoBtnEl.disabled = true;
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
    const redoBtn = document.getElementById('spp-redo-btn');
    try {
      if (redoBtn) redoBtn.disabled = true;
      const res = await API.spp.delete(lastRestoredId);
      if (res.status === 'OK') {
        UI.toast('Redo Berhasil: Paket SPP dihapus kembali!', 'success');
        lastAction     = 'DELETE';
        lastRestoredId = null;
        const undoBtn  = document.getElementById('spp-undo-btn');
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
    if (!await UI.confirmDanger(`PERINGATAN! Akan menghapus SEMUA (${total}) paket SPP.`, 'HAPUS SEMUA SPP')) return;
    UI.toast('Sedang membersihkan database...', 'info');
    try {
      const res = await API.spp.deleteAll();
      if (res.status === 'OK') {
        UI.toast('Seluruh paket SPP berhasil dihapus!', 'success');
        load(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus semua data', 'error');
      }
    } catch(e) { UI.toast('Gagal menghapus semua data', 'error'); }
  }

  // ── Nota / Faktur SPP ────────────────────────────────────────────────────
  function printNota(id) {
    const s = allData.find(x => x.id === id);
    if (!s) { UI.toast('Data paket tidak ditemukan', 'error'); return; }

    const admin    = API.currentUser();
    const tglCetak = new Date().toLocaleDateString('id-ID', { dateStyle: 'long' });
    const fmtRp    = v => 'Rp ' + Number(v || 0).toLocaleString('id-ID');
    const fmtTgl   = str => str ? new Date(str + 'T00:00:00').toLocaleDateString('id-ID', { dateStyle: 'long' }) : '-';
    const sisa     = Number(s.sisa_pertemuan) || 0;
    const hadir    = Number(s.hadir)          || 0;
    const total    = Number(s.total_pertemuan)|| 0;
    const terbayar = Number(s.terbayar)       || 0;
    const harga    = Number(s.harga)          || 0;
    const sisa_bayar = Math.max(0, harga - terbayar);

    const statusBayarColor = {
      'PAID':    '#15803d',
      'PARTIAL': '#b45309',
      'UNPAID':  '#dc2626'
    }[s.status_bayar] || '#6b7280';

    const statusSPPColor = {
      'AKTIF':   '#15803d',
      'HABIS':   '#dc2626',
      'EXPIRED': '#6b7280'
    }[s.status] || '#6b7280';

    // ─────────────────────────────────────────────────────────────────────
    // LOGO — untuk mengganti logo:
    //   1. Siapkan gambar logo (PNG/JPG), convert ke base64
    //   2. Ganti nilai logoHTML di bawah dengan:
    //      `<img src="data:image/png;base64,KODE_BASE64_KAMU" style="height:50px;">`
    //   3. Atau gunakan URL langsung:
    //      `<img src="https://domain.com/logo.png" style="height:50px;">`
    // ─────────────────────────────────────────────────────────────────────
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
<title>Nota SPP - ${s.nama_murid}</title>
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

  /* Header */
  .header {
    background: linear-gradient(135deg,#1a3a6e 0%,#2d5499 60%,#3d6abf 100%);
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

  /* Body */
  .body { padding:24px 28px; }

  /* Info murid */
  .murid-card {
    background:linear-gradient(135deg,#eff6ff,#e8eef7);
    border:1px solid #c3d4ef;
    border-radius:10px;
    padding:16px 20px;
    margin-bottom:18px;
    display:flex;
    justify-content:space-between;
    align-items:center;
    gap:12px;
  }
  .murid-card-left h2 { font-size:15px; font-weight:700; color:#1a3a6e; margin-bottom:4px; }
  .murid-card-left p  { font-size:10px; color:#4b5563; }
  .program-pill {
    background:linear-gradient(135deg,#1a3a6e,#3d6abf);
    color:#fff; font-size:10px; font-weight:700;
    padding:5px 14px; border-radius:20px;
    white-space:nowrap;
  }

  /* Grid info */
  .info-grid {
    display:grid; grid-template-columns:1fr 1fr;
    gap:10px; margin-bottom:18px;
  }
  .info-box {
    background:#f8fafc; border:1px solid #e5e7eb;
    border-radius:8px; padding:12px 14px;
  }
  .info-box-label { font-size:8.5px; text-transform:uppercase; letter-spacing:.07em; color:#6b7280; font-weight:600; margin-bottom:5px; }
  .info-box-value { font-size:12px; font-weight:700; color:#1f2937; }
  .info-box-sub   { font-size:9px; color:#6b7280; margin-top:2px; }

  /* Progress bar sesi */
  .progress-wrap { margin-bottom:18px; }
  .progress-label { display:flex; justify-content:space-between; font-size:9.5px; color:#4b5563; margin-bottom:6px; }
  .progress-bar { height:8px; background:#e5e7eb; border-radius:99px; overflow:hidden; }
  .progress-fill { height:100%; border-radius:99px; background:linear-gradient(90deg,#2d5499,#3d6abf); transition:width .3s; }

  /* Pembayaran */
  .pay-section { margin-bottom:18px; }
  .section-title { font-size:10px; font-weight:700; color:#1a3a6e; text-transform:uppercase; letter-spacing:.07em; margin-bottom:10px; padding-bottom:6px; border-bottom:2px solid #e8eef7; }
  .pay-row { display:flex; justify-content:space-between; font-size:10.5px; padding:6px 0; border-bottom:1px solid #f3f4f6; color:#374151; }
  .pay-row:last-child { border-bottom:none; }
  .pay-row.total { font-size:12px; font-weight:700; color:#1f2937; padding-top:10px; }
  .pay-row.sisa  { font-size:11px; font-weight:700; color:#dc2626; }

  /* Status badge */
  .status-pill {
    display:inline-block;
    padding:3px 10px; border-radius:20px;
    font-size:9px; font-weight:700;
    text-transform:uppercase; letter-spacing:.05em;
  }

  /* Footer nota */
  .footer-nota {
    margin-top:20px;
    display:flex; justify-content:space-between;
    align-items:flex-end; gap:20px;
  }
  .ttd-box {
    text-align:center; flex:1;
  }
  .ttd-box p  { font-size:9.5px; color:#4b5563; margin-bottom:48px; }
  .ttd-box .ttd-name { font-size:10px; font-weight:700; border-top:1px solid #6b7280; padding-top:6px; display:inline-block; min-width:120px; }
  .note-box {
    flex:1; background:#fffbeb; border:1px solid #fde68a;
    border-radius:8px; padding:12px 14px; font-size:9.5px; color:#92400e; line-height:1.6;
  }
  .note-box strong { display:block; margin-bottom:4px; color:#78350f; }

  .footer-bar {
    margin-top:20px; padding:12px 28px;
    background:#f8fafc; border-top:1px solid #e5e7eb;
    text-align:center; font-size:8.5px; color:#9ca3af;
  }

  @media print {
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
      <div class="nota-badge">Nota SPP</div>
      <p>No: ${s.id}<br>Dicetak: ${tglCetak}</p>
    </div>
  </div>
  <div class="header-stripe"></div>

  <div class="body">

    <!-- Info Murid -->
    <div class="murid-card">
      <div class="murid-card-left">
        <h2>${UI.escape(s.nama_murid)}</h2>
        <p>ID Paket: ${s.id} &nbsp;·&nbsp; ID Murid: ${s.id_murid}</p>
      </div>
      <div class="program-pill">${UI.escape(s.program)}</div>
    </div>

    <!-- Grid Info -->
    <div class="info-grid">
      <div class="info-box">
        <div class="info-box-label">Periode Mulai</div>
        <div class="info-box-value">${fmtTgl(s.periode_mulai)}</div>
      </div>
      <div class="info-box">
        <div class="info-box-label">Periode Akhir</div>
        <div class="info-box-value">${fmtTgl(s.periode_akhir)}</div>
      </div>
      <div class="info-box">
        <div class="info-box-label">Status Paket</div>
        <div class="info-box-value">
          <span class="status-pill" style="background:${statusSPPColor}20;color:${statusSPPColor};">
            ${s.status || 'AKTIF'}
          </span>
        </div>
      </div>
      <div class="info-box">
        <div class="info-box-label">Status Pembayaran</div>
        <div class="info-box-value">
          <span class="status-pill" style="background:${statusBayarColor}20;color:${statusBayarColor};">
            ${s.status_bayar || 'UNPAID'}
          </span>
        </div>
      </div>
    </div>

    <!-- Progress Sesi -->
    <div class="progress-wrap">
      <div class="progress-label">
        <span>Progress Pertemuan</span>
        <span><strong>${hadir}</strong> hadir dari <strong>${total}</strong> sesi · Sisa <strong>${sisa}</strong></span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${total > 0 ? Math.round((hadir/total)*100) : 0}%"></div>
      </div>
    </div>

    <!-- Pembayaran -->
    <div class="pay-section">
      <div class="section-title">Rincian Pembayaran</div>
      <div class="pay-row"><span>Biaya Paket SPP</span><strong>${fmtRp(harga)}</strong></div>
      <div class="pay-row"><span>Total Sesi</span><span>${total} pertemuan</span></div>
      <div class="pay-row total"><span>Sudah Dibayar</span><span style="color:#15803d">${fmtRp(terbayar)}</span></div>
      ${sisa_bayar > 0 ? `<div class="pay-row sisa"><span>Sisa Tagihan</span><span>${fmtRp(sisa_bayar)}</span></div>` : `<div class="pay-row" style="color:#15803d;font-weight:700;"><span>Lunas</span><span>✓</span></div>`}
    </div>

    <!-- Footer nota -->
    <div class="footer-nota">
      <div class="note-box">
        <strong>Catatan:</strong>
        Nota ini adalah bukti pembayaran SPP EduHome Bimbel.
        Harap simpan sebagai bukti yang sah.
        ${sisa_bayar > 0 ? `<br>Tagihan belum lunas: <strong>${fmtRp(sisa_bayar)}</strong>` : ''}
      </div>
      <div class="ttd-box">
        <p>Diterima oleh,</p>
        <div class="ttd-name">${UI.escape(admin.username || 'Admin')}</div>
      </div>
    </div>

  </div>

  <div class="footer-bar">
    EduHome Bimbel &nbsp;·&nbsp; Nota SPP ${s.id} &nbsp;·&nbsp; Dicetak ${tglCetak}
  </div>
</div>
<script>window.onload = () => { window.focus(); window.print(); }<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=800,height=700');
    if (!win) { UI.toast('Popup diblokir browser. Izinkan popup untuk mencetak nota.', 'error'); return; }
    win.document.write(html);
    win.document.close();
  }

  // ── Peringatan SPP Mau Habis ─────────────────────────────────────────────
  function checkSPPWarning() {
    const today    = new Date();
    today.setHours(0, 0, 0, 0);
    const in7Days  = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    const warnings = allData.filter(s => {
      // Hanya cek paket AKTIF
      if (s.status !== 'AKTIF') return false;

      const sisa        = Number(s.sisa_pertemuan) || 0;
      const periodeAkhir = s.periode_akhir ? new Date(s.periode_akhir + 'T00:00:00') : null;
      const hampirHabis  = sisa <= 3 && sisa > 0;
      const sudahHabis   = sisa === 0;
      const mauExpired   = periodeAkhir && periodeAkhir <= in7Days && periodeAkhir >= today;

      return hampirHabis || sudahHabis || mauExpired;
    }).map(s => {
      const sisa         = Number(s.sisa_pertemuan) || 0;
      const periodeAkhir = s.periode_akhir ? new Date(s.periode_akhir + 'T00:00:00') : null;
      const selisihHari  = periodeAkhir ? Math.ceil((periodeAkhir - today) / (1000*60*60*24)) : null;

      let level = 'warning'; // kuning
      let alasan = [];
      if (sisa === 0)   { level = 'danger'; alasan.push('Sesi habis'); }
      if (sisa <= 3 && sisa > 0) alasan.push(`Sisa ${sisa} sesi`);
      if (selisihHari !== null && selisihHari <= 7) {
        if (selisihHari <= 2) level = 'danger';
        alasan.push(selisihHari === 0 ? 'Berakhir hari ini' : `Berakhir ${selisihHari} hari lagi`);
      }

      return { ...s, level, alasan: alasan.join(' · ') };
    });

    if (!warnings.length) return;

    // Render modal peringatan
    const modal = document.getElementById('modal-spp-warning');
    const list  = document.getElementById('spp-warning-list');
    if (!modal || !list) return;

    list.innerHTML = warnings.map(w => `
      <div class="spp-warn-item ${w.level}">
        <div class="spp-warn-left">
          <div class="spp-warn-name">${UI.escape(w.nama_murid)}</div>
          <div class="spp-warn-meta">${UI.escape(w.program)} &nbsp;·&nbsp; ${w.alasan}</div>
        </div>
        <button class="spp-warn-btn" onclick="UI.closeModal('modal-spp-warning'); SPPPage.printNota('${w.id}')">
          Nota
        </button>
      </div>`).join('');

    // Update counter badge
    const badge = document.getElementById('spp-warning-count');
    if (badge) badge.textContent = warnings.length;

    UI.openModal('modal-spp-warning');
  }

  
  function _batchNext() {
    const step = _batchState._currentStep;
    if (step === 'murid') { _batchGoOpsi(); _batchShowBackBtn(true); }
  }

  function _batchBack() {
    _batchRenderStep('murid');
    _batchShowBackBtn(false);
    document.getElementById('batch-next-btn').style.display = '';
    _batchShowSaveBtn(false);
    _batchUpdateNextBtn();
  }

  function _batchShowBackBtn(show) {
    const btn = document.getElementById('batch-back-btn');
    if (btn) btn.style.display = show ? '' : 'none';
  }

  function _batchShowSaveBtn(show) {
    const nextBtn = document.getElementById('batch-next-btn');
    let saveBtn   = document.getElementById('batch-save-btn');
    if (!saveBtn && show) {
      // Buat save btn dinamis
      saveBtn           = document.createElement('button');
      saveBtn.id        = 'batch-save-btn';
      saveBtn.type      = 'button';
      saveBtn.className = 'btn btn-primary';
      saveBtn.onclick   = () => SPPPage.saveBatch();
      saveBtn.innerHTML = '<i data-lucide="save" style="width:15px;height:15px;"></i> <span id="batch-save-count">Simpan</span>';
      if (nextBtn) nextBtn.parentNode.insertBefore(saveBtn, nextBtn);
      lucide.createIcons({ nodes: [saveBtn] });
    }
    if (saveBtn) saveBtn.style.display = show ? '' : 'none';
    if (nextBtn) nextBtn.style.display  = show ? 'none' : '';
    if (show) _batchUpdateSaveBtn();
  }

  function deleteSelected()  { return Selection.deleteSelected('spp'); }
  function _getCurrentData() { return allData; }


  let _batchState = {
    muridList: [],   
    selected:  {},   
    preview:   [],   
    isSaving:  false
  };

  async function openBatch() {
    const modal = document.getElementById('modal-spp-batch');
    if (!modal) return;

    _batchState.selected = {};
    _batchState.preview  = [];

    const bodyEl = document.getElementById('batch-murid-list');
    if (bodyEl) bodyEl.innerHTML = '<div class="picker-loading"><div class="spinner spinner-sm" style="margin:0 auto 8px"></div> Memuat murid...</div>';

    UI.openModal('modal-spp-batch');
    _batchRenderStep('murid');

    try {
      const [muridRes, sppRes] = await Promise.all([API.murid.getAll(), API.spp.getAll()]);
      _batchState.muridList = (muridRes.data || []).filter(m => String(m.status).toUpperCase() === 'AKTIF');
      if (!isFetched && sppRes.status === 'OK') {
        allData   = (sppRes.data || []).sort((a, b) => a.id.localeCompare(b.id));
        isFetched = true;
      }
      _batchRenderMuridList('');
    } catch(e) {
      if (bodyEl) bodyEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);">Gagal memuat data murid</div>';
    }
  }

  function _batchRenderStep(step) {
    const steps = ['murid', 'opsi'];
    steps.forEach(s => {
      const el = document.getElementById(`batch-step-${s}`);
      if (el) el.style.display = s === step ? '' : 'none';
    });
    // Preview & progress selalu tampil bersama step 'opsi'
    const previewEl = document.getElementById('batch-step-preview');
    if (previewEl) previewEl.style.display = step === 'opsi' ? '' : 'none';

    const titles = { murid: 'Pilih Murid', opsi: 'Harga & Konfirmasi' };
    const titleEl = document.getElementById('batch-modal-title');
    if (titleEl) titleEl.textContent = titles[step] || 'Buat Batch SPP';
    _batchState._currentStep = step;
  }

  // Murid dengan SPP AKTIF (jenis_siklus BARU maupun LAMA — keduanya tidak
  // boleh punya paket baru bersamaan) ditandai & dikecualikan dari batch,
  // supaya user tidak perlu menunggu penolakan dari backend baru sadar.
  function _batchSudahAktif(idMurid) {
    return allData.some(s => s.id_murid === idMurid && s.status === 'AKTIF');
  }

  function _batchRenderMuridList(q) {
    const list = _batchState.muridList.filter(m =>
      !q || m.nama.toLowerCase().includes(q.toLowerCase())
    );
    const el = document.getElementById('batch-murid-list');
    if (!el) return;

    const selCount   = Object.keys(_batchState.selected).length;
    const eligibleTotal = _batchState.muridList.filter(m => !_batchSudahAktif(m.id)).length;

    if (!list.length) {
      el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">Murid tidak ditemukan</div>';
      return;
    }

    el.innerHTML = list.map(m => {
      const sudahAktif = _batchSudahAktif(m.id);
      const isSelected = !sudahAktif && !!_batchState.selected[m.id];
      const paketMurid = allData.filter(s => s.id_murid === m.id);
      const punya       = paketMurid.length;

      return `
        <div class="batch-murid-row ${isSelected ? 'selected' : ''}"
             onclick="${sudahAktif ? '' : `SPPPage._batchToggleMurid('${m.id}')`}"
             style="cursor:${sudahAktif ? 'not-allowed' : 'pointer'};user-select:none;${sudahAktif ? 'opacity:0.55;' : ''}">
          <!-- Checkbox custom -->
          <div style="
            width:18px;height:18px;border-radius:5px;flex-shrink:0;
            border:2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'};
            background:${isSelected ? 'var(--primary)' : 'transparent'};
            display:flex;align-items:center;justify-content:center;
            transition:all .15s;
          ">
            ${isSelected ? `<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>` : ''}
          </div>

          <div class="batch-murid-avatar">${m.nama.charAt(0).toUpperCase()}</div>

          <div class="batch-murid-info">
            <div class="batch-murid-nama">${UI.escape(m.nama)}</div>
            <div class="batch-murid-meta">
              <span class="program-tag" style="font-size:0.7rem;padding:1px 7px;">${UI.escape(m.program)}</span>
              <span style="font-size:0.74rem;color:var(--text-secondary);">${punya} paket sebelumnya</span>
            </div>
          </div>

          ${sudahAktif ? `
            <div style="flex-shrink:0;">
              <span style="
                font-size:0.7rem;padding:2px 7px;border-radius:10px;font-weight:600;
                background:var(--warning-dim,#fef3c7);color:var(--warning,#d97706);
              ">Sudah aktif</span>
            </div>` : ''}
        </div>`;
    }).join('');

    const countEl = document.getElementById('batch-sel-count');
    if (countEl) countEl.textContent = `${selCount} / ${eligibleTotal} dipilih`;
    const btnSemua = document.getElementById('batch-btn-semua');
    if (btnSemua) {
      const allSelected = eligibleTotal > 0 && selCount === eligibleTotal;
      btnSemua.textContent = allSelected ? '✓ Semua Dipilih' : 'Pilih Semua';
      btnSemua.style.background = allSelected ? 'var(--primary)' : '';
      btnSemua.style.color      = allSelected ? '#fff' : '';
    }
    _batchUpdateNextBtn();
  }

  function _batchToggleMurid(id) {
    if (_batchSudahAktif(id)) return; // tidak bisa dipilih — sudah punya SPP AKTIF
    if (_batchState.selected[id]) delete _batchState.selected[id];
    else _batchState.selected[id] = true;
    _batchRenderMuridList(document.getElementById('batch-search-murid')?.value || '');
  }

  function _batchToggleAll() {
    const eligible  = _batchState.muridList.filter(m => !_batchSudahAktif(m.id));
    const selCount  = Object.keys(_batchState.selected).length;
    if (selCount === eligible.length) {
      _batchState.selected = {};
    } else {
      eligible.forEach(m => { _batchState.selected[m.id] = true; });
    }
    _batchRenderMuridList(document.getElementById('batch-search-murid')?.value || '');
  }

  function _batchUpdateNextBtn() {
    const btn = document.getElementById('batch-next-btn');
    if (!btn) return;
    const hasSelected = Object.keys(_batchState.selected).length > 0;
    btn.disabled = !hasSelected;
  }

  function _batchGoOpsi() {
    if (!Object.keys(_batchState.selected).length) {
      UI.toast('Pilih minimal 1 murid', 'error'); return;
    }
    _batchBuildPreview();
    _batchRenderStep('opsi');
    document.getElementById('batch-next-btn').style.display = 'none';
    _batchShowSaveBtn(true);
  }

  function _batchBuildPreview() {
    const selectedIds = Object.keys(_batchState.selected);
    const muridMap     = {};
    _batchState.muridList.forEach(m => { muridMap[m.id] = m; });

    const info = document.getElementById('batch-opsi-info');
    if (info) info.textContent = `${selectedIds.length} murid dipilih — masing-masing akan dibuat 1 paket siklus 12-sesi baru`;

    _batchState.preview = selectedIds.map(id_murid => {
      const murid = muridMap[id_murid];
      // Default harga: dari paket terakhir murid ini (kalau ada), else 0.
      const paketMurid   = allData.filter(p => p.id_murid === id_murid).sort((a, b) => b.id.localeCompare(a.id));
      const defaultHarga = paketMurid[0]?.harga || 0;
      return {
        id_murid,
        nama_murid: murid?.nama || '',
        program:    murid?.program || '',
        harga:      defaultHarga,
        checked:    true
      };
    });

    _batchRenderPreviewList();
  }

  function _batchApplyHargaMassal() {
    const val = parseFloat(document.getElementById('batch-harga-massal')?.value) || 0;
    if (!val) { UI.toast('Isi harga terlebih dahulu', 'error'); return; }
    _batchState.preview.forEach(p => { p.harga = val; });
    _batchRenderPreviewList();
  }

  function _batchRenderPreviewList() {
    const listEl = document.getElementById('batch-preview-list');
    if (!listEl) return;
    const preview = _batchState.preview;

    if (!preview.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-secondary);">Tidak ada murid dipilih.</div>';
      return;
    }

    listEl.innerHTML = preview.map((p, i) => `
      <div style="
        display:flex;align-items:center;gap:10px;
        padding:10px 4px;
        border-bottom:1px solid var(--border);
      ">
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">${UI.escape(p.nama_murid)}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:1px;">
            <span class="program-tag" style="font-size:0.68rem;padding:1px 6px;">${UI.escape(p.program)}</span>
            · Siklus 12-sesi baru
          </div>
        </div>
        <div style="flex-shrink:0;width:130px;">
          <input type="number" value="${p.harga}" min="0" step="1000"
                 onchange="SPPPage._batchUpdateHarga(${i}, this.value)"
                 style="
                   width:100%;text-align:right;box-sizing:border-box;
                   border:1px solid var(--border);border-radius:6px;
                   padding:5px 8px;font-size:0.8rem;
                   background:var(--bg-surface);color:var(--text-primary);
                 ">
        </div>
      </div>
    `).join('');

    _batchUpdateSaveBtn();
  }

  function _batchUpdateHarga(i, val) {
    _batchState.preview[i].harga = parseFloat(val) || 0;
  }

  function _batchUpdateSaveBtn() {
    const btn      = document.getElementById('batch-save-btn');
    const countEl  = document.getElementById('batch-save-count');
    const total    = _batchState.preview.length;
    if (btn) btn.disabled = total === 0 || _batchState.isSaving;
    if (countEl) countEl.textContent = total > 0 ? `Simpan ${total} Paket` : 'Simpan';
  }

  async function saveBatch() {
    const toSave = _batchState.preview;
    if (!toSave.length) { UI.toast('Tidak ada paket yang dipilih', 'error'); return; }

    _batchState.isSaving = true;
    const saveBtn      = document.getElementById('batch-save-btn');
    const progressEl   = document.getElementById('batch-progress-wrap');
    const barEl        = document.getElementById('batch-progress-bar');
    const progressTxt  = document.getElementById('batch-progress-txt');
    if (saveBtn) saveBtn.disabled = true;
    if (progressEl) progressEl.style.display = '';

    let sukses = 0, gagal = 0, gagalList = [];

    for (let i = 0; i < toSave.length; i++) {
      const p = toSave[i];
      if (progressTxt) progressTxt.textContent = `Menyimpan ${i + 1} / ${toSave.length}...`;
      if (barEl) barEl.style.width = `${Math.round((i / toSave.length) * 100)}%`;

      try {
        const res = await API.spp.create({
          id_murid:   p.id_murid,
          nama_murid: p.nama_murid,
          program:    p.program,
          harga:      p.harga
        });
        if (res.status === 'OK') sukses++;
        else { gagal++; gagalList.push(`${p.nama_murid} (${res.message || 'error'})`); }
      } catch(e) {
        gagal++;
        gagalList.push(`${p.nama_murid} (koneksi gagal)`);
      }
    }

    if (barEl) barEl.style.width = '100%';
    if (progressTxt) progressTxt.textContent = 'Selesai!';

    await new Promise(r => setTimeout(r, 600));

    _batchState.isSaving = false;
    if (progressEl) progressEl.style.display = 'none';

    if (sukses > 0) {
      UI.toast(`${sukses} paket SPP berhasil dibuat!${gagal > 0 ? ` (${gagal} gagal)` : ''}`, sukses > 0 && gagal === 0 ? 'success' : 'warning');
    } else {
      UI.toast(`Semua paket gagal disimpan.`, 'error');
    }

    if (gagal > 0 && gagalList.length) {
      console.warn('Batch SPP gagal:', gagalList);
    }

    UI.closeModal('modal-spp-batch');
    isFetched = false;
    load(true);
  }



  // ── Export functions ─────────────────────────────────────────────────────
  function exportExcel() {
    const headers = ['ID', 'Murid', 'Program', 'Periode Mulai', 'Periode Akhir', 'Total Sesi', 'Hadir', 'Sisa', 'Status', 'Harga', 'Terbayar', 'Status Bayar'];
    const rows    = allData.map(s => [s.id, s.nama_murid, s.program, UI.formatDate(s.periode_mulai), UI.formatDate(s.periode_akhir), s.total_pertemuan, s.hadir || 0, s.sisa_pertemuan, s.status, s.harga, s.terbayar || 0, s.status_bayar]);
    UI.exportExcel(headers, rows, 'Data_SPP', 'SPP');
  }

  function exportPDF() {
    const headers = ['ID', 'Murid', 'Program', 'Periode Mulai', 'Periode Akhir', 'Total Sesi', 'Hadir', 'Sisa', 'Status', 'Harga', 'Terbayar', 'Status Bayar'];
    const rows    = allData.map(s => [s.id, s.nama_murid, s.program, UI.formatDate(s.periode_mulai), UI.formatDate(s.periode_akhir), s.total_pertemuan, s.hadir || 0, s.sisa_pertemuan, s.status, UI.formatCurrency(s.harga), UI.formatCurrency(s.terbayar || 0), s.status_bayar]);
    UI.exportPDF('Data Paket SPP', headers, rows, {subtitle: 'Daftar seluruh paket SPP murid'});
  }

  // ── Sort function ─────────────────────────────────────────────────────────
  let _currentSort = { col: 'periode_mulai', asc: false };
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


  function invalidateCache() {
    isFetched = false;
  }

  return {
    load, search, saveForm, openAdd, openEdit, deleteSPP,
    initLiveCount, calculateLiveSessions, undo, redo, deleteAll,
    deleteSelected, renderTable, renderRows, _getCurrentData,
    sortBy, _onMuridChange, printNota, checkSPPWarning,
    exportExcel, exportPDF, shiftPeriod,
    invalidateCache,
    // Batch (siklus 12-sesi — simplified)
    openBatch, saveBatch,
    _batchNext, _batchBack,
    _batchToggleMurid, _batchToggleAll, _batchGoOpsi,
    _batchRenderMuridList, _batchApplyHargaMassal,
    _batchUpdateHarga, _batchUpdateSaveBtn
  };

})();

window.SPPPage = SPPPage;