// =================================================================
// 꽃다비 카페 사이니지 관리 (대시보드에서 운영설정·슬라이드를 고침)
// 시트: 꽃다비 카페 사이니지 스프레드시트 (대시보드 계정에 편집 권한 필요)
// =================================================================

const CAFE = {
  SHEET_ID: '1duKVFid02qGZYLDuW74b6WiwX8C6CO3P6t9RZ2w1nkQ',
  // 카페 화면 웹앱 주소 (미리보기와 TV 앱이 같은 주소를 씀)
  DISPLAY_URL: 'https://script.google.com/macros/s/AKfycbzZAWFaJQh-P6q4rvz_TL1qwqASWZQ4pjZNwYOk4D9kzF1beFSHmoSFH3FLpHD4JOMb/exec',
  SLIDE_TYPES: ['IMAGE', 'VIDEO', 'FULLSCREEN', 'SLIDES'],
  SLIDE_MAX_ROWS: 200
};

// 카페 사이니지 Code.gs의 폴더 ID와 같아야 합니다.
// 사진 관리 탭에서 올리고 지울 수 있는 폴더
const CAFE_FOLDERS = {
  cafeMenu: {
    id: '1GLppM_b3WpWzhFjWiCYp1h7RMn2-jlnn', name: '카페 메뉴', images: true, videos: false,
    note: '카페 화면에서 메뉴 사진이 중간중간 번갈아 나옵니다. 이미지만 나옵니다.'
  },
  cafeFullscreen: {
    id: '1PiLEOtZwiECWb2A_Um7N4ZIW1RYpDIER', name: '카페 전체 화면', images: true, videos: true,
    note: '화면 전체를 덮어서 나옵니다. 영상은 소리와 함께 재생됩니다.'
  }
};

function cafeSs_() {
  return SpreadsheetApp.openById(CAFE.SHEET_ID);
}

function cafeSheet_(name) {
  const sheet = cafeSs_().getSheetByName(name);
  if (!sheet) throw new Error("꽃다비 시트에 '" + name + "' 탭이 없습니다.");
  return sheet;
}

// 화면에 보여줄 설정과 슬라이드 목록
function getCafeSettings() {
  requireUser_();
  const s = cafeSheet_('운영설정');
  const mode = String(s.getRange('B3').getValue()).trim().toUpperCase();
  const scale = Number(s.getRange('B8').getValue());
  const listCount = Number(s.getRange('B11').getValue());
  return {
    emergency: mode === 'ON',
    emergencyMsg: String(s.getRange('B4').getDisplayValue() || ''),
    hours: String(s.getRange('B6').getDisplayValue() || '').trim(),
    fontScale: (scale >= 50 && scale <= 150) ? scale : 100,
    bgm: String(s.getRange('B9').getValue()).trim().toUpperCase() === 'ON',
    noticeListOn: String(s.getRange('B10').getValue()).trim().toUpperCase() !== 'OFF',
    noticeListCount: (listCount >= 1 && listCount <= 10) ? listCount : 5,
    slides: readCafeSlides_(),
    displayUrl: CAFE.DISPLAY_URL
  };
}

function readCafeSlides_() {
  const sheet = cafeSheet_('슬라이드설정');
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 6).getDisplayValues().map((r, i) => ({
    row: i + 2,
    title: String(r[0]).trim(),
    type: String(r[1]).trim().toUpperCase() || 'IMAGE',
    path: String(r[2]).trim(),
    seconds: String(r[3]).trim(),
    qr: String(r[4]).trim(),
    priority: String(r[5]).trim().toUpperCase() || 'N'
  })).filter(x => x.title || x.path);
}

// 운영설정 저장: 비상모드, 비상 문구, 운영시간, 글자 크기
function saveCafeSettings(data) {
  requireUser_();
  const emergency = !!(data && data.emergency);
  const msg = String((data && data.emergencyMsg) || '').trim();
  const hours = String((data && data.hours) || '').trim();
  const rawScale = data ? data.fontScale : '';
  const scale = (rawScale === '' || rawScale == null) ? 100 : Number(rawScale);
  const bgmOn = !!(data && data.bgm);
  const listOn = !(data && data.noticeListOn === false);
  const listCount = Number(data && data.noticeListCount);
  if (!(listCount >= 1 && listCount <= 10)) throw new Error('공지 목록 개수는 1~10 사이 숫자로 적어 주세요.');

  if (!/^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(hours)) throw new Error('운영시간은 09:00 - 18:00 형식으로 적어 주세요.');
  if (!(scale >= 50 && scale <= 150)) throw new Error('글자 크기는 50~150 사이 숫자로 적어 주세요.');

  return withLock_(() => {
    const s = cafeSheet_('운영설정');
    s.getRange('B3').setNumberFormat('@').setValue(emergency ? 'ON' : 'OFF');
    s.getRange('B4').setNumberFormat('@').setValue(msg);
    s.getRange('B6').setNumberFormat('@').setValue(hours);
    s.getRange('B8').setValue(scale);
    s.getRange('B9').setNumberFormat('@').setValue(bgmOn ? 'ON' : 'OFF');
    s.getRange('B10').setNumberFormat('@').setValue(listOn ? 'ON' : 'OFF');
    s.getRange('B11').setValue(listCount);
    SpreadsheetApp.flush();
    log_('꽃다비 운영설정', (emergency ? '비상 ON' : '비상 OFF') + ' / 운영시간 ' + hours + ' / 글자 ' + scale + '%');
    return getCafeSettings();
  });
}

// 슬라이드 목록 전체를 화면 내용으로 바꿈 (2행부터 덮어쓰기)
function saveCafeSlides(rows) {
  requireUser_();
  if (!Array.isArray(rows)) throw new Error('슬라이드 목록이 올바르지 않습니다.');
  if (rows.length > CAFE.SLIDE_MAX_ROWS) throw new Error('슬라이드는 최대 ' + CAFE.SLIDE_MAX_ROWS + '개까지 넣을 수 있습니다.');

  const values = rows.map((r, i) => {
    const n = i + 1;
    const title = String(r.title || '').trim();
    const type = String(r.type || '').trim().toUpperCase();
    const path = String(r.path || '').trim();
    const seconds = Number(r.seconds);
    const qr = String(r.qr || '').trim();
    const priority = String(r.priority || 'N').trim().toUpperCase();
    if (!title) throw new Error(n + '번째 슬라이드: 제목을 적어 주세요.');
    if (CAFE.SLIDE_TYPES.indexOf(type) === -1) throw new Error(n + '번째 슬라이드: 종류는 ' + CAFE.SLIDE_TYPES.join(', ') + ' 중 하나입니다.');
    if (!/^https?:\/\//.test(path) && !/^[-\w]{20,}$/.test(path)) throw new Error(n + '번째 슬라이드: 주소(https://…)를 확인해 주세요.');
    if (!(seconds >= 1 && seconds <= 600)) throw new Error(n + '번째 슬라이드: 보여줄 시간은 1~600초 사이로 적어 주세요.');
    if (priority !== 'Y' && priority !== 'N') throw new Error(n + '번째 슬라이드: 우선순위는 Y 또는 N입니다.');
    return [title, type, path, seconds, qr, priority];
  });

  return withLock_(() => {
    const s = cafeSheet_('슬라이드설정');
    const last = s.getLastRow();
    if (last > 1) s.getRange(2, 1, last - 1, 6).clearContent();
    if (values.length) {
      s.getRange(2, 1, values.length, 6).setValues(values);
    }
    SpreadsheetApp.flush();
    log_('꽃다비 슬라이드', values.length + '개 저장');
    return readCafeSlides_();
  });
}
