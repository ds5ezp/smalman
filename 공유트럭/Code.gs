// =================================================================
// 거제시 복지시설 차량공유플랫폼 '나눔드림트럭' 운영 시스템 백엔드 (v4.0 종합본)
// =================================================================

const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// 신청 서류 및 반납 사진을 저장할 구글 드라이브 폴더 ID
const FOLDER_ID = '1t4Ex5SQoyBYqfL3SNS9sxSWDvmqQr57l'; 

// 트럭 실물 사진 3장이 저장된 구글 드라이브 폴더 ID
const TRUCK_PHOTO_FOLDER_ID = '1jXofhBD1Gk72Qv5LLsm4FB4S_vQkok99';

// 로고 이미지가 저장된 구글 드라이브 폴더 ID (chest_logo.png, logo2.png)
const LOGO_FOLDER_ID = '1aZuBe_5SnNxmS1wWOci1P4C40FO25x75';

// 협약서 사본(MOU 문서)을 보관할 구글 드라이브 폴더 ID
const AGREEMENT_FOLDER_ID = '1RGXd9dEEJKCgXcqxUhMzi6eAHsbFusKx';

// Apps Script > 프로젝트 설정 > 스크립트 속성에 ADMIN_PASSWORD를 설정하세요.
// 비밀번호는 12자 이상으로 설정하고 이 파일에는 직접 기록하지 않습니다.

// 기본 차량 및 사업 정보
const VEHICLE_INFO = {
  plateNumber: '800머 9202',
  model: '현대 포터II 1톤 특장 (전동 윙바디)',
  orgName: '거제시종합사회복지관',
  supportOrg: '사랑의열매 경남사회복지공동모금회',
  projectName: "지역복지서비스 접근성 향상과 복지시설 수송 공유플랫폼 구축을 위한 '나눔드림트럭'",
  insuranceCompany: 'DB손해보험 (업무용 종합보험)',
  insuranceContact: '1588-0100',
  welfareContact: '055-636-0303'
};

/**
 * 1. 웹앱 진입점
 */
function doGet() {
  ensureRequiredSheets();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('나눔드림트럭 - 지역복지서비스 접근성 향상과 복지시설 수송 공유플랫폼')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    // 통합 관리 대시보드 안에 관리자 화면을 띄울 수 있도록 허용 (관리자 기능은 여전히 비밀번호 확인)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 2. 필수 시트 자동 초기화
 */
function ensureRequiredSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // Agencies 시트 (12개 열)
  let agencySheet = ss.getSheetByName('Agencies');
  if (!agencySheet) {
    agencySheet = ss.insertSheet('Agencies');
    agencySheet.appendRow([
      '기관명', '고유(사업자)번호', '대표자', '담당자', 
      '연락처', '협약체결일', '협약서 사본 URL', 
      '상태', '제한시작일', '제한만료일', '제한사유', '등록일'
    ]);
  }

  // Maintenance_Logs 시트
  let maintSheet = ss.getSheetByName('Maintenance_Logs');
  if (!maintSheet) {
    maintSheet = ss.insertSheet('Maintenance_Logs');
    maintSheet.appendRow([
      '정비일자', '정비구분/항목', '세부내용', '정비업체', 
      '정비금액', '정비시주행거리(km)', '비고', '등록일시'
    ]);
  }

  // Accidents 시트
  let accSheet = ss.getSheetByName('Accidents');
  if (!accSheet) {
    accSheet = ss.insertSheet('Accidents');
    accSheet.appendRow([
      '접수번호', '예약번호', '신청기관', '운전자명', 
      '발생일시', '발생장소', '사고경위', '상대차량및피해내용', 
      '현장사진URL', '등록일시'
    ]);
  }
}

function verifyAdmin(password) {
  const attemptKey = authAttemptKey_('admin');
  if (isRateLimited_(attemptKey)) return false;
  const saved = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  const valid = !!saved && String(password || '') === saved;
  if (valid) clearAttempts_(attemptKey);
  else recordFailedAttempt_(attemptKey, 5, 15 * 60);
  return valid;
}

function authAttemptKey_(scope) {
  let client = 'anonymous';
  try { client = Session.getTemporaryActiveUserKey() || Session.getActiveUser().getEmail() || client; } catch (ignored) {}
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(client) + ':' + String(scope), Utilities.Charset.UTF_8);
  return 'auth_' + Utilities.base64EncodeWebSafe(digest).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

function isRateLimited_(key) {
  const raw = CacheService.getScriptCache().get(key);
  if (!raw) return false;
  try { return Number(JSON.parse(raw).blockedUntil || 0) > Date.now(); } catch (ignored) { return false; }
}

function recordFailedAttempt_(key, maxAttempts, windowSeconds) {
  const cache = CacheService.getScriptCache();
  let state = { count: 0, blockedUntil: 0 };
  try { state = JSON.parse(cache.get(key) || '{}'); } catch (ignored) {}
  state.count = Number(state.count || 0) + 1;
  if (state.count >= maxAttempts) state.blockedUntil = Date.now() + windowSeconds * 1000;
  cache.put(key, JSON.stringify(state), windowSeconds);
}

function clearAttempts_(key) {
  CacheService.getScriptCache().remove(key);
}

function claimRateLimit_(key, seconds) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
  const cache = CacheService.getScriptCache();
  if (cache.get(key)) return false;
  cache.put(key, String(Date.now()), seconds);
  return true;
  } finally {
    lock.releaseLock();
  }
}

function escapeHtmlServer_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

function hashReservationPin_(pin) {
  const properties = PropertiesService.getScriptProperties();
  let pepper = properties.getProperty('PIN_PEPPER');
  if (!pepper) {
    pepper = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty('PIN_PEPPER', pepper);
  }
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pepper + ':' + String(pin), Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function reservationPinMatches_(stored, entered) {
  const saved = String(stored || '').trim();
  const plain = String(entered || '').trim();
  // 평문 PIN은 기존 예약 호환용입니다. 조회에 성공하면 아래 호출부에서 해시로 전환합니다.
  return saved === hashReservationPin_(plain) || saved === plain;
}

function normalizeDate_(value) {
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new Error('날짜/시간 형식이 올바르지 않습니다.');
  return d;
}

function hasReservationConflict_(sheet, start, end, excludeId) {
  const values = sheet.getDataRange().getValues();
  const bufferMs = 2 * 60 * 60 * 1000;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = String(row[0] || '');
    const status = String(row[20] || '');
    if (!id || id === excludeId || status === '반려' || status === '신청취소') continue;
    const existingStart = new Date(row[10]);
    const existingEnd = new Date(row[11]);
    if (isNaN(existingStart.getTime()) || isNaN(existingEnd.getTime())) continue;
    if (start.getTime() < existingEnd.getTime() + bufferMs && end.getTime() > existingStart.getTime() - bufferMs) return true;
  }
  return false;
}

/**
 * 3. 협약기관 목록 조회
 */
function getApprovedAgencies() {
  try {
    ensureRequiredSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Agencies');
    const data = sheet.getDataRange().getValues();
    const list = [];
    
    for (let i = 1; i < data.length; i++) {
      const name = String(data[i][0]).trim();
      if (name) list.push(name);
    }
    return { success: true, list: list };
  } catch (e) {
    return { success: false, message: e.toString(), list: [] };
  }
}

/**
 * 4. 협약기관 자격 및 페널티 상태 검증
 */
function verifyAgencyEligibility(agencyName) {
  try {
    ensureRequiredSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Agencies');
    const data = sheet.getDataRange().getValues();
    const targetName = String(agencyName).trim();

    let found = false;
    let status = '정상';
    let penaltyStartStr = '';
    let penaltyEndStr = '';
    let penaltyReason = '';
    const now = new Date();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === targetName) {
        found = true;
        status = data[i][7] || '정상';
        const startVal = data[i][8];
        const endVal = data[i][9];
        penaltyReason = data[i][10] || '';

        if (status === '이용제한' && endVal) {
          const startDate = startVal ? new Date(startVal + 'T00:00:00') : new Date(0);
          const endDate = new Date(endVal);
          endDate.setHours(23, 59, 59, 999);

          if (now > endDate) {
            status = '정상';
            sheet.getRange(i + 1, 8).setValue('정상');
            sheet.getRange(i + 1, 9).setValue('');
            sheet.getRange(i + 1, 10).setValue('');
            sheet.getRange(i + 1, 11).setValue('');
          } else if (now >= startDate && now <= endDate) {
            penaltyStartStr = Utilities.formatDate(new Date(startVal), 'Asia/Seoul', 'yyyy-MM-dd');
            penaltyEndStr = Utilities.formatDate(endDate, 'Asia/Seoul', 'yyyy-MM-dd');
          } else if (now < startDate) {
            status = '정상';
          }
        }
        break;
      }
    }

    if (!found) {
      return {
        success: false,
        eligible: false,
        message: '사전 협약(MOU)이 체결되지 않은 기관입니다. 거제시종합사회복지관 복지사업팀(055-636-0303)으로 협약 문의 바랍니다.'
      };
    }

    if (status === '이용제한') {
      return {
        success: true,
        eligible: false,
        status: '이용제한',
        penaltyStart: penaltyStartStr,
        penaltyUntil: penaltyEndStr,
        penaltyReason: penaltyReason,
        message: `해당 기관은 규정 위반(페널티)으로 인해 이용이 제한되어 있습니다. [제한기간: ${penaltyStartStr} ~ ${penaltyEndStr} / 사유: ${penaltyReason || '미기재'}]`
      };
    }

    return {
      success: true,
      eligible: true,
      status: '정상',
      message: '협약 자격 확인 완료: 대여 신청이 가능합니다.'
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 5. 트럭 실물 사진 조회
 */
function getTruckPhotos() {
  try {
    const folder = DriveApp.getFolderById(TRUCK_PHOTO_FOLDER_ID);
    const files = folder.getFiles();
    const photos = [];
    
    while (files.hasNext()) {
      const file = files.next();
      const mime = file.getMimeType();
      const fileName = file.getName().toLowerCase();
      
      const isImage = mime.indexOf('image/') !== -1 || 
                      fileName.endsWith('.jpg') || 
                      fileName.endsWith('.jpeg') || 
                      fileName.endsWith('.png') || 
                      fileName.endsWith('.heic');
      
      if (isImage) {
        let imageBlob;
        try {
          imageBlob = file.getThumbnail();
        } catch (thumbErr) {
          imageBlob = file.getBlob();
        }
        
        if (imageBlob) {
          const base64Data = Utilities.base64Encode(imageBlob.getBytes());
          const contentType = imageBlob.getContentType() || 'image/jpeg';
          photos.push({
            id: file.getId(),
            name: file.getName(),
            url: 'data:' + contentType + ';base64,' + base64Data
          });
        }
      }
    }
    return { success: true, photos: photos };
  } catch (e) {
    return { success: false, message: e.toString(), photos: [] };
  }
}

/**
 * 6. 기관 및 지원처 로고 Base64 추출
 */
function getLogos() {
  try {
    const folder = DriveApp.getFolderById(LOGO_FOLDER_ID);
    const files = folder.getFiles();
    let chestLogo = '';
    let orgLogo = '';

    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName().toLowerCase();
      const mime = file.getMimeType() || 'image/png';

      if (name.indexOf('chest_logo') !== -1) {
        chestLogo = 'data:' + mime + ';base64,' + Utilities.base64Encode(file.getBlob().getBytes());
      } else if (name.indexOf('logo2') !== -1) {
        orgLogo = 'data:' + mime + ';base64,' + Utilities.base64Encode(file.getBlob().getBytes());
      }
    }
    return { success: true, chestLogo: chestLogo, orgLogo: orgLogo };
  } catch (e) {
    return { success: false, message: e.toString(), chestLogo: '', orgLogo: '' };
  }
}

/**
 * 7. 대여 신청서 접수
 */
function submitReservation(formObject) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    const check = verifyAgencyEligibility(formObject.agencyName);
    if (!check.eligible) {
      return { success: false, message: check.message };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Reservations');
    const folder = DriveApp.getFolderById(FOLDER_ID);

    const start = normalizeDate_(formObject.startDate);
    const end = normalizeDate_(formObject.endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    
    if (diffDays <= 0) {
      return { success: false, message: '반납 일시는 대여 시작 일시 이후여야 합니다.' };
    }
    if (diffDays > 2) {
      return { success: false, message: '규정상 1회 최대 대여 기간은 2일(48시간)입니다.' };
    }

    if (hasReservationConflict_(sheet, start, end, '')) {
      return { success: false, message: '선택하신 시간대에는 이미 차량 사용 일정이 있습니다. 2시간 정리 시간을 포함해 다른 일정을 선택해 주세요.' };
    }
    if (!/^\d{6,12}$/.test(String(formObject.accessPin || ''))) return { success: false, message: '조회 비밀번호는 숫자 6~12자리로 설정해 주세요.' };
    if (!formObject.managerEmail || !/^\S+@\S+\.\S+$/.test(String(formObject.managerEmail))) return { success: false, message: '담당자 이메일 주소를 확인해 주세요.' };

    const todayStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
    const reservationId = 'REQ_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 8);
    const subFolder = folder.createFolder(`${formObject.agencyName}_${reservationId}`);
    
    const licenseFileName = `${formObject.agencyName}_운전면허증_${todayStr}`;
    const careerFileName = `${formObject.agencyName}_운전경력증명서_${todayStr}`;
    const empFileName = `${formObject.agencyName}_재직증명서_${todayStr}`;

    const licenseUrl = saveBase64File(subFolder, formObject.licenseFile, licenseFileName);
    const careerUrl = saveBase64File(subFolder, formObject.careerFile, careerFileName);
    const empUrl = saveBase64File(subFolder, formObject.employmentFile, empFileName);

    const beneficiaryCount = Number(formObject.beneficiaryCount) || 0;

    sheet.appendRow([
      reservationId,
      new Date(),
      formObject.agencyName,
      formObject.managerName,
      phoneText_(formObject.managerPhone),
      formObject.driverName,
      phoneText_(formObject.driverPhone),
      formObject.licenseType,
      formObject.isAccidentFree3Yrs ? 'Y' : 'N',
      formObject.isTrained ? 'Y' : 'N',
      formObject.startDate,
      formObject.endDate,
      formObject.purpose,
      formObject.cargoDetails,
      formObject.destination,
      formObject.isEmergency ? 'Y' : 'N',
      formObject.emergencyReason || '',
      licenseUrl,
      careerUrl,
      empUrl,
      '접수대기',
      '',
      formObject.managerEmail,
      hashReservationPin_(formObject.accessPin),
      beneficiaryCount
    ]);

    sendNotificationEmail(formObject.managerEmail, '접수', {
      reservationId: reservationId,
      agencyName: formObject.agencyName,
      startDate: formObject.startDate,
      endDate: formObject.endDate,
      purpose: formObject.purpose,
      beneficiaryCount: beneficiaryCount
    });

    return { success: true, reservationId: reservationId };

  } catch (error) {
    return { success: false, message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 8. 복지관 자체 운행 등록
 */
function submitInternalDrive(data, password) {
  if (!verifyAdmin(password)) {
    return { success: false, message: '관리자 인증 실패' };
  }
  const lock = LockService.getScriptLock();
  try {
  lock.waitLock(10000);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const resSheet = ss.getSheetByName('Reservations');
  const logSheet = ss.getSheetByName('Vehicle_Logs');

  const todayStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss');
  const reservationId = 'INT_' + todayStr + '_' + Utilities.getUuid().slice(0, 8);

  const startDate = normalizeDate_(data.startDate);
  const endDate = normalizeDate_(data.endDate);
  if (endDate <= startDate) return { success: false, message: '종료 시각은 시작 시각 이후여야 합니다.' };
  if (hasReservationConflict_(resSheet, startDate, endDate, '')) return { success: false, message: '해당 시간대에 차량 사용 일정이 있습니다.' };

  const outOdo = Number(data.outOdo);
  const inOdo = Number(data.inOdo);
  const totalDist = inOdo >= outOdo ? (inOdo - outOdo) : 0;
  const beneficiaryCount = Number(data.beneficiaryCount) || 0;

  resSheet.appendRow([
    reservationId,
    new Date(),
    '거제시종합사회복지관(자체)',
    data.driverName,
    phoneText_(data.driverPhone),
    data.driverName,
    phoneText_(data.driverPhone),
    '1종 보통',
    'Y',
    'Y',
    data.startDate,
    data.endDate,
    data.purpose,
    `동행자: ${data.fellows || '없음'}`,
    data.destination,
    'N',
    '',
    '', '', '',
    '반납완료',
    `[자체운행] 동행: ${data.fellows || '-'} / 비고: ${data.notes || '-'}`,
    '',
    '0000',
    beneficiaryCount
  ]);

  logSheet.appendRow([
    reservationId,
    startDate,
    endDate,
    outOdo,
    inOdo,
    totalDist,
    'Full',
    'Full',
    '',
    '',
    '해당없음(자체운행)',
    data.notes || '이상없음'
  ]);

  try {
    const cal = CalendarApp.getDefaultCalendar();
    cal.createEvent(
      `[복지관 자체운행] ${data.driverName} (${data.purpose})`,
      new Date(data.startDate),
      new Date(data.endDate),
      {
        description: `내부운행번호: ${reservationId}\n운전자: ${data.driverName}\n동행자: ${data.fellows}\n수혜인원: ${beneficiaryCount}명`
      }
    );
  } catch(e) {
    Logger.log('Calendar Error: ' + e);
  }

  return { success: true, reservationId: reservationId };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/**
 * 9. 실시간 대여 캘린더 조회
 */
function getCalendarEvents() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Reservations');
  const data = sheet.getDataRange().getValues();
  const events = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = row[20];
    if (status === '반려' || status === '신청취소') continue;

    const resId = String(row[0]);
    const agency = row[2];
    const startDate = new Date(row[10]);
    const endDate = new Date(row[11]);
    const benCount = row[24] || 0;

    let color = '#2563eb';
    if (status === '접수대기') color = '#f59e0b';
    else if (status === '반납검토대기') color = '#ec4899';
    else if (status === '반납완료') color = '#64748b';

    if (agency.includes('자체')) color = '#475569';

    const nextAvailableDate = new Date(endDate.getTime() + (2 * 60 * 60 * 1000));
    const nextAvailStr = Utilities.formatDate(nextAvailableDate, 'Asia/Seoul', 'yyyy년 MM월 dd일 HH:mm');
    const startStr = Utilities.formatDate(startDate, 'Asia/Seoul', 'yyyy년 MM월 dd일 HH:mm');
    const endStr = Utilities.formatDate(endDate, 'Asia/Seoul', 'yyyy년 MM월 dd일 HH:mm');

    events.push({
      id: resId,
      title: `[${status}] 차량 사용 예정`,
      start: Utilities.formatDate(startDate, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss"),
      end: Utilities.formatDate(endDate, 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ss"),
      backgroundColor: color,
      borderColor: color,
      textColor: '#ffffff',
      extendedProps: {
        status: status,
        startStr: startStr,
        endStr: endStr,
        nextAvailableStr: nextAvailStr
      }
    });
  }
  return events;
}

/**
 * 10. 관리자용 협약기관 목록 전체 조회
 */
function getAdminAgencies(password) {
  if (!verifyAdmin(password)) {
    return { success: false, message: '관리자 인증 실패' };
  }
  try {
    ensureRequiredSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Agencies');
    const data = sheet.getDataRange().getValues();
    const list = [];
    const now = new Date();

    for (let i = 1; i < data.length; i++) {
      let status = data[i][7] || '정상';
      const startVal = data[i][8];
      const endVal = data[i][9];
      let penaltyStartStr = '';
      let penaltyEndStr = '';

      if (endVal) {
        const endDate = new Date(endVal);
        endDate.setHours(23, 59, 59, 999);
        if (now > endDate && status === '이용제한') {
          status = '정상';
          sheet.getRange(i + 1, 8).setValue('정상');
          sheet.getRange(i + 1, 9).setValue('');
          sheet.getRange(i + 1, 10).setValue('');
          sheet.getRange(i + 1, 11).setValue('');
        } else {
          penaltyStartStr = startVal ? Utilities.formatDate(new Date(startVal), 'Asia/Seoul', 'yyyy-MM-dd') : '';
          penaltyEndStr = Utilities.formatDate(endDate, 'Asia/Seoul', 'yyyy-MM-dd');
        }
      }

      list.push({
        rowIndex: i + 1,
        agencyName: data[i][0] || '',
        bizNumber: data[i][1] || '',
        ceoName: data[i][2] || '',
        managerName: data[i][3] || '',
        phone: data[i][4] || '',
        agreementDate: data[i][5] ? Utilities.formatDate(new Date(data[i][5]), 'Asia/Seoul', 'yyyy-MM-dd') : '',
        agreementFileUrl: data[i][6] || '',
        status: status,
        penaltyStart: penaltyStartStr,
        penaltyUntil: penaltyEndStr,
        penaltyReason: data[i][10] || '',
        createdAt: data[i][11] ? Utilities.formatDate(new Date(data[i][11]), 'Asia/Seoul', 'yyyy-MM-dd') : ''
      });
    }
    return { success: true, list: list };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 11. 관리자용 협약기관 신규 등록
 */
function addAgencyByAdmin(password, agencyData) {
  if (!verifyAdmin(password)) {
    return { success: false, message: '관리자 인증 실패' };
  }
  try {
    ensureRequiredSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Agencies');
    const data = sheet.getDataRange().getValues();

    const name = String(agencyData.agencyName).trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === name) {
        return { success: false, message: '이미 등록되어 있는 협약기관입니다.' };
      }
    }

    let agreementFileUrl = '';
    if (agencyData.agreementFile && agencyData.agreementFile.base64) {
      const parentFolder = DriveApp.getFolderById(AGREEMENT_FOLDER_ID);
      const subFolder = parentFolder.createFolder(`협약서_${name}`);
      const fileName = `${name}_협약서_${agencyData.agreementDate || '사본'}`;
      agreementFileUrl = saveBase64File(subFolder, agencyData.agreementFile, fileName);
    }

    sheet.appendRow([
      name,
      agencyData.bizNumber || '',
      agencyData.ceoName || '',
      agencyData.managerName || '',
      agencyData.phone || '',
      agencyData.agreementDate || '',
      agreementFileUrl,
      '정상',
      '',
      '',
      '',
      new Date()
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 12. 관리자용 협약기관 페널티 설정 또는 해제
 */
function updateAgencyPenalty(password, rowIndex, isRestricted, startDate, endDate, reason) {
  if (!verifyAdmin(password)) {
    return { success: false, message: '관리자 인증 실패' };
  }
  try {
    ensureRequiredSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Agencies');

    if (isRestricted) {
      sheet.getRange(rowIndex, 8).setValue('이용제한');
      sheet.getRange(rowIndex, 9).setValue(startDate);
      sheet.getRange(rowIndex, 10).setValue(endDate);
      sheet.getRange(rowIndex, 11).setValue(reason || '규정 위반');
    } else {
      sheet.getRange(rowIndex, 8).setValue('정상');
      sheet.getRange(rowIndex, 9).setValue('');
      sheet.getRange(rowIndex, 10).setValue('');
      sheet.getRange(rowIndex, 11).setValue('');
    }
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 13. 관리자 전체 예약 목록 조회 (반납 지연 판정 포함)
 */
function getAdminReservations(password) {
  try {
    if (!verifyAdmin(password)) {
      return { success: false, message: '관리자 인증 실패' };
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Reservations');
    const data = sheet.getDataRange().getValues();
    const logSheet = ss.getSheetByName('Vehicle_Logs');
    const logData = logSheet ? logSheet.getDataRange().getValues() : [];
    const list = [];
    const now = new Date();

    const formatDateSafe = (val) => {
      if (!val) return '';
      try {
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
      } catch(e) {
        return String(val);
      }
    };

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const resId = row[0];
      if (!resId) continue;

      let returnPhotos = [];
      let returnPhotoItems = [];
      let fuel = '';
      let cleanStatus = '';
      let checkNotes = '';
      let inOdo = '';
      let outOdo = '';
      let totalDist = '';

      if (logData && logData.length > 1) {
        for (let k = 1; k < logData.length; k++) {
          if (String(logData[k][0]) === String(resId)) {
            outOdo = logData[k][3] !== undefined ? logData[k][3] : '';
            inOdo = logData[k][4] !== undefined ? logData[k][4] : '';
            totalDist = logData[k][5] !== undefined ? logData[k][5] : '';
            if (logData[k][9]) {
              returnPhotos = String(logData[k][9]).split('\n').filter(url => url.trim().length > 0);
              returnPhotoItems = returnPhotos.map(line => {
                const idx = line.indexOf('|');
                const label = idx === -1 ? '' : line.slice(0, idx).trim();
                const url = (idx === -1 ? line : line.slice(idx + 1)).trim();
                const m = url.match(/\/d\/([^/?#]+)/);
                return { label: label, url: url, fileId: m ? m[1] : '' };
              });
            }
            fuel = logData[k][7] || '';
            cleanStatus = logData[k][10] || '';
            checkNotes = logData[k][11] || '';
            break;
          }
        }
      }

      let isOverdue = false;
      const status = row[20] || '접수대기';
      if (status === '승인' && row[11]) {
        const plannedEnd = new Date(row[11]);
        if (now > plannedEnd) {
          isOverdue = true;
        }
      }

      list.push({
        rowIndex: i + 1,
        reservationId: String(resId),
        createdAt: formatDateSafe(row[1]),
        agencyName: row[2] || '',
        managerName: row[3] || '',
        managerPhone: row[4] || '',
        driverName: row[5] || '',
        driverPhone: row[6] || '',
        licenseType: row[7] || '',
        startDate: formatDateSafe(row[10]),
        endDate: formatDateSafe(row[11]),
        purpose: row[12] || '',
        cargoDetails: row[13] || '',
        destination: row[14] || '',
        licenseFileUrl: row[17] || '',
        careerFileUrl: row[18] || '',
        employmentFileUrl: row[19] || '',
        status: status,
        isOverdue: isOverdue,
        adminNotes: row[21] || '',
        managerEmail: row[22] || '',
        beneficiaryCount: row[24] || 0,
        outOdo: outOdo,
        inOdo: inOdo,
        totalDist: totalDist,
        returnPhotos: returnPhotos,
        returnPhotoItems: returnPhotoItems,
        fuel: fuel,
        cleanStatus: cleanStatus,
        checkNotes: checkNotes
      });
    }

    list.reverse();
    return { success: true, data: list };

  } catch (err) {
    return { success: false, message: '서버 조회 오류: ' + err.toString() };
  }
}

/**
 * 반납 검수 사진 한 장을 관리자 화면에 표시하기 위해 base64 로 돌려줌
 * (해당 예약의 Vehicle_Logs 에 등록된 사진만 허용)
 */
function getReturnPhotoData(password, reservationId, fileId) {
  try {
    if (!verifyAdmin(password)) return { success: false, message: '관리자 인증 실패' };
    if (!/^[\w-]{10,}$/.test(String(fileId || ''))) return { success: false, message: '사진을 찾을 수 없습니다.' };
    const logData = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Vehicle_Logs').getDataRange().getValues();
    let allowed = false;
    for (let k = 1; k < logData.length; k++) {
      if (String(logData[k][0]) === String(reservationId) && String(logData[k][9]).indexOf(fileId) !== -1) {
        allowed = true;
        break;
      }
    }
    if (!allowed) return { success: false, message: '사진을 찾을 수 없습니다.' };
    const blob = DriveApp.getFileById(fileId).getBlob();
    return { success: true, dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
  } catch (e) {
    return { success: false, message: '사진을 불러오지 못했습니다: ' + e.toString() };
  }
}

/**
 * 14. 기간별/구분별 통합 차량운행일지 A4 가로 인쇄 HTML 생성
 */
function getPeriodicDrivingLogHtml(password, startDate, endDate, filterType) {
  if (!verifyAdmin(password)) {
    return '<h3>관리자 인증에 실패하였습니다.</h3>';
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const resSheet = ss.getSheetByName('Reservations');
  const logSheet = ss.getSheetByName('Vehicle_Logs');

  const resData = resSheet ? resSheet.getDataRange().getValues() : [];
  const logData = logSheet ? logSheet.getDataRange().getValues() : [];

  const startDt = new Date(startDate + 'T00:00:00');
  const endDt = new Date(endDate + 'T23:59:59');

  const logMap = {};
  for (let k = 1; k < logData.length; k++) {
    const rId = String(logData[k][0]);
    if (rId) {
      logMap[rId] = {
        outOdo: logData[k][3] !== undefined && logData[k][3] !== '' ? logData[k][3] : '-',
        inOdo: logData[k][4] !== undefined && logData[k][4] !== '' ? logData[k][4] : '-',
        dist: logData[k][5] !== undefined && logData[k][5] !== '' ? Number(logData[k][5]) : 0
      };
    }
  }

  const rows = [];
  let totalKm = 0;
  let totalBen = 0;

  for (let i = 1; i < resData.length; i++) {
    const row = resData[i];
    const resId = String(row[0]);
    const status = String(row[20]);
    if (!resId || status === '반려' || status === '신청취소') continue;

    const rowStart = new Date(row[10]);
    if (isNaN(rowStart.getTime())) continue;

    if (rowStart < startDt || rowStart > endDt) continue;

    const agency = String(row[2] || '');
    const isInternal = agency.indexOf('자체') !== -1;

    if (filterType === 'RENTAL' && isInternal) continue;
    if (filterType === 'INTERNAL' && !isInternal) continue;

    const logInfo = logMap[resId] || { outOdo: '-', inOdo: '-', dist: 0 };
    const benCount = Number(row[24]) || 0;

    totalKm += logInfo.dist;
    totalBen += benCount;

    rows.push({
      dateStr: Utilities.formatDate(rowStart, 'Asia/Seoul', 'MM.dd'),
      timeStr: Utilities.formatDate(rowStart, 'Asia/Seoul', 'HH:mm') + '~' + (row[11] ? Utilities.formatDate(new Date(row[11]), 'Asia/Seoul', 'HH:mm') : ''),
      typeStr: isInternal ? '복지관자체' : '기관대여',
      agency: agency,
      driver: String(row[5] || ''),
      purpose: String(row[12] || ''),
      destination: String(row[14] || ''),
      outOdo: logInfo.outOdo,
      inOdo: logInfo.inOdo,
      dist: logInfo.dist > 0 ? logInfo.dist : '-',
      benCount: benCount > 0 ? benCount : '-',
      status: status
    });
  }

  rows.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

  let filterName = '전체 운행 내역';
  if (filterType === 'RENTAL') filterName = '협약기관 대여 운행만';
  if (filterType === 'INTERNAL') filterName = '복지관 자체 운행만';

  let trHtml = '';
  if (rows.length === 0) {
    trHtml = '<tr><td colspan="12" style="text-align:center; padding:20px; color:#666;">해당 기간 및 조건에 해당하는 운행 내역이 없습니다.</td></tr>';
  } else {
    rows.forEach((r, idx) => {
      trHtml += `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td style="text-align:center;">${r.dateStr}</td>
          <td style="text-align:center;">${r.timeStr}</td>
          <td style="text-align:center;"><strong>${r.typeStr}</strong></td>
          <td>${r.agency}</td>
          <td style="text-align:center;">${r.driver}</td>
          <td>${r.purpose}</td>
          <td>${r.destination}</td>
          <td style="text-align:right;">${r.outOdo}</td>
          <td style="text-align:right;">${r.inOdo}</td>
          <td style="text-align:right; font-weight:bold;">${r.dist}</td>
          <td style="text-align:right; font-weight:bold; color:#0d6efd;">${r.benCount}</td>
        </tr>
      `;
    });
  }

  const logos = getLogos();
  const orgLogoImg = logos.orgLogo ? `<img src="${logos.orgLogo}" style="height: 22px; object-fit: contain;" alt="거제시종합사회복지관">` : '';
  const chestLogoImg = logos.chestLogo ? `<img src="${logos.chestLogo}" style="height: 22px; object-fit: contain;" alt="사랑의열매">` : '';

  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
      <meta charset="UTF-8">
      <title>차량운행일지_대장출력</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: 'Malgun Gothic', '맑은 고딕', dotum, sans-serif; font-size: 11px; color: #111; margin: 0; padding: 15px; }
        .no-print { text-align: right; margin-bottom: 15px; }
        .print-btn { padding: 8px 18px; background: #0d6efd; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }
        @media print { .no-print { display: none !important; } body { padding: 0; } }
        .header-wrap { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 10px; }
        .title-area h2 { margin: 0 0 4px 0; font-size: 20px; letter-spacing: 2px; }
        .title-area .sub { font-size: 11px; color: #555; }
        .approval-table { border-collapse: collapse; }
        .approval-table th, .approval-table td { border: 1px solid #333; text-align: center; }
        .approval-table th { background: #f2f2f2; width: 62px; padding: 3px; font-size: 11px; }
        .approval-table td { height: 42px; width: 62px; }
        .info-bar { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #cbd5e1; padding: 6px 10px; margin-bottom: 8px; font-size: 11px; border-radius: 4px; }
        .log-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        .log-table th, .log-table td { border: 1px solid #333; padding: 6px 4px; }
        .log-table th { background: #f1f5f9; text-align: center; font-weight: 600; font-size: 11px; }
        .summary-row th { background: #e2e8f0; font-weight: bold; text-align: center; }
        .footer-wrap { margin-top: 15px; display: flex; justify-content: space-between; align-items: center; }
        .footer-note { font-size: 10px; color: #666; line-height: 1.5; }
        .footer-logos { display: flex; align-items: center; gap: 12px; }
      </style>
    </head>
    <body>
      <div class="no-print">
        <button class="print-btn" onclick="window.print()">🖨️ 인쇄하기 / PDF 저장</button>
      </div>

      <div class="header-wrap">
        <div class="title-area">
          <h2>차 량 운 행 일 지 (통합 대장)</h2>
          <div class="sub">[${VEHICLE_INFO.supportOrg} 지원 | ${VEHICLE_INFO.projectName}]</div>
        </div>
        <table class="approval-table">
          <tr>
            <th rowspan="2" style="width:20px;">결<br>재</th>
            <th>담 당</th>
            <th>팀·과장</th>
            <th>사무국장</th>
            <th>관 장</th>
          </tr>
          <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
        </table>
      </div>

      <div class="info-bar">
        <div>
          <strong>차량번호:</strong> ${VEHICLE_INFO.plateNumber} (${VEHICLE_INFO.model}) | 
          <strong>운영기관:</strong> ${VEHICLE_INFO.orgName}
        </div>
        <div>
          <strong>조회기간:</strong> ${startDate} ~ ${endDate} | 
          <strong>구분:</strong> ${filterName}
        </div>
      </div>

      <table class="log-table">
        <thead>
          <tr>
            <th style="width: 25px;">No</th>
            <th style="width: 40px;">일자</th>
            <th style="width: 80px;">운행시간</th>
            <th style="width: 65px;">구분</th>
            <th style="width: 120px;">이용(신청)기관</th>
            <th style="width: 55px;">운전자</th>
            <th>운행목적</th>
            <th>행선지</th>
            <th style="width: 60px;">출발(km)</th>
            <th style="width: 60px;">도착(km)</th>
            <th style="width: 60px;">주행(km)</th>
            <th style="width: 55px;">수혜인원</th>
          </tr>
        </thead>
        <tbody>
          ${trHtml}
        </tbody>
        <tfoot>
          <tr class="summary-row">
            <th colspan="8">합 계 (총 ${rows.length}건)</th>
            <th colspan="2">-</th>
            <th style="text-align:right; font-size:12px; color:#111;">${totalKm.toLocaleString()} km</th>
            <th style="text-align:right; font-size:12px; color:#0d6efd;">${totalBen.toLocaleString()} 명</th>
          </tr>
        </tfoot>
      </table>

      <div class="footer-wrap">
        <div class="footer-note">
          * 본 대장은 사회복지공동모금회 특수공유차량 운영지침에 따른 공식 실적 증빙 문서입니다.<br>
          출력일시: ${Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy.MM.dd HH:mm')} | 거제시종합사회복지관
        </div>
        <div class="footer-logos">
          ${orgLogoImg}
          ${chestLogoImg}
        </div>
      </div>
    </body>
    </html>
  `;
}

function getDrivingLogHtml(password, reservationId) {
  if (!verifyAdmin(password)) return '<h3>관리자 인증에 실패하였습니다.</h3>';
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Reservations');
  const data = sheet ? sheet.getDataRange().getValues() : [];
  let row = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(reservationId)) { row = data[i]; break; }
  }
  if (!row) return '<h3>예약 내역을 찾을 수 없습니다.</h3>';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fields = [['예약번호',row[0]],['신청기관',row[2]],['담당자',row[3]],['운전자',row[5]],['운행일시',String(row[10])+' ~ '+String(row[11])],['목적',row[12]],['적재물',row[13]],['행선지',row[14]]];
  return '<!doctype html><html lang="ko"><meta charset="utf-8"><title>차량운행일지</title><style>body{font:14px sans-serif;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:10px;text-align:left}th{width:140px;background:#f1f5f9}@media print{button{display:none}}</style><button onclick="print()">인쇄</button><h2>차량 운행 기록</h2><table>'+fields.map(f=>'<tr><th>'+esc(f[0])+'</th><td>'+esc(f[1])+'</td></tr>').join('')+'</table></html>';
}

/**
 * 15. 이메일 알림 발송
 */
function sendNotificationEmail(toEmail, status, details) {
  if (!toEmail) return;

  let subject = '';
  let title = '';
  let contentHtml = '';

  if (status === '접수') {
    subject = `[거제복지관] 나눔드림트럭 대여 신청이 정상 접수되었습니다 (${details.reservationId})`;
    title = '대여 신청 접수 안내';
    contentHtml = `
      <p style="margin: 0 0 12px; font-size: 15px;">안녕하십니까, <strong>${details.agencyName}</strong> 담당자님.</p>
      <p style="margin: 0 0 16px; color: #475569;">거제시 복지시설 차량공유플랫폼 <strong>'나눔드림트럭'</strong> 대여 신청서가 정상 접수되었습니다.</p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #10b981; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <div style="font-size: 14px; color: #1e293b; line-height: 1.7;">
          • <strong>예약번호:</strong> ${details.reservationId}<br>
          • <strong>차량번호:</strong> ${VEHICLE_INFO.plateNumber}<br>
          • <strong>대여일정:</strong> ${details.startDate} ~ ${details.endDate}<br>
          • <strong>사용목적:</strong> ${details.purpose}<br>
          • <strong>수혜·참여인원:</strong> ${details.beneficiaryCount || 0}명
        </div>
      </div>
      <p style="color: #64748b; font-size: 13px; margin: 0 0 8px;">* 신청 내역 조회 및 취소 시 기관명과 설정하신 숫자 비밀번호가 사용됩니다. 새 신청은 6~12자리입니다.</p>
    `;
  } else if (status === '승인') {
    subject = `[거제복지관] 나눔드림트럭 대여 신청이 최종 승인되었습니다 (${details.reservationId})`;
    title = '대여 신청 승인 확정';
    contentHtml = `
      <p style="margin: 0 0 12px; font-size: 15px;">안녕하십니까, <strong>${details.agencyName}</strong> 담당자님.</p>
      <p style="margin: 0 0 16px; color: #475569;">신청하신 <strong>'나눔드림트럭'</strong> 배차가 최종 승인되었습니다.</p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #2563eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <div style="font-size: 14px; color: #1e293b; line-height: 1.7;">
          • <strong>예약번호:</strong> ${details.reservationId}<br>
          • <strong>차량번호:</strong> ${VEHICLE_INFO.plateNumber}<br>
          • <strong>지정운전자:</strong> ${details.driverName}<br>
          • <strong>대여일정:</strong> ${details.startDate} ~ ${details.endDate}
        </div>
      </div>
      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 14px; font-size: 13px; color: #92400e; line-height: 1.6;">
        <strong>[전동 윙바디 3대 핵심 안전수칙]</strong><br>
        1. <strong>전고 확인:</strong> 차량 전고 약 2.7m로 지하주차장 진입을 엄금합니다.<br>
        2. <strong>공간 확보:</strong> 전동 윙 개방 전 상부/반경 2m 장애물을 반드시 확인하세요.<br>
        3. <strong>화물 결속:</strong> 운행 전 적재함 결속벨트를 반드시 체결하세요.
      </div>
    `;
  } else if (status === '취소') {
    subject = `[거제복지관] 나눔드림트럭 대여 신청이 정상 취소되었습니다 (${details.reservationId})`;
    title = '대여 신청 취소 안내';
    contentHtml = `
      <p style="margin: 0 0 12px; font-size: 15px;">안녕하십니까, <strong>${details.agencyName}</strong> 담당자님.</p>
      <p style="margin: 0 0 16px; color: #475569;">요청하신 대여 신청 건(예약번호: ${details.reservationId})이 취소 처리되었습니다.</p>
    `;
  } else if (status === '반납완료') {
    subject = `[거제복지관] 나눔드림트럭 반납 승인이 최종 완료되었습니다 (${details.reservationId})`;
    title = '차량 반납 승인 완료';
    contentHtml = `
      <p style="margin: 0 0 12px; font-size: 15px;">안녕하십니까, <strong>${details.agencyName}</strong> 담당자님.</p>
      <p style="margin: 0 0 16px; color: #475569;">나눔드림트럭 현장 실차 확인 및 반납 승인이 최종 완료되었습니다.</p>
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #64748b; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <div style="font-size: 14px; color: #1e293b; line-height: 1.7;">
          • <strong>예약번호:</strong> ${details.reservationId}<br>
          • <strong>총 운행거리:</strong> ${details.totalDistance} km<br>
          • <strong>유류확인:</strong> Full 상태 확인 완료
        </div>
      </div>
    `;
  }

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #1e293b; margin: 0; padding: 24px; background-color: #f1f5f9;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
        <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 24px 28px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">${title}</h2>
          <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">거제시 복지시설 차량공유플랫폼 나눔드림트럭</p>
        </div>
        <div style="padding: 28px;">${contentHtml}</div>
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 28px; font-size: 12px; color: #94a3b8; text-align: center;">
          본 사업은 사랑의열매 경남사회복지공동모금회 지원으로 운영됩니다.<br>문의: 거제시종합사회복지관 복지사업팀 (055-636-0303)
        </div>
      </div>
    </body>
    </html>
  `;

  GmailApp.sendEmail(toEmail, subject, "HTML 메일을 지원하지 않는 환경입니다.", {
    name: "거제시종합사회복지관",
    htmlBody: htmlBody
  });
}

/**
 * 16. 관리자 상태 변경
 */
function updateReservationStatusByAdmin(password, reservationId, newStatus, adminNotes) {
  if (!verifyAdmin(password)) {
    return { success: false, message: '관리자 인증 실패' };
  }
  const allowedTransitions = { '승인': '접수대기', '반려': '접수대기', '반납완료': '반납검토대기' };
  if (!Object.prototype.hasOwnProperty.call(allowedTransitions, newStatus)) {
    return { success: false, message: '허용되지 않은 처리 상태입니다.' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const resSheet = ss.getSheetByName('Reservations');
  const logSheet = ss.getSheetByName('Vehicle_Logs');
  const data = resSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === reservationId) {
      const row = i + 1;
      if (String(data[i][20] || '') !== allowedTransitions[newStatus]) {
        return { success: false, message: `현재 상태(${data[i][20] || '미정'})에서는 ${newStatus} 처리할 수 없습니다.` };
      }
      resSheet.getRange(row, 21).setValue(newStatus);
      if (adminNotes !== undefined && adminNotes !== '') {
        resSheet.getRange(row, 22).setValue(adminNotes);
      }

      const rowData = resSheet.getRange(row, 1, 1, 25).getValues()[0];
      const details = {
        reservationId: rowData[0],
        agencyName: rowData[2],
        driverName: rowData[5],
        driverPhone: rowData[6],
        startDate: new Date(rowData[10]),
        endDate: new Date(rowData[11]),
        purpose: rowData[12],
        destination: rowData[14],
        managerEmail: rowData[22],
        beneficiaryCount: rowData[24] || 0
      };

      if (newStatus === '승인') {
        const cal = CalendarApp.getDefaultCalendar();
        cal.createEvent(
          `[트럭공유] ${details.agencyName} (${details.driverName})`,
          details.startDate,
          details.endDate,
          {
            description: `예약번호: ${details.reservationId}\n사용목적: ${details.purpose}\n운전자: ${details.driverName} (${details.driverPhone})\n경로: ${details.destination}\n수혜인원: ${details.beneficiaryCount}명`
          }
        );
        sendNotificationEmail(details.managerEmail, '승인', details);
      }

      if (newStatus === '반납완료' && details.managerEmail) {
        let totalDistance = '확인완료';
        const logData = logSheet.getDataRange().getValues();
        for (let k = 1; k < logData.length; k++) {
          if (logData[k][0] === reservationId) {
            totalDistance = logData[k][5] || '확인완료';
            break;
          }
        }
        details.totalDistance = totalDistance;
        sendNotificationEmail(details.managerEmail, '반납완료', details);
      }

      return { success: true };
    }
  }

  return { success: false, message: '해당 예약을 찾을 수 없습니다.' };
}

/**
 * 17. 반납 및 예약 조회
 */
function searchReservationsForCheckin(agencyKeyword, pin) {
  if (!agencyKeyword || !pin) {
    return { success: false, message: '기관명과 신청 시 설정한 비밀번호를 모두 입력해 주세요.' };
  }
  const attemptKey = authAttemptKey_('reservation-pin');
  if (isRateLimited_(attemptKey)) return { success: false, message: '조회 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Reservations');
  const data = sheet.getDataRange().getValues();
  
  const cleanAgency = String(agencyKeyword).trim();
  const cleanPin = String(pin).trim();
  const matches = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const resId = String(row[0]);
    const agency = String(row[2]);
    const status = String(row[20]);
    const savedPin = String(row[23]).trim();

    if (agency.includes(cleanAgency) && reservationPinMatches_(savedPin, cleanPin)) {
      if (savedPin === cleanPin) sheet.getRange(i + 1, 24).setValue(hashReservationPin_(cleanPin));
      matches.push({
        reservationId: resId,
        agencyName: row[2],
        driverName: row[5],
        startDate: Utilities.formatDate(new Date(row[10]), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
        endDate: Utilities.formatDate(new Date(row[11]), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'),
        purpose: row[12],
        beneficiaryCount: row[24] || 0,
        status: status
      });
    }
  }

  matches.reverse();
  if (matches.length === 0) {
    recordFailedAttempt_(attemptKey, 5, 15 * 60);
    return { success: false, message: '일치하는 내역이 없습니다. 기관명 또는 설정한 비밀번호를 확인해 주세요.' };
  }
  clearAttempts_(attemptKey);
  return { success: true, data: matches };
}

/**
 * 18. [기능 4] 신청자 예약 취소 (심사 전인 접수대기 상태만 가능)
 */
function cancelReservationByUser(reservationId, pin) {
  if (!reservationId || !pin) {
    return { success: false, message: '예약번호와 비밀번호를 모두 전달해 주세요.' };
  }
  const attemptKey = authAttemptKey_('reservation-pin');
  if (isRateLimited_(attemptKey)) return { success: false, message: '비밀번호 입력 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Reservations');
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(reservationId)) {
      const savedPin = String(data[i][23]).trim();
      const currentStatus = String(data[i][20]);

      if (!reservationPinMatches_(savedPin, pin)) {
        recordFailedAttempt_(attemptKey, 5, 15 * 60);
        return { success: false, message: '설정하신 비밀번호가 일치하지 않습니다.' };
      }
      clearAttempts_(attemptKey);
      if (savedPin === String(pin).trim()) sheet.getRange(i + 1, 24).setValue(hashReservationPin_(pin));

      if (currentStatus !== '접수대기') {
        return { success: false, message: `이미 [${currentStatus}] 상태인 건은 신청자가 직접 취소할 수 없습니다. 복지관 복지사업팀(055-636-0303)으로 연락 바랍니다.` };
      }

      const row = i + 1;
      sheet.getRange(row, 21).setValue('신청취소');
      sheet.getRange(row, 22).setValue('신청자 자진 취소 접수');

      const email = data[i][22];
      const agencyName = data[i][2];
      if (email) {
        sendNotificationEmail(email, '취소', {
          reservationId: reservationId,
          agencyName: agencyName
        });
      }

      return { success: true };
    }
  }

  recordFailedAttempt_(attemptKey, 5, 15 * 60);
  return { success: false, message: '해당 예약을 찾을 수 없습니다.' };
}

/**
 * 19. 반납 검수표 제출
 */
// 반납 검수 사진 7장 (차량 외관은 앞·옆(좌)·옆(우)·뒤 4면을 각각 촬영)
const RETURN_PHOTO_SLOTS = [
  { key: 'odo', label: '계기판' },
  { key: 'receipt', label: '주유 영수증' },
  { key: 'front', label: '외관 앞면' },
  { key: 'left', label: '외관 옆면(좌)' },
  { key: 'right', label: '외관 옆면(우)' },
  { key: 'rear', label: '외관 뒷면' },
  { key: 'wing', label: '적재함 내부·결속벨트' }
];

function submitCheckinCheck(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName('Vehicle_Logs');
  const resSheet = ss.getSheetByName('Reservations');
  
  if (!data || !data.reservationId || !/^\d{4,12}$/.test(String(data.accessPin || ''))) {
    return { success: false, message: '예약 조회 비밀번호를 다시 확인해 주세요.' };
  }
  const attemptKey = authAttemptKey_('reservation-pin');
  if (isRateLimited_(attemptKey)) return { success: false, message: '비밀번호 입력 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' };
  let agencyName = '기관';
  let authorized = false;
  const resData = resSheet.getDataRange().getValues();
  for (let j = 1; j < resData.length; j++) {
    if (String(resData[j][0]) === String(data.reservationId)) {
      if (!reservationPinMatches_(resData[j][23], data.accessPin)) {
        recordFailedAttempt_(attemptKey, 5, 15 * 60);
        return { success: false, message: '예약번호 또는 비밀번호를 확인해 주세요.' };
      }
      clearAttempts_(attemptKey);
      if (String(resData[j][23]) === String(data.accessPin)) resSheet.getRange(j + 1, 24).setValue(hashReservationPin_(data.accessPin));
      if (String(resData[j][20]) !== '승인') return { success: false, message: '승인 상태의 예약만 반납 제출할 수 있습니다.' };
      agencyName = resData[j][2];
      authorized = true;
      break;
    }
  }
  if (!authorized) {
    recordFailedAttempt_(attemptKey, 5, 15 * 60);
    return { success: false, message: '예약번호 또는 비밀번호를 확인해 주세요.' };
  }
  if (!Number.isFinite(Number(data.inOdo)) || Number(data.inOdo) < 0) return { success: false, message: '반납 계기판 값을 확인해 주세요.' };
  const existingLogData = logSheet.getDataRange().getValues();
  const selectedLog = existingLogData.find((row, index) => index > 0 && String(row[0]) === String(data.reservationId));
  if (selectedLog && Number(data.inOdo) < Number(selectedLog[3] || 0)) return { success: false, message: '반납 계기판은 출발 계기판보다 작을 수 없습니다.' };

  const bySlot = {};
  (Array.isArray(data.photos) ? data.photos : []).forEach(p => {
    if (p && RETURN_PHOTO_SLOTS.some(slot => slot.key === p.slot)) bySlot[p.slot] = p;
  });
  const missingPhotos = RETURN_PHOTO_SLOTS.filter(slot => !bySlot[slot.key]).map(slot => slot.label);
  if (missingPhotos.length) return { success: false, message: '사진이 빠졌습니다: ' + missingPhotos.join(', ') };

  const todayStr = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
  const folder = DriveApp.getFolderById(FOLDER_ID).createFolder(`반납_${agencyName}_${data.reservationId}`);

  // 시트에는 "사진이름|URL" 한 줄씩 저장
  const photoLines = RETURN_PHOTO_SLOTS.map(slot => {
    const url = saveBase64File(folder, bySlot[slot.key], `반납검수_${slot.label}_${agencyName}_${todayStr}`);
    return slot.label + '|' + url;
  });

  let totalDist = 0;
  let logFound = false;
  const logData = logSheet.getDataRange().getValues();
  
  for (let i = 1; i < logData.length; i++) {
    if (logData[i][0] === data.reservationId) {
      const row = i + 1;
      const outOdo = logData[i][3];
      const inOdo = Number(data.inOdo);
      totalDist = inOdo - Number(outOdo);

      logSheet.getRange(row, 3).setValue(new Date());
      logSheet.getRange(row, 5).setValue(inOdo);
      logSheet.getRange(row, 6).setValue(totalDist > 0 ? totalDist : 0);
      logSheet.getRange(row, 8).setValue('Full');
      logSheet.getRange(row, 10).setValue(photoLines.join('\n'));
      logSheet.getRange(row, 11).setValue(data.isWingClean ? '청결' : '정리미흡');
      logSheet.getRange(row, 12).setValue(data.notes || '');
      logFound = true;
      break;
    }
  }

  if (!logFound) {
    logSheet.appendRow([
      data.reservationId,
      '',
      new Date(),
      '',
      data.inOdo,
      '',
      '',
      'Full',
      '',
      photoLines.join('\n'),
      data.isWingClean ? '청결' : '정리미흡',
      data.notes || ''
    ]);
  }

  for (let j = 1; j < resData.length; j++) {
    if (String(resData[j][0]) === String(data.reservationId)) {
      resSheet.getRange(j + 1, 21).setValue('반납검토대기');
      break;
    }
  }

  return { success: true };
}

/**
 * 20. [기능 1] 정비 이력 등록 및 소모품 현황 조회
 */
function getMaintenanceStatus(password) {
  if (!verifyAdmin(password)) {
    return { success: false, message: '관리자 인증 실패' };
  }
  try {
    ensureRequiredSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const maintSheet = ss.getSheetByName('Maintenance_Logs');
    const logSheet = ss.getSheetByName('Vehicle_Logs');

    // 최신 주행거리 산출
    let latestOdo = 0;
    const logData = logSheet ? logSheet.getDataRange().getValues() : [];
    for (let k = 1; k < logData.length; k++) {
      const inO = Number(logData[k][4]) || 0;
      const outO = Number(logData[k][3]) || 0;
      if (inO > latestOdo) latestOdo = inO;
      if (outO > latestOdo) latestOdo = outO;
    }

    const maintData = maintSheet.getDataRange().getValues();
    const history = [];
    let lastOilOdo = 0;
    let lastFilterOdo = 0;
    let lastBrakeOdo = 0;
    let lastWingOdo = 0;

    for (let i = 1; i < maintData.length; i++) {
      const row = maintData[i];
      const dStr = row[0] ? Utilities.formatDate(new Date(row[0]), 'Asia/Seoul', 'yyyy-MM-dd') : '';
      const category = String(row[1]);
      const odo = Number(row[5]) || 0;

      history.push({
        date: dStr,
        category: category,
        details: row[2] || '',
        vendor: row[3] || '',
        cost: Number(row[4]) || 0,
        odo: odo,
        notes: row[6] || ''
      });

      if (category.includes('엔진오일') && odo > lastOilOdo) lastOilOdo = odo;
      if (category.includes('에어컨필터') && odo > lastFilterOdo) lastFilterOdo = odo;
      if (category.includes('브레이크') && odo > lastBrakeOdo) lastBrakeOdo = odo;
      if (category.includes('윙바디유압') && odo > lastWingOdo) lastWingOdo = odo;
    }

    history.reverse();

    // 권장 교체 주기 산출 (엔진오일: 10,000km, 에어컨필터: 10,000km, 브레이크패드: 30,000km, 윙바디유압유: 20,000km)
    const items = [
      {
        name: '엔진오일 & 오일필터',
        cycleKm: 10000,
        lastOdo: lastOilOdo,
        diffKm: latestOdo - lastOilOdo,
        isWarning: (latestOdo - lastOilOdo) >= 9000
      },
      {
        name: '에어컨/히터 필터',
        cycleKm: 10000,
        lastOdo: lastFilterOdo,
        diffKm: latestOdo - lastFilterOdo,
        isWarning: (latestOdo - lastFilterOdo) >= 9000
      },
      {
        name: '브레이크 패드 / 라이닝',
        cycleKm: 30000,
        lastOdo: lastBrakeOdo,
        diffKm: latestOdo - lastBrakeOdo,
        isWarning: (latestOdo - lastBrakeOdo) >= 28000
      },
      {
        name: '전동 윙바디 유압유 점검',
        cycleKm: 20000,
        lastOdo: lastWingOdo,
        diffKm: latestOdo - lastWingOdo,
        isWarning: (latestOdo - lastWingOdo) >= 19000
      }
    ];

    return {
      success: true,
      latestOdo: latestOdo,
      items: items,
      history: history
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 21. [기능 1] 신규 정비 이력 저장
 */
function addMaintenanceRecord(password, record) {
  if (!verifyAdmin(password)) {
    return { success: false, message: '관리자 인증 실패' };
  }
  try {
    ensureRequiredSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Maintenance_Logs');

    sheet.appendRow([
      record.date,
      record.category,
      record.details,
      record.vendor,
      Number(record.cost) || 0,
      Number(record.odo) || 0,
      record.notes || '',
      new Date()
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 22. [기능 2] 모금회 제출용 종합 실적 통계 산출
 */
function getPerformanceStatistics(password, targetYear) {
  if (!verifyAdmin(password)) {
    return { success: false, message: '관리자 인증 실패' };
  }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const resSheet = ss.getSheetByName('Reservations');
    const logSheet = ss.getSheetByName('Vehicle_Logs');

    const resData = resSheet ? resSheet.getDataRange().getValues() : [];
    const logData = logSheet ? logSheet.getDataRange().getValues() : [];

    const logMap = {};
    for (let k = 1; k < logData.length; k++) {
      const rId = String(logData[k][0]);
      if (rId) {
        logMap[rId] = Number(logData[k][5]) || 0;
      }
    }

    const year = Number(targetYear) || new Date().getFullYear();

    let totalTrips = 0;
    let rentalTrips = 0;
    let internalTrips = 0;
    let totalKm = 0;
    let totalBen = 0;

    const quarterStats = {
      Q1: { trips: 0, km: 0, ben: 0 },
      Q2: { trips: 0, km: 0, ben: 0 },
      Q3: { trips: 0, km: 0, ben: 0 },
      Q4: { trips: 0, km: 0, ben: 0 }
    };

    const agencyRanking = {};

    for (let i = 1; i < resData.length; i++) {
      const row = resData[i];
      const resId = String(row[0]);
      const status = String(row[20]);
      if (!resId || status === '반려' || status === '신청취소') continue;

      const startDate = new Date(row[10]);
      if (isNaN(startDate.getTime())) continue;
      if (startDate.getFullYear() !== year) continue;

      const agency = String(row[2] || '');
      const isInternal = agency.includes('자체');
      const km = logMap[resId] || 0;
      const ben = Number(row[24]) || 0;

      totalTrips++;
      totalKm += km;
      totalBen += ben;

      if (isInternal) {
        internalTrips++;
      } else {
        rentalTrips++;
        agencyRanking[agency] = agencyRanking[agency] || { count: 0, km: 0, ben: 0 };
        agencyRanking[agency].count++;
        agencyRanking[agency].km += km;
        agencyRanking[agency].ben += ben;
      }

      const m = startDate.getMonth() + 1;
      let qKey = 'Q1';
      if (m >= 4 && m <= 6) qKey = 'Q2';
      else if (m >= 7 && m <= 9) qKey = 'Q3';
      else if (m >= 10 && m <= 12) qKey = 'Q4';

      quarterStats[qKey].trips++;
      quarterStats[qKey].km += km;
      quarterStats[qKey].ben += ben;
    }

    const rankList = Object.keys(agencyRanking).map(name => {
      return {
        agencyName: name,
        count: agencyRanking[name].count,
        km: agencyRanking[name].km,
        ben: agencyRanking[name].ben
      };
    });
    rankList.sort((a, b) => b.count - a.count);

    return {
      success: true,
      year: year,
      summary: {
        totalTrips: totalTrips,
        rentalTrips: rentalTrips,
        internalTrips: internalTrips,
        totalKm: totalKm,
        totalBen: totalBen
      },
      quarters: quarterStats,
      agencyRanking: rankList
    };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 23. [기능 3] 비상 사고·고장 접수 등록
 */
function submitAccidentReport(report) {
  let pendingDuplicateKey = '';
  try {
    if (!report || report.website) return { success: false, message: '접수 내용을 확인할 수 없습니다.' };
    const clean = {
      agencyName: String(report.agencyName || '').trim(),
      driverName: String(report.driverName || '').trim(),
      reservationId: String(report.reservationId || '').trim(),
      occurredAt: String(report.occurredAt || '').trim(),
      location: String(report.location || '').trim(),
      description: String(report.description || '').trim(),
      damageDetails: String(report.damageDetails || '').trim(),
      photo: report.photo || null
    };
    if (!clean.agencyName || !clean.driverName || !clean.occurredAt || !clean.location || !clean.description || !clean.damageDetails) {
      return { success: false, message: '기관명, 운전자, 발생 일시·장소, 사고 경위와 피해 내용을 모두 입력해 주세요.' };
    }
    if (clean.agencyName.length > 100 || clean.driverName.length > 50 || clean.reservationId.length > 60 || clean.location.length > 200 || clean.description.length > 5000 || clean.damageDetails.length > 2000) {
      return { success: false, message: '입력 내용이 너무 깁니다. 각 항목을 줄여서 다시 제출해 주세요.' };
    }
    if (isNaN(new Date(clean.occurredAt).getTime())) return { success: false, message: '발생 일시를 확인해 주세요.' };
    const rateKey = authAttemptKey_('accident-submit');
    if (!claimRateLimit_(rateKey, 60)) return { success: false, message: '접수가 연속으로 제출되었습니다. 1분 후 다시 시도해 주세요.' };
    const duplicateText = [clean.agencyName, clean.driverName, clean.reservationId, clean.occurredAt, clean.location, clean.description].join('|').toLowerCase();
    const duplicateDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, duplicateText, Utilities.Charset.UTF_8);
    pendingDuplicateKey = 'accident_dup_' + Utilities.base64EncodeWebSafe(duplicateDigest).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    if (!claimRateLimit_(pendingDuplicateKey, 10 * 60)) return { success: false, message: '같은 내용의 사고 접수가 이미 등록되었습니다. 접수 결과를 확인해 주세요.' };

    ensureRequiredSheets();
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Accidents');
    const folder = DriveApp.getFolderById(FOLDER_ID);

    const accidentId = 'ACC_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss') + '_' + Utilities.getUuid().slice(0, 8);
    const safeAgency = clean.agencyName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
    const subFolder = folder.createFolder(`사고접수_${safeAgency}_${accidentId}`);

    let photoUrl = '';
    if (clean.photo && clean.photo.base64) {
      photoUrl = saveBase64File(subFolder, clean.photo, `사고현장사진_${accidentId}`);
    }

    sheet.appendRow([
      accidentId,
      clean.reservationId || '확인불가',
      clean.agencyName,
      clean.driverName,
      clean.occurredAt,
      clean.location,
      clean.description,
      clean.damageDetails,
      photoUrl,
      new Date()
    ]);
    pendingDuplicateKey = '';

    // 비상 운영 담당자 알림 메일 발송
    try {
      const emailContent = `
        <h3>[긴급] 나눔드림트럭 사고/비상 접수 알림</h3>
        • <strong>접수번호:</strong> ${accidentId}<br>
        • <strong>기관명:</strong> ${escapeHtmlServer_(clean.agencyName)} (운전자: ${escapeHtmlServer_(clean.driverName)})<br>
        • <strong>발생일시:</strong> ${escapeHtmlServer_(clean.occurredAt)}<br>
        • <strong>발생장소:</strong> ${escapeHtmlServer_(clean.location)}<br>
        • <strong>사고내용:</strong> ${escapeHtmlServer_(clean.description)}<br>
        • <strong>피해현황:</strong> ${escapeHtmlServer_(clean.damageDetails)}<br>
        • <strong>사진URL:</strong> ${photoUrl || '미첨부'}<br>
      `;
      const subjectAgency = clean.agencyName.replace(/[\r\n]/g, ' ').slice(0, 100);
      GmailApp.sendEmail(Session.getEffectiveUser().getEmail(), `[긴급 접수] 나눔드림트럭 사고 보고 (${subjectAgency})`, "", {
        htmlBody: emailContent
      });
    } catch (mailErr) {
      Logger.log('Mail Err: ' + mailErr);
    }

    return { success: true, accidentId: accidentId };
  } catch (e) {
    if (pendingDuplicateKey) CacheService.getScriptCache().remove(pendingDuplicateKey);
    return { success: false, message: e.toString() };
  }
}

/**
 * 24. Base64 파일을 구글 드라이브 파일로 저장
 */
function saveBase64File(folder, fileData, targetFileNameWithoutExt) {
  if (!fileData || !fileData.base64) return '';
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  const mimeType = String(fileData.mimeType || '').toLowerCase();
  const payload = String(fileData.base64).split(',').pop();
  if (allowedTypes.indexOf(mimeType) === -1) throw new Error('PDF, JPG, PNG 파일만 업로드할 수 있습니다.');
  if (!payload || payload.length > 7 * 1024 * 1024) throw new Error('파일당 5MB 이하로 업로드해 주세요.');
  
  let ext = '';
  if (fileData.name && fileData.name.lastIndexOf('.') !== -1) {
    ext = fileData.name.substring(fileData.name.lastIndexOf('.'));
  } else {
    ext = fileData.mimeType === 'application/pdf' ? '.pdf' : '.jpg';
  }

  const finalFileName = `${targetFileNameWithoutExt}${ext}`;
  const decoded = Utilities.base64Decode(payload);
  const blob = Utilities.newBlob(decoded, mimeType, finalFileName);
  const file = folder.createFile(blob);
  return file.getUrl();
}

/**
 * 관리자 페이지에서 '복귀' 링크로 쓰는 웹앱 주소
 */
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * 전화번호를 '010-1234-5678' 형태 문자열로 바꿈.
 * 시트에 숫자로 들어가면 맨 앞의 0이 사라지므로 문자열로 저장되도록 정리함.
 */
function phoneText_(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.charAt(0) !== '0') digits = '0' + digits;
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (digits.length === 10) return digits.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  return String(value);
}

/**
 * 25. 관리자 인증 비밀번호 검증
 */

function testFolder() {
  Logger.log(DriveApp.getFolderById('1t4Ex5SQoyBYqfL3SNS9sxSWDvmqQr57l').getName());
}
