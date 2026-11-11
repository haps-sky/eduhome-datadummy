const GantiPasswordPage = (() => {

  async function load() {
    const sel = document.getElementById('gp-target-user');
    if (sel) sel.innerHTML = '<option value="">-- Pilih User --</option>';
    ['gp-new', 'gp-confirm'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const msg = document.getElementById('gp-msg');
    if (msg) { msg.textContent = ''; msg.className = 'gp-msg'; }

    if (API.currentRole() !== 'OWNER') {
      UI.closeModal('modal-profile');
      UI.toast('Hanya Owner yang dapat mengatur password', 'error');
      return;
    }

    try {
      const res = await API.auth.getUsers();

      if (res.status !== 'OK') {
        console.error('Gagal load users:', res.message);
        return;
      }

      const users = res.data || [];

      if (sel) {
        sel.innerHTML = '<option value="">-- Pilih User --</option>' +
          users.map(u => {
            const label = u.username + (u.role ? ` (${u.role})` : '');
            return `<option value="${u.username}">${label}</option>`;
          }).join('');
      }
    } catch(e) {
      console.error('Gagal load users:', e);
    }
  }

  function togglePass(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
    const btn  = document.querySelector(`button[onclick*="togglePass('${id}')"] i`);
    if (btn) {
      btn.setAttribute('data-lucide', el.type === 'password' ? 'eye' : 'eye-off');
      lucide.createIcons({ nodes: [btn.parentNode] });
    }
  }

  async function saveForm() {
    const targetUser = document.getElementById('gp-target-user')?.value;
    const newPass    = document.getElementById('gp-new')?.value;
    const confirm    = document.getElementById('gp-confirm')?.value;
    const msg        = document.getElementById('gp-msg');
    const btn        = document.getElementById('gp-btn');

    const showMsg = (text, type) => {
      if (!msg) return;
      msg.textContent = text;
      msg.className   = `gp-msg ${type}`;
    };

    if (!targetUser)           return showMsg('Pilih pengguna terlebih dahulu.', 'error');
    if (!newPass)              return showMsg('Password baru wajib diisi.', 'error');
    if (newPass.length < 6)   return showMsg('Password minimal 6 karakter.', 'error');
    if (newPass !== confirm)   return showMsg('Konfirmasi password tidak sesuai.', 'error');

    try {
      if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner spinner-sm"></div> Menyimpan...'; }
      const res = await API.auth.resetPasswordByOwner(targetUser, newPass);
      if (res.status === 'OK') {
        showMsg('Password berhasil direset.', 'success');
        document.getElementById('gp-new').value     = '';
        document.getElementById('gp-confirm').value = '';
        document.getElementById('gp-target-user').value = '';
      } else {
        showMsg(res.message || 'Gagal mereset password.', 'error');
      }
    } catch(e) {
      showMsg('Gagal terhubung ke server.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save"></i> Simpan Password'; lucide.createIcons({ nodes: [btn] }); }
    }
  }

  return { load, togglePass, saveForm };
})();

window.GantiPasswordPage = GantiPasswordPage;