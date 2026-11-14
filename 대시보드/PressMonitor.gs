/**
 * 언론보도 모니터링 (홍보관리 > 언론보도 모니터링)
 *
 * 매일 아침 자동으로 기록되는 구글 문서「거제시복지관_뉴스모니터링」을 읽어서
 * 기사 목록(제목, 언론사, 발행일시, 링크, 3줄 요약, 중복 보도)으로 바꿔 보여줍니다.
 *
 * - 문서는 '링크가 있는 모든 사용자: 뷰어'로 공유되어 있어야 대시보드 실행 계정이 읽을 수 있습니다.
 * - 문서를 마크다운으로 내보내서 읽습니다. 날짜 제목 아래 표 형식, 목록 형식,
 *   [기사 1]·[기사 2]처럼 하루에 여러 건인 형식을 모두 읽습니다.
 * - 읽은 결과는 30분 동안 캐시합니다. 화면의 '새로고침'을 누르면 바로 다시 읽습니다.
 */

const PRESS_MONITOR = {
  DOC_ID: '1dV2svS4bPBuq4Uf3YCrHhwCV0E6Bd7Jlv2mX-lZdZ_w',
  CACHE_KEY: 'press_monitor_v1',
  CACHE_SEC: 1800
};

function getPressMonitor(force) {
  requireUser_();
  const cache = CacheService.getScriptCache();
  if (!force) {
    const hit = cache.get(PRESS_MONITOR.CACHE_KEY);
    if (hit) return JSON.parse(hit);
  }
  const parsed = parsePressMarkdown_(fetchPressMarkdown_());
  const result = {
    docUrl: 'https://docs.google.com/document/d/' + PRESS_MONITOR.DOC_ID + '/edit',
    fetchedAt: fmt_(new Date(), 'yyyy-MM-dd HH:mm'),
    articles: parsed.articles,
    days: parsed.days
  };
  const json = JSON.stringify(result);
  // 캐시 한 칸은 100KB까지라 문서가 아주 커지면 캐시 없이 매번 읽음
  if (json.length < 95000) {
    try { cache.put(PRESS_MONITOR.CACHE_KEY, json, PRESS_MONITOR.CACHE_SEC); } catch (e) { /* 캐시 실패는 무시 */ }
  }
  return result;
}

// 구글 문서를 마크다운 글자로 받아옴 (Drive API 내보내기 → 실패하면 문서 내보내기 주소)
function fetchPressMarkdown_() {
  const id = PRESS_MONITOR.DOC_ID;
  const urls = [
    'https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text%2Fmarkdown',
    'https://docs.google.com/document/d/' + id + '/export?format=md'
  ];
  const options = { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true, followRedirects: true };
  let lastCode = 0;
  for (let i = 0; i < urls.length; i++) {
    const res = UrlFetchApp.fetch(urls[i], options);
    lastCode = res.getResponseCode();
    const text = res.getContentText('UTF-8');
    // 권한이 없으면 200으로 로그인 HTML이 오는 경우가 있어 날짜 제목이 있는지도 확인
    if (lastCode === 200 && /모니터링 결과/.test(text)) return text;
  }
  throw new Error('뉴스 모니터링 문서를 읽지 못했습니다. (HTTP ' + lastCode + ') 문서가 "링크가 있는 모든 사용자: 뷰어"로 공유되어 있는지 확인해 주세요.');
}

// ---------------------------------------------------------------
// 마크다운 → { articles: [...], days: [...] }
//   articles: 최신순 기사 목록
//   days: 날짜별 모니터링 결과 요약 (기사 수, 보도 없음 여부) 최신순
// ---------------------------------------------------------------
const PRESS_FIELD_KEYS = {
  '기사 제목': 'title', '언론사': 'source', '발행일시': 'published', '링크': 'link',
  '모니터링 일시': 'checkedAt', '검색 키워드': 'keywords', '모니터링 결과': 'result',
  '핵심 내용 3줄 요약': 'summary', '핵심 내용 요약': 'summary', '참고 사항': 'notes'
};

function parsePressMarkdown_(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const dayRe = /^#\s+.*?(\d{4}-\d{2}-\d{2})\s*모니터링\s*결과/;
  const days = [];
  let day = null;
  lines.forEach(raw => {
    const line = pressUnescape_(raw.replace(/\*\*/g, ''));
    const m = line.match(dayRe);
    if (m) {
      day = { date: m[1], blocks: [[]] };
      days.push(day);
      return;
    }
    if (!day) return;
    // 하루에 기사가 여러 건이면 '## [기사 1]' 제목으로 나뉨
    if (/^##\s*\[?\s*기사\s*\d+\s*\]?\s*$/.test(line)) {
      if (day.blocks[day.blocks.length - 1].length) day.blocks.push([]);
      return;
    }
    day.blocks[day.blocks.length - 1].push(raw);
  });

  const articles = [];
  const seen = {};
  const dayList = days.map(d => {
    const parsed = d.blocks.map(b => pressParseBlock_(b));
    const found = parsed.filter(p => p.title);
    found.forEach(p => {
      const key = p.link || (p.title + '|' + p.source);
      if (seen[key]) return;
      seen[key] = true;
      articles.push({
        date: d.date,
        title: p.title,
        source: p.source,
        published: p.published,
        publishedKey: pressDateKey_(p.published) || d.date,
        link: p.link,
        summary: p.summary,
        dupes: p.dupes,
        notes: p.notes
      });
    });
    const result = parsed.map(p => p.result).filter(Boolean)[0] || '';
    return { date: d.date, count: found.length, result: result };
  });

  articles.sort((a, b) => (b.publishedKey + b.date).localeCompare(a.publishedKey + a.date));
  dayList.sort((a, b) => b.date.localeCompare(a.date));
  return { articles: articles, days: dayList };
}

// 날짜 하나(또는 [기사 N] 하나)의 줄들을 읽음
function pressParseBlock_(lines) {
  const out = { title: '', source: '', published: '', link: '', result: '', summary: [], notes: [], dupes: [] };
  let mode = '';
  const setField = (key, rawValue) => {
    const value = pressPlain_(rawValue);
    if (key === 'summary' || key === 'notes') {
      mode = key;
      if (value && value !== '-') pressAddListItem_(out, key, rawValue);
      return;
    }
    mode = '';
    if (key === 'link') out.link = pressFirstUrl_(rawValue);
    else if (key in out) out[key] = value;
  };

  lines.forEach(raw => {
    const line = raw.replace(/\*\*/g, '');
    const trimmed = line.trim();
    if (!trimmed) return;

    // 제목 줄: '## 핵심 내용 3줄 요약', '## 참고 사항'
    const h = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (h) {
      const key = PRESS_FIELD_KEYS[pressPlain_(h[1]).replace(/[:：]\s*$/, '')];
      mode = (key === 'summary' || key === 'notes') ? key : '';
      return;
    }

    // 표 형식: | 기사 제목 | 내용 |
    const t = trimmed.match(/^\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/);
    if (t) {
      const key = PRESS_FIELD_KEYS[pressPlain_(t[1])];
      if (key) setField(key, t[2]);
      return;
    }

    // 목록 형식: * 기사 제목: 내용  (들여쓴 줄은 요약/참고 사항의 하위 항목)
    const li = line.match(/^(\s*)[*+-]\s+(.*)$/);
    if (li) {
      const indent = li[1].length;
      const body = li[2];
      const f = body.match(/^([^:：]{2,12}?)\s*[:：]\s*(.*)$/);
      const key = f ? PRESS_FIELD_KEYS[pressPlain_(f[1])] : '';
      if (key && indent === 0) { setField(key, f[2]); return; }
      if (mode) pressAddListItem_(out, mode, body);
      return;
    }

    // 목록 기호 없이 이어지는 줄
    if (mode) pressAddListItem_(out, mode, trimmed);
  });
  return out;
}

function pressAddListItem_(out, mode, rawText) {
  if (mode === 'summary') {
    const text = pressPlain_(rawText).replace(/^\d+\s*[.)]\s*/, '');
    if (text) out.summary.push(text);
    return;
  }
  // 참고 사항: 링크는 중복 보도 목록으로 따로 모음
  const re = /\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(rawText)) !== null) {
    const url = pressSafeUrl_(m[2]);
    if (url) out.dupes.push({ name: pressUnescape_(m[1]).replace(/^https?:\/\//, ''), url: url });
  }
  const text = pressPlain_(rawText).replace(/^[-–]\s*/, '');
  if (text) out.notes.push(text);
}

// 마크다운 기호를 걷어낸 보통 글자 ([이름](주소) → 이름)
function pressPlain_(s) {
  return pressUnescape_(String(s || '')
    .replace(/\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/g, '$1')
    .replace(/\*\*/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

// 구글 문서 마크다운의 \[ \- \! https\:// 같은 역슬래시 제거
function pressUnescape_(s) {
  return String(s || '').replace(/\\([\\`*_{}\[\]()#+\-.!:|<>~=&"'])/g, '$1');
}

function pressFirstUrl_(raw) {
  const s = String(raw || '');
  const link = s.match(/\]\(([^)\s]+)\)/);
  if (link) return pressSafeUrl_(link[1]);
  const bare = pressUnescape_(s).match(/https?:\/\/[^\s)\]]+/);
  return bare ? pressSafeUrl_(bare[0]) : '';
}

// http/https 주소만 링크로 씀
function pressSafeUrl_(u) {
  const url = pressUnescape_(String(u || '').trim());
  return /^https?:\/\//i.test(url) ? url : '';
}

// '2026.09.09 10:48' → '2026-09-09 10:48' (정렬용)
function pressDateKey_(s) {
  const m = String(s || '').match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})(?:\.?\s+(\d{1,2}):(\d{2}))?/);
  if (!m) return '';
  const pad = n => String(n).padStart(2, '0');
  return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]) + (m[4] ? ' ' + pad(m[4]) + ':' + m[5] : '');
}
