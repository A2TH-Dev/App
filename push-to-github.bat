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

REM --- Cek Node.js untuk build ulang sebelum upload ---
where node >nul 2>nul
if errorlevel 1 (
    echo [PERINGATAN] Node.js tidak ditemukan, lanjut tanpa build ulang lokal.
    echo ^(GitHub Action tetap akan build otomatis setelah push^)
    goto :skipbuild
)

echo [1/4] Build ulang situs dari data/apps.json ...
call node build.js
if errorlevel 1 (
    echo [ERROR] Build gagal. Cek pesan error di atas, perbaiki dulu apps.json.
    pause
    exit /b 1
)
echo.

:skipbuild

echo [2/4] Menambahkan semua perubahan ...
git add .
echo.

REM --- Cek ada perubahan atau tidak ---
git diff --cached --quiet
if not errorlevel 1 (
    echo Tidak ada perubahan untuk di-upload. Semua sudah sinkron.
    pause
    exit /b 0
)

echo [3/4] Tulis pesan commit singkat (atau langsung Enter untuk pesan default):
set /p commitmsg="Pesan commit: "
if "%commitmsg%"=="" set commitmsg=Update konten APK Bench

git commit -m "%commitmsg%"
if errorlevel 1 (
    echo.
    echo [ERROR] Commit gagal — lihat pesan error git di atas.
    echo.
    echo Penyebab paling umum: Git belum tahu nama/email kamu. Perbaiki dengan:
    echo   git config --global user.email "email_kamu@gmail.com"
    echo   git config --global user.name "Nama Kamu"
    echo Lalu jalankan ulang file ini.
    echo.
    pause
    exit /b 1
)
echo.

echo [4/4] Push ke GitHub ...
git push

if errorlevel 1 (
    echo.
    echo [ERROR] Push gagal. Kemungkinan penyebab:
    echo   - Belum login / token GitHub kadaluarsa
    echo   - Ada perubahan baru di GitHub yang belum kamu tarik ^(coba: git pull^)
    echo   - Koneksi internet bermasalah
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Selesai! Perubahan sudah di GitHub.
echo   GitHub Action akan build ulang otomatis dalam 1-2 menit.
echo   Cek tab Actions di repo untuk progressnya.
echo ============================================
pause
