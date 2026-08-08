@echo off
title APK Bench - Upload ke GitHub
cd /d "%~dp0"

echo ============================================
echo   APK Bench - Upload ke GitHub
echo ============================================
echo.

REM --- Cek folder ini memang repo git ---
if not exist ".git" (
    echo [ERROR] Folder ini belum jadi repo Git.
    echo.
    echo Kalau baru pertama kali, clone dulu repo-nya:
    echo   git clone https://github.com/A2TH-Dev/App.git
    echo lalu jalankan file ini dari DALAM folder hasil clone tersebut.
    echo.
    pause
    exit /b 1
)

REM --- Pastikan remote origin sudah menyertakan username, supaya Git Credential
REM     Manager langsung pakai akun A2TH-Dev tanpa munculkan popup pilih akun lagi ---
for /f "delims=" %%u in ('git remote get-url origin 2^>nul') do set CURRENTURL=%%u
echo %CURRENTURL% | findstr /c:"A2TH-Dev@github.com" >nul
if errorlevel 1 (
    echo [Setup] Menyetel remote origin supaya otomatis pakai akun A2TH-Dev ...
    git remote set-url origin https://A2TH-Dev@github.com/A2TH-Dev/App.git
    echo.
)

REM --- Cek Node.js untuk build ulang sebelum upload ---
where node >nul 2>nul
if errorlevel 1 (
    echo [PERINGATAN] Node.js tidak ditemukan, lanjut tanpa build ulang lokal.
    echo ^(GitHub Action tetap akan build otomatis setelah push^)
    goto :skipbuild
)

echo [1/4] Build ulang situs dari data/site.json + data/apps/*.json ...
if not exist "node_modules\sharp" (
    where npm >nul 2>nul
    if errorlevel 1 (
        echo [PERINGATAN] npm tidak ditemukan, lewati optimasi gambar ^(sharp^).
    ) else (
        echo Menginstal dependency ^(sharp, buat kompresi gambar^), sekali saja...
        call npm install --no-audit --no-fund
    )
)
call node build.js
if errorlevel 1 (
    echo [ERROR] Build gagal. Cek pesan error di atas, perbaiki dulu file di data/apps/.
    pause
    exit /b 1
)
echo.

:skipbuild

echo [2/4] Menambahkan semua perubahan ...
git add .
echo.

REM --- Commit hanya kalau memang ada perubahan yang di-stage ---
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Update konten APK Bench - %date% %time%"
    if errorlevel 1 (
        echo.
        echo [ERROR] Commit gagal - lihat pesan error git di atas.
        echo Penyebab paling umum: Git belum tahu nama/email kamu. Perbaiki dengan:
        echo   git config --global user.email "email_kamu@gmail.com"
        echo   git config --global user.name "Nama Kamu"
        pause
        exit /b 1
    )
) else (
    echo Tidak ada perubahan baru untuk di-commit.
)
echo.

REM --- Tarik dulu perubahan terbaru dari GitHub (mis. hasil auto-build dari GitHub Action). ---
REM     --autostash otomatis simpan-lalu-kembalikan perubahan lokal yang belum sempat
REM     ke-commit, jadi tidak akan pernah "menghilang" seperti masalah stash manual sebelumnya.
echo [3/4] Menyinkronkan dengan GitHub ...
git pull --rebase --autostash
echo.

echo [4/4] Push ke GitHub ...
git push
if not errorlevel 1 goto :done

echo.
echo [Percobaan ulang] Push ditolak, sinkronkan sekali lagi ...
git pull --rebase --autostash
git push
if not errorlevel 1 goto :done

echo.
echo [Otomatis] Masih ditolak - project ini dikerjakan sendiri, jadi menyamakan
echo GitHub dengan versi lokal kamu sekarang lewat force-push ...
git push --force origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Force-push tetap gagal. Kemungkinan penyebab:
    echo   - Belum login / token GitHub kadaluarsa - buka github.com sekali di browser
    echo     memakai akun A2TH-Dev, lalu jalankan file ini lagi.
    echo   - Koneksi internet bermasalah.
    pause
    exit /b 1
)

:done
echo.
echo ============================================
echo   Selesai! Perubahan sudah di GitHub.
echo   GitHub Action akan build ulang otomatis dalam 1-2 menit.
echo   Cek tab Actions di repo untuk progressnya.
echo ============================================
pause
