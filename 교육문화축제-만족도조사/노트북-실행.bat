@echo off
chcp 65001 >nul
REM ============================================================
REM  교육문화축제 만족도 조사 - 노트북에서 전체 화면으로 띄우기
REM  이 파일을 더블클릭하면 됩니다. (index.html 과 같은 폴더에 두세요)
REM  - 첫 터치 전부터 배경 음악·음성이 나오게 함
REM  - 두 손가락 확대, 옆으로 밀어 뒤로 가기 막기
REM  - 끝낼 때: 키보드 Alt + F4
REM ============================================================

set "PAGE=%~dp0index.html"
set "PROFILE=%LOCALAPPDATA%\edu-festival-survey"

set "BROWSER="
REM 엣지를 먼저 씀: 엣지에는 사람처럼 자연스러운 AI 음성(SunHi, InJoon)이 있음 (인터넷 필요)
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if not defined BROWSER (
  echo 엣지 또는 크롬 브라우저를 찾을 수 없습니다.
  pause
  exit /b 1
)

start "" "%BROWSER%" --user-data-dir="%PROFILE%" --kiosk --autoplay-policy=no-user-gesture-required --disable-pinch --overscroll-history-navigation=0 --no-first-run --disable-features=Translate --disable-session-crashed-bubble "%PAGE%"
