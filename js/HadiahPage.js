const HadiahPage = (() => {
  let progressData      = [];
  let riwayatData        = [];
  let tierData           = [];
  let currentTab          = 'progress';
  let isProgressFetched  = false;
  let isRiwayatFetched   = false;
  let isTierFetched      = false;

  // Data buat modal klaim yang lagi dibuka
  let klaimIdMurid       = null;
  let klaimListData       = { riwayat: [], progress: null };

  // ── Entry point, dipanggil dari Main.js saat navigate ke halaman ini ─────
  function load() {
    const role   = API.currentRole();
    const canManageTier = role === 'ADMIN' || role === 'OWNER';

    const tabTierBtn = document.getElementById('hadiah-tab-tier');
    const btnTambah  = document.getElementById('btn-tambah-tier-hadiah');
    if (tabTierBtn) tabTierBtn.style.display = canManageTier ? 'inline-flex' : 'none';
    if (btnTambah)  btnTambah.style.display  = canManageTier ? 'inline-flex' : 'none';

    switchTab(currentTab || 'progress');
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  function switchTab(tab) {
    currentTab = tab;

    ['progress', 'riwayat', 'tier'].forEach(t => {
      const btn   = document.getElementById('hadiah-tab-' + t);
      const panel = document.getElementById('hadiah-panel-' + t);
      if (btn)   btn.classList.toggle('filter-btn-active', t === tab);
      if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
    });

    if (tab === 'progress') loadProgress();
    if (tab === 'riwayat')  loadRiwayat();
    if (tab === 'tier')     loadTier();
  }

  // ── Tab: Progress Murid ───────────────────────────────────────────────────
  // Backend: getProgressBintang TANPA id_murid → balikin progress semua murid
  // Field per item: id_murid, nama_murid, bintang_terkumpul, tier_ke,
  //                 target_sekarang, hadiah_sekarang, sisa_menuju_hadiah
  async function loadProgress(forceRefresh = false) {
    const wrap = document.getElementById('hadiah-progress-list');
    if (!wrap) return;

    if (!forceRefresh && isProgressFetched) { renderProgress(progressData); return; }

    wrap.innerHTML = '<div class="empty-row"><div class="spinner spinner-sm"></div> Memuat progress...</div>';
    try {
      const res = await API.hadiah.getProgress();
      if (res.status === 'OK') {
        progressData      = res.data || [];
        isProgressFetched  = true;
        renderProgress(progressData);
      } else {
        wrap.innerHTML = `<div class="empty-row">${UI.escape(res.message || 'Gagal memuat data')}</div>`;
      }
    } catch(e) {
      wrap.innerHTML = '<div class="empty-row">Gagal terhubung ke server.</div>';
    }
  }

  function searchProgress(term) {
    const t = (term || '').toLowerCase();
    renderProgress(progressData.filter(p => (p.nama_murid || '').toLowerCase().includes(t)));
  }

  function renderProgress(list) {
    const wrap = document.getElementById('hadiah-progress-list');
    if (!wrap) return;

    const role       = API.currentRole();
    const canClaim   = role === 'ADMIN' || role === 'OWNER';

    if (!list.length) {
      wrap.innerHTML = '<div class="empty-row">Belum ada data progress murid. Pastikan murid sudah punya catatan bintang dari Presensi.</div>';
      return;
    }

    wrap.innerHTML = list.map(p => {
      const total       = p.bintang_terkumpul ?? 0;
      const target      = p.target_sekarang   ?? null;
      const namaNext    = p.hadiah_sekarang   ?? null;
      const pct         = target ? Math.min(100, Math.round((total / target) * 100)) : 0;
      const bisaDiklaim = !!p.bisa_diklaim;

      return `
        <div style="padding:12px 14px;border:1px solid ${bisaDiklaim ? 'var(--primary)' : 'var(--border)'};border-radius:10px;background:var(--bg-surface);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">
            <strong style="font-size:0.88rem;">${UI.escape(p.nama_murid || '')}</strong>
            <div style="display:flex;align-items:center;gap:8px;">
              ${bisaDiklaim ? `<span style="font-size:0.72rem;font-weight:600;color:var(--primary);">🎁 siap diambil</span>` : ''}
              <span style="font-size:0.78rem;color:var(--text-secondary);">
                ${target ? `${total}/${target} menuju ${UI.escape(namaNext || 'hadiah')}` : `${total} ⭐ (belum ada tier dikonfigurasi)`}
              </span>
              ${canClaim ? `
                <button class="ctrl-btn icon-only" onclick="HadiahPage.openClaimModal('${p.id_murid}')" title="Hadiah"
                  style="${bisaDiklaim ? 'border-color:var(--primary);color:var(--primary);' : ''}">
                  <i data-lucide="gift"></i>
                </button>` : ''}
            </div>
          </div>
          <div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden;">
            <div style="height:100%;background:var(--primary);border-radius:99px;width:${pct}%;"></div>
          </div>
        </div>`;
    }).join('');

    if (canClaim) lucide.createIcons({ nodes: [wrap] });
  }

  // ── Tab: Riwayat Hadiah ───────────────────────────────────────────────────
  // Field: id, tanggal, id_murid, nama_murid, nama_hadiah, target_bintang,
  //        tier_ke, status (BELUM_DIAMBIL/SUDAH_DIAMBIL), tanggal_diambil
  async function loadRiwayat(forceRefresh = false) {
    const tbody = document.getElementById('hadiah-riwayat-tbody');
    if (!tbody) return;

    if (!forceRefresh && isRiwayatFetched) { renderRiwayat(riwayatData); return; }

    tbody.innerHTML = '<tr><td colspan="5" class="empty-row"><div class="spinner spinner-sm"></div> Memuat riwayat...</td></tr>';
    try {
      const res = await API.hadiah.getRiwayat();
      if (res.status === 'OK') {
        // Defensif: sejak klaim jadi manual & atomic, row baru selalu
        // langsung SUDAH_DIAMBIL. Kalau ada row BELUM_DIAMBIL, itu
        // peninggalan sistem lama (auto-cycle) — jangan ditampilin sampai
        // dibersihin lewat bersihkanTrxHadiahBelumDiambil() di GAS editor.
        riwayatData     = (res.data || []).filter(r => String(r.status || 'SUDAH_DIAMBIL').toUpperCase() === 'SUDAH_DIAMBIL');
        isRiwayatFetched = true;
        renderRiwayat(riwayatData);
      } else {
        tbody.innerHTML = `<tr><td colspan="5" class="empty-row">${UI.escape(res.message || 'Gagal memuat data')}</td></tr>`;
      }
    } catch(e) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Gagal terhubung ke server.</td></tr>';
    }
  }

  function searchRiwayat(term) {
    const t = (term || '').toLowerCase();
    renderRiwayat(riwayatData.filter(r =>
      (r.nama_murid  || '').toLowerCase().includes(t) ||
      (r.nama_hadiah || '').toLowerCase().includes(t)
    ));
  }

  function renderRiwayat(list) {
    const tbody = document.getElementById('hadiah-riwayat-tbody');
    if (!tbody) return;

    const role     = API.currentRole();
    const canBatal = role === 'ADMIN' || role === 'OWNER';

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-row">Belum ada riwayat hadiah.</td></tr>';
      return;
    }

    // Sejak klaim jadi manual & atomic, semua row baru otomatis SUDAH_DIAMBIL —
    // jadi kolom "status" gak banyak gunanya lagi. Diganti kolom "Aksi": tombol
    // Batalkan cuma nongol di klaim PALING BARU tiap murid (list ini udah
    // newest-first dari backend, jadi kemunculan pertama id_murid = yang terakhir),
    // sesuai batasan _batalkanKlaimTerakhir di backend (gak boleh loncat urutan).
    const seenMurid = new Set();

    tbody.innerHTML = list.map(r => {
      const isLatest = !seenMurid.has(r.id_murid);
      seenMurid.add(r.id_murid);

      let aksi = '<span style="font-size:0.72rem;color:var(--text-secondary);">—</span>';
      if (canBatal && isLatest) {
        aksi = `<a href="#" onclick="event.preventDefault();HadiahPage.batalkanKlaimRiwayat('${r.id}','${r.id_murid}',this)" style="color:var(--danger,#ef4444);font-size:0.78rem;font-weight:600;">Batalkan</a>`;
      }

      return `
      <tr>
        <td>${UI.formatDate(r.tanggal_diambil || r.tanggal)}</td>
        <td><strong>${UI.escape(r.nama_murid)}</strong></td>
        <td>${UI.escape(r.nama_hadiah)} <span style="color:var(--text-secondary);font-size:0.75rem;">(tier ${r.tier_ke})</span></td>
        <td>${r.target_bintang ?? '-'} ⭐</td>
        <td>${aksi}</td>
      </tr>`;
    }).join('');
  }

  // ── Batalkan klaim langsung dari tab Riwayat (tanpa buka modal per-murid).
  //    Cuma dipanggil untuk row yang isLatest (tombol Batalkan cuma di-render
  //    di situ), tapi backend tetap jadi validasi akhir.
  async function batalkanKlaimRiwayat(id, idMurid, linkEl) {
    const ok = await UI.confirm(
      'Bintang yang kepotong akan dikembalikan ke progress murid.',
      { title: 'Batalkan Pengambilan Hadiah', okLabel: 'Ya, Batalkan', okClass: 'btn btn-danger', icon: 'undo-2' }
    );
    if (!ok) return;

    const labelAsli = linkEl ? linkEl.textContent : '';
    if (linkEl) {
      linkEl.textContent = 'Membatalkan...';
      linkEl.style.pointerEvents = 'none';
      linkEl.style.opacity = '0.6';
    }

    try {
      const res = await API.hadiah.undoClaim(id, idMurid);
      if (res.status === 'OK') {
        UI.toast(res.data?.message || 'Pengambilan hadiah dibatalkan', 'success');
        isProgressFetched = false; // biar tab Progress ke-refresh saat dibuka
        loadRiwayat(true);
      } else {
        UI.toast(res.message || 'Gagal membatalkan klaim', 'error');
        if (linkEl) { linkEl.textContent = labelAsli; linkEl.style.pointerEvents = ''; linkEl.style.opacity = ''; }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server.', 'error');
      if (linkEl) { linkEl.textContent = labelAsli; linkEl.style.pointerEvents = ''; linkEl.style.opacity = ''; }
    }
  }

  // ── Tab: Atur Tier (ADMIN/OWNER) ──────────────────────────────────────────
  // Field: id, scope_type (MURID/KELAS/PROGRAM/DEFAULT), scope_value,
  //        urutan, target_bintang, nama_hadiah, keterangan
  async function loadTier(forceRefresh = false) {
    const tbody = document.getElementById('hadiah-tier-tbody');
    if (!tbody) return;

    if (!forceRefresh && isTierFetched) { renderTier(tierData); return; }

    tbody.innerHTML = '<tr><td colspan="6" class="empty-row"><div class="spinner spinner-sm"></div> Memuat tier...</td></tr>';
    try {
      const res = await API.hadiah.getTiers();
      if (res.status === 'OK') {
        tierData = (res.data || []).sort((a, b) => {
          if (a.scope_type !== b.scope_type) return String(a.scope_type).localeCompare(String(b.scope_type));
          return (a.urutan || 0) - (b.urutan || 0);
        });
        isTierFetched = true;
        renderTier(tierData);
      } else {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-row">${UI.escape(res.message || 'Gagal memuat data')}</td></tr>`;
      }
    } catch(e) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Gagal terhubung ke server.</td></tr>';
    }
  }

  function renderTier(list) {
    const tbody = document.getElementById('hadiah-tier-tbody');
    if (!tbody) return;

    const role    = API.currentRole();
    const canEdit = role === 'ADMIN' || role === 'OWNER';

    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">Belum ada tier hadiah. Tambah tier DEFAULT dulu biar semua murid punya progress.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(t => `
      <tr>
        <td><span class="program-tag">${UI.escape(t.scope_type)}</span> ${t.scope_value ? UI.escape(t.scope_value) : ''}</td>
        <td>${t.urutan}</td>
        <td><strong>${UI.escape(t.nama_hadiah)}</strong></td>
        <td>${t.target_bintang} ⭐</td>
        <td>${UI.escape(t.keterangan || '-')}</td>
        <td>
          ${canEdit ? `
            <button class="ctrl-btn icon-only" onclick="HadiahPage.openEditTier('${t.id}')" title="Edit">
              <i data-lucide="pencil"></i>
            </button>
            <button class="ctrl-btn icon-only" onclick="HadiahPage.deleteTier('${t.id}')" title="Hapus">
              <i data-lucide="trash-2"></i>
            </button>` : '-'}
        </td>
      </tr>`).join('');
    lucide.createIcons({ nodes: [tbody] });
  }

  function openAddTier() {
    document.getElementById('modal-hadiah-tier-title').textContent = 'Tambah Tier Hadiah';
    document.getElementById('hadiah-tier-id-field').value       = '';
    document.getElementById('hadiah-tier-scope-type').value     = 'DEFAULT';
    document.getElementById('hadiah-tier-scope-value').value    = '';
    document.getElementById('hadiah-tier-urutan').value         = '';
    document.getElementById('hadiah-tier-nama').value           = '';
    document.getElementById('hadiah-tier-target').value         = '';
    document.getElementById('hadiah-tier-keterangan').value     = '';
    onScopeTypeChange();
    UI.openModal('modal-hadiah-tier');
  }

  function openEditTier(id) {
    const t = tierData.find(x => String(x.id) === String(id));
    if (!t) return;
    document.getElementById('modal-hadiah-tier-title').textContent = 'Edit Tier Hadiah';
    document.getElementById('hadiah-tier-id-field').value       = t.id;
    document.getElementById('hadiah-tier-scope-type').value     = t.scope_type || 'DEFAULT';
    document.getElementById('hadiah-tier-scope-value').value    = t.scope_value || '';
    document.getElementById('hadiah-tier-urutan').value         = t.urutan || '';
    document.getElementById('hadiah-tier-nama').value           = t.nama_hadiah || '';
    document.getElementById('hadiah-tier-target').value         = t.target_bintang || '';
    document.getElementById('hadiah-tier-keterangan').value     = t.keterangan || '';
    onScopeTypeChange();
    UI.openModal('modal-hadiah-tier');
  }

  // Scope_value cuma relevan kalau scope_type bukan DEFAULT
  function onScopeTypeChange() {
    const scopeType  = document.getElementById('hadiah-tier-scope-type').value;
    const scopeWrap  = document.getElementById('hadiah-tier-scope-value-wrap');
    if (scopeWrap) scopeWrap.style.display = (scopeType === 'DEFAULT') ? 'none' : 'block';
  }

  async function saveTier() {
    const id             = document.getElementById('hadiah-tier-id-field').value;
    const scope_type      = document.getElementById('hadiah-tier-scope-type').value;
    const scope_value      = document.getElementById('hadiah-tier-scope-value').value.trim();
    const urutan          = parseInt(document.getElementById('hadiah-tier-urutan').value) || 0;
    const nama_hadiah      = document.getElementById('hadiah-tier-nama').value.trim();
    const target_bintang  = parseInt(document.getElementById('hadiah-tier-target').value) || 0;
    const keterangan      = document.getElementById('hadiah-tier-keterangan').value.trim();

    if (!urutan || !target_bintang || !nama_hadiah) {
      UI.toast('Urutan, target bintang, dan nama hadiah wajib diisi', 'error'); return;
    }
    if (scope_type !== 'DEFAULT' && !scope_value) {
      UI.toast(`Isi ${scope_type.toLowerCase()} tujuan tier ini`, 'error'); return;
    }

    const btn = document.getElementById('hadiah-tier-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = `<div class="spinner spinner-sm"></div> Menyimpan...`; }

    try {
      const payload = { scope_type, scope_value, urutan, target_bintang, nama_hadiah, keterangan };
      const res = id
        ? await API.hadiah.updateTier({ id, ...payload })
        : await API.hadiah.addTier(payload);

      if (res.status === 'OK') {
        UI.toast(res.data?.message || (id ? 'Tier diperbarui' : 'Tier berhasil ditambahkan'), 'success');
        UI.closeModal('modal-hadiah-tier');
        loadTier(true);
        loadProgress(true); // target tier bisa berubah, refresh biar progress bar akurat
      } else {
        UI.toast(res.message || 'Gagal menyimpan tier', 'error');
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan Tier'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  async function deleteTier(id) {
    const t = tierData.find(x => String(x.id) === String(id));
    if (!await UI.confirmDelete(t ? t.nama_hadiah : 'tier ini', 'tier hadiah')) return;
    try {
      const res = await API.hadiah.deleteTier(id);
      if (res.status === 'OK') {
        UI.toast('Tier berhasil dihapus', 'success');
        loadTier(true);
      } else {
        UI.toast(res.message || 'Gagal menghapus tier', 'error');
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server.', 'error');
    }
  }

  // ── Modal: Hadiah per murid (ambil hadiah / batalkan klaim) — ADMIN/OWNER
  // Sumber data: API.hadiah.getRiwayat(idMurid) → histori hadiah yang SUDAH
  // diambil murid ini (urutan terbaru dulu), digabung dengan
  // API.hadiah.getProgress(idMurid) buat kartu tier yang LAGI DIKEJAR
  // sekarang (cuma bisa diklaim kalau bintang udah cukup — sequential,
  // gak bisa loncat tier).
  async function openClaimModal(idMurid) {
    klaimIdMurid  = idMurid;
    klaimListData = { riwayat: [], progress: null };

    const murid = progressData.find(p => String(p.id_murid) === String(idMurid));
    const titleEl = document.getElementById('modal-hadiah-claim-title');
    if (titleEl) titleEl.textContent = `Hadiah — ${murid ? murid.nama_murid : ''}`;

    const wrap = document.getElementById('hadiah-claim-list');
    if (wrap) wrap.innerHTML = '<div class="empty-row"><div class="spinner spinner-sm"></div> Memuat data hadiah...</div>';

    UI.openModal('modal-hadiah-claim');

    try {
      const [resRiwayat, resProgress] = await Promise.all([
        API.hadiah.getRiwayat(idMurid),
        API.hadiah.getProgress(idMurid)
      ]);

      if (resRiwayat.status !== 'OK') {
        if (wrap) wrap.innerHTML = `<div class="empty-row">${UI.escape(resRiwayat.message || 'Gagal memuat data')}</div>`;
        return;
      }
      if (resProgress.status !== 'OK') {
        if (wrap) wrap.innerHTML = `<div class="empty-row">${UI.escape(resProgress.message || 'Gagal memuat progress')}</div>`;
        return;
      }

      // Riwayat dari backend udah newest-first — index 0 = klaim paling
      // terakhir, cuma itu yang boleh dibatalkan (biar urutan tier gak berantakan).
      const riwayat = (resRiwayat.data || []).filter(r => String(r.id_murid) === String(idMurid));

      klaimListData = { riwayat, progress: resProgress.data };
      renderKlaimList(klaimListData);
    } catch(e) {
      if (wrap) wrap.innerHTML = '<div class="empty-row">Gagal terhubung ke server.</div>';
    }
  }

  function renderKlaimList(data) {
    const wrap = document.getElementById('hadiah-claim-list');
    if (!wrap) return;

    const riwayat = data.riwayat || [];
    const p       = data.progress || {};

    // ── Kartu tier yang lagi dikejar sekarang ──────────────────────────
    let currentCard;
    if (!p.target_sekarang) {
      currentCard = `<div class="empty-row">Belum ada tier hadiah dikonfigurasi untuk murid ini.</div>`;
    } else {
      const bisaDiklaim = !!p.bisa_diklaim;
      currentCard = `
        <div style="
          display:flex;justify-content:space-between;align-items:center;gap:10px;
          padding:12px;border:1.5px solid ${bisaDiklaim ? 'var(--primary)' : 'var(--border)'};border-radius:10px;margin-bottom:14px;
          ${bisaDiklaim ? 'background:var(--primary-dim, #eff6ff);' : ''}
        ">
          <div>
            <div style="font-size:0.9rem;font-weight:700;">${UI.escape(p.hadiah_sekarang || '')}</div>
            <div style="font-size:0.78rem;color:var(--text-secondary);">Tier ${p.tier_ke} · ${p.bintang_terkumpul}/${p.target_sekarang} ⭐</div>
          </div>
          ${bisaDiklaim
            ? `<button id="btn-ambil-hadiah" class="btn btn-primary btn-sm" onclick="HadiahPage.ambilHadiah()"><i data-lucide="gift"></i> Ambil</button>`
            : `<span style="font-size:0.72rem;color:var(--text-secondary);">${Math.max(0, p.target_sekarang - p.bintang_terkumpul)} ⭐ lagi</span>`
          }
        </div>`;
    }

    // ── Riwayat pengambilan sebelumnya ──────────────────────────────────
    let riwayatHtml;
    if (riwayat.length) {
      riwayatHtml = riwayat.map((r, idx) => {
        const bolehBatal = idx === 0;
        return `
          <div style="
            display:flex;justify-content:space-between;align-items:center;
            padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;
            background:var(--bg-surface-hover, rgba(0,0,0,0.02));
          ">
            <div>
              <div style="font-size:0.85rem;font-weight:600;text-decoration:line-through;opacity:0.7;">${UI.escape(r.nama_hadiah || '')}</div>
              <div style="font-size:0.75rem;color:var(--text-secondary);">Tier ${r.tier_ke} · ${r.target_bintang} ⭐</div>
            </div>
            <span style="font-size:0.72rem;color:var(--text-secondary);">
              ✓ diambil ${r.tanggal_diambil ? UI.formatDate(r.tanggal_diambil) : ''}
              ${bolehBatal ? `· <a href="#" onclick="event.preventDefault();HadiahPage.batalkanKlaim('${r.id}',this)" style="color:var(--danger,#ef4444);">batalkan</a>` : ''}
            </span>
          </div>`;
      }).join('');
    } else {
      riwayatHtml = `<div style="font-size:0.78rem;color:var(--text-secondary);">Belum ada hadiah yang pernah diambil.</div>`;
    }

    wrap.innerHTML = currentCard + riwayatHtml;
    lucide.createIcons({ nodes: [wrap] });
  }

  // ── Ambil hadiah tier yang lagi dikejar sekarang (sequential — gak bisa
  //    loncat tier). Bintang langsung kepotong sejumlah target tier itu.
  async function ambilHadiah() {
    const idMurid   = klaimIdMurid;
    const murid     = progressData.find(p => String(p.id_murid) === String(idMurid));
    const namaMurid = murid ? murid.nama_murid : '';
    const p         = klaimListData.progress || {};

    const ok = await UI.confirm(
      `Yakin murid ini sudah menerima hadiah <strong>${UI.escape(p.hadiah_sekarang || '')}</strong>?`,
      { title: 'Ambil Hadiah', okLabel: 'Ya, Sudah Diterima', okClass: 'btn btn-primary', icon: 'gift' }
    );
    if (!ok) return;

    const btn = document.getElementById('btn-ambil-hadiah');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner spinner-sm"></div> Memproses...';
    }

    try {
      const res = await API.hadiah.claim(idMurid, namaMurid);
      if (res.status === 'OK') {
        UI.toast(res.data?.message || 'Hadiah berhasil diambil', 'success');
        openClaimModal(idMurid);   // refresh isi modal
        isProgressFetched = false; // biar tab Progress ikut ke-refresh saat dibuka
        isRiwayatFetched  = false; // biar tab Riwayat ikut kebaca ulang saat dibuka
      } else {
        UI.toast(res.message || 'Gagal mengambil hadiah', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="gift"></i> Ambil'; lucide.createIcons({ nodes: [btn] }); }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server.', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="gift"></i> Ambil'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  // ── Batalkan pengambilan hadiah TERAKHIR (koreksi salah klik) — bintang
  //    yang kepotong dikembalikan.
  async function batalkanKlaim(id, linkEl) {
    const idMurid = klaimIdMurid;
    const ok = await UI.confirm(
      'Bintang yang kepotong akan dikembalikan ke progress murid.',
      { title: 'Batalkan Pengambilan Hadiah', okLabel: 'Ya, Batalkan', okClass: 'btn btn-danger', icon: 'undo-2' }
    );
    if (!ok) return;

    const labelAsli = linkEl ? linkEl.textContent : '';
    if (linkEl) { linkEl.textContent = 'membatalkan...'; linkEl.style.pointerEvents = 'none'; linkEl.style.opacity = '0.6'; }

    try {
      const res = await API.hadiah.undoClaim(id, idMurid);
      if (res.status === 'OK') {
        UI.toast(res.data?.message || 'Pengambilan hadiah dibatalkan', 'success');
        openClaimModal(idMurid);
        isProgressFetched = false;
        isRiwayatFetched  = false;
      } else {
        UI.toast(res.message || 'Gagal membatalkan klaim', 'error');
        if (linkEl) { linkEl.textContent = labelAsli; linkEl.style.pointerEvents = ''; linkEl.style.opacity = ''; }
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server.', 'error');
      if (linkEl) { linkEl.textContent = labelAsli; linkEl.style.pointerEvents = ''; linkEl.style.opacity = ''; }
    }
  }

  // ── Dipanggil dari Presensi.js saat murid dipilih di modal presensi ──────
  async function refreshPresensiWidget(idMurid) {
    const widget = document.getElementById('presensi-progress-widget');
    if (!widget) return;

    if (!idMurid) { widget.style.display = 'none'; return; }

    try {
      const res = await API.hadiah.getProgress(idMurid);
      if (res.status !== 'OK' || !res.data) { widget.style.display = 'none'; return; }

      const p      = res.data;
      const total  = p.bintang_terkumpul ?? 0;
      const target = p.target_sekarang   ?? null;
      const nama   = p.hadiah_sekarang   ?? null;
      const pct    = target ? Math.min(100, Math.round((total / target) * 100)) : 0;

      if (!target) { widget.style.display = 'none'; return; } // belum ada tier utk murid ini

      document.getElementById('presensi-progress-label').textContent = `Progress menuju ${nama || 'hadiah'}`;
      document.getElementById('presensi-progress-text').textContent  = `${total}/${target}`;
      document.getElementById('presensi-progress-bar').style.width   = pct + '%';
      widget.style.display = 'block';
    } catch(e) {
      widget.style.display = 'none';
    }
  }

  return {
    load, switchTab,
    loadProgress, searchProgress,
    loadRiwayat, searchRiwayat,
    loadTier, openAddTier, openEditTier, saveTier, deleteTier, onScopeTypeChange,
    openClaimModal, ambilHadiah, batalkanKlaim, batalkanKlaimRiwayat,
    refreshPresensiWidget
  };
})();

window.HadiahPage = HadiahPage;