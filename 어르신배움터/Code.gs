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
function readCourses_(t) {
  const data = courseSheet_(t).getDataRange().getDisplayValues();
  const qIdx = data[0].findIndex(h => String(h).indexOf('정원') !== -1);
  const q = qIdx === -1 ? 4 : qIdx;
  return data.slice(1).filter(r => String(r[0]).trim() !== '').map(r => {
    const display = String(r[0]).trim();
    const parts = display.split('|');
    return {
      display: display,
      name: parts[0].trim(),
      day: String(r[1] || '').replace('요일', '').trim(),
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
// 4. 수강신청 제출
// ==========================================
function submitForm(f) {
  return withLock_(() => {
    const t = getTerm_(f.term);
    const name = String(f.name || '').trim();
    const dob = normalizeDOBString(f.dob);
    const phone = String(f.phone || '').trim();
    if (!name) throw new Error('성명을 입력해 주세요.');
    if (dob.length !== 6) throw new Error('생년월일 6자리를 입력해 주세요.');
    if (!PHONE_RE.test(phone)) throw new Error('연락처는 010-0000-0000 형식으로 입력해 주세요.');

    const selected = Array.isArray(f.selectedCourses) ? f.selectedCourses : [];
    if (selected.length === 0) throw new Error('과목을 선택해 주세요.');

    // 선택한 강좌가 현재 강좌 정보에 모두 있는지 정확히 대조 (부분 문자열 검색 안 함)
    const byDisplay = {};
    readCourses_(t).forEach(c => { byDisplay[c.display] = c; });
    selected.forEach(d => {
      if (!byDisplay[d]) throw new Error('강좌 정보가 변경되었습니다. 새로고침 후 다시 선택해 주세요.');
    });

    const sheet = respSheet_(t);
    const data = sheet.getDataRange().getValues();
    const hdrs = data[0].map(h => String(h).trim());
    const rIdx = findRow_(data, hdrs, name, dob);

    const nRow = new Array(hdrs.length).fill('');
    hdrs.forEach((h, i) => {
      if (h === '타임스탬프') { nRow[i] = new Date(); return; }
      if (h.indexOf('성명') !== -1) { nRow[i] = name; return; }
      if (h.indexOf('생년월일') !== -1) { nRow[i] = dob; return; }
      if (h.indexOf('성별') !== -1) { nRow[i] = String(f.gender || ''); return; }
      if (h.indexOf('연락처') !== -1) { nRow[i] = "'" + phone; return; } // 앞의 ' 는 문자열로 저장하라는 표시
      if (h.indexOf('면제') !== -1) { nRow[i] = String(f.benefit || ''); return; }
      if (h.indexOf('동의') !== -1) { nRow[i] = '동의'; return; }
      if (h.indexOf('수강료') !== -1) return;

      const day = dayOfHeader_(h);
      if (day) {
        nRow[i] = selected.filter(d => byDisplay[d].day === day).join(', ');
      }
    });

    if (rIdx !== -1) {
      moveOldDataToBackup(sheet, rIdx, '수정(덮어쓰기)');
      sheet.getRange(rIdx, 1, 1, nRow.length).setValues([nRow]);
    } else {
      sheet.appendRow(nRow);
    }
    return '접수가 완료되었습니다.';
  });
}

// ==========================================
// 5. 신청 내역 및 결과 조회 (이름 + 생년월일 + 연락처 일치)
// ==========================================
function checkTotalStatus(name, phone, dob, termId) {
  const t = getTerm_(termId);
  const s = scheduleOf_(t);
  const isResultOpen = !!s.result && new Date() >= s.result;
  const sName = normalizeName(name), sDob = normalizeDOBString(dob);

  const respData = respSheet_(t).getDataRange().getValues();
  const hdrs = respData[0].map(h => String(h).trim());
  const rowNum = findRow_(respData, hdrs, name, dob, String(phone || ''));

  const feeByName = {};
  readCourses_(t).forEach(c => { feeByName[c.name] = c.feeText; });

  let appInfo = null;
  const results = [];
  const appliedNames = [];
  if (rowNum !== -1) {
    const row = respData[rowNum - 1];
    const cs = [];
    hdrs.forEach((h, idx) => {
      if (h.indexOf('요일') !== -1 && h.indexOf('면제') === -1 && row[idx]) {
        String(row[idx]).split(', ').forEach(c => {
          cs.push(c);
          appliedNames.push(courseNameOf_(c));
        });
      }
    });
    const ts = new Date(row[0]);
    appInfo = {
      date: isNaN(ts.getTime()) ? '' : Utilities.formatDate(ts, 'GMT+9', 'yyyy-MM-dd HH:mm'),
      appliedCourses: cs.join(', ')
    };
  }

  if (isResultOpen && appInfo) {
    const ss = termForm_(t);
    const sheetNames = ss.getSheets().map(x => x.getName());
    appliedNames.forEach(course => {
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

  return {
    applied: appInfo,
    results: results,
    isResultOpen: isResultOpen,
    openTimeText: s.result ? Utilities.formatDate(s.result, 'GMT+9', 'MM월 dd일 HH시') : ''
  };
}

// ==========================================
// 6. 접수 화면 초기 데이터 (정원/잔여, 노인일자리 시간, 중복제한)
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
      if (h.indexOf('요일') !== -1 && h.indexOf('수강료') === -1 && h.indexOf('면제') === -1) colIdx.push(i);
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

  return { courses: cs, jobTimes: jobTimes, restrictions: restrictions };
}

// ==========================================
// 7. 신청 취소 (이름 + 생년월일 + 연락처 일치, 접수 마감 전만)
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
      const rowNum = findRow_(data, hdrs, name, dob, String(phone).trim());
      if (rowNum === -1) {
        return { success: false, msg: '❌ 신청 내역을 찾을 수 없습니다. 입력 정보를 다시 확인해 주세요.' };
      }

      moveOldDataToBackup(sheet, rowNum, '본인직접취소');
      sheet.deleteRow(rowNum);
      return { success: true, msg: '✅ 어르신배움터 접수 내역이 정상적으로 취소(삭제)되었습니다.' };
    });
  } catch (e) {
    return { success: false, msg: '❌ 서버 삭제 오류 발생: ' + e.message };
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

    const rowData = sourceSheet.getRange(rowNum, 1, 1, sourceSheet.getLastColumn()).getDisplayValues()[0];
    const nowStr = Utilities.formatDate(new Date(), 'GMT+9', 'yyyy-MM-dd HH:mm:ss');
    backupSheet.appendRow([nowStr, type].concat(rowData));
    backupSheet.autoResizeColumns(1, backupSheet.getLastColumn());
  } catch (e) {
    console.log('⚠️ 백업 기록 실패: ' + e.toString());
  }
}
