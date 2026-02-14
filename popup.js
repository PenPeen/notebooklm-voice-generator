document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const statusDiv = document.getElementById('status');

  startBtn.addEventListener('click', async () => {
    try {
      startBtn.disabled = true;
      statusDiv.textContent = 'クリップボードを読み取っています...';
      statusDiv.className = '';

      // クリップボードからテキスト取得
      const text = await navigator.clipboard.readText();
      
      if (!text) {
        throw new Error('クリップボードが空です');
      }

      // URLの簡易バリデーション
      let url;
      try {
        url = new URL(text);
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('http/https以外のURLです');
        }
      } catch (e) {
        if (e.message === 'http/https以外のURLです') throw e;
        throw new Error('有効なURLではありません: ' + text.substring(0, 50) + '...');
      }

      statusDiv.textContent = '処理を開始します...
URL: ' + url.href;

      // バックグラウンドにメッセージ送信
      chrome.runtime.sendMessage({
        action: 'startAutomation',
        url: url.href
      }, (response) => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'エラー: ' + chrome.runtime.lastError.message;
          statusDiv.className = 'error';
          startBtn.disabled = false;
        } else {
          statusDiv.textContent = 'NotebookLMを開いています...';
        }
      });

    } catch (err) {
      statusDiv.textContent = 'エラー: ' + err.message;
      statusDiv.className = 'error';
      startBtn.disabled = false;
    }
  });

  // バックグラウンドからのステータス更新を受信
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'statusUpdate') {
      statusDiv.textContent = message.status;
      if (message.type === 'error') {
        statusDiv.className = 'error';
        startBtn.disabled = false;
      } else if (message.type === 'success') {
        statusDiv.className = 'success';
        startBtn.disabled = false;
      }
    }
  });
});