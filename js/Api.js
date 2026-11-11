const API = (() => {

  const BASE_URL = window.EDUHOME_API_URL || '';

  function currentRole() {
    try {
      const s = localStorage.getItem('eduhome_user');
      return s ? JSON.parse(s).role : '';
    } catch(e) { return ''; }
  }

  function currentUser() {
    try {
      const s = localStorage.getItem('eduhome_user');
      return s ? JSON.parse(s) : {};
    } catch(e) { return {}; }
  }

  // ─── Session token helpers ────────────────────────────────────────────────
  // Token disimpan terpisah dari data user, di localStorage.
  // Dikirim di setiap request GET dan POST sebagai 'session_token'.
  function getToken() {
    return localStorage.getItem('eduhome_token') || '';
  }

  function setToken(token) {
    localStorage.setItem('eduhome_token', token);
  }

  function clearToken() {
    localStorage.removeItem('eduhome_token');
  }
  // ─────────────────────────────────────────────────────────────────────────

  // ─── Dev bypass key ───────────────────────────────────────────────────
  // Kode rahasia developer, disimpan terpisah dari akun/token. Dikirim di
  // tiap request sebagai 'dev_key' — server yang nentuin valid atau nggak.
  // Disimpan di sessionStorage (per-tab, hilang saat tab ditutup), BUKAN localStorage.
  function getDevKey() {
    try { return sessionStorage.getItem('eduhome_dev_key') || ''; }
    catch(e) { return ''; }
  }

  function clearDevKey() {
    try { sessionStorage.removeItem('eduhome_dev_key'); } catch(e) {}
  }

  // Migrasi: buang sisa dev key lama yang tersimpan permanen di localStorage.
  try { localStorage.removeItem('eduhome_dev_key'); } catch(e) {}
  // ─────────────────────────────────────────────────────────────────────────

  const logout = () => {
    // Beritahu server untuk invalidate token sebelum hapus lokal
    const token    = getToken();
    const username = currentUser().username || '';
    if (token && username) {
      // Fire-and-forget — tidak perlu tunggu response
      fetch(BASE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ action: 'logout', username, session_token: token })
      }).catch(() => {});
    }
      localStorage.removeItem('eduhome_user');
     localStorage.removeItem('eduhome_token');
     clearDevKey();   // sesi developer berakhir bersama logout
     window.location.href = 'index.html';
  };

  async function get(action, params = {}) {
    const url  = new URL(BASE_URL);
    const user = currentUser();

    url.searchParams.set('action', action);

    if (action !== 'login') {
      url.searchParams.set('username',      user.username || '');
      url.searchParams.set('session_token', getToken());   // ← TOKEN DIKIRIM
    }

    const devKey = getDevKey();
    if (devKey) url.searchParams.set('dev_key', devKey);

    if (user.role === 'MENTOR') {
      if (user.nama_mentor) url.searchParams.set('mentor_name', user.nama_mentor);
      if (user.mentor_id)   url.searchParams.set('mentor_id',   user.mentor_id);
    }

    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    try {
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      // Jika server menolak token (expired/invalid), paksa logout
      if (data.status === 'UNAUTHORIZED') {
        clearToken();
        localStorage.removeItem('eduhome_user');
        UI.toast('Sesi Anda telah berakhir. Silakan login kembali.', 'error');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return data;
      }

      return data;
    } catch(e) {
      console.error('GET Error [' + action + ']:', e);
      return { status: 'ERROR', message: 'Gagal terhubung ke server.' };
    }
  }

  async function post(body) {
    const user    = currentUser();
    const payload = {
      ...body,
      role:          currentRole(),
      session_token: getToken()   // ← TOKEN DIKIRIM
    };

    const devKey = getDevKey();
    if (devKey) payload.dev_key = devKey;

    // JANGAN override username saat login
    if (body.action !== 'login') {
      payload.username = user.username || '';
    }

    try {
      const res = await fetch(BASE_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      // Jika server menolak token, paksa logout
      if (data.status === 'UNAUTHORIZED') {
        clearToken();
        localStorage.removeItem('eduhome_user');
        UI.toast('Sesi Anda telah berakhir. Silakan login kembali.', 'error');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return data;
      }

      return data;
    } catch(e) {
      console.error('POST Error [' + body.action + ']:', e);
      return { status: 'ERROR', message: 'Gagal terhubung ke server. Cek koneksi atau coba lagi.' };
    }
  }

  const auth = {
    login: async (username, password) => {
      const res = await post({ action: 'login', username, password });
      // Jika login berhasil, simpan token yang dikirim server
      if (res.status === 'OK' && res.data?.session_token) {
        setToken(res.data.session_token);
      }
      return res;
    },
    getUsers:             ()                           => get('getUsers'),
    resetPasswordByOwner: (targetUsername, newPassword) => post({
      action: 'resetPasswordByOwner',
      targetUsername,
      newPassword
    })
  };

  const murid = {
    getAll:    (params = {}) => get('getMurid', params),
    getById:   (id)          => get('getMurid', { id }),
    add:       (data)        => post({ action: 'addMurid',    ...data }),
    update:    (data)        => post({ action: 'updateMurid', ...data }),
    delete:    (id)          => post({ action: 'deleteMurid', id, all: false }),
    deleteAll: ()            => post({ action: 'deleteMurid', all: true })
  };

  const mentor = {
    getAll:        ()            => get('getMentor'),
    getById:       (id)          => get('getMentor', { id }),
    add:           (data)        => post({ action: 'addMentor',    ...data }),
    update:        (data)        => post({ action: 'updateMentor', ...data }),
    delete:        (id)          => post({ action: 'deleteMentor', id }),
    deleteAll:     ()            => post({ action: 'deleteMentor', all: true }),
    getMyStudents: (mentor_name) => get('getMentorStudents', { mentor_name })
  };

  const jadwal = {
    getAll:         ()                    => get('getJadwal'),
    getByMurid:     (id_murid)            => get('getJadwal', { id_murid }),
    replaceByMurid: (muridId, jadwalData) => post({
      action: 'replaceJadwalMurid',
      muridId,
      jadwal: jadwalData
    })
  };

  const spp = {
    getAll:       ()     => get('getSPP'),
    getByMurid:   (id)   => get('getSPP', { id_murid: id }),
    create:       (data) => post({ action: 'createSPP', ...data }),
    update:       (data) => post({ action: 'updateSPP', ...data }),
    delete:       (id)   => post({ action: 'deleteSPP', id }),
    deleteAll:    ()     => post({ action: 'deleteSPP', all: true }),
    previewDelete:(id)   => get('previewDeleteSPP', { id })
  };

  const presensi = {
    getAll:    ()         => get('getPresensi'),
    getByDate: (tanggal)  => get('getPresensi', { tanggal }),
    getByMurid:(id_murid) => get('getPresensi', { id_murid }),
    add:       (data)     => post({ action: 'addPresensi',    ...data }),
    update:    (data)     => post({ action: 'updatePresensi', ...data }),
    delete:    (id)       => post({ action: 'deletePresensi', id }),
    deleteAll: ()         => post({ action: 'deletePresensi', all: true }),
    // ── Siklus 12-sesi: catat sesi pengganti (makeup) untuk sebuah IZIN,
    //    dan lihat daftar IZIN yang masih menunggu makeup (belum lewat
    //    deadline 7 hari, belum ada penggantinya).
    reschedule:          (data)     => post({ action: 'reschedulePresensi', ...data }),
    getPendingReschedule:(id_murid) => get('rescheduleGetPending', id_murid ? { id_murid } : {})
  };

  const pembayaran = {
    getAll:    ()         => get('getPembayaran'),
    getByMurid:(id_murid) => get('getPembayaran', { id_murid }),
    add:       (data)     => post({ action: 'addPembayaran',    ...data }),
    update:    (data)     => post({ action: 'updatePembayaran', ...data }),
    delete:    (id)       => post({ action: 'deletePembayaran', id }),
    deleteAll: ()         => post({ action: 'deletePembayaran', all: true })
  };

  const gaji = {
    getAll:     ()                        => get('getGaji'),
    getByMentor:(id_mentor)               => get('getGaji', { id_mentor }),
    preview:    (id_mentor, bulan_gaji, extra_days = []) => get('previewMentorSalary', {
      id_mentor,
      bulan_gaji,
      extra_days: JSON.stringify(extra_days || [])
    }),
    record:     (data)                    => post({ action: 'recordMentorSalary', ...data }),
    update:     (data)                    => post({ action: 'updateGaji',         ...data }),
    delete:     (id)                      => post({ action: 'deleteGaji',         id }),
    deleteAll:  ()                        => post({ action: 'deleteGaji',         all: true })
  };

  const buku = {
    getAll:    ()     => get('getBuku'),
    add:       (data) => post({ action: 'addBuku',    ...data }),
    update:    (data) => post({ action: 'updateBuku', ...data }),
    delete:    (id)   => post({ action: 'deleteBuku', id }),
    deleteAll: ()     => post({ action: 'deleteBuku', all: true })
  };

  const program = {
    getAll:    ()     => get('getProgram'),
    add:       (data) => post({ action: 'addProgram',    ...data }),
    update:    (data) => post({ action: 'updateProgram', ...data }),
    delete:    (id)   => post({ action: 'deleteProgram', id }),
    deleteAll: ()     => post({ action: 'deleteProgram', all: true })
  };

  const dashboard = {
    getStats: () => get('getDashboardStats')
  };

  const maintenance = {
  check:     ()                  => get('getMaintenanceStatus'),
  start:     (message, estimasi) => post({ action: 'devMaintenanceOn', message, estimasi }),
  stop:      ()                  => post({ action: 'devMaintenanceOff' }),
  testStart: ()                  => post({ action: 'devTestStart' }),
  testEnd:   ()                  => post({ action: 'devTestEnd' })
};

  const logs = {
    getAll:   () => get('getLogs'),
    clearAll: () => post({ action: 'clearLogs' })
  };

  const laporan = {
    getBulanan: (month, year, ownerPct, savingsPct) => get('getLaporanBulanan', {
      month,
      year,
      owner_pct:   ownerPct   || 65,
      savings_pct: savingsPct || 15
    })
  };

  // ── Hadiah Bintang ────────────────────────────────────────────────────────
  const hadiah = {
    // getProgressBintang: semua murid (owner/admin) atau murid milik mentor
    // (mentor_name/mentor_id otomatis ditambahkan oleh get() untuk role MENTOR)
    getProgress:     (id_murid)      => get('getProgressBintang', id_murid ? { id_murid } : {}),
    getRiwayat:       (id_murid)      => get('getRiwayatHadiah',   id_murid ? { id_murid } : {}),
    getTiers:         ()              => get('getHadiahTiers'),
    addTier:          (data)          => post({ action: 'addHadiahTier',    ...data }),
    updateTier:       (data)          => post({ action: 'updateHadiahTier', ...data }),
    deleteTier:       (id)            => post({ action: 'deleteHadiahTier', id }),
    claim:            (id_murid, nama_murid) => post({ action: 'claimHadiah', id_murid, nama_murid }),
    undoClaim:        (id, id_murid)         => post({ action: 'undoClaimHadiah', id, id_murid })
  };

  // ── Auto-Renew SPP (saklar global) ─────────────────────────────────────
  const autoRenew = {
    getStatus: ()          => get('getAutoRenewStatus'),
    setStatus: (enabled)   => post({ action: 'setAutoRenewGlobalMode', auto_renew: enabled })
  };

  const sync = {
  getLastChange: () => get('getLastDataChange')
};

  return {
    auth, murid, mentor, jadwal, spp, presensi,
    pembayaran, gaji, buku, program, dashboard, logs, laporan, maintenance, hadiah,
    autoRenew, sync,
    currentUser, currentRole, logout,
    getToken, setToken, clearToken,
    getDevKey
  };

})();

window.API = API;