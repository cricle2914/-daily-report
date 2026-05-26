/* ======= 工单系统 Webview Preload ======= */
/* 将侧边栏/顶栏的拖拽事件转发到主窗口 */

const { ipcRenderer } = require('electron')

let wasInDragRegion = false

// 暴露 Electron 设置读写接口，与 DayPlan 共用 settings.json
try {
  window.electronAPI = {
    loadSettings: () => ipcRenderer.invoke('load-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    // 通过宿主窗口保存设置（更可靠，不走 webview IPC 直连）
    saveSettingsViaHost: (settings) => {
      ipcRenderer.sendToHost('save-settings', settings);
    }
  };
} catch(e) {
  console.error('[preload] electronAPI init failed:', e);
}

function isInDragRegion(el) {
  var current = el
  while (current) {
    if (current.classList && (current.classList.contains('sidebar') || current.classList.contains('topbar'))) {
      // 排除交互元素：按钮、链接、输入框等区域不触发拖拽
      if (el.closest && (el.closest('button') || el.closest('input') || el.closest('select') || el.closest('textarea') || el.closest('a'))) {
        return false
      }
      return true
    }
    current = current.parentElement
  }
  return false
}

document.addEventListener('mousemove', function(e) {
  var inRegion = isInDragRegion(e.target)
  if (inRegion !== wasInDragRegion) {
    wasInDragRegion = inRegion
    ipcRenderer.sendToHost('drag-region', inRegion ? 'drag' : 'no-drag')
  }
})
