const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('posHardware', {
  isDesktopPOS: true,
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printThermalReceipt: (htmlContent, printerName) => ipcRenderer.invoke('print-thermal-receipt', { htmlContent, printerName }),
  openCashDrawer: () => ipcRenderer.invoke('open-cash-drawer'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  toggleFullscreen: () => ipcRenderer.invoke('window-toggle-fullscreen'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  close: () => ipcRenderer.invoke('window-close')
});