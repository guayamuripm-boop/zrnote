// ZRNote Extension - Background Service Worker (Module)

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ZRNote] Extension installed');
});

// Context menu
chrome.contextMenus.create({
  id: 'zrnote-record',
  title: 'Grabar con ZRNote',
  contexts: ['page'],
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'zrnote-record' && tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.dispatchEvent(new CustomEvent('zrnote-start-recording')),
    });
  }
});

// Mensajes desde content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'NOTIFY') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'ZRNote',
      message: msg.text,
    });
  }
});

// Auto-inyectar en Google Meet
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('meet.google.com')) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    }).catch(() => {});
  }
});

// Alarms para health check
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'health-check') {
    console.log('[ZRNote] Health check');
  }
});

chrome.alarms.create('health-check', { periodInMinutes: 30 });