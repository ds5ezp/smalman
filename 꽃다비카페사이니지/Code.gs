/**
 * 복지관 스마트 사이니지 - 구글 앱스 스크립트 백엔드 (Code.gs)
 */

function doGet() {
  try {
    return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('거제시종합사회복지관 스마트 사이니지')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) {
    return HtmlService.createHtmlOutputFromFile('Index')
      .setTitle('거제시종합사회복지관 스마트 사이니지')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

const CALENDAR_ID = "calendar@geojecwc.kr"; 
const EVENT_DESC_LIMIT = 650; 

/**
 * 파일명의 날짜/시간 기간을 검사하여 현재 유효한지 확인하는 함수
 * 지원 형식: 
 *  1) YYYYMMDD-YYYYMMDD (예: 20260818-20260819 -> 18일 00:00:00 ~ 19일 23:59:59)
 *  2) YYYYMMDDHHmm-YYYYMMDDHHmm (예: 202608180900-202608191800)
 * 날짜가 파일명에 없으면 상시 재생(true)으로 간주
 */
function isMediaActive(fileName) {
  if (!fileName) return true;

  // 12자리-12자리 (YYYYMMDDHHmm-YYYYMMDDHHmm)
  const pattern12 = /(\d{12})-(\d{12})/;
  const match12 = fileName.match(pattern12);
  const now = new Date();

  if (match12) {
    const s = match12[1];
    const e = match12[2];
    const startDate = new Date(
      parseInt(s.substring(0, 4), 10),
      parseInt(s.substring(4, 6), 10) - 1,
      parseInt(s.substring(6, 8), 10),
      parseInt(s.substring(8, 10), 10),
      parseInt(s.substring(10, 12), 10),
      0
    );
    const endDate = new Date(
      parseInt(e.substring(0, 4), 10),
      parseInt(e.substring(4, 6), 10) - 1,
      parseInt(e.substring(6, 8), 10),
      parseInt(e.substring(8, 10), 10),
      parseInt(e.substring(10, 12), 10),
      59
    );
    return now >= startDate && now <= endDate;
  }

  // 8자리-8자리 (YYYYMMDD-YYYYMMDD)
  const pattern8 = /(\d{8})-(\d{8})/;
  const match8 = fileName.match(pattern8);

  if (match8) {
    const s = match8[1];
    const e = match8[2];
    const startDate = new Date(
      parseInt(s.substring(0, 4), 10),
      parseInt(s.substring(4, 6), 10) - 1,
      parseInt(s.substring(6, 8), 10),
      0, 0, 0
    );
    const endDate = new Date(
      parseInt(e.substring(0, 4), 10),
      parseInt(e.substring(4, 6), 10) - 1,
      parseInt(e.substring(6, 8), 10),
      23, 59, 59
    );
    return now >= startDate && now <= endDate;
  }

  // 파일명에 날짜 기간이 없으면 상시 활성화
  return true;
}

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

function getCleanWpImageUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  if (url.startsWith('//')) url = 'http:' + url;
  else if (url.startsWith('/')) url = 'http://gjcw.or.kr' + url;
  else if (!url.startsWith('http')) url = 'http://gjcw.or.kr/' + url;
  else if (url.startsWith('https:')) url = url.replace('https:', 'http:');
  url = url.replace(/-\d+x\d+(\.[a-zA-Z]+)$/i, '$1');
  try { url = encodeURI(decodeURI(url)); } catch(e) {}
  return url;
}

function fetchImageAsBase64(url) {
  if (!url) return '';
  if (url.indexOf('googleusercontent.com') !== -1 || url.indexOf('drive.google.com') !== -1) return url;
  try {
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (response.getResponseCode() === 200) {
      const blob = response.getBlob();
      return 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    }
  } catch(e) {}
  return 'https://wsrv.nl/?url=' + encodeURIComponent(url);
}

function getDashboardData() {
  let systemMode = "normal";
  let emergencyMsg = "";
  let operationalHours = "09:00 - 18:00";
  let fontScale = 100;
  let noticeListOn = true;
  let noticeListCount = 5;
  let noticeData = [];
  let noticeError = '';

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      const settingSheet = ss.getSheetByName('운영설정');
      if (settingSheet) {
        const modeValue = settingSheet.getRange('B3').getValue();
        systemMode = (modeValue === 'ON') ? 'emergency' : 'normal';
        emergencyMsg = settingSheet.getRange('B4').getValue() || "비상 상황 발생 - 안내에 따라 대피하십시오.";
        const hoursValue = settingSheet.getRange('B6').getValue();
        if (hoursValue) operationalHours = String(hoursValue).trim();
        // B8: 글자 크기(%). 비워두면 100. 50~150 사이에서만 적용
        const scaleValue = Number(settingSheet.getRange('B8').getValue());
        if (scaleValue >= 50 && scaleValue <= 150) fontScale = scaleValue;
        // B10: 우측 공지 목록 표시 ON/OFF (비우면 ON), B11: 목록 개수 (1~10, 기본 5)
        noticeListOn = String(settingSheet.getRange('B10').getValue()).trim().toUpperCase() !== 'OFF';
        const listCount = Number(settingSheet.getRange('B11').getValue());
        if (listCount >= 1 && listCount <= 10) noticeListCount = listCount;
      }
    }
  } catch(e) {}

  // 공지사항: 홈페이지가 앱스 스크립트 요청을 막아서, '홈페이지RSS' 탭(IMPORTFEED 수식)에서 읽음
  try {
    noticeData = readNoticeFeedSheet_(6);
  } catch(e) {
    // 읽지 못한 이유를 화면에 보여 줌 (정말 글이 없는 경우와 구분하기 위해)
    noticeError = '공지사항을 불러오지 못했습니다. (' + e.message + ')';
  }

  return { 
    notices: noticeData,
    noticeError: noticeError,
    weather: getLiveWeather(), 
    systemMode: systemMode, 
    emergencyMsg: emergencyMsg,
    schedule: getTodaySchedule(),
    news: getRealtimeNews(),
    operationalHours: operationalHours,
    welcomeInfo: checkWelcomeMode(),
    fontScale: fontScale,
    noticeListOn: noticeListOn,
    noticeListCount: noticeListCount
  };
}

function getTodaySchedule() {
  try {
    let cal = CALENDAR_ID ? CalendarApp.getCalendarById(CALENDAR_ID) : CalendarApp.getDefaultCalendar();
    if (!cal) return [];
    const now = new Date();
    const events = cal.getEvents(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0), new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59));
    return events.map(e => ({
      title: e.getTitle() || "복지관 행사",
      time: e.isAllDayEvent() ? "종일 행사" : Utilities.formatDate(e.getStartTime(), Session.getScriptTimeZone(), "HH:mm") + " ~ " + Utilities.formatDate(e.getEndTime(), Session.getScriptTimeZone(), "HH:mm"),
      location: e.getLocation() || "복지관 내"
    }));
  } catch(e) { return []; }
}

function getRealtimeNews() {
  try {
    const xml = UrlFetchApp.fetch("https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko").getContentText();
    const items = XmlService.parse(xml).getRootElement().getChild('channel').getChildren('item');
    return items.slice(0, 12).map(item => {
      let fullTitle = item.getChildText('title') || '', source = "주요뉴스";
      if (fullTitle.includes(" - ")) {
        let parts = fullTitle.split(" - ");
        source = parts.pop();
        fullTitle = parts.join(" - ");
      }
      return { title: fullTitle, source: source, time: "" };
    });
  } catch(e) { return []; }
}

function getEventBoardSlides() {
  let eventSlides = [];
  try {
    const rssUrl = "http://gjcw.or.kr/wp-content/plugins/kboard/rss.php?board_id=6";
    const xml = UrlFetchApp.fetch(rssUrl).getContentText();
    const items = XmlService.parse(xml).getRootElement().getChild('channel').getChildren('item');

    items.slice(0, 4).forEach(item => {
      const rawTitle = item.getChildText('title') || '복지관 행사 소식';
      const title = decodeHtmlEntities(rawTitle);
      const rawDesc = item.getChildText('description') || '';
      const pubDateStr = item.getChildText('pubDate') || '';
      const link = item.getChildText('link') || '';

      let imgUrls = [];
      let match, imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
      while ((match = imgRegex.exec(rawDesc)) !== null) {
        let cleanSrc = getCleanWpImageUrl(match[1].trim());
        if (cleanSrc && imgUrls.indexOf(cleanSrc) === -1) imgUrls.push(cleanSrc);
      }

      let uid = "";
      const uidMatch = link.match(/uid=(\d+)/);
      const redirectMatch = link.match(/kboard_content_redirect=(\d+)/);
      if (uidMatch) { uid = uidMatch[1]; } else if (redirectMatch) { uid = redirectMatch[1]; }

      let targetLink = link;
      if (uid) {
        targetLink = "http://gjcw.or.kr/sub06-2/?uid=" + uid + "&mod=document";
      }

      let formattedDate = "";
      try {
        formattedDate = Utilities.formatDate(new Date(pubDateStr), Session.getScriptTimeZone(), 'yyyy.MM.dd');
      } catch(e) {}

      if (imgUrls.length > 0) {
        let displayLimit = Math.min(imgUrls.length, 2);
        for (let i = 0; i < displayLimit; i++) {
          let convertedImg = fetchImageAsBase64(imgUrls[i]);
          eventSlides.push({
            type: 'EVENT_POST',
            postId: uid || title,
            title: title,
            imagePath: convertedImg,
            images: [convertedImg],
            path: convertedImg,
            date: formattedDate,
            qr: targetLink,
            duration: 10000,
            imgIndex: i + 1,
            imgTotal: displayLimit,
            priority: 'N'
          });
        }
      } else {
        eventSlides.push({
          type: 'EVENT_POST',
          postId: uid || title,
          title: title,
          imagePath: '',
          images: [],
          path: '',
          date: formattedDate,
          qr: targetLink,
          duration: 10000,
          imgIndex: 0,
          imgTotal: 0,
          priority: 'N'
        });
      }
    });
  } catch(e) {}
  return eventSlides;
}

const CAFE_FOLDER_ID = "1GLppM_b3WpWzhFjWiCYp1h7RMn2-jlnn";         
const FULLSCREEN_FOLDER_ID = "1PiLEOtZwiECWb2A_Um7N4ZIW1RYpDIER";   
const WEBZINE_FOLDER_ID = "1xpX4z7zMC3TjWVkZ46-r2Eb8F3uMwXrJ"; 

function getSlideData() {
  let manualSlides = [];
  let cafeSlides = [];
  let fullscreenSlides = [];
  let eventSlides = getEventBoardSlides();

  let logoSlide = {
    type: 'LOGO_SLIDE',
    title: '거제시종합사회복지관',
    path: 'https://lh3.googleusercontent.com/d/1IV2uScHVsv0g4eQt2V33yjtMZewVY5-X',
    duration: 8000,
    qr: 'http://gjcw.or.kr',
    priority: 'N'
  };

  let weatherSlide = {
    type: 'WEATHER_SLIDE',
    title: '실시간 날씨 안내',
    path: '',
    duration: 10000,
    qr: '',
    priority: 'N'
  };

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      const sheet = ss.getSheetByName('슬라이드설정');
      if (sheet) {
        const data = sheet.getDataRange().getValues();
        data.shift(); 
        manualSlides = data.map(row => {
          const typeStr = String(row[1] || 'IMAGE').toUpperCase().trim();
          let rawPath = String(row[2] || '').trim();
          // 구글 드라이브 주소만 미리보기 주소로 바꿈 (드롭박스 등 다른 주소는 그대로 둠)
          if (rawPath.indexOf('drive.google.com') !== -1 && rawPath.indexOf('/preview') === -1) {
            let fileId = '';
            if (rawPath.indexOf('id=') !== -1) fileId = rawPath.split('id=')[1].split('&')[0];
            else if (rawPath.indexOf('/d/') !== -1) fileId = rawPath.split('/d/')[1].split('/')[0].split('?')[0];
            if (fileId) rawPath = "https://drive.google.com/file/d/" + fileId + "/preview";
          }
          return {
            type: typeStr,
            title: row[0] || '안내',
            path: rawPath,
            duration: (row[3] ? Number(row[3]) * 1000 : 10000),
            qr: String(row[4] || '').trim(),
            priority: String(row[5] || 'N').toUpperCase().trim()
          };
        }).filter(item => item.path !== '');
      }
    }
  } catch(e) {}

  // 카페 메뉴 폴더 (날짜 기간 필터링 적용)
  try {
    const cafeFolder = DriveApp.getFolderById(CAFE_FOLDER_ID);
    const cafeFiles = cafeFolder.getFiles();
    while (cafeFiles.hasNext()) {
      let file = cafeFiles.next();
      let fileName = file.getName();
      if (file.getMimeType().startsWith('image/') && isMediaActive(fileName)) {
        cafeSlides.push({
          type: 'CAFE_MENU',
          title: '꽃다비카페 메뉴',
          // 썸네일 주소: 로그인 쿠키 없이도 열리는 형식 (각실 사이니지와 동일)
          path: "https://drive.google.com/thumbnail?id=" + file.getId() + "&sz=w1920",
          duration: 20000,
          qr: '',
          priority: 'N'
        });
      }
    }
  } catch(e) {}

  // 전체화면 폴더 (날짜 기간 필터링 적용)
  try {
    if (FULLSCREEN_FOLDER_ID) {
      const fsFolder = DriveApp.getFolderById(FULLSCREEN_FOLDER_ID);
      const fsFiles = fsFolder.getFiles();
      while (fsFiles.hasNext()) {
        let file = fsFiles.next();
        let fileName = file.getName();
        let mimeType = file.getMimeType();
        let fileId = file.getId();
        
        if (!isMediaActive(fileName)) continue;

        if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
          let isVid = mimeType.startsWith('video/');
          fullscreenSlides.push({
            type: 'FULLSCREEN',
            title: '특별 안내',
            path: isVid ? "https://drive.google.com/file/d/" + fileId + "/preview" : "https://lh3.googleusercontent.com/d/" + fileId,
            duration: isVid ? 12000 : 15000,
            qr: '',
            priority: 'N'
          });
        }
      }
    }
  } catch(e) {}

  let amplifiedFullscreen = fullscreenSlides.concat(fullscreenSlides);
  for (let i = amplifiedFullscreen.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    let temp = amplifiedFullscreen[i];
    amplifiedFullscreen[i] = amplifiedFullscreen[j];
    amplifiedFullscreen[j] = temp;
  }

  let allCombined = manualSlides.concat(eventSlides).concat(amplifiedFullscreen).concat([weatherSlide, logoSlide]);
  for (let i = allCombined.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    let temp = allCombined[i];
    allCombined[i] = allCombined[j];
    allCombined[j] = temp;
  }

  let finalSlides = [];
  if (cafeSlides.length > 0) {
    for (let i = 0; i < allCombined.length; i++) {
      finalSlides.push(allCombined[i]);
      let cafeItem = cafeSlides[i % cafeSlides.length];
      finalSlides.push(cafeItem);
    }
  } else {
    finalSlides = allCombined;
  }

  return finalSlides;
}

// 편집기에서 이 함수를 한 번 실행하면 '홈페이지RSS' 탭을 만듦 (복지관 공지 게시판 RSS를 구글 시트가 대신 가져옴)
function setupNoticeFeedSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('홈페이지RSS') || ss.insertSheet('홈페이지RSS');
  sheet.clear();
  sheet.getRange('A1').setFormula('=IMPORTFEED("http://gjcw.or.kr/wp-content/plugins/kboard/rss.php?board_id=3","items",TRUE,6)');
}

// '홈페이지RSS' 탭을 읽어 공지 목록으로 만듦
function readNoticeFeedSheet_(limit) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('홈페이지RSS');
  if (!sheet) throw new Error("'홈페이지RSS' 탭이 없습니다. setupNoticeFeedSheet 함수를 한 번 실행해 주세요.");
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const head = values[0].map(h => String(h).trim().toLowerCase());
  const find = keys => head.findIndex(h => keys.some(k => h === k || h.indexOf(k) !== -1));
  const cTitle = find(['title', '제목']);
  if (cTitle === -1) throw new Error("'홈페이지RSS' 탭 1행에 제목 머리글이 없습니다. setupNoticeFeedSheet 함수를 다시 실행해 주세요.");
  const cLink = find(['url', 'link']);
  const cDate = find(['date', '날짜']);
  const cSummary = find(['summary', 'description', '요약']);
  const tz = Session.getScriptTimeZone();
  return values.slice(1)
    .filter(r => { const t = String(r[cTitle] || '').trim(); return t !== '' && t.charAt(0) !== '#'; })
    .slice(0, limit)
    .map(r => {
      let date = '';
      if (cDate !== -1 && r[cDate]) {
        const d = r[cDate] instanceof Date ? r[cDate] : new Date(r[cDate]);
        if (!isNaN(d.getTime())) date = Utilities.formatDate(d, tz, 'yyyy.MM.dd');
      }
      // 요약(본문 앞부분)에서 태그와 특수 문자를 빼고 150자까지만 보여 줌
      let desc = '';
      if (cSummary !== -1) {
        const clean = decodeHtmlEntities(String(r[cSummary] || '').replace(/<[^>]*>?/gm, ' ')).replace(/\s+/g, ' ').trim();
        desc = clean.substring(0, 300) + (clean.length > 300 ? '...' : '');
      }
      return {
        title: String(r[cTitle]).trim(),
        link: cLink === -1 ? '' : String(r[cLink] || ''),
        date: date,
        desc: desc
      };
    });
}

function getLiveWeather() {
  const API_KEY = "73bc4f8bd0a6e6775574834415e6b29c"; 
  try {
    const resWeather = JSON.parse(UrlFetchApp.fetch(`https://api.openweathermap.org/data/2.5/weather?lat=34.8806&lon=128.6211&appid=${API_KEY}&units=metric&lang=kr`).getContentText());
    const resDust = JSON.parse(UrlFetchApp.fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=34.8806&lon=128.6211&appid=${API_KEY}`).getContentText());
    let pm10 = resDust.list[0].components.pm10;
    let dustStatus = pm10 <= 30 ? "좋음" : pm10 <= 80 ? "보통" : pm10 <= 150 ? "나쁨" : "매우나쁨";
    return { status: resWeather.weather[0].description, temp: Math.round(resWeather.main.temp) + "°C", feels_like: Math.round(resWeather.main.feels_like) + "°C", icon: resWeather.weather[0].icon, dust: dustStatus };
  } catch(e) {
    return { status: "맑음", temp: "--°C", feels_like: "--°C", icon: "01d", dust: "보통" };
  }
}

const WELCOME_FOLDER_ID = "1KZnTNtPRP9zzKTnqoxYX7yKTo-7OTgqk";

function checkWelcomeMode() {
  let isWelcome = false, welcomeSlides = [];
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('기관방문');
    if (!sheet) return { isWelcome: false, slides: [] };
    const displayData = sheet.getDataRange().getDisplayValues();
    displayData.shift(); 
    const now = new Date();
    const todayStr = Utilities.formatDate(now, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const currentMin = now.getHours() * 60 + now.getMinutes();

    for (let i = 0; i < displayData.length; i++) {
      let row = displayData[i];
      if (String(row[3] || 'Y').toUpperCase().trim() !== 'Y') continue;
      let formattedDate = String(row[0] || '').trim().replace(/[\.\/]/g, '-').replace(/\s+/g, '');
      if (formattedDate.endsWith('-')) formattedDate = formattedDate.slice(0, -1);
      let dateParts = formattedDate.split('-');
      if (dateParts.length === 3) {
        formattedDate = dateParts[0] + '-' + dateParts[1].padStart(2, '0') + '-' + dateParts[2].padStart(2, '0');
      }

      if (formattedDate === todayStr && row[1] && row[2]) {
        let startParts = String(row[1]).split(':'), endParts = String(row[2]).split(':');
        if (startParts.length >= 2 && endParts.length >= 2) {
          let startMin = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
          let endMin = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);
          if (currentMin >= startMin && currentMin <= endMin) { isWelcome = true; break; }
        }
      }
    }

    if (isWelcome && WELCOME_FOLDER_ID) {
      const folder = DriveApp.getFolderById(WELCOME_FOLDER_ID);
      const files = folder.getFiles();
      while (files.hasNext()) {
        let file = files.next();
        let fileName = file.getName();
        // 날짜 기간 필터링 적용
        if (file.getMimeType().startsWith('image/') && isMediaActive(fileName)) {
          welcomeSlides.push({ type: 'WELCOME', title: '방문 환영', path: "https://lh3.googleusercontent.com/d/" + file.getId(), duration: 10000 });
        }
      }
    }
  } catch(e) {}
  return { isWelcome: isWelcome, slides: welcomeSlides };
}

// 배경음악: BGM 폴더의 첫 번째 mp3를 페이지에 넘김.
// 운영설정 B9가 ON 일 때만 재생 (OFF거나 비어 있으면 재생하지 않음)
const BGM_FOLDER_ID = '1fmFp82rpfVCRrOA3cSaqo4xDjOJ3x5ax';

function getBgmDataUrl() {
  try {
    const setting = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('운영설정');
    if (!setting || String(setting.getRange('B9').getValue()).trim().toUpperCase() !== 'ON') return '';
    const it = DriveApp.getFolderById(BGM_FOLDER_ID).getFiles();
    while (it.hasNext()) {
      const f = it.next();
      if (/\.mp3$/i.test(f.getName()) || f.getMimeType() === 'audio/mpeg') {
        const bytes = f.getBlob().getBytes();
        if (bytes.length > 8 * 1024 * 1024) return '';   // 8MB를 넘으면 너무 큼
        return 'data:audio/mpeg;base64,' + Utilities.base64Encode(bytes);
      }
    }
  } catch (e) {
    console.error('BGM 읽기 실패: ' + e.toString());
  }
  return '';
}
