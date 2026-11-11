// ============================================================
// PresensiReschedule — modal bersama untuk mencatat sesi pengganti
// (makeup) atas sebuah IZIN yang masih menunggu, sesuai aturan
// siklus 12-sesi: 1 IZIN + 1 RESCHEDULE tetap 1 slot (bukan 2).
//
// Dipakai dari tombol "Jadwalkan Ulang" di tabel Presensi.js (ADMIN)
// maupun Mentor-presensi.js (MENTOR) — reload target ditentukan oleh
// siapa yang membuka modal (lihat _reloadTarget).
// ============================================================

const PresensiReschedule = (() => {
  let _reloadTarget = null; // 'admin' | 'mentor'

  // Dipanggil dari tombol di baris tabel presensi (ADMIN atau MENTOR).
  // row: objek presensi (hasil getPresensi) dengan status IZIN pending.
  function open(row, source) {
    _reloadTarget = source || 'admin';
    document.getElementById('reschedule-id-izin-field').value = row.id;
    document.getElementById('reschedule-nama-murid').value    = row.nama_murid || '';
    document.getElementById('reschedule-tanggal').value       = '';
    document.getElementById('reschedule-catatan').value       = '';
    document.getElementById('reschedule-bintang').value       = 7;

    const infoEl = document.getElementById('reschedule-info-text');
    if (infoEl) {
      const deadline = row.deadline_makeup
        ? new Date(row.deadline_makeup + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
        : '-';
      infoEl.textContent = `Izin pada ${UI.formatDate(row.tanggal)} — batas makeup: ${deadline}`;
    }

    UI.openModal('modal-presensi-reschedule');
  }

  async function save() {
    const btn      = document.getElementById('reschedule-save-btn');
    const id_izin   = document.getElementById('reschedule-id-izin-field').value;
    const tanggal   = document.getElementById('reschedule-tanggal').value;
    const catatan   = document.getElementById('reschedule-catatan').value;
    const bintang   = document.getElementById('reschedule-bintang').value;

    if (!id_izin || !tanggal) { UI.toast('Tanggal makeup wajib diisi', 'error'); return; }

    const user = API.currentUser();

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyimpan...'; }
      const res = await API.presensi.reschedule({
        id_izin,
        tanggal,
        id_mentor:   user.mentor_id   || '',
        nama_mentor: user.nama_mentor || user.username || '',
        catatan,
        bintang: Number(bintang) || 0
      });
      if (res.status === 'OK') {
        UI.toast(res.message || 'Sesi pengganti berhasil dicatat', 'success');
        UI.closeModal('modal-presensi-reschedule');
        if (_reloadTarget === 'mentor' && window.MentorPresensiPage) MentorPresensiPage.load(true);
        else if (window.PresensiPage) PresensiPage.load(true);
      } else {
        UI.toast(res.message || 'Gagal mencatat sesi pengganti', 'error');
      }
    } catch(e) {
      UI.toast('Gagal terhubung ke server', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="calendar-check"></i> Simpan Makeup'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  return { open, save };
})();

window.PresensiReschedule = PresensiReschedule;