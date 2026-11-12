// 설정 창에서만 쓰는 연결 다리 (설정 화면이 필요한 기능만 안전하게 노출)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('config:load'),
  save: (data) => ipcRenderer.invoke('config:save', data)
});
