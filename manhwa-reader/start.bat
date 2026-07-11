@echo off
echo ==============================
echo    قارئ المانهوا المترجم
echo ==============================
echo.

echo [1/3] تشغيل خادم Manga-OCR...
start "Manga-OCR Server" cmd /k python ocr_server.py

echo انتظر حتى يظهر "Manga-OCR جاهز" في النافذة الأخرى...
timeout /t 20 /nobreak > nul

echo.
echo [2/3] تشغيل نفق Cloudflare (للوصول من أي جهاز)...
start "Cloudflare Tunnel" cmd /k cloudflared tunnel --url http://localhost:4040

echo.
echo [3/3] تشغيل خادم الموقع...
node server.js
