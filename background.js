// --- Configuration ---
const NOTEBOOKLM_URL = 'https://notebooklm.google.com/';

// --- Event Listeners ---

// 1. メッセージ受信 (ポップアップからの実行)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startAutomation') {
    handleAutomation(request.url);
    sendResponse({ status: 'started' }); // 非同期応答のため
  }
  return true;
});

// 2. ショートカットキー実行 (commands API)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'start-automation') {
    try {
      // クリップボード読み取りのため、現在のアクティブタブでスクリプトを実行
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          try {
            return await navigator.clipboard.readText();
          } catch (e) {
            console.error('Failed to read clipboard:', e);
            return null;
          }
        }
      });
      
      const clipboardText = results[0]?.result;

      if (!clipboardText) {
        console.error('Clipboard is empty or access denied');
        return;
      }

      let urlString = clipboardText.trim();
      let url;
      try {
        url = new URL(urlString);
        if (!['http:', 'https:'].includes(url.protocol)) {
          console.error('Invalid protocol:', url.protocol);
          return;
        }
      } catch (e) {
        console.error('Invalid URL format:', urlString);
        return;
      }

      handleAutomation(url.href);

    } catch (err) {
      console.error('Shortcut execution failed:', err);
    }
  }
});

// --- Core Logic ---

async function handleAutomation(url) {
  try {
    // NotebookLMを新規タブで開く
    const tab = await chrome.tabs.create({ url: NOTEBOOKLM_URL });

    // タブの読み込み完了を待機
    const listener = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        
        // コンテンツスクリプトに開始メッセージを送信
        // ページ遷移直後のスクリプト読み込み待ち時間を確保
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'runAutomation',
            url: url
          }).catch(err => {
            console.error('Message sending failed:', err);
            // リトライまたはエラー通知などの処理
          });
        }, 3000); // 3秒待機（少し余裕を持たせる）
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

  } catch (err) {
    console.error('Automation error:', err);
  }
}