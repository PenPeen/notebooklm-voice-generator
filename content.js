const DEBUG = true;
const LOG_PREFIX = '[NotebookLM Auto]';

function log(...args) {
  if (DEBUG) console.log(LOG_PREFIX, ...args);
}

// --- Utility Functions ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 要素が表示されているか判定
function isVisible(elem) {
  if (!elem) return false;
  // style.display='none', visibility='hidden' も考慮すべきだが、
  // offsetWidth > 0 で概ね判定可能
  return !!(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
}

async function waitForElement(selector, timeout = 10000, parent = document) {
  log(`Waiting for visible selector: ${selector}`);
  return new Promise((resolve, reject) => {
    // まず即時チェック
    const elements = parent.querySelectorAll(selector);
    for (const el of elements) {
      if (isVisible(el)) {
        resolve(el);
        return;
      }
    }

    const observer = new MutationObserver((mutations) => {
      const elements = parent.querySelectorAll(selector);
      for (const el of elements) {
        if (isVisible(el)) {
          observer.disconnect();
          resolve(el);
          return;
        }
      }
    });

    observer.observe(parent.body || parent, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Visible element not found: ${selector}`));
    }, timeout);
  });
}

// テキスト内容またはaria-labelで「可視」要素を探す
async function waitForElementByText(tagName, text, timeout = 10000) {
  log(`Waiting for visible text/label "${text}" in <${tagName}>`);
  return new Promise((resolve, reject) => {
    const find = () => {
      const elements = document.querySelectorAll(tagName);
      for (const el of elements) {
        if (!isVisible(el)) continue; // 可視チェック

        if ((el.textContent && el.textContent.includes(text)) || 
            (el.ariaLabel && el.ariaLabel.includes(text)) ||
            (el.getAttribute('aria-label') && el.getAttribute('aria-label').includes(text))) {
          return el;
        }
      }
      return null;
    };

    const el = find();
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const el = find();
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Visible element with text "${text}" not found`));
    }, timeout);
  });
}

async function clickElement(element) {
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(500);
  element.click();
  log('Clicked:', element);
}

async function inputText(element, text) {
  if (!element) return;
  element.focus();
  element.value = text;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  log('Input text:', text);
  await sleep(500);
}

// --- Automation Logic ---

async function automateNotebookLM(url) {
  log('Starting automation with URL:', url);
  
  try {
    // Step 1: 新規作成 (Create New Notebook)
    // 既にモーダルが開いている(URLパラメータ等)場合も考慮し、
    // まず入力欄があるか確認し、なければ新規作成を押すフローにするのが堅牢。
    
    let urlInput = null;
    
    // Step 2 先行チェック: すでにモーダル(入力欄)が開いているか？
    try {
        log('Checking if source input is already visible...');
        urlInput = await waitForElement('textarea[formcontrolname="discoverSourcesQuery"]', 3000);
        log('Source input found immediately. Skipping Create Button.');
    } catch (e) {
        // 入力欄が見つからないなら、新規作成ボタンを押す
        log('Source input not found. Step 1: Finding Create Button...');
        const createBtn = await waitForElement('button.create-new-button[aria-label="ノートブックを新規作成"]', 5000)
           .catch(() => waitForElementByText('button', '新規作成', 5000));
        await clickElement(createBtn);
        await sleep(2000);
    }

    // Step 2: ソース追加 (Add Source)
    if (!urlInput) {
        log('Step 2: Finding Source Input (after create)...');
        // 不要なボタンクリックを削除し、直接入力欄を待つ
        urlInput = await waitForElement('textarea[formcontrolname="discoverSourcesQuery"]', 5000)
           .catch(() => waitForElement('textarea', 5000));
    }
    
    await inputText(urlInput, url);
    await sleep(1000);

    // Step 3: 次へ (Next)
    log('Step 3: Clicking Next...');
    // ターゲット: button.actions-enter-button (arrow_forward アイコン)
    const nextBtn = await waitForElement('button.actions-enter-button', 5000)
       .catch(() => waitForElement('button mat-icon:contains("arrow_forward")', 5000).then(icon => icon.closest('button')));

    await clickElement(nextBtn);

    // Step 4: 待機 & 音声解説カスタマイズ (Customize Audio)
    log('Step 4: Waiting for processing (15s)...');
    await sleep(15000); // ソース読み込み待機

    log('Step 4.5: Clicking Customize Audio...');
    // ターゲット: button[aria-label="音声解説をカスタマイズ"] (edit アイコン)
    const customizeBtn = await waitForElement('button[aria-label="音声解説をカスタマイズ"]', 15000)
       .catch(() => waitForElement('button mat-icon:contains("edit")', 5000).then(icon => icon.closest('button')));

    await clickElement(customizeBtn);
    await sleep(2000); // モーダルが開くのを待つ

    // Step 5: カスタマイズ設定 (Configuration)
    log('Step 5: Configuring Audio Overview...');

    // 5-1. 形式: 詳細 (Detail)
    try {
       const detailLabel = await waitForElementByText('div.tile-label', '詳細', 5000);
       const radioBtn = detailLabel.closest('mat-radio-button') || detailLabel.closest('label');
       if (radioBtn && isVisible(radioBtn)) {
         await clickElement(radioBtn);
         log('Selected: Detail');
         await sleep(500);
       }
    } catch (e) { log('Could not select Detail radio button:', e); }

    // 5-2. 言語: 日本語 (Language: Japanese)
    try {
       const languageSelect = await waitForElement('mat-select', 5000);
       const currentValue = languageSelect.querySelector('.mat-mdc-select-value-text');
       if (!currentValue || !currentValue.textContent.includes('日本語')) {
           log('Language is not Japanese, changing...');
           await clickElement(languageSelect);
           await sleep(1000); 
           const japaneseOption = await waitForElementByText('mat-option', '日本語', 5000);
           await clickElement(japaneseOption);
           log('Selected: Japanese');
           await sleep(1000); 
       }
    } catch (e) { log('Could not set Language:', e); }

    // 5-3. 長さ: 短め (Length: Short)
    try {
       const shortToggle = await waitForElementByText('div.button-toggle-label', '短め', 5000);
       const toggleBtn = shortToggle.closest('button');
       if (toggleBtn && isVisible(toggleBtn)) {
         await clickElement(toggleBtn);
         log('Selected: Short');
         await sleep(500);
       }
    } catch (e) { log('Could not select Short length:', e); }

    // 5-4. 焦点 (Focus)
    try {
        const focusInput = await waitForElement('textarea[aria-label="このエピソードで AI ホストが焦点を当てるべきこと"]', 5000)
          .catch(() => waitForElement('textarea[placeholder*="次の方法をお試しください"]', 5000));
        
        await inputText(focusInput, '日本語、短め、AIホストが焦点を当てるべきことに、サイトを要約して');
        log('Input Focus instruction');
        await sleep(1000);
    } catch (e) { log('Could not input focus instruction:', e); }

    // Step 6: 生成 (Generate)
    log('Step 6: Clicking Generate...');
    const generateBtn = await waitForElementByText('button span.mdc-button__label', '生成', 5000)
       .then(span => span.closest('button'))
       .catch(() => waitForElement('button:has(.mdc-button__label:contains("生成"))', 5000));

    await clickElement(generateBtn);

    log('Automation complete');
    chrome.runtime.sendMessage({ action: 'statusUpdate', status: '完了: 音声生成を開始しました', type: 'success' });

  } catch (error) {
    console.error('Automation failed:', error);
    chrome.runtime.sendMessage({ action: 'statusUpdate', status: 'エラー: ' + error.message, type: 'error' });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'runAutomation') {
    automateNotebookLM(request.url);
  }
});