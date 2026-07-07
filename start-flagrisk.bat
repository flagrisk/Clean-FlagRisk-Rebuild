@echo off
REM ============================================================================
REM  FlagRisk dev launcher — auto-detects your current Wi-Fi IP, tells Metro to
REM  advertise it, and starts the dev server so the QR scan works every time
REM  (even on a phone hotspot where the IP changes between sessions).
REM  Just double-click this file. Then scan the QR in the FlagRisk app.
REM ============================================================================

setlocal enabledelayedexpansion

REM --- find the IPv4 address of the active Wi-Fi adapter ---
set "IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
    set "CANDIDATE=%%a"
    set "CANDIDATE=!CANDIDATE: =!"
    REM prefer a private-range address (10.x / 192.168.x / 172.x)
    echo !CANDIDATE! | findstr /R "^10\. ^192\.168\. ^172\." >nul && set "IP=!CANDIDATE!"
)

if "!IP!"=="" (
    echo Could not auto-detect a Wi-Fi IP address.
    echo Make sure you are connected to the hotspot/Wi-Fi, then try again.
    pause
    exit /b 1
)

echo ============================================================
echo  FlagRisk dev server
echo  Detected IP: !IP!
echo  Scan the QR below in the FlagRisk app to connect.
echo ============================================================

set "REACT_NATIVE_PACKAGER_HOSTNAME=!IP!"
call npx expo start --dev-client

endlocal
