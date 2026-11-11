const PanduanPage = (() => {

  // ── Entry point, dipanggil dari Main.js saat navigate ke halaman ini ─────
  function load() {
    // Halaman statis — tidak ada data yang diambil dari server.
    // lucide.createIcons() sudah dipanggil global oleh Main.js setelah render.
  }

  // ── Loncat ke salah satu sub-bagian panduan lewat chip nav ───────────────
  function jump(sectionId) {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { load, jump };

})();