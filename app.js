/**
 * ============================================================================
 * APLIKASI ADMINISTRASI GURU SD - FRONTEND JAVASCRIPT CONTROLLER
 * File: app.js
 * Untuk Frontend GitHub Pages / Standalone Web Hosting
 * Menghubungkan antarmuka dengan Google Apps Script Web App via REST API fetch()
 * ============================================================================
 */

// Application State
var AppState = {
  token: sessionStorage.getItem('sd_auth_token') || null,
  user: null,
  currentView: 'dashboard',
  scheduleViewMode: 'agenda',
  attendanceTabMode: 'qr',
  gradeMode: 'input',
  reportType: 'attendance',
  adminSubTab: 'users',
  currentSessionId: null,
  html5QrScanner: null,
  isScanning: false,
  penugasanCache: [],
  classesCache: [],
  subjectsCache: [],
  teachersCache: [],
  studentsCache: []
};

// ============================================================================
// API CLIENT WRAPPER: Menghubungi Google Apps Script Web App via fetch()
// ============================================================================
function callApi(action) {
  var args = Array.prototype.slice.call(arguments, 1);
  return new Promise(function(resolve, reject) {
    var scriptUrl = APP_CONFIG.SCRIPT_URL;

    // Periksa apakah SCRIPT_URL sudah dikonfigurasi
    if (!scriptUrl || scriptUrl.trim() === '') {
      openApiConfigModal();
      var errNoUrl = 'URL Google Apps Script belum diisi. Silakan tempelkan Web App URL Anda.';
      showToast(errNoUrl, 'warning');
      reject(new Error(errNoUrl));
      return;
    }

    var payload = {
      action: action,
      args: args
    };

    // Gunakan 'text/plain' untuk menghindari CORS OPTIONS preflight pada Google Apps Script
    fetch(scriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    })
    .then(function(res) {
      if (!res.ok) {
        throw new Error('HTTP ' + res.status + ': ' + res.statusText);
      }
      return res.json();
    })
    .then(function(data) {
      if (data && data.success === false && data.message && data.message.indexOf('kedaluwarsa') !== -1) {
        handleSessionExpired();
        reject(new Error(data.message));
      } else {
        resolve(data);
      }
    })
    .catch(function(err) {
      console.error('Fetch API Error:', err);
      showToast('Gagal menghubungi backend: ' + err.message, 'error');
      reject(err);
    });
  });
}

// ============================================================================
// INISIALISASI APLIKASI
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
  initTheme();
  checkAuthentication();
});

function checkAuthentication() {
  updateDatabaseUiElements();
  if (!APP_CONFIG.SCRIPT_URL || APP_CONFIG.SCRIPT_URL.trim() === '') {
    openApiConfigModal();
    return;
  }

  var savedToken = sessionStorage.getItem('sd_auth_token');
  if (!savedToken) {
    showLoginOverlay();
    return;
  }

  callApi('apiCheckSession', savedToken)
    .then(function(res) {
      if (res && res.success) {
        AppState.token = savedToken;
        AppState.user = res.user;
        setupUserInterface();
      } else {
        handleSessionExpired();
      }
    })
    .catch(function() {
      handleSessionExpired();
    });
}

function setupUserInterface() {
  hideLoginOverlay();
  document.getElementById('app-container').style.display = 'flex';

  var u = AppState.user;
  document.getElementById('sidebar-user-name').innerText = u.Nama;
  document.getElementById('sidebar-avatar-text').innerText = u.Nama ? u.Nama.charAt(0).toUpperCase() : 'G';
  document.getElementById('sidebar-role-badge').innerText = u.Role;

  if (u.Role === 'ADMIN') {
    document.getElementById('nav-item-admin').style.display = 'block';
    document.getElementById('sidebar-action-pill-text').innerText = 'Data Master';
    document.getElementById('card-settings-school').style.display = 'block';
    var thSched = document.getElementById('th-schedule-action');
    if (thSched) thSched.style.display = 'table-cell';
    var btnAddSched = document.getElementById('btn-add-schedule');
    if (btnAddSched) btnAddSched.style.display = 'inline-flex';
  } else {
    document.getElementById('nav-item-admin').style.display = 'none';
    document.getElementById('sidebar-action-pill-text').innerText = 'Jadwal Hari Ini';
    document.getElementById('card-settings-school').style.display = 'none';
  }

  loadCommonDropdowns();
  updateDatabaseUiElements();
  navigateTo('dashboard');
}

function handleSessionExpired() {
  AppState.token = null;
  AppState.user = null;
  sessionStorage.removeItem('sd_auth_token');
  document.getElementById('app-container').style.display = 'none';
  showLoginOverlay();
  showToast('Sesi Anda telah berakhir. Silakan login kembali.', 'warning');
}

// ============================================================================
// MODAL SETUP URL API GOOGLE APPS SCRIPT
// ============================================================================
function openApiConfigModal() {
  var cur = APP_CONFIG.SCRIPT_URL || localStorage.getItem('sd_gas_api_url') || '';
  document.getElementById('input-gas-url').value = cur;
  openModal('modal-api-config');
}

function saveApiConfigUrl(e) {
  if (e) e.preventDefault();
  var url = document.getElementById('input-gas-url').value.trim();
  if (!url) {
    showToast('Harap masukkan URL Web App Google Apps Script.', 'warning');
    return;
  }
  if (url.indexOf('script.google.com') === -1 || url.indexOf('/exec') === -1) {
    if (!confirm('URL tampaknya bukan format Web App Google Apps Script (https://script.google.com/macros/s/.../exec). Apakah Anda yakin ingin melanjutkan?')) {
      return;
    }
  }

  APP_CONFIG.SCRIPT_URL = url;
  localStorage.setItem('sd_gas_api_url', url);
  closeModal('modal-api-config');
  showToast('URL backend berhasil disimpan!', 'success');
  checkAuthentication();
}

// ============================================================================
// AUTENTIKASI: LOGIN & LOGOUT
// ============================================================================
function showLoginOverlay() {
  document.getElementById('login-overlay').style.display = 'flex';
  document.getElementById('login-error-box').style.display = 'none';
}

function hideLoginOverlay() {
  document.getElementById('login-overlay').style.display = 'none';
}

function fillQuickLogin(username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
}

function togglePasswordVisibility(inputId) {
  var el = document.getElementById(inputId);
  if (el) el.type = (el.type === 'password') ? 'text' : 'password';
}

function handleLoginSubmit(e) {
  e.preventDefault();
  var u = document.getElementById('login-username').value.trim();
  var p = document.getElementById('login-password').value;
  var errBox = document.getElementById('login-error-box');
  var errMsg = document.getElementById('login-error-msg');
  var btn = document.getElementById('btn-login-submit');
  var spin = document.getElementById('login-spinner');

  errBox.style.display = 'none';
  btn.disabled = true;
  spin.style.display = 'inline-block';

  callApi('apiLogin', u, p)
    .then(function(res) {
      btn.disabled = false;
      spin.style.display = 'none';
      if (res && res.success) {
        AppState.token = res.token;
        AppState.user = res.user;
        sessionStorage.setItem('sd_auth_token', res.token);
        showToast(res.message, 'success');
        setupUserInterface();
      } else {
        errMsg.innerText = res ? res.message : 'Login gagal.';
        errBox.style.display = 'block';
      }
    })
    .catch(function(err) {
      btn.disabled = false;
      spin.style.display = 'none';
      errMsg.innerText = err.message || 'Terjadi kesalahan sistem.';
      errBox.style.display = 'block';
    });
}

function handleLogout() {
  if (!confirm('Apakah Anda yakin ingin keluar dari sistem?')) return;
  if (AppState.token) {
    callApi('apiLogout', AppState.token);
  }
  AppState.token = null;
  AppState.user = null;
  sessionStorage.removeItem('sd_auth_token');
  document.getElementById('app-container').style.display = 'none';
  showLoginOverlay();
  showToast('Anda telah berhasil keluar.', 'info');
}

// ============================================================================
// ROUTING & NAVIGASI
// ============================================================================
function navigateTo(viewName) {
  AppState.currentView = viewName;

  var sb = document.getElementById('app-sidebar');
  if (sb) sb.classList.remove('mobile-open');

  var navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(function(l) {
    if (l.getAttribute('data-view') === viewName) l.classList.add('active');
    else l.classList.remove('active');
  });

  var views = document.querySelectorAll('.app-view');
  views.forEach(function(v) { v.style.display = 'none'; });

  var targetView = document.getElementById('view-' + viewName);
  if (targetView) targetView.style.display = 'block';

  var titleMap = {
    'dashboard': { title: 'Dashboard', sub: 'Ringkasan aktivitas dan jadwal pembelajaran harian.' },
    'schedule': { title: 'Jadwal Pembelajaran', sub: 'Agenda mingguan dan daftar jam mengajar terstruktur.' },
    'attendance': { title: 'Presensi Siswa', sub: 'Perekaman presensi via QR Code dan input manual roster.' },
    'grades': { title: 'Penilaian Siswa', sub: 'Input nilai formatif/sumatif dan rekap capaian belajar.' },
    'reports': { title: 'Laporan & Rekapitulasi', sub: 'Cetak lembar laporan resmi dan ekspor data CSV.' },
    'admin': { title: 'Data Master Sekolah', sub: 'Konfigurasi akun guru, siswa, kelas, mapel, dan audit log.' },
    'settings': { title: 'Pengaturan Sistem', sub: 'Identitas sekolah, keamanan akun, dan preferensi tema.' }
  };

  var meta = titleMap[viewName] || { title: 'Administrasi Guru SD', sub: '' };
  document.getElementById('header-page-title').innerText = meta.title;
  document.getElementById('header-page-subtitle').innerText = meta.sub;

  if (viewName === 'dashboard') loadDashboardData();
  else if (viewName === 'schedule') loadScheduleData();
  else if (viewName === 'attendance') initAttendanceView();
  else if (viewName === 'grades') initGradesView();
  else if (viewName === 'reports') initReportsView();
  else if (viewName === 'admin') initAdminView();
  else if (viewName === 'settings') initSettingsView();
}

function toggleMobileSidebar() {
  var sb = document.getElementById('app-sidebar');
  if (sb) sb.classList.toggle('mobile-open');
}

// ============================================================================
// DASHBOARD CONTROLLER
// ============================================================================
function loadDashboardData() {
  if (!AppState.token) return;

  callApi('apiGetDashboardData', AppState.token)
    .then(function(res) {
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      var d = res.data;

      document.getElementById('header-school-name').innerText = d.namaSekolah || 'SD Negeri Cerdas Bangsa';
      document.getElementById('dash-date-badge').innerText = d.currentDay + ', ' + d.todayFormatted;
      document.getElementById('dash-semester-badge').innerText = 'Semester ' + d.semesterAktif + ' (' + d.tahunAktif + ')';

      if (d.databaseInfo && d.databaseInfo.spreadsheetUrl) {
        var btnSheet = document.getElementById('btn-open-spreadsheet');
        var nameSheet = document.getElementById('set-spreadsheet-name');
        if (btnSheet) btnSheet.href = d.databaseInfo.spreadsheetUrl;
        if (nameSheet && d.databaseInfo.spreadsheetName) nameSheet.innerText = d.databaseInfo.spreadsheetName;
      }

      if (d.role === 'ADMIN') {
        document.getElementById('metric-total-siswa').innerText = d.metrics.totalSiswa || 0;
        document.getElementById('metric-total-kelas').innerText = d.metrics.totalKelas || 0;
        document.getElementById('metric-total-mapel').innerText = d.metrics.totalGuru || 0;
        document.querySelector('#metrics-overview-bar div:nth-child(3) div:first-child').innerText = 'TOTAL GURU';
        document.getElementById('metric-total-jadwal').innerText = d.jadwalHariIni ? d.jadwalHariIni.length : 0;
      } else {
        document.getElementById('metric-total-siswa').innerText = d.metrics.totalSiswa || 0;
        document.getElementById('metric-total-kelas').innerText = d.metrics.totalKelasDiampu || 0;
        document.getElementById('metric-total-mapel').innerText = d.metrics.totalMapelDiampu || 0;
        document.querySelector('#metrics-overview-bar div:nth-child(3) div:first-child').innerText = 'MATA PELAJARAN';
        document.getElementById('metric-total-jadwal').innerText = d.jadwalHariIni ? d.jadwalHariIni.length : 0;
      }

      var sm = d.summaryAbsensi;
      document.getElementById('badge-total-hadir').innerText = sm.Hadir + ' Hadir';
      document.getElementById('stat-hadir-count').innerText = sm.Hadir + ' Siswa';
      document.getElementById('stat-izin-count').innerText = (sm.Izin + sm.Sakit) + ' Siswa';
      document.getElementById('stat-alpa-count').innerText = sm.Alpa + ' Siswa';

      var totalAtt = sm.Total || 1;
      document.getElementById('bar-hadir').style.width = ((sm.Hadir / totalAtt) * 100) + '%';
      document.getElementById('bar-izin').style.width = (((sm.Izin + sm.Sakit) / totalAtt) * 100) + '%';
      document.getElementById('bar-alpa').style.width = ((sm.Alpa / totalAtt) * 100) + '%';

      var tContainer = document.getElementById('timeline-schedule-container');
      if (d.jadwalHariIni && d.jadwalHariIni.length > 0) {
        var html = '';
        for (var i = 0; i < d.jadwalHariIni.length; i++) {
          var j = d.jadwalHariIni[i];
          html += '<div class="timeline-item">' +
            '<div class="timeline-time-col">' + j.JamMulai + '</div>' +
            '<div class="timeline-schedule-card">' +
              '<div class="schedule-info">' +
                '<span class="badge-time">⏰ ' + j.JamMulai + ' - ' + j.JamSelesai + '</span>' +
                '<h4>' + j.Mapel + ' &bull; ' + j.Kelas + '</h4>' +
                '<p>' + (d.role === 'ADMIN' ? 'Guru: ' + j.Guru + ' &bull; ' : '') + 'Ruang: ' + j.Ruang + '</p>' +
              '</div>' +
              '<button class="card-action-btn" style="background: var(--primary-light); color: var(--primary);" title="Buka Presensi" onclick="openAttendanceForSchedule(\'' + (j.PenugasanID || '') + '\')">➔</button>' +
            '</div>' +
          '</div>';
        }
        tContainer.innerHTML = html;
      } else {
        tContainer.innerHTML = '<div class="empty-state">' +
          '<div class="empty-state-icon">☕</div>' +
          '<h4>Tidak ada jadwal mengajar pada ' + d.currentDay + '</h4>' +
          '<p>Nikmati waktu luang Anda atau periksa administrasi persiapan materi.</p>' +
        '</div>';
      }

      var rList = document.getElementById('recent-attendance-list');
      if (d.recentAttendance && d.recentAttendance.length > 0) {
        var rHtml = '';
        for (var r = 0; r < d.recentAttendance.length; r++) {
          var item = d.recentAttendance[r];
          var badgeClass = 'badge-hadir';
          if (item.Status === 'Sakit') badgeClass = 'badge-sakit';
          else if (item.Status === 'Izin') badgeClass = 'badge-izin';
          else if (item.Status === 'Alpa') badgeClass = 'badge-alpa';
          else if (item.Status === 'Terlambat') badgeClass = 'badge-terlambat';

          rHtml += '<div class="compact-list-item">' +
            '<div class="compact-item-left">' +
              '<div class="mini-avatar" style="width: 34px; height: 34px; font-size: 13px;">' + (item.Nama ? item.Nama.charAt(0) : 'S') + '</div>' +
              '<div class="compact-item-text">' +
                '<h5>' + item.Nama + '</h5>' +
                '<p>NIS: ' + item.NIS + ' &bull; Pukul ' + item.Waktu + '</p>' +
              '</div>' +
            '</div>' +
            '<span class="badge-status ' + badgeClass + '">' + item.Status + '</span>' +
          '</div>';
        }
        rList.innerHTML = rHtml;
      } else {
        rList.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 20px 0;">Belum ada aktivitas presensi hari ini.</div>';
      }
    });
}

function switchDashboardTab(btn, tabMode) {
  document.querySelectorAll('.tab-pills .tab-pill').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
}

function openAttendanceForSchedule(penugasanId) {
  navigateTo('attendance');
  if (penugasanId) {
    setTimeout(function() {
      var sel = document.getElementById('att-select-penugasan');
      if (sel) {
        sel.value = penugasanId;
        handleAttendancePenugasanChange();
      }
    }, 300);
  }
}

// ============================================================================
// JADWAL PEMBELAJARAN CONTROLLER
// ============================================================================
function loadScheduleData() {
  if (!AppState.token) return;
  var dayFilter = document.getElementById('filter-schedule-day').value;
  var classFilter = document.getElementById('filter-schedule-class').value;

  callApi('apiGetSchedules', AppState.token, { hari: dayFilter, kelasId: classFilter })
    .then(function(res) {
      if (!res.success) return;
      var schedules = res.data;

      var tbody = document.getElementById('schedule-table-body');
      if (schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Tidak ada jadwal yang sesuai filter.</td></tr>';
      } else {
        var tHtml = '';
        for (var i = 0; i < schedules.length; i++) {
          var s = schedules[i];
          tHtml += '<tr>' +
            '<td><strong style="color: var(--primary);">' + s.Hari + '</strong></td>' +
            '<td>⏰ ' + s.JamMulai + ' - ' + s.JamSelesai + '</td>' +
            '<td>' + s.KelasNama + '</td>' +
            '<td><strong>' + s.MapelNama + '</strong></td>' +
            '<td>' + s.GuruNama + '</td>' +
            '<td>' + (s.RuangOpsional || 'Ruang Kelas') + '</td>' +
            (AppState.user.Role === 'ADMIN' ?
              '<td style="text-align: right;">' +
                '<button class="btn btn-secondary btn-sm" onclick="editScheduleItem(\'' + s.ID + '\')" style="margin-right: 6px;">✏️</button>' +
                '<button class="btn btn-danger btn-sm" onclick="deleteScheduleItem(\'' + s.ID + '\')">🗑️</button>' +
              '</td>' : '') +
          '</tr>';
        }
        tbody.innerHTML = tHtml;
      }

      renderWeeklyAgendaGrid(schedules);
    });
}

function renderWeeklyAgendaGrid(schedules) {
  var grid = document.getElementById('weekly-days-grid');
  var days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var dayMap = {};
  for (var d = 0; d < days.length; d++) dayMap[days[d]] = [];

  for (var s = 0; s < schedules.length; s++) {
    var sch = schedules[s];
    if (dayMap[sch.Hari]) dayMap[sch.Hari].push(sch);
  }

  var html = '';
  for (var i = 0; i < days.length; i++) {
    var dayName = days[i];
    var items = dayMap[dayName];

    html += '<div class="content-card" style="padding: 18px; margin-bottom: 0;">' +
      '<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 2px solid var(--border-color); padding-bottom: 8px;">' +
        '<h4 style="font-size: 15px; font-weight: 800; color: var(--text-main);">' + dayName + '</h4>' +
        '<span class="badge-status badge-izin">' + items.length + ' Sesi</span>' +
      '</div>';

    if (items.length === 0) {
      html += '<div style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 24px 0;">Tidak ada jadwal</div>';
    } else {
      html += '<div style="display: flex; flex-direction: column; gap: 10px;">';
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        html += '<div style="background: var(--bg-card-subtle); border-left: 4px solid var(--primary); padding: 10px 12px; border-radius: var(--radius-sm); font-size: 12px;">' +
          '<div style="font-weight: 700; color: var(--text-main); margin-bottom: 2px;">' + it.MapelNama + ' &bull; ' + it.KelasNama + '</div>' +
          '<div style="color: var(--text-secondary);">' + it.JamMulai + ' - ' + it.JamSelesai + ' (' + (it.RuangOpsional || 'Ruang Kelas') + ')</div>' +
          (AppState.user.Role === 'ADMIN' ? '<div style="color: var(--primary); font-size: 11px; margin-top: 4px;">👨‍🏫 ' + it.GuruNama + '</div>' : '') +
        '</div>';
      }
      html += '</div>';
    }

    html += '</div>';
  }

  grid.innerHTML = html;
}

function switchScheduleView(mode) {
  AppState.scheduleViewMode = mode;
  var bAgenda = document.getElementById('btn-schedule-view-agenda');
  var bTable = document.getElementById('btn-schedule-view-table');
  var vAgenda = document.getElementById('schedule-agenda-view');
  var vTable = document.getElementById('schedule-table-view');

  if (mode === 'agenda') {
    bAgenda.classList.add('active');
    bTable.classList.remove('active');
    vAgenda.style.display = 'block';
    vTable.style.display = 'none';
  } else {
    bTable.classList.add('active');
    bAgenda.classList.remove('active');
    vTable.style.display = 'block';
    vAgenda.style.display = 'none';
  }
}

function resetScheduleFilter() {
  document.getElementById('filter-schedule-day').value = '';
  document.getElementById('filter-schedule-class').value = '';
  loadScheduleData();
}

function openScheduleModal(editData) {
  var warn = document.getElementById('schedule-conflict-warning');
  warn.style.display = 'none';

  if (editData) {
    document.getElementById('modal-schedule-title').innerText = 'Edit Jadwal Pembelajaran';
    document.getElementById('sched-form-id').value = editData.ID;
    document.getElementById('sched-form-penugasan').value = editData.PenugasanID;
    document.getElementById('sched-form-hari').value = editData.Hari;
    document.getElementById('sched-form-ruang').value = editData.RuangOpsional || '';
    document.getElementById('sched-form-start').value = editData.JamMulai;
    document.getElementById('sched-form-end').value = editData.JamSelesai;
  } else {
    document.getElementById('modal-schedule-title').innerText = 'Tambah Jadwal Pembelajaran';
    document.getElementById('sched-form-id').value = '';
    document.getElementById('sched-form-ruang').value = '';
  }
  openModal('modal-schedule');
}

function handleScheduleFormSubmit(e) {
  e.preventDefault();
  var payload = {
    ID: document.getElementById('sched-form-id').value || null,
    PenugasanID: document.getElementById('sched-form-penugasan').value,
    Hari: document.getElementById('sched-form-hari').value,
    JamMulai: document.getElementById('sched-form-start').value,
    JamSelesai: document.getElementById('sched-form-end').value,
    RuangOpsional: document.getElementById('sched-form-ruang').value
  };

  var warn = document.getElementById('schedule-conflict-warning');
  var btn = document.getElementById('btn-save-schedule');
  btn.disabled = true;

  callApi('apiSaveSchedule', AppState.token, payload)
    .then(function(res) {
      btn.disabled = false;
      if (res && res.success) {
        closeModal('modal-schedule');
        showToast(res.message, 'success');
        loadScheduleData();
      } else {
        warn.innerText = res ? res.message : 'Gagal menyimpan jadwal.';
        warn.style.display = 'block';
      }
    })
    .catch(function(err) {
      btn.disabled = false;
      warn.innerText = err.message;
      warn.style.display = 'block';
    });
}

function deleteScheduleItem(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus jadwal ini?')) return;
  callApi('apiDeleteSchedule', AppState.token, id)
    .then(function(res) {
      if (res && res.success) {
        showToast(res.message, 'success');
        loadScheduleData();
      } else {
        showToast(res.message, 'error');
      }
    });
}

// ============================================================================
// PRESENSI & KEHADIRAN CONTROLLER (QR & MANUAL)
// ============================================================================
function initAttendanceView() {
  loadAttendancePenugasanDropdown();
}

function loadAttendancePenugasanDropdown() {
  if (!AppState.token) return;
  callApi('apiGetTeacherAssignments', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var list = res.data;
      var sel = document.getElementById('att-select-penugasan');
      var mSel = document.getElementById('modal-ses-penugasan');

      var opts = '<option value="">-- Pilih Kelas & Mapel --</option>';
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        opts += '<option value="' + p.ID + '">' + p.KelasNama + ' - ' + p.MapelNama + ' (' + p.GuruNama + ')</option>';
      }
      sel.innerHTML = opts;
      if (mSel) mSel.innerHTML = opts;
    });
}

function handleAttendancePenugasanChange() {
  var pId = document.getElementById('att-select-penugasan').value;
  var sSel = document.getElementById('att-select-session');
  if (!pId) {
    sSel.innerHTML = '<option value="">-- Pilih Sesi Presensi --</option>';
    document.getElementById('session-active-card').style.display = 'none';
    document.getElementById('attendance-tabs-container').style.display = 'none';
    document.getElementById('att-no-session-placeholder').style.display = 'block';
    return;
  }

  callApi('apiGetAttendanceSessions', AppState.token, pId)
    .then(function(res) {
      if (!res.success) return;
      var sessions = res.data;
      var opts = '<option value="">-- Pilih Sesi Presensi --</option>';
      for (var i = 0; i < sessions.length; i++) {
        var s = sessions[i];
        opts += '<option value="' + s.ID + '">' + s.Tanggal + ' (' + s.JamMulai + ' - ' + s.JamSelesai + ') [' + s.StatusSesi + ']</option>';
      }
      sSel.innerHTML = opts;

      if (sessions.length > 0) {
        sSel.value = sessions[0].ID;
        loadSessionDetails();
      } else {
        document.getElementById('session-active-card').style.display = 'none';
        document.getElementById('attendance-tabs-container').style.display = 'none';
        document.getElementById('att-no-session-placeholder').style.display = 'block';
      }
    });
}

function loadSessionDetails() {
  var sId = document.getElementById('att-select-session').value;
  if (!sId) return;

  AppState.currentSessionId = sId;

  callApi('apiGetSessionDetails', AppState.token, sId)
    .then(function(res) {
      if (!res.success) {
        showToast(res.message, 'error');
        return;
      }
      var data = res.data;
      var ses = data.session;

      document.getElementById('att-no-session-placeholder').style.display = 'none';
      document.getElementById('session-active-card').style.display = 'block';
      document.getElementById('attendance-tabs-container').style.display = 'block';

      document.getElementById('ses-detail-title').innerText = data.kelasNama + ' &bull; ' + data.mapelNama;
      document.getElementById('ses-detail-sub').innerText = '📅 Tanggal: ' + ses.Tanggal + ' • Pukul ' + ses.JamMulai + ' - ' + ses.JamSelesai;
      var bStat = document.getElementById('ses-detail-status');
      bStat.innerText = ses.StatusSesi;
      bStat.className = 'badge-status ' + (ses.StatusSesi === 'BUKA' ? 'badge-active' : 'badge-inactive');

      var btnClose = document.getElementById('btn-close-session');
      if (btnClose) btnClose.style.display = (ses.StatusSesi === 'BUKA') ? 'inline-flex' : 'none';

      var c = data.summary;
      document.getElementById('cnt-hadir').innerText = c.Hadir;
      document.getElementById('cnt-terlambat').innerText = c.Terlambat;
      document.getElementById('cnt-izin').innerText = c.Izin;
      document.getElementById('cnt-sakit').innerText = c.Sakit;
      document.getElementById('cnt-alpa').innerText = c.Alpa;
      document.getElementById('cnt-belum').innerText = c.BelumCatat;

      AppState.currentQrPayload = data.qrPayload;
      renderManualAttendanceRoster(data.roster);
    });
}

function switchAttendanceTab(tab) {
  AppState.attendanceTabMode = tab;
  var bQr = document.getElementById('btn-tab-qr');
  var bMan = document.getElementById('btn-tab-manual');
  var tQr = document.getElementById('tab-att-qr');
  var tMan = document.getElementById('tab-att-manual');

  if (tab === 'qr') {
    bQr.classList.add('active');
    bMan.classList.remove('active');
    tQr.style.display = 'block';
    tMan.style.display = 'none';
  } else {
    bMan.classList.add('active');
    bQr.classList.remove('active');
    tMan.style.display = 'block';
    tQr.style.display = 'none';
    stopCameraScanner();
  }
}

function renderManualAttendanceRoster(roster) {
  var tbody = document.getElementById('manual-roster-body');
  if (!roster || roster.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Tidak ada siswa terdaftar pada kelas ini.</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < roster.length; i++) {
    var s = roster[i];
    html += '<tr data-siswa-id="' + s.SiswaID + '">' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + s.NIS + '</td>' +
      '<td><strong>' + s.Nama + '</strong> (' + s.JenisKelamin + ')</td>' +
      '<td>' +
        '<select class="form-select form-select-sm sel-status-roster" style="width: 130px; font-weight: 700;">' +
          '<option value="Hadir" ' + (s.Status === 'Hadir' ? 'selected' : '') + '>Hadir</option>' +
          '<option value="Terlambat" ' + (s.Status === 'Terlambat' ? 'selected' : '') + '>Terlambat</option>' +
          '<option value="Izin" ' + (s.Status === 'Izin' ? 'selected' : '') + '>Izin</option>' +
          '<option value="Sakit" ' + (s.Status === 'Sakit' ? 'selected' : '') + '>Sakit</option>' +
          '<option value="Alpa" ' + (s.Status === 'Alpa' ? 'selected' : '') + '>Alpa</option>' +
          (s.Status === 'Belum Dicatat' ? '<option value="Belum Dicatat" selected>Belum Dicatat</option>' : '') +
        '</select>' +
      '</td>' +
      '<td><span class="badge-status ' + (s.Metode === 'QR_SCAN' ? 'badge-hadir' : 'badge-inactive') + '">' + s.Metode + '</span></td>' +
      '<td>' + (s.WaktuCatat !== '-' ? s.WaktuCatat.substring(11, 16) : '-') + '</td>' +
      '<td>' +
        '<input type="text" class="form-input form-input-sm input-catatan-roster" value="' + (s.Catatan || '') + '" placeholder="Keterangan opsional...">' +
      '</td>' +
    '</tr>';
  }
  tbody.innerHTML = html;
}

function markAllRosterAs(status) {
  var selects = document.querySelectorAll('.sel-status-roster');
  selects.forEach(function(sel) { sel.value = status; });
  showToast('Seluruh status siswa diset ke "' + status + '" (Klik Simpan untuk menyimpan).', 'info');
}

function saveManualAttendanceBatch() {
  if (!AppState.currentSessionId) return;
  var rows = document.querySelectorAll('#manual-roster-body tr');
  var records = [];

  rows.forEach(function(r) {
    var siswaId = r.getAttribute('data-siswa-id');
    var sel = r.querySelector('.sel-status-roster');
    var cat = r.querySelector('.input-catatan-roster');
    if (siswaId && sel && sel.value !== 'Belum Dicatat') {
      records.push({
        SiswaID: siswaId,
        Status: sel.value,
        Catatan: cat ? cat.value : ''
      });
    }
  });

  if (records.length === 0) {
    showToast('Tidak ada presensi yang perlu disimpan.', 'warning');
    return;
  }

  var btn = document.getElementById('btn-save-manual-att');
  if (btn) btn.disabled = true;

  callApi('apiSaveAttendanceManualBatch', AppState.token, AppState.currentSessionId, records)
    .then(function(res) {
      if (btn) btn.disabled = false;
      if (res && res.success) {
        showToast(res.message, 'success');
        loadSessionDetails();
      } else {
        showToast(res.message, 'error');
      }
    })
    .catch(function(err) {
      if (btn) btn.disabled = false;
      showToast(err.message, 'error');
    });
}

function submitManualScanNis() {
  var input = document.getElementById('input-scan-nis');
  var val = input.value.trim();
  if (!val) return;

  if (!AppState.currentSessionId) {
    showToast('Silakan buka atau pilih sesi presensi terlebih dahulu!', 'warning');
    return;
  }

  callApi('apiRecordAttendanceQR', AppState.token, AppState.currentSessionId, val)
    .then(function(res) {
      input.value = '';
      input.focus();
      if (res && res.success) {
        appendLiveScanLog(res.siswa.Nama + ' (' + res.siswa.NIS + ')', 'HADIR', res.waktu);
        showToast(res.message, 'success');
        loadSessionDetails();
      } else {
        showToast(res ? res.message : 'Pemindaian gagal.', 'error');
      }
    });
}

function handleNisInputKey(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitManualScanNis();
  }
}

function appendLiveScanLog(studentName, status, timeStr) {
  var logBox = document.getElementById('live-scan-log');
  var empty = logBox.querySelector('.empty-state');
  if (empty) logBox.innerHTML = '';

  var time = timeStr ? String(timeStr).substring(11, 19) : new Date().toLocaleTimeString();
  var logItem = document.createElement('div');
  logItem.className = 'compact-list-item';
  logItem.style.background = '#ECFDF5';
  logItem.style.borderColor = '#A7F3D0';
  logItem.innerHTML = '<div class="compact-item-left">' +
    '<div class="mini-avatar" style="background: var(--accent-emerald);">✓</div>' +
    '<div class="compact-item-text">' +
      '<h5 style="color: #065F46;">' + studentName + '</h5>' +
      '<p>Tercatat pukul ' + time + '</p>' +
    '</div>' +
  '</div>' +
  '<span class="badge-status badge-hadir">' + status + '</span>';

  logBox.insertBefore(logItem, logBox.firstChild);
}

function openCreateSessionModal() {
  var tglInput = document.getElementById('modal-ses-tanggal');
  if (tglInput) {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    tglInput.value = y + '-' + m + '-' + d;
  }

  var curP = document.getElementById('att-select-penugasan').value;
  if (curP) document.getElementById('modal-ses-penugasan').value = curP;
  openModal('modal-create-session');
}

function handleCreateSessionSubmit(e) {
  e.preventDefault();
  var pId = document.getElementById('modal-ses-penugasan').value;
  var tgl = document.getElementById('modal-ses-tanggal').value;
  var jmM = document.getElementById('modal-ses-jam-mulai').value;
  var jmS = document.getElementById('modal-ses-jam-selesai').value;

  var btn = document.getElementById('btn-submit-create-session');
  btn.disabled = true;

  callApi('apiCreateAttendanceSession', AppState.token, pId, tgl, jmM, jmS)
    .then(function(res) {
      btn.disabled = false;
      if (res && res.success) {
        closeModal('modal-create-session');
        showToast(res.message, 'success');
        document.getElementById('att-select-penugasan').value = pId;
        handleAttendancePenugasanChange();
      } else {
        showToast(res.message, 'error');
      }
    });
}

function closeCurrentSession() {
  if (!AppState.currentSessionId) return;
  if (!confirm('Apakah Anda yakin ingin menutup sesi absensi ini?')) return;

  callApi('apiCloseAttendanceSession', AppState.token, AppState.currentSessionId)
    .then(function(res) {
      if (res && res.success) {
        showToast(res.message, 'success');
        loadSessionDetails();
      } else {
        showToast(res.message, 'error');
      }
    });
}

function showQrProjectorModal() {
  if (!AppState.currentQrPayload) {
    showToast('Data QR sesi tidak tersedia.', 'warning');
    return;
  }

  var container = document.getElementById('qrcode-render');
  container.innerHTML = '';

  if (typeof QRCode !== 'undefined') {
    new QRCode(container, {
      text: AppState.currentQrPayload,
      width: 240,
      height: 240,
      colorDark: '#1E1B4B',
      colorLight: '#FFFFFF',
      correctLevel: QRCode.CorrectLevel.H
    });
  } else {
    container.innerHTML = '<div style="padding: 20px; font-size: 13px;">QR Code Token: ' + AppState.currentSessionId + '</div>';
  }

  document.getElementById('projector-session-code').innerText = 'ID SESI: ' + AppState.currentSessionId;
  openModal('modal-qr-projector');
}

// ============================================================================
// CAMERA QR SCANNER (HTML5 QR CODE)
// ============================================================================
function toggleCameraScanner() {
  if (AppState.isScanning) stopCameraScanner();
  else startCameraScanner();
}

function startCameraScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    showToast('Pustaka pemindai kamera belum termuat. Gunakan input NIS manual.', 'warning');
    return;
  }

  var btn = document.getElementById('btn-toggle-camera');
  var vBox = document.getElementById('qr-camera-box');
  var place = document.getElementById('qr-camera-placeholder');

  place.style.display = 'none';
  vBox.innerHTML = '<div id="reader" style="width: 100%; height: 100%;"></div>';

  var html5QrCode = new Html5Qrcode("reader");
  AppState.html5QrScanner = html5QrCode;

  html5QrCode.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 220, height: 220 } },
    function(decodedText) {
      handleQrScannedText(decodedText);
    },
    function() {}
  ).then(function() {
    AppState.isScanning = true;
    btn.innerText = '⏹ Matikan Kamera';
    btn.className = 'btn btn-danger btn-sm';
  }).catch(function(err) {
    showToast('Gagal mengakses kamera: ' + err, 'error');
    stopCameraScanner();
  });
}

function stopCameraScanner() {
  if (AppState.html5QrScanner && AppState.isScanning) {
    AppState.html5QrScanner.stop().then(function() {
      AppState.isScanning = false;
      var btn = document.getElementById('btn-toggle-camera');
      if (btn) {
        btn.innerText = '▶ Aktifkan Kamera';
        btn.className = 'btn btn-secondary btn-sm';
      }
      var vBox = document.getElementById('qr-camera-box');
      if (vBox) {
        vBox.innerHTML = '<div id="qr-camera-placeholder" style="color: #94A3B8; font-size: 13px; padding: 20px;">' +
          '<div style="font-size: 40px; margin-bottom: 10px;">📸</div>' +
          'Kamera siap digunakan.<br>Klik tombol di bawah untuk mengaktifkan scanner.' +
        '</div>';
      }
    });
  }
}

function handleQrScannedText(text) {
  var studentIdent = text;
  try {
    var parsed = JSON.parse(text);
    if (parsed.nis) studentIdent = parsed.nis;
    else if (parsed.id) studentIdent = parsed.id;
  } catch (e) {}

  callApi('apiRecordAttendanceQR', AppState.token, AppState.currentSessionId, studentIdent)
    .then(function(res) {
      if (res && res.success) {
        appendLiveScanLog(res.siswa.Nama + ' (' + res.siswa.NIS + ')', 'HADIR', res.waktu);
        showToast('Presensi ' + res.siswa.Nama + ' tercatat!', 'success');
        loadSessionDetails();
      } else {
        showToast(res ? res.message : 'Scan tidak valid.', 'error');
      }
    });
}

// ============================================================================
// PENILAIAN CONTROLLER (INPUT & MATRIKS REKAP NILAI)
// ============================================================================
function initGradesView() {
  loadGradeDropdowns();
}

function loadGradeDropdowns() {
  if (!AppState.token) return;

  callApi('apiGetTeacherAssignments', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var sel = document.getElementById('grade-filter-penugasan');
      var rSel = document.getElementById('rep-grade-penugasan');
      var opts = '<option value="">-- Pilih Penugasan Guru --</option>';
      for (var i = 0; i < res.data.length; i++) {
        var p = res.data[i];
        opts += '<option value="' + p.ID + '">' + p.KelasNama + ' - ' + p.MapelNama + ' (' + p.GuruNama + ')</option>';
      }
      sel.innerHTML = opts;
      if (rSel) rSel.innerHTML = opts;
    });

  callApi('apiGetAssessmentTypes', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var sel = document.getElementById('grade-filter-jenis');
      var opts = '<option value="">-- Pilih Jenis Penilaian --</option>';
      for (var j = 0; j < res.data.length; j++) {
        var jp = res.data[j];
        opts += '<option value="' + jp.ID + '">' + jp.NamaPenilaian + ' (' + jp.Kategori + ')</option>';
      }
      sel.innerHTML = opts;
    });
}

function handleGradePenugasanChange() {
  loadGradeData();
}

function switchGradeMode(mode) {
  AppState.gradeMode = mode;
  var bInp = document.getElementById('btn-grade-mode-input');
  var bRec = document.getElementById('btn-grade-mode-recap');
  var wJenis = document.getElementById('wrapper-grade-jenis');

  if (mode === 'input') {
    bInp.classList.add('active');
    bRec.classList.remove('active');
    wJenis.style.display = 'block';
  } else {
    bRec.classList.add('active');
    bInp.classList.remove('active');
    wJenis.style.display = 'none';
  }
  loadGradeData();
}

function loadGradeData() {
  var pId = document.getElementById('grade-filter-penugasan').value;
  var jId = document.getElementById('grade-filter-jenis').value;
  var prd = document.getElementById('grade-filter-periode').value;

  var place = document.getElementById('grade-placeholder');
  var cInp = document.getElementById('grade-input-container');
  var cRec = document.getElementById('grade-recap-container');

  if (!pId) {
    place.style.display = 'block';
    cInp.style.display = 'none';
    cRec.style.display = 'none';
    return;
  }

  if (AppState.gradeMode === 'input') {
    if (!jId) {
      place.style.display = 'block';
      cInp.style.display = 'none';
      cRec.style.display = 'none';
      return;
    }

    callApi('apiGetGradeSheet', AppState.token, pId, jId, prd)
      .then(function(res) {
        if (!res.success) {
          showToast(res.message, 'error');
          return;
        }
        var d = res.data;
        place.style.display = 'none';
        cInp.style.display = 'block';
        cRec.style.display = 'none';

        document.getElementById('grade-sheet-title').innerText = d.kelasNama + ' • ' + d.mapelNama + ' — ' + d.jenisPenilaianNama + ' (' + d.periode + ')';
        document.getElementById('grd-stat-total').innerText = d.stats.totalSiswa;
        document.getElementById('grd-stat-scored').innerText = d.stats.sudahDinilai;
        document.getElementById('grd-stat-avg').innerText = d.stats.rataRata;
        document.getElementById('grd-stat-high').innerText = d.stats.tertinggi;
        document.getElementById('grd-stat-low').innerText = d.stats.terendah;

        renderGradeSheetTable(d.roster);
      });

  } else {
    callApi('apiGetGradeRecap', AppState.token, pId, prd)
      .then(function(res) {
        if (!res.success) {
          showToast(res.message, 'error');
          return;
        }
        place.style.display = 'none';
        cInp.style.display = 'none';
        cRec.style.display = 'block';

        var d = res.data;
        document.getElementById('grade-recap-title').innerText = 'Rekap Nilai ' + d.kelasNama + ' • ' + d.mapelNama + ' (' + d.periode + ')';
        renderGradeRecapTable(d);
      });
  }
}

function renderGradeSheetTable(roster) {
  var tbody = document.getElementById('grade-table-body');
  if (!roster || roster.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Tidak ada siswa terdaftar.</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < roster.length; i++) {
    var st = roster[i];
    html += '<tr data-siswa-id="' + st.SiswaID + '" data-nama="' + st.Nama + '">' +
      '<td>' + (i + 1) + '</td>' +
      '<td>' + st.NIS + '</td>' +
      '<td><strong>' + st.Nama + '</strong></td>' +
      '<td>' +
        '<input type="number" class="form-input form-input-sm input-grade-val" min="0" max="100" step="0.5" value="' + (st.Nilai !== '' ? st.Nilai : '') + '" placeholder="0 - 100" style="font-weight: 700; width: 100px;" oninput="validateScoreInput(this)">' +
      '</td>' +
      '<td>' +
        '<input type="text" class="form-input form-input-sm input-grade-desc" value="' + (st.Deskripsi || '') + '" placeholder="Capaian pembelajaran...">' +
      '</td>' +
      '<td>' +
        '<input type="text" class="form-input form-input-sm input-grade-cat" value="' + (st.Catatan || '') + '" placeholder="Catatan opsional...">' +
      '</td>' +
    '</tr>';
  }
  tbody.innerHTML = html;
}

function validateScoreInput(inputEl) {
  var val = parseFloat(inputEl.value);
  if (isNaN(val) || val < 0 || val > 100) {
    inputEl.style.borderColor = 'var(--accent-rose)';
    inputEl.style.background = '#FEF2F2';
  } else {
    inputEl.style.borderColor = 'var(--primary)';
    inputEl.style.background = '#EEF2FF';
  }
}

function saveGradesBatch() {
  var pId = document.getElementById('grade-filter-penugasan').value;
  var jId = document.getElementById('grade-filter-jenis').value;
  var prd = document.getElementById('grade-filter-periode').value;

  var rows = document.querySelectorAll('#grade-table-body tr');
  var gradesList = [];
  var hasInvalid = false;

  rows.forEach(function(r) {
    var sId = r.getAttribute('data-siswa-id');
    var sNama = r.getAttribute('data-nama');
    var valEl = r.querySelector('.input-grade-val');
    var descEl = r.querySelector('.input-grade-desc');
    var catEl = r.querySelector('.input-grade-cat');

    if (sId && valEl && valEl.value.trim() !== '') {
      var num = parseFloat(valEl.value);
      if (isNaN(num) || num < 0 || num > 100) hasInvalid = true;
      gradesList.push({
        SiswaID: sId,
        Nama: sNama,
        Nilai: num,
        Deskripsi: descEl ? descEl.value : '',
        Catatan: catEl ? catEl.value : ''
      });
    }
  });

  if (hasInvalid) {
    showToast('Terdapat nilai yang tidak valid (harus 0 - 100)! Periksa kembali angka yang diinput.', 'error');
    return;
  }

  if (gradesList.length === 0) {
    showToast('Belum ada nilai yang diinput untuk disimpan.', 'warning');
    return;
  }

  var btn1 = document.getElementById('btn-save-grades-top');
  var btn2 = document.getElementById('btn-save-grades-bottom');
  if (btn1) btn1.disabled = true;
  if (btn2) btn2.disabled = true;

  callApi('apiSaveGradesBatch', AppState.token, pId, jId, prd, gradesList)
    .then(function(res) {
      if (btn1) btn1.disabled = false;
      if (btn2) btn2.disabled = false;
      if (res && res.success) {
        showToast(res.message, 'success');
        loadGradeData();
      } else {
        showToast(res.message, 'error');
      }
    })
    .catch(function(err) {
      if (btn1) btn1.disabled = false;
      if (btn2) btn2.disabled = false;
      showToast(err.message, 'error');
    });
}

function renderGradeRecapTable(data) {
  var thead = document.getElementById('grade-recap-thead');
  var tbody = document.getElementById('grade-recap-tbody');
  var jList = data.jenisPenilaian;
  var rows = data.rows;

  var hHtml = '<tr><th style="width: 50px;">No</th><th>NIS</th><th>Nama Siswa</th>';
  for (var j = 0; j < jList.length; j++) hHtml += '<th>' + jList[j].NamaPenilaian + '</th>';
  hHtml += '<th>Rata-Rata</th><th>Status KKM</th></tr>';
  thead.innerHTML = hHtml;

  var bHtml = '';
  for (var r = 0; r < rows.length; r++) {
    var item = rows[r];
    bHtml += '<tr>' +
      '<td>' + (r + 1) + '</td>' +
      '<td>' + item.NIS + '</td>' +
      '<td><strong>' + item.Nama + '</strong></td>';

    for (var k = 0; k < jList.length; k++) {
      var sc = item.Scores[jList[k].ID];
      bHtml += '<td>' + (sc !== undefined ? sc : '-') + '</td>';
    }

    bHtml += '<td><strong>' + item.RataRata + '</strong></td>' +
      '<td><span class="badge-status ' + (item.StatusKKM === 'Tuntas' ? 'badge-hadir' : 'badge-alpa') + '">' + item.StatusKKM + '</span></td>' +
    '</tr>';
  }
  tbody.innerHTML = bHtml;
}

function exportCurrentGradeRecapCsv() {
  var pId = document.getElementById('grade-filter-penugasan').value;
  var prd = document.getElementById('grade-filter-periode').value;
  if (!pId) return;

  callApi('apiExportGradesCsv', AppState.token, pId, prd)
    .then(function(res) {
      if (res && res.success) {
        downloadCsvFile(res.fileName, res.csvString);
        showToast('Berkas CSV nilai berhasil diunduh.', 'success');
      } else {
        showToast(res.message, 'error');
      }
    });
}

// ============================================================================
// LAPORAN & CETAK CONTROLLER
// ============================================================================
function initReportsView() {
  loadReportDropdowns();
  var today = new Date();
  var y = today.getFullYear();
  var m = String(today.getMonth() + 1).padStart(2, '0');
  var d = String(today.getDate()).padStart(2, '0');
  document.getElementById('rep-att-end').value = y + '-' + m + '-' + d;
  document.getElementById('rep-att-start').value = y + '-' + m + '-01';
  document.getElementById('rep-sign-date').innerText = d + ' ' + getIndoMonth(today.getMonth()) + ' ' + y;
  generateReport();
}

function loadReportDropdowns() {
  if (!AppState.token) return;
  callApi('apiGetClasses', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var sel = document.getElementById('rep-att-kelas');
      var opts = '<option value="">Semua Kelas</option>';
      for (var i = 0; i < res.data.length; i++) {
        opts += '<option value="' + res.data[i].ID + '">' + res.data[i].NamaKelas + '</option>';
      }
      sel.innerHTML = opts;
    });
}

function switchReportType(type) {
  AppState.reportType = type;
  var bAtt = document.getElementById('btn-rep-type-att');
  var bGrd = document.getElementById('btn-rep-type-grade');
  var fAtt = document.getElementById('rep-filter-att');
  var fGrd = document.getElementById('rep-filter-grade');

  if (type === 'attendance') {
    bAtt.classList.add('active');
    bGrd.classList.remove('active');
    fAtt.style.display = 'grid';
    fGrd.style.display = 'none';
    document.getElementById('rep-doc-title').innerText = 'REKAPITULASI PRESENSI KEHADIRAN SISWA';
  } else {
    bGrd.classList.add('active');
    bAtt.classList.remove('active');
    fGrd.style.display = 'grid';
    fAtt.style.display = 'none';
    document.getElementById('rep-doc-title').innerText = 'LEMBAR REKAPITULASI NILAI CAPAIAN SISWA';
  }
  generateReport();
}

function generateReport() {
  if (!AppState.token) return;

  if (AppState.reportType === 'attendance') {
    var kId = document.getElementById('rep-att-kelas').value;
    var sDate = document.getElementById('rep-att-start').value;
    var eDate = document.getElementById('rep-att-end').value;

    callApi('apiGetAttendanceReport', AppState.token, { kelasId: kId, startDate: sDate, endDate: eDate })
      .then(function(res) {
        if (!res.success) return;
        var d = res.data;
        document.getElementById('rep-print-school-sub').innerText = d.infoSekolah.nama;
        document.getElementById('rep-sign-kepsek-name').innerText = d.infoSekolah.kepalaSekolah;
        document.getElementById('rep-sign-kepsek-nip').innerText = 'NIP. ' + d.infoSekolah.nipKepalaSekolah;
        document.getElementById('rep-sign-guru-name').innerText = AppState.user.Nama;

        var thead = document.getElementById('report-thead');
        thead.innerHTML = '<tr><th style="width: 40px;">No</th><th>NIS</th><th>Nama Siswa</th><th>Kelas</th><th>Hadir</th><th>Terlambat</th><th>Izin</th><th>Sakit</th><th>Alpa</th><th>% Hadir</th></tr>';

        var tbody = document.getElementById('report-tbody');
        if (d.rows.length === 0) {
          tbody.innerHTML = '<tr><td colspan="10" class="empty-state">Tidak ada data kehadiran yang sesuai filter.</td></tr>';
        } else {
          var bHtml = '';
          for (var i = 0; i < d.rows.length; i++) {
            var r = d.rows[i];
            bHtml += '<tr>' +
              '<td>' + (i + 1) + '</td>' +
              '<td>' + r.NIS + '</td>' +
              '<td><strong>' + r.Nama + '</strong></td>' +
              '<td>' + r.Kelas + '</td>' +
              '<td>' + r.Hadir + '</td>' +
              '<td>' + r.Terlambat + '</td>' +
              '<td>' + r.Izin + '</td>' +
              '<td>' + r.Sakit + '</td>' +
              '<td>' + r.Alpa + '</td>' +
              '<td><strong>' + r.PersentaseKehadiran + '</strong></td>' +
            '</tr>';
          }
          tbody.innerHTML = bHtml;
        }
      });
  } else {
    var pId = document.getElementById('rep-grade-penugasan').value;
    var prd = document.getElementById('rep-grade-periode').value;
    if (!pId) return;

    callApi('apiGetGradeRecap', AppState.token, pId, prd)
      .then(function(res) {
        if (!res.success) return;
        var d = res.data;
        var jList = d.jenisPenilaian;
        var rows = d.rows;

        var thead = document.getElementById('report-thead');
        var hHtml = '<tr><th style="width: 40px;">No</th><th>NIS</th><th>Nama Siswa</th>';
        for (var j = 0; j < jList.length; j++) hHtml += '<th>' + jList[j].NamaPenilaian + '</th>';
        hHtml += '<th>Rata-Rata</th><th>Status KKM</th></tr>';
        thead.innerHTML = hHtml;

        var tbody = document.getElementById('report-tbody');
        var bHtml = '';
        for (var r = 0; r < rows.length; r++) {
          var it = rows[r];
          bHtml += '<tr><td>' + (r + 1) + '</td><td>' + it.NIS + '</td><td><strong>' + it.Nama + '</strong></td>';
          for (var k = 0; k < jList.length; k++) {
            bHtml += '<td>' + (it.Scores[jList[k].ID] || '-') + '</td>';
          }
          bHtml += '<td><strong>' + it.RataRata + '</strong></td><td>' + it.StatusKKM + '</td></tr>';
        }
        tbody.innerHTML = bHtml;
      });
  }
}

function exportReportCsv() {
  if (AppState.reportType === 'attendance') {
    var kId = document.getElementById('rep-att-kelas').value;
    var sDate = document.getElementById('rep-att-start').value;
    var eDate = document.getElementById('rep-att-end').value;

    callApi('apiExportAttendanceCsv', AppState.token, { kelasId: kId, startDate: sDate, endDate: eDate })
      .then(function(res) {
        if (res && res.success) downloadCsvFile(res.fileName, res.csvString);
      });
  } else {
    exportCurrentGradeRecapCsv();
  }
}

function printOfficialReport() {
  window.print();
}

// ============================================================================
// ADMIN MASTER DATA CONTROLLER
// ============================================================================
function initAdminView() {
  if (AppState.user.Role !== 'ADMIN') {
    showToast('Akses ditolak: Menu ini khusus Administrator.', 'error');
    navigateTo('dashboard');
    return;
  }
  switchAdminSubTab('users');
}

function switchAdminSubTab(tab) {
  AppState.adminSubTab = tab;
  document.querySelectorAll('#view-admin .tab-pills .tab-pill').forEach(function(b) { b.classList.remove('active'); });
  var activeBtn = document.getElementById('tab-adm-' + tab);
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('.admin-subtab').forEach(function(s) { s.style.display = 'none'; });
  var target = document.getElementById('subtab-' + tab);
  if (target) target.style.display = 'block';

  if (tab === 'users') loadAdminUsers();
  else if (tab === 'students') loadAdminStudents();
  else if (tab === 'classes') loadAdminClasses();
  else if (tab === 'subjects') loadAdminSubjects();
  else if (tab === 'assignments') loadAdminAssignments();
  else if (tab === 'years') loadAdminYears();
  else if (tab === 'assessments') loadAdminAssessments();
  else if (tab === 'logs') loadAuditLogs();
}

function loadAdminUsers() {
  callApi('apiGetUsers', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var tbody = document.getElementById('admin-users-tbody');
      var html = '';
      for (var i = 0; i < res.data.length; i++) {
        var u = res.data[i];
        html += '<tr>' +
          '<td><strong>' + u.Username + '</strong></td>' +
          '<td>' + u.Nama + '</td>' +
          '<td><span class="badge-status ' + (u.Role === 'ADMIN' ? 'badge-izin' : 'badge-hadir') + '">' + u.Role + '</span></td>' +
          '<td>' + (u.NIP || u.Telepon || '-') + '</td>' +
          '<td><span class="badge-status ' + (u.Aktif ? 'badge-active' : 'badge-inactive') + '">' + (u.Aktif ? 'Aktif' : 'Nonaktif') + '</span></td>' +
          '<td>' + (u.TerakhirLogin || '-') + '</td>' +
          '<td style="text-align: right;">' +
            '<button class="btn btn-secondary btn-sm" onclick="editUserItem(' + JSON.stringify(u).replace(/"/g, '&quot;') + ')" style="margin-right: 4px;">✏️ Edit</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="toggleUserStatus(\'' + u.ID + '\')" style="margin-right: 4px;">' + (u.Aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button>' +
            '<button class="btn btn-secondary btn-sm" onclick="resetUserPasswordPrompt(\'' + u.ID + '\')">🔑 Reset</button>' +
          '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
}

function openUserModal(editData) {
  if (editData) {
    document.getElementById('modal-user-title').innerText = 'Edit Pengguna';
    document.getElementById('usr-form-id').value = editData.ID;
    document.getElementById('usr-form-username').value = editData.Username;
    document.getElementById('usr-form-nama').value = editData.Nama;
    document.getElementById('usr-form-role').value = editData.Role;
    document.getElementById('usr-form-nip').value = editData.NIP || '';
    document.getElementById('usr-form-telp').value = editData.Telepon || '';
    document.getElementById('usr-form-pass').value = '';
    document.getElementById('usr-form-pass').required = false;
  } else {
    document.getElementById('modal-user-title').innerText = 'Tambah Akun Pengguna';
    document.getElementById('usr-form-id').value = '';
    document.getElementById('usr-form-username').value = '';
    document.getElementById('usr-form-nama').value = '';
    document.getElementById('usr-form-nip').value = '';
    document.getElementById('usr-form-telp').value = '';
    document.getElementById('usr-form-pass').value = '';
    document.getElementById('usr-form-pass').required = true;
  }
  openModal('modal-user');
}

function handleUserFormSubmit(e) {
  e.preventDefault();
  var payload = {
    ID: document.getElementById('usr-form-id').value || null,
    Username: document.getElementById('usr-form-username').value,
    Nama: document.getElementById('usr-form-nama').value,
    Role: document.getElementById('usr-form-role').value,
    Password: document.getElementById('usr-form-pass').value,
    NIP: document.getElementById('usr-form-nip').value,
    Telepon: document.getElementById('usr-form-telp').value
  };

  callApi('apiSaveUser', AppState.token, payload)
    .then(function(res) {
      if (res && res.success) {
        closeModal('modal-user');
        showToast(res.message, 'success');
        loadAdminUsers();
      } else {
        showToast(res.message, 'error');
      }
    });
}

function toggleUserStatus(id) {
  callApi('apiToggleUserActive', AppState.token, id)
    .then(function(res) {
      if (res && res.success) {
        showToast(res.message, 'success');
        loadAdminUsers();
      } else {
        showToast(res.message, 'error');
      }
    });
}

function resetUserPasswordPrompt(id) {
  var newPass = prompt('Masukkan password baru (minimal 6 karakter):');
  if (!newPass) return;
  if (newPass.length < 6) {
    alert('Password minimal 6 karakter.');
    return;
  }
  callApi('apiResetUserPassword', AppState.token, id, newPass)
    .then(function(res) {
      if (res && res.success) showToast(res.message, 'success');
      else showToast(res.message, 'error');
    });
}

function loadAdminStudents() {
  callApi('apiGetStudents', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      AppState.studentsCache = res.data;
      filterAdminStudents();
    });
}

function filterAdminStudents() {
  var q = document.getElementById('admin-student-search').value.toLowerCase();
  var kFilter = document.getElementById('admin-student-class-filter').value;
  var list = AppState.studentsCache || [];
  var tbody = document.getElementById('admin-students-tbody');

  var filtered = list.filter(function(s) {
    var matchQ = (s.Nama + ' ' + s.NIS + ' ' + (s.NISNopsional || '')).toLowerCase().indexOf(q) !== -1;
    var matchK = !kFilter || String(s.KelasID) === String(kFilter);
    return matchQ && matchK;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Tidak ada siswa yang sesuai.</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var sw = filtered[i];
    html += '<tr>' +
      '<td>' + sw.NIS + '</td>' +
      '<td>' + (sw.NISNopsional || '-') + '</td>' +
      '<td><strong>' + sw.Nama + '</strong></td>' +
      '<td>' + (sw.JenisKelaminOpsional || 'L') + '</td>' +
      '<td>' + sw.NamaKelas + '</td>' +
      '<td><span class="badge-status ' + (sw.Aktif ? 'badge-active' : 'badge-inactive') + '">' + (sw.Aktif ? 'Aktif' : 'Nonaktif') + '</span></td>' +
      '<td style="text-align: right;">' +
        '<button class="btn btn-secondary btn-sm" onclick="editStudentItem(' + JSON.stringify(sw).replace(/"/g, '&quot;') + ')" style="margin-right: 4px;">✏️</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="toggleStudentStatus(\'' + sw.ID + '\')">' + (sw.Aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button>' +
      '</td>' +
    '</tr>';
  }
  tbody.innerHTML = html;
}

function openStudentModal(editData) {
  var kSel = document.getElementById('stu-form-kelas');
  kSel.innerHTML = '';
  for (var i = 0; i < AppState.classesCache.length; i++) {
    kSel.innerHTML += '<option value="' + AppState.classesCache[i].ID + '">' + AppState.classesCache[i].NamaKelas + '</option>';
  }

  if (editData) {
    document.getElementById('modal-student-title').innerText = 'Edit Data Siswa';
    document.getElementById('stu-form-id').value = editData.ID;
    document.getElementById('stu-form-nis').value = editData.NIS;
    document.getElementById('stu-form-nisn').value = editData.NISNopsional || '';
    document.getElementById('stu-form-nama').value = editData.Nama;
    document.getElementById('stu-form-jk').value = editData.JenisKelaminOpsional || 'L';
    document.getElementById('stu-form-kelas').value = editData.KelasID;
  } else {
    document.getElementById('modal-student-title').innerText = 'Tambah Siswa Baru';
    document.getElementById('stu-form-id').value = '';
    document.getElementById('stu-form-nis').value = '';
    document.getElementById('stu-form-nisn').value = '';
    document.getElementById('stu-form-nama').value = '';
  }
  openModal('modal-student');
}

function handleStudentFormSubmit(e) {
  e.preventDefault();
  var payload = {
    ID: document.getElementById('stu-form-id').value || null,
    NIS: document.getElementById('stu-form-nis').value,
    NISNopsional: document.getElementById('stu-form-nisn').value,
    Nama: document.getElementById('stu-form-nama').value,
    JenisKelaminOpsional: document.getElementById('stu-form-jk').value,
    KelasID: document.getElementById('stu-form-kelas').value
  };

  callApi('apiSaveStudent', AppState.token, payload)
    .then(function(res) {
      if (res && res.success) {
        closeModal('modal-student');
        showToast(res.message, 'success');
        loadAdminStudents();
      } else {
        showToast(res.message, 'error');
      }
    });
}

function toggleStudentStatus(id) {
  callApi('apiToggleStudentActive', AppState.token, id)
    .then(function(res) {
      if (res && res.success) {
        showToast(res.message, 'success');
        loadAdminStudents();
      }
    });
}

function openImportModal() {
  document.getElementById('csv-file-input').value = '';
  document.getElementById('csv-text-preview').value = '';
  document.getElementById('import-result-box').style.display = 'none';
  openModal('modal-import');
}

function handleCsvFileSelected(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(evt) {
    document.getElementById('csv-text-preview').value = evt.target.result;
  };
  reader.readAsText(file);
}

function submitCsvImport() {
  var text = document.getElementById('csv-text-preview').value.trim();
  if (!text) {
    showToast('Konten CSV masih kosong.', 'warning');
    return;
  }
  var btn = document.getElementById('btn-submit-import');
  var resBox = document.getElementById('import-result-box');
  btn.disabled = true;

  callApi('apiImportStudentsCsv', AppState.token, text)
    .then(function(res) {
      btn.disabled = false;
      if (res && res.success) {
        resBox.style.display = 'block';
        resBox.style.background = '#ECFDF5';
        resBox.style.color = '#065F46';
        resBox.innerHTML = '<strong>' + res.message + '</strong>';
        showToast(res.message, 'success');
        loadAdminStudents();
      } else {
        resBox.style.display = 'block';
        resBox.style.background = '#FEF2F2';
        resBox.style.color = '#DC2626';
        resBox.innerHTML = '<strong>Gagal:</strong> ' + res.message;
      }
    })
    .catch(function(err) {
      btn.disabled = false;
      resBox.style.display = 'block';
      resBox.style.background = '#FEF2F2';
      resBox.style.color = '#DC2626';
      resBox.innerHTML = err.message;
    });
}

function loadAdminClasses() {
  callApi('apiGetClasses', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var tbody = document.getElementById('admin-classes-tbody');
      var html = '';
      for (var i = 0; i < res.data.length; i++) {
        var c = res.data[i];
        html += '<tr>' +
          '<td><strong>' + c.NamaKelas + '</strong></td>' +
          '<td>Tingkat ' + c.Tingkat + '</td>' +
          '<td>' + c.WaliGuruNama + '</td>' +
          '<td>' + c.TahunPelajaranNama + '</td>' +
          '<td style="text-align: right;">' +
            '<button class="btn btn-secondary btn-sm" onclick="editClassItem(' + JSON.stringify(c).replace(/"/g, '&quot;') + ')">✏️</button>' +
          '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
}

function openClassModal(editData) {
  var wSel = document.getElementById('cls-form-wali');
  wSel.innerHTML = '<option value="">-- Tanpa Wali Kelas --</option>';
  for (var i = 0; i < AppState.teachersCache.length; i++) {
    wSel.innerHTML += '<option value="' + AppState.teachersCache[i].ID + '">' + AppState.teachersCache[i].Nama + '</option>';
  }

  if (editData) {
    document.getElementById('modal-class-title').innerText = 'Edit Kelas';
    document.getElementById('cls-form-id').value = editData.ID;
    document.getElementById('cls-form-nama').value = editData.NamaKelas;
    document.getElementById('cls-form-tingkat').value = editData.Tingkat;
    document.getElementById('cls-form-wali').value = editData.WaliGuruIDOpsional || '';
  } else {
    document.getElementById('modal-class-title').innerText = 'Tambah Kelas Baru';
    document.getElementById('cls-form-id').value = '';
    document.getElementById('cls-form-nama').value = '';
  }
  openModal('modal-class');
}

function handleClassFormSubmit(e) {
  e.preventDefault();
  var payload = {
    ID: document.getElementById('cls-form-id').value || null,
    NamaKelas: document.getElementById('cls-form-nama').value,
    Tingkat: document.getElementById('cls-form-tingkat').value,
    WaliGuruIDOpsional: document.getElementById('cls-form-wali').value
  };

  callApi('apiSaveClass', AppState.token, payload)
    .then(function(res) {
      if (res && res.success) {
        closeModal('modal-class');
        showToast(res.message, 'success');
        loadAdminClasses();
        loadCommonDropdowns();
      } else {
        showToast(res.message, 'error');
      }
    });
}

function loadAdminSubjects() {
  callApi('apiGetSubjects', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var tbody = document.getElementById('admin-subjects-tbody');
      var html = '';
      for (var i = 0; i < res.data.length; i++) {
        var sub = res.data[i];
        html += '<tr>' +
          '<td><code>' + sub.KodeMapel + '</code></td>' +
          '<td><strong>' + sub.NamaMapel + '</strong></td>' +
          '<td>' + (sub.TingkatOpsional ? 'Tingkat ' + sub.TingkatOpsional : 'Semua Tingkat') + '</td>' +
          '<td style="text-align: right;">' +
            '<button class="btn btn-secondary btn-sm" onclick="editSubjectItem(' + JSON.stringify(sub).replace(/"/g, '&quot;') + ')">✏️</button>' +
          '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
}

function openSubjectModal(editData) {
  if (editData) {
    document.getElementById('modal-subject-title').innerText = 'Edit Mata Pelajaran';
    document.getElementById('sub-form-id').value = editData.ID;
    document.getElementById('sub-form-kode').value = editData.KodeMapel;
    document.getElementById('sub-form-nama').value = editData.NamaMapel;
  } else {
    document.getElementById('modal-subject-title').innerText = 'Tambah Mata Pelajaran';
    document.getElementById('sub-form-id').value = '';
    document.getElementById('sub-form-kode').value = '';
    document.getElementById('sub-form-nama').value = '';
  }
  openModal('modal-subject');
}

function handleSubjectFormSubmit(e) {
  e.preventDefault();
  var payload = {
    ID: document.getElementById('sub-form-id').value || null,
    KodeMapel: document.getElementById('sub-form-kode').value,
    NamaMapel: document.getElementById('sub-form-nama').value
  };

  callApi('apiSaveSubject', AppState.token, payload)
    .then(function(res) {
      if (res && res.success) {
        closeModal('modal-subject');
        showToast(res.message, 'success');
        loadAdminSubjects();
        loadCommonDropdowns();
      } else {
        showToast(res.message, 'error');
      }
    });
}

function loadAdminAssignments() {
  callApi('apiGetTeacherAssignments', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var tbody = document.getElementById('admin-assignments-tbody');
      var html = '';
      for (var i = 0; i < res.data.length; i++) {
        var a = res.data[i];
        html += '<tr>' +
          '<td><strong>' + a.GuruNama + '</strong></td>' +
          '<td>' + a.KelasNama + '</td>' +
          '<td>' + a.MapelNama + '</td>' +
          '<td style="text-align: right;">' +
            '<button class="btn btn-danger btn-sm" onclick="deleteAssignmentItem(\'' + a.ID + '\')">🗑️ Hapus</button>' +
          '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
}

function openAssignmentModal() {
  var gSel = document.getElementById('asg-form-guru');
  var kSel = document.getElementById('asg-form-kelas');
  var mSel = document.getElementById('asg-form-mapel');

  gSel.innerHTML = '';
  for (var g = 0; g < AppState.teachersCache.length; g++) {
    gSel.innerHTML += '<option value="' + AppState.teachersCache[g].ID + '">' + AppState.teachersCache[g].Nama + '</option>';
  }
  kSel.innerHTML = '';
  for (var k = 0; k < AppState.classesCache.length; k++) {
    kSel.innerHTML += '<option value="' + AppState.classesCache[k].ID + '">' + AppState.classesCache[k].NamaKelas + '</option>';
  }
  mSel.innerHTML = '';
  for (var m = 0; m < AppState.subjectsCache.length; m++) {
    mSel.innerHTML += '<option value="' + AppState.subjectsCache[m].ID + '">' + AppState.subjectsCache[m].NamaMapel + '</option>';
  }

  openModal('modal-assignment');
}

function handleAssignmentFormSubmit(e) {
  e.preventDefault();
  var payload = {
    GuruID: document.getElementById('asg-form-guru').value,
    KelasID: document.getElementById('asg-form-kelas').value,
    MapelID: document.getElementById('asg-form-mapel').value
  };

  callApi('apiSaveTeacherAssignment', AppState.token, payload)
    .then(function(res) {
      if (res && res.success) {
        closeModal('modal-assignment');
        showToast(res.message, 'success');
        loadAdminAssignments();
      } else {
        showToast(res.message, 'error');
      }
    });
}

function deleteAssignmentItem(id) {
  if (!confirm('Apakah Anda yakin ingin menonaktifkan penugasan ini?')) return;
  callApi('apiDeleteTeacherAssignment', AppState.token, id)
    .then(function(res) {
      if (res && res.success) {
        showToast(res.message, 'success');
        loadAdminAssignments();
      }
    });
}

function loadAdminYears() {
  callApi('apiGetAcademicYears', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var tbody = document.getElementById('admin-years-tbody');
      var html = '';
      for (var i = 0; i < res.data.length; i++) {
        var y = res.data[i];
        html += '<tr>' +
          '<td><strong>' + y.NamaTahun + '</strong></td>' +
          '<td><span class="badge-status badge-izin">Semester ' + y.SemesterAktif + '</span></td>' +
          '<td>' + (y.Mulai || '-') + '</td>' +
          '<td>' + (y.Selesai || '-') + '</td>' +
          '<td style="text-align: right;">' +
            '<button class="btn btn-secondary btn-sm" onclick="setActiveYearPrompt(\'' + y.ID + '\', \'' + y.NamaTahun + '\')">⚡ Jadikan Aktif</button>' +
          '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
}

function setActiveYearPrompt(id, name) {
  var sem = prompt('Pilih semester aktif untuk ' + name + ' (Ketik Ganjil atau Genap):', 'Ganjil');
  if (!sem) return;
  callApi('apiSetActiveAcademicYear', AppState.token, id, sem)
    .then(function(res) {
      if (res && res.success) {
        showToast(res.message, 'success');
        loadAdminYears();
      }
    });
}

function loadAdminAssessments() {
  callApi('apiGetAssessmentTypes', AppState.token)
    .then(function(res) {
      if (!res.success) return;
      var tbody = document.getElementById('admin-assessments-tbody');
      var html = '';
      for (var i = 0; i < res.data.length; i++) {
        var a = res.data[i];
        html += '<tr>' +
          '<td><strong>' + a.NamaPenilaian + '</strong></td>' +
          '<td>' + a.Kategori + '</td>' +
          '<td>' + (a.BobotOpsional || '0') + '%</td>' +
          '<td style="text-align: right;"><span class="badge-status badge-active">Aktif</span></td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
}

function loadAuditLogs() {
  callApi('apiGetAuditLogs', AppState.token, { limit: 50 })
    .then(function(res) {
      if (!res.success) return;
      var tbody = document.getElementById('admin-logs-tbody');
      var html = '';
      for (var i = 0; i < res.data.length; i++) {
        var l = res.data[i];
        html += '<tr>' +
          '<td><small>' + l.Timestamp + '</small></td>' +
          '<td>' + (l.UserDisplay || l.UserID) + '</td>' +
          '<td><span class="badge-status badge-izin">' + l.Aksi + '</span></td>' +
          '<td><code>' + l.Entitas + '</code></td>' +
          '<td>' + l.Ringkasan + '</td>' +
        '</tr>';
      }
      tbody.innerHTML = html;
    });
}

// ============================================================================
// PENGATURAN & KEAMANAN CONTROLLER
// ============================================================================
function initSettingsView() {
  updateDatabaseUiElements();
  if (AppState.user.Role === 'ADMIN') {
    callApi('apiGetSchoolSettings', AppState.token)
      .then(function(res) {
        if (!res.success) return;
        var s = res.data;
        document.getElementById('set-nama-sekolah').value = s.NAMA_SEKOLAH || '';
        document.getElementById('set-npsn').value = s.NPSN || '';
        document.getElementById('set-kkm').value = s.KKM_DEFAULT || '75';
        document.getElementById('set-alamat').value = s.ALAMAT_SEKOLAH || '';
        document.getElementById('set-kepsek').value = s.KEPALA_SEKOLAH || '';
        document.getElementById('set-nip-kepsek').value = s.NIP_KEPALA_SEKOLAH || '';

        // Tampilkan link Spreadsheet Google Sheets jika tersedia
        if (s._SPREADSHEET_URL) {
          var btnSheet = document.getElementById('btn-open-spreadsheet');
          var nameSheet = document.getElementById('set-spreadsheet-name');
          if (btnSheet) btnSheet.href = s._SPREADSHEET_URL;
          if (nameSheet) nameSheet.innerText = s._SPREADSHEET_NAME || 'Buka Database Google Sheets';
        }
      });
  }
}

function handleSchoolSettingsSubmit(e) {
  e.preventDefault();
  var settingsMap = {
    NAMA_SEKOLAH: document.getElementById('set-nama-sekolah').value,
    NPSN: document.getElementById('set-npsn').value,
    KKM_DEFAULT: document.getElementById('set-kkm').value,
    ALAMAT_SEKOLAH: document.getElementById('set-alamat').value,
    KEPALA_SEKOLAH: document.getElementById('set-kepsek').value,
    NIP_KEPALA_SEKOLAH: document.getElementById('set-nip-kepsek').value
  };

  callApi('apiSaveSchoolSettings', AppState.token, settingsMap)
    .then(function(res) {
      if (res && res.success) {
        showToast(res.message, 'success');
        document.getElementById('header-school-name').innerText = settingsMap.NAMA_SEKOLAH;
      } else {
        showToast(res.message, 'error');
      }
    });
}

function handleChangePasswordSubmit(e) {
  e.preventDefault();
  var oldP = document.getElementById('chg-pass-old').value;
  var newP = document.getElementById('chg-pass-new').value;
  var conP = document.getElementById('chg-pass-confirm').value;

  if (newP !== conP) {
    showToast('Konfirmasi password baru tidak cocok!', 'error');
    return;
  }

  callApi('apiChangePassword', AppState.token, oldP, newP)
    .then(function(res) {
      if (res && res.success) {
        showToast(res.message, 'success');
        document.getElementById('form-change-password').reset();
      } else {
        showToast(res.message, 'error');
      }
    });
}

function toggleThemeMode() {
  var cur = document.documentElement.getAttribute('data-theme');
  var next = (cur === 'dark') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('sd_theme', next);
  showToast('Tema diubah ke mode ' + (next === 'dark' ? 'gelap' : 'terang') + '.', 'info');
}

function initTheme() {
  var savedTheme = localStorage.getItem('sd_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function openDriveFolderLink() {
  showToast('Berkas otomatis tersimpan di Google Drive sekolah Anda.', 'info');
}

// ============================================================================
// HELPER FUNGSIONAL UMUM (TOAST, MODAL, CSV DOWNLOAD, DROPDOWNS)
// ============================================================================
function showToast(msg, type) {
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'info');
  var icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  else if (type === 'error') icon = '❌';
  else if (type === 'warning') icon = '⚠️';

  toast.innerHTML = '<span>' + icon + '</span><span>' + msg + '</span>';
  container.appendChild(toast);

  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(function() { toast.remove(); }, 300);
  }, 4000);
}

function openModal(id) {
  var m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  var m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

function downloadCsvFile(filename, csvContent) {
  var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  var url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getIndoMonth(mIdx) {
  var months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return months[mIdx] || '';
}

function loadCommonDropdowns() {
  if (!AppState.token) return;

  callApi('apiGetClasses', AppState.token)
    .then(function(res) {
      if (res.success) {
        AppState.classesCache = res.data;
        var fSched = document.getElementById('filter-schedule-class');
        var fStu = document.getElementById('admin-student-class-filter');
        if (fSched) {
          fSched.innerHTML = '<option value="">Semua Kelas</option>';
          for (var i = 0; i < res.data.length; i++) {
            fSched.innerHTML += '<option value="' + res.data[i].ID + '">' + res.data[i].NamaKelas + '</option>';
          }
        }
        if (fStu) {
          fStu.innerHTML = '<option value="">Semua Kelas</option>';
          for (var k = 0; k < res.data.length; k++) {
            fStu.innerHTML += '<option value="' + res.data[k].ID + '">' + res.data[k].NamaKelas + '</option>';
          }
        }
      }
    });

  callApi('apiGetTeacherAssignments', AppState.token)
    .then(function(res) {
      if (res.success) {
        AppState.penugasanCache = res.data;
        var sPen = document.getElementById('sched-form-penugasan');
        if (sPen) {
          sPen.innerHTML = '<option value="">-- Pilih Penugasan Guru --</option>';
          for (var i = 0; i < res.data.length; i++) {
            var p = res.data[i];
            sPen.innerHTML += '<option value="' + p.ID + '">' + p.GuruNama + ' &bull; ' + p.KelasNama + ' - ' + p.MapelNama + '</option>';
          }
        }
      }
    });

  callApi('apiGetUsers', AppState.token)
    .then(function(res) {
      if (res.success) {
        AppState.teachersCache = res.data.filter(function(u) { return u.Role === 'GURU'; });
      }
    });

  callApi('apiGetSubjects', AppState.token)
    .then(function(res) {
      if (res.success) AppState.subjectsCache = res.data;
    });
}

// ============================================================================
// DATABASE URL & KONEKSI GOOGLE APPS SCRIPT (BERJALAN DI BELAKANG LAYAR)
// ============================================================================
function updateDatabaseUiElements() {
  var url = APP_CONFIG.SCRIPT_URL || localStorage.getItem('sd_gas_api_url') || 'Belum diatur';
  
  // Tampilkan di sidebar
  var sbEl = document.getElementById('sidebar-gas-url-preview');
  if (sbEl) {
    sbEl.innerText = url;
    sbEl.title = url;
  }

  // Tampilkan di pengaturan
  var setEl = document.getElementById('set-gas-url-text');
  if (setEl) {
    setEl.innerText = url;
    setEl.title = url;
  }
}

function testGasDatabaseConnection() {
  var startTime = Date.now();
  showToast('Mengirim sinyal uji ke Google Apps Script backend...', 'info');

  callApi('apiCheckSession', AppState.token)
    .then(function(res) {
      var latency = Date.now() - startTime;
      if (res && res.success) {
        showToast('🟢 Terhubung ke Google Apps Script! Latensi respon: ' + latency + ' ms.', 'success');
      } else {
        showToast('🟢 Backend Google Apps Script aktif (Respon: ' + latency + ' ms).', 'success');
      }
    })
    .catch(function(err) {
      showToast('❌ Gagal menghubungi Google Apps Script: ' + err.message, 'error');
    });
}

function copyGasUrl() {
  var url = APP_CONFIG.SCRIPT_URL || localStorage.getItem('sd_gas_api_url') || '';
  if (!url) {
    showToast('URL Google Apps Script belum diisi.', 'warning');
    return;
  }
  navigator.clipboard.writeText(url).then(function() {
    showToast('URL Google Apps Script berhasil disalin ke clipboard!', 'success');
  }).catch(function() {
    prompt('Salin URL Google Apps Script:', url);
  });
}
