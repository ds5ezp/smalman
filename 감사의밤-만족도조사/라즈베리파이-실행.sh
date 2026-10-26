#!/bin/bash
# 라즈베리파이에서 감사의 밤 만족도 조사 화면을 전체 화면(키오스크)으로 띄움
# 사용: 터미널에서  bash 라즈베리파이-실행.sh
#  - 크로미움이 이미 켜져 있으면 모두 닫고 실행하세요 (켜진 창에 탭으로만 열려 옵션이 적용되지 않음)
#  - 종료: Alt+F4 (키보드 필요)

DIR="$(cd "$(dirname "$0")" && pwd)"
BROWSER="$(command -v chromium-browser || command -v chromium)"
if [ -z "$BROWSER" ]; then
  echo "크로미움 브라우저를 찾을 수 없습니다. sudo apt install chromium-browser 로 설치하세요."
  exit 1
fi

# 이미 켜진 크로미움 닫기
pkill -f chromium 2>/dev/null; sleep 1

if [ "$XDG_SESSION_TYPE" = "x11" ]; then
  # 화면 보호기·절전으로 화면이 꺼지지 않게
  xset s off 2>/dev/null; xset s noblank 2>/dev/null; xset -dpms 2>/dev/null
  # 화면을 세로로 돌렸을 때 터치 방향도 화면에 맞춤 (터치 장치를 연결된 모니터에 연결)
  if command -v xinput >/dev/null && command -v xrandr >/dev/null; then
    OUT="$(xrandr | awk '/ connected/{print $1; exit}')"
    xinput list --name-only | grep -i -E 'touch|finger|ilitek|goodix|eGalax|wch' | while read -r DEV; do
      xinput map-to-output "$DEV" "$OUT" 2>/dev/null && echo "터치 장치 '$DEV' → 화면 $OUT 에 맞춤"
    done
  fi
fi

# --touch-events=enabled : 크로미움이 터치 화면을 못 알아보는 경우에도 터치로 받게 함
# --disable-pinch        : 두 손가락으로 화면이 확대되지 않게
# --overscroll-history-navigation=0 : 옆으로 밀어도 뒤로 가기 되지 않게
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --no-first-run \
  --touch-events=enabled --disable-pinch --overscroll-history-navigation=0 \
  --disable-features=Translate,TouchpadOverscrollHistoryNavigation \
  --disable-session-crashed-bubble --check-for-update-interval=31536000 \
  "file://$DIR/index.html"
