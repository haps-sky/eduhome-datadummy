const Dashboard = (() => { 

  // ── Freshness indicator ────────────────────────────────────────────────
  // Nunjukin kapan DATA-nya sendiri terakhir benar-benar berubah (bukan
  // kapan browser terakhir fetch) — diambil dari field last_data_change
  // yang dikirim backend (berbasis SYSTEM LOG). Titik warna makin "basi"
  // (kuning lalu merah) kalau udah lama gak ada perubahan data apapun.
  let _lastChangedAt  = null;   // timestamp perubahan data asli (ms)
  let _noHistory      = false;  // true kalau backend belum pernah kirim histori
  let _freshnessTimer = null;

  function _startFreshnessTimer() {
    if (_freshnessTimer) clearInterval(_freshnessTimer);
    _renderFreshness();
    _freshnessTimer = setInterval(_renderFreshness, 15000); // update tiap 15 detik
  }

  function _renderFreshness() {
    const dotEl  = document.getElementById('dash-freshness-dot');
    const textEl = document.getElementById('dash-freshness-text');
    if (!dotEl || !textEl) return;

    if (_noHistory) {
      textEl.textContent     = 'Belum ada riwayat perubahan data';
      dotEl.style.background = 'var(--text-secondary,#9ca3af)';
      return;
    }
    if (!_lastChangedAt) return;

    const elapsedSec = Math.floor((Date.now() - _lastChangedAt) / 1000);
    let label, color;

    if (elapsedSec < 10) {
      label = 'Data baru saja diubah';
      color = 'var(--success,#16a34a)';
    } else if (elapsedSec < 60) {
      label = `Data diubah ${elapsedSec} detik lalu`;
      color = 'var(--success,#16a34a)';
    } else if (elapsedSec < 300) {
      const menit = Math.floor(elapsedSec / 60);
      label = `Data diubah ${menit} menit lalu`;
      color = 'var(--success,#16a34a)';
    } else if (elapsedSec < 3600) {
      const menit = Math.floor(elapsedSec / 60);
      label = `Data diubah ${menit} menit lalu`;
      color = 'var(--warning,#d97706)';
    } else if (elapsedSec < 86400) {
      const jam = Math.floor(elapsedSec / 3600);
      label = `Data diubah ${jam} jam lalu`;
      color = 'var(--warning,#d97706)';
    } else {
      const hari = Math.floor(elapsedSec / 86400);
      label = `Data diubah ${hari} hari lalu`;
      color = 'var(--danger,#dc2626)';
    }

    textEl.textContent = label;
    dotEl.style.background = color;
  }

  function _setFreshnessError() {
    const dotEl  = document.getElementById('dash-freshness-dot');
    const textEl = document.getElementById('dash-freshness-text');
    if (dotEl)  dotEl.style.background = 'var(--danger,#dc2626)';
    if (textEl) textEl.textContent     = 'Gagal memuat';
  }

async function load() {
    const user = API.currentUser();
    const role = user.role || 'ADMIN';

    try {
      const res = await API.dashboard.getStats();
      if (res.status !== 'OK') { UI.toast('Gagal memuat dashboard', 'error'); _setFreshnessError(); return; }
      const d = res.data;

      renderKPICards(d, role);

      if (role !== 'MENTOR' && d.finance) {
        renderFinanceCards(d.finance);
      }

      if (role === 'MENTOR' && d.my_stats) {
        renderMentorPersonalStats(d.my_stats);
      }

      renderTopStudents(d.top_students);
      renderMentorPerformance(d.mentor_performance);
      renderRecentActivity(d.recent_attendance);
      renderLowSessions(d.low_sessions);
      await renderJadwalHariIni(role);

      const dateEl = document.getElementById('current-date');
      if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('id-ID', { 
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
        });
      }

      if (d.last_data_change) {
        _lastChangedAt = new Date(d.last_data_change).getTime();
        _noHistory     = false;
      } else {
        _lastChangedAt = null;
        _noHistory     = true;
      }
      _startFreshnessTimer();

    } catch(e) {
      UI.toast('Error dashboard: ' + e.message, 'error');
      _setFreshnessError();
    }
  }

  function renderKPICards(d, role) {
    const cards = [
      { id: 'kpi-murid',      val: d.students.active + '/' + d.students.total },
      { id: 'kpi-mentor',     val: d.mentors.active  + '/' + d.mentors.total  },
      { id: 'kpi-spp',        val: d.spp.active },
      { id: 'kpi-presensi',   val: d.attendance.today }
    ];
    

    if (role !== 'MENTOR' && d.payments) {
      cards.push({ id: 'kpi-pembayaran', val: UI.formatCurrency(d.payments.today) });
      cards.push({ id: 'kpi-unpaid',     val: d.spp.unpaid });
    }

    cards.forEach(c => {
      const el = document.getElementById(c.id);
      if (el) el.textContent = c.val;
    });
  }

function renderFinanceCards(f) {
    const items = {
      'fin-spp':         f.total_masuk,
      'fin-operational': f.total_keluar,
      'fin-savings':     f.total_gaji,
      'fin-revenue':     f.laba_bersih
    };
    Object.entries(items).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) {
        el.textContent = UI.formatCurrency(val);
        if (id === 'fin-revenue') {
          el.style.color = (val >= 0) ? 'var(--success)' : 'var(--danger)';
        }
      }
    });
  }

  function renderMentorPersonalStats(stats) {
    const todayEl = document.getElementById('kpi-my-today');
    const monthEl = document.getElementById('kpi-my-month');
    if (todayEl) todayEl.textContent = stats.sessions_today;
    if (monthEl) monthEl.textContent = stats.sessions_this_month;
  }

  function renderTopStudents(students) {
    const rows = (students || []).map((s, i) => `
      <tr>
        <td><span class="rank-badge">${i + 1}</span></td>
        <td>${UI.escape(s.nama)}</td>
        <td>${UI.stars(s.total_bintang)}</td>
      </tr>`);
    UI.renderTable('top-students-body', rows, 'Belum ada data bintang');
  }

  function renderMentorPerformance(mentors) {
    const rows = (mentors || []).map(m => `
      <tr>
        <td>${UI.escape(m.nama || '-')}</td>
        <td><span class="pill">${UI.escape(m.sessions)} sesi</span></td>
      </tr>`);
    UI.renderTable('mentor-perf-body', rows, 'Belum ada data bulan ini');
  }

  function renderRecentActivity(activities) {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;
    if (!activities || activities.length === 0) {
      feed.innerHTML = '<div class="empty-feed">Tidak ada aktivitas terbaru</div>';
      return;
    }
    feed.innerHTML = activities.map(a => `
      <div class="activity-item">
        <div class="activity-icon ${a.status === 'HADIR' ? 'icon-success' : 'icon-warning'}">
          <i data-lucide="${a.status === 'HADIR' ? 'user-check' : 'user-x'}"></i>
        </div>
        <div class="activity-content">
          <div class="activity-name">${UI.escape(a.nama_murid || '-')}</div>
          <div class="activity-meta">${UI.escape(a.program || '')} · ${UI.escape(a.nama_mentor || '')} · ${UI.stars(a.bintang)}</div>
        </div>
        <div class="activity-date">${UI.formatDate(a.tanggal)}</div>
      </div>`).join('');
    lucide.createIcons({ nodes: [feed] });
  }

  function renderLowSessions(sessions) {
    const el = document.getElementById('low-sessions-list');
    if (!el) return;
    if (!sessions || sessions.length === 0) {
      el.innerHTML = '<div class="empty-feed">Semua paket masih mencukupi</div>';
      return;
    }
    el.innerHTML = sessions.map(s => `
      <div class="alert-row">
        <i data-lucide="alert-triangle" class="icon-warning-sm"></i>
        <div>
          <strong>${UI.escape(s.nama)}</strong>
          <small>${UI.escape(s.program)} — sisa ${UI.escape(s.sisa)} pertemuan</small>
        </div>
      </div>`).join('');
    lucide.createIcons({ nodes: [el] });
  }

  async function renderJadwalHariIni(role) {
    const el = document.getElementById('dash-jadwal-hari-ini');
    if (!el) return;

    const user    = API.currentUser();
    const hari    = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
    const hariIni = hari[new Date().getDay()].toUpperCase();

    try {
      const res = API.jadwal && API.jadwal.getAll ? API.jadwal.getAll() : null;
      if (!res) { el.innerHTML = '<div class="empty-feed">Fitur jadwal tidak tersedia</div>'; return; }
      const jadwal  = await res;
      let hari_ini  = (jadwal.data || []).filter(j =>
        (j.hari || '').toUpperCase() === hariIni
      );

      hari_ini.sort((a, b) => (a.jam || '').localeCompare(b.jam || ''));

      if (!hari_ini.length) {
        el.innerHTML = '<div class="empty-feed">Tidak ada jadwal hari ini</div>';
        return;
      }

      el.innerHTML = hari_ini.map(j => `
        <div style="
          display:flex; align-items:center; gap:12px;
          padding:10px 16px;
          border-bottom:1px solid var(--border);
        ">
          <div style="
            width:34px; height:34px; border-radius:50%;
            background:var(--success-dim,#d1fae5);
            color:var(--success,#10b981);
            display:flex; align-items:center; justify-content:center;
            flex-shrink:0;
          ">
            <i data-lucide="clock" style="width:16px;height:16px;"></i>
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:600; font-size:0.88rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${UI.escape(j.nama_murid || '-')}
            </div>
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:1px;">
              ${UI.escape(j.program || '')}
            </div>
          </div>
          <div style="
            font-size:0.78rem; font-weight:600;
            color:var(--primary,#3b82f6);
            white-space:nowrap; flex-shrink:0;
          ">${UI.escape(j.jam || '-')}</div>
        </div>`).join('');
      lucide.createIcons({ nodes: [el] });
    } catch(e) {
      el.innerHTML = '<div class="empty-feed">Gagal memuat jadwal</div>';
    }
  }

  return { load };
})();

window.Dashboard = Dashboard;