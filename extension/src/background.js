// ZRNote Extension - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ZRNote] Extension installed');
});

// Context menu para grabar desde cualquier pestaña
chrome.contextMenus.create({
  id: 'zrnote-record',
  title: 'Grabar con ZRNote',
  contexts: ['page'],
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'zrnote-record' && tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const event = new CustomEvent('zrnote-start-recording');
        window.dispatchEvent(event);
      },
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

// Detectar cuando se abre Google Meet
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('meet.google.com')) {
    // Inyectar content script automáticamente
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js', 'content.css'],
    }).catch(() => {});
  }
});