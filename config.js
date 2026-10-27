/**
 * ============================================================================
 * KONFIGURASI FRONTEND GITHUB PAGES - APLIKASI ADMINISTRASI GURU SD
 * File: config.js
 * ============================================================================
 * Tempelkan Web App URL Google Apps Script Anda pada variabel SCRIPT_URL di bawah.
 * Format: https://script.google.com/macros/s/AKfycb.../exec
 */

var APP_CONFIG = {
  // Web App URL dari Deployment Google Apps Script Anda:
  SCRIPT_URL: '', 
  
  APP_NAME: 'Administrasi Guru SD',
  VERSION: '1.0.0',
  DEFAULT_KKM: 75
};

// Ambil SCRIPT_URL dari localStorage jika pengguna mengaturnya via UI
var storedScriptUrl = localStorage.getItem('sd_gas_api_url');
if (storedScriptUrl && storedScriptUrl.trim() !== '') {
  APP_CONFIG.SCRIPT_URL = storedScriptUrl.trim();
}
