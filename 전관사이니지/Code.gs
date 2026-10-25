/**
 * 복지관 스마트 사이니지 - 구글 앱스 스크립트 백엔드 (Code.gs)
 *
 * 비밀값(API 키)은 코드에 쓰지 않고 [프로젝트 설정 → 스크립트 속성]에 저장합니다.
 *  - OPENWEATHER_KEY : OpenWeather API 키
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('거제시종합사회복지관 스마트 사이니지')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 구글 캘린더 ID
const CALENDAR_ID = "calendar@geojecwc.kr";

// ★ [설정] 행사 소식 게시글 본문 글자 수 제한 (650자)
const EVENT_DESC_LIMIT = 650;

// ★ [설정] 외부 호출 결과를 캐시하는 시간(초). 디스플레이를 늘려도 외부 API 호출 수는 그대로 유지됨
const CACHE_SEC_WEATHER = 600;   // 날씨·미세먼지 10분
const CACHE_SEC_NEWS = 900;      // 실시간 뉴스 15분
const CACHE_SEC_SCHEDULE = 300;  // 오늘의 일정 5분
const CACHE_SEC_FORECAST = 3600; // 주간 예보 1시간

// 날씨 기준 좌표 (거제시)
const WEATHER_LAT = 34.8806;
const WEATHER_LON = 128.6211;

// 구글 드라이브 폴더 설정
const FOLDER_ID = "1UO0beDOiD-J7g08WhL9ave12ZXxknQyo";
const WEBZINE_FOLDER_ID = "1xpX4z7zMC3TjWVkZ46-r2Eb8F3uMwXrJ";
const FULLSCREEN_FOLDER_ID = "1k7GgfHzgojubwxkL1twkN6XV-24v-35a";
// 기관방문 폴더 ID
const WELCOME_FOLDER_ID = "1wAUUTEmmiCUhJNgdr1DNcJE6btU32drJ";

/**
 * 스크립트 속성 값 읽기 (없으면 빈 문자열)
 */
function getSecret(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/**
 * 캐시에 값이 있으면 그대로 돌려주고, 없으면 loader를 실행해 결과를 캐시에 저장
 * loader가 null을 주면(실패) 저장하지 않아서 다음 요청에서 다시 시도함
 */
function cachedJson(key, ttlSec, loader) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const value = loader();
  if (value !== null && value !== undefined) {
    try {
      cache.put(key, JSON.stringify(value), ttlSec);
    } catch (e) {
      // 캐시 한도(100KB)를 넘으면 저장만 생략
      console.error("캐시 저장 실패 (" + key + "): " + e.toString());
    }
  }
  return value;
}

/**
 * 파일명의 날짜/시간 문자열을 Date로 변환
 * 8자리(YYYYMMDD)는 시작 00:00:00 / 끝 23:59:59, 12자리(YYYYMMDDHHmm)는 입력한 시각 기준
 */
function parseStamp(s, isEnd) {
  const hasTime = s.length === 12;
  return new Date(
    parseInt(s.substring(0, 4), 10),
    parseInt(s.substring(4, 6), 10) - 1,
    parseInt(s.substring(6, 8), 10),
    hasTime ? parseInt(s.substring(8, 10), 10) : (isEnd ? 23 : 0),
    hasTime ? parseInt(s.substring(10, 12), 10) : (isEnd ? 59 : 0),
    isEnd ? 59 : 0
  );
}

/**
 * 파일명의 날짜/시간 기간을 검사하여 현재 유효한지 확인하는 함수
 * 지원 형식:
 *  1) YYYYMMDD-YYYYMMDD (예: 20260818-20260819 -> 18일 00:00:00 ~ 19일 23:59:59)
 *  2) YYYYMMDDHHmm-YYYYMMDDHHmm (예: 202608180900-202608191800)
 * 날짜가 파일명에 없으면 상시 재생(true)으로 간주
 */
function isMediaActive(fileName) {
  if (!fileName) return true;

  const match = fileName.match(/(\d{12}|\d{8})-(\d{12}|\d{8})/);
  if (!match) return true;

  const now = new Date();
  return now >= parseStamp(match[1], false) && now <= parseStamp(match[2], true);
}

// 홈페이지가 앱스 스크립트 요청을 403으로 막아서, 구글 시트 수식(IMPORTFEED/IMPORTXML)으로 대신 가져옴
// 편집기에서 이 함수를 한 번 실행하면 두 탭을 새로 만듦 (기존 내용은 지워짐)
//  - 홈페이지RSS : 공지사항(board_id=3) 최근 6건
//  - 홈페이지행사 : 행사 게시판(board_id=6) 최근 4건 (A~E열 IMPORTFEED)
//                  + 각 글 페이지 본문 영역의 글번호(K) / 사진 주소(L) / 문단(M)
function setupHomepageFeedSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const feed = id => '"http://gjcw.or.kr/wp-content/plugins/kboard/rss.php?board_id=' + id + '"';

  let notice = ss.getSheetByName('홈페이지RSS') || ss.insertSheet('홈페이지RSS');
  notice.clear();
  notice.getRange('A1').setFormula('=IMPORTFEED(' + feed(3) + ',"items",TRUE,6)');

  let event = ss.getSheetByName('홈페이지행사') || ss.insertSheet('홈페이지행사');
  event.clear();
  event.getRange('A1').setFormula('=IMPORTFEED(' + feed(6) + ',"items",TRUE,4)');
  event.getRange('K1:M1').setValues([['글번호', '이미지', '본문']]);
  // 글 본문 영역만 (사이트 로고, 게시판 아이콘 제외)
  const content = "//div[contains(@class,'kboard-content')]";
  for (let row = 2; row <= 5; row++) {
    const page = '"http://gjcw.or.kr/sub06-2/?uid="&K' + row + '&"&mod=document"';
    // 같은 줄 A~E열의 글 주소에서 글 번호를 찾음 (RSS 주소는 ?kboard_content_redirect=4475 또는 &uid=4475 형태)
    event.getRange('K' + row).setFormula('=IFERROR(REGEXEXTRACT(TEXTJOIN(" ",TRUE,A' + row + ':E' + row + '),"(?:uid|kboard_content_redirect)=(\\d+)"),"")');
    // 글 페이지의 모든 이미지 주소 (지연 로딩용 data-src 포함). 읽지 못하면 '조회 실패'로 남겨서 원인을 알 수 있게 함
    event.getRange('L' + row).setFormula('=IF(K' + row + '="","",IFERROR(TEXTJOIN(" ",TRUE,IMPORTXML(' + page + ',"//img/@src | //img/@data-src")),"조회 실패"))');
    // 문단을 줄바꿈으로 이어 붙여 글 배치를 유지
    event.getRange('M' + row).setFormula('=IF(K' + row + '="","",IFERROR(TEXTJOIN(CHAR(10),FALSE,IMPORTXML(' + page + ',"' + content + '//p")),""))');
  }
}

// 글 페이지 이미지 중 행사 사진만 (사이트 로고, 게시판 아이콘, SNS 아이콘 제외)
function isEventPhoto(src) {
  return /\/wp-content\/uploads\//i.test(src) &&
    !/\/(logo|social_icon)[^\/]*$/i.test(src) &&
    /\.(jpe?g|png|gif|webp)$/i.test(src);
}

// IMPORTFEED 수식이 들어 있는 탭을 읽어 { title, link, date, summary, images, body } 목록으로 돌려줌
// 1행은 IMPORTFEED가 만든 머리글 (Title, URL, Date Created, Summary 등)
function readFeedSheet(sheetName, limit) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss ? ss.getSheetByName(sheetName) : null;
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const head = values[0].map(h => String(h).trim().toLowerCase());
  const col = (keys, fallback) => {
    const i = head.findIndex(h => keys.some(k => h.indexOf(k) !== -1));
    return i === -1 ? fallback : i;
  };
  const cTitle = col(['title', '제목'], -1);
  // 머리글이 IMPORTFEED 형태가 아니면 (예: 시험용 수식이 남아 있음) 잘못된 내용을 화면에 내보내지 않음
  if (cTitle === -1) {
    console.error("'" + sheetName + "' 탭 1행에 제목(Title) 머리글이 없습니다. setupHomepageFeedSheets를 실행해 주세요.");
    return [];
  }
  const cUrl = col(['url', 'link', '링크'], -1);
  const cDate = col(['date', '날짜'], -1);
  const cSummary = col(['summary', 'description', '요약'], -1);
  const cImages = col(['이미지'], -1);
  const cBody = col(['본문'], -1);
  const tz = Session.getScriptTimeZone();

  return values.slice(1)
    .filter(r => { const t = String(r[cTitle] || '').trim(); return t !== '' && t.charAt(0) !== '#'; })
    .slice(0, limit)
    .map(r => {
      const rawDate = cDate === -1 ? '' : r[cDate];
      let date = '';
      try {
        const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
        if (rawDate !== '' && !isNaN(d.getTime())) date = Utilities.formatDate(d, tz, 'yyyy.MM.dd');
      } catch (e) {}
      return {
        title: String(r[cTitle]).trim(),
        link: cUrl === -1 ? '' : String(r[cUrl] || '').trim(),
        date: date,
        summary: cSummary === -1 ? '' : String(r[cSummary] || ''),
        images: cImages === -1 ? [] : String(r[cImages] || '').split(/\s+/).filter(Boolean),
        body: cBody === -1 ? '' : String(r[cBody] || '')
      };
    });
}

// 글 주소(RSS 주소 또는 글 페이지 주소)에서 글 번호 추출
function extractPostUid(link) {
  const m = String(link || '').match(/(?:uid=|kboard_content_redirect=)(\d+)/);
  return m ? m[1] : '';
}

// 글 번호가 있으면 홈페이지 글 상세 주소를 만들고, 없으면 원래 주소를 그대로 사용
function postUrl(section, uid, fallbackLink) {
  return uid ? 'http://gjcw.or.kr/' + section + '/?uid=' + uid + '&mod=document' : fallbackLink;
}

// HTML 특수문자 디코딩 함수
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}

// 워드프레스 썸네일 규격 제거 및 http 원본 주소 정제 함수
function getCleanWpImageUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = rawUrl.trim();

  if (url.startsWith('//')) {
    url = 'http:' + url;
  } else if (url.startsWith('/')) {
    url = 'http://gjcw.or.kr' + url;
  } else if (!url.startsWith('http')) {
    url = 'http://gjcw.or.kr/' + url;
  } else if (url.startsWith('https:')) {
    url = url.replace('https:', 'http:');
  }

  url = url.replace(/-\d+x\d+(\.[a-zA-Z]+)$/i, '$1');

  try {
    url = encodeURI(decodeURI(url));
  } catch(e) {}

  return url;
}

// 사이니지 페이지는 https라서 http 이미지는 브라우저가 차단함
// 이미지를 서버에서 받아 base64로 넣던 방식은 호출 수와 응답 크기가 커서, 이미지 프록시 주소를 직접 쓰도록 바꿈
function toDisplayImageUrl(url) {
  if (!url) return '';
  if (url.indexOf('googleusercontent.com') !== -1 || url.indexOf('drive.google.com') !== -1 || url.indexOf('https://') === 0) {
    return url;
  }
  return 'https://wsrv.nl/?url=' + encodeURIComponent(url);
}

// 드라이브 파일 주소 (이미지는 직접 주소, 영상은 미리보기 주소)
function driveFileUrl(fileId, isVideo) {
  return isVideo
    ? 'https://drive.google.com/file/d/' + fileId + '/preview'
    : 'https://lh3.googleusercontent.com/d/' + fileId;
}

// 드라이브 폴더의 파일 목록 (기간 조건으로 유효한 파일만). 폴더를 읽지 못하면 빈 목록
function listActiveFiles(folderId) {
  if (!folderId) return [];
  try {
    const out = [];
    const files = DriveApp.getFolderById(folderId).getFiles();
    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      if (isMediaActive(name)) {
        out.push({ name: name, id: file.getId(), mime: file.getMimeType() });
      }
    }
    return out;
  } catch (e) {
    console.error("드라이브 폴더 읽기 에러 (" + folderId + "): " + e.toString());
    return [];
  }
}

// 파일명 자연 정렬 (1, 2, 10 순서)
function byName(a, b) {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

// 1. 대시보드 데이터 통합 반환 (화면에서 60초마다 호출)
function getDashboardData() {
  let systemMode = "normal";
  let emergencyMsg = "";
  let operationalHours = "08:00 - 18:00";

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const settingSheet = ss ? ss.getSheetByName('운영설정') : null;
    if (settingSheet) {
      const modeValue = String(settingSheet.getRange('B3').getDisplayValue()).trim().toUpperCase();
      systemMode = (modeValue === 'ON') ? 'emergency' : 'normal';
      emergencyMsg = settingSheet.getRange('B4').getDisplayValue() || "비상 상황 발생 - 안내에 따라 대피하십시오.";

      const hoursValue = settingSheet.getRange('B6').getDisplayValue();
      if (hoursValue) {
        operationalHours = String(hoursValue).trim();
      }
    }
  } catch(e) {
    console.error("운영설정 시트 읽기 에러: " + e.toString());
  }

  // 가. 공지사항 (board_id=3)
  // 홈페이지가 앱스 스크립트 요청을 막아서, '홈페이지RSS' 탭의 IMPORTFEED 수식이 가져온 결과를 읽음
  let noticeData = [];
  try {
    noticeData = readFeedSheet('홈페이지RSS', 6).map(item => {
      const cleanDesc = decodeHtmlEntities(item.summary.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ')).trim();
      return {
        title: decodeHtmlEntities(item.title || '공지사항'),
        desc: cleanDesc.substring(0, 150) + (cleanDesc.length > 150 ? '...' : ''),
        link: postUrl('sub07-1', extractPostUid(item.link), item.link),
        date: item.date
      };
    });
  } catch(e) {
    console.error("공지사항 시트 읽기 에러: " + e.toString());
  }

  return {
    notices: noticeData,
    weather: getLiveWeather(),
    systemMode: systemMode,
    emergencyMsg: emergencyMsg,
    schedule: getTodaySchedule(),
    news: getRealtimeNews(),
    press: getPressItems(),
    operationalHours: operationalHours,
    forecast: getForecast(),
    promo: getPromo(),
    shuttleMap: getSettingByLabel('셔틀 지도 표시').toUpperCase() === 'ON',
    shuttleLead: shuttleLead_(),
    shuttleBase: shuttleBase_(),
    welcomeInfo: checkWelcomeMode()
  };
}

// 2. 구글 캘린더 오늘 일정 (5분 캐시)
function getTodaySchedule() {
  try {
    const cal = CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID) : CalendarApp.getDefaultCalendar();
    if (!cal) return [];

    const tz = Session.getScriptTimeZone();
    const todayKey = Utilities.formatDate(new Date(), tz, 'yyyyMMdd');

    return cachedJson('schedule:' + todayKey, CACHE_SEC_SCHEDULE, function() {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      return cal.getEvents(todayStart, todayEnd).map(e => {
        const timeStr = e.isAllDayEvent() ? "종일 행사" :
          Utilities.formatDate(e.getStartTime(), tz, "HH:mm") + " ~ " +
          Utilities.formatDate(e.getEndTime(), tz, "HH:mm");

        return {
          title: e.getTitle() || "복지관 행사",
          time: timeStr,
          location: e.getLocation() || "복지관 내"
        };
      });
    });
  } catch(e) {
    console.error("구글 캘린더 읽기 에러: " + e.toString());
    return [];
  }
}

// 3. 실시간 주요 뉴스 (15분 캐시)
function getRealtimeNews() {
  return cachedJson('news:kr', CACHE_SEC_NEWS, fetchRealtimeNews) || [];
}

// 뉴스 RSS를 읽어옴. 실패하거나 비어 있으면 null (캐시에 저장하지 않음)
function fetchRealtimeNews() {
  try {
    const xml = UrlFetchApp.fetch("https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko").getContentText();
    const items = XmlService.parse(xml).getRootElement().getChild('channel').getChildren('item');

    const list = items.slice(0, 12).map(item => {
      const fullTitle = item.getChildText('title') || '';
      const pubDateStr = item.getChildText('pubDate') || '';

      let formattedTime = "";
      try {
        formattedTime = Utilities.formatDate(new Date(pubDateStr), Session.getScriptTimeZone(), 'HH:mm');
      } catch(e) {}

      let newsTitle = fullTitle;
      let source = "주요뉴스";
      if (fullTitle.includes(" - ")) {
        const parts = fullTitle.split(" - ");
        source = parts.pop();
        newsTitle = parts.join(" - ");
      }

      return { title: newsTitle, source: source, time: formattedTime };
    });

    return list.length > 0 ? list : null;
  } catch(e) {
    console.error("뉴스 RSS 에러: " + e.toString());
    return null;
  }
}

// 3-1. [자동화] 원문 스크래핑을 포함하여 '언론보도' 스프레드시트에 기사 자동 동기화
// ※ 시간 기반 트리거(예: 1시간마다)를 따로 설정해야 자동으로 실행됨
function autoSyncWelfareNews() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  let sheet = ss.getSheetByName('언론보도');
  if (!sheet) {
    sheet = ss.insertSheet('언론보도');
    sheet.appendRow(['언론사명', '기사제목', '본문요약', '작성일', '기사링크(QR용)', '썸네일이미지주소']);
  }

  const existingData = sheet.getDataRange().getValues();
  const existingLinks = new Set();
  for (let i = 1; i < existingData.length; i++) {
    if (existingData[i][4]) {
      existingLinks.add(String(existingData[i][4]).trim());
    }
  }

  try {
    const query = encodeURIComponent("거제시종합사회복지관 OR 거제시복지관");
    const searchRssUrl = "https://news.google.com/rss/search?q=" + query + "&hl=ko&gl=KR&ceid=KR:ko";
    const xml = UrlFetchApp.fetch(searchRssUrl).getContentText();
    const items = XmlService.parse(xml).getRootElement().getChild('channel').getChildren('item');

    const limit = Math.min(items.length, 5);
    for (let i = 0; i < limit; i++) {
      const item = items[i];
      const fullTitle = item.getChildText('title') || '';
      const link = item.getChildText('link') || '';
      const pubDateStr = item.getChildText('pubDate') || '';

      if (!link || existingLinks.has(link.trim())) {
        continue;
      }

      let newsTitle = fullTitle;
      let source = "언론보도";
      if (fullTitle.includes(" - ")) {
        const parts = fullTitle.split(" - ");
        source = parts.pop();
        newsTitle = parts.join(" - ");
      }

      let scrapedDesc = "";
      let scrapedImage = "";
      try {
        const res = UrlFetchApp.fetch(link, {
          muteHttpExceptions: true,
          followRedirects: true,
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (res.getResponseCode() === 200) {
          const html = res.getContentText();

          const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
          if (descMatch && descMatch[1] && !isPlaceholderNewsDesc(descMatch[1])) {
            scrapedDesc = decodeHtmlEntities(descMatch[1]).trim();
          }

          const imgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
          if (imgMatch && imgMatch[1]) {
            scrapedImage = imgMatch[1].trim();
          }
        }
      } catch (err) {}

      const finalDesc = scrapedDesc || (newsTitle + " 관련 상세 보도 내용입니다.");

      let formattedDate = "";
      try {
        formattedDate = Utilities.formatDate(new Date(pubDateStr), Session.getScriptTimeZone(), 'yyyy.MM.dd');
      } catch(e) {}

      sheet.appendRow([
        source,
        newsTitle,
        finalDesc.substring(0, 150),
        formattedDate,
        link,
        scrapedImage
      ]);

      existingLinks.add(link.trim());
    }
  } catch(e) {
    console.error("자동 기사 동기화 및 스크래핑 에러: " + e.toString());
  }
}

// 기사 링크가 구글 뉴스 주소라서, 자동 수집 때 기사 본문 대신 구글 뉴스 페이지 소개 문구가 저장되는 경우가 있음
// ("Comprehensive up-to-date news coverage, aggregated from sources all over the world by Google News.")
function isPlaceholderNewsDesc(desc) {
  return /google news|comprehensive up-to-date news coverage/i.test(desc) || /관련 상세 보도 내용입니다\.?$/.test(desc);
}

// 3-2. 하단 '복지관 언론보도' 영역용 최근 기사
// 운영설정 시트 A열에서 항목 이름으로 B열 값을 찾음 (통합 관리 대시보드에서 추가/수정하는 항목)
function getSettingByLabel(label) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('운영설정');
    if (!sheet) return '';
    const row = sheet.getDataRange().getDisplayValues().find(r => String(r[0]).trim() === label);
    return row ? String(row[1]).trim() : '';
  } catch (e) {
    return '';
  }
}

// 하단 '복지관 언론보도'에 보여줄 최근 기사 수 (운영설정 '언론보도 표시 개수', 없으면 4, 0이면 안 보임)
function getPressCount() {
  const n = parseInt(getSettingByLabel('언론보도 표시 개수'), 10);
  return isNaN(n) || n < 0 ? 4 : Math.min(n, 20);
}

function getPressItems() {
  try {
    const count = getPressCount();
    if (count === 0) return [];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss ? ss.getSheetByName('언론보도') : null;
    if (!sheet || sheet.getLastRow() < 2) return [];
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getDisplayValues();
    return data.filter(row => String(row[1] || '').trim() !== '')
      .slice(-count).reverse()
      .map(row => {
        const raw = String(row[2] || '').trim();
        const desc = isPlaceholderNewsDesc(raw) ? '' : raw;
        return {
          source: String(row[0] || '언론보도').trim(),
          title: String(row[1]).trim(),
          desc: desc.substring(0, 90) + (desc.length > 90 ? '...' : ''),
          date: String(row[3] || '').trim(),
          link: String(row[4] || '').trim()
        };
      });
  } catch (e) {
    console.error("언론보도(하단) 읽기 에러: " + e.toString());
    return [];
  }
}

// 3-3. 행사 게시판 (board_id=6)
// 홈페이지가 앱스 스크립트 요청을 막아서 '홈페이지행사' 탭(setupHomepageFeedSheets)에서 읽음
// 글 내용은 M열(글 페이지 문단, 줄바꿈 유지), 없으면 IMPORTFEED 요약
// 사진은 L열 IMPORTXML이 글 페이지 본문에서 가져온 주소
// 글 페이지를 서버에서 직접 받아 사진 주소를 찾음 (구글 시트가 글 페이지를 못 읽을 때 대신 사용). 성공한 결과는 6시간 캐시
function fetchPostImages_(uid) {
  if (!uid) return [];
  const cache = CacheService.getScriptCache();
  const key = 'postimg:' + uid;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  const list = [];
  try {
    const res = UrlFetchApp.fetch('http://gjcw.or.kr/sub06-2/?uid=' + uid + '&mod=document', { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() === 200) {
      const tags = res.getContentText('UTF-8').match(/<img[^>]*>/gi) || [];
      tags.forEach(tag => {
        const m = tag.match(/data-src=["']([^"']+)["']/i) || tag.match(/\ssrc=["']([^"']+)["']/i);
        if (!m) return;
        let src = m[1].trim();
        if (src.indexOf('//') === 0) src = 'http:' + src;
        else if (src.charAt(0) === '/') src = 'http://gjcw.or.kr' + src;
        if (list.indexOf(src) === -1) list.push(src);
      });
    }
  } catch (e) {
    console.error('글 사진 읽기 실패 (' + uid + '): ' + e.message);
  }
  if (list.length) cache.put(key, JSON.stringify(list), 21600);
  return list;
}

function getEventBoardSlides() {
  const eventSlides = [];
  try {
    readFeedSheet('홈페이지행사', 4).forEach(item => {
      const title = decodeHtmlEntities(item.title || '복지관 행사 소식');

      const cleanDesc = decodeHtmlEntities((item.body || item.summary).replace(/<[^>]*>?/gm, ''))
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, "\n")
        .trim();
      const desc = cleanDesc.substring(0, EVENT_DESC_LIMIT) + (cleanDesc.length > EVENT_DESC_LIMIT ? '...' : '');

      const uid = extractPostUid(item.link);
      const targetLink = postUrl('sub06-2', uid, item.link);
      const postId = uid || title;

      // 시트(L열)에 사진 주소가 없으면 서버가 글 페이지를 직접 받아서 찾음
      const imgUrls = [];
      const srcs = item.images.length ? item.images : fetchPostImages_(uid);
      srcs.filter(isEventPhoto).forEach(src => {
        const url = toDisplayImageUrl(getCleanWpImageUrl(src));
        if (url && imgUrls.indexOf(url) === -1) {
          imgUrls.push(url);
        }
      });

      const base = {
        type: 'EVENT_POST',
        postId: postId,
        title: title,
        desc: desc,
        date: item.date,
        qr: targetLink,
        duration: 9000,
        priority: 'N'
      };

      if (imgUrls.length === 0) {
        eventSlides.push(Object.assign({}, base, { images: [], path: '', imgIndex: 0, imgTotal: 0 }));
        return;
      }

      // 사진은 한 화면에 최대 3장씩 나눠서 보여줌
      const pairs = [];
      for (let i = 0; i < imgUrls.length; i += 3) {
        pairs.push(imgUrls.slice(i, i + 3));
      }
      pairs.forEach((pair, idx) => {
        eventSlides.push(Object.assign({}, base, {
          images: pair,
          path: pair[0],
          imgIndex: idx + 1,
          imgTotal: pairs.length
        }));
      });
    });
  } catch(e) {
    console.error("행사게시판(board_id=6) 시트 읽기 에러: " + e.toString());
  }
  return eventSlides;
}

// 4. 슬라이드 데이터 통합 (화면에서 5분마다 호출)
// 상단 슬라이드 순서: 수동 슬라이드 → 행사 → 로고 → 웹진 → 프로그램 폴더 → 전체화면
function getSlideData() {
  const logoSlide = {
    type: 'LOGO_SLIDE',
    title: '거제시종합사회복지관',
    path: 'https://lh3.googleusercontent.com/d/1IV2uScHVsv0g4eQt2V33yjtMZewVY5-X',
    duration: 6000,
    qr: 'http://gjcw.or.kr',
    priority: 'N'
  };

  return getManualSlides()
    .concat(getEventBoardSlides())
    .concat([logoSlide])
    .concat(getWebzineSlides())
    .concat(getMainMediaSlides())
    .concat(getFullscreenSlides());
}

// '슬라이드설정' 시트의 수동 슬라이드 (우선순위 Y는 앞으로)
function getManualSlides() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('슬라이드설정');
    if (!sheet) return [];

    const titles = {
      FULLSCREEN: '전체 화면 안내',
      PROGRAM: '프로그램 안내',
      IMAGE: '프로그램 안내',
      VIDEO: '홍보 영상',
      SLIDES: '슬라이드 안내'
    };

    const data = sheet.getDataRange().getValues();
    data.shift();

    return data.map(row => {
      const typeStr = String(row[1] || 'IMAGE').toUpperCase().trim();
      return {
        type: typeStr,
        title: titles[typeStr] || '안내',
        path: normalizeManualPath(String(row[2] || '').trim(), typeStr),
        duration: (row[3] ? Number(row[3]) * 1000 : 6000),
        qr: String(row[4] || '').trim(),
        priority: String(row[5] || 'N').toUpperCase().trim()
      };
    })
    .filter(item => item.path !== '')
    .sort((a, b) => (b.priority === 'Y' ? 1 : 0) - (a.priority === 'Y' ? 1 : 0));
  } catch(e) {
    console.error("슬라이드 시트 읽기 에러: " + e.toString());
    return [];
  }
}

// 수동 입력 주소를 재생 가능한 주소로 변환 (드라이브 영상 링크 → 미리보기 주소)
function normalizeManualPath(rawPath, typeStr) {
  const isDriveLink = typeStr === 'VIDEO' || rawPath.indexOf('drive.google.com') !== -1;
  const isPlayable = rawPath.indexOf('/preview') !== -1 || rawPath.indexOf('youtube.com') !== -1 || rawPath.indexOf('youtu.be') !== -1;
  if (!isDriveLink || isPlayable) return rawPath;

  let fileId = "";
  if (rawPath.indexOf('id=') !== -1) {
    fileId = rawPath.split('id=')[1].split('&')[0];
  } else if (rawPath.indexOf('/d/') !== -1) {
    fileId = rawPath.split('/d/')[1].split('/')[0].split('?')[0];
  }
  return fileId ? "https://drive.google.com/file/d/" + fileId + "/preview" : rawPath;
}

// 웹진 폴더 (기간 필터링 적용)
function getWebzineSlides() {
  const monthTitle = (new Date().getMonth() + 1) + "월 웹진";
  return listActiveFiles(WEBZINE_FOLDER_ID)
    .filter(f => f.mime.startsWith('image/'))
    .sort(byName)
    .map(f => ({
      type: 'WEBZINE',
      title: monthTitle,
      path: driveFileUrl(f.id, false),
      duration: 6000,
      qr: '',
      priority: 'N'
    }));
}

// 일반 이미지/영상 폴더 (기간 필터링 적용)
function getMainMediaSlides() {
  return listActiveFiles(FOLDER_ID).reduce((acc, f) => {
    if (f.mime.startsWith('image/')) {
      acc.push({ type: 'IMAGE', title: '프로그램 안내', path: driveFileUrl(f.id, false), duration: 5000, qr: '', priority: 'N' });
    } else if (f.mime.startsWith('video/')) {
      acc.push({ type: 'VIDEO', title: '홍보 영상', path: driveFileUrl(f.id, true), duration: 10000, qr: '', priority: 'N' });
    }
    return acc;
  }, []);
}

// 전체화면 폴더 (기간 필터링 적용)
function getFullscreenSlides() {
  return listActiveFiles(FULLSCREEN_FOLDER_ID)
    .filter(f => f.mime.startsWith('image/') || f.mime.startsWith('video/'))
    .sort(byName)
    .map(f => {
      const isVid = f.mime.startsWith('video/');
      return {
        type: 'FULLSCREEN',
        title: '특별 안내',
        path: driveFileUrl(f.id, isVid),
        duration: isVid ? 10000 : 6000,
        qr: '',
        priority: 'N'
      };
    });
}

// 5. 날씨 및 미세먼지 (10분 캐시, 실패 시 기본값)
function getLiveWeather() {
  const now = cachedJson('weather:now', CACHE_SEC_WEATHER, fetchCurrentWeather);
  const dust = cachedJson('weather:dust', CACHE_SEC_WEATHER, fetchDustLevel);

  return {
    status: now ? now.status : '맑음',
    temp: now ? now.temp : '--°C',
    icon: now ? now.icon : '01d',
    dust: dust || '보통'
  };
}

// 현재 날씨 (체감 온도, 날씨 아이콘). 실패하면 null
function fetchCurrentWeather() {
  const key = getSecret('OPENWEATHER_KEY');
  if (!key) {
    console.error("스크립트 속성 OPENWEATHER_KEY가 없습니다.");
    return null;
  }
  try {
    const url = 'https://api.openweathermap.org/data/2.5/weather?lat=' + WEATHER_LAT +
      '&lon=' + WEATHER_LON + '&appid=' + key + '&units=metric&lang=kr';
    const json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    if (!json.weather || !json.weather[0]) return null;
    return {
      status: json.weather[0].description,
      temp: Math.round(json.main.feels_like) + "°C",
      icon: json.weather[0].icon
    };
  } catch(e) {
    console.error("날씨 API 에러: " + e.toString());
    return null;
  }
}

// 미세먼지(PM10) 등급. 실패하면 null
function fetchDustLevel() {
  const key = getSecret('OPENWEATHER_KEY');
  if (!key) return null;
  try {
    const url = 'https://api.openweathermap.org/data/2.5/air_pollution?lat=' + WEATHER_LAT +
      '&lon=' + WEATHER_LON + '&appid=' + key;
    const json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    const pm10 = json.list[0].components.pm10;
    if (pm10 <= 30) return "좋음";
    if (pm10 <= 80) return "보통";
    if (pm10 <= 150) return "나쁨";
    return "매우나쁨";
  } catch(e) {
    console.error("미세먼지 API 에러: " + e.toString());
    return null;
  }
}

// 셔틀 지도 표시 시작 시점 (출발 몇 분 전부터 지도에 나올지). 운영설정 '셔틀 표시 시작(분 전)', 없으면 10분
function shuttleLead_() {
  const n = parseInt(getSettingByLabel('셔틀 표시 시작(분 전)'), 10);
  return isNaN(n) ? 10 : Math.min(Math.max(n, 0), 60);
}

// 셔틀 지도 표시 기준 (운영설정 '셔틀 표시 기준': 출발 / 도착), 없으면 출발
function shuttleBase_() {
  return getSettingByLabel('셔틀 표시 기준') === '도착' ? 'arrive' : 'depart';
}

// 주간 예보: 5일 예보(3시간 간격)를 날짜별 최저·최고 기온으로 묶음. 낮 12시에 가장 가까운 시간의 날씨 아이콘을 씀
function getForecast() {
  return cachedJson('weather:forecast', CACHE_SEC_FORECAST, fetchForecast) || [];
}

function fetchForecast() {
  const key = getSecret('OPENWEATHER_KEY');
  if (!key) return null;
  try {
    const url = 'https://api.openweathermap.org/data/2.5/forecast?lat=' + WEATHER_LAT +
      '&lon=' + WEATHER_LON + '&appid=' + key + '&units=metric&lang=kr';
    const json = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
    if (!json.list || json.list.length === 0) return null;

    const days = {};
    json.list.forEach(item => {
      const at = new Date(item.dt * 1000);
      const date = fmt_(at, 'yyyy-MM-dd');
      const hour = Number(fmt_(at, 'H'));
      const day = days[date] || (days[date] = { min: Infinity, max: -Infinity, icon: '', noonGap: 99 });
      day.min = Math.min(day.min, item.main.temp_min);
      day.max = Math.max(day.max, item.main.temp_max);
      const gap = Math.abs(hour - 12);
      if (gap < day.noonGap) {
        day.noonGap = gap;
        day.icon = item.weather[0].icon;
      }
    });

    const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
    return Object.keys(days).sort().slice(0, 5).map(date => {
      const d = days[date];
      const parts = date.split('-');
      return {
        date: date.slice(5).replace('-', '.'),
        weekday: WEEKDAYS[new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay()],
        min: Math.round(d.min),
        max: Math.round(d.max),
        icon: d.icon
      };
    });
  } catch(e) {
    console.error("예보 API 에러: " + e.toString());
    return null;
  }
}

// 하단 위젯의 홍보 박스: 운영설정에 '하단 홍보 문구'와 '하단 홍보 QR 주소' 두 칸이 모두 있을 때만 보임
function getPromo() {
  const text = getSettingByLabel('하단 홍보 문구');
  const url = getSettingByLabel('하단 홍보 QR 주소');
  return text && url ? { text: text, url: url } : null;
}

// 기관방문 스케줄 및 환영 이미지 감지
function checkWelcomeMode() {
  try {
    if (!isWelcomeNow()) return { isWelcome: false, slides: [] };

    const slides = listActiveFiles(WELCOME_FOLDER_ID)
      .filter(f => f.mime.startsWith('image/'))
      .map(f => ({
        type: 'WELCOME',
        title: '방문 환영',
        path: driveFileUrl(f.id, false),
        duration: 6000
      }));
    return { isWelcome: true, slides: slides };
  } catch(e) {
    console.error("기관방문 확인 에러: " + e.toString());
    return { isWelcome: false, slides: [] };
  }
}

// '기관방문' 시트에 지금 시간이 포함된 사용 중(Y) 일정이 있는지 확인
function isWelcomeNow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('기관방문');
  if (!sheet) return false;

  const rows = sheet.getDataRange().getDisplayValues();
  rows.shift();

  const now = new Date();
  const todayStr = Utilities.formatDate(now, ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const currentMin = now.getHours() * 60 + now.getMinutes();

  return rows.some(row => {
    const useYn = String(row[3] || 'Y').toUpperCase().trim();
    const startTimeStr = String(row[1] || '').trim();
    const endTimeStr = String(row[2] || '').trim();
    if (useYn !== 'Y' || !startTimeStr || !endTimeStr) return false;
    if (normalizeDateStr(String(row[0] || '')) !== todayStr) return false;

    const startParts = startTimeStr.split(':');
    const endParts = endTimeStr.split(':');
    if (startParts.length < 2 || endParts.length < 2) return false;

    const startMin = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
    const endMin = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
    return !isNaN(startMin) && !isNaN(endMin) && currentMin >= startMin && currentMin <= endMin;
  });
}

// 2026.8.18 / 2026/08/18 / 2026-8-18 → 2026-08-18
function normalizeDateStr(dateStr) {
  let s = dateStr.replace(/[\.\/]/g, '-').replace(/\s+/g, '');
  if (s.endsWith('-')) s = s.slice(0, -1);

  const parts = s.split('-');
  if (parts.length === 3) {
    return parts[0] + '-' + parts[1].padStart(2, '0') + '-' + parts[2].padStart(2, '0');
  }
  return s;
}

// 개발용: 시트별 1행(머리글)을 로그로 출력
function dumpHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = ss.getSheets().map(sh => {
    const lastCol = sh.getLastColumn();
    const header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
    return '## ' + sh.getName() + '\n' + header.join(' | ');
  }).join('\n\n');
  Logger.log(out);
}
