@echo off
title APK Bench - Launcher
cd /d "%~dp0"

echo ============================================
echo   APK Bench - Local Dev Launcher
echo ============================================
echo.

REM --- Cek Node.js terinstall ---
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js tidak ditemukan.
    echo Install dulu dari https://nodejs.org lalu jalankan ulang file ini.
    pause
    exit /b 1
)

echo [1/3] Membuka jendela Build Watch  ^(node build.js --watch^) ...
start "APK Bench - Build Watch" cmd /k "cd /d "%~dp0" && node build.js --watch"

timeout /t 1 /nobreak >nul

echo [2/3] Membuka jendela Local Server ^(npx serve . -l 3000^) ...
start "APK Bench - Local Server" cmd /k "cd /d "%~dp0" && npx serve . -l 3000"

echo [3/3] Menunggu server siap, lalu membuka browser ...
timeout /t 4 /nobreak >nul

start "" "http://localhost:3000"

echo.
echo Selesai. Dua jendela CMD baru sudah terbuka:
echo   - "APK Bench - Build Watch"  -> jangan ditutup, ini yang auto-rebuild
echo   - "APK Bench - Local Server" -> jangan ditutup, ini yang serve ke browser
echo.
echo Browser sudah dibuka ke http://localhost:3000
echo Edit data/apps.json, simpan, lalu refresh browser (F5) untuk lihat perubahan.
echo.
echo Jendela ini boleh ditutup kapan saja.
pause
