# Pantau Cirebon

Peta CCTV publik Kota dan Kabupaten Cirebon. Pilihan awal membuka Kota Cirebon. Kedua wilayah mempunyai daftar, koordinat, pencarian, label sumber dan pemutar masing-masing.

## Sumber

- Kota Cirebon menggunakan https://cctv.cirebonkota.go.id/api/status dengan salinan 23 kamera per 18 November 2026.
- Kabupaten Cirebon menggunakan https://socakaton.cirebonkab.go.id/api/get_public_cctv dengan salinan 41 kamera per 17 November 2026.

Salinan daftar disertakan pada blok JSON di index.html agar pencarian tetap tersedia saat API gagal. Pembaruan API mengganti daftar wilayah terkait. Status aktif Kota mengikuti respons sumber, dengan tanggal salinan ditampilkan bila pembaruan gagal.

Pemutar Kabupaten mengikuti URL publik sumber. Pemutar Kota menggunakan HLS dan heartbeat hanya selama kamera dibuka. Penutupan dialog menghentikan video dan heartbeat.

API dan video Kota diteruskan melalui penghubung khusus agar dapat dimuat dari GitHub Pages. Pemutar menyediakan tautan portal resmi jika sumber atau penghubung tidak tersedia.

## Publikasi

GitHub Pages menggunakan cabang main dan folder root. Situs publik tersedia di https://savemeours.github.io/cctv-cirebon/.

Untuk mengganti salinan, sesuaikan blok camera-catalog atau city-catalog dalam index.html dan tanggal sumber pada app.js. Ekspor city-cameras.json berisi salinan data Kota yang sama.

## Penghubung siaran Kota

Pemutar dan daftar Kota menggunakan https://pantau-cirebon-stream.fnnanang.chatgpt.site/city/ sebagai penghubung server untuk aliran publik. Penghubung hanya menerima endpoint status, heartbeat, dan berkas HLS kamera Kota yang tercantum di daftar. Playlist diterjemahkan ke jalur penghubung agar segmen video dapat dibaca peramban dari GitHub Pages. Sumber asli tetap portal Kota.

Penghubung berjalan sebagai layanan terpisah. Jika layanan atau kamera sumber tidak tersedia, pemutar menampilkan pesan kegagalan dan tautan portal resmi.

Kode sumber penghubung tersedia di city-relay-worker.js dan dijalankan sebagai Worker ES module pada layanan terpisah. Penghubung aktif hanya meneruskan endpoint publik Kota Cirebon yang telah ditentukan.

Sebagian kamera, termasuk Depan Masjid Raya At-Taqwa pada pengujian 18 November 2026, mengirim video HEVC/H.265. Pemutaran format ini memerlukan dukungan codec pada peramban dan sistem operasi. Simpang Krucuk mengirim H.264 dan telah diuji berjalan di halaman GitHub Pages.

Penghubung mengambil segmen terbaru lebih awal dan menahannya sementara hingga 60 detik dalam memori proses dengan batas total 24 MiB. Ini membantu kamera dengan daftar segmen yang cepat berganti. Jika proses dimulai ulang, segmen diminta kembali dari sumber.

## Pemeriksaan Kabupaten 18 November 2026

Salinan JSON terbaru berisi 41 kamera publik. Pemutar Kabupaten mengirim parameter autoplay=true dan mute=true, serta izin autoplay pada iframe. Pembungkus Socakaton yang menyertakan URL pemutar publik diuraikan ke URL tersebut setelah validasi host dan format. Tombol atur ulang peta serta pemilihan wilayah menyesuaikan batas tampilan dengan seluruh titik wilayah.

## Indikator dan thumbnail

Halaman menguji aliran video pada browser pengunjung dengan maksimum dua pemeriksaan bersamaan. Status Bisa diputar diberikan setelah bingkai video berhasil didekode. Thumbnail diambil dari bingkai tersebut dan hanya disimpan dalam memori halaman. Status Belum bisa diputar berarti pemeriksaan pada browser ini gagal, melewati 25 detik, atau sumber menandai kamera tidak aktif. Status ini mengikuti dukungan codec dan jaringan browser.

Hasil digunakan kembali hingga tiga menit. Tombol Muat ulang daftar mengulangi pemeriksaan. Membuka pemutar menghentikan pemeriksaan latar belakang, yang dilanjutkan setelah dialog ditutup. Warna titik peta mengikuti hasil pemeriksaan.
