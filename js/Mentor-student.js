// ============================================================
// MentorStudentsPage — tampilkan semua murid aktif + statistik
// presensi bulan ini yang diajar mentor ini
// ============================================================

const MentorStudentsPage = (() => {
  let isFetched    = false;
  let _muridCache  = [];
  let _presCache   = [];

  async function load(forceRefresh = false) {
    const container = document.getElementById('mentor-students-grid');
    if (!container) return;

    const user       = API.currentUser();
    const mentorName = user.username || '';

    if (!forceRefresh && isFetched) {
      const now      = new Date();
      const tglMulai = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
      const _akhir   = new Date(now.getFullYear(), now.getMonth()+1, 0);
      const tglAkhir = `${_akhir.getFullYear()}-${String(_akhir.getMonth()+1).padStart(2,'0')}-${String(_akhir.getDate()).padStart(2,'0')}`;
      const presBulanIni = _presCache.filter(p =>
        p.nama_mentor === mentorName &&
        p.tanggal >= tglMulai &&
        p.tanggal <= tglAkhir
      );
      renderStudents(_muridCache, presBulanIni);
      return;
    }

    container.innerHTML = '<div style="padding:32px;text-align:center;"><div class="spinner spinner-sm"></div> Memuat data murid...</div>';

    // Ambil bulan ini untuk filter presensi
    const now      = new Date();
    const tglMulai = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    const _akhir   = new Date(now.getFullYear(), now.getMonth()+1, 0);
    const tglAkhir = `${_akhir.getFullYear()}-${String(_akhir.getMonth()+1).padStart(2,'0')}-${String(_akhir.getDate()).padStart(2,'0')}`;  

    try {
      const [muridRes, presRes] = await Promise.all([
        API.murid.getAll(),
        API.presensi.getAll()
      ]);

      const muridAktif = (muridRes.data || []).filter(m => m.status === 'AKTIF');

      // Filter presensi bulan ini oleh mentor ini (pakai tglMulai/tglAkhir dari atas)
      const presBulanIni = (presRes.data || []).filter(p =>
        p.nama_mentor === mentorName &&
        p.tanggal >= tglMulai &&
        p.tanggal <= tglAkhir
      );

      _muridCache = muridAktif;
      _presCache  = presRes.data || [];
      isFetched   = true;

      renderStudents(muridAktif, presBulanIni);
    } catch(e) { UI.toast('Gagal memuat data: ' + e.message, 'error'); }
  }

  function renderStudents(students, presBulanIni) {
    const container = document.getElementById('mentor-students-grid');
    if (!container) return;
    if (!students.length) {
      container.innerHTML = '<div class="empty-feed" style="padding:32px;text-align:center;">Belum ada murid aktif</div>';
      return;
    }

    const bulanLabel = new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

    container.innerHTML = students.map(s => {
      // Statistik presensi murid ini bulan ini oleh mentor ini
      const presMurid = presBulanIni.filter(p => p.id_murid === s.id);
      const hadir     = presMurid.filter(p => p.status === 'HADIR').length;
      const total     = presMurid.length;
      const pct       = total > 0 ? Math.round((hadir/total)*100) : null;

      const color = s.jk === 'L' ? '#689bee' : '#e76fab';
      const pctBadge = pct !== null
        ? `<span style="font-size:0.72rem;font-weight:700;color:${pct>=75?'#10b981':'#f59e0b'};">${pct}% hadir</span>`
        : `<span style="font-size:0.72rem;color:var(--text-secondary);">Belum ada presensi</span>`;

      return `
      <div class="student-card">
        <div class="student-card-header">
          <div class="avatar-initial" style="width:40px;height:40px;font-size:1rem;background:${color}20;color:${color};">
            ${(s.nama||'?')[0].toUpperCase()}
          </div>
          <div style="flex:1;min-width:0;">
            <div class="student-card-name">${UI.escape(s.nama)}</div>
            <div class="student-card-meta">${UI.escape(s.kelas||'-')} · <span class="program-tag">${UI.escape(s.program)}</span></div>
          </div>
          ${UI.statusBadge(s.status)}
        </div>
        <div class="student-card-body">
          <div class="student-stat">
            <i data-lucide="calendar-days"></i>
            <span style="font-size:0.8rem;color:var(--text-secondary);">Presensi ${bulanLabel}</span>
          </div>
          <div class="student-stat" style="justify-content:space-between;">
            <span style="font-size:0.85rem;">${hadir} hadir / ${total} sesi</span>
            ${pctBadge}
          </div>
        </div>
      </div>`;
    }).join('');

    lucide.createIcons({ nodes: [container] });
  }

  return { load };
})();

window.MentorStudentsPage = MentorStudentsPage;