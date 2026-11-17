# Pantau Cirebon

Peta CCTV publik Kabupaten Cirebon dengan daftar dan pemutar kamera yang bersumber dari [Socakaton](https://socakaton.cirebonkab.go.id/). Situs ini independen dari Diskominfo Kabupaten Cirebon.

## GitHub Pages

Buka **Settings → Pages** dan pilih **Deploy from a branch**, lalu cabang `main` dan folder `/ (root)`. Situs proyek menggunakan alamat `https://savemeours.github.io/cctv-cirebon/`.

Untuk menjalankan di komputer, buka folder proyek, jalankan `python3 -m http.server 8000`, lalu buka `http://localhost:8000/`.

## Sumber data

Situs memuat salinan daftar Socakaton yang disertakan dalam halaman terlebih dahulu, lalu meminta pembaruan melalui `https://socakaton.cirebonkab.go.id/api/get_public_cctv` dari peramban. Jika pembaruan gagal, daftar terakhir tetap dapat dicari. Salinan awal berisi 41 kamera publik per 17 November 2026, dengan nama, grup, koordinat, status akses, dan tautan pemutar publik.

Untuk mengganti salinan, perbarui `cameras.json`, salin isinya ke blok `camera-catalog` pada `index.html`, dan sesuaikan tanggal sumber pada `app.js`. Peta dasar menggunakan OpenStreetMap melalui Leaflet. Pemutar tetap terhubung ke penyedia resmi dan mengikuti kebijakan penyematan serta ketersediaan jaringan masing-masing kamera.
