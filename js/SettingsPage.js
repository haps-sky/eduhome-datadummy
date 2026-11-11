// ============================================================
// SettingsPage — pengaturan-pengaturan global sistem yang sifatnya
// sekali-pasang, dimulai dari saklar Auto-Renew SPP. Modal ini dibuka
// dari tombol "Auto-Renew SPP" di header halaman Data Murid.
// ============================================================
const SettingsPage = (() => {
  let _isLoaded = false;

  function _setStatusLabel(isOn) {
    const label   = document.getElementById('global-auto-renew-status');
    const toggle  = document.getElementById('global-auto-renew-spp');
    if (toggle) toggle.checked = !!isOn;
    if (label) {
      label.textContent = isOn ? 'Aktif' : 'Nonaktif';
      label.style.color = isOn ? 'var(--success, #22c55e)' : 'var(--text-secondary)';
    }
  }

  async function openAutoRenewModal() {
    UI.openModal('modal-auto-renew-spp');
    const label = document.getElementById('global-auto-renew-status');
    if (label) label.textContent = 'Memuat status...';

    try {
      const res = await API.autoRenew.getStatus();
      if (res.status === 'OK') {
        _setStatusLabel(!!res.data.auto_renew);
        _isLoaded = true;
      } else {
        if (label) label.textContent = 'Gagal memuat status';
      }
    } catch(e) {
      if (label) label.textContent = 'Gagal terhubung ke server';
    }
  }

  async function onToggleChange(checked) {
    const toggle = document.getElementById('global-auto-renew-spp');
    const label  = document.getElementById('global-auto-renew-status');

    // Kunci toggle sementara request jalan, biar gak double-klik
    if (toggle) toggle.disabled = true;
    if (label)  label.textContent = 'Menyimpan...';

    try {
      const res = await API.autoRenew.setStatus(checked);
      if (res.status === 'OK') {
        _setStatusLabel(!!res.data.auto_renew);
        UI.toast(
          res.data.auto_renew ? 'Auto-Renew SPP diaktifkan' : 'Auto-Renew SPP dimatikan',
          res.data.auto_renew ? 'success' : 'warning'
        );
      } else {
        // Gagal simpan — balikin toggle ke state sebelumnya
        _setStatusLabel(!checked);
        UI.toast(res.message || 'Gagal menyimpan pengaturan', 'error');
      }
    } catch(e) {
      _setStatusLabel(!checked);
      UI.toast('Gagal terhubung ke server', 'error');
    } finally {
      if (toggle) toggle.disabled = false;
    }
  }

  return { openAutoRenewModal, onToggleChange };
})();

window.SettingsPage = SettingsPage;