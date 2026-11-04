// 거제시종합사회복지관 통합 대시보드 - 윈도우 프로그램 (Electron)
// - 설정에서 대시보드 주소를 넣으면 왼쪽에 대시보드를 띄움
// - 발권시스템은 오른쪽 패널에 나란히 열림 (메뉴 또는 대시보드의 발권시스템 버튼)
// - 구글 로그인은 이 프로그램 안에 저장되므로 한 번 로그인하면 계속 유지됨
// - 창을 닫으면 트레이로 숨고, 트레이 메뉴의 종료를 눌러야 꺼짐
// - 설치된 프로그램은 새 버전이 있으면 자동으로 받아서 다음 실행 때 설치

const { app, BrowserWindow, WebContentsView, Menu, ipcMain, shell, Tray, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// 구글이 "이 브라우저는 보안상 안전하지 않다"며 로그인을 막지 않도록 일반 크롬처럼 보이게 함
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// 발권시스템 주소 (오른쪽 패널에서 열림)
const TICKET_URL = 'https://selfdesk.e-ncom.co.kr/';
const TICKET_HOST = 'selfdesk.e-ncom.co.kr';

// 프로그램 안에서 열어도 되는 주소 (구글 로그인과 대시보드에 필요한 주소)
const IN_APP_HOSTS = [
  'accounts.google.com', 'myaccount.google.com', 'script.google.com', 'script.googleusercontent.com',
  'drive.google.com', 'docs.google.com', 'sheets.google.com', 'www.google.com', 'googleusercontent.com'
];

const DEFAULT_CONFIG = { url: '', autoStart: true };
let mainWin = null;         // 창 (안에 대시보드와 발권 화면을 나란히 넣음)
let dashView = null;        // 왼쪽: 대시보드
let ticketView = null;      // 오른쪽: 발권시스템 (열렸을 때만 있음)
let settingsWin = null;
let retryTimer = null;
let tray = null;
let autoUpdater = null;
let manualUpdateCheck = false;

// ---------- 설정 저장 ----------
function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch (e) {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

function isHttpUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch (e) {
    return false;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
}

function isInApp(url, cfg) {
  const host = hostOf(url);
  if (!host) return false;
  const dash = hostOf(cfg.url);
  const hosts = dash ? IN_APP_HOSTS.concat([dash]) : IN_APP_HOSTS;
  return hosts.some(h => host === h || host.endsWith('.' + h));
}

function applyAutoStart(on) {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!on });
}

// ---------- 화면 배치 ----------
// 대시보드의 왼쪽 메뉴(232px)와 상단 헤더(60px)는 그대로 두고,
// 오른쪽 내용 영역 전체를 발권 화면이 덮음. 발권을 닫으면 다시 대시보드 내용이 보임.
const SIDEBAR_W = 232;
const HEADER_H = 60;

function layout() {
  if (!mainWin || !dashView) return;
  const [w, h] = mainWin.getContentSize();
  dashView.setBounds({ x: 0, y: 0, width: w, height: h });
  if (ticketView) {
    ticketView.setBounds({ x: SIDEBAR_W, y: HEADER_H, width: Math.max(0, w - SIDEBAR_W), height: Math.max(0, h - HEADER_H) });
  }
}

// ---------- 발권시스템 패널 ----------
function openTicket(url) {
  if (!mainWin) return;
  if (!ticketView) {
    ticketView = new WebContentsView({
      webPreferences: { partition: 'persist:ticket', contextIsolation: true, nodeIntegration: false }
    });
    ticketView.webContents.setUserAgent(CHROME_UA);
    // 발권 화면 안에서 새 창을 열려고 하면 같은 패널에서 열기
    ticketView.webContents.setWindowOpenHandler(({ url: u }) => {
      if (isHttpUrl(u)) ticketView.webContents.loadURL(u);
      return { action: 'deny' };
    });
    mainWin.contentView.addChildView(ticketView);
  }
  const target = (url && isHttpUrl(url)) ? url : TICKET_URL;
  if (!ticketView.webContents.getURL()) ticketView.webContents.loadURL(target);
  else if (url && isHttpUrl(url)) ticketView.webContents.loadURL(target);
  layout();
}

function closeTicket() {
  if (!ticketView || !mainWin) return;
  mainWin.contentView.removeChildView(ticketView);
  ticketView.webContents.close();
  ticketView = null;
  layout();
}

function toggleTicket() {
  if (ticketView) closeTicket();
  else openTicket(TICKET_URL);
}

// ---------- 메뉴 클릭 감지 ----------
// 대시보드의 왼쪽 메뉴(data-module)를 누르면 신호를 보냄 (발권시스템 메뉴는 제외)
function installMenuHook(wc) {
  const code = `
    if (!window.__gjcwMenuHook) {
      window.__gjcwMenuHook = true;
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('[data-module]') : null;
        if (a && !/발권시스템/.test(a.textContent)) console.log('__GJCW_MENU_CLICK__');
      }, true);
    }
  `;
  try {
    wc.mainFrame.framesInSubtree.forEach(frame => {
      frame.executeJavaScript(code).catch(() => {});
    });
  } catch (e) {
    // 무시 (페이지가 아직 준비되지 않은 경우)
  }
}

// ---------- 메인 창 (대시보드) ----------
function createMainWindow() {
  const cfg = loadConfig();
  if (!isHttpUrl(cfg.url)) {
    openSettings();
    return;
  }

  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    title: '복지관 통합 대시보드',
    autoHideMenuBar: true,
    backgroundColor: '#f2f4f6'
  });

  dashView = new WebContentsView({
    webPreferences: {
      // 이 이름의 저장 공간에 로그인 정보가 남음 (다른 프로그램이나 크롬과 공유하지 않음)
      partition: 'persist:dashboard',
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWin.contentView.addChildView(dashView);
  const wc = dashView.webContents;
  wc.setUserAgent(CHROME_UA);

  // 발권시스템 버튼 또는 링크: 오른쪽 패널에서 열기
  // 그 밖의 새 창: 구글 주소는 프로그램 안에서, 나머지는 기본 브라우저로
  wc.setWindowOpenHandler(({ url }) => {
    if (hostOf(url) === TICKET_HOST) {
      openTicket(url);
      return { action: 'deny' };
    }
    if (isInApp(url, loadConfig())) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // 화면 안에서 다른 사이트로 이동하려 하면 기본 브라우저로 보냄
  wc.on('will-navigate', (event, url) => {
    if (hostOf(url) === TICKET_HOST) {
      event.preventDefault();
      openTicket(url);
      return;
    }
    if (!isInApp(url, loadConfig())) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // 연결 실패: 안내 화면을 보여 주고 10초마다 다시 시도
  wc.on('did-fail-load', (event, code, desc, validatedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;   // -3은 사용자가 멈춘 경우
    wc.loadFile(path.join(__dirname, 'offline.html'));
    scheduleRetry();
  });

  wc.on('did-finish-load', () => {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    installMenuHook(wc);
  });

  // 구글 웹앱은 안쪽 화면(iframe)에 그려지므로, 안쪽 화면이 로드될 때마다 감지 코드를 넣음
  wc.on('did-frame-finish-load', () => {
    installMenuHook(wc);
  });

  // 왼쪽 메뉴 영역(사이드바)을 클릭하면 발권 화면을 닫음 (메뉴 항목을 찾지 않고 위치로 판단)
  wc.on('input-event', (event, input) => {
    if (input.type === 'mouseDown' && ticketView && input.x < SIDEBAR_W && input.y > HEADER_H) {
      closeTicket();
    }
  });

  // 메뉴 클릭 신호 받기 (안쪽 화면의 콘솔 메시지)
  wc.on('console-message', (event, level, message) => {
    const msg = message || (event && event.message);
    if (msg === '__GJCW_MENU_CLICK__') closeTicket();
  });

  mainWin.on('resize', layout);
  layout();
  wc.loadURL(cfg.url);

  // X 버튼을 누르면 끄지 않고 트레이로 숨김 (트레이 메뉴 '종료'를 눌러야 완전히 꺼짐)
  mainWin.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWin.hide();
    }
  });

  mainWin.on('closed', () => {
    mainWin = null;
    dashView = null;
    ticketView = null;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  });
}

function reloadDashboard() {
  if (dashView) dashView.webContents.reload();
}

function scheduleRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    const cfg = loadConfig();
    if (dashView && isHttpUrl(cfg.url)) dashView.webContents.loadURL(cfg.url);
  }, 10000);
}

// ---------- 설정 창 ----------
function openSettings() {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }
  settingsWin = new BrowserWindow({
    width: 560,
    height: 420,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: '설정',
    parent: mainWin || undefined,
    modal: !!mainWin,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  settingsWin.on('closed', () => { settingsWin = null; });
}

ipcMain.handle('config:load', () => loadConfig());

ipcMain.handle('config:save', (event, data) => {
  const url = String((data && data.url) || '').trim();
  if (!isHttpUrl(url)) {
    return { ok: false, message: '주소는 https://로 시작하는 올바른 주소여야 합니다.' };
  }
  const cfg = { url: url, autoStart: !!(data && data.autoStart) };
  saveConfig(cfg);
  applyAutoStart(cfg.autoStart);

  if (dashView) {
    dashView.webContents.loadURL(cfg.url);
  } else {
    createMainWindow();
  }
  if (settingsWin) settingsWin.close();
  return { ok: true };
});

// ---------- 트레이 아이콘 ----------
function showMainWindow() {
  if (!mainWin) {
    createMainWindow();
    return;
  }
  mainWin.show();
  mainWin.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('복지관 통합 대시보드');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '열기', click: showMainWindow },
    { label: '새로고침', click: reloadDashboard },
    { label: '발권시스템 열기/닫기', click: () => { showMainWindow(); toggleTicket(); } },
    { label: '설정', click: () => openSettings() },
    { label: '업데이트 확인', click: () => checkForUpdates(true) },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('click', showMainWindow);
}

// ---------- 자동 업데이트 ----------
// 프로그램을 실행하면 새 버전이 있는지 확인하고, 있으면 받아 두었다가 다음 실행 때 설치
function setupAutoUpdate() {
  if (!app.isPackaged) return;   // 개발 중(npm start)에는 업데이트 확인을 하지 않음
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (tray) tray.displayBalloon({ title: '업데이트 있음', content: '새 버전 ' + info.version + '을 받고 있습니다.' });
  });
  autoUpdater.on('update-downloaded', (info) => {
    if (tray) tray.displayBalloon({ title: '업데이트 준비 완료', content: '다음에 프로그램을 켤 때 새 버전으로 바뀝니다.' });
  });
  autoUpdater.on('update-not-available', () => {
    if (manualUpdateCheck) {
      dialog.showMessageBox({ type: 'info', message: '이미 최신 버전입니다.' });
    }
    manualUpdateCheck = false;
  });
  autoUpdater.on('error', (err) => {
    console.error('업데이트 오류: ' + err);
    if (manualUpdateCheck) {
      dialog.showErrorBox('업데이트 확인 실패', String(err && err.message ? err.message : err));
    }
    manualUpdateCheck = false;
  });

  checkForUpdates(false);
  setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);   // 6시간마다 확인
}

function checkForUpdates(manual) {
  if (!autoUpdater) {
    if (manual) dialog.showMessageBox({ type: 'info', message: '업데이트 확인은 설치된 프로그램에서만 할 수 있습니다.' });
    return;
  }
  manualUpdateCheck = !!manual;
  autoUpdater.checkForUpdates().catch(() => {});
}

// ---------- 메뉴 ----------
function buildMenu() {
  const template = [
    {
      label: '파일',
      submenu: [
        { label: '설정', accelerator: 'Ctrl+,', click: () => openSettings() },
        { label: '새로고침', accelerator: 'F5', click: reloadDashboard },
        { type: 'separator' },
        { label: '종료', role: 'quit' }
      ]
    },
    {
      label: '보기',
      submenu: [
        { label: '발권시스템 열기/닫기', accelerator: 'Ctrl+T', click: toggleTicket },
        { type: 'separator' },
        { label: '개발자 도구 (문제 확인용)', accelerator: 'Ctrl+Shift+I', click: () => { if (dashView) dashView.webContents.toggleDevTools(); } },
        { label: '전체 화면', accelerator: 'F11', click: () => { if (mainWin) mainWin.setFullScreen(!mainWin.isFullScreen()); } },
        { label: '글자 크게', role: 'zoomIn' },
        { label: '글자 작게', role: 'zoomOut' },
        { label: '글자 크기 원래대로', role: 'resetZoom' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- 시작 ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.focus();
    }
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.whenReady().then(() => {
    buildMenu();
    applyAutoStart(loadConfig().autoStart);
    createTray();
    setupAutoUpdate();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });

  // 창을 닫아도 트레이에 남아 있으므로 여기서 끄지 않음 (종료는 트레이 메뉴에서)
}
