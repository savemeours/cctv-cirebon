# Pantau Cirebon

Peta CCTV publik Kota dan Kabupaten Cirebon. Pilihan awal membuka Kota Cirebon. Kedua wilayah mempunyai daftar, koordinat, pencarian, label sumber dan pemutar masing-masing.

## Sumber

- Kota Cirebon menggunakan https://cctv.cirebonkota.go.id/api/status dengan salinan 23 kamera per 18 November 2026.
- Kabupaten Cirebon menggunakan https://socakaton.cirebonkab.go.id/api/get_public_cctv dengan salinan 41 kamera per 17 November 2026.

Salinan daftar disertakan pada blok JSON di index.html agar pencarian tetap tersedia saat API gagal. Pembaruan API mengganti daftar wilayah terkait. Status aktif Kota mengikuti respons sumber, dengan tanggal salinan ditampilkan bila pembaruan gagal.

Pemutar Kabupaten mengikuti URL publik sumber. Pemutar Kota menggunakan HLS dan heartbeat hanya selama kamera dibuka. Penutupan dialog menghentikan video dan heartbeat.

API dan video Kota mengikuti aturan CORS server resmi. Portal Kota mengirim X-Frame-Options SAMEORIGIN sehingga tautan ke portal dibuka di tab baru. Jika server menolak pemutaran dari GitHub Pages, dialog menyediakan tautan portal resmi serta nama kamera yang harus dipilih.

## Publikasi

GitHub Pages menggunakan cabang main dan folder root. Situs publik tersedia di https://savemeours.github.io/cctv-cirebon/.

Untuk mengganti salinan, sesuaikan blok camera-catalog atau city-catalog dalam index.html dan tanggal sumber pada app.js. Ekspor city-cameras.json berisi salinan data Kota yang sama.
