/**
 * 어르신 배움터 접수 시스템 (학기별 구조)
 *
 * - 학기 목록은 REGISTRY_ID 스프레드시트의 '학기목록' 탭에서 읽습니다.
 *   새 학기는 그 탭에 행을 추가하면 됩니다. (README.md 참고)
 * - 웹앱 주소에 ?term=학기ID 를 붙이면 그 학기로 열리고, 없으면 '사용'이 Y 인 학기가 열립니다.
 */

const REGISTRY_ID = '1_mRID4mwFypGU8pSFMZcwf35NDqjpTLuUUoe2a-mPvc';
const REGISTRY_TAB = '학기목록';
const CONFIG_TAB = '환경설정';
const RESTRICT_TAB = '중복제한강좌';
const BACKUP_TAB = '★접수변경_백업대장';
const PHONE_RE = /^01[016789]-\d{3,4}-\d{4}$/;

// ==========================================
// 1. 학기 정보 (학기목록 탭)
// ==========================================
function listTerms_() {
  const sheet = SpreadsheetApp.openById(REGISTRY_ID).getSheetByName(REGISTRY_TAB);
  if (!sheet) throw new Error("'" + REGISTRY_TAB + "' 탭이 없습니다.");
  const values = sheet.getDataRange().getDisplayValues();
  const h = values[0].map(x => String(x).trim());
  ['학기ID', '학기명', '신청시트ID', '강좌정보시트ID', '강좌탭', '사용'].forEach(n => {
    if (h.indexOf(n) === -1) throw new Error("'" + REGISTRY_TAB + "' 탭에 '" + n + "' 열이 없습니다.");
  });
  const get = (r, name) => {
    const i = h.indexOf(name);
    return i === -1 ? '' : String(r[i]).trim();
  };
  return values.slice(1).filter(r => get(r, '학기ID') !== '').map(r => ({
    id: get(r, '학기ID'),
    name: get(r, '학기명'),
    formId: get(r, '신청시트ID'),
    infoId: get(r, '강좌정보시트ID'),
    respTab: get(r, '신청탭') || 'Form Responses 1',
    courseTab: get(r, '강좌탭'),
    jobTab: get(r, '참여자탭') || '노인일자리참여자',
    group: ['성인', '아동'].indexOf(get(r, '대상')) !== -1 ? get(r, '대상') : '어르신',
    active: get(r, '사용').toUpperCase() === 'Y'
  }));
}

function getTerm_(termId) {
  const terms = listTerms_();
  const id = String(termId || '').trim();
  const t = id ? terms.find(x => x.id === id) : terms.find(x => x.active);
  if (!t) throw new Error('학기 정보를 찾을 수 없습니다. (' + (id || '사용 중인 학기 없음') + ')');
  return t;
}

function termInfo_(t) { return SpreadsheetApp.openById(t.infoId); }
function termForm_(t) { return SpreadsheetApp.openById(t.formId); }

function respSheet_(t) {
  const s = termForm_(t).getSheetByName(t.respTab);
  if (!s) throw new Error("신청 탭 '" + t.respTab + "'을 찾을 수 없습니다.");
  return s;
}

function courseSheet_(t) {
  const s = termInfo_(t).getSheetByName(t.courseTab);
  if (!s) throw new Error("강좌정보 탭 '" + t.courseTab + "'을 찾을 수 없습니다.");
  return s;
}

// 결과 화면 안내 문구: 환경설정 B4 수납기간, B5 문의, B6 추가 안내 (대시보드에서 입력)
function noticeOf_(t) {
  const sheet = termInfo_(t).getSheetByName(CONFIG_TAB);
  const get = a1 => sheet ? String(sheet.getRange(a1).getDisplayValue() || '').trim() : '';
  return { period: get('B4'), contact: get('B5'), extra: get('B6') };
}

// 일정: 환경설정 A2 접수 시작, B2 마감, C2 결과 발표, D2 신청 화면 주소
function scheduleOf_(t) {
  const config = termInfo_(t).getSheetByName(CONFIG_TAB);
  const at = a1 => {
    if (!config) return null;
    const v = config.getRange(a1).getValue();
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  return {
    start: at('A2'),
    end: at('B2'),
    result: at('C2'),
    appUrl: config ? String(config.getRange('D2').getValue()).trim() : ''
  };
}

// ==========================================
// 2. 공통 유틸리티
// ==========================================
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function normalizeName(n) { return String(n || '').replace(/[\s ]+/g, '').trim(); }
function normalizeDOBString(s) { return String(s || '').replace(/[^0-9]/g, '').slice(-6); }

// 연락처 비교용: 하이픈 제거, 숫자로 저장돼 0이 빠진 경우(10자리) 앞에 0 붙임
function digitsOf_(v) {
  let d = String(v || '').replace(/[^0-9]/g, '');
  if (d.length === 10 && d.charAt(0) === '1') d = '0' + d;
  return d;
}

// '[월] 강좌명 | 시간 | 수강료' → '강좌명'
function courseNameOf_(raw) {
  return String(raw || '').replace(/^\[(월|화|수|목|금)\]\s*/, '').split('|')[0].trim();
}

function dayOfHeader_(h) {
  const days = ['월', '화', '수', '목', '금'];
  for (const d of days) {
    if (h === d + '요일' || h === d || (h.indexOf(d) !== -1 && h.indexOf('요일') !== -1)) return d;
  }
  return '';
}

// 시간: 입력된 값 그대로 HH:MM 으로만 맞춤 (분 반올림 없음)
function normalizeTime_(val) {
  if (!val) return '';
  const str = String(val).trim();
  const m = str.match(/(\d{1,2}):(\d{2})/);
  return m ? String(parseInt(m[1], 10)).padStart(2, '0') + ':' + m[2] : str;
}

function showMessage(t, s) {
  return HtmlService.createHtmlOutput(`<div style="text-align:center; padding:50px; font-family:'Malgun Gothic';"><h2>${t}</h2><p>${s}</p></div>`);
}

function include(filename) {
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}

// 강좌정보 탭 읽기 (제출 검증, 화면 표시, 수강료에 모두 사용)
// 학년 목록 (순서대로 비교: 최소~최대 범위 확인에 씀)
const GRADES_ = ['미취학', '1', '2', '3', '4', '5', '6', '중1', '중2', '중3'];
const WEEKDAY_KO_ = ['일', '월', '화', '수', '목', '금', '토'];

function gradeIdx_(g) {
  return GRADES_.indexOf(String(g || '').trim());
}

// '2027-03-03', '2027. 3. 3.' 같은 입력을 yyyy-MM-dd 목록으로
function parseDates_(text) {
  const out = [];
  String(text || '').split(/[,\n]/).forEach(x => {
    const m = x.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (m) out.push(m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'));
  });
  return out;
}

function weekdayOf_(ymd) {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? WEEKDAY_KO_[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] : '';
}

// 정규 과목 요일 문자열 → 요일 배열 ("월요일, 수요일" / "월,수" / "월/수" 모두 허용)
function parseWeekdays_(text) {
  const list = String(text || '').split(/[,\/\s]+/)
    .map(s => s.replace('요일', '').trim())
    .filter(s => ['월', '화', '수', '목', '금'].indexOf(s) !== -1);
  return list.filter((w, i, a) => a.indexOf(w) === i);
}

// 특강·학년 열 머리글 판별 (요일 열과 같은 방식으로 과목 칸을 찾음)
function isCourseHeader_(h) {
  return (h.indexOf('요일') !== -1 || h.indexOf('특강') !== -1) && h.indexOf('면제') === -1 && h.indexOf('수강료') === -1;
}

function readCourses_(t) {
  const data = courseSheet_(t).getDataRange().getDisplayValues();
  const qIdx = data[0].findIndex(h => String(h).indexOf('정원') !== -1);
  const q = qIdx === -1 ? 4 : qIdx;
  return data.slice(1).filter(r => String(r[0]).trim() !== '').map(r => {
    const display = String(r[0]).trim();
    const parts = display.split('|');
    const type = String(r[6] || '').trim() === '특강' ? '특강' : '정규';
    const dates = type === '특강' ? parseDates_(r[9]) : [];
    const weekdays = type === '특강'
      ? dates.map(weekdayOf_).filter((w, i, a) => w && a.indexOf(w) === i)
      : parseWeekdays_(r[1]);
    return {
      display: display,
      name: parts[0].trim(),
      type: type,
      day: type === '특강' ? '특강' : (weekdays[0] || ''),
      weekdays: weekdays,
      dates: dates,
      gradeMin: String(r[7] || '').trim(),
      gradeMax: String(r[8] || '').trim(),
      start: normalizeTime_(r[2]),
      end: normalizeTime_(r[3]),
      quota: parseInt(r[q], 10) || 20,
      feeText: parts.length > 1 ? parts[parts.length - 1].trim() : '시트 확인'
    };
  });
}

// 신청 시트에서 성명·생년월일(·연락처)이 맞는 행 번호(1부터) 찾기. phone 이 undefined 면 연락처는 보지 않음
function findRow_(data, hdrs, name, dob, phone) {
  const nIdx = hdrs.findIndex(h => h.indexOf('성명') !== -1);
  const dIdx = hdrs.findIndex(h => h.indexOf('생년월일') !== -1);
  const pIdx = hdrs.findIndex(h => h.indexOf('연락처') !== -1);
  if (nIdx === -1 || dIdx === -1) throw new Error('신청 시트에 성명/생년월일 열이 없습니다.');
  if (phone !== undefined && pIdx === -1) throw new Error('신청 시트에 연락처 열이 없습니다.');
  const sName = normalizeName(name), sDob = normalizeDOBString(dob), sPhone = digitsOf_(phone);
  for (let i = 1; i < data.length; i++) {
    if (normalizeName(data[i][nIdx]) !== sName || normalizeDOBString(data[i][dIdx]) !== sDob) continue;
    if (phone !== undefined && digitsOf_(data[i][pIdx]) !== sPhone) continue;
    return i + 1;
  }
  return -1;
}

// ==========================================
// 3. 웹앱 진입점
// ==========================================
function doGet(e) {
  const mode = e.parameter.mode;

  // 추첨·통계·합격자 대장은 개인정보가 있어 '복지관 통합 관리 대시보드'로 옮김
  if (mode === 'lottery' || mode === 'stats' || mode === 'winners') {
    return showMessage('관리 화면이 옮겨졌습니다', '추첨·통계·합격자 대장은 복지관 통합 관리 대시보드에서 이용해 주세요.');
  }

  let t;
  try {
    t = getTerm_(e.parameter.term);
  } catch (err) {
    return showMessage('접수 정보를 찾을 수 없습니다', err.message);
  }

  // 강좌별 접수 현황 (누구나 볼 수 있음, 이름·연락처는 가려서 보여 줌)
  if (e.parameter.page === 'status') {
    const tpl = HtmlService.createTemplateFromFile('status');
    tpl.termId = t.id;
    tpl.termName = t.name;
    const url = scheduleOf_(t).appUrl || ScriptApp.getService().getUrl();
    return HtmlService.createHtmlOutput(tpl.evaluate().getContent().replace(/__WEB_APP_URL__/g, url))
      .setTitle(t.name + ' 접수 현황')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  const s = scheduleOf_(t);
  const now = new Date();
  let fileName, pageTitle;
  if (mode === 'check' || (s.end && now > s.end)) {
    fileName = 'check';
    pageTitle = t.name + ' 신청 및 결과 조회';
  } else if (s.start && now < s.start) {
    return showMessage('접수 준비 중', '접수 시작 전입니다. 접수 시작 후 다시 방문해 주세요.');
  } else {
    fileName = 'index';
    pageTitle = t.name + ' 신청';
  }

  const template = HtmlService.createTemplateFromFile(fileName);
  template.termId = t.id;
  template.termName = t.name;
  const webAppUrl = s.appUrl || ScriptApp.getService().getUrl();
  const html = template.evaluate().getContent().replace(/__WEB_APP_URL__/g, webAppUrl);

  return HtmlService.createHtmlOutput(html)
    .setTitle(pageTitle)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ==========================================
// 접수 방식 · 공통 도우미
// 방식: 환경설정 B7 = '선착순' 이면 선착순, 그 밖(비움 포함)은 추첨
// 신청은 제출할 때마다 새 행으로 쌓고, 취소도 백업 탭에 남겨 접수 순번이 바뀌지 않게 함
// ==========================================
function modeOf_(t) {
  const sheet = termInfo_(t).getSheetByName(CONFIG_TAB);
  const v = sheet ? String(sheet.getRange('B7').getDisplayValue() || '').trim() : '';
  return v === '선착순' ? '선착순' : '추첨';
}

// 머리글: 정확히 같은 이름을 먼저 찾고, 없으면 포함된 이름을 찾음
function headerIdx_(hdrs, key) {
  const exact = hdrs.indexOf(key);
  if (exact !== -1) return exact;
  return hdrs.findIndex(h => h.indexOf(key) !== -1);
}

// 생년월일 6자리(yymmdd)로 만 나이 계산 (한국 시간 기준)
// 기준일(yyyy-MM-dd, 없으면 오늘) 기준 만 나이
function ageOf_(dob6, refStr) {
  const yy = parseInt(dob6.slice(0, 2), 10), mm = parseInt(dob6.slice(2, 4), 10), dd = parseInt(dob6.slice(4, 6), 10);
  if (isNaN(yy) || isNaN(mm) || isNaN(dd)) return NaN;
  const ref = parseRef_(refStr);
  const by = (yy > ref.y % 100 ? 1900 : 2000) + yy;
  let age = ref.y - by;
  if (ref.m < mm || (ref.m === mm && ref.d < dd)) age--;
  return age;
}

// 기준일 문자열을 {y, m, d} 로 (형식이 아니면 오늘)
function parseRef_(refStr) {
  const m = String(refStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  const n = new Date();
  return {
    y: Number(Utilities.formatDate(n, 'GMT+9', 'yyyy')),
    m: Number(Utilities.formatDate(n, 'GMT+9', 'M')),
    d: Number(Utilities.formatDate(n, 'GMT+9', 'd'))
  };
}

// 학기별 신청 조건: 환경설정 B8 나이 최소, B9 나이 최대, B10 최대 신청 과목 수 (비우면 대상별 기본값)
const DEFAULT_AGE_ = { '어르신': [60, 120], '성인': [20, 64], '아동': [6, 13] };

const DEFAULT_BENEFITS_ = ['해당없음', '기초생활수급자', '차상위계층', '국가유공자', '중증장애인'];

// 학기별 신청 조건 전부 (B8 나이 최소, B9 나이 최대, B10 최대 과목 수, B11 면제 항목, B12 대기 허용)
function conditionsOf_(t) {
  const sheet = termInfo_(t).getSheetByName(CONFIG_TAB);
  const txt = a1 => sheet ? String(sheet.getRange(a1).getDisplayValue() || '').trim() : '';
  const num = a1 => {
    if (!sheet) return NaN;
    const v = String(sheet.getRange(a1).getDisplayValue() || '').trim();
    return v === '' ? NaN : Number(v);
  };
  const def = DEFAULT_AGE_[t.group] || DEFAULT_AGE_['어르신'];
  let min = num('B8'), max = num('B9');
  if (isNaN(min)) min = def[0];
  if (isNaN(max)) max = def[1];
  let maxCourses = num('B10');
  if (isNaN(maxCourses) || maxCourses < 1) maxCourses = 5;
  let benefits = txt('B11').split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  if (!benefits.length) benefits = DEFAULT_BENEFITS_.slice();
  const waitAllowed = txt('B12') !== 'N';
  // 기준일 방식: 접수시작(기본) / 과정시작(B15) / 직접(B13)
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const method = txt('B14');
  let refDate = '';
  if (method === '과정시작' && isDate(txt('B15'))) refDate = txt('B15');
  else if (method === '직접' && isDate(txt('B13'))) refDate = txt('B13');
  if (!refDate) {
    const start = scheduleOf_(t).start;
    refDate = start ? Utilities.formatDate(start, 'GMT+9', 'yyyy-MM-dd') : '';
  }
  const cond = { ageMin: min, ageMax: max, maxCourses: maxCourses, benefits: benefits, waitAllowed: waitAllowed, refDate: refDate };
  cond.cutoffText = cutoffText_(cond);
  return cond;
}

// 한 강좌에 지금 신청되어 있는 인원 (행 기준)
function countCourse_(data, hdrs, courseName) {
  let n = 0;
  for (let i = 1; i < data.length; i++) {
    if (rowCourses_(data[i], hdrs).indexOf(courseName) !== -1) n++;
  }
  return n;
}

// 나이 확인 (기준일 기준 만 나이)
function checkAge_(cond, dob6) {
  const age = ageOf_(dob6, cond.refDate);
  if (isNaN(age) || age < cond.ageMin || age > cond.ageMax) {
    throw new Error('이 배움터는 ' + cond.cutoffText + ' 신청할 수 있어요.\n(만 ' + cond.ageMin + '세 이상' + (cond.ageMax >= 120 ? '' : ' ~ ' + cond.ageMax + '세 이하') + ', 기준일 ' + cond.refDate + ')');
  }
}

// 기준일 기준 출생 날짜 안내 (예: 1946년 8월 9일 ~ 1966년 8월 8일 출생)
function cutoffText_(cond) {
  const r = parseRef_(cond.refDate);
  const fmt = (y, m, d) => y + '년 ' + m + '월 ' + d + '일';
  const latest = fmt(r.y - cond.ageMin, r.m, r.d) + ' 이전 출생';
  if (cond.ageMax >= 120) return latest;
  const e = new Date(r.y - cond.ageMax - 1, r.m - 1, r.d + 1);
  return fmt(e.getFullYear(), e.getMonth() + 1, e.getDate()) + ' 이후 출생 ~ ' + latest;
}

function toTs_(v) {
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// 한 행의 강좌 칸에 적힌 항목 원문 ("[월] 강좌 | 시간 | 수강료")
function rowCellItems_(row, hdrs) {
  const items = [];
  hdrs.forEach((h, idx) => {
    if (isCourseHeader_(h) && row[idx]) {
      String(row[idx]).split(', ').forEach(c => { if (c.trim()) items.push(c.trim()); });
    }
  });
  return items;
}

function rowCourses_(row, hdrs) {
  const out = [];
  rowCellItems_(row, hdrs).forEach(c => {
    const n = courseNameOf_(c);
    if (n && out.indexOf(n) === -1) out.push(n);
  });
  return out;
}

// 같은 사람(이름+생년월일+연락처)의 활성 신청 행 번호들 (1부터)
function personRows_(data, hdrs, name, dob, phone) {
  const nIdx = headerIdx_(hdrs, '성명'), dIdx = headerIdx_(hdrs, '생년월일'), pIdx = headerIdx_(hdrs, '연락처');
  if (nIdx === -1 || dIdx === -1 || pIdx === -1) throw new Error('신청 시트에 성명·생년월일·연락처 열이 없습니다.');
  const sName = normalizeName(name), sDob = normalizeDOBString(dob), sPhone = digitsOf_(phone);
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (normalizeName(data[i][nIdx]) !== sName) continue;
    if (normalizeDOBString(data[i][dIdx]) !== sDob) continue;
    if (digitsOf_(data[i][pIdx]) !== sPhone) continue;
    out.push(i + 1);
  }
  return out;
}

function backupSheet_(t) {
  return termForm_(t).getSheetByName(BACKUP_TAB);
}

function queueItem_(row, hdrs, cancelled) {
  const nIdx = headerIdx_(hdrs, '성명'), dIdx = headerIdx_(hdrs, '생년월일'), pIdx = headerIdx_(hdrs, '연락처');
  const ts = toTs_(row[0]);
  return {
    ts: ts,
    time: ts ? Utilities.formatDate(new Date(ts), 'GMT+9', 'MM-dd HH:mm') : '',
    name: String(row[nIdx] || '').trim(),
    dob: String(row[dIdx] || '').trim(),
    phone: String(row[pIdx] || '').trim(),
    cancelled: cancelled
  };
}

// 강좌 한 과목의 접수 순번 목록 (활성 신청 + 취소 기록을 함께 보고 순번을 매김)
// 순번은 신청 시각 순으로 한 번 정해지면 취소해도 바뀌지 않음. 상태는 취소를 뺀 순서로 계산 (앞 사람이 취소하면 대기자가 올라감)
function courseQueue_(t, courseName) {
  const data = respSheet_(t).getDataRange().getValues();
  const hdrs = data[0].map(h => String(h).trim());
  const items = [];
  for (let i = 1; i < data.length; i++) {
    if (rowCourses_(data[i], hdrs).indexOf(courseName) === -1) continue;
    items.push(queueItem_(data[i], hdrs, false));
  }
  const bk = backupSheet_(t);
  if (bk && bk.getLastRow() > 1) {
    const bdata = bk.getDataRange().getValues();
    const bh = bdata[0].slice(2).map(h => String(h).trim());
    for (let i = 1; i < bdata.length; i++) {
      if (String(bdata[i][1]).indexOf('취소') === -1) continue;
      const orig = bdata[i].slice(2);
      if (rowCourses_(orig, bh).indexOf(courseName) === -1) continue;
      items.push(queueItem_(orig, bh, true));
    }
  }
  items.sort((a, b) => a.ts - b.ts);
  items.forEach((it, i) => { it.seq = i + 1; });
  const course = readCourses_(t).find(c => c.name === courseName);
  const quota = course ? course.quota : 0;
  let pos = 0;
  items.forEach(it => {
    if (it.cancelled) { it.status = '취소'; return; }
    pos++;
    if (pos <= quota) it.status = '접수완료';
    else { it.status = '대기'; it.waitNo = pos - quota; }
  });
  return items;
}

// 공개 화면용 가리기: 김원민 → 김*민, 010-3333-4444 → 010-3333-****
function maskName_(name) {
  const n = String(name || '').replace(/\s/g, '');
  if (n.length <= 1) return n;
  if (n.length === 2) return n.charAt(0) + '*';
  return n.charAt(0) + '*'.repeat(n.length - 2) + n.charAt(n.length - 1);
}

function maskPhone_(phone) {
  const d = digitsOf_(phone);
  if (d.length >= 11) return d.slice(0, 3) + '-' + d.slice(3, 7) + '-****';
  if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-****';
  return '';
}

// 공개 접수 현황 (이름 가리기, 연락처 가리기, 신청일시·순번·상태)
function getPublicStatus(termId, courseName) {
  const t = getTerm_(termId);
  const course = readCourses_(t).find(c => c.name === String(courseName || ''));
  if (!course) throw new Error('강좌를 찾을 수 없습니다.');
  const mode = modeOf_(t);
  const list = courseQueue_(t, course.name);
  return {
    course: course.name,
    quota: course.quota,
    mode: mode,
    active: list.filter(x => !x.cancelled && x.status === '접수완료').length,
    waiting: list.filter(x => x.status === '대기').length,
    cancelled: list.filter(x => x.cancelled).length,
    rows: list.map(x => ({
      seq: x.seq,
      time: x.time,
      name: maskName_(x.name),
      phone: maskPhone_(x.phone),
      status: x.status === '대기' ? '대기 ' + x.waitNo + '번' : x.status,
      cancelled: !!x.cancelled
    })),
    checkedAt: Utilities.formatDate(new Date(), 'GMT+9', 'MM-dd HH:mm')
  };
}

// ==========================================
// 4. 수강신청 제출 (같은 강좌 중복 차단, 다른 강좌는 추가 신청)
// ==========================================
function submitForm(f) {
  return withLock_(() => {
    const t = getTerm_(f.term);
    const name = String(f.name || '').trim();
    const dob = normalizeDOBString(f.dob);
    const phone = String(f.phone || '').trim();
    const guardian = String(f.guardian || '').trim();
    if (!name) throw new Error('성명을 입력해 주세요.');
    if (dob.length !== 6) throw new Error('생년월일 6자리를 입력해 주세요.');
    if (!PHONE_RE.test(phone)) throw new Error('연락처는 010-0000-0000 형식으로 입력해 주세요.');
    if (t.group === '아동' && !guardian) throw new Error('보호자 성함을 입력해 주세요.');
    const cond = conditionsOf_(t);
    checkAge_(cond, dob);

    const selected = Array.isArray(f.selectedCourses) ? f.selectedCourses : [];
    if (selected.length === 0) throw new Error('과목을 선택해 주세요.');
    if (selected.length > cond.maxCourses) throw new Error('한 번에 최대 ' + cond.maxCourses + '개까지 신청할 수 있어요.');
    if (cond.benefits.indexOf(String(f.benefit || '')) === -1) throw new Error('수강료 면제 항목을 다시 선택해 주세요.');

    const byDisplay = {};
    readCourses_(t).forEach(c => { byDisplay[c.display] = c; });
    selected.forEach(d => {
      if (!byDisplay[d]) throw new Error('강좌 정보가 변경되었습니다. 새로고침 후 다시 선택해 주세요.');
    });

    const sheet = respSheet_(t);
    const data = sheet.getDataRange().getValues();
    const hdrs = data[0].map(h => String(h).trim());

    // 학년: 아동 학기는 학년을 꼭 고르고, 강좌의 학년 범위에 맞아야 신청할 수 있음
    const grade = String(f.grade || '').trim();
    const gi = gradeIdx_(grade);
    const needGrade = t.group === '아동' || selected.some(d => byDisplay[d].gradeMin || byDisplay[d].gradeMax);
    if (needGrade && gi === -1) throw new Error('학년을 골라 주세요.');
    selected.forEach(d => {
      const c = byDisplay[d];
      if (!c.gradeMin && !c.gradeMax) return;
      const lo = c.gradeMin ? gradeIdx_(c.gradeMin) : 0;
      const hi = c.gradeMax ? gradeIdx_(c.gradeMax) : GRADES_.length - 1;
      if (gi < lo || gi > hi) throw new Error('"' + c.name + '" 강좌는 선택한 학년이 대상이 아니에요.');
    });
    // 예전에 만든 신청 시트에 '특강'·'학년' 열이 없으면 맨 오른쪽에 머리글만 추가 (기존 데이터는 그대로)
    if (selected.some(d => byDisplay[d].type === '특강') && !hdrs.some(h => h.indexOf('특강') !== -1)) {
      sheet.getRange(1, hdrs.length + 1).setValue('특강');
      hdrs.push('특강');
    }
    if (needGrade && !hdrs.some(h => h.indexOf('학년') !== -1)) {
      sheet.getRange(1, hdrs.length + 1).setValue('학년');
      hdrs.push('학년');
    }

    // 같은 사람이 이미 신청한 강좌는 막음 (다른 강좌는 추가 신청 가능)
    const already = {};
    personRows_(data, hdrs, name, dob, phone).forEach(r => {
      rowCourses_(data[r - 1], hdrs).forEach(c => { already[c] = true; });
    });
    const dup = selected.map(d => byDisplay[d].name).filter(n => already[n]);
    if (dup.length) {
      throw new Error('이미 신청한 강좌입니다: ' + dup.join(', ') + '\n다른 강좌는 추가로 신청할 수 있어요.');
    }
    if (!cond.waitAllowed) {
      const full = selected.map(d => byDisplay[d]).filter(c => countCourse_(data, hdrs, c.name) >= c.quota).map(c => c.name);
      if (full.length) throw new Error('정원이 마감된 강좌예요: ' + full.join(', '));
    }
    const total = Object.keys(already).length + selected.length;
    if (total > cond.maxCourses) {
      throw new Error('신청할 수 있는 최대 과목 수는 ' + cond.maxCourses + '개예요. (지금 ' + Object.keys(already).length + '개 신청 중)');
    }

    const nRow = new Array(hdrs.length).fill('');
    hdrs.forEach((h, i) => {
      if (h === '타임스탬프') { nRow[i] = new Date(); return; }
      if (h.indexOf('보호자') !== -1) { nRow[i] = guardian; return; }
      if (h.indexOf('학년') !== -1) { nRow[i] = grade; return; }
      if (h.indexOf('특강') !== -1) { nRow[i] = selected.filter(d => byDisplay[d].type === '특강').join(', '); return; }
      if (h.indexOf('성명') !== -1) { nRow[i] = name; return; }
      if (h.indexOf('생년월일') !== -1) { nRow[i] = dob; return; }
      if (h.indexOf('성별') !== -1) { nRow[i] = String(f.gender || ''); return; }
      if (h.indexOf('연락처') !== -1) { nRow[i] = "'" + phone; return; }
      if (h.indexOf('면제') !== -1) { nRow[i] = String(f.benefit || ''); return; }
      if (h.indexOf('동의') !== -1) { nRow[i] = '동의'; return; }
      if (h.indexOf('수강료') !== -1) return;
      const day = dayOfHeader_(h);
      if (day) nRow[i] = selected.filter(d => byDisplay[d].type !== '특강' && (byDisplay[d].weekdays || []).indexOf(day) !== -1).join(', ');
    });
    sheet.appendRow(nRow);
    return '접수가 완료되었습니다.';
  });
}

// ==========================================
// 5. 신청 내역 및 결과 조회 (이름 + 생년월일 + 연락처)
// ==========================================
function checkTotalStatus(name, phone, dob, termId) {
  const t = getTerm_(termId);
  const s = scheduleOf_(t);
  const mode = modeOf_(t);
  const data = respSheet_(t).getDataRange().getValues();
  const hdrs = data[0].map(h => String(h).trim());
  const rows = personRows_(data, hdrs, name, dob, String(phone || ''));

  const feeByName = {};
  readCourses_(t).forEach(c => { feeByName[c.name] = c.feeText; });

  if (!rows.length) {
    return { applied: null, results: [], isResultOpen: false, openTimeText: '', mode: mode, notice: noticeOf_(t) };
  }

  // 여러 번 나눠 신청했어도 한 사람의 신청으로 합쳐서 보여 줌
  const items = [];
  let earliest = 0;
  rows.forEach(r => {
    const row = data[r - 1];
    rowCellItems_(row, hdrs).forEach(raw => { if (items.indexOf(raw) === -1) items.push(raw); });
    const ts = toTs_(row[0]);
    if (!earliest || (ts && ts < earliest)) earliest = ts;
  });
  const nIdx = headerIdx_(hdrs, '성명');
  const courses = [];
  items.forEach(raw => { const n = courseNameOf_(raw); if (courses.indexOf(n) === -1) courses.push(n); });

  const isOpen = mode === '선착순' ? true : (!!s.result && new Date() >= s.result);
  const sName = normalizeName(name), sDob = normalizeDOBString(dob), sPhone = digitsOf_(phone);
  const results = [];
  if (isOpen) {
    if (mode === '선착순') {
      courses.forEach(course => {
        const me = courseQueue_(t, course).find(x => !x.cancelled &&
          normalizeName(x.name) === sName && normalizeDOBString(x.dob) === sDob && digitsOf_(x.phone) === sPhone);
        const status = !me ? '확인 중' : (me.status === '대기' ? '대기 ' + me.waitNo + '번' : me.status);
        results.push({ course: course, status: status, fee: feeByName[course] || '수강료 정보 없음' });
      });
    } else {
      const ss = termForm_(t);
      const sheetNames = ss.getSheets().map(x => x.getName());
      courses.forEach(course => {
        const targetSName = '결과_' + course.substring(0, 15);
        const feeText = feeByName[course] || '수강료 정보 없음';
        if (sheetNames.indexOf(targetSName) !== -1) {
          const resData = ss.getSheetByName(targetSName).getDataRange().getValues();
          let matched = false;
          resData.slice(1).forEach(r => {
            if (normalizeName(r[1]) === sName && normalizeDOBString(r[2]) === sDob) {
              results.push({ course: course, status: r[4], fee: feeText });
              matched = true;
            }
          });
          if (!matched) results.push({ course: course, status: '대기/명단확인', fee: feeText });
        } else {
          results.push({ course: course, status: '합격자', fee: feeText });
        }
      });
    }
  }

  const first = data[rows[0] - 1];
  return {
    applied: {
      name: nIdx === -1 ? name : String(first[nIdx] || '').trim(),
      date: earliest ? Utilities.formatDate(new Date(earliest), 'GMT+9', 'yyyy-MM-dd HH:mm') : '',
      appliedCourses: items.join(', ')
    },
    results: results,
    isResultOpen: isOpen,
    openTimeText: s.result ? Utilities.formatDate(s.result, 'GMT+9', 'MM월 dd일 HH시') : '',
    mode: mode,
    notice: noticeOf_(t)
  };
}

// ==========================================
// 6. 접수 화면 초기 데이터 (정원/잔여, 노인일자리 시간, 중복제한, 접수 방식)
// ==========================================
function getInitialData(termId) {
  const t = getTerm_(termId);
  const courses = readCourses_(t);

  const appCounts = {};
  const appData = respSheet_(t).getDataRange().getDisplayValues();
  if (appData.length > 1) {
    const headers = appData[0].map(h => String(h).trim());
    const colIdx = [];
    headers.forEach((h, i) => {
      if (isCourseHeader_(h)) colIdx.push(i);
    });
    appData.slice(1).forEach(row => {
      colIdx.forEach(idx => {
        String(row[idx] || '').split(', ').forEach(item => {
          const n = courseNameOf_(item);
          if (n) appCounts[n] = (appCounts[n] || 0) + 1;
        });
      });
    });
  }

  const cs = courses.map(c => {
    const current = appCounts[c.name] || 0;
    return {
      name: c.name,
      day: c.day,
      type: c.type,
      weekdays: c.weekdays,
      dates: c.dates,
      gradeMin: c.gradeMin,
      gradeMax: c.gradeMax,
      display: c.display,
      start: c.start,
      end: c.end,
      quota: c.quota,
      current: current,
      remaining: Math.max(0, c.quota - current)
    };
  });

  const info = termInfo_(t);
  const jobTimes = {};
  const jobSheet = info.getSheetByName(t.jobTab);
  if (jobSheet) {
    const jobData = jobSheet.getDataRange().getDisplayValues();
    const headers = jobData[0].map(h => String(h).trim());
    const nameIdx = headers.findIndex(h => h.indexOf('성명') !== -1);
    const dobIdx = headers.findIndex(h => h.indexOf('생년월일') !== -1);
    jobData.slice(1).forEach(r => {
      const nameVal = normalizeName(r[nameIdx]);
      const dobVal = normalizeDOBString(r[dobIdx]);
      if (nameVal && dobVal) {
        jobTimes[nameVal + '_' + dobVal] = { start: normalizeTime_(r[4]), end: normalizeTime_(r[5]) };
      }
    });
  }

  const restrictions = [];
  const restrictSheet = info.getSheetByName(RESTRICT_TAB);
  if (restrictSheet) {
    restrictSheet.getDataRange().getDisplayValues().forEach(row => {
      const group = row.map(cell => String(cell).trim()).filter(cell => cell !== '');
      if (group.length > 1) restrictions.push(group);
    });
  }

  const cond = conditionsOf_(t);
  return { courses: cs, jobTimes: jobTimes, restrictions: restrictions, mode: modeOf_(t), group: t.group,
    ageMin: cond.ageMin, ageMax: cond.ageMax, maxCourses: cond.maxCourses,
    benefits: cond.benefits, waitAllowed: cond.waitAllowed, refDate: cond.refDate, cutoffText: cond.cutoffText };
}

// ==========================================
// 7. 신청 취소 (같은 사람의 모든 신청을 취소 기록으로 남기고 뺌, 접수 마감 전만)
// ==========================================
function deleteApplicantByVerification(name, dob, phone, termId) {
  try {
    return withLock_(() => {
      const t = getTerm_(termId);
      const s = scheduleOf_(t);
      if (s.end && new Date() > s.end) {
        return { success: false, msg: '접수 마감 후에는 취소할 수 없습니다.' };
      }
      if (!PHONE_RE.test(String(phone || '').trim())) {
        return { success: false, msg: '연락처를 010-0000-0000 형식으로 입력해 주세요.' };
      }

      const sheet = respSheet_(t);
      const data = sheet.getDataRange().getValues();
      const hdrs = data[0].map(h => String(h).trim());
      const rows = personRows_(data, hdrs, name, dob, String(phone).trim());
      if (!rows.length) {
        return { success: false, msg: '❌ 신청 내역을 찾을 수 없습니다. 입력 정보를 다시 확인해 주세요.' };
      }

      // 취소 기록을 먼저 남기고, 아래 행부터 지움 (행 번호가 밀리지 않게)
      rows.forEach(r => moveOldDataToBackup(sheet, r, '본인직접취소'));
      rows.slice().reverse().forEach(r => sheet.deleteRow(r));
      return { success: true, msg: '✅ 접수가 취소되었습니다. 접수 순번은 취소 기록으로 남아요.' };
    });
  } catch (e) {
    return { success: false, msg: '❌ 서버 삭제 오류 발생: ' + e.message };
  }
}

// 백업 대장에 값 목록 그대로 한 줄 추가 (백업일시, 변경구분, 원래 행)
function backupRowValues_(sheet, values, type) {
  const ss = sheet.getParent();
  let bk = ss.getSheetByName(BACKUP_TAB);
  if (!bk) {
    bk = ss.insertSheet(BACKUP_TAB);
    bk.appendRow(['백업일시', '변경구분'].concat(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0]));
  }
  bk.appendRow([Utilities.formatDate(new Date(), 'GMT+9', 'yyyy-MM-dd HH:mm:ss'), type].concat(values));
}

// 신청 행들에서 강좌 한 개만 빼기 (다른 강좌는 그대로).
// 백업에는 취소한 강좌만 담긴 행을 남기고, 강좌가 하나도 안 남은 행만 지움
function removeCourseFromRows_(sheet, hdrs, data, rowNums, cname, type) {
  const colIdx = [];
  hdrs.forEach((h, i) => { if (isCourseHeader_(h)) colIdx.push(i); });
  const toDelete = [];
  rowNums.forEach(r => {
    const row = data[r - 1];
    const backupRow = row.slice();
    const newRow = row.slice();
    let hit = false, remain = 0;
    colIdx.forEach(i => {
      const items = String(row[i] || '').split(', ').map(x => x.trim()).filter(Boolean);
      const mine = items.filter(x => courseNameOf_(x) === cname);
      const rest = items.filter(x => courseNameOf_(x) !== cname);
      if (mine.length) hit = true;
      backupRow[i] = mine.join(', ');
      newRow[i] = rest.join(', ');
      remain += rest.length;
    });
    if (!hit) return;
    backupRowValues_(sheet, backupRow, type);
    if (remain === 0) { toDelete.push(r); return; }
    colIdx.forEach(i => {
      if (newRow[i] !== String(row[i] || '')) sheet.getRange(r, i + 1).setValue(newRow[i]);
    });
  });
  // 행 번호가 밀리지 않도록 아래 행부터 지움
  toDelete.slice().reverse().forEach(r => sheet.deleteRow(r));
}

// 신청자 본인: 강좌 한 개만 취소 (나머지 강좌 신청은 유지)
function cancelCourseByVerification(name, dob, phone, courseName, termId) {
  try {
    return withLock_(() => {
      const t = getTerm_(termId);
      const s = scheduleOf_(t);
      if (s.end && new Date() > s.end) {
        return { success: false, msg: '접수 마감 후에는 취소할 수 없습니다.' };
      }
      if (!PHONE_RE.test(String(phone || '').trim())) {
        return { success: false, msg: '연락처를 010-0000-0000 형식으로 입력해 주세요.' };
      }
      const cname = String(courseName || '').trim();
      const sheet = respSheet_(t);
      const data = sheet.getDataRange().getValues();
      const hdrs = data[0].map(h => String(h).trim());
      const rows = personRows_(data, hdrs, name, dob, String(phone).trim())
        .filter(r => rowCourses_(data[r - 1], hdrs).indexOf(cname) !== -1);
      if (!rows.length) {
        return { success: false, msg: '❌ 취소할 강좌를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.' };
      }
      removeCourseFromRows_(sheet, hdrs, data, rows, cname, '본인직접취소(' + cname + ')');
      return { success: true, msg: '✅ "' + cname + '" 강좌 접수를 취소했습니다. 다른 강좌 신청은 그대로예요.' };
    });
  } catch (e) {
    return { success: false, msg: '❌ 서버 취소 오류 발생: ' + e.message };
  }
}

// ==========================================
// 8. 로고 이미지, 기타 유틸
// ==========================================
const LOGO_FILE_ID = '1m_ltSywU1E038aSWEgoyBBsJ3qOPbnfm';

function getWelfareLogoData() {
  try {
    const blob = DriveApp.getFileById(LOGO_FILE_ID).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    throw new Error('구글 드라이브 에러 발생: ' + e.toString());
  }
}

function getDriveLogoBase64() {
  try {
    const blob = DriveApp.getFileById(LOGO_FILE_ID).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    return '';
  }
}

function getScriptUrl() { return ScriptApp.getService().getUrl(); }

function getRealWebAppUrl() {
  return scheduleOf_(getTerm_()).appUrl;
}

// 신청 화면 등에서 쓰는 중복 제한 그룹 (사용 중인 학기 기준)
function getDuplicateRestrictions() {
  const sheet = termInfo_(getTerm_()).getSheetByName(RESTRICT_TAB);
  if (!sheet) return [];
  const groups = [];
  sheet.getDataRange().getDisplayValues().forEach(row => {
    const cleaned = row.map(cell => String(cell).trim()).filter(cell => cell !== '');
    if (cleaned.length > 1) groups.push(cleaned);
  });
  return groups;
}

/**
 * 수정·삭제 직전의 데이터를 백업 시트에 기록
 */
function moveOldDataToBackup(sourceSheet, rowNum, type) {
  try {
    const ss = sourceSheet.getParent();
    let backupSheet = ss.getSheetByName(BACKUP_TAB);

    if (!backupSheet) {
      backupSheet = ss.insertSheet(BACKUP_TAB);
      const originalHeaders = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getDisplayValues()[0];
      const backupHeaders = ['백업일시', '변경구분'].concat(originalHeaders);
      backupSheet.appendRow(backupHeaders);
      backupSheet.getRange(1, 1, 1, backupHeaders.length)
        .setBackground('#e8eaed')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');
    }

    const rowData = sourceSheet.getRange(rowNum, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
    const nowStr = Utilities.formatDate(new Date(), 'GMT+9', 'yyyy-MM-dd HH:mm:ss');
    backupSheet.appendRow([nowStr, type].concat(rowData));
    backupSheet.autoResizeColumns(1, backupSheet.getLastColumn());
  } catch (e) {
    console.log('⚠️ 백업 기록 실패: ' + e.toString());
  }
}
