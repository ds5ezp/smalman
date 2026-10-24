// =====================================================================
// 에어컨 제어: 스마트싱스로 에어컨 상태 보기, 켜기·끄기, 시간 예약
// 준비: 1) 스크립트 속성 SMARTTHINGS_TOKEN 에 스마트싱스 토큰을 넣음 (코드에는 넣지 않음)
//       2) installAirConTrigger() 를 편집기에서 한 번 실행 (1분마다 예약 확인)
// 예약 기록은 '에어컨 예약' 스프레드시트에 저장 (스크립트 속성 AC_SHEET_ID 에 ID가 기록됨)
// =====================================================================

const AC = {
  API: 'https://api.smartthings.com/v1',
  FILE_NAME: '에어컨 예약',
  TAB: '예약',
  HEADERS: ['번호', '기기ID', '기기 이름', '요일', '시각', '동작', '사용', '작성자', '작성일시', '마지막 실행', '마지막 결과'],
  DAYS: ['월', '화', '수', '목', '금', '토', '일'],
  ACTIONS: { '켜기': 'on', '끄기': 'off' }
};

function acToken_() {
  const token = PropertiesService.getScriptProperties().getProperty('SMARTTHINGS_TOKEN');
  if (!token) throw new Error('스마트싱스 토큰이 없습니다. 프로젝트 설정 > 스크립트 속성에 SMARTTHINGS_TOKEN 을 넣어 주세요.');
  return token;
}

// 스마트싱스 API 호출. 응답이 성공이 아니면 오류를 던짐
function acCall_(method, path, body) {
  const options = { method: method, headers: { Authorization: 'Bearer ' + acToken_() }, muteHttpExceptions: true };
  if (body) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  const res = UrlFetchApp.fetch(AC.API + path, options);
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('스마트싱스 응답 오류 (' + code + ')' + (code === 401 ? ' 토큰을 확인해 주세요.' : ''));
  }
  const text = res.getContentText();
  return text ? JSON.parse(text) : {};
}

// 에어컨인지 판별: 기기 종류가 AirConditioner 이거나 에어컨 모드 기능이 있는 기기
function acIsAirCon_(device) {
  const main = (device.components || []).filter(c => c.id === 'main')[0] || {};
  const categories = (main.categories || []).map(c => c.name);
  const caps = (main.capabilities || []).map(c => c.id);
  return categories.indexOf('AirConditioner') !== -1 || caps.indexOf('airConditionerMode') !== -1;
}

function acAttr_(main, capability, attribute) {
  const cap = main && main[capability];
  const attr = cap && cap[attribute];
  return attr ? attr.value : null;
}

// 에어컨 목록과 현재 상태 (전원, 현재 온도, 설정 온도). 상태를 못 받은 기기는 online: false
function getAirConUnits() {
  requireUser_();
  const devices = acCall_('GET', '/devices').items || [];
  return devices.filter(acIsAirCon_).map(d => {
    const unit = { id: d.deviceId, name: d.label || d.name || '에어컨', on: false, online: true, current: null, setpoint: null };
    try {
      const main = acCall_('GET', '/devices/' + encodeURIComponent(d.deviceId) + '/status').components.main;
      unit.on = acAttr_(main, 'switch', 'switch') === 'on';
      unit.current = acAttr_(main, 'temperatureMeasurement', 'temperature');
      unit.setpoint = acAttr_(main, 'thermostatCoolingSetpoint', 'coolingSetpoint');
    } catch (e) {
      unit.online = false;
    }
    return unit;
  });
}

// 켜기(on) 또는 끄기(off) 명령을 보냄
function setAirCon(deviceId, on) {
  requireUser_();
  acCall_('POST', '/devices/' + encodeURIComponent(deviceId) + '/commands', {
    commands: [{ component: 'main', capability: 'switch', command: on ? 'on' : 'off' }]
  });
  log_('에어컨 ' + (on ? '켜기' : '끄기'), deviceId);
  return true;
}

// ---------- 예약 저장소 ----------

function acSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('AC_SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* 파일이 없으면 새로 만듦 */ }
  }
  const ss = SpreadsheetApp.create(AC.FILE_NAME);
  props.setProperty('AC_SHEET_ID', ss.getId());
  return ss;
}

function acSheet_() {
  const ss = acSpreadsheet_();
  const sheet = ss.getSheetByName(AC.TAB) || ss.getSheets()[0].setName(AC.TAB);
  if (!sheet.getRange(1, 1).getValue()) {
    sheet.getRange(1, 1, 1, AC.HEADERS.length).setValues([AC.HEADERS]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 예약 줄 목록. 요일은 '매일' 또는 '월,화,수' 형태의 글자로 저장됨
function acRows_() {
  const sheet = acSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, AC.HEADERS.length).getDisplayValues().map((v, i) => ({
    row: i + 2,
    no: Number(v[0]) || 0,
    deviceId: String(v[1]),
    name: String(v[2]),
    days: String(v[3]),
    time: String(v[4]),
    action: String(v[5]),
    enabled: v[6] === 'Y',
    author: String(v[7]),
    created: String(v[8]),
    lastRun: String(v[9]),
    lastResult: String(v[10])
  })).filter(r => r.no);
}

// 화면에서 고른 요일 → 저장 글자. 하나라도 '매일'이면 매일로 저장
function acDays_(list) {
  const picked = (Array.isArray(list) ? list : []).map(String);
  if (picked.indexOf('매일') !== -1) return '매일';
  return AC.DAYS.filter(d => picked.indexOf(d) !== -1).join(',');
}

function acDayList_(text) {
  return text === '매일' ? AC.DAYS.slice() : String(text || '').split(',').filter(Boolean);
}

// 예약 목록 (시각 순)
function getAirConReservations() {
  requireUser_();
  return acRows_().sort((a, b) => a.time.localeCompare(b.time) || a.no - b.no).map(r => ({
    no: r.no, deviceId: r.deviceId, name: r.name, days: r.days, time: r.time, action: r.action,
    enabled: r.enabled, author: r.author, lastRun: r.lastRun, lastResult: r.lastResult
  }));
}

// 예약 1건 추가. entry.no 가 있으면 그 예약을 고침
function saveAirConReservation(entry) {
  const email = requireUser_();
  const deviceId = String(entry.deviceId || '').trim();
  if (!deviceId) throw new Error('에어컨을 골라 주세요.');
  if (!AC.ACTIONS[entry.action]) throw new Error('동작을 골라 주세요.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(entry.time || ''))) throw new Error('시각을 확인해 주세요.');
  const days = acDays_(entry.days);
  if (!days) throw new Error('요일을 하나 이상 골라 주세요.');
  const name = String(entry.name || '').trim();
  return withLock_(() => {
    const sheet = acSheet_();
    if (entry.no) {
      const hit = acRows_().filter(r => r.no === Number(entry.no))[0];
      if (!hit) throw new Error('해당 예약을 찾을 수 없습니다.');
      sheet.getRange(hit.row, 2, 1, 7).setNumberFormat('@').setValues([[
        deviceId, name, days, String(entry.time), entry.action, hit.enabled ? 'Y' : 'N', email
      ]]);
      log_('에어컨 예약 수정', entry.time + ' ' + entry.action + ' ' + name);
      return hit.no;
    }
    const no = acRows_().reduce((max, r) => Math.max(max, r.no), 0) + 1;
    writeMeetingRow_(sheet, 0, [
      no, deviceId, name, days, String(entry.time), entry.action, 'Y', email,
      fmt_(new Date(), 'yyyy-MM-dd HH:mm'), '', ''
    ]);
    log_('에어컨 예약 등록', entry.time + ' ' + entry.action + ' ' + name);
    return no;
  });
}

// 예약 사용 켜기·끄기
function setAirConReservationEnabled(no, enabled) {
  requireUser_();
  return withLock_(() => {
    const hit = acRows_().filter(r => r.no === Number(no))[0];
    if (!hit) throw new Error('해당 예약을 찾을 수 없습니다.');
    acSheet_().getRange(hit.row, 7).setValue(enabled ? 'Y' : 'N');
    return true;
  });
}

function deleteAirConReservation(no) {
  requireUser_();
  return withLock_(() => {
    const hit = acRows_().filter(r => r.no === Number(no))[0];
    if (!hit) throw new Error('해당 예약을 찾을 수 없습니다.');
    acSheet_().deleteRow(hit.row);
    log_('에어컨 예약 삭제', hit.time + ' ' + hit.action + ' ' + hit.name);
    return true;
  });
}

// 1분마다 실행되는 트리거. 지금 시각(KST)·요일과 맞는 사용 중 예약을 실행함
// 같은 분에 두 번 실행되지 않도록 '마지막 실행' 칸을 확인함
function runAirConReservations() {
  const now = new Date();
  const hhmm = Utilities.formatDate(now, 'Asia/Seoul', 'HH:mm');
  const day = AC.DAYS[Number(Utilities.formatDate(now, 'Asia/Seoul', 'u')) - 1];
  const stamp = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd') + ' ' + hhmm;
  const due = acRows_().filter(r =>
    r.enabled && r.time === hhmm && acDayList_(r.days).indexOf(day) !== -1 && r.lastRun !== stamp);
  due.forEach(r => {
    let result = '성공';
    try {
      acCall_('POST', '/devices/' + encodeURIComponent(r.deviceId) + '/commands', {
        commands: [{ component: 'main', capability: 'switch', command: AC.ACTIONS[r.action] }]
      });
    } catch (e) {
      result = '실패: ' + e.message;
    }
    acSheet_().getRange(r.row, 10, 1, 2).setNumberFormat('@').setValues([[stamp, result]]);
  });
}

// 예약 확인 트리거 설정 (편집기에서 한 번만 실행하면 됨. 다시 실행해도 중복되지 않음)
function installAirConTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'runAirConReservations') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('runAirConReservations').timeBased().everyMinutes(1).create();
  return '1분마다 에어컨 예약을 확인하도록 설정했습니다.';
}
