# 🎙️ NotulensiAI

**Transkripsi audio rapat tanpa batas ukuran & durasi. Buat notulensi profesional otomatis dengan AI.**

Dibangun untuk dijalankan sepenuhnya via GitHub Pages — tanpa server, tanpa backend, tanpa batasan upload.

---

## ✨ Fitur

| Fitur | Keterangan |
|---|---|
| 📁 **Upload tak terbatas** | Tidak ada batas jumlah file, ukuran file, atau durasi rekaman |
| ✂️ **Auto chunking** | File audio panjang otomatis dipotong per segmen ~55 detik, diproses berurutan, lalu digabung |
| 🎙️ **Transkripsi akurat** | Menggunakan OpenAI Whisper (model terbaik untuk Bahasa Indonesia) |
| ✨ **Notulensi AI** | Claude mengubah transkrip kasar menjadi notulensi profesional terstruktur |
| 🔒 **Privasi terjaga** | Semua proses audio di browser — API key tidak pernah meninggalkan perangkat Anda |
| 📥 **Export fleksibel** | Salin atau unduh transkrip (.txt) dan notulensi (.md) |
| 🌐 **Antarmuka modern** | Dark mode, responsive, live progress saat transkripsi berlangsung |

---

## 🚀 Cara Deploy ke GitHub Pages

### 1. Fork / Clone repo ini

```bash
git clone https://github.com/username/notulensi-ai.git
cd notulensi-ai
```

### 2. Push ke GitHub

```bash
git add .
git commit -m "Initial deploy"
git push origin main
```

### 3. Aktifkan GitHub Pages

1. Buka repo di GitHub → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `root`
4. Klik **Save**

Website akan tersedia di: `https://username.github.io/notulensi-ai`

---

## 🔑 API Keys yang Diperlukan

### OpenAI API Key (Wajib — untuk Transkripsi)

1. Buka [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Klik **Create new secret key**
3. Salin key, masukkan di tab **Pengaturan** aplikasi

**Estimasi biaya Whisper:**
- 1 jam audio ≈ $0.36
- 2 jam audio ≈ $0.72
- 7 rekaman × rata-rata 1.5 jam ≈ $3.78 total

### Anthropic API Key (Opsional — untuk Notulensi AI)

1. Buka [console.anthropic.com](https://console.anthropic.com)
2. Buat API key baru
3. Masukkan di tab **Pengaturan** aplikasi

**Estimasi biaya Claude:**
- Per rapat ≈ $0.02–0.05 (sangat murah)

---

## 📖 Cara Penggunaan

```
1. Buka website → tab Pengaturan → masukkan API key → Simpan
2. Upload file audio dari sidebar kiri (boleh banyak sekaligus)
3. Klik "Mulai Transkripsi"
4. Tunggu proses (live progress terlihat di layar)
5. Salin atau unduh transkrip
6. (Opsional) Tab Notulensi → isi info rapat → "Buat Notulensi"
```

**Durasi proses estimasi:**
- 1 jam audio ≈ 65 segmen ≈ 3–6 menit proses
- 2 jam audio ≈ 130 segmen ≈ 6–12 menit proses

---

## 🗂 Struktur File

```
notulensi-ai/
├── index.html          # Halaman utama (single-page app)
├── css/
│   └── style.css       # Stylesheet
├── js/
│   ├── transcriber.js  # Engine audio chunking & Whisper API
│   ├── notulensi.js    # Generator notulensi via Claude API
│   └── app.js          # UI logic & state management
└── README.md
```

---

## ⚙️ Teknis

- **Transkripsi**: OpenAI Whisper API (`whisper-1` model)
- **Chunking**: Web Audio API — file decode di browser, dipotong per 55 detik
- **Notulensi**: Anthropic Claude (`claude-sonnet-4-20250514`)
- **Storage**: `localStorage` (hanya untuk menyimpan API key di browser lokal)
- **Hosting**: GitHub Pages (static) — tidak butuh server

---

## 🔐 Keamanan

- API key **disimpan di `localStorage` browser Anda sendiri** — tidak dikirim ke server manapun selain OpenAI/Anthropic
- File audio diproses sepenuhnya di browser sebelum dikirim ke Whisper
- Tidak ada data yang disimpan di cloud kami (karena tidak ada server kami)

---

## 📝 Lisensi

MIT License — bebas digunakan, dimodifikasi, dan didistribusikan.
