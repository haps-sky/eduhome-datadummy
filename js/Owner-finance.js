const OwnerFinancePage = (() => {
  let _cache    = null;
  let isFetched = false;

  async function load(forceRefresh = false) {
    if (!forceRefresh && isFetched && _cache) {
      _render(_cache);
      return;
    }
    try {
      const [statsRes, payRes, sppRes, gajiRes] = await Promise.all([
        API.dashboard.getStats(), API.pembayaran.getAll(), API.spp.getAll(), API.gaji.getAll()
      ]);
      _cache    = { statsRes, payRes, sppRes, gajiRes };
      isFetched = true;
      _render(_cache);
    } catch(e) { UI.toast('Error memuat laporan keuangan: ' + e.message, 'error'); }
  }

  function _render({ statsRes, payRes, sppRes, gajiRes }) {
    if (statsRes.status === 'OK' && statsRes.data.finance) renderFinanceSummary(statsRes.data.finance, statsRes.data.payments);
    if (payRes.status === 'OK')  renderPaymentHistory(payRes.data || []);
    if (sppRes.status === 'OK')  renderSPPStatus(sppRes.data || []);
    if (gajiRes.status === 'OK') renderGajiHistory(gajiRes.data || []);
  }

  function renderFinanceSummary(finance, payments) {
    // API getDashboardStats mengembalikan:
    // total_masuk, total_keluar, total_gaji, laba_bersih
    // Struktur: laba_bersih = total_masuk - total_keluar - total_gaji
    const ids = {
      'owner-fin-spp': finance.total_masuk,   // total pemasukan bulan ini
      'owner-fin-op':  finance.total_keluar,  // total pengeluaran operasional
      'owner-fin-sav': finance.total_gaji,    // total gaji mentor
      'owner-fin-rev': finance.laba_bersih,   // laba bersih
      'owner-pay-today': payments ? payments.today      : 0,
      'owner-pay-month': payments ? payments.this_month : 0
    };
    Object.entries(ids).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = UI.formatCurrency(val || 0);
      // Warna merah jika laba negatif
      if (id === 'owner-fin-rev') {
        el.style.color = (val || 0) >= 0 ? 'var(--success)' : 'var(--danger)';
      }
    });
  }

  function renderPaymentHistory(data) {
    const sppOnly = data.filter(p => p.jenis === 'SPP').slice(-30).reverse();
    const rows = sppOnly.map(p => `<tr><td>${UI.formatDate(p.tanggal)}</td><td><strong>${p.nama}</strong></td><td><strong>${UI.formatCurrency(p.jumlah)}</strong></td><td>${p.metode}</td><td>${p.keterangan || '-'}</td></tr>`);
    UI.renderTable('owner-pay-tbody', rows, 'Belum ada data pembayaran');
  }

  function renderSPPStatus(data) {
    const unpaid  = data.filter(s => s.status_bayar === 'UNPAID').length;
    const partial = data.filter(s => s.status_bayar === 'PARTIAL').length;
    const paid    = data.filter(s => s.status_bayar === 'PAID').length;
    const els = { 'owner-spp-unpaid': unpaid, 'owner-spp-partial': partial, 'owner-spp-paid': paid };
    Object.entries(els).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.textContent = val; });
  }

  function renderGajiHistory(data) {
    const rows = data.slice(-20).reverse().map(g =>
      `<tr><td>${UI.formatDate(g.tgl_bayar)}</td><td>${g.bulan_gaji}</td><td><strong>${g.nama_mentor}</strong></td><td><strong class="text-success">${UI.formatCurrency(g.jumlah)}</strong></td><td>${g.metode}</td></tr>`
    );
    UI.renderTable('owner-gaji-tbody', rows, 'Belum ada data penggajian');
  }

  function invalidateCache() { isFetched = false; _cache = null; }

  return { load, invalidateCache };
})();

window.OwnerFinancePage = OwnerFinancePage;