const Selection = (() => {
  const state = {};

  const CONFIG = {
    murid:    { page: () => MuridPage,       deleteOne: (id) => API.murid.delete(id),      getId: r => r.id     },
    mentor:   { page: () => MentorPage,      deleteOne: (id) => API.mentor.delete(id),     getId: r => r.id     },
    presensi: { page: () => PresensiPage,    deleteOne: (id) => API.presensi.delete(id),   getId: r => r.id     },
    pay:      { page: () => PembayaranPage,  deleteOne: (id) => API.pembayaran.delete(id), getId: r => r.id     },
    ops:      { page: () => OperasionalPage, deleteOne: (id) => API.pembayaran.delete(id), getId: r => r.id     },
    spp:      { page: () => SPPPage,         deleteOne: (id) => API.spp.delete(id),        getId: r => r.id     },
    buku:     { page: () => BukuPage,        deleteOne: (id) => API.buku.delete(id),       getId: r => r.id     },
    gaji:     { page: () => GajiPage,        deleteOne: (id) => API.gaji.delete(id),       getId: r => r.id_trx },
  };

  function _getState(key) {
    if (!state[key]) state[key] = { active: false, selected: new Set() };
    return state[key];
  }

  function toggle(key) {
    const role = API.currentRole();
    if (!['ADMIN', 'OWNER'].includes(role)) {
      UI.toast('Tidak diizinkan', 'error');
      return;
    }

    const s    = _getState(key);
    s.active   = !s.active;
    s.selected = new Set();

    const bar   = document.getElementById(`${key}-sel-bar`);
    const btn   = document.getElementById(`${key}-select-btn`);
    const tbody = document.getElementById(`${key}-tbody`);

    if (bar)   bar.classList.toggle('active', s.active);
    if (btn)   btn.classList.toggle('select-active', s.active);
    if (tbody) tbody.closest('table')?.classList.toggle('selection-mode', s.active);

    const page = CONFIG[key]?.page();
    if (page?.renderTable) page.renderTable(page._getCurrentData ? page._getCurrentData() : []);

    _updateBar(key);
    lucide.createIcons();
  }

  function toggleRow(key, id, checkbox) {
    const s = _getState(key);
    if (!s.active) return;
    if (checkbox.checked) s.selected.add(String(id));
    else s.selected.delete(String(id));
    _updateBar(key);
    const row = checkbox.closest('tr');
    if (row) row.classList.toggle('row-selected', checkbox.checked);
  }

  function toggleAll(key) {
    const s      = _getState(key);
    const checks = document.querySelectorAll(`#${key}-tbody .row-checkbox`);
    const allChecked = checks.length > 0 && [...checks].every(c => c.checked);

    checks.forEach(cb => {
      cb.checked = !allChecked;
      const id   = cb.dataset.id;
      const row  = cb.closest('tr');
      if (!allChecked) { s.selected.add(String(id)); if (row) row.classList.add('row-selected'); }
      else             { s.selected.delete(String(id)); if (row) row.classList.remove('row-selected'); }
    });
    _updateBar(key);
  }

  function _updateBar(key) {
    const s       = _getState(key);
    const countEl = document.getElementById(`${key}-sel-count`);
    const delBtn  = document.getElementById(`${key}-sel-delete`);
    if (countEl) countEl.textContent = `${s.selected.size} dipilih`;
    if (delBtn)  delBtn.disabled = s.selected.size === 0;
  }

  async function deleteSelected(key) {
    const role = API.currentRole();
    if (!['ADMIN', 'OWNER'].includes(role)) {
      UI.toast('Tidak diizinkan', 'error');
      return;
    }

    const s   = _getState(key);
    const cfg = CONFIG[key];
    if (!s.active || s.selected.size === 0) return;

    const n = s.selected.size;
    if (!await UI.confirm(`Hapus ${n} item yang dipilih? Tindakan ini tidak dapat dibatalkan.`, { title: 'Hapus Item Terpilih', okLabel: 'Ya, Hapus', okClass: 'btn btn-danger', icon: 'trash-2' })) return;

    const delBtn = document.getElementById(`${key}-sel-delete`);
    if (delBtn) { delBtn.disabled = true; delBtn.innerHTML = '<div class="spinner spinner-sm"></div>'; }

    let berhasil = 0, gagal = 0;
    for (const id of s.selected) {
      try {
        const res = await cfg.deleteOne(id);
        if (res.status === 'OK') berhasil++;
        else gagal++;
      } catch(e) { gagal++; }
    }

    if (berhasil > 0) UI.toast(`${berhasil} item berhasil dihapus${gagal > 0 ? `, ${gagal} gagal` : ''}`, gagal > 0 ? 'warning' : 'success');
    else UI.toast('Gagal menghapus item', 'error');

    toggle(key);
    const page = cfg.page();
    if (page?.load) page.load(true);
    lucide.createIcons();
  }

  function checkbox(key, id) {
    return `<input type="checkbox" class="row-checkbox" data-id="${id}"
      onchange="Selection.toggleRow('${key}', '${id}', this)">`;
  }

  function isActive(key) { return _getState(key).active; }

  return { toggle, toggleRow, toggleAll, deleteSelected, checkbox, isActive };
})();

window.Selection = Selection;