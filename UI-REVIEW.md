# Pemeriksaan perombakan UI, 18 November 2026

Mode penerapan selama pengerjaan, dipilih pengguna. Cakupan: struktur halaman, navigasi, galeri, peta, pemutar tunggal dan Multi CCTV. Arah: DESIGN.md, ENERGY 2 / RHYTHM 2 / MOTION 1. Pemeriksaan ini merupakan uji implementasi dan tinjauan antarmuka, bukan riset pengguna atau sertifikasi aksesibilitas.

## Bukti alur yang dijalankan

- Kota Cirebon dan Kabupaten: tombol wilayah mengganti daftar 23 dan 41 kamera.
- Pencarian lokasi yang tidak ada menampilkan keadaan kosong; Tampilkan semua memulihkan daftar.
- Favorit pada Jalan Gronggong dengan Spasi mengubah keadaan terpilih; tab Favorit menampilkan satu kamera dan judul Kamera favorit. Penghapusan favorit menghasilkan keadaan kosong.
- Riwayat menampilkan kamera yang dibuka dan judul Riwayat tontonan. Semua kamera mengembalikan galeri, termasuk dari peta.
- Pengurutan nama, status pemutaran dan terakhir ditonton dapat dipilih. Filter Semua, Bisa diputar dan Belum bisa mengganti kumpulan kamera.
- Peta lokasi terbuka; Semua titik, Zoom in dan Zoom out bekerja. Penanda Jalan Gronggong dibuka dengan klik, Enter, dan Spasi.
- Kamera tunggal dibuka dengan Enter. Coba lagi memuat ulang pemutar. Salin tautan menghasilkan pesan berhasil. Fullscreen pada browser uji ditolak dan menampilkan pesan pemulihan yang terlihat.
- Escape menutup dialog dan mengembalikan fokus. Tombol tutup juga menutup. Kamera, timer dan heartbeat dibersihkan ketika dialog ditutup.
- Multi CCTV memilih empat kamera; pilihan kelima ditolak dengan penjelasan. Pantau bersamaan membuka empat panel; Coba lagi membuat ulang empat panel. Empat video Kabupaten menghasilkan dimensi 2688 piksel dan waktu pemutaran yang bertambah. Kosongkan pilihan menyembunyikan baki pilihan.
- Tentang pemeriksaan terbuka dengan klik dan ditutup dengan Enter. Periksa ulang mengulang pemeriksaan tayangan.
- Mobile Kamera/Peta, koleksi, dan tombol semua titik dijalankan pada viewport ponsel.
- Ukuran 360, 390, 790 dan 810 piksel diuji dengan iframe viewport. Lebar scroll sama dengan lebar konten pada tiap ukuran, termasuk tampilan peta. Contoh 360: 345/345 piksel setelah scrollbar; 810 pada peta: 810/810 piksel.
- Pada viewport 360, tidak ada tombol atau select milik aplikasi yang terlihat dengan tinggi di bawah 44 piksel. Fokus Shift+Tab dari pencarian kembali ke tombol Kabupaten dengan outline 3 piksel.
- `node --check app.js` berhasil. Log browser yang tersedia tidak menunjukkan exception JavaScript aplikasi. Kesalahan ekstensi browser tidak dihitung sebagai kesalahan aplikasi.
- Keadaan belum diperiksa, memeriksa, bisa diputar, belum bisa, serta daftar salinan ketika pembaruan sumber gagal tetap tersedia. Pemutaran mengikuti jaringan dan codec sumber, bukan jaminan ketersediaan seluruh kamera.
- Fallback kolom tautan ketika clipboard ditolak diperiksa melalui kode, bukan penolakan izin browser yang dipaksakan. Screen reader dan metrik Core Web Vitals tidak diukur dalam sesi ini.

## Delivery gate

### Hard gate

- R-02 PASS: pencarian karakter em dash pada HTML, JS, CSS dan arah desain menghasilkan nol.
- R-03 PASS: viewport 360/390/790/810 tidak melebar; tombol dan select aplikasi yang terlihat pada 360 memiliki tinggi minimal 44 piksel.
- R-17 PASS: jumlah kamera berasal dari katalog dan respons sumber; tidak ada metrik promosi.
- R-18 PASS: tidak ada testimoni atau identitas orang yang dibuat.
- R-23 PASS: memakai wordmark teks yang sudah ada dan bingkai kamera nyata; susunan navigasi berada dalam permintaan rombak total.
- R-24 PASS: navigasi Kamera/Peta dan koleksi mengubah tampilan yang benar-benar tersedia; tidak ada halaman fiktif.
- R-25 PASS: pasangan teks sekunder/kertas 4,95:1, aksen/permukaan 5,87:1, status hijau/putih 6,82:1, merah/putih 6,98:1, teks pemutar 9,26:1. Token teks lain dipilih dengan kontras sekurangnya setara; kontrol nonaktif mengikuti pengecualian keadaan nonaktif.
- R-26 PASS: tombol, select, pencarian, disclosure, dialog dan navigasi mempunyai perilaku nyata yang tercatat di atas.
- R-27 PASS: keadaan kosong, pemeriksaan berlangsung, video gagal dan pemulihan tetap ada; tidak hanya keadaan berhasil.
- R-28 PASS: tidak menambahkan FAQ.
- R-32 PASS: Enter/Spasi membuka kartu dan penanda, Escape menutup dialog, fokus kembali, dan outline 3 piksel terlihat.
- R-33 PASS: perombakan ditulis langsung di HTML, JS dan CSS; tidak ada helper pengubah sumber dalam repositori.
- R-34 PASS: satu tema terang sesuai arahan pengguna; tidak mengirim toggle tema yang tidak selesai.
- R-35 PASS: aplikasi dijalankan dengan pratinjau, alur kontrol dicatat satu per satu, kode JS lolos pemeriksaan sintaks dan log aplikasi diperiksa. Fullscreen mempunyai hasil penolakan yang jujur pada browser uji.
- R-36 PASS: tidak ada klaim kepatuhan, performa, pelanggan atau keamanan yang dibuat-buat.
- R-37 PASS: arah visual ditulis sebelum pembangunan pada DESIGN.md dan diterapkan pada semua tampilan.
- R-38 PASS: konten adalah katalog kamera yang benar-benar ada dan hasil uji pemutaran; tidak ada konten promosi rekaan.
- R-39 PASS: kontrol native dengan nama aksesibel, label pencarian dan urutan terlihat, penanda peta diberi nama kamera, hover/aktif/nonaktif/fokus, dan reduced-motion. HTML memiliki bahasa, judul dan landmark.
- R-40 PASS: ukuran media dicadangkan melalui aspect-ratio dan dimensi CSS, skrip pihak ketiga defer/module, tidak ada angka Lighthouse atau Web Vitals yang diklaim.

### Purpose gate

- R-01 PASS: tidak ada gradien/glow dekoratif; aksen bata membedakan navigasi dari warna status kamera.
- R-04 PASS: Font Awesome sesuai permintaan pengguna; bintang berarti favorit, grid berarti multi-kamera, jam berarti riwayat.
- R-06 PASS: Instrument Sans dipertahankan untuk nama jalan dan label yang mudah dibaca; tidak ada judul monospace atau label berjarak ekstrem.
- R-07 PASS: tidak ada pola grid latar, noise atau ornamen teknis.
- R-08 PASS: tidak menyebarkan panah dekoratif pada tombol.
- R-09 PASS: warna dan titik status hanya membawa hasil pemeriksaan video yang nyata; tidak ada badge promosi.
- R-10 PASS: tidak memakai glassmorphism.
- R-12 PASS: bayangan hanya pada pesan sementara, baki pilihan dan penanda lokasi; galeri dan kontrol utama memakai struktur dan garis.
- R-13 PASS: tidak ada efek glow.
- R-14 PASS: ukuran feed setara untuk membandingkan titik kamera; ini galeri data nyata, bukan kartu fitur promosi.
- R-19 PASS: hanya transisi keadaan 0,12 detik; tidak ada animasi berulang dekoratif, reduced-motion menonaktifkan transisi.
- R-22 PASS: gambar berasal dari video kamera, tanpa ilustrasi generik.

### Liveliness

- Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 ditulis pada DESIGN.md dan sesuai implementasi.
- Focal point PASS: feed kamera dominan pada galeri; peta atau video menjadi fokus pada tampilan masing-masing.
- Whitespace PASS: ruang memisahkan indeks, kontrol, hasil dan media; informasi kamera rata, dengan area aksi tersendiri.
- Accent PASS: bata untuk koleksi/aksi; hijau dan merah dibatasi pada status tayangan.
- Identity PASS: wordmark Cirebon, lokasi/identitas titik, susunan indeks dan palet kertas membentuk konsol pengamatan yang spesifik.
- Design read PASS: arah dan dial ditulis sebelum CSS baru.

### Craftsmanship dan quality locks

- C-1 PASS: alasan warna, tipografi, susunan, garis, ikon dan media ditulis di DESIGN.md.
- C-2 PASS: jenis kontrol mempunyai hasil uji yang tercatat, tidak ada tombol hias.
- C-3 PASS: hanya indeks, kontrol pencarian, kamera, peta, pemutar dan informasi pemeriksaan.
- C-4 PASS: keadaan kosong, proses, video tidak tersedia, keyboard dan peralihan viewport diperiksa.
- C-5 PASS: tidak ada klaim atau data promosi rekaan.
- R-05 PASS: komposisi mengikuti alur menemukan dan memutar kamera; tidak ada hero pemasaran, bento fitur atau susunan landing page.
- R-11 PASS: radius 4 piksel untuk kontrol dan 6/8 untuk media/dialog; bukan semua pil.
- R-15 PASS: aksi memakai istilah Periksa ulang, Pantau bersamaan, Salin tautan, Coba lagi dan Tampilkan semua.
- R-16 PASS: tidak ada buzzword pemasaran pada produk.
- R-20 PASS: indeks vertikal, teks lokasi, feed nyata dan aksen bata memberi karakter konsol Cirebon.
- R-21 PASS: mengikuti instruksi pengguna untuk tidak menambahkan dark mode; permukaan gelap hanya mengelilingi video.
- R-29 PASS: palet netral kertas/arang, satu aksen bata, dengan dua warna semantik untuk hasil uji.
- R-30 PASS: tidak memakai template atau meniru komposisi produk lain.
- R-31 PASS: setiap keputusan visual utama mempunyai alasan satu baris pada DESIGN.md.
