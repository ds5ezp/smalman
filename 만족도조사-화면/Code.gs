/**
 * 만족도 조사 화면 (터치 사이니지 스티커 설문) - 구글 앱스 스크립트 (Code.gs)
 *
 * 대시보드 > 만족도 조사 에서 만든 조사를 '웹 앱 주소?s=키' 로 보여 주고, 붙인 스티커를 시트에 저장합니다.
 * 배포: 실행 사용자 = 나, 액세스 = 모든 사용자 (행사장 노트북이 로그인 없이 열 수 있게)
 *  - 주소의 키를 아는 사람만 그 조사를 열 수 있습니다.
 *  - 이 주소로는 스티커 붙이기만 됩니다. 문구 수정·리셋·결과 보기는 대시보드에서만 합니다.
 *
 * 시트의 탭·열 순서는 대시보드 Code.gs 의 SURVEY 설정과 같아야 합니다.
 */

// 대시보드 > 만족도 조사 > 처음 설정 탭에 나오는 시트 ID를 붙여 넣으세요.
const SHEET_ID = '';

const SURVEY_TAB = '조사';      // 키, 이름, 템플릿, 상태, 설정, 회차, 만든사람, 만든일시, 수정일시
const RESPONSE_TAB = '응답';    // 키, 회차, 칸, 스티커, x, y, 회전, 시각, 응답ID
const RESPONSE_HEADERS = ['키', '회차', '칸', '스티커', 'x', 'y', '회전', '시각', '응답ID'];
const STICKER_TYPES = ['heart', 'pinkheart', 'star', 'smile', 'flower', 'thumb', 'clover', 'blueheart'];
const MAX_ITEMS_PER_CALL = 50;

function doGet(e) {
  const key = String((e && e.parameter && e.parameter.s) || '').trim();
  const preview = !!(e && e.parameter && e.parameter.preview === '1');
  if (!SHEET_ID) return messagePage_('설정이 필요합니다', 'Code.gs 맨 위 SHEET_ID 에 대시보드 > 만족도 조사 > 처음 설정 탭의 시트 ID를 넣고 다시 배포해 주세요.');
  const survey = findSurvey_(key);
  if (!survey) return messagePage_('조사를 찾을 수 없습니다', notFoundReason_(key));

  const t = HtmlService.createTemplateFromFile('Survey');
  // 처음 화면에 필요한 자료를 함께 넣어 보냄 (스크립트 안에 넣으므로 < 를 바꿔 태그가 닫히지 않게)
  t.boot = JSON.stringify({ key: key, preview: preview, state: surveyState_(survey) })
    .replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return t.evaluate()
    .setTitle(survey.name || '만족도 조사')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function messagePage_(title, text) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;max-width:560px;margin:15vh auto;padding:32px;border-radius:24px;background:#fff7ef;text-align:center;line-height:1.7">' +
    '<h2 style="margin-top:0">' + escapeHtml_(title) + '</h2><p>' + escapeHtml_(text) + '</p></div>'
  ).setTitle(title);
}

// 조사를 못 찾은 이유를 알려 줌 (설정 실수를 바로 알 수 있게)
function notFoundReason_(key) {
  const fix = ' 업무포털 > 만족도 조사 > 처음 설정 1번의 시트 ID와 이 프로젝트 Code.gs 맨 위 SHEET_ID 가 같은지 확인하고, 고쳤으면 저장한 뒤 새 버전으로 배포해 주세요.';
  if (!/^[A-Za-z0-9]{8,32}$/.test(key)) return '주소 끝의 ?s= 뒤 키가 올바르지 않습니다. 업무포털 > 만족도 조사에서 전용 주소를 다시 복사해 주세요.';
  const ss = ss_();
  const sheet = ss.getSheetByName(SURVEY_TAB);
  if (!sheet) return 'SHEET_ID 가 가리키는 시트("' + ss.getName() + '")에 \'' + SURVEY_TAB + '\' 탭이 없습니다. 만족도 조사 시트가 아닌 다른 시트 ID가 들어간 것 같습니다.' + fix;
  const rows = sheet.getDataRange().getValues().slice(1).filter(v => String(v[0]).trim());
  const row = rows.find(v => String(v[0]).trim() === key);
  if (row && String(row[3]).trim() === '삭제') return '업무포털에서 삭제한 조사입니다.';
  return '이 프로젝트가 보는 시트("' + ss.getName() + '")에는 조사 ' + rows.length + '개가 있지만 이 주소의 키(' + key + ')는 없습니다.' + fix;
}

function escapeHtml_(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ss_() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function responseSheet_() {
  const ss = ss_();
  let sheet = ss.getSheetByName(RESPONSE_TAB);
  if (!sheet) sheet = ss.insertSheet(RESPONSE_TAB);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, RESPONSE_HEADERS.length).setValues([RESPONSE_HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 키로 조사 한 건을 찾음 (삭제된 조사는 없는 것으로)
function findSurvey_(key) {
  if (!/^[A-Za-z0-9]{8,32}$/.test(key)) return null;
  const sheet = ss_().getSheetByName(SURVEY_TAB);
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const v = rows[i];
    if (String(v[0]).trim() !== key) continue;
    const status = String(v[3] || '').trim();
    if (status === '삭제') return null;
    let config = {};
    try { config = JSON.parse(String(v[4] || '{}')); } catch (e) { config = {}; }
    return {
      key: key,
      name: String(v[1] || ''),
      template: String(v[2] || 'festival'),
      open: status !== '종료',
      config: config,
      round: Number(v[5]) || 1,
      version: v[8] instanceof Date ? v[8].toISOString() : String(v[8] || '')
    };
  }
  return null;
}

// 현재 회차에 붙은 스티커 목록 (리셋하면 회차가 올라가 이전 스티커는 빠짐)
function currentStickers_(survey) {
  const sheet = responseSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, RESPONSE_HEADERS.length).getValues()
    .filter(v => String(v[0]).trim() === survey.key && Number(v[1]) === survey.round)
    .map(v => ({
      zone: String(v[2]),
      type: String(v[3]),
      x: Number(v[4]) || 0.5,
      y: Number(v[5]) || 0.5,
      r: Number(v[6]) || 0,
      id: String(v[8] || '')
    }));
}

function surveyState_(survey) {
  return {
    name: survey.name,
    template: survey.template,
    open: survey.open,
    round: survey.round,
    version: survey.version,
    config: survey.config,
    stickers: currentStickers_(survey)
  };
}

// 화면이 주기적으로 불러 감: 문구 수정, 리셋, 종료, 다른 기기에서 붙인 스티커를 반영
function getState(key) {
  const survey = findSurvey_(String(key || ''));
  if (!survey) return { missing: true };
  return surveyState_(survey);
}

// 붙인 스티커 저장. 화면은 보낼 때까지 기기에 모아 두었다가 묶어서 보냄 (응답ID로 중복 저장 방지)
function addResponses(key, round, items) {
  key = String(key || '');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('저장이 몰려 있습니다. 잠시 뒤 다시 보냅니다.');
  try {
    const survey = findSurvey_(key);
    if (!survey) return { missing: true };
    // 종료됐거나 그 사이 리셋돼 회차가 바뀌었으면 저장하지 않고 지금 상태만 돌려줌
    if (!survey.open || Number(round) !== survey.round) return { stale: true, state: surveyState_(survey) };

    const sheet = responseSheet_();
    const seen = {};
    if (sheet.getLastRow() >= 2) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, RESPONSE_HEADERS.length).getValues().forEach(v => {
        if (String(v[0]).trim() === key) seen[String(v[8])] = true;
      });
    }
    const num = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
    const rows = [];
    (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS_PER_CALL).forEach(it => {
      if (!it) return;
      const id = String(it.id || '');
      if (!/^[A-Za-z0-9_-]{6,40}$/.test(id) || seen[id]) return;
      const zone = it.zone === 'no' ? 'no' : (it.zone === 'yes' ? 'yes' : '');
      if (!zone || STICKER_TYPES.indexOf(it.type) === -1) return;
      seen[id] = true;
      const time = new Date(Number(it.t) || Date.now());
      rows.push([key, survey.round, zone, it.type, num(it.x, 0, 1), num(it.y, 0, 1), Math.round(num(it.r, -45, 45)),
        isNaN(time.getTime()) ? new Date() : time, id]);
    });
    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, RESPONSE_HEADERS.length).setValues(rows);
      SpreadsheetApp.flush();
    }
    return { ok: true, saved: rows.length, state: surveyState_(survey) };
  } finally {
    lock.releaseLock();
  }
}
