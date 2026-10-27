# 🚀 Panduan Hosting Frontend di GitHub Pages

Folder `frontend/` ini berisi seluruh aset frontend statis (HTML, CSS, JavaScript) mandiri yang siap di-hosting langsung di **GitHub Pages** (gratis, cepat, dan online 24/7) serta terhubung dengan backend **Google Apps Script** Anda.

---

## 📋 Langkah Cepat Menerbitkan Frontend ke GitHub

### Langkah 1: Buat Repositori Baru di GitHub
1. Masuk ke akun [GitHub](https://github.com) Anda.
2. Klik tombol **New** (Buat Repositori Baru).
3. Beri nama repositori, contoh: `administrasi-guru-sd`.
4. Pilih **Public** (agar GitHub Pages gratis dapat diaktifkan).
5. Klik **Create repository**.

---

### Langkah 2: Unggah Berkas Frontend ke Repositori
Anda dapat mengunggah seluruh isi folder `frontend/` ini (`index.html`, `styles.css`, `app.js`, `config.js`):

**Opsi A: Melalui Web GitHub (Paling Mudah Tanpa Git CLI):**
1. Pada halaman repositori baru Anda di GitHub, klik tautan **uploading an existing file**.
2. Seret (drag & drop) seluruh berkas berikut ke browser:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `config.js`
3. Klik tombol hijau **Commit changes**.

**Opsi B: Melalui Git Terminal / Command Prompt:**
```bash
cd C:\Users\freza\Video\new\frontend
git init
git add .
git commit -m "Initial commit frontend Administrasi Guru SD"
git branch -M main
git remote add origin https://github.com/USERNAME-ANDA/administrasi-guru-sd.git
git push -u origin main
```

---

### Langkah 3: Aktifkan GitHub Pages (1-Klik)
1. Di halaman repositori GitHub Anda, klik menu tab **Settings** (ikon roda gigi di bagian atas).
2. Di sidebar sebelah kiri, klik menu **Pages**.
3. Pada bagian **Build and deployment** &rarr; **Branch**:
   - Ubah dari `None` menjadi `main`.
   - Pastikan foldernya `/ (root)`.
   - Klik tombol **Save**.
4. Tunggu sekitar 1–2 menit, segarkan halaman. Di bagian atas akan muncul kotak hijau bertuliskan:  
   `Your site is live at https://USERNAME-ANDA.github.io/administrasi-guru-sd/`

---

### Langkah 4: Hubungkan Frontend GitHub ke Google Apps Script

Ada dua cara mudah untuk menghubungkannya:

#### Cara A: Langsung Lewat Antarmuka Web (Tanpa Edit Kode)
1. Buka URL GitHub Pages Anda di peramban (`https://USERNAME-ANDA.github.io/administrasi-guru-sd/`).
2. Aplikasi akan otomatis memunculkan dialog:  
   **🔗 Sambungkan ke Google Apps Script**.
3. Tempelkan URL Web App Google Apps Script Anda  
   *(Contoh: `https://script.google.com/macros/s/AKfycb.../exec`)*.
4. Klik **Simpan & Hubungkan**. Pengaturan ini otomatis tersimpan di browser Anda!

#### Cara B: Permanen di File `config.js`
Buka file `config.js` di repositori GitHub Anda, lalu edit baris `SCRIPT_URL`:
```javascript
var APP_CONFIG = {
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
  APP_NAME: 'Administrasi Guru SD',
  VERSION: '1.0.0',
  DEFAULT_KKM: 75
};
```
Klik **Commit changes**. Sekarang seluruh guru yang membuka tautan GitHub Pages Anda akan langsung terhubung tanpa perlu mengisi URL lagi!

---

## ⚡ Catatan Penting Mengenai Backend Google Apps Script

Pastikan saat Anda melakukan **Deploy** di Google Apps Script editor:
1. Klik **Deploy** &rarr; **New deployment** / **Manage deployments**.
2. Pastikan pengaturannya:
   - **Execute as:** `Me (email-anda@gmail.com)`
   - **Who has access:** `Anyone` *(Siapa saja, agar frontend GitHub Pages diizinkan mengirimkan data)*.
3. Gunakan kode `Code.gs` terbaru yang telah dilengkapi fungsi `doPost(e)` untuk melayani panggilan API dari luar.
