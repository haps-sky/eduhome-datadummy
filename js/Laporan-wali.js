const LaporanWaliPage = (() => {
  let _muridList    = [];
  let _sppList      = [];
  let _selectedSPP  = null;
  let _previewData  = null;

  // ─── Load halaman ─────────────────────────────────────────────────────────
  async function load() {
    const catatanEl = document.getElementById('lw-catatan-mentor');
    if (catatanEl && !catatanEl._lwListenerAttached) {
      catatanEl.addEventListener('input', _checkEnablePreview);
      catatanEl._lwListenerAttached = true;
    }

    if (!_muridList.length) {
      try {
        const res  = await API.murid.getAll();
        _muridList = (res.data || []).filter(m => m.status === 'AKTIF');
      } catch(e) {
        UI.toast('Gagal memuat daftar murid', 'error');
        return;
      }
    }

    // Populate via SD
    const items = _muridList.map(m => ({
      value: m.id,
      label: m.nama,
      badge: m.program,
      extra: { nama: m.nama, program: m.program }
    }));
    SD.populate('lw-murid', items);

    // Pasang listener change pada hidden <select>
    const sel = document.getElementById('lw-murid');
    if (sel && !sel._lwListenerAttached) {
      sel.addEventListener('change', onMuridChange);
      sel._lwListenerAttached = true;
    }

    // Reset selected SPP
    _selectedSPP = null;
    _updatePeriodeDisplay();
    _checkEnablePreview();
  }

  // ─── Ketika murid dipilih → fetch SPP & tampilkan popup ───────────────────
  async function onMuridChange() {
    const sel = document.getElementById('lw-murid');
    if (!sel?.value) {
      _selectedSPP = null;
      _sppList     = [];
      _updatePeriodeDisplay();
      _checkEnablePreview();
      return;
    }
    // Loading state di tombol periode
    _updatePeriodeDisplay('loading');

    try {
      const res = await API.spp.getByMurid(sel.value);
      _sppList  = (res.data || []).sort((a, b) =>
        (b.periode_mulai || '').localeCompare(a.periode_mulai || '')
      );
    } catch(e) {
      UI.toast('Gagal memuat paket SPP', 'error');
      _updatePeriodeDisplay();
      return;
    }

    // Clear preview lama saat murid diganti
    _clearPreview();

    if (!_sppList.length) {
      _selectedSPP = null;
      _updatePeriodeDisplay('empty');
      _checkEnablePreview();
      return;
    }

    // Auto-select paket aktif atau terbaru
    _selectedSPP = _sppList.find(s => s.status === 'AKTIF') || _sppList[0];
    _updatePeriodeDisplay();
    _checkEnablePreview();
  }

  function onFilterChange() { _checkEnablePreview(); }

  // ─── Update tampilan tombol periode ───────────────────────────────────────
  function _updatePeriodeDisplay(state = 'normal') {
    const btn = document.getElementById('lw-periode-btn');
    if (!btn) return;

    if (state === 'loading') {
      btn.innerHTML = `<div class="spinner spinner-sm"></div> Memuat paket...`;
      btn.disabled  = true;
      return;
    }
    if (state === 'empty') {
      btn.innerHTML = `<i data-lucide="package-x"></i> Tidak ada paket SPP`;
      btn.disabled  = true;
      lucide.createIcons({ nodes: [btn] });
      return;
    }
    if (!_selectedSPP) {
      btn.innerHTML = `<i data-lucide="calendar-range"></i> Pilih Periode`;
      btn.disabled  = !SD.getValue('lw-murid');
      lucide.createIcons({ nodes: [btn] });
      return;
    }

    const statusColor = {
      'AKTIF':   '#10b981',
      'EXPIRED': '#9ca3af',
      'HABIS':   '#f59e0b',
    }[_selectedSPP.status] || '#9ca3af';

    const statusBayarColor = {
      'PAID':    '#10b981',
      'PARTIAL': '#f59e0b',
      'UNPAID':  '#ef4444',
    }[_selectedSPP.status_bayar] || '#9ca3af';

    btn.innerHTML = `
      <span style="display:flex;align-items:center;gap:10px;width:100%;">
        <span style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;flex:1;min-width:0;">
          <span style="font-size:0.7rem;opacity:0.6;font-weight:500;text-transform:uppercase;letter-spacing:.05em;">Periode Terpilih</span>
          <span style="font-weight:600;font-size:0.9rem;">${_fmtTgl(_selectedSPP.periode_mulai)} – ${_fmtTgl(_selectedSPP.periode_akhir)}</span>
        </span>
        <span style="display:flex;gap:6px;flex-shrink:0;">
          <span style="padding:2px 8px;border-radius:20px;font-size:0.68rem;font-weight:700;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;">${_selectedSPP.status}</span>
          <span style="padding:2px 8px;border-radius:20px;font-size:0.68rem;font-weight:700;background:${statusBayarColor}22;color:${statusBayarColor};border:1px solid ${statusBayarColor}44;">${_selectedSPP.status_bayar}</span>
        </span>
        <i data-lucide="chevron-down" style="opacity:0.5;flex-shrink:0;"></i>
      </span>`;
    btn.disabled = false;
    lucide.createIcons({ nodes: [btn] });
  }

  // ─── Buka popup pilih periode ──────────────────────────────────────────────
  function openPeriodePicker() {
    if (!_sppList.length) return;

    // Buat atau ambil overlay
    let overlay = document.getElementById('lw-periode-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'lw-periode-overlay';
      overlay.style.cssText = `
        position:fixed;inset:0;z-index:9000;
        background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);
        display:flex;align-items:center;justify-content:center;padding:16px;
        animation:lwFadeIn .18s ease;
      `;
      overlay.addEventListener('click', e => {
        if (e.target === overlay) closePeriodePicker();
      });
      document.body.appendChild(overlay);

      // Inject CSS
      if (!document.getElementById('lw-picker-styles')) {
        const style = document.createElement('style');
        style.id = 'lw-picker-styles';
        style.textContent = `
          @keyframes lwFadeIn  { from { opacity:0; } to { opacity:1; } }
          @keyframes lwSlideUp { from { opacity:0; transform:translateY(16px) scale(.97); } to { opacity:1; transform:none; } }
          .lw-spp-card {
            display:flex; align-items:center; gap:14px;
            padding:14px 16px; border-radius:12px;
            border:1.5px solid var(--border);
            background:var(--bg-card);
            cursor:pointer; transition:all .15s;
            position:relative; overflow:hidden;
          }
          .lw-spp-card:hover { border-color:var(--primary); background:var(--bg-hover); transform:translateY(-1px); }
          .lw-spp-card.active { border-color:var(--primary); background:var(--primary)11; }
          .lw-spp-card.active::before {
            content:''; position:absolute; left:0; top:0; bottom:0; width:3px;
            background:var(--primary); border-radius:3px 0 0 3px;
          }
          .lw-badge {
            padding:3px 10px; border-radius:20px; font-size:0.68rem; font-weight:700;
            white-space:nowrap;
          }
          .lw-badge-aktif   { background:#10b98122; color:#10b981; border:1px solid #10b98144; }
          .lw-badge-expired { background:#9ca3af22; color:#9ca3af; border:1px solid #9ca3af44; }
          .lw-badge-habis   { background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b44; }
          .lw-badge-paid    { background:#10b98122; color:#10b981; border:1px solid #10b98144; }
          .lw-badge-partial { background:#f59e0b22; color:#f59e0b; border:1px solid #f59e0b44; }
          .lw-badge-unpaid  { background:#ef444422; color:#ef4444; border:1px solid #ef444444; }
        `;
        document.head.appendChild(style);
      }
    }

    const muridNama = SD.getValue('lw-murid')
      ? (document.getElementById('lw-murid')?.options[document.getElementById('lw-murid')?.selectedIndex]?.dataset?.nama || '')
      : '';

    overlay.innerHTML = `
      <div style="
        background:var(--bg-card); border:1px solid var(--border);
        border-radius:20px; width:100%; max-width:520px;
        max-height:85vh; display:flex; flex-direction:column;
        overflow:hidden; animation:lwSlideUp .22s ease;
        box-shadow:0 25px 60px rgba(0,0,0,.4);
      ">
        <!-- Header -->
        <div style="padding:20px 24px 16px; border-bottom:1px solid var(--border); display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
          <div>
            <div style="font-size:1rem; font-weight:700; color:var(--text-primary); margin-bottom:3px;">Pilih Periode SPP</div>
            <div style="font-size:0.78rem; color:var(--text-secondary);">${_escapeHtml(muridNama)} · ${_sppList.length} paket tersedia</div>
          </div>
          <button onclick="LaporanWaliPage.closePeriodePicker()" style="
            background:var(--bg-hover); border:none; border-radius:8px;
            width:32px; height:32px; cursor:pointer; color:var(--text-secondary);
            display:flex; align-items:center; justify-content:center; flex-shrink:0;
            font-size:1rem; transition:background .15s;
          " onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='var(--bg-hover)'">✕</button>
        </div>

        <!-- List paket -->
        <div style="overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:10px;">
          ${_sppList.map((s, i) => {
            const isActive  = _selectedSPP?.id === s.id;
            const statusCls = { AKTIF:'aktif', EXPIRED:'expired', HABIS:'habis' }[s.status] || 'expired';
            const bayrCls   = { PAID:'paid', PARTIAL:'partial', UNPAID:'unpaid' }[s.status_bayar] || 'unpaid';
            const pct        = s.total_pertemuan > 0
              ? Math.round(((s.total_pertemuan - s.sisa_pertemuan) / s.total_pertemuan) * 100)
              : 0;

            return `
            <div class="lw-spp-card${isActive ? ' active' : ''}" onclick="LaporanWaliPage.selectSPP(${i})">
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                  <span style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);font-family:monospace;">${s.id}</span>
                  <span class="lw-badge lw-badge-${statusCls}">${s.status}</span>
                  <span class="lw-badge lw-badge-${bayrCls}">${s.status_bayar}</span>
                </div>
                <div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);margin-bottom:6px;">
                  ${_fmtTgl(s.periode_mulai)} – ${_fmtTgl(s.periode_akhir)}
                </div>
                <!-- Progress bar sesi -->
                <div style="display:flex;align-items:center;gap:8px;">
                  <div style="flex:1;height:5px;background:var(--border);border-radius:99px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:${isActive ? 'var(--primary)' : '#6b7280'};border-radius:99px;transition:width .3s;"></div>
                  </div>
                  <span style="font-size:0.72rem;color:var(--text-secondary);white-space:nowrap;">
                    ${s.total_pertemuan - s.sisa_pertemuan}/${s.total_pertemuan} sesi
                  </span>
                </div>
              </div>
              ${isActive ? `
              <div style="color:var(--primary);flex-shrink:0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>

        <!-- Footer -->
        <div style="padding:14px 20px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:10px;">
          <button onclick="LaporanWaliPage.closePeriodePicker()" style="
            padding:9px 18px; border-radius:10px; border:1px solid var(--border);
            background:var(--bg-hover); color:var(--text-primary);
            font-size:0.84rem; font-weight:600; cursor:pointer;
          ">Batal</button>
          <button onclick="LaporanWaliPage.confirmPeriode()" style="
            padding:9px 20px; border-radius:10px; border:none;
            background:var(--primary); color:#fff;
            font-size:0.84rem; font-weight:600; cursor:pointer;
          ">Pilih Periode Ini</button>
        </div>
      </div>`;

    overlay.style.display = 'flex';
  }

  // ─── Pilih SPP dari popup ─────────────────────────────────────────────────
  function selectSPP(idx) {
    _selectedSPP = _sppList[idx];
    // Re-render cards tanpa tutup popup
    openPeriodePicker();
  }

  // ─── Konfirmasi & tutup popup ─────────────────────────────────────────────
  function confirmPeriode() {
    closePeriodePicker();
    _updatePeriodeDisplay();
    _checkEnablePreview();
  }

  function closePeriodePicker() {
    const overlay = document.getElementById('lw-periode-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  // ─── Cek apakah tombol cetak bisa diaktifkan ─────────────────────────────
  function _checkEnablePreview() {
    // Tombol selalu aktif — validasi dilakukan di printPDF via toast
  }

  // ─── Generate preview laporan ─────────────────────────────────────────────
  async function renderPreview() {
    const muridSel   = document.getElementById('lw-murid');
    const catatanVal = document.getElementById('lw-catatan-mentor')?.value?.trim();

    if (!muridSel?.value || !_selectedSPP) return;
    if (!catatanVal) {
      UI.toast('Catatan mentor wajib diisi sebelum preview', 'error');
      document.getElementById('lw-catatan-mentor')?.focus();
      return;
    }

    const btn = document.getElementById('lw-btn-preview');
    if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Memuat...'; }

    try {
      const presRes = await API.presensi.getByMurid(muridSel.value);
      // Filter berdasarkan ID_SPP (relasi eksplisit) untuk paket siklus 12-sesi
      // (jenis_siklus=BARU); fallback ke date-range untuk paket LAMA yang
      // presensinya tidak punya id_spp tersimpan — behavior existing dipertahankan.
      const allPres = (presRes.data || []).filter(p => {
        if (_selectedSPP.jenis_siklus === 'BARU') {
          return p.id_spp === _selectedSPP.id;
        }
        return p.tanggal >= _selectedSPP.periode_mulai &&
               p.tanggal <= (_selectedSPP.periode_akhir || '9999-12-31');
      });

      const muridOpt = muridSel.options[muridSel.selectedIndex];
      const data = {
        nama_murid:    muridOpt.dataset.nama,
        program:       muridOpt.dataset.program,
        periode:       `${_fmtTgl(_selectedSPP.periode_mulai)} – ${_selectedSPP.periode_akhir ? _fmtTgl(_selectedSPP.periode_akhir) : 'Siklus berjalan'}`,
        periodeRaw:    `${_selectedSPP.periode_mulai} s/d ${_selectedSPP.periode_akhir || '(siklus berjalan)'}`,
        presensi:      allPres,
        sppAktif:      _selectedSPP,
        catatanMentor: catatanVal,
        dibuatPada:    new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
      };

      _previewData = data;
      _renderHTML(data);
      document.getElementById('lw-preview-wrap').style.display = 'block';
      document.getElementById('lw-btn-print')?.removeAttribute('disabled');
      document.getElementById('lw-preview-wrap')?.scrollIntoView({ behavior:'smooth', block:'start' });
      _injectResetButton();
    } catch(e) {
      console.error(e);
      UI.toast('Gagal memuat data laporan', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="eye"></i> Preview Laporan'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  // ── Status "efektif" satu presensi, dengan RESCHEDULE ikut dianggap
  //    hadir (konsisten sama cara backend hitung kuota/gaji mentor).
  //    status_efektif sendiri cuma membedakan IZIN pending vs IZIN yang
  //    udah HANGUS (lewat deadline tanpa makeup) — RESCHEDULE gak disentuh
  //    backend jadi dicek terpisah lewat p.status mentah.
  function _statusEfektif(p) { return p.status_efektif || p.status; }
  function _isHadirLike(p)   { return _statusEfektif(p) === 'HADIR' || p.status === 'RESCHEDULE'; }

  // ─── Render HTML laporan ──────────────────────────────────────────────────
  function _renderHTML(d) {
    const hadir      = d.presensi.filter(p => _isHadirLike(p)).length;
    const izin       = d.presensi.filter(p => _statusEfektif(p) === 'IZIN').length;
    const absen      = d.presensi.filter(p => {
      const e = _statusEfektif(p);
      return e === 'ABSEN' || e === 'HANGUS';
    }).length;
    const tidakHadir = absen + izin;
    const s          = d.sppAktif;
    const total      = s ? s.total_pertemuan : d.presensi.length;
    const pctHdr     = total > 0 ? Math.round((hadir / total) * 100) : 0;
    const totalBtng  = d.presensi.reduce((acc, p) => acc + (parseInt(p.bintang) || 0), 0);
    const avgBtng    = hadir > 0 ? (totalBtng / hadir).toFixed(1) : '0';

    const sesiTerpakai = s ? (s.total_pertemuan - s.sisa_pertemuan) : 0;
    const sesiPct      = s && s.total_pertemuan > 0 ? Math.round((sesiTerpakai / s.total_pertemuan) * 100) : 0;

    const pctColor  = pctHdr >= 75 ? '#16a34a' : '#dc2626';
    const pctBg     = pctHdr >= 75 ? '#f0fdf4' : '#fef2f2';
    const pctBorder = pctHdr >= 75 ? '#bbf7d0' : '#fecaca';

    const presRows = d.presensi.length
      ? d.presensi.map((p, i) => {
          const isHadir = _isHadirLike(p);
          const isIzin  = _statusEfektif(p) === 'IZIN';
          const rowBg   = i % 2 === 1 ? '#fafafa' : '#ffffff';
          const badge   = isHadir
            ? 'background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;'
            : isIzin
            ? 'background:#fef9c3;color:#a16207;border:1px solid #fef08a;'
            : 'background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;';
          const stars = isHadir && parseInt(p.bintang) > 0
            ? `<span style="color:#f59e0b;font-size:16px;letter-spacing:1px;">${'★'.repeat(Math.min(parseInt(p.bintang)||0,6))}</span><span style="color:#d1d5db;font-size:16px;">${'★'.repeat(Math.max(0,6-Math.min(parseInt(p.bintang)||0,6)))}</span>`
            : `<span style="color:#d1d5db;">—</span>`;
          // RESCHEDULE = sesi pengganti yang beneran dihadiri — label ke orang
          // tua dibikin jelas, jangan tampilin istilah teknis "RESCHEDULE" mentah.
          const labelStatus = p.status === 'RESCHEDULE' ? 'HADIR (Pengganti)' : _statusEfektif(p);
          return `<tr style="background:${rowBg};border-bottom:1px solid #f1f5f9;">
            <td style="padding:11px 14px;font-size:14px;color:#94a3b8;text-align:center;font-weight:600;">${i+1}</td>
            <td style="padding:11px 14px;font-size:15px;color:#1e293b;font-weight:500;">${_fmtTgl(p.tanggal)}</td>
            <td style="padding:11px 14px;">
              <span style="display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:13px;font-weight:700;${badge}">${labelStatus}</span>
            </td>
            <td style="padding:11px 14px;font-size:15px;color:#475569;">${_escapeHtml(p.nama_mentor || '—')}</td>
            <td style="padding:11px 14px;font-size:15px;color:#475569;">${_escapeHtml(p.nama_bab || p.catatan || '—')}</td>
            <td style="padding:11px 14px;text-align:center;">${stars}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="6" style="padding:32px;text-align:center;color:#94a3b8;font-size:15px;">Tidak ada catatan presensi di periode ini</td></tr>`;

    const kesimpulan = _buildKesimpulan(d.nama_murid, hadir, total, pctHdr, parseFloat(avgBtng), d.program);

    const html = `
    <div style="font-family:'DM Sans',Arial,sans-serif;color:#111827;line-height:1.6;max-width:100%;overflow:hidden;background:#f8fafc;">

      <!-- ══ HEADER ══ -->
      <div class="lwr-header" style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 60%,#2563eb 100%);padding:28px 36px 24px;position:relative;overflow:hidden;">
        <div style="position:absolute;top:-30px;right:-30px;width:180px;height:180px;background:rgba(255,255,255,.05);border-radius:50%;"></div>
        <div style="position:absolute;bottom:-50px;right:60px;width:120px;height:120px;background:rgba(255,255,255,.04);border-radius:50%;"></div>
        <div class="lwr-header-top" style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;">
          <div>
            <div style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-.5px;font-family:'Fredoka One',cursive;">EduHome</div>
            <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:2px;letter-spacing:.1em;text-transform:uppercase;">Sistem Bimbingan Belajar</div>
          </div>
          <div class="lwr-header-badge" style="text-align:right;">
            <div style="font-size:15px;font-weight:700;color:#fff;background:rgba(255,255,255,.15);padding:5px 12px;border-radius:20px;backdrop-filter:blur(4px);display:inline-block;">Laporan Perkembangan</div>
            <div style="font-size:13px;color:rgba(255,255,255,.6);margin-top:6px;">${_escapeHtml(d.periode)}</div>
          </div>
        </div>
        <!-- Nama murid -->
        <div class="lwr-murid-box" style="margin-top:20px;background:rgba(255,255,255,.12);border-radius:12px;padding:14px 20px;display:flex;align-items:center;gap:16px;backdrop-filter:blur(4px);">
          <div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:#fff;flex-shrink:0;">
            ${_escapeHtml((d.nama_murid||'?')[0].toUpperCase())}
          </div>
          <div class="lwr-murid-split" style="display:flex;align-items:center;gap:0;flex:1;min-width:0;">
            <div class="lwr-nama-col" style="flex:1;border-right:1px solid rgba(255,255,255,.2);padding-right:20px;min-width:0;">
              <div style="font-size:12px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;">Nama Murid</div>
              <div style="font-size:18px;font-weight:700;color:#fff;overflow-wrap:break-word;">${_escapeHtml(d.nama_murid)}</div>
            </div>
            <div class="lwr-program-col" style="flex:1;padding-left:20px;min-width:0;">
              <div style="font-size:12px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;">Program</div>
              <div style="font-size:18px;font-weight:700;color:#fff;overflow-wrap:break-word;">${_escapeHtml(d.program)}</div>
            </div>
          </div>
          <div class="lwr-sisa" style="margin-left:auto;text-align:right;display:${s?'block':'none'}">
            <div style="font-size:13px;color:rgba(255,255,255,.55);">Sisa Sesi</div>
            <div style="font-size:24px;font-weight:800;color:#fff;">${s ? s.sisa_pertemuan : '–'}</div>
          </div>
        </div>
      </div>

      <!-- ══ BODY ══ -->
      <div class="lwr-body" style="padding:24px 32px;">

        <!-- ── KPI KEHADIRAN ── -->
        <div class="lwr-kpi-grid lwr-nobreak" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
          ${_statBox('Total Sesi', total, 'calendar', '#1e293b', '#2563eb', '#f8fafc', '#e2e8f0')}
          ${_statBox('Hadir', hadir, 'check', '#15803d', '#15803d', '#f0fdf4', '#bbf7d0')}
          ${_statBox('Tidak Hadir', tidakHadir, 'x', '#b91c1c', '#b91c1c', '#fef2f2', '#fecaca')}
          ${_statBox('Kehadiran', pctHdr + '%', 'bar-chart', pctColor, pctColor, pctBg, pctBorder)}
        </div>

        <!-- ── INFO PAKET BELAJAR ── -->
        ${s ? `
        <div class="lwr-nobreak" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.05);">
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:12px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> Info Paket Belajar</div>
          <div class="lwr-info-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div style="background:#f8fafc;border-radius:8px;padding:10px 14px;">
              <div style="font-size:12px;color:#94a3b8;margin-bottom:2px;">Periode</div>
              <div style="font-size:15px;font-weight:600;color:#1e293b;">${_fmtTgl(s.periode_mulai)} – ${_fmtTgl(s.periode_akhir)}</div>
            </div>
            <div style="background:#f8fafc;border-radius:8px;padding:10px 14px;">
              <div style="font-size:12px;color:#94a3b8;margin-bottom:2px;">Paket Sesi</div>
              <div style="font-size:15px;font-weight:600;color:#1e293b;">${sesiTerpakai} / ${s.total_pertemuan} sesi terpakai</div>
            </div>
          </div>
          <div style="margin-top:12px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:#64748b;margin-bottom:5px;">
              <span>Progress sesi</span><span style="font-weight:700;color:#2563eb;">${sesiPct}%</span>
            </div>
            <div style="background:#e2e8f0;border-radius:99px;height:8px;overflow:hidden;">
              <div style="width:${sesiPct}%;height:100%;background:linear-gradient(90deg,#2563eb,#60a5fa);border-radius:99px;"></div>
            </div>
          </div>
        </div>` : ''}

        <!-- ── TABEL PRESENSI ── -->
        <div class="lwr-table-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:24px;box-shadow:0 1px 4px rgba(0,0,0,.05);">
          <div style="padding:14px 20px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:8px;">
            <span style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> Detail Presensi</span>
          </div>
          <div class="lwr-table-scroll" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;min-width:500px;">
              <thead>
                <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0;">
                  <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;width:36px;">#</th>
                  <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;">Tanggal</th>
                  <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;">Status</th>
                  <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;">Mentor</th>
                  <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;">Materi / Catatan</th>
                  <th style="padding:10px 14px;text-align:center;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;">Nilai</th>
                </tr>
              </thead>
              <tbody>${presRows}</tbody>
            </table>
          </div>
        </div>

        <!-- ── RINGKASAN OTOMATIS ── -->
        <div class="lwr-nobreak" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:18px 20px;margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#3b82f6;margin-bottom:8px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Ringkasan Periode Ini</div>
          <p style="font-size:16px;color:#1e3a8a;line-height:1.8;margin:0;">${kesimpulan}</p>
        </div>

        <!-- ── CATATAN MENTOR ── -->
        <div class="lwr-nobreak" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;margin-bottom:32px;box-shadow:0 1px 4px rgba(0,0,0,.05);">
          <div style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-bottom:10px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Catatan Mentor untuk Orang Tua</div>
          <p style="font-size:16px;color:#334155;line-height:1.85;margin:0;white-space:pre-line;">${_escapeHtml(d.catatanMentor)}</p>
        </div>

      </div>

      <!-- ══ FOOTER ══ -->
      <div class="lwr-footer lwr-nobreak" style="border-top:1px solid #e2e8f0;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;">
        <div style="font-size:13px;color:#94a3b8;line-height:1.7;">
          Digenerate otomatis oleh sistem EduHome<br>
          <span style="color:#64748b;">${d.dibuatPada}</span>
        </div>
        <div style="text-align:center;">
          <div style="height:40px;border-right:1px solid #cbd5e1;"></div>
          <div style="margin-top:4px;font-size:14px;font-weight:700;color:#334155;">Tim EduHome</div>
        </div>
      </div>

    </div>`;

    document.getElementById('lw-preview-content').innerHTML = html;
  }

  function _statBox(label, val, iconType, textColor, iconColor, bg, border) {
    return `<div style="background:${bg};border:1px solid ${border};border-radius:12px;padding:20px 14px;text-align:center;">
      <div style="font-size:34px;font-weight:800;color:${textColor};line-height:1;">${val}</div>
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin-top:8px;">${label}</div>
    </div>`;
  }

  function _sectionTitle(text) {
    return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
      <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;white-space:nowrap;">${text}</span>
      <div style="flex:1;height:1px;background:#e2e8f0;"></div>
    </div>`;
  }

  function _buildKesimpulan(nama, hadir, total, pct, avg, program) {
    const parts = [];
    if (total === 0) {
      parts.push(`${nama} tidak memiliki catatan kehadiran di periode ini.`);
    } else if (pct === 100) {
      parts.push(`${nama} hadir di seluruh ${total} sesi belajar periode ini — kehadiran sempurna!`);
    } else if (pct >= 75) {
      parts.push(`${nama} hadir ${hadir} dari ${total} sesi (${pct}%), cukup konsisten.`);
    } else {
      parts.push(`${nama} hanya hadir ${hadir} dari ${total} sesi (${pct}%). Kehadiran perlu ditingkatkan.`);
    }
    if (hadir > 0) {
      if (avg >= 5.5)      parts.push(`Nilai rata-rata ${avg} bintang menunjukkan performa sangat baik dalam program ${program}.`);
      else if (avg >= 4.0) parts.push(`Nilai rata-rata ${avg} bintang menunjukkan perkembangan yang baik.`);
      else if (avg >= 3.0) parts.push(`Nilai rata-rata ${avg} bintang — masih ada ruang untuk berkembang lebih jauh.`);
      else                 parts.push(`Nilai rata-rata ${avg} bintang, perlu perhatian lebih untuk meningkatkan pemahaman materi.`);
    }
    return parts.join(' ');
  }

  function _clearPreview() {
    _previewData = null;
    const wrap = document.getElementById('lw-preview-wrap');
    if (wrap) wrap.style.display = 'none';
    const content = document.getElementById('lw-preview-content');
    if (content) content.innerHTML = '';
    // Tombol selalu aktif — jangan disable
    // Hapus tombol reset kalau ada
    document.getElementById('lw-btn-reset')?.remove();
  }

  function _injectResetButton() {
    // Jangan dobel
    if (document.getElementById('lw-btn-reset')) return;
    const btn = document.createElement('button');
    btn.id        = 'lw-btn-reset';
    btn.className = 'btn btn-outline';
    btn.innerHTML = '<i data-lucide="rotate-ccw"></i> Buat Laporan Baru';
    btn.style.marginLeft = '8px';
    btn.onclick = () => {
      _clearPreview();
      // Reset form
      SD.clear('lw-murid');
      const catatan = document.getElementById('lw-catatan-mentor');
      if (catatan) catatan.value = '';
      _selectedSPP = null;
      _sppList     = [];
      _updatePeriodeDisplay();
      _checkEnablePreview();
    };
    // Sisipkan setelah tombol cetak
    const printBtn = document.getElementById('lw-btn-print');
    if (printBtn) {
      printBtn.parentNode.insertBefore(btn, printBtn.nextSibling);
      lucide.createIcons({ nodes: [btn] });
    }
  }

  async function printPDF() {
    const muridSel   = document.getElementById('lw-murid');
    const catatanVal = document.getElementById('lw-catatan-mentor')?.value?.trim();

    if (!muridSel?.value || !_selectedSPP) {
      UI.toast('Pilih murid dan periode SPP terlebih dahulu', 'error');
      return;
    }    if (!catatanVal) {
      UI.toast('Catatan mentor wajib diisi sebelum cetak', 'error');
      document.getElementById('lw-catatan-mentor')?.focus();
      return;
    }

    const printBtn = document.getElementById('lw-btn-print');
    if (printBtn) { printBtn.disabled = true; printBtn.innerHTML = '<div class="spinner spinner-sm"></div> Memuat...'; }

    try {
      const presRes = await API.presensi.getByMurid(muridSel.value);
      // Filter berdasarkan ID_SPP (relasi eksplisit) untuk paket siklus 12-sesi
      // (jenis_siklus=BARU); fallback ke date-range untuk paket LAMA yang
      // presensinya tidak punya id_spp tersimpan — behavior existing dipertahankan.
      const allPres = (presRes.data || []).filter(p => {
        if (_selectedSPP.jenis_siklus === 'BARU') {
          return p.id_spp === _selectedSPP.id;
        }
        return p.tanggal >= _selectedSPP.periode_mulai &&
               p.tanggal <= (_selectedSPP.periode_akhir || '9999-12-31');
      });

      const muridOpt = muridSel.options[muridSel.selectedIndex];
      const data = {
        nama_murid:    muridOpt.dataset.nama,
        program:       muridOpt.dataset.program,
        periode:       `${_fmtTgl(_selectedSPP.periode_mulai)} – ${_selectedSPP.periode_akhir ? _fmtTgl(_selectedSPP.periode_akhir) : 'Siklus berjalan'}`,
        periodeRaw:    `${_selectedSPP.periode_mulai} s/d ${_selectedSPP.periode_akhir || '(siklus berjalan)'}`,
        presensi:      allPres,
        sppAktif:      _selectedSPP,
        catatanMentor: catatanVal,
        dibuatPada:    new Date().toLocaleDateString('id-ID', { day:'2-digit', month:'long', year:'numeric' })
      };

      _previewData = data;
      _renderHTML(data);

      const content = document.getElementById('lw-preview-content')?.innerHTML;
      if (!content) { UI.toast('Gagal generate laporan', 'error'); return; }

      const htmlContent = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Laporan ${data.nama_murid} — ${data.periode}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Fredoka+One&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'DM Sans', Arial, sans-serif; background: #fff; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print {
      body { margin: 0; }
      @page { size: A4 portrait; margin: 14mm 0 0 0; }
      @page :first { margin-top: 0; }
      * { max-width: 100% !important; overflow: visible !important; }
      canvas { max-width: 100% !important; height: auto !important; }
      table { width: 100% !important; }
      /* Box-box pendek (KPI, Info Paket, Ringkasan, Catatan Mentor, Footer) dipaksa
         pindah utuh ke halaman berikutnya kalau gak muat, bukan kepotong di tengah.
         Tabel presensi sengaja TIDAK dikasih ini (wajar nyambung ke halaman 2),
         tapi tiap barisnya (<tr>) tetap dijaga gak kepotong di tengah baris. */
      .lwr-nobreak {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .lwr-table-scroll tr {
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
    /* Laporan tetap pakai layout desktop apa adanya (identik di laptop & HP).
       Di layar sempit, wrapper report punya lebar minimum tetap (lihat
       .lwr-report-wrap di bawah) supaya tidak reflow/berantakan —
       tinggal digeser (scroll) atau di-pinch-zoom kalau mau baca detail,
       persis kayak buka file PDF biasa. */
    @media screen {
      .lwr-report-wrap { min-width: 760px; }
      body { overflow-x: auto; }
    }
  </style>
</head>
<body><div class="lwr-report-wrap">${content}</div><script>window.onload = () => { window.focus(); window.print(); }<\/script></body>
</html>`;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank', 'width=900,height=700');
      if (!win) { UI.toast('Popup diblokir browser. Izinkan popup untuk mencetak.', 'error'); return; }
      setTimeout(() => URL.revokeObjectURL(url), 10000);

    } catch(e) {
      console.error(e);
      UI.toast('Gagal memuat data laporan', 'error');
    } finally {
      if (printBtn) { printBtn.disabled = false; printBtn.innerHTML = '<i data-lucide="printer"></i> Cetak / Download PDF'; lucide.createIcons({ nodes: [printBtn] }); }
      // Tampilkan tombol "Buat Laporan Baru" setelah printBtn selesai di-restore
      if (_previewData) _injectResetButton();
    }
  }

  function _fmtTgl(str) {
    if (!str) return '–';
    return new Date(str + 'T00:00:00').toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
  }

  function _escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { load, onMuridChange, onFilterChange, printPDF, openPeriodePicker, closePeriodePicker, selectSPP, confirmPeriode, _clearPreview };
})();

window.LaporanWaliPage = LaporanWaliPage;