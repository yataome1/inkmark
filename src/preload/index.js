const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke =
  (ch) =>
  (...args) =>
    ipcRenderer.invoke(ch, ...args);
const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, ...args) => cb(...args));

contextBridge.exposeInMainWorld('inkmark', {
  appReady: invoke('app-ready'),
  openDialog: invoke('open-dialog'),
  openFolderDialog: invoke('open-folder-dialog'),
  readFile: invoke('read-file'),
  saveFile: invoke('save-file'),
  saveAs: invoke('save-as'),
  listDir: invoke('list-dir'),
  saveImage: invoke('save-image'),
  confirmDiscard: invoke('confirm-discard'),
  setTitle: invoke('set-title'),
  setDirty: invoke('set-dirty'),
  getSettings: invoke('get-settings'),
  setSettings: invoke('set-settings'),
  find: invoke('find'),
  stopFind: invoke('stop-find'),
  exportHtml: invoke('export-html'),
  exportPdf: invoke('export-pdf'),
  openExternal: invoke('open-external'),
  toggleFullscreen: invoke('toggle-fullscreen'),
  closeConfirmed: invoke('close-confirmed'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  onCommand: on('command'),
  onOpenFile: on('open-file'),
  onRequestClose: on('request-close'),
  onFindResult: on('find-result'),
});
