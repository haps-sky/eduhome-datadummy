// Searchable-dropdown.js — komponen SD universal untuk EduHome
// Digunakan oleh modal presensi: dropdown Murid, Mentor, Buku
// Letakkan <script> ini SEBELUM Presensi.js di index.html

const SD = (() => {
  // _data[key]     = array of { value, label, badge?, extra? }
  // _selected[key] = item yang sedang dipilih | null
  const _data     = {};
  const _selected = {};

  const _PLACEHOLDERS = {
    'presensi-murid':        'Ketik nama murid...',
    'presensi-mentor':       'Ketik nama mentor...',
    'presensi-buku':         'Ketik nama modul...',
    'spp-murid':             'Ketik nama murid...',
    'lw-murid':              'Ketik nama murid...',
    'pay-murid':             'Ketik nama murid...',
    'mentor-presensi-murid': 'Ketik nama murid...',
    'mentor-presensi-buku':  'Ketik nama modul...',
    'mentor-kontak-cc':      'Cari negara...',
    'md-murid':              'Cari murid...',
  };

  const _SECTIONS = {
    'presensi-murid':        'Murid Aktif',
    'lw-murid':              'Murid Aktif',
    'mentor-presensi-murid': 'Murid Saya',
  };

  // Key yang chip-nya cukup tampilkan badge (mis. kode negara "+62"),
  // bukan label lengkap ("Indonesia") — biar kolom bisa tetap kecil.
  const _COMPACT_CHIP_KEYS = ['mentor-kontak-cc'];

  // ── Populate ─────────────────────────────────────────────────────────────
  // items: [{ value, label, badge?, extra? }]
  // extra = objek yang akan disimpan sebagai data-* di hidden <select>
  function populate(key, items) {
    _data[key] = items;
    if (!_selected[key]) _selected[key] = null;
    _renderDropdown(key, items);
    _syncHiddenSelect(key, items);
  }

  // ── Sync ke hidden <select> ───────────────────────────────────────────────
  // Agar kode Presensi.js yang membaca .value / .options[].dataset tetap jalan
  function _syncHiddenSelect(key, items) {
    const sel = document.getElementById(key);
    if (!sel) return;
    sel.innerHTML = '<option value="">--</option>' +
      items.map(it => {
        const extra = it.extra || {};
        const attrs = Object.entries(extra)
          .map(([k, v]) => `data-${k}="${_esc(String(v ?? ''))}"`)
          .join(' ');
        return `<option value="${_esc(String(it.value))}" ${attrs}>${_esc(it.label)}</option>`;
      }).join('');
  }

  // ── Render list opsi di dropdown ──────────────────────────────────────────
  function _renderDropdown(key, items) {
    const dd = document.getElementById('sd-dd-' + key);
    if (!dd) return;
    dd.innerHTML = '';

    const sectionLabel = _SECTIONS[key];
    if (sectionLabel) {
      const hdr = document.createElement('div');
      hdr.className   = 'sd-section-header';
      hdr.textContent = sectionLabel;
      dd.appendChild(hdr);
    }

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className   = 'sd-empty';
      empty.textContent = 'Tidak ditemukan';
      dd.appendChild(empty);
      return;
    }

    items.forEach(it => {
      const opt = document.createElement('div');
      opt.className    = 'sd-option' +
        (_selected[key]?.value === it.value ? ' sd-selected' : '');
      opt.dataset.value = it.value;
      opt.innerHTML    =
        `<span>${_esc(it.label)}</span>` +
        (it.badge ? `<span class="sd-badge-tag">${_esc(it.badge)}</span>` : '');
      opt.addEventListener('mousedown', e => {
        e.preventDefault(); // cegah blur input sebelum pick
        _pick(key, it);
      });
      dd.appendChild(opt);
    });
  }

  // ── Pilih item ────────────────────────────────────────────────────────────
  function _pick(key, it) {
    _selected[key] = it;

    // Tampilkan chip (khusus kode negara: cukup badge "+62", tanpa tombol ×
    // karena selalu ada default terpilih, tidak perlu bisa dikosongkan)
    const chip = document.getElementById('sd-chip-' + key);
    if (chip) {
      if (_COMPACT_CHIP_KEYS.includes(key)) {
        const chipText = it.badge || it.label;
        chip.innerHTML = `<span class="sd-chip sd-chip-compact">${_esc(chipText)}</span>`;
      } else {
        chip.innerHTML =
          `<span class="sd-chip">${_esc(it.label)}` +
          `<button type="button" onmousedown="event.stopPropagation()" ` +
          `onclick="SD.clear('${key}')">×</button></span>`;
      }
    }

    // Kosongkan input
    const inp = document.getElementById('sd-input-' + key);
    if (inp) { inp.value = ''; inp.placeholder = ''; }

    // Sync hidden <select> & trigger change (agar onBukuChange terpanggil)
    const sel = document.getElementById(key);
    if (sel) {
      sel.value = it.value;
      sel.dispatchEvent(new Event('change'));
    }

    _close(key);
    _renderDropdown(key, _data[key] || []);
  }

  // ── Clear (reset) ─────────────────────────────────────────────────────────
  function clear(key) {
    _selected[key] = null;

    const chip = document.getElementById('sd-chip-' + key);
    if (chip) chip.innerHTML = '';

    const inp = document.getElementById('sd-input-' + key);
    if (inp) {
      inp.value       = '';
      inp.placeholder = _PLACEHOLDERS[key] || 'Cari...';
    }

    const sel = document.getElementById(key);
    if (sel) {
      sel.value = '';
      sel.dispatchEvent(new Event('change'));
    }

    _renderDropdown(key, _data[key] || []);
  }

  // ── Set value dari luar (untuk openEdit) ──────────────────────────────────
  function setValue(key, value) {
    const it = (_data[key] || []).find(x => String(x.value) === String(value));
    if (it) _pick(key, it);
    else    clear(key);
  }

  // ── Baca value yang dipilih ───────────────────────────────────────────────
  function getValue(key) {
    return _selected[key]?.value || '';
  }

  // ── Filter saat user mengetik ─────────────────────────────────────────────
  function filter(key, q) {
    const items = (_data[key] || []).filter(it =>
      it.label.toLowerCase().includes(q.toLowerCase()) ||
      (it.badge || '').toLowerCase().includes(q.toLowerCase())
    );
    // Hapus section header sementara saat filter aktif
    const dd = document.getElementById('sd-dd-' + key);
    if (dd) {
      dd.innerHTML = '';
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className   = 'sd-empty';
        empty.textContent = 'Tidak ditemukan';
        dd.appendChild(empty);
      } else {
        items.forEach(it => {
          const opt = document.createElement('div');
          opt.className    = 'sd-option' +
            (_selected[key]?.value === it.value ? ' sd-selected' : '');
          opt.dataset.value = it.value;
          opt.innerHTML    =
            `<span>${_esc(it.label)}</span>` +
            (it.badge ? `<span class="sd-badge-tag">${_esc(it.badge)}</span>` : '');
          opt.addEventListener('mousedown', e => {
            e.preventDefault();
            _pick(key, it);
          });
          dd.appendChild(opt);
        });
      }
    }
    open(key);
  }

  // ── Open / Close / Toggle ─────────────────────────────────────────────────
  function open(key) {
    _closeAll(key);
    const dd    = document.getElementById('sd-dd-' + key);
    const arrow = document.getElementById('sd-arrow-' + key);
    if (dd)    dd.classList.add('open');
    if (arrow) arrow.classList.add('open');
  }

  function _close(key) {
    const dd    = document.getElementById('sd-dd-' + key);
    const arrow = document.getElementById('sd-arrow-' + key);
    if (dd)    dd.classList.remove('open');
    if (arrow) arrow.classList.remove('open');
    // Reset list ke semua item + kosongkan input filter
    _renderDropdown(key, _data[key] || []);
    const inp = document.getElementById('sd-input-' + key);
    if (inp) inp.value = '';
  }

  function _closeAll(exceptKey) {
    Object.keys(_PLACEHOLDERS).forEach(k => {
      if (k !== exceptKey) _close(k);
    });
  }

  function toggle(key) {
    const dd = document.getElementById('sd-dd-' + key);
    if (dd && dd.classList.contains('open')) {
      _close(key);
    } else {
      open(key);
      const inp = document.getElementById('sd-input-' + key);
      if (inp) inp.focus();
    }
  }

  // ── Keyboard navigation (Arrow Up/Down, Enter, Escape) ───────────────────
  function nav(e, key) {
    const dd = document.getElementById('sd-dd-' + key);
    if (!dd || !dd.classList.contains('open')) return;

    const opts = [...dd.querySelectorAll('.sd-option')];
    if (!opts.length) return;

    let idx = opts.findIndex(o => o.classList.contains('sd-focused'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      opts[idx]?.classList.remove('sd-focused');
      idx = (idx + 1) % opts.length;
      opts[idx].classList.add('sd-focused');
      opts[idx].scrollIntoView({ block: 'nearest' });

    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      opts[idx]?.classList.remove('sd-focused');
      idx = (idx - 1 + opts.length) % opts.length;
      opts[idx].classList.add('sd-focused');
      opts[idx].scrollIntoView({ block: 'nearest' });

    } else if (e.key === 'Enter') {
      e.preventDefault();
      const focused = dd.querySelector('.sd-focused');
      if (focused) {
        const val = focused.dataset.value;
        const it  = (_data[key] || []).find(x => String(x.value) === val);
        if (it) _pick(key, it);
      }

    } else if (e.key === 'Escape') {
      _close(key);
    }
  }

  // ── Escape HTML ───────────────────────────────────────────────────────────
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Tutup dropdown saat klik di luar ─────────────────────────────────────
  document.addEventListener('click', e => {
    Object.keys(_PLACEHOLDERS).forEach(key => {
      const inp = document.getElementById('sd-input-' + key);
      if (!inp) return;
      const wrap = inp.closest('.sd-wrap');
      if (wrap && !wrap.contains(e.target)) _close(key);
    });
  });

  return { populate, clear, setValue, getValue, filter, open, toggle, nav, _close };
})();

window.SD = SD;