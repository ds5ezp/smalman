// 발권 막대(닫기 버튼)에서만 쓰는 연결 다리
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('barApi', {
  close: () => ipcRenderer.send('ticket:close')
});
