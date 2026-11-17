# Pantau Cirebon

Peta CCTV publik Kabupaten Cirebon dengan daftar dan pemutar kamera yang bersumber dari [Socakaton](https://socakaton.cirebonkab.go.id/). Situs ini independen dari Diskominfo Kabupaten Cirebon.

## GitHub Pages

Buka **Settings → Pages** dan pilih **Deploy from a branch**, lalu cabang `main` dan folder `/ (root)`. Situs proyek menggunakan alamat `https://savemeours.github.io/cctv-cirebon/`.

Untuk menjalankan di komputer, buka folder proyek, jalankan `python3 -m http.server 8000`, lalu buka `http://localhost:8000/`.

## Sumber data

Peramban meminta `https://socakaton.cirebonkab.go.id/api/get_public_cctv` secara langsung. Daftar hanya menampilkan kamera yang ditandai terbuka dan memiliki URL HTTPS. Pemutar dimuat saat kamera dipilih dan dilepas saat dialog ditutup. Peta dasar menggunakan OpenStreetMap melalui Leaflet.

Pemuatan otomatis memerlukan API Socakaton yang dapat diakses dari origin GitHub Pages dan mengizinkan CORS untuk origin tersebut. Saat koneksi gagal, halaman memberikan tombol muat ulang dan tautan ke portal resmi. Pemutaran di dalam halaman juga mengikuti kebijakan penyematan masing-masing penyedia tayangan.
