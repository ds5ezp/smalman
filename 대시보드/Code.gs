/**
 * 거제시종합사회복지관 통합 관리 대시보드 - 백엔드 (Code.gs)
 * 1단계: 로비 디지털사이니지 관리
 * 2단계: 각 실 디지털사이니지 관리
 * 3단계: 공유트럭(나눔드림트럭) 현황 요약 + 관리자 화면
 * 4단계: 어르신 배움터 접수 관리 (현황, 명단, 추첨, 합격자 대장, 일정)
 *        셔틀버스 운행 현황 + 관리자 화면
 *
 * 배포: 실행 계정 = 나(viewer@geojecwc.kr), 액세스 = geojecwc.kr 도메인 사용자
 * 접근 허용: 프로젝트 설정 > 스크립트 속성 > ALLOWED_EMAILS (쉼표로 구분)
 *           비워두면 대시보드 소유자만 사용할 수 있습니다.
 */

// =================================================================
// 1. 설정
// =================================================================

const LOBBY = {
  SHEET_ID: '1LS0Rbcw8U0LeTRLr-9O4HtWu2FJURPVe4bGepC2fMsY',
  DISPLAY_URL: 'https://script.google.com/macros/s/AKfycbz7aY7yK7oyzYGVLe8d0siaRFydsV54ZB9CQwBwe57dhSRKSEPMUndZA0MEhaIa_Cw_Gg/exec',
  // 운영설정 시트에서 로비 사이니지가 읽는 칸
  CELL_EMERGENCY: 'B3',
  CELL_EMERGENCY_MSG: 'B4',
  CELL_HOURS: 'B6'
};

// 로비 사이니지 Code.gs의 폴더 ID와 같아야 합니다.
// images/videos: 로비 화면에서 실제로 재생되는 파일 종류
const LOBBY_FOLDERS = {
  general: {
    id: '1UO0beDOiD-J7g08WhL9ave12ZXxknQyo', name: '일반 홍보', images: true, videos: true,
    note: '로비 사이니지와 각 실 사이니지에 함께 나옵니다.'
  },
  webzine: {
    id: '1xpX4z7zMC3TjWVkZ46-r2Eb8F3uMwXrJ', name: '웹진', images: true, videos: false,
    note: '파일 이름 순서대로 나옵니다. 이미지만 나옵니다.'
  },
  fullscreen: {
    id: '1k7GgfHzgojubwxkL1twkN6XV-24v-35a', name: '전체화면', images: true, videos: false,
    note: '화면 전체를 덮어 나옵니다. 영상은 재생되지 않으니 이미지만 올려주세요.'
  },
  welcome: {
    id: '1wAUUTEmmiCUhJNgdr1DNcJE6btU32drJ', name: '기관방문 환영', images: true, videos: false,
    note: '기관방문 일정 시간에만 나옵니다. 이미지만 나옵니다.'
  }
};

// 각 실 사이니지 (각실디지털사이니지 Code.gs의 ID와 같아야 합니다)
const ROOM = {
  SHEET_ID: '1hoLiTcra5mFmBTtcZzlBXpPbFc4KEL0_FWWJQx_hXDs',
  DISPLAY_URL: 'https://script.google.com/macros/s/AKfycbzwaGM4DO4QGiBreobGOm2wUDU3PLFgzkXEousEIaDNFIAvro4QdydkUz9BVI1T3dgo/exec',
  CALENDAR_ID: 'calendar@geojecwc.kr',
  TYPES: ['자율', '문의']
};

// perRoom: 파일 이름이 '실이름_' 으로 시작해야 그 실에 나옴 (올릴 때 자동으로 붙임)
// keyword: 파일 이름(기간 제외)이 캘린더 일정 제목에 들어 있으면 그 수업 중에 나옴
const ROOM_FOLDERS = {
  roomFull: {
    id: '18PjgVNfCeNsDI8dI_9Htg1Ugv-UNVJR0', name: '단독 풀화면', images: true, videos: false, perRoom: true,
    note: '이 실 이미지가 하나라도 있으면 일정·주간표 없이 이미지만 화면 가득 나옵니다.'
  },
  roomRotation: {
    id: '1Kq0kTS4N28jHAwWA01p1O5-92lvvr8RT', name: '순환', images: true, videos: false, perRoom: true,
    note: '일정·주간표와 번갈아 나옵니다. 단독 풀화면 이미지가 있으면 나오지 않아요.'
  },
  roomCommon: {
    id: '1mFYuJhDn7KETIIz9NPWvZizSSk71c6Mg', name: '각 실 공통', images: true, videos: false,
    note: '실 전용 이미지가 없는 모든 실에 나옵니다. (로비의 일반 홍보 폴더 이미지도 함께 나와요)'
  },
  emergency: {
    id: '1dIfxfS-ZUCABGpye0DbsALmUOa1W2_pA', name: '긴급 전체화면', images: true, videos: false,
    note: '노출 기간 안의 이미지가 하나라도 있으면 모든 실 화면이 긴급 이미지로 바뀝니다.'
  },
  program: {
    id: '1s4DHrHgSiR27y322LjL_61nRmt69UtWX', name: '프로그램 이미지', images: true, videos: false, keyword: true,
    note: '파일 이름이 캘린더 수업 제목에 들어 있으면 그 수업 시간에 나옵니다.'
  }
};

// 공유트럭 (sharetruck@geojecwc.kr 소유)
// SHEET_ID: 공유트럭 구글 시트 주소의 /d/ 와 /edit 사이 값. viewer 계정에 '뷰어' 이상으로 공유되어 있어야 함
// 예약 승인·반려 같은 관리 작업은 공유트럭 앱의 관리자 화면(비밀번호)을 대시보드 안에 띄워서 함
const TRUCK = {
  SHEET_ID: '1GxaBRZywbBc7ITWlXtuzvGHpZpgZt7iMq73aqP8JgSA',
  APP_URL: 'https://script.google.com/macros/s/AKfycbzfORMMwpW1wReLQNxS7CBt1uYM84_iiD2BQFhuH-H8HnUPnXcZNpgXaQmjnLDLagc_/exec'
};

// 어르신 배움터 (배움터 접수시스템 Code.gs의 FORM_ID / INFO_ID 와 같아야 함)
// 학기가 바뀌어 강좌정보 탭 이름이 바뀌면 COURSE_SHEET 만 고치면 됨
const LEARN = {
  FORM_ID: '1u8MrJeVfzCli_wyt-m8-G07uTYDoEkyxDkKvMmc1VTY',
  INFO_ID: '1_mRID4mwFypGU8pSFMZcwf35NDqjpTLuUUoe2a-mPvc',
  RESP_SHEET: 'Form Responses 1',
  COURSE_SHEET: '2026년하반기어르신배움터강좌정보',
  BACKUP_SHEET: '★접수변경_백업대장'
};

// 셔틀버스 (GitHub Pages + Firebase). 운행 현황은 승객 화면과 같은 공개 경로(publicLiveStatus)를 화면에서 바로 읽음
const SHUTTLE = {
  FIREBASE_URL: 'https://gjcwbus-default-rtdb.asia-southeast1.firebasedatabase.app',
  MAP_URL: 'https://ds5ezp.github.io/geoje-shuttle/',
  ADMIN_URL: 'https://ds5ezp.github.io/geoje-shuttle/admin',
  SHEET_ID: '1QlfkQgzaIqB8gRSkFgQowxXV9pQU507050R2hv7CTyw'
};

// 직원 목록: Workspace 디렉터리에서 가져옴 (Apps Script 고급 서비스 AdminDirectory 필요)
const STAFF = {
  DOMAIN: 'geojecwc.kr',
  TEAM_GROUP: 'serviceteam@gjcw.or.kr',
  TEAM_NAME: '복지사업팀'
};

const SLIDE_TYPES = ['IMAGE', 'PROGRAM', 'VIDEO', 'FULLSCREEN', 'SLIDES'];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const LOG_SHEET_NAME = '대시보드변경기록';

// =================================================================
// 2. 진입점 / 접근 권한
// =================================================================

function doGet(e) {
  const email = currentUser_();
  if (!isAllowed_(email)) {
    // 이메일이 비어 있으면 구글이 접속자 계정을 알려주지 않은 경우 (배포 액세스 설정 또는 여러 계정 로그인 문제)
    const reason = email
      ? '<p><b>' + escapeHtml_(email) + '</b> 계정은 허용 목록(ALLOWED_EMAILS)에 없습니다.</p>'
      : '<p>접속한 계정을 확인할 수 없습니다.</p>' +
        '<ul style="display:inline-block;text-align:left;line-height:1.8">' +
        '<li>배포 설정의 액세스 권한이 <b>geojecwc.kr 내 모든 사용자</b>인지 확인해 주세요. (\'모든 사용자\'이면 계정을 알 수 없습니다)</li>' +
        '<li>브라우저에 여러 구글 계정이 로그인되어 있으면 시크릿 창에서 복지관 계정 하나로만 로그인해 열어 보세요.</li></ul>';
    return HtmlService.createHtmlOutput(
      include('Style') +
      '<div style="max-width:560px;margin:80px auto;padding:32px;background:#fff;border-radius:24px;text-align:center;line-height:1.7">' +
      '<h4>접근 권한이 없습니다</h4>' + reason + '</div>'
    ).setTitle('통합 관리 대시보드');
  }
  // 시설기사용 휴대폰 입력 페이지 (?page=repair)
  if (e && e.parameter && e.parameter.page === 'repair') {
    return HtmlService.createTemplateFromFile('Repair').evaluate()
      .setTitle('시설 보수 기록')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  // Index.html 안의 <?!= include('Style'); ?> 로 공통 스타일(Style.html)을 넣기 위해 템플릿으로 엶
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('복지관 통합 관리 대시보드')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

// 다른 HTML 파일 내용을 그대로 끼워 넣음 (공통 스타일, 이후 단계의 공통 조각용)
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function currentUser_() {
  try {
    return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  } catch (e) {
    return '';
  }
}

function isAllowed_(email) {
  if (!email) return false;
  const raw = PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '';
  const list = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (owner) list.push(owner);
  if (list.indexOf(email) !== -1) return true;
  // 복지사업팀 그룹 회원이면 자동으로 허용 (그룹에 추가하면 바로 로그인 가능)
  return teamEmails_().indexOf(email) !== -1;
}

function requireUser_() {
  const email = currentUser_();
  if (!isAllowed_(email)) throw new Error('접근 권한이 없습니다. (' + (email || '로그인 정보 없음') + ')');
  return email;
}

// 행 추가/삭제처럼 행 번호가 바뀌는 작업만 잠금 (한 칸 덮어쓰기는 잠금 없이 처리)
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('다른 사람이 저장 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    const result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

function getBootstrap() {
  const email = requireUser_();
  const folderList = defs => Object.keys(defs).map(key => {
    const f = defs[key];
    return {
      key: key, name: f.name, note: f.note, images: f.images, videos: f.videos,
      perRoom: !!f.perRoom, keyword: !!f.keyword, url: 'https://drive.google.com/drive/folders/' + f.id
    };
  });
  return {
    user: email,
    profile: userProfile_(email),
    appUrl: ScriptApp.getService().getUrl(),
    lobby: {
      displayUrl: LOBBY.DISPLAY_URL,
      sheetUrl: 'https://docs.google.com/spreadsheets/d/' + LOBBY.SHEET_ID + '/edit',
      folders: folderList(LOBBY_FOLDERS),
      slideTypes: SLIDE_TYPES
    },
    rooms: {
      displayUrl: ROOM.DISPLAY_URL,
      sheetUrl: 'https://docs.google.com/spreadsheets/d/' + ROOM.SHEET_ID + '/edit',
      folders: folderList(ROOM_FOLDERS),
      types: ROOM.TYPES
    },
    truck: {
      appUrl: TRUCK.APP_URL,
      sheetUrl: TRUCK.SHEET_ID ? 'https://docs.google.com/spreadsheets/d/' + TRUCK.SHEET_ID + '/edit' : ''
    },
    learn: {
      formUrl: 'https://docs.google.com/spreadsheets/d/' + LEARN.FORM_ID + '/edit',
      infoUrl: 'https://docs.google.com/spreadsheets/d/' + LEARN.INFO_ID + '/edit'
    },
    shuttle: {
      firebaseUrl: SHUTTLE.FIREBASE_URL,
      mapUrl: SHUTTLE.MAP_URL,
      adminUrl: SHUTTLE.ADMIN_URL,
      sheetUrl: 'https://docs.google.com/spreadsheets/d/' + SHUTTLE.SHEET_ID + '/edit'
    }
  };
}

// =================================================================
// 3. 공통 도구
// =================================================================

function tz_() {
  return Session.getScriptTimeZone() || 'Asia/Seoul';
}

function fmt_(date, pattern) {
  return Utilities.formatDate(date, tz_(), pattern);
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function lobbySs_() {
  return SpreadsheetApp.openById(LOBBY.SHEET_ID);
}

function lobbySheet_(name) {
  const sheet = lobbySs_().getSheetByName(name);
  if (!sheet) throw new Error("로비 사이니지 시트에 '" + name + "' 탭이 없습니다.");
  return sheet;
}

// 저장 직전에 해당 행이 화면에서 본 행과 같은지 확인 (다른 사람이 먼저 지우거나 바꾼 경우 방지)
function checkRow_(sheet, row, col, expected) {
  if (!row || row < 2 || row > sheet.getLastRow()) {
    throw new Error('대상 행을 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.');
  }
  const actual = String(sheet.getRange(row, col).getDisplayValue()).trim();
  if (expected != null && actual !== String(expected).trim()) {
    throw new Error('그 사이에 내용이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.');
  }
}

function log_(action, detail) {
  try {
    const ss = lobbySs_();
    let sheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
      sheet.appendRow(['일시', '사용자', '작업', '내용']);
    }
    sheet.appendRow([new Date(), currentUser_(), action, detail]);
  } catch (e) {
    console.error('변경기록 저장 실패: ' + e);
  }
}

// 로비 사이니지 checkWelcomeMode()와 같은 방식으로 날짜 문자열을 yyyy-MM-dd로 맞춤
function normalizeDate_(value) {
  let s = String(value || '').trim().replace(/[\.\/]/g, '-').replace(/\s+/g, '');
  if (s.endsWith('-')) s = s.slice(0, -1);
  const parts = s.split('-');
  if (parts.length === 3) s = parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
  return s;
}

function toMinutes_(timeStr) {
  const p = String(timeStr || '').trim().split(':');
  if (p.length < 2) return NaN;
  return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function validDate_(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function validTime_(s) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// =================================================================
// 4. 현황
// =================================================================

function getLobbyStatus() {
  requireUser_();
  const now = new Date();
  const today = fmt_(now, 'yyyy-MM-dd');
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const settings = readSettings_();
  const visits = readVisits_();
  const todayVisits = visits.filter(v => v.date === today);
  const activeVisit = todayVisits.find(v => v.use === 'Y' && nowMin >= toMinutes_(v.start) && nowMin <= toMinutes_(v.end)) || null;
  const upcomingVisits = visits
    .filter(v => v.use === 'Y' && v.date >= today)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .slice(0, 5);

  const folders = Object.keys(LOBBY_FOLDERS).map(key => {
    const files = listFiles_(key);
    const count = { active: 0, scheduled: 0, expired: 0, hidden: 0 };
    files.forEach(f => {
      if (!f.playable) count.hidden++;
      else count[f.status === 'always' ? 'active' : f.status]++;
    });
    return { key: key, name: LOBBY_FOLDERS[key].name, total: files.length, count: count };
  });

  const slideCount = readSlides_().length;
  const welcomeFolder = folders.find(f => f.key === 'welcome');

  return {
    checkedAt: fmt_(now, 'yyyy-MM-dd HH:mm'),
    emergency: settings.emergency,
    emergencyMsg: settings.emergencyMsg,
    hours: settings.hours,
    activeVisit: activeVisit,
    welcomeImagesActive: welcomeFolder ? welcomeFolder.count.active : 0,
    todayVisits: todayVisits,
    upcomingVisits: upcomingVisits,
    folders: folders,
    slideCount: slideCount
  };
}

// =================================================================
// 5. 운영설정
// =================================================================

function readSettings_() {
  const sheet = lobbySheet_('운영설정');
  const lastRow = Math.max(sheet.getLastRow(), 6);
  const values = sheet.getRange(1, 1, lastRow, 3).getDisplayValues();
  const rows = values.map((r, i) => ({ row: i + 1, key: r[0], value: r[1], note: r[2] })).slice(1);
  return {
    emergency: String(sheet.getRange(LOBBY.CELL_EMERGENCY).getDisplayValue()).trim().toUpperCase() === 'ON',
    emergencyMsg: sheet.getRange(LOBBY.CELL_EMERGENCY_MSG).getDisplayValue(),
    hours: sheet.getRange(LOBBY.CELL_HOURS).getDisplayValue(),
    pressCount: pressCountFrom_(rows),
    rows: rows
  };
}

// TV 아래쪽 '복지관 언론보도'에 보여줄 최근 기사 수
// 로비 사이니지 getPressCount()가 운영설정 A열의 이 이름으로 찾음 (없으면 4, 0이면 안 보임)
const PRESS_COUNT_LABEL = '언론보도 표시 개수';
const PRESS_COUNT_DEFAULT = 4;

function pressCountFrom_(rows) {
  const r = rows.find(x => String(x.key).trim() === PRESS_COUNT_LABEL);
  const n = r ? parseInt(r.value, 10) : NaN;
  return isNaN(n) || n < 0 ? PRESS_COUNT_DEFAULT : Math.min(n, 20);
}

function savePressCount(count) {
  requireUser_();
  const n = Number(count);
  if (!(Number.isInteger(n) && n >= 0 && n <= 20)) throw new Error('언론보도 개수는 0~20 사이로 입력해 주세요.');
  return withLock_(() => {
    const sheet = lobbySheet_('운영설정');
    const labels = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getDisplayValues();
    const idx = labels.findIndex(r => String(r[0]).trim() === PRESS_COUNT_LABEL);
    if (idx === -1) {
      sheet.appendRow([PRESS_COUNT_LABEL, n, 'TV 아래쪽 언론보도에 보여줄 최근 기사 수 (0이면 안 보임)']);
    } else {
      sheet.getRange(idx + 1, 2).setValue(n);
    }
    log_('언론보도 표시 개수', String(n));
    return readNews_();
  });
}

function getLobbySettings() {
  requireUser_();
  return readSettings_();
}

function saveEmergency(isOn, message) {
  requireUser_();
  const sheet = lobbySheet_('운영설정');
  sheet.getRange(LOBBY.CELL_EMERGENCY).setValue(isOn ? 'ON' : 'OFF');
  if (message != null) sheet.getRange(LOBBY.CELL_EMERGENCY_MSG).setValue(String(message).trim());
  SpreadsheetApp.flush();
  log_('비상모드', (isOn ? 'ON' : 'OFF') + ' / ' + String(message || ''));
  return readSettings_();
}

function saveSettingValue(row, value) {
  requireUser_();
  row = Number(row);
  const sheet = lobbySheet_('운영설정');
  if (!row || row < 2 || row > Math.max(sheet.getLastRow(), 6)) throw new Error('잘못된 설정 행입니다.');
  if (row === 3) throw new Error('비상모드는 위의 비상모드 스위치로 바꿔 주세요.');
  sheet.getRange(row, 2).setNumberFormat('@').setValue(String(value == null ? '' : value).trim());
  SpreadsheetApp.flush();
  log_('운영설정', sheet.getRange(row, 1).getDisplayValue() + ' = ' + value);
  return readSettings_();
}

// =================================================================
// 6. 기관방문 일정
// =================================================================

function readVisits_() {
  const sheet = lobbySheet_('기관방문');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 4).getDisplayValues()
    .map((r, i) => ({
      row: i + 2,
      raw: String(r[0]).trim(),
      date: normalizeDate_(r[0]),
      start: String(r[1]).trim().slice(0, 5),
      end: String(r[2]).trim().slice(0, 5),
      use: String(r[3] || 'Y').trim().toUpperCase() === 'Y' ? 'Y' : 'N'
    }))
    .filter(v => v.raw !== '');
}

function getVisits() {
  requireUser_();
  return readVisits_().sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
}

function saveVisit(visit) {
  requireUser_();
  const date = String(visit.date || '').trim();
  const start = String(visit.start || '').trim();
  const end = String(visit.end || '').trim();
  const use = visit.use === 'N' ? 'N' : 'Y';
  if (!validDate_(date)) throw new Error('날짜를 선택해 주세요.');
  if (!validTime_(start) || !validTime_(end)) throw new Error('시작/종료 시간을 선택해 주세요.');
  if (toMinutes_(start) >= toMinutes_(end)) throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');

  return withLock_(() => {
    const sheet = lobbySheet_('기관방문');
    const rowValues = [[date, start, end, use]];
    let row;
    if (visit.row) {
      row = Number(visit.row);
      checkRow_(sheet, row, 1, visit.raw);
    } else {
      row = sheet.getLastRow() + 1;
    }
    // 시트가 날짜/시간을 자동 변환하지 않도록 텍스트로 저장 (로비 사이니지는 표시값을 읽음)
    sheet.getRange(row, 1, 1, 4).setNumberFormat('@').setValues(rowValues);
    log_(visit.row ? '기관방문 수정' : '기관방문 추가', [date, start, end, use].join(' '));
    return getVisits();
  });
}

function deleteVisit(row, raw) {
  requireUser_();
  return withLock_(() => {
    const sheet = lobbySheet_('기관방문');
    row = Number(row);
    checkRow_(sheet, row, 1, raw);
    const values = sheet.getRange(row, 1, 1, 4).getDisplayValues()[0];
    sheet.deleteRow(row);
    log_('기관방문 삭제', values.join(' '));
    return getVisits();
  });
}

// =================================================================
// 7. 이미지 / 영상 폴더
// =================================================================

const PERIOD_12 = /(\d{12})-(\d{12})/;
const PERIOD_8 = /(\d{8})-(\d{8})/;

function folderDef_(key) {
  const f = LOBBY_FOLDERS[key] || ROOM_FOLDERS[key];
  if (!f) throw new Error('알 수 없는 폴더입니다.');
  return f;
}

// 각 실 사이니지 isMatchingRoomFile()과 같은 규칙: '실이름', '실이름-…', '실이름_…'
function isRoomFile_(name, room) {
  const base = splitExt_(name).base.trim();
  const r = String(room).trim();
  return base === r || base.indexOf(r + '-') === 0 || base.indexOf(r + '_') === 0;
}

// 로비 사이니지 isMediaActive()와 같은 규칙으로 파일 이름의 노출 기간을 해석
function parsePeriod_(name) {
  const toDate = (s, endOfDay) => {
    const y = +s.substr(0, 4), m = +s.substr(4, 2) - 1, d = +s.substr(6, 2);
    if (s.length === 12) return new Date(y, m, d, +s.substr(8, 2), +s.substr(10, 2), endOfDay ? 59 : 0);
    return endOfDay ? new Date(y, m, d, 23, 59, 59) : new Date(y, m, d, 0, 0, 0);
  };
  let m = String(name).match(PERIOD_12);
  if (m) return { start: toDate(m[1], false), end: toDate(m[2], true), hasTime: true };
  m = String(name).match(PERIOD_8);
  if (m) return { start: toDate(m[1], false), end: toDate(m[2], true), hasTime: false };
  return null;
}

function stripPeriod_(base) {
  return String(base)
    .replace(/[_\s-]*\d{12}-\d{12}/, '')
    .replace(/[_\s-]*\d{8}-\d{8}/, '')
    .trim() || '이미지';
}

function splitExt_(name) {
  const i = name.lastIndexOf('.');
  if (i <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

// period: null(상시) 또는 { start:'yyyy-MM-dd', end:'yyyy-MM-dd', startTime:'HH:mm'|'', endTime:'HH:mm'|'' }
function periodToken_(period) {
  if (!period) return '';
  const start = String(period.start || '').trim();
  const end = String(period.end || '').trim();
  if (!validDate_(start) || !validDate_(end)) throw new Error('노출 시작일과 종료일을 선택해 주세요.');
  const st = String(period.startTime || '').trim();
  const et = String(period.endTime || '').trim();
  const useTime = st || et;
  if (useTime && (!validTime_(st) || !validTime_(et))) throw new Error('시간을 쓰려면 시작/종료 시간을 모두 선택해 주세요.');
  const s = start.replace(/-/g, '') + (useTime ? st.replace(':', '') : '');
  const e = end.replace(/-/g, '') + (useTime ? et.replace(':', '') : '');
  if (s > e) throw new Error('종료가 시작보다 빠릅니다.');
  return s + '-' + e;
}

function buildName_(originalName, period) {
  const parts = splitExt_(originalName);
  const base = stripPeriod_(parts.base).replace(/[\\\/:*?"<>|]/g, '_');
  const token = periodToken_(period);
  return base + (token ? '_' + token : '') + parts.ext;
}

function fileInfo_(file, folder) {
  const name = file.getName();
  const mime = file.getMimeType();
  const isVideo = mime.indexOf('video/') === 0;
  const p = parsePeriod_(name);
  const now = new Date();
  let status = 'always';
  if (p) status = now < p.start ? 'scheduled' : (now > p.end ? 'expired' : 'active');
  return {
    id: file.getId(),
    name: name,
    title: stripPeriod_(splitExt_(name).base),
    isVideo: isVideo,
    playable: isVideo ? folder.videos : folder.images,
    size: file.getSize(),
    updated: fmt_(file.getLastUpdated(), 'yyyy-MM-dd HH:mm'),
    status: status,
    period: p ? {
      start: fmt_(p.start, 'yyyy-MM-dd'), end: fmt_(p.end, 'yyyy-MM-dd'),
      startTime: p.hasTime ? fmt_(p.start, 'HH:mm') : '', endTime: p.hasTime ? fmt_(p.end, 'HH:mm') : ''
    } : null,
    thumb: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400',
    url: file.getUrl()
  };
}

// room: 실 전용 폴더(perRoom)에서 그 실 파일만 보고 싶을 때
function listFiles_(key, room) {
  const folder = folderDef_(key);
  const it = DriveApp.getFolderById(folder.id).getFiles();
  const out = [];
  while (it.hasNext()) {
    const file = it.next();
    const mime = file.getMimeType();
    if (mime.indexOf('image/') !== 0 && mime.indexOf('video/') !== 0) continue;
    if (folder.perRoom && room && !isRoomFile_(file.getName(), room)) continue;
    out.push(fileInfo_(file, folder));
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

function getFolderFiles(key, room) {
  requireUser_();
  return listFiles_(key, room);
}

// 다른 폴더의 파일을 실수로 건드리지 않도록 폴더 소속 확인
function fileInFolder_(fileId, key) {
  const folder = folderDef_(key);
  const file = DriveApp.getFileById(fileId);
  const parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folder.id) return file;
  }
  throw new Error('이 폴더의 파일이 아닙니다.');
}

// payload: { name, mime, data(base64), period, room(실 전용 폴더), keyword(프로그램 이미지) }
function uploadFile(key, payload) {
  requireUser_();
  const folder = folderDef_(key);
  const mime = String(payload.mime || '');
  const isVideo = mime.indexOf('video/') === 0;
  if (mime.indexOf('image/') !== 0 && !isVideo) throw new Error('이미지나 영상 파일만 올릴 수 있습니다.');
  if (isVideo && !folder.videos) throw new Error("'" + folder.name + "' 폴더에서는 영상이 나오지 않습니다.");
  const bytes = Utilities.base64Decode(payload.data);
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('파일이 너무 큽니다. 20MB 이하로 올려 주세요.');

  let original = String(payload.name || 'image');
  const ext = splitExt_(original).ext;
  if (folder.perRoom) {
    const room = validRoomName_(payload.room);
    if (!isRoomFile_(original, room)) original = room + '_' + original;
  }
  if (folder.keyword) {
    // 각 실 사이니지는 기간을 뺀 파일 이름 전체가 수업 제목에 들어 있는지 봄 → 이름을 키워드 그대로
    const keyword = String(payload.keyword || '').trim();
    if (!keyword) throw new Error('수업 제목에 들어가는 키워드를 입력해 주세요.');
    original = keyword + ext;
  }

  const name = buildName_(original, payload.period || null);
  const file = DriveApp.getFolderById(folder.id).createFile(Utilities.newBlob(bytes, mime, name));
  log_('파일 업로드', folder.name + ' / ' + name);
  return fileInfo_(file, folder);
}

function setFilePeriod(key, fileId, period) {
  requireUser_();
  const folder = folderDef_(key);
  const file = fileInFolder_(fileId, key);
  const before = file.getName();
  const after = buildName_(before, period || null);
  file.setName(after);
  log_('노출기간 변경', folder.name + ' / ' + before + ' → ' + after);
  return fileInfo_(file, folder);
}

// 휴지통으로 이동 (구글 드라이브 휴지통에서 30일 동안 복구 가능)
function trashFile(key, fileId) {
  requireUser_();
  const folder = folderDef_(key);
  const file = fileInFolder_(fileId, key);
  const name = file.getName();
  file.setTrashed(true);
  log_('파일 휴지통 이동', folder.name + ' / ' + name);
  return true;
}

// 여러 파일을 한 번에 휴지통으로 이동, 옮긴 개수를 돌려줌
function trashFiles(key, fileIds) {
  requireUser_();
  const folder = folderDef_(key);
  if (!Array.isArray(fileIds) || !fileIds.length) return 0;
  const names = [];
  fileIds.forEach(id => {
    const file = fileInFolder_(id, key);
    names.push(file.getName());
    file.setTrashed(true);
  });
  log_('파일 휴지통 이동', folder.name + ' / ' + names.length + '개: ' + names.join(', '));
  return names.length;
}

// =================================================================
// 7-1. 복지관 공지사항 (로비 TV 아래쪽에 나오는 목록과 같음)
// 홈페이지가 앱스 스크립트 요청을 403으로 막아서, 로비 시트 '홈페이지RSS' 탭의
// IMPORTFEED 수식이 가져온 결과를 읽음 (로비 사이니지 readFeedSheet()와 같은 방식)
// =================================================================

const NOTICE_FEED_SHEET = '홈페이지RSS';

function getLobbyNotices() {
  requireUser_();
  const sheet = lobbySs_().getSheetByName(NOTICE_FEED_SHEET);
  if (!sheet) throw new Error("로비 시트에 '" + NOTICE_FEED_SHEET + "' 탭이 없습니다.");
  if (sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const head = values[0].map(h => String(h).trim().toLowerCase());
  const col = (keys, fallback) => {
    const i = head.findIndex(h => keys.some(k => h.indexOf(k) !== -1));
    return i === -1 ? fallback : i;
  };
  const cTitle = col(['title', '제목'], -1);
  if (cTitle === -1) {
    throw new Error("'" + NOTICE_FEED_SHEET + "' 탭 1행에 제목(Title) 머리글이 없습니다. 로비 사이니지 편집기에서 setupHomepageFeedSheets를 실행해 주세요.");
  }
  const cUrl = col(['url', 'link', '링크'], -1);
  const cDate = col(['date', '날짜'], -1);

  // 로비 사이니지와 같이 최근 6건
  return values.slice(1)
    .filter(r => { const t = String(r[cTitle] || '').trim(); return t !== '' && t.charAt(0) !== '#'; })
    .slice(0, 6)
    .map(r => {
      const link = cUrl === -1 ? '' : String(r[cUrl] || '').trim();
      const m = link.match(/uid=(\d+)/) || link.match(/kboard_content_redirect=(\d+)/);
      const rawDate = cDate === -1 ? '' : r[cDate];
      let date = '';
      const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
      if (rawDate !== '' && !isNaN(d.getTime())) date = fmt_(d, 'yyyy.MM.dd');
      return {
        title: String(r[cTitle]).trim(),
        date: date,
        link: m ? 'http://gjcw.or.kr/sub07-1/?uid=' + m[1] + '&mod=document' : link
      };
    });
}

// =================================================================
// 8. 슬라이드설정
// =================================================================

function readSlides_() {
  const sheet = lobbySheet_('슬라이드설정');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 6).getDisplayValues()
    .map((r, i) => ({
      row: i + 2,
      order: r[0],
      type: String(r[1] || 'IMAGE').trim().toUpperCase(),
      path: String(r[2]).trim(),
      seconds: r[3],
      qr: String(r[4]).trim(),
      priority: String(r[5] || 'N').trim().toUpperCase() === 'Y' ? 'Y' : 'N'
    }))
    .filter(s => s.path !== '');
}

function getSlides() {
  requireUser_();
  return readSlides_();
}

function saveSlide(slide) {
  requireUser_();
  const type = String(slide.type || 'IMAGE').toUpperCase();
  const path = String(slide.path || '').trim();
  const seconds = Number(slide.seconds || 6);
  if (SLIDE_TYPES.indexOf(type) === -1) throw new Error('알 수 없는 타입입니다.');
  if (!path) throw new Error('콘텐츠 주소(URL 또는 파일 ID)를 입력해 주세요.');
  if (!(seconds > 0 && seconds <= 600)) throw new Error('노출 시간은 1~600초 사이로 입력해 주세요.');

  return withLock_(() => {
    const sheet = lobbySheet_('슬라이드설정');
    let row;
    if (slide.row) {
      row = Number(slide.row);
      checkRow_(sheet, row, 3, slide.originalPath);
    } else {
      row = sheet.getLastRow() + 1;
    }
    const order = slide.order !== '' && slide.order != null ? slide.order : row - 1;
    sheet.getRange(row, 1, 1, 6).setValues([[order, type, path, seconds, String(slide.qr || '').trim(), slide.priority === 'Y' ? 'Y' : 'N']]);
    log_(slide.row ? '슬라이드 수정' : '슬라이드 추가', type + ' / ' + path);
    return readSlides_();
  });
}

function deleteSlide(row, originalPath) {
  requireUser_();
  return withLock_(() => {
    const sheet = lobbySheet_('슬라이드설정');
    row = Number(row);
    checkRow_(sheet, row, 3, originalPath);
    sheet.deleteRow(row);
    log_('슬라이드 삭제', originalPath);
    return readSlides_();
  });
}

// =================================================================
// 9. 언론보도 (로비 사이니지가 자동 수집, 최근 '언론보도 표시 개수'건이 TV 아래쪽에 나옴)
// =================================================================

// { count: 표시 개수, items: 최신순 기사 목록 }
function readNews_() {
  const count = readSettings_().pressCount;
  const sheet = lobbySheet_('언론보도');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { count: count, items: [] };
  const rows = sheet.getRange(2, 1, lastRow - 1, 6).getDisplayValues()
    .map((r, i) => ({ row: i + 2, source: r[0], title: r[1], summary: r[2], date: r[3], link: r[4], thumb: r[5] }))
    .filter(n => String(n.title).trim() !== '');
  // 로비 사이니지는 시트 아래쪽부터 표시 개수만큼 보여줌
  rows.forEach((n, i) => { n.onScreen = count > 0 && i >= rows.length - count; });
  return { count: count, items: rows.reverse() };
}

function getNews() {
  requireUser_();
  return readNews_();
}

function deleteNews(row, link) {
  requireUser_();
  return withLock_(() => {
    const sheet = lobbySheet_('언론보도');
    row = Number(row);
    checkRow_(sheet, row, 5, link);
    const title = sheet.getRange(row, 2).getDisplayValue();
    sheet.deleteRow(row);
    log_('언론보도 삭제', title);
    return readNews_();
  });
}

// =================================================================
// 10. 변경기록
// =================================================================

function getChangeLog() {
  requireUser_();
  const sheet = lobbySs_().getSheetByName(LOG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const lastRow = sheet.getLastRow();
  const start = Math.max(2, lastRow - 49);
  return sheet.getRange(start, 1, lastRow - start + 1, 4).getValues()
    .map(r => ({ at: r[0] instanceof Date ? fmt_(r[0], 'yyyy-MM-dd HH:mm') : String(r[0]), user: r[1], action: r[2], detail: r[3] }))
    .reverse();
}

// =================================================================
// 11. 각 실 사이니지 (2단계)
// 실 목록·멘트·프로그램 이미지는 각 실 시트, 이미지는 드라이브 폴더(ROOM_FOLDERS)
// =================================================================

function roomSs_() {
  return SpreadsheetApp.openById(ROOM.SHEET_ID);
}

function roomSheet_(name) {
  const sheet = roomSs_().getSheetByName(name);
  if (!sheet) throw new Error("각 실 사이니지 시트에 '" + name + "' 탭이 없습니다.");
  return sheet;
}

// 각 실 사이니지는 공지(A1)·긴급(B1='긴급')·긴급문구(C1)를 '공지사항' 탭에서 읽음 (없으면 첫 번째 탭)
function roomNoticeSheet_() {
  const ss = roomSs_();
  return ss.getSheetByName('공지사항') || ss.getSheets()[0];
}

function validRoomName_(room) {
  const r = String(room || '').trim();
  if (!r) throw new Error('실 이름을 선택해 주세요.');
  if (/[\[\]\\\/:*?"<>|]/.test(r)) throw new Error('실 이름에는 [ ] / : * ? " < > | 를 쓸 수 없습니다.');
  return r;
}

// 시트 탭별 표 (첫 칸이 이름/키워드)
const ROOM_TABLES = {
  rooms: { sheet: '룸별설정', cols: 3, label: '실', unique: true },
  ments: { sheet: '프로그램실별 맨트', cols: 2, label: '프로그램 멘트', unique: true },
  progImages: { sheet: '프로그램이미지', cols: 2, label: '프로그램 이미지 링크', unique: false }
};

function roomTableDef_(name) {
  const t = ROOM_TABLES[name];
  if (!t) throw new Error('알 수 없는 표입니다.');
  return t;
}

function readRoomTable_(name) {
  const t = roomTableDef_(name);
  const sheet = roomSheet_(t.sheet);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, t.cols).getDisplayValues()
    .map((r, i) => ({ row: i + 2, values: r.map(v => String(v).trim()) }))
    .filter(x => x.values[0] !== '');
}

function getRoomTable(name) {
  requireUser_();
  return readRoomTable_(name);
}

// item: { row(수정할 때), original(수정 전 첫 칸), values: [...] }
function saveRoomTableRow(name, item) {
  requireUser_();
  const t = roomTableDef_(name);
  const values = (item.values || []).slice(0, t.cols).map(v => String(v == null ? '' : v).trim());
  while (values.length < t.cols) values.push('');
  if (!values[0]) throw new Error('첫 칸을 입력해 주세요.');
  if (name === 'rooms') {
    validRoomName_(values[0]);
    if (ROOM.TYPES.indexOf(values[1]) === -1) values[1] = ROOM.TYPES[0];
  } else if (!values[1]) {
    throw new Error('두 번째 칸도 입력해 주세요.');
  }

  return withLock_(() => {
    const sheet = roomSheet_(t.sheet);
    if (t.unique && readRoomTable_(name).some(x => x.values[0] === values[0] && x.row !== Number(item.row))) {
      throw new Error("'" + values[0] + "' 은(는) 이미 있습니다.");
    }
    let row;
    if (item.row) {
      row = Number(item.row);
      checkRow_(sheet, row, 1, item.original);
    } else {
      row = sheet.getLastRow() + 1;
    }
    sheet.getRange(row, 1, 1, t.cols).setValues([values]);
    log_('각 실 ' + t.label + (item.row ? ' 수정' : ' 추가'), values.join(' / '));
    return readRoomTable_(name);
  });
}

function deleteRoomTableRow(name, row, original) {
  requireUser_();
  const t = roomTableDef_(name);
  return withLock_(() => {
    const sheet = roomSheet_(t.sheet);
    row = Number(row);
    checkRow_(sheet, row, 1, original);
    sheet.deleteRow(row);
    log_('각 실 ' + t.label + ' 삭제', original);
    return readRoomTable_(name);
  });
}

// 시트의 시간 표시값(예: 8:30:00)을 HH:mm 으로
function toHHmm_(value, fallback) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? m[1].padStart(2, '0') + ':' + m[2] : fallback;
}

function readRoomNotice_() {
  const sheet = roomNoticeSheet_();
  const v = sheet.getRange(1, 1, 1, 3).getDisplayValues()[0];
  const setting = roomSs_().getSheetByName('설정');
  return {
    sheetName: sheet.getName(),
    notice: v[0],
    emergency: String(v[1]).trim() === '긴급',
    emergencyText: v[2],
    start: setting ? toHHmm_(setting.getRange('A1').getDisplayValue(), '09:00') : '09:00',
    end: setting ? toHHmm_(setting.getRange('B1').getDisplayValue(), '18:00') : '18:00'
  };
}

function getRoomNotice() {
  requireUser_();
  return readRoomNotice_();
}

function saveRoomNotice(text) {
  requireUser_();
  roomNoticeSheet_().getRange('A1').setValue(String(text || '').trim());
  SpreadsheetApp.flush();
  log_('각 실 공지', String(text || ''));
  return readRoomNotice_();
}

function saveRoomEmergency(isOn, text) {
  requireUser_();
  const sheet = roomNoticeSheet_();
  sheet.getRange('B1').setValue(isOn ? '긴급' : '');
  if (text != null) sheet.getRange('C1').setValue(String(text).trim());
  SpreadsheetApp.flush();
  log_('각 실 긴급모드', (isOn ? 'ON' : 'OFF') + ' / ' + String(text || ''));
  return readRoomNotice_();
}

function saveRoomHours(start, end) {
  requireUser_();
  if (!validTime_(start) || !validTime_(end)) throw new Error('시작/종료 시간을 선택해 주세요.');
  if (toMinutes_(start) >= toMinutes_(end)) throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');
  const sheet = roomSheet_('설정');
  // 각 실 사이니지는 표시값을 읽으므로 글자로 저장
  sheet.getRange('A1:B1').setNumberFormat('@').setValues([[start, end]]);
  SpreadsheetApp.flush();
  log_('각 실 운영시간', start + ' - ' + end);
  return readRoomNotice_();
}

// =================================================================
// 12. 공유트럭 (3단계) - 예약 현황 요약 (읽기 전용)
// Reservations 열: 0 예약번호, 2 기관, 3 담당자, 4 연락처, 5 운전자, 10 시작, 11 종료, 12 목적, 14 목적지, 20 상태
// =================================================================

const TRUCK_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function truckTime_(d) {
  return d ? fmt_(d, 'MM/dd') + '(' + TRUCK_DAYS[d.getDay()] + ') ' + fmt_(d, 'HH:mm') : '';
}

function getTruckSummary() {
  requireUser_();
  if (!TRUCK.SHEET_ID) {
    return { ready: false, message: '대시보드 Code.gs 위쪽 TRUCK.SHEET_ID 에 공유트럭 구글 시트의 ID를 넣어 주세요.' };
  }
  let ss;
  try {
    ss = SpreadsheetApp.openById(TRUCK.SHEET_ID);
  } catch (e) {
    return { ready: false, message: '공유트럭 시트를 열 수 없습니다. sharetruck 계정에서 시트를 ' + Session.getEffectiveUser().getEmail() + ' 에 공유해 주세요.' };
  }
  const sheet = ss.getSheetByName('Reservations');
  if (!sheet) return { ready: false, message: "공유트럭 시트에 'Reservations' 탭이 없습니다." };

  const toDate = v => { const d = v instanceof Date ? v : new Date(v); return isNaN(d.getTime()) ? null : d; };
  const now = new Date();
  const items = sheet.getDataRange().getValues().slice(1)
    .filter(r => String(r[0] || '').trim() !== '')
    .map(r => ({
      id: String(r[0]), agency: String(r[2] || ''), manager: String(r[3] || ''), phone: String(r[4] || ''),
      start: toDate(r[10]), end: toDate(r[11]), purpose: String(r[12] || ''), destination: String(r[14] || ''),
      status: String(r[20] || '').trim() || '접수대기'
    }));

  const used = ['승인', '반납검토대기', '반납완료'];
  const counts = {
    pending: items.filter(x => x.status === '접수대기').length,
    returnReview: items.filter(x => x.status === '반납검토대기').length,
    inUse: items.filter(x => x.status === '승인' && x.start && x.end && x.start <= now && now <= x.end).length,
    overdue: items.filter(x => x.status === '승인' && x.end && x.end < now).length,
    thisMonth: items.filter(x => used.indexOf(x.status) !== -1 && x.start &&
      x.start.getFullYear() === now.getFullYear() && x.start.getMonth() === now.getMonth()).length
  };

  // 처리해야 할 것(접수대기·반납검토대기·반납지연)과 앞으로의 승인 예약
  const view = x => ({
    id: x.id, agency: x.agency, manager: x.manager, phone: x.phone, purpose: x.purpose, destination: x.destination,
    status: x.status === '승인' && x.end && x.end < now ? '반납지연' : x.status,
    start: truckTime_(x.start), end: truckTime_(x.end)
  });
  const todo = items.filter(x => x.status === '접수대기' || x.status === '반납검토대기' || (x.status === '승인' && x.end && x.end < now))
    .sort((a, b) => (a.start || 0) - (b.start || 0)).map(view);
  const upcoming = items.filter(x => x.status === '승인' && x.end && x.end >= now)
    .sort((a, b) => (a.start || 0) - (b.start || 0)).slice(0, 10).map(view);

  let restricted = 0;
  const agencies = ss.getSheetByName('Agencies');
  if (agencies && agencies.getLastRow() > 1) {
    restricted = agencies.getRange(2, 8, agencies.getLastRow() - 1, 1).getDisplayValues()
      .filter(r => String(r[0]).indexOf('제한') !== -1).length;
  }

  return { ready: true, checkedAt: fmt_(now, 'yyyy-MM-dd HH:mm'), counts: counts, todo: todo, upcoming: upcoming, restricted: restricted };
}

// =================================================================
// 13. 어르신 배움터 (4단계)
// 신청: FORM 시트 'Form Responses 1' (요일별 열에 '강좌표시, 강좌표시' 형태)
// 강좌: INFO 시트 강좌정보 탭 (A 표시명 '강좌명|...|수강료', B 요일, C 시작, D 종료, '정원' 열)
// 일정: INFO 시트 '환경설정' A2 접수시작, B2 마감, C2 결과발표, D2 신청 화면 주소
// 추첨 결과: FORM 시트 '결과_강좌명(15자)' 탭 (순번, 성명, 생년월일, 전화번호, 결과)
// =================================================================

function learnForm_() {
  return SpreadsheetApp.openById(LEARN.FORM_ID);
}

function learnInfo_() {
  return SpreadsheetApp.openById(LEARN.INFO_ID);
}

function learnNormName_(n) {
  return String(n || '').replace(/[\s ]+/g, '').trim();
}

function learnNormDob_(s) {
  return String(s || '').replace(/[^0-9]/g, '').slice(-6);
}

// '[월] 강좌명 | 시간 | 수강료' → '강좌명' (배움터 앱과 같은 규칙)
function learnCourseName_(raw) {
  return String(raw || '').replace(/^\[(월|화|수|목|금)\]\s*/, '').split('|')[0].trim();
}

function learnResultSheetName_(course) {
  return '결과_' + course.substring(0, 15);
}

function learnIsExempt_(benefit) {
  const b = String(benefit || '').replace(/\s+/g, '');
  return b !== '' && b.indexOf('해당없음') === -1 && b !== '일반';
}

// 이름 가운데 가리기: 홍길동 → 홍*동, 생년월일 앞 2자리, 전화 뒤 4자리 (배움터 추첨 화면과 같은 형식)
function learnMask_(a) {
  const n = String(a.name || '');
  const masked = n.length <= 2 ? n.charAt(0) + '*' : n.charAt(0) + '*'.repeat(n.length - 2) + n.slice(-1);
  const phone = String(a.phone || '').replace(/[^0-9]/g, '');
  return masked + ' (' + String(a.dob || '').slice(0, 2) + '**** / ' + phone.slice(-4) + ')';
}

function learnCourses_(info) {
  let sheet = info.getSheetByName(LEARN.COURSE_SHEET);
  if (!sheet) sheet = info.getSheets().filter(s => s.getName().indexOf('강좌정보') !== -1).pop();
  if (!sheet) throw new Error("배움터 강좌정보 탭을 찾을 수 없습니다. (" + LEARN.COURSE_SHEET + ")");
  const data = sheet.getDataRange().getDisplayValues();
  const qIdx = data[0].indexOf('정원') !== -1 ? data[0].indexOf('정원') : 4;
  return data.slice(1)
    .filter(r => String(r[0]).trim() !== '')
    .map(r => {
      const parts = String(r[0]).split('|');
      return {
        name: parts[0].trim(),
        display: String(r[0]).trim(),
        day: String(r[1] || '').replace('요일', '').trim(),
        start: String(r[2] || '').trim(),
        end: String(r[3] || '').trim(),
        quota: parseInt(r[qIdx], 10) || 20,
        fee: parseInt(String(parts[parts.length - 1] || '0').replace(/[^0-9]/g, ''), 10) || 0
      };
    });
}

// 신청자 전체를 읽어 사람별 신청 강좌 목록으로
function learnApplicants_(form) {
  const sheet = form.getSheetByName(LEARN.RESP_SHEET);
  if (!sheet) throw new Error("배움터 신청 시트에 '" + LEARN.RESP_SHEET + "' 탭이 없습니다.");
  const range = sheet.getDataRange();
  const values = range.getValues();
  const disp = range.getDisplayValues();
  const h = disp[0].map(x => String(x).trim());
  const find = test => h.findIndex(test);
  const iName = find(x => x.indexOf('성명') !== -1);
  const iDob = find(x => x.indexOf('생년월일') !== -1);
  const iGender = find(x => x.indexOf('성별') !== -1);
  const iPhone = find(x => x.indexOf('연락처') !== -1);
  const iBenefit = find(x => x.indexOf('면제') !== -1 || x.indexOf('수강료') !== -1);
  const courseCols = [];
  h.forEach((x, i) => { if (x.indexOf('요일') !== -1 && x.indexOf('면제') === -1 && x.indexOf('수강료') === -1) courseCols.push(i); });

  const list = [];
  for (let i = 1; i < disp.length; i++) {
    const r = disp[i];
    const name = iName === -1 ? '' : String(r[iName]).trim();
    if (!name) continue;
    const courses = [];
    courseCols.forEach(c => {
      String(r[c] || '').split(', ').forEach(item => {
        const cn = learnCourseName_(item);
        if (cn && courses.indexOf(cn) === -1) courses.push(cn);
      });
    });
    const rawTs = values[i][0] instanceof Date ? values[i][0] : new Date(values[i][0]);
    const ts = isNaN(rawTs.getTime()) ? null : rawTs;
    list.push({
      row: i + 1,
      ts: ts,
      date: ts ? fmt_(ts, 'yyyy-MM-dd HH:mm') : String(r[0]),
      name: name,
      dob: iDob === -1 ? '' : String(r[iDob]).trim(),
      gender: iGender === -1 ? '' : String(r[iGender]).trim(),
      phone: iPhone === -1 ? '' : String(r[iPhone]).trim(),
      benefit: iBenefit === -1 ? '' : String(r[iBenefit]).trim(),
      courses: courses
    });
  }
  return list;
}

function learnSchedule_(info) {
  const config = info.getSheetByName('환경설정');
  const at = a1 => {
    if (!config) return null;
    const v = config.getRange(a1).getValue();
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const start = at('A2'), end = at('B2'), result = at('C2');
  const now = new Date();
  let phase = '알 수 없음';
  if (start && end) phase = now < start ? '접수 전' : now <= end ? '접수 중' : (result && now >= result ? '결과 발표됨' : '접수 마감');
  const text = d => d ? fmt_(d, 'yyyy-MM-dd HH:mm') : '-';
  const input = d => d ? fmt_(d, "yyyy-MM-dd'T'HH:mm") : '';
  return {
    phase: phase,
    start: text(start), end: text(end), result: text(result),
    startInput: input(start), endInput: input(end), resultInput: input(result),
    appUrl: config ? String(config.getRange('D2').getValue()).trim() : ''
  };
}

// 강좌의 나이: 생년월일 앞 2자리 기준
function learnAgeGroup_(dob) {
  const yy = parseInt(String(dob || '').replace(/[^0-9]/g, '').substring(0, 2), 10);
  if (isNaN(yy)) return '';
  const thisYear = new Date().getFullYear();
  const age = thisYear - (yy > thisYear % 100 ? 1900 + yy : 2000 + yy);
  return age >= 90 ? '90대 이상' : age >= 80 ? '80대' : age >= 70 ? '70대' : age >= 60 ? '60대' : '60세 미만';
}

function getLearnStatus() {
  requireUser_();
  const form = learnForm_(), info = learnInfo_();
  const courses = learnCourses_(info);
  const apps = learnApplicants_(form);
  const sheetNames = form.getSheets().map(s => s.getName());

  const stat = {};
  courses.forEach(c => { stat[c.name] = { count: 0, exempt: 0 }; });
  const gender = { '남': 0, '여': 0 };
  const ages = { '60세 미만': 0, '60대': 0, '70대': 0, '80대': 0, '90대 이상': 0 };
  const benefit = {};
  const daily = {};
  const finance = { potential: 0, exemption: 0, net: 0 };
  const feeOf = {};
  courses.forEach(c => { feeOf[c.name] = c.fee; });
  let enrollment = 0;

  apps.forEach(a => {
    if (a.gender.indexOf('남') === 0) gender['남']++; else if (a.gender.indexOf('여') === 0) gender['여']++;
    const g = learnAgeGroup_(a.dob);
    if (g) ages[g]++;
    const exempt = learnIsExempt_(a.benefit);
    const b = exempt ? a.benefit : '일반';
    benefit[b] = (benefit[b] || 0) + 1;
    const day = a.ts ? fmt_(a.ts, 'yyyy-MM-dd') : '날짜 없음';
    daily[day] = (daily[day] || 0) + 1;
    a.courses.forEach(cn => {
      enrollment++;
      if (!stat[cn]) stat[cn] = { count: 0, exempt: 0, unknown: true };
      stat[cn].count++;
      const fee = feeOf[cn] || 0;
      finance.potential += fee;
      if (exempt) { stat[cn].exempt++; finance.exemption += fee; } else { finance.net += fee; }
    });
  });

  const courseRows = courses.map(c => ({
    name: c.name, day: c.day, time: c.start + (c.end ? ' ~ ' + c.end : ''), quota: c.quota, fee: c.fee,
    count: stat[c.name].count, exempt: stat[c.name].exempt,
    over: Math.max(0, stat[c.name].count - c.quota),
    lotteryDone: sheetNames.indexOf(learnResultSheetName_(c.name)) !== -1
  }));

  return {
    checkedAt: fmt_(new Date(), 'yyyy-MM-dd HH:mm'),
    schedule: learnSchedule_(info),
    actual: apps.length,
    enrollment: enrollment,
    gender: gender,
    ages: ages,
    benefit: benefit,
    daily: Object.keys(daily).sort().map(d => ({ date: d, count: daily[d] })),
    finance: finance,
    courses: courseRows
  };
}

function getLearnApplicants() {
  requireUser_();
  return learnApplicants_(learnForm_())
    .map(a => ({ row: a.row, date: a.date, name: a.name, dob: a.dob, gender: a.gender, phone: a.phone, benefit: a.benefit, courses: a.courses }))
    .reverse();
}

// 지우기 전에 배움터 앱과 같은 백업대장 탭에 그대로 옮겨 적음
function learnBackupRow_(sheet, row, type) {
  const ss = sheet.getParent();
  let backup = ss.getSheetByName(LEARN.BACKUP_SHEET);
  const lastCol = sheet.getLastColumn();
  if (!backup) {
    backup = ss.insertSheet(LEARN.BACKUP_SHEET);
    backup.appendRow(['백업일시', '변경구분'].concat(sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0]));
  }
  backup.appendRow([fmt_(new Date(), 'yyyy-MM-dd HH:mm:ss'), type].concat(sheet.getRange(row, 1, 1, lastCol).getDisplayValues()[0]));
}

function cancelLearnApplicant(row, name, dob) {
  requireUser_();
  return withLock_(() => {
    const sheet = learnForm_().getSheetByName(LEARN.RESP_SHEET);
    const target = learnApplicants_(learnForm_()).find(a => a.row === Number(row));
    if (!target || learnNormName_(target.name) !== learnNormName_(name) || learnNormDob_(target.dob) !== learnNormDob_(dob)) {
      throw new Error('그 사이에 명단이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.');
    }
    learnBackupRow_(sheet, target.row, '관리자접수취소(대시보드)');
    sheet.deleteRow(target.row);
    log_('배움터 접수 취소', target.name + ' (' + target.dob + ') ' + target.courses.join(', '));
    return getLearnApplicants();
  });
}

// ---------- 추첨 ----------

function learnCourseApplicants_(form, course) {
  return learnApplicants_(form).filter(a => a.courses.indexOf(course) !== -1);
}

function getLotteryCourses() {
  requireUser_();
  const form = learnForm_();
  const apps = learnApplicants_(form);
  const sheetNames = form.getSheets().map(s => s.getName());
  return learnCourses_(learnInfo_()).map(c => {
    const count = apps.filter(a => a.courses.indexOf(c.name) !== -1).length;
    return { name: c.name, day: c.day, quota: c.quota, count: count, needed: count > c.quota, done: sheetNames.indexOf(learnResultSheetName_(c.name)) !== -1 };
  }).filter(c => c.needed || c.done);
}

// 서버에서 섞고 30분 동안 보관 → 저장할 때 그대로 씀 (화면에서 순서를 바꿀 수 없음)
function drawLottery(course) {
  requireUser_();
  const c = learnCourses_(learnInfo_()).find(x => x.name === course);
  if (!c) throw new Error('강좌를 찾을 수 없습니다.');
  const pool = learnCourseApplicants_(learnForm_(), course).map(a => ({ name: a.name, dob: a.dob, phone: a.phone }));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('lottery_' + token, JSON.stringify({ course: course, quota: c.quota, list: pool }), 1800);
  log_('배움터 추첨', course + ' (정원 ' + c.quota + ' / 신청 ' + pool.length + ')');
  return {
    token: token, course: course, quota: c.quota, total: pool.length,
    list: pool.map((a, i) => ({ pass: i < c.quota, label: i < c.quota ? '합격 ' + (i + 1) + '번' : '대기 ' + (i - c.quota + 1) + '번', display: learnMask_(a) }))
  };
}

function saveLottery(token, overwrite) {
  requireUser_();
  const raw = CacheService.getScriptCache().get('lottery_' + token);
  if (!raw) throw new Error('추첨한 지 30분이 지나 결과가 만료되었습니다. 다시 추첨해 주세요.');
  const draw = JSON.parse(raw);
  return withLock_(() => {
    const form = learnForm_();
    const name = learnResultSheetName_(draw.course);
    let sheet = form.getSheetByName(name);
    if (sheet && !overwrite) return { exists: true };
    if (!sheet) sheet = form.insertSheet(name);
    sheet.clear();
    const rows = draw.list.map((a, i) => [i + 1, a.name, a.dob, "'" + String(a.phone).replace(/[^0-9]/g, ''), i < draw.quota ? '합격자' : '대기자(' + (i - draw.quota + 1) + '번)']);
    sheet.getRange(1, 1, rows.length + 1, 5).setValues([['순번', '성명', '생년월일', '전화번호', '결과']].concat(rows))
      .setHorizontalAlignment('center').setBorder(true, true, true, true, true, true);
    log_('배움터 추첨 결과 저장', draw.course + ' (' + rows.length + '명)');
    return { saved: true, sheetName: name };
  });
}

function getLotteryResult(course) {
  requireUser_();
  const sheet = learnForm_().getSheetByName(learnResultSheetName_(course));
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues().map(r => ({
    pass: String(r[4]).indexOf('합격') !== -1,
    label: r[4],
    display: learnMask_({ name: r[1], dob: r[2], phone: r[3] })
  }));
}

// ---------- 합격자 대장 (배움터 앱 getAllPassList 와 같은 규칙) ----------

function getLearnWinners() {
  requireUser_();
  const form = learnForm_();
  const feeOf = {};
  learnCourses_(learnInfo_()).forEach(c => { feeOf[c.name] = c.fee; });
  const results = {};
  form.getSheets().forEach(s => {
    if (s.getName().indexOf('결과_') === 0) results[s.getName().replace('결과_', '').trim()] = s.getDataRange().getValues();
  });

  const people = {};
  learnApplicants_(form).forEach(a => {
    const key = learnNormName_(a.name) + '_' + learnNormDob_(a.dob) + '_' + String(a.phone).replace(/[^0-9]/g, '');
    if (!people[key]) people[key] = { name: a.name, dob: a.dob, phone: a.phone, benefit: a.benefit, passed: [], waiting: [], fee: 0 };
    const p = people[key];
    a.courses.forEach(cn => {
      // 결과 탭이 없으면 정원 안이라 추첨 없이 합격, 있는데 명단에 없으면 탈락
      let status = '비추첨';
      const lr = results[cn.substring(0, 15)];
      if (lr) {
        status = '탈락';
        for (let j = 1; j < lr.length; j++) {
          if (learnNormName_(lr[j][1]) === learnNormName_(a.name) && learnNormDob_(lr[j][2]) === learnNormDob_(a.dob)) { status = String(lr[j][4] || '').trim(); break; }
        }
      }
      if (status === '합격자' || status === '비추첨') {
        if (p.passed.indexOf(cn) === -1) { p.passed.push(cn); p.fee += feeOf[cn] || 0; }
      } else if (status.indexOf('대기') !== -1) {
        p.waiting.push(cn + ' ' + status.replace('대기자', '대기').trim());
      }
    });
  });

  const list = Object.keys(people).map(k => people[k]).map(p => {
    const exempt = learnIsExempt_(p.benefit);
    return { name: p.name, dob: p.dob, phone: p.phone, benefit: exempt ? p.benefit : '', passed: p.passed, waiting: p.waiting, originalFee: p.fee, fee: exempt ? 0 : p.fee };
  }).filter(p => p.passed.length || p.waiting.length)
    .sort((a, b) => a.name.localeCompare(b.name));
  const original = list.reduce((s, p) => s + p.originalFee, 0);
  const revenue = list.reduce((s, p) => s + p.fee, 0);
  return { list: list, stats: { count: list.filter(p => p.passed.length).length, original: original, exemption: original - revenue, revenue: revenue } };
}

// ---------- 일정 / 시트 만들기 ----------

function getLearnSettings() {
  requireUser_();
  return learnSchedule_(learnInfo_());
}

// 'yyyy-MM-ddTHH:mm' (스크립트 시간대 기준)
function learnParseInput_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0);
}

function saveLearnSchedule(start, end, result) {
  requireUser_();
  const s = learnParseInput_(start), e = learnParseInput_(end), r = learnParseInput_(result);
  if (!s || !e || !r) throw new Error('접수 시작, 마감, 결과 발표 일시를 모두 선택해 주세요.');
  if (s >= e) throw new Error('마감은 접수 시작보다 늦어야 합니다.');
  if (r < e) throw new Error('결과 발표는 마감 이후여야 합니다.');
  const config = learnInfo_().getSheetByName('환경설정');
  if (!config) throw new Error("배움터 강좌정보 시트에 '환경설정' 탭이 없습니다.");
  config.getRange('A2:C2').setValues([[s, e, r]]);
  SpreadsheetApp.flush();
  log_('배움터 일정', fmt_(s, 'MM/dd HH:mm') + ' ~ ' + fmt_(e, 'MM/dd HH:mm') + ', 발표 ' + fmt_(r, 'MM/dd HH:mm'));
  return learnSchedule_(learnInfo_());
}

// 접수 분석 보고서 탭 (★보고서_MMdd) - 배움터 앱의 보고서와 같은 내용, 날짜는 실제 접수일 기준
function createLearnReport() {
  requireUser_();
  const s = getLearnStatus();
  const form = learnForm_();
  const name = '★보고서_' + fmt_(new Date(), 'MMdd');
  const sheet = form.getSheetByName(name) || form.insertSheet(name);
  sheet.clear();
  sheet.getRange('A1').setValue('📊 어르신 배움터 접수 분석 보고 (' + fmt_(new Date(), 'MM월 dd일') + ')').setFontSize(14).setFontWeight('bold');
  sheet.getRange('A2').setValue('※ 기준시각 ' + s.checkedAt).setFontSize(9).setFontColor('#8b95a1');

  const block = (row, col, title, pairs) => {
    sheet.getRange(row, col).setValue(title).setFontWeight('bold');
    if (pairs.length) sheet.getRange(row + 1, col, pairs.length, 2).setValues(pairs).setBorder(true, true, true, true, true, true);
  };
  block(4, 1, '접수 기본 실황', [['실인원(명)', s.actual], ['연인원(건)', s.enrollment], ['남성', s.gender['남']], ['여성', s.gender['여']]]);
  block(4, 4, '일자별 접수', s.daily.map(d => [d.date, d.count]));
  block(4, 7, '연령대', Object.keys(s.ages).map(k => [k, s.ages[k]]));

  const top = 6 + Math.max(4, s.daily.length, 5);
  sheet.getRange(top, 1).setValue('강좌별 현황').setFontWeight('bold');
  const head = ['강좌명', '요일', '정원', '접수', '접수율', '정원초과', '면제자', '유료인원', '추첨'];
  const rows = s.courses.map(c => [c.name, c.day, c.quota, c.count, c.quota ? c.count / c.quota : 0, c.over, c.exempt, c.count - c.exempt, c.lotteryDone ? '완료' : (c.over ? '필요' : '-')]);
  sheet.getRange(top + 1, 1, 1, head.length).setValues([head]).setBackground('#191f28').setFontColor('#ffffff').setFontWeight('bold');
  if (rows.length) {
    sheet.getRange(top + 2, 1, rows.length, head.length).setValues(rows).setBorder(true, true, true, true, true, true);
    sheet.getRange(top + 2, 5, rows.length, 1).setNumberFormat('0.0%');
  }
  sheet.autoResizeColumns(1, head.length);
  log_('배움터 보고서', name);
  return name;
}

// 강좌별 신청자 명단 탭 (★전체마감명단) - 배움터 앱의 '전체 마감 명단 생성'과 같은 형식
function createLearnFinalLists() {
  requireUser_();
  const form = learnForm_();
  const apps = learnApplicants_(form);
  const sheet = form.getSheetByName('★전체마감명단') || form.insertSheet('★전체마감명단');
  sheet.clear();
  const rows = [['강좌 정보', '접수 일시', '성 명', '성 별', '생년월일', '연락처', '비고']];
  learnCourses_(learnInfo_()).forEach(c => {
    const list = apps.filter(a => a.courses.indexOf(c.name) !== -1);
    if (!list.length) rows.push([c.name, '-', '신청자 없음', '-', '-', '-', '정원 미달 자동 확정']);
    list.forEach(a => rows.push([c.name, a.date, a.name, a.gender, a.dob, a.phone, '']));
    rows.push(['', '', '', '', '', '', '']);
  });
  sheet.getRange(1, 1, rows.length, 7).setValues(rows);
  sheet.getRange(1, 1, 1, 7).setBackground('#f1c40f').setFontWeight('bold');
  sheet.autoResizeColumns(1, 7);
  log_('배움터 전체마감명단', rows.length - 1 + '줄');
  return '★전체마감명단';
}

// 직원 목록: 정지되었거나 보관된 계정은 뺌. 이름 순으로 정렬됨
function getStaffList() {
  requireUser_();
  const users = [];
  let pageToken;
  do {
    const res = AdminDirectory.Users.list({
      domain: STAFF.DOMAIN,
      maxResults: 500,
      orderBy: 'givenName',
      projection: 'full',
      pageToken: pageToken
    });
    (res.users || []).forEach(u => {
      if (u.suspended || u.archived) return;
      const orgs = u.organizations || [];
      const org = orgs.find(o => o.primary) || orgs[0] || {};
      users.push({
        email: String(u.primaryEmail || '').toLowerCase(),
        name: (u.name && u.name.fullName) || u.primaryEmail,
        dept: org.department || '',
        title: org.title || ''
      });
    });
    pageToken = res.nextPageToken;
  } while (pageToken);
  const team = teamEmails_();
  return users.map(u => Object.assign(u, { team: team.indexOf(u.email) !== -1 }));
}

// 상단에 보여줄 로그인한 사람의 이름·부서 (Workspace 디렉터리). 6시간 동안 저장해 두고 씀
// 디렉터리를 읽지 못하면 이름 없이 이메일만 보여줌
function userProfile_(email) {
  const cache = CacheService.getScriptCache();
  const key = 'PROFILE_' + email;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  let profile = { name: '', dept: '', title: '' };
  try {
    const u = AdminDirectory.Users.get(email, { projection: 'full' });
    const orgs = u.organizations || [];
    const org = orgs.find(o => o.primary) || orgs[0] || {};
    profile = { name: (u.name && u.name.fullName) || '', dept: org.department || '', title: org.title || '' };
    cache.put(key, JSON.stringify(profile), 21600);
  } catch (e) {
    Logger.log('사용자 정보 조회 실패 (' + email + '): ' + e.message);
  }
  return profile;
}

// 팀 구분: 복지사업팀 Google 그룹의 회원 이메일 목록. 그룹을 읽지 못하면 빈 목록 (직원 목록은 그대로 나옴)
// 10분 동안 저장해 두고 씀. 조회에 실패한 결과는 저장하지 않음
function teamEmails_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('TEAM_EMAILS');
  if (cached) return JSON.parse(cached);

  const emails = [];
  try {
    let pageToken;
    do {
      const res = AdminDirectory.Members.list(STAFF.TEAM_GROUP, { maxResults: 200, pageToken: pageToken });
      (res.members || []).forEach(m => emails.push(String(m.email || '').toLowerCase()));
      pageToken = res.nextPageToken;
    } while (pageToken);
    cache.put('TEAM_EMAILS', JSON.stringify(emails), 600);
  } catch (e) {
    Logger.log('팀 그룹 조회 실패: ' + e.message);
  }
  return emails;
}

// 편집기에서 직접 실행해 디렉터리 권한 승인과 목록 조회를 확인하는 용도 (오류를 숨기지 않음)
function checkStaffDirectory() {
  const list = getStaffList();
  Logger.log('직원 목록 조회 성공 - ' + list.length + '명');
}

// =====================================================================
// 월례회 자료: 직원 월례회(본인 결과·계획), 재단 월례회(사업별 전월·다음월 특이사항)
// 기록은 '월례회기록' 시트에 한 줄씩 쌓고, 로그인한 본인이 쓴 줄만 고칠 수 있음
// =====================================================================

const MEETING = {
  SHEET_NAME: '월례회기록',
  FILE_NAME: '복지관 월례회 기록',
  HEADERS: ['회의월', '구분', '사업명', '항목', '내용', '작성자이메일', '작성자이름', '작성일시'],
  ASSIGN_SHEET_NAME: '담당사업',
  ASSIGN_HEADERS: ['이메일', '사업명', '등록일시'],
  STAFF: '직원',
  FOUNDATION: '재단'
};

// 파일 ID는 스크립트 속성(MEETING_SHEET_ID)에 저장. 없거나 열 수 없으면 새로 만듦
function meetingSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty('MEETING_SHEET_ID');
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(MEETING.FILE_NAME);
    ss.getSheets()[0].setName(MEETING.SHEET_NAME);
    props.setProperty('MEETING_SHEET_ID', ss.getId());
  }
  return ss;
}

// 이름의 탭이 없으면 만들고 머리글을 씀
function meetingTab_(name, headers) {
  const ss = meetingSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function meetingSheet_() {
  return meetingTab_(MEETING.SHEET_NAME, MEETING.HEADERS);
}

function assignSheet_() {
  return meetingTab_(MEETING.ASSIGN_SHEET_NAME, MEETING.ASSIGN_HEADERS);
}

function checkMonth_(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('회의월을 확인해 주세요. (예: 2026-10)');
}

// 시트는 '2026-10' 같은 값을 날짜로 바꾸기도 해서 문자열로 맞춤
function monthText_(v) {
  return v instanceof Date ? fmt_(v, 'yyyy-MM') : String(v || '').trim();
}

function meetingRows_() {
  const values = meetingSheet_().getDataRange().getValues();
  return values.slice(1).map((v, i) => ({
    row: i + 2,
    month: monthText_(v[0]),
    kind: String(v[1] || ''),
    biz: String(v[2] || ''),
    item: String(v[3] || ''),
    text: String(v[4] || ''),
    email: String(v[5] || '').toLowerCase(),
    name: String(v[6] || ''),
    at: v[7] instanceof Date ? fmt_(v[7], 'yyyy-MM-dd HH:mm') : String(v[7] || '')
  })).filter(r => r.month && r.kind);
}

// row 를 주면 그 줄을 고치고, 0 이면 맨 아래에 추가. 값은 글자로 저장
function writeMeetingRow_(sheet, row, values) {
  const target = row || sheet.getLastRow() + 1;
  sheet.getRange(target, 1, 1, values.length).setNumberFormat('@').setValues([values]);
  return target;
}

// 같은 회의월·구분·사업명·항목의 본인 줄을 찾아 고치고, 내용이 비면 지움
function upsertMeetingItem_(month, kind, biz, item, text, email, name) {
  const sheet = meetingSheet_();
  const mine = meetingRows_().filter(r =>
    r.month === month && r.kind === kind && r.biz === biz && r.item === item && r.email === email)[0];
  if (!String(text || '').trim()) {
    if (mine) sheet.deleteRow(mine.row);
    return;
  }
  const at = fmt_(new Date(), 'yyyy-MM-dd HH:mm');
  writeMeetingRow_(sheet, mine ? mine.row : 0, [month, kind, biz, item, String(text).trim(), email, name, at]);
}

function staffName_(email) {
  const hit = getStaffList().filter(s => s.email === email)[0];
  return hit ? hit.name : email;
}

// 화면에 보여줄 회의월 자료 (직원 월례회 + 재단 월례회), 본인 줄 표시 포함
function getMeetingData(month) {
  const email = requireUser_();
  checkMonth_(month);
  const all = meetingRows_();
  const rows = all.filter(r => r.month === month).map(r => ({
    kind: r.kind, biz: r.biz, item: r.item, text: r.text,
    email: r.email, name: r.name, at: r.at, mine: r.email === email
  }));
  return { me: email, rows: rows, myBiz: myBusinesses_(email) };
}

// 직원 월례회: 본인 이름으로 주요결과(전월 활동), 주요계획(이번 달 계획) 저장
function saveStaffMonth(month, results, plans) {
  const email = requireUser_();
  checkMonth_(month);
  const name = staffName_(email);
  return withLock_(() => {
    upsertMeetingItem_(month, MEETING.STAFF, '', '결과', results, email, name);
    upsertMeetingItem_(month, MEETING.STAFF, '', '계획', plans, email, name);
    log_('월례회 직원', month + ' ' + name);
    return true;
  });
}

// 재단 월례회: 사업별 전월·다음월 특이사항. 같은 사업이라도 작성자마다 따로 저장됨
function saveFoundation(month, biz, prev, next) {
  const email = requireUser_();
  checkMonth_(month);
  biz = String(biz || '').trim();
  if (!biz) throw new Error('사업명을 입력해 주세요.');
  if (myBusinesses_(email).indexOf(biz) === -1) throw new Error('담당 사업에 먼저 추가해 주세요. (' + biz + ')');
  const name = staffName_(email);
  return withLock_(() => {
    upsertMeetingItem_(month, MEETING.FOUNDATION, biz, '전월', prev, email, name);
    upsertMeetingItem_(month, MEETING.FOUNDATION, biz, '다음월', next, email, name);
    log_('월례회 재단', month + ' ' + biz);
    return true;
  });
}

// 담당 사업: 직원별로 등록. 재단 월례회 입력과 목록은 이 사업들만 보여줌
function assignRows_() {
  const values = assignSheet_().getDataRange().getValues();
  return values.slice(1).map((v, i) => ({
    row: i + 2,
    email: String(v[0] || '').trim().toLowerCase(),
    biz: String(v[1] || '').trim()
  })).filter(r => r.email && r.biz);
}

function myBusinesses_(email) {
  return assignRows_().filter(r => r.email === email).map(r => r.biz);
}

function addMyBusiness(biz) {
  const email = requireUser_();
  biz = String(biz || '').trim();
  if (!biz) throw new Error('사업명을 입력해 주세요.');
  return withLock_(() => {
    if (myBusinesses_(email).indexOf(biz) !== -1) return true;
    writeMeetingRow_(assignSheet_(), 0, [email, biz, fmt_(new Date(), 'yyyy-MM-dd HH:mm')]);
    log_('담당사업 추가', email + ' ' + biz);
    return true;
  });
}

// 담당 사업에서만 뺌. 이미 입력한 월례회 내용은 그대로 남김
function removeMyBusiness(biz) {
  const email = requireUser_();
  return withLock_(() => {
    const sheet = assignSheet_();
    assignRows_().filter(r => r.email === email && r.biz === biz).reverse().forEach(r => sheet.deleteRow(r.row));
    log_('담당사업 삭제', email + ' ' + biz);
    return true;
  });
}

// 월별 자료를 새 구글 시트로 만들어 링크를 돌려줌. 열어서 파일 > 다운로드 > Microsoft Excel(.xlsx) 로 받으면 됨
function exportMeetingMonth(month) {
  requireUser_();
  checkMonth_(month);
  const rows = meetingRows_().filter(r => r.month === month);
  const team = getStaffList().filter(s => s.team);
  const ss = SpreadsheetApp.create('월례회 ' + month + ' 자료');

  const staffRows = [['팀', '담당자', '주요결과 (전월 활동)', '주요계획 (이번 달)']].concat(team.map(s => {
    const mine = rows.filter(r => r.kind === MEETING.STAFF && r.email === s.email);
    const textOf = item => (mine.filter(r => r.item === item)[0] || {}).text || '';
    return [STAFF.TEAM_NAME, s.name, textOf('결과'), textOf('계획')];
  }));
  const staffSheet = ss.getSheets()[0];
  staffSheet.setName('직원 월례회');
  writeExportTable_(staffSheet, staffRows);

  const groups = {};
  rows.filter(r => r.kind === MEETING.FOUNDATION).forEach(r => {
    const key = r.biz + '|' + r.email;
    groups[key] = groups[key] || { biz: r.biz, name: r.name, prev: '', next: '' };
    if (r.item === '전월') groups[key].prev = r.text;
    if (r.item === '다음월') groups[key].next = r.text;
  });
  const bizBody = Object.keys(groups).map(k => groups[k])
    .sort((a, b) => a.biz.localeCompare(b.biz, 'ko'))
    .map(g => [g.biz, g.prev, g.next, g.name]);
  const bizSheet = ss.insertSheet('재단 월례회');
  writeExportTable_(bizSheet, [['사업명', '전월 특이사항', '다음월 특이사항', '작성자']].concat(bizBody));

  // 같은 도메인 직원이 링크로 열어 받을 수 있게 함
  DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  log_('월례회 내보내기', month);
  return ss.getUrl();
}

function writeExportTable_(sheet, rows) {
  const width = rows[0].length;
  sheet.getRange(1, 1, rows.length, width).setNumberFormat('@').setValues(rows).setWrap(true).setVerticalAlignment('top');
  sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#f1c40f');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, width);
}

// =====================================================================
// 시설보수대장: 시설기사가 보수할 때마다 입력 (사진 여러 장). 기록은 '월례회 기록' 파일의 '시설보수대장' 탭
// 사진은 '시설보수 사진' 드라이브 폴더에 저장되고, 시트에는 사진 링크가 들어감
// =====================================================================

const REPAIR = {
  SHEET_NAME: '시설보수대장',
  // 사진: '사진(이전 기록)'은 조치 전·후를 나누기 전 기록, 이후 기록은 '조치 전 사진'·'조치 후 사진'에 들어감
  HEADERS: ['번호', '보수일자', '분야', '위치', '보수 내용', '원인·비고', '조치결과', '비용(원)', '작성자', '작성자이메일', '작성일시', '사진(이전 기록)', '조치 전 사진', '조치 후 사진'],
  FIELDS: ['전기', '설비(급배수·냉난방)', '건축(벽·바닥·천장)', '창호·문', '소방', '가구·비품', '기타'],
  RESULTS: ['완료', '진행중', '이월'],
  FOLDER_NAME: '시설보수 사진',
  MAX_PHOTO_BYTES: 5 * 1024 * 1024
};

function repairSheet_() {
  const sheet = meetingTab_(REPAIR.SHEET_NAME, REPAIR.HEADERS);
  // 조치 전·후 칸이 생기기 전에 만든 시트면 머리글을 새로 채워 넣음
  if (String(sheet.getRange(1, REPAIR.HEADERS.length).getValue()) !== REPAIR.HEADERS[REPAIR.HEADERS.length - 1]) {
    sheet.getRange(1, 1, 1, REPAIR.HEADERS.length).setValues([REPAIR.HEADERS]).setFontWeight('bold');
  }
  return sheet;
}

function splitPhotos_(text) {
  return String(text || '').split('\n').filter(Boolean);
}

function repairFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('REPAIR_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 폴더가 없으면 새로 만듦 */ }
  }
  const folder = DriveApp.createFolder(REPAIR.FOLDER_NAME);
  folder.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty('REPAIR_FOLDER_ID', folder.getId());
  return folder;
}

function repairRows_() {
  const values = repairSheet_().getDataRange().getValues();
  return values.slice(1).map((v, i) => ({
    row: i + 2,
    no: Number(v[0]) || 0,
    date: v[1] instanceof Date ? fmt_(v[1], 'yyyy-MM-dd') : String(v[1] || ''),
    field: String(v[2] || ''),
    place: String(v[3] || ''),
    content: String(v[4] || ''),
    cause: String(v[5] || ''),
    result: String(v[6] || ''),
    cost: String(v[7] || ''),
    name: String(v[8] || ''),
    email: String(v[9] || '').toLowerCase(),
    legacy: splitPhotos_(v[11]),
    before: splitPhotos_(v[12]),
    after: splitPhotos_(v[13])
  })).filter(r => r.no);
}

// 휴대폰 입력 페이지에 필요한 목록 (분야, 조치결과)
function repairConfig_() {
  return { fields: REPAIR.FIELDS, results: REPAIR.RESULTS };
}

// 사진 한 장 저장. 휴대폰에서 줄인 사진을 한 장씩 올림. 저장된 사진 링크를 돌려줌
function uploadRepairPhoto(name, mime, data) {
  requireUser_();
  mime = String(mime || '');
  if (mime.indexOf('image/') !== 0) throw new Error('사진 파일만 올릴 수 있습니다.');
  const bytes = Utilities.base64Decode(data);
  if (bytes.length > REPAIR.MAX_PHOTO_BYTES) throw new Error('사진이 너무 큽니다. 다시 찍어 주세요.');
  const file = repairFolder_().createFile(Utilities.newBlob(bytes, mime, String(name || 'photo.jpg')));
  file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

// 사진 링크 목록 정리: 빈 값·중복 제외, 최대 30장
function cleanPhotoList_(list) {
  return (Array.isArray(list) ? list : []).map(u => String(u || '').trim())
    .filter((u, i, arr) => u && arr.indexOf(u) === i).slice(0, 30);
}

// 보수 기록 1건 저장. 번호는 자동으로 이어 붙임. entry.no 가 있으면 본인 기록을 고침
// (사진은 화면에 남긴 기존 사진 + 새로 올린 사진 전체 목록으로 받아 그대로 씀)
function saveRepair(entry) {
  const email = requireUser_();
  const date = String(entry.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('보수일자를 확인해 주세요.');
  if (REPAIR.FIELDS.indexOf(entry.field) === -1) throw new Error('분야를 골라 주세요.');
  if (!String(entry.content || '').trim()) throw new Error('보수 내용을 적어 주세요.');
  const name = staffName_(email);
  const result = REPAIR.RESULTS.indexOf(entry.result) === -1 ? '완료' : entry.result;
  const before = cleanPhotoList_(entry.beforePhotos).join('\n');
  const after = cleanPhotoList_(entry.afterPhotos).join('\n');
  return withLock_(() => {
    const sheet = repairSheet_();
    if (entry.no) {
      const hit = repairRows_().filter(r => r.no === Number(entry.no))[0];
      if (!hit) throw new Error('해당 기록을 찾을 수 없습니다.');
      if (hit.email !== email) throw new Error('본인이 쓴 기록만 고칠 수 있습니다.');
      sheet.getRange(hit.row, 2, 1, 7).setNumberFormat('@').setValues([[
        date, entry.field, String(entry.place || '').trim(), String(entry.content).trim(),
        String(entry.cause || '').trim(), result, String(Number(entry.cost) || 0)
      ]]);
      sheet.getRange(hit.row, 13, 1, 2).setNumberFormat('@').setValues([[before, after]]);
      log_('시설보수 수정', date + ' ' + entry.field + ' ' + hit.no + '번');
      return hit.no;
    }
    const no = repairRows_().reduce((max, r) => Math.max(max, r.no), 0) + 1;
    writeMeetingRow_(sheet, 0, [
      no, date, entry.field, String(entry.place || '').trim(), String(entry.content).trim(),
      String(entry.cause || '').trim(), result, String(Number(entry.cost) || 0),
      name, email, fmt_(new Date(), 'yyyy-MM-dd HH:mm'), '', before, after
    ]);
    log_('시설보수 등록', date + ' ' + entry.field + ' ' + no + '번');
    return no;
  });
}

// 해당 연도의 보수 기록 (최신 보수일 순). mine 은 본인이 쓴 기록 여부
function getRepairList(year) {
  const email = requireUser_();
  return repairRows_()
    .filter(r => r.date.indexOf(String(year)) === 0)
    .sort((a, b) => (b.date.localeCompare(a.date)) || (b.no - a.no))
    .map(r => ({
      no: r.no, date: r.date, field: r.field, place: r.place, content: r.content,
      cause: r.cause, result: r.result, cost: r.cost, name: r.name,
      before: r.before, after: r.after,
      // 세부 창에서 한꺼번에 넘겨 보도록 조치 전 → 조치 후 → 이전 기록 순서로 모은 목록
      photos: r.before.concat(r.after, r.legacy),
      mine: r.email === email
    }));
}

// 본인이 쓴 기록만 지울 수 있음 (사진 파일은 드라이브에 그대로 남음)
function deleteRepair(no) {
  const email = requireUser_();
  return withLock_(() => {
    const hit = repairRows_().filter(r => r.no === Number(no))[0];
    if (!hit) throw new Error('해당 기록을 찾을 수 없습니다.');
    if (hit.email !== email) throw new Error('본인이 쓴 기록만 지울 수 있습니다.');
    repairSheet_().deleteRow(hit.row);
    log_('시설보수 삭제', hit.date + ' ' + hit.field + ' ' + hit.no + '번');
    return true;
  });
}

// 보수 사진을 화면에 보여줄 이미지 데이터로 돌려줌
// 대시보드 화면은 구글의 별도 주소 안에서 열려 drive.google.com 미리보기 주소가 로그인 문제로 막히므로 서버에서 읽어 보냄
// thumb=true 면 작은 미리보기(드라이브 썸네일), 아니면 원본(입력할 때 이미 1600px로 줄여 둔 사진)
function getRepairPhotoData(url, thumb) {
  requireUser_();
  const m = String(url || '').match(/\/d\/([\w-]+)/) || String(url || '').match(/[?&]id=([\w-]+)/);
  if (!m) throw new Error('사진 주소를 확인할 수 없습니다.');
  const file = DriveApp.getFileById(m[1]);
  // 시설보수 사진 폴더의 파일만 보여줌 (다른 드라이브 파일을 읽는 데 쓰이지 않도록)
  const folderId = repairFolder_().getId();
  let inFolder = false;
  const parents = file.getParents();
  while (parents.hasNext()) { if (parents.next().getId() === folderId) { inFolder = true; break; } }
  if (!inFolder) throw new Error('시설보수 사진이 아닙니다.');
  let blob = null;
  if (thumb) { try { blob = file.getThumbnail(); } catch (e) { blob = null; } }
  if (!blob) blob = file.getBlob();
  return 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

// 대시보드에서 쓸 링크: 휴대폰 입력 페이지, 시트
function getRepairInfo() {
  requireUser_();
  return {
    pageUrl: ScriptApp.getService().getUrl() + '?page=repair',
    sheetUrl: meetingSpreadsheet_().getUrl()
  };
}

// 상단 로고: Drive 파일을 서버에서 읽어 이미지 데이터로 돌려줌 (파일 공유 설정과 상관없이 대시보드 계정이 읽을 수 있으면 나옴)
const BRAND = {
  LOGO_FILE_ID: '1m_ltSywU1E038aSWEgoyBBsJ3qOPbnfm'
};

function getBrandLogo() {
  requireUser_();
  try {
    const blob = DriveApp.getFileById(BRAND.LOGO_FILE_ID).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    Logger.log('로고를 읽지 못했습니다: ' + e.message);
    return '';
  }
}

// =====================================================================
// 업무포털 홈: 이번 달 현황 요약 + 바로가기 목록 ('바로가기' 탭에서 관리)
// =====================================================================

const PORTAL = {
  LINK_TAB: '바로가기',
  LINK_HEADERS: ['구분', '이름', '주소', '설명']
};

function portalLinkSheet_() {
  const sheet = meetingTab_(PORTAL.LINK_TAB, PORTAL.LINK_HEADERS);
  if (sheet.getLastRow() === 1) {
    // 처음 만들 때 기본 항목을 넣음. 주소가 비어 있는 항목은 홈에 나오지 않음
    sheet.getRange(2, 1, 5, 4).setValues([
      ['차량', '공유트럭 관리', TRUCK.APP_URL, '공유트럭 예약 승인·반려 관리 화면'],
      ['차량', '셔틀버스 승객 노선도', SHUTTLE.MAP_URL, '승객용 노선과 실시간 위치'],
      ['행정', '그룹웨어', 'http://gw.gjcw.or.kr', '복지관 그룹웨어'],
      ['행정', '근태 시스템', '', '주소를 입력하면 홈에 표시됩니다'],
      ['행정', '전자문서', '', '주소를 입력하면 홈에 표시됩니다']
    ]);
  }
  return sheet;
}

function getPortalLinks() {
  requireUser_();
  return portalLinkSheet_().getDataRange().getValues().slice(1)
    .map(v => ({
      group: String(v[0] || '').trim(),
      name: String(v[1] || '').trim(),
      url: String(v[2] || '').trim(),
      desc: String(v[3] || '').trim()
    }))
    .filter(l => l.name && /^https?:\/\//.test(l.url));
}

// 홈 요약: 이번 달 직원 월례회 작성 현황, 재단 입력 사업 수, 시설 보수 건수
function getHomeSummary() {
  requireUser_();
  const now = new Date();
  const month = fmt_(now, 'yyyy-MM');
  const year = fmt_(now, 'yyyy');

  const team = getStaffList().filter(s => s.team);
  const thisMonth = meetingRows_().filter(r => r.month === month);
  const wroteStaff = {};
  thisMonth.filter(r => r.kind === MEETING.STAFF).forEach(r => { wroteStaff[r.email] = true; });
  const businesses = {};
  thisMonth.filter(r => r.kind === MEETING.FOUNDATION).forEach(r => { businesses[r.biz] = true; });

  const repairs = repairRows_().filter(r => r.date.indexOf(year) === 0);
  const lastRepair = repairs.map(r => r.date).sort().pop() || '';

  return {
    today: fmt_(now, 'M월 d일'),
    month: month,
    teamTotal: team.length,
    staffWritten: team.filter(s => wroteStaff[s.email]).length,
    businesses: Object.keys(businesses).length,
    repairThisMonth: repairs.filter(r => r.date.indexOf(month) === 0).length,
    repairThisYear: repairs.length,
    lastRepair: lastRepair
  };
}

// =====================================================================
// 제출 자료 센터: 월별 제출 현황 점검 + 시설보수 목록 엑셀용 시트
// (월례회 자료 엑셀은 exportMeetingMonth 를 그대로 사용)
// =====================================================================

// 제출 전 점검: 직원 월례회 작성 여부, 재단 사업 입력 수, 시설보수 건수
function getSubmissionStatus(month) {
  requireUser_();
  checkMonth_(month);
  const team = getStaffList().filter(s => s.team);
  const rows = meetingRows_().filter(r => r.month === month);
  const wroteStaff = {};
  rows.filter(r => r.kind === MEETING.STAFF).forEach(r => { wroteStaff[r.email] = true; });
  const businesses = {};
  rows.filter(r => r.kind === MEETING.FOUNDATION).forEach(r => { businesses[r.biz] = true; });
  const missing = team.filter(s => !wroteStaff[s.email]).map(s => s.name);
  return {
    teamTotal: team.length,
    wrote: team.length - missing.length,
    missing: missing,
    businesses: Object.keys(businesses).length,
    repairs: repairRows_().filter(r => r.date.indexOf(month) === 0).length
  };
}

// 해당 월의 시설보수 목록을 새 구글 시트로 만들어 링크를 돌려줌 (엑셀로 받기)
function exportRepairMonth(month) {
  requireUser_();
  checkMonth_(month);
  const rows = repairRows_()
    .filter(r => r.date.indexOf(month) === 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.no - b.no);
  const body = rows.map(r => [
    r.no, r.date, r.field, r.place, r.content, r.cause, r.result, r.cost, r.name,
    r.before.length, r.after.length, r.before.join('\n'), r.after.join('\n'), r.legacy.join('\n')
  ]);
  const ss = SpreadsheetApp.create('시설보수 ' + month + ' 자료');
  const sheet = ss.getSheets()[0];
  sheet.setName('시설보수');
  writeExportTable_(sheet, [['번호', '보수일자', '분야', '위치', '보수 내용', '원인·비고', '조치결과', '비용(원)', '작성자', '조치 전 사진 수', '조치 후 사진 수', '조치 전 사진 링크', '조치 후 사진 링크', '이전 기록 사진 링크']].concat(body));
  DriveApp.getFileById(ss.getId()).setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
  log_('시설보수 내보내기', month);
  return ss.getUrl();
}

// =====================================================================
// 사업 관리: 사업별 담당자와 이번 달 재단 특이사항 현황 (입력은 재단 월례회 탭에서)
// =====================================================================

// 담당 사업 등록(assignRows_)과 이번 달 재단 입력(meetingRows_)을 사업명 기준으로 합쳐서 돌려줌
function getBusinessBoard(month) {
  const me = requireUser_();
  checkMonth_(month);
  const nameOf = {};
  getStaffList().forEach(s => { nameOf[s.email] = s.name; });

  const boards = {};
  const boardOf = biz => {
    if (!boards[biz]) boards[biz] = { biz: biz, owners: [], entries: [] };
    return boards[biz];
  };
  assignRows_().forEach(r => {
    const owner = nameOf[r.email] || r.email;
    const board = boardOf(r.biz);
    if (board.owners.indexOf(owner) === -1) board.owners.push(owner);
  });
  meetingRows_().filter(r => r.month === month && r.kind === MEETING.FOUNDATION).forEach(r => {
    boardOf(r.biz).entries.push({
      item: r.item,
      text: r.text,
      name: nameOf[r.email] || r.name || r.email,
      mine: r.email === me
    });
  });
  return Object.keys(boards).map(k => boards[k]).sort((a, b) => a.biz.localeCompare(b.biz, 'ko'));
}

// =====================================================================
// 셔틀 지연 알림: 운행 중인데 위치가 10분 넘게 안 들어오거나, 기사 앱이 응답하지 않으면 메일 발송
// 5분마다 실행되는 시간 트리거(installShuttleAlertTrigger)로 동작. 대시보드를 열어 둘 필요 없음
// 알림 받을 주소: 프로젝트 설정 > 스크립트 속성 > SHUTTLE_ALERT_EMAILS (쉼표로 구분)
// =====================================================================

const SHUTTLE_ALERT = {
  STALE_MS: 10 * 60 * 1000,      // 위치 미수신 기준 (대시보드 표시 기준과 같음)
  APP_STALE_MS: 90 * 1000,       // 기사 앱 응답 없음 기준
  REMIND_MS: 30 * 60 * 1000,     // 같은 문제는 이 간격마다 한 번씩만 다시 알림
  HOUR_FROM: 6,                  // 운행 시간대 (KST). 이 밖에는 알리지 않음
  HOUR_TO: 20,
  STATE_KEY: 'SHUTTLE_ALERT_STATE',
  EMAILS_KEY: 'SHUTTLE_ALERT_EMAILS'
};

function fetchFirebaseJson_(path) {
  const res = UrlFetchApp.fetch(SHUTTLE.FIREBASE_URL + '/' + path + '.json', { muteHttpExceptions: true });
  return res.getResponseCode() === 200 ? JSON.parse(res.getContentText() || 'null') : null;
}

// 지금 운행 상황과 문제 목록. 지연 알림과 홈 화면이 같은 기준을 씀
function shuttleStatus_(now) {
  const problems = [];
  const runningList = [];

  const live = fetchFirebaseJson_('publicLiveStatus') || {};
  Object.keys(live).forEach(course => {
    Object.keys(live[course] || {}).forEach(round => {
      const pos = (live[course][round] || {}).busPosition || {};
      const operating = pos.isOperating === true || pos.isOperating === 'true';
      const updated = Number(pos.updatedAt) || 0;
      if (!operating || !updated) return;
      if (now - updated >= SHUTTLE_ALERT.STALE_MS) {
        problems.push({
          key: 'gps|' + course + '|' + round,
          text: course + ' ' + round + ' (' + (pos.busNumber || '차량 미상') + ') · 위치 미수신 ' + Math.round((now - updated) / 60000) + '분째'
        });
      } else if (now - updated < 45000) {
        runningList.push({ label: (pos.busNumber || '차량 미상') + ' · ' + course + ' ' + round });
      }
    });
  });

  // 기사 앱 상태 (읽기 권한이 막혀 있으면 이 부분만 건너뜀)
  const health = fetchFirebaseJson_('driverHealth') || {};
  Object.keys(health).forEach(vehicle => {
    const h = health[vehicle] || {};
    const updated = Number(h.updatedAt) || 0;
    if (h.active && updated && now - updated >= SHUTTLE_ALERT.APP_STALE_MS) {
      problems.push({
        key: 'app|' + vehicle,
        text: vehicle + ' · 기사 앱 응답 없음 ' + Math.round((now - updated) / 1000) + '초째'
      });
    }
  });

  return { running: runningList.length, runningList: runningList, problems: problems };
}

function checkShuttleAlerts() {
  const now = Date.now();
  const hour = Number(Utilities.formatDate(new Date(now), 'Asia/Seoul', 'H'));
  if (hour < SHUTTLE_ALERT.HOUR_FROM || hour >= SHUTTLE_ALERT.HOUR_TO) return;
  sendShuttleAlerts_(shuttleStatus_(Date.now()).problems, now);
}

// 홈 화면용 셔틀 요약: 정상 운행 대수와 확인이 필요한 문제 목록
function getShuttleSummary() {
  requireUser_();
  const now = Date.now();
  const status = shuttleStatus_(now);
  return {
    running: status.running,
    runningList: status.runningList.map(r => r.label),
    problems: status.problems.map(p => p.text),
    checkedAt: Utilities.formatDate(new Date(now), 'Asia/Seoul', 'HH:mm')
  };
}

// 같은 문제는 REMIND_MS 간격으로만 다시 알리고, 해결된 문제는 기록에서 지움 (해결 후 재발하면 바로 알림)
function sendShuttleAlerts_(problems, now) {
  const props = PropertiesService.getScriptProperties();
  const state = JSON.parse(props.getProperty(SHUTTLE_ALERT.STATE_KEY) || '{}');
  const current = {};
  problems.forEach(p => { current[p.key] = true; });
  Object.keys(state).forEach(key => { if (!current[key]) delete state[key]; });

  const fresh = problems.filter(p => !state[p.key] || now - state[p.key] >= SHUTTLE_ALERT.REMIND_MS);
  if (fresh.length) {
    const recipients = (props.getProperty(SHUTTLE_ALERT.EMAILS_KEY) || '').split(',').map(s => s.trim()).filter(Boolean);
    if (recipients.length) {
      MailApp.sendEmail(
        recipients.join(','),
        '[셔틀버스] 운행 확인 필요 (' + fresh.length + '건)',
        fresh.map(p => '· ' + p.text).join('\n') +
          '\n\n확인 시각: ' + Utilities.formatDate(new Date(now), 'Asia/Seoul', 'M/d HH:mm') +
          '\n통합 대시보드 > 셔틀버스 운행 현황에서 확인해 주세요.'
      );
    }
    fresh.forEach(p => { state[p.key] = now; });
  }
  props.setProperty(SHUTTLE_ALERT.STATE_KEY, JSON.stringify(state));
}

// 편집기에서 한 번 실행: 5분마다 checkShuttleAlerts 를 돌리는 트리거를 만듦 (이미 있으면 다시 만들어 중복 방지)
function installShuttleAlertTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkShuttleAlerts') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkShuttleAlerts').timeBased().everyMinutes(5).create();
  Logger.log('셔틀 지연 알림 트리거를 설정했습니다. (5분마다, 운행 시간대에만 발송)');
}

// 편집기에서 실행해 알림 받을 주소로 테스트 메일이 가는지 확인
function testShuttleAlertMail() {
  const recipients = (PropertiesService.getScriptProperties().getProperty(SHUTTLE_ALERT.EMAILS_KEY) || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!recipients.length) throw new Error('스크립트 속성 SHUTTLE_ALERT_EMAILS 에 알림 받을 주소를 먼저 입력해 주세요.');
  MailApp.sendEmail(recipients.join(','), '[셔틀버스] 알림 테스트', '이 메일이 도착하면 지연 알림 설정이 정상입니다.');
  Logger.log('테스트 메일을 보냈습니다: ' + recipients.join(', '));
}

// 편집기에서 직접 실행해 캘린더 권한 승인과 읽기 여부를 확인하는 용도 (오류를 숨기지 않음)
function checkCalendarAccess() {
  let cal = CalendarApp.getCalendarById(ROOM.CALENDAR_ID);
  if (!cal) cal = CalendarApp.subscribeToCalendar(ROOM.CALENDAR_ID, { hidden: false });
  const now = new Date();
  const events = cal.getEventsForDay(now);
  Logger.log(cal.getName() + ' 캘린더 읽기 성공 - 오늘 일정 ' + events.length + '건');
}

// 실별로 지금 수업, 다음 수업, 화면에 나오는 이미지 종류를 각 실 사이니지와 같은 규칙으로 계산
function getRoomsStatus() {
  requireUser_();
  const now = new Date();
  const rooms = readRoomTable_('rooms');

  let events = [];
  let calendarError = '';
  try {
    // 공유받은 캘린더라도 내 캘린더 목록에 추가(구독)되어 있지 않으면 null 이 나와서, 없으면 한 번 구독
    let cal = CalendarApp.getCalendarById(ROOM.CALENDAR_ID);
    if (!cal) {
      try { cal = CalendarApp.subscribeToCalendar(ROOM.CALENDAR_ID, { hidden: false }); } catch (e) {}
    }
    if (!cal) throw new Error(ROOM.CALENDAR_ID + ' 캘린더를 내 캘린더 목록에 추가해 주세요.');
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    events = cal.getEvents(dayStart, dayEnd)
      .map(e => ({ title: e.getTitle(), start: e.getStartTime(), end: e.getEndTime() }))
      .sort((a, b) => a.start - b.start);
  } catch (e) {
    calendarError = '캘린더를 읽지 못했습니다: ' + e.message;
  }

  const shown = key => listFiles_(key).filter(f => !f.isVideo && (f.status === 'always' || f.status === 'active'));
  const full = shown('roomFull');
  const rotation = shown('roomRotation');
  const shared = shown('roomCommon').concat(shown('general'));
  const emergencyImages = shown('emergency').length;
  const ev = e => e ? { title: e.title, start: fmt_(e.start, 'HH:mm'), end: fmt_(e.end, 'HH:mm') } : null;

  const list = rooms.map(r => {
    const name = r.values[0];
    const mine = events.filter(e => e.title.indexOf('[' + name + ']') !== -1);
    const fullN = full.filter(f => isRoomFile_(f.name, name)).length;
    const rotN = rotation.concat(shared).filter(f => isRoomFile_(f.name, name)).length;
    const commonN = shared.filter(f => !isRoomFile_(f.name, name)).length;
    return {
      name: name,
      type: r.values[1] || ROOM.TYPES[0],
      message: r.values[2],
      current: ev(mine.find(e => now >= e.start && now <= e.end)),
      next: ev(mine.find(e => e.start > now)),
      images: fullN ? { mode: 'full', count: fullN } : rotN ? { mode: 'rotation', count: rotN } : { mode: 'common', count: commonN },
      url: ROOM.DISPLAY_URL + '?room=' + encodeURIComponent(name)
    };
  });

  return {
    checkedAt: fmt_(now, 'yyyy-MM-dd HH:mm'),
    notice: readRoomNotice_(),
    emergencyImages: emergencyImages,
    calendarError: calendarError,
    rooms: list
  };
}

// =====================================================================
// 전광판 관리: 1층 현관 / 3층 대강당 LED 전광판 (NovaStar Taurus T30, ViPlex '웹 페이지' 위젯)
// 콘텐츠는 '전광판 관리' 시트(콘텐츠 탭)와 '전광판 이미지' 드라이브 폴더에 저장
// 전광판은 GitHub의 표시 페이지(LED.PAGE_URL)를 열고, 그 페이지가 '전광판 API' 프로젝트에서 목록을 받아 감
// 화면 해상도·플레이어 IP·접속 키는 시트의 '화면' 탭에 있음
// =====================================================================

const LED = {
  FILE_NAME: '전광판 관리',
  SCREEN_TAB: '화면',
  SCREEN_HEADERS: ['화면코드', '이름', '가로', '세로', '플레이어IP', '키'],
  DEFAULT_SCREENS: [
    ['lobby', '1층 현관', 1152, 160, '10.10.10.12'],
    ['hall', '3층 대강당', 2304, 256, '10.10.10.11']
  ],
  ITEM_TAB: '콘텐츠',
  ITEM_HEADERS: ['ID', '종류', '제목', '대상', '순서', '사용', '시작', '종료', '표시초', '문구', '글자색', '배경색', '글자크기', '효과', '맞춤', '원본파일', '화면파일', '원본크기', '등록자', '수정일시'],
  TYPES: ['이미지', '문구'],
  EFFECTS: ['고정', '흐름'],
  FITS: ['맞춤', '채움', '늘림'],
  FOLDER_NAME: '전광판 이미지',
  // GitHub에 올린 표시 페이지 주소 (전광판에 등록할 주소의 앞부분)
  PAGE_URL: 'https://ds5ezp.github.io/gjcw-sign/',
  // '전광판 API' 프로젝트의 웹 앱 주소 (연결 확인 버튼에서 사용). 배포 후 입력
  API_URL: 'https://script.google.com/macros/s/AKfycbxX7Oxvmz2owgDoTmdVsrLBOHo3NTB7AE-x-gOsDGL20J-wg8mK9lsqBIH8_5eXZbxP/exec'
};

function ledSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty('LED_SHEET_ID');
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(LED.FILE_NAME);
    ss.getSheets()[0].setName(LED.ITEM_TAB);
    props.setProperty('LED_SHEET_ID', ss.getId());
  }
  return ss;
}

function ledTab_(name, headers) {
  const ss = ledSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function newLedKey_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 20);
}

// 화면 탭이 비어 있으면 현관·대강당을 넣고 화면마다 접속 키를 만듦
function ledScreenSheet_() {
  const sheet = ledTab_(LED.SCREEN_TAB, LED.SCREEN_HEADERS);
  if (sheet.getLastRow() === 1) {
    const rows = LED.DEFAULT_SCREENS.map(s => s.concat([newLedKey_()]));
    sheet.getRange(2, 1, rows.length, LED.SCREEN_HEADERS.length).setNumberFormat('@').setValues(rows);
  }
  return sheet;
}

function ledItemSheet_() {
  return ledTab_(LED.ITEM_TAB, LED.ITEM_HEADERS);
}

function ledScreens_() {
  return ledScreenSheet_().getDataRange().getValues().slice(1).map((v, i) => ({
    row: i + 2,
    code: String(v[0] || '').trim(),
    name: String(v[1] || '').trim(),
    w: Number(v[2]) || 0,
    h: Number(v[3]) || 0,
    ip: String(v[4] || '').trim(),
    key: String(v[5] || '').trim()
  })).filter(s => s.code && s.w && s.h);
}

function ledFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('LED_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* 폴더가 없으면 새로 만듦 */ }
  }
  const folder = DriveApp.createFolder(LED.FOLDER_NAME);
  props.setProperty('LED_FOLDER_ID', folder.getId());
  return folder;
}

// 시트 칸 값을 'yyyy-MM-dd HH:mm' 로 (시트에서 직접 고쳐 날짜 형식이 된 경우도 처리)
function ledTime_(value) {
  if (value instanceof Date) return fmt_(value, 'yyyy-MM-dd HH:mm');
  return String(value || '').trim();
}

// '화면파일' 칸: lobby:파일ID,hall:파일ID
function parseLedFiles_(text) {
  const files = {};
  String(text || '').split(',').forEach(part => {
    const i = part.indexOf(':');
    if (i > 0) files[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return files;
}

function ledItems_() {
  return ledItemSheet_().getDataRange().getValues().slice(1).map((v, i) => ({
    row: i + 2,
    id: String(v[0] || '').trim(),
    type: String(v[1] || '').trim(),
    title: String(v[2] || ''),
    targets: String(v[3] || '').split(',').map(s => s.trim()).filter(Boolean),
    order: Number(v[4]) || 0,
    enabled: String(v[5] || '').trim().toUpperCase() !== 'N',
    start: ledTime_(v[6]),
    end: ledTime_(v[7]),
    seconds: Number(v[8]) || 10,
    text: String(v[9] || ''),
    color: String(v[10] || '#ffffff'),
    bg: String(v[11] || '#000000'),
    size: Number(v[12]) || 60,
    effect: String(v[13] || '고정'),
    fit: String(v[14] || '맞춤'),
    original: String(v[15] || '').trim(),
    files: parseLedFiles_(v[16]),
    originalSize: String(v[17] || ''),
    author: String(v[18] || ''),
    updatedAt: ledTime_(v[19])
  })).filter(r => r.id).sort((a, b) => a.order - b.order || a.row - b.row);
}

function ledItemValues_(it) {
  return [
    it.id, it.type, it.title, it.targets.join(','), String(it.order), it.enabled ? 'Y' : 'N', it.start, it.end,
    String(it.seconds), it.text, it.color, it.bg, String(it.size), it.effect, it.fit, it.original,
    Object.keys(it.files).map(k => k + ':' + it.files[k]).join(','), it.originalSize, it.author, it.updatedAt
  ];
}

function ledPageUrl_(screen) {
  return LED.PAGE_URL + '?screen=' + encodeURIComponent(screen.code) + '&key=' + encodeURIComponent(screen.key);
}

// 관리 화면에 필요한 전체 자료
function getLedData() {
  requireUser_();
  const ss = ledSpreadsheet_();
  const screens = ledScreens_().map(s => ({
    code: s.code, name: s.name, w: s.w, h: s.h, ip: s.ip, key: s.key, url: ledPageUrl_(s)
  }));
  return {
    screens: screens,
    items: ledItems_().map(r => {
      const copy = Object.assign({}, r);
      delete copy.row;
      return copy;
    }),
    sheetId: ss.getId(),
    sheetUrl: ss.getUrl(),
    folderUrl: ledFolder_().getUrl(),
    apiReady: !!LED.API_URL,
    now: fmt_(new Date(), 'yyyy-MM-dd HH:mm')
  };
}

// 이미지 한 장 저장 (원본, 또는 화면 해상도에 맞춘 사진). 저장된 파일 ID를 돌려줌
function uploadLedImage(name, mime, data) {
  requireUser_();
  mime = String(mime || '');
  if (mime.indexOf('image/') !== 0) throw new Error('이미지 파일만 올릴 수 있습니다.');
  const bytes = Utilities.base64Decode(data);
  if (bytes.length > MAX_UPLOAD_BYTES) throw new Error('이미지가 너무 큽니다. (20MB 이하)');
  return ledFolder_().createFile(Utilities.newBlob(bytes, mime, String(name || 'image'))).getId();
}

function isLedFile_(file) {
  const folderId = ledFolder_().getId();
  const parents = file.getParents();
  while (parents.hasNext()) { if (parents.next().getId() === folderId) return true; }
  return false;
}

// 미리보기용 이미지 데이터 (전광판 이미지 폴더의 파일만)
function getLedImage(fileId) {
  requireUser_();
  const file = DriveApp.getFileById(String(fileId || ''));
  if (!isLedFile_(file)) throw new Error('전광판 이미지가 아닙니다.');
  const blob = file.getBlob();
  return 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

// 더 이상 쓰지 않는 이미지는 드라이브 휴지통으로 (30일 안에 되살릴 수 있음)
function trashLedFiles_(ids) {
  ids.filter(Boolean).forEach(id => {
    try {
      const file = DriveApp.getFileById(id);
      if (isLedFile_(file)) file.setTrashed(true);
    } catch (e) {
      Logger.log('전광판 이미지 정리 실패 (' + id + '): ' + e.message);
    }
  });
}

function checkLedTime_(value, label) {
  const s = String(value || '').trim();
  if (s && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) throw new Error(label + ' 일시를 확인해 주세요.');
  return s;
}

function checkLedColor_(value, fallback) {
  const s = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

// 콘텐츠 저장 (id 가 없으면 새로 등록, 맨 뒤 순서). 이미지 파일은 uploadLedImage 로 먼저 올린 뒤 ID만 넘김
function saveLedItem(input) {
  const email = requireUser_();
  const screens = ledScreens_();
  const codes = screens.map(s => s.code);
  const type = LED.TYPES.indexOf(input.type) === -1 ? '' : input.type;
  if (!type) throw new Error('종류를 골라 주세요.');
  const targets = (input.targets || []).filter(t => codes.indexOf(t) !== -1);
  if (!targets.length) throw new Error('표시할 화면을 하나 이상 골라 주세요.');
  const start = checkLedTime_(input.start, '시작');
  const end = checkLedTime_(input.end, '종료');
  if (start && end && end <= start) throw new Error('종료 일시가 시작 일시보다 뒤여야 합니다.');
  const seconds = Math.round(Number(input.seconds));
  if (!(seconds >= 1 && seconds <= 3600)) throw new Error('표시 시간은 1~3600초로 입력해 주세요.');
  const text = String(input.text || '').trim();
  if (type === '문구' && !text) throw new Error('문구를 입력해 주세요.');
  const files = {};
  if (type === '이미지') {
    targets.forEach(t => {
      const id = String((input.files || {})[t] || '').trim();
      if (!id) throw new Error('화면에 맞춘 이미지가 없습니다. 이미지를 다시 골라 주세요.');
      files[t] = id;
    });
    if (!input.original) throw new Error('이미지를 골라 주세요.');
  }

  return withLock_(() => {
    const sheet = ledItemSheet_();
    const items = ledItems_();
    const old = input.id ? items.filter(r => r.id === input.id)[0] : null;
    if (input.id && !old) throw new Error('해당 콘텐츠를 찾을 수 없습니다. 새로고침해 주세요.');
    const item = {
      id: old ? old.id : 'L' + fmt_(new Date(), 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10),
      type: type,
      title: String(input.title || '').trim(),
      targets: targets,
      order: old ? old.order : items.reduce((max, r) => Math.max(max, r.order), 0) + 1,
      enabled: input.enabled !== false,
      start: start,
      end: end,
      seconds: seconds,
      text: type === '문구' ? text : '',
      color: checkLedColor_(input.color, '#ffffff'),
      bg: checkLedColor_(input.bg, '#000000'),
      size: Math.min(100, Math.max(10, Math.round(Number(input.size) || 60))),
      effect: LED.EFFECTS.indexOf(input.effect) === -1 ? '고정' : input.effect,
      fit: LED.FITS.indexOf(input.fit) === -1 ? '맞춤' : input.fit,
      original: type === '이미지' ? String(input.original) : '',
      files: files,
      originalSize: type === '이미지' ? String(input.originalSize || '') : '',
      author: old ? old.author : staffName_(email),
      updatedAt: fmt_(new Date(), 'yyyy-MM-dd HH:mm')
    };
    const row = old ? old.row : sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, LED.ITEM_HEADERS.length).setNumberFormat('@').setValues([ledItemValues_(item)]);
    if (old) {
      // 바뀐 이미지의 예전 파일 정리
      const keep = [item.original].concat(Object.keys(files).map(k => files[k]));
      trashLedFiles_([old.original].concat(Object.keys(old.files).map(k => old.files[k])).filter(id => keep.indexOf(id) === -1));
    }
    log_(old ? '전광판 수정' : '전광판 등록', item.type + ' ' + (item.title || item.text.slice(0, 20)) + ' → ' + targets.join(','));
    return item.id;
  });
}

// 순서 저장: 화면에 보이는 순서대로 ID 목록을 받아 1부터 다시 매김
function setLedOrder(ids) {
  requireUser_();
  return withLock_(() => {
    const sheet = ledItemSheet_();
    const items = ledItems_();
    const pos = {};
    (ids || []).forEach((id, i) => { pos[id] = i + 1; });
    let next = (ids || []).length;
    items.forEach(r => {
      const order = pos[r.id] || ++next;
      if (order !== r.order) sheet.getRange(r.row, 5).setNumberFormat('@').setValue(String(order));
    });
    log_('전광판 순서 변경', (ids || []).length + '개');
    return true;
  });
}

function setLedEnabled(id, enabled) {
  requireUser_();
  const hit = ledItems_().filter(r => r.id === id)[0];
  if (!hit) throw new Error('해당 콘텐츠를 찾을 수 없습니다. 새로고침해 주세요.');
  ledItemSheet_().getRange(hit.row, 6).setValue(enabled ? 'Y' : 'N');
  log_('전광판 ' + (enabled ? '사용' : '중지'), hit.type + ' ' + (hit.title || hit.text.slice(0, 20)));
  return true;
}

function deleteLedItem(id) {
  requireUser_();
  return withLock_(() => {
    const hit = ledItems_().filter(r => r.id === id)[0];
    if (!hit) throw new Error('해당 콘텐츠를 찾을 수 없습니다. 새로고침해 주세요.');
    ledItemSheet_().deleteRow(hit.row);
    trashLedFiles_([hit.original].concat(Object.keys(hit.files).map(k => hit.files[k])));
    log_('전광판 삭제', hit.type + ' ' + (hit.title || hit.text.slice(0, 20)));
    return true;
  });
}

// 접속 키를 새로 만듦. 예전 주소로 열린 전광판은 다음 확인 때 검은 화면이 되므로 ViPlex 주소도 바꿔야 함
function resetLedKey(code) {
  requireUser_();
  const hit = ledScreens_().filter(s => s.code === code)[0];
  if (!hit) throw new Error('해당 화면을 찾을 수 없습니다.');
  const key = newLedKey_();
  ledScreenSheet_().getRange(hit.row, 6).setNumberFormat('@').setValue(key);
  log_('전광판 키 변경', hit.name);
  return ledPageUrl_({ code: hit.code, key: key });
}

// 전광판 API 가 목록을 제대로 돌려주는지 확인 (전광판이 받는 것과 같은 요청)
function checkLedApi(code) {
  requireUser_();
  if (!LED.API_URL) throw new Error('Code.gs 위쪽 LED.API_URL 에 전광판 API 주소를 먼저 넣어 주세요.');
  const hit = ledScreens_().filter(s => s.code === code)[0];
  if (!hit) throw new Error('해당 화면을 찾을 수 없습니다.');
  const res = UrlFetchApp.fetch(LED.API_URL + '?fn=list&screen=' + encodeURIComponent(code) + '&key=' + encodeURIComponent(hit.key), { muteHttpExceptions: true });
  let body = null;
  try { body = JSON.parse(res.getContentText()); } catch (e) { body = null; }
  if (!body) return { ok: false, message: 'API 응답이 올바르지 않습니다. (HTTP ' + res.getResponseCode() + ') 배포 액세스가 \'모든 사용자\'인지 확인해 주세요.' };
  if (!body.ok) return { ok: false, message: 'API가 키를 거부했습니다. API 프로젝트의 SHEET_ID 가 이 시트와 같은지 확인해 주세요.' };
  // API 안에서 오류가 난 경우 (권한, 시트 ID 등). 전광판은 이때 보던 화면을 그대로 유지함
  if (body.error) return { ok: false, message: 'API 오류: ' + body.error + ' (API 프로젝트를 새 버전으로 다시 배포했는지 확인해 주세요)' };
  return { ok: true, message: '정상 · 지금 받을 수 있는 콘텐츠 ' + body.items.length + '개' };
}

// =====================================================================
// 냉난방 현황 (읽기 전용): 삼성 DMS2.5 / LG ACP5 실내기 상태와 오늘 스케줄
// 현황은 '냉난방 API' 프로젝트가 받아 '냉난방 현황' 시트에 넣고, 여기서는 그 시트를 읽기만 함
// 켜기·끄기는 각 관리 화면(HVAC.LINKS)에서 함
// =====================================================================

const HVAC = {
  FILE_NAME: '냉난방 현황',
  STATUS_TAB: '현황',
  SETTING_TAB: '설정',
  STALE_SEC: 180,   // 이 시간 넘게 새 값이 안 오면 '연결 끊김'
  LINKS: [
    { name: '삼성 에어컨 관리(DMS)', url: 'https://10.10.10.120/dms2/main/main.jsp' },
    { name: 'LG 에어컨 관리(ACP5)', url: 'https://10.10.10.145' }
  ]
};

function hvacSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty('HVAC_SHEET_ID');
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(HVAC.FILE_NAME);
    ss.getSheets()[0].setName(HVAC.STATUS_TAB);
    props.setProperty('HVAC_SHEET_ID', ss.getId());
  }
  // 설정 탭: B1 = 냉난방 API 접속 키 (처음 한 번 만듦)
  let setting = ss.getSheetByName(HVAC.SETTING_TAB);
  if (!setting) {
    setting = ss.insertSheet(HVAC.SETTING_TAB);
    setting.getRange('A1:B1').setNumberFormat('@').setValues([['접속 키', newLedKey_()]]);
  }
  return ss;
}

function hvacKey_(ss) {
  return String(ss.getSheetByName(HVAC.SETTING_TAB).getRange('B1').getValue() || '').trim();
}

// 마지막으로 받은 현황 (현황 탭 2행: 받은 시각, 수집 시각, JSON 조각들)
function getHvacData() {
  requireUser_();
  const ss = hvacSpreadsheet_();
  const sheet = ss.getSheetByName(HVAC.STATUS_TAB);
  let snapshot = null;
  let receivedAt = '';
  if (sheet && sheet.getLastRow() >= 2) {
    const row = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    receivedAt = row[0];
    try { snapshot = JSON.parse(row.slice(2).join('')); } catch (e) { snapshot = null; }
  }
  const ageSec = receivedAt ? Math.round((Date.now() - new Date(receivedAt + '+09:00').getTime()) / 1000) : null;
  return {
    receivedAt: receivedAt,
    ageSec: ageSec,
    stale: ageSec === null || ageSec > HVAC.STALE_SEC,
    staleSec: HVAC.STALE_SEC,
    collectedAt: snapshot ? snapshot.collectedAt : '',
    units: snapshot ? snapshot.units : [],
    schedules: snapshot ? snapshot.schedules : [],
    links: HVAC.LINKS
  };
}

// 연결 설정 탭: 냉난방 API 에 넣을 시트 ID, 보내는 쪽에 넣을 접속 키
function getHvacSetup() {
  requireUser_();
  const ss = hvacSpreadsheet_();
  return { sheetId: ss.getId(), sheetUrl: ss.getUrl(), key: hvacKey_(ss) };
}

// 접속 키를 새로 만듦. 보내는 쪽 설정도 새 키로 바꿔야 다시 받음
function resetHvacKey() {
  requireUser_();
  const ss = hvacSpreadsheet_();
  const key = newLedKey_();
  ss.getSheetByName(HVAC.SETTING_TAB).getRange('B1').setNumberFormat('@').setValue(key);
  log_('냉난방 키 변경', '');
  return key;
}

// =====================================================================
// 사이니지 셔틀 지도 설정 (대시보드 셔틀 탭의 스위치·표시 시작 시점)
// 운영설정 시트의 세 칸: '셔틀 지도 표시' (ON/OFF), '셔틀 표시 시작(분 전)' (5/10/15/20/30),
// '셔틀 표시 기준' (출발/도착)
// =====================================================================

const SHUTTLE_SIGNAGE_LABEL = '셔틀 지도 표시';
const SHUTTLE_LEAD_LABEL = '셔틀 표시 시작(분 전)';
const SHUTTLE_BASE_LABEL = '셔틀 표시 기준';

function readSettingValue_(label) {
  const row = readSettings_().rows.find(x => String(x.key).trim() === label);
  return row ? String(row.value).trim() : '';
}

function getShuttleSignageOn() {
  requireUser_();
  const lead = parseInt(readSettingValue_(SHUTTLE_LEAD_LABEL), 10);
  return {
    on: readSettingValue_(SHUTTLE_SIGNAGE_LABEL).toUpperCase() === 'ON',
    lead: isNaN(lead) ? 10 : Math.min(Math.max(lead, 0), 60),
    base: readSettingValue_(SHUTTLE_BASE_LABEL) === '도착' ? '도착' : '출발'
  };
}

// 운영설정 한 칸을 찾아 값을 바꾸고, 없으면 맨 아래에 한 줄 추가
function upsertSettingRow_(sheet, label, value, note) {
  const labels = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getDisplayValues();
  const idx = labels.findIndex(r => String(r[0]).trim() === label);
  if (idx === -1) {
    sheet.appendRow([label, value, note]);
  } else {
    sheet.getRange(idx + 1, 2).setNumberFormat('@').setValue(value);
  }
}

function saveShuttleSignage(on, lead, base) {
  requireUser_();
  return withLock_(() => {
    const sheet = lobbySheet_('운영설정');
    const minutes = Math.min(Math.max(parseInt(lead, 10) || 10, 0), 60);
    const baseLabel = base === '도착' ? '도착' : '출발';
    upsertSettingRow_(sheet, SHUTTLE_SIGNAGE_LABEL, on ? 'ON' : 'OFF', '셔틀 실시간 지도를 전관 사이니지 위쪽에 띄울지 (ON/OFF)');
    upsertSettingRow_(sheet, SHUTTLE_LEAD_LABEL, String(minutes), '기준 시각 몇 분 전부터 지도에 나올지 (5/10/15/20/30)');
    upsertSettingRow_(sheet, SHUTTLE_BASE_LABEL, baseLabel, '지도 표시 기준: 출발 (첫 출발 전부터) / 도착 (마지막 도착 전부터)');
    SpreadsheetApp.flush();
    log_('셔틀 지도 사이니지 표시', (on ? 'ON' : 'OFF') + ' / ' + baseLabel + ' ' + minutes + '분 전');
    return { on: !!on, lead: minutes, base: baseLabel };
  });
}
