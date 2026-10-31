const { contextBridge, ipcRenderer } = require('electron');

// Cửa sổ robot ngoài desktop: chỉ nhận trạng thái và gửi lại thao tác, không có quyền gì khác
contextBridge.exposeInMainWorld('pet', {
  onState: (cb) => ipcRenderer.on('pet:state', (_e, st) => cb(st)),
  onVis: (cb) => ipcRenderer.on('pet:vis', (_e, v) => cb(!!v)),
  onWins: (cb) => ipcRenderer.on('pet:wins', (_e, d) => cb(d)), // vị trí các cửa sổ đang mở (chế độ nuôi robot)
  hit: (on) => ipcRenderer.send('pet:hit', !!on),
  action: (a) => ipcRenderer.send('pet:action', a),
  drag: (on) => ipcRenderer.send('pet:drag', !!on),
});
