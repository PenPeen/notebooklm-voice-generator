const DEBUG = true;
const LOG_PREFIX = '[NotebookLM Auto]';

function log(...args) {
  if (DEBUG) console.log(LOG_PREFIX, ...args);
}

// --- Utility Functions ---

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForElement(selector, timeout = 10000, parent = document) {
  log(`Waiting for selector: ${selector}`);
  return new Promise((resolve, reject) => {
    const element = parent.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver((mutations) => {
      const element = parent.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(parent.body || parent, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element not found: ${selector}`));
    }, timeout);
  });
}

// テキスト内容またはaria-labelで要素を探す
async function waitForElementByText(tagName, text, timeout = 10000) {
  log(`Waiting for text/label "${text}" in <${tagName}>`);
  return new Promise((resolve, reject) => {
    const find = () => {
      const elements = document.querySelectorAll(tagName);
      for (const el of elements) {
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
      reject(new Error(`Element with text "${text}" not found`));
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
    log('Step 1: Finding Create Button...');
    // ターゲット: button.create-new-button[aria-label="ノートブックを新規作成"]
    const createBtn = await waitForElement('button.create-new-button[aria-label="ノートブックを新規作成"]', 10000)
       .catch(() => waitForElementByText('button', '新規作成', 5000));

    await clickElement(createBtn);
    await sleep(2000);

    // Step 2: ソース追加 (Add Source)
    log('Step 2: Finding Source Input...');
    // "ウェブサイト" オプションが表示される場合はクリック
    try {
      const websiteOption = await waitForElementByText('div, button', 'ウェブサイト', 3000);
      await clickElement(websiteOption);
      await sleep(1000);
    } catch (e) {
      log('Website option not found, skipping...');
    }

    // ターゲット: textarea[formcontrolname="discoverSourcesQuery"]
    const urlInput = await waitForElement('textarea[formcontrolname="discoverSourcesQuery"]', 5000)
       .catch(() => waitForElement('input[placeholder*="ウェブで新しいソースを検索"]', 5000));
    
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
    const customizeBtn = await waitForElement('button[aria-label="音声解説をカスタマイズ"]', 10000)
       .catch(() => waitForElement('button mat-icon:contains("edit")', 5000).then(icon => icon.closest('button')));

    await clickElement(customizeBtn);
    await sleep(2000); // モーダルが開くのを待つ

    // Step 5: カスタマイズ設定 (Configuration)
    log('Step 5: Configuring Audio Overview...');

    // 5-1. 形式: 詳細 (Detail)
    // ターゲット: ラジオボタン内のテキスト "詳細" を含む要素をクリック
    try {
       const detailLabel = await waitForElementByText('div.tile-label', '詳細', 5000);
       // ラジオボタン全体をクリックするため、親要素を探してクリック
       const radioBtn = detailLabel.closest('mat-radio-button') || detailLabel.closest('label');
       await clickElement(radioBtn);
       log('Selected: Detail');
       await sleep(500);
    } catch (e) {
       log('Could not select Detail radio button:', e);
    }

    // 5-2. 言語: 日本語 (Language: Japanese)
    // ターゲット: mat-select。値が日本語でなければ選択
    try {
       const languageSelect = await waitForElement('mat-select', 5000);
       const currentValue = languageSelect.querySelector('.mat-mdc-select-value-text');
       
       if (!currentValue || !currentValue.textContent.includes('日本語')) {
           log('Language is not Japanese, changing...');
           await clickElement(languageSelect);
           await sleep(1000); // ドロップダウンが開くのを待つ
           
           // ドロップダウン内の選択肢 "日本語" を探してクリック
           // mat-option 要素
           const japaneseOption = await waitForElementByText('mat-option', '日本語', 5000);
           await clickElement(japaneseOption);
           log('Selected: Japanese');
           await sleep(1000); // 閉じるのを待つ
       } else {
           log('Language is already Japanese');
       }
    } catch (e) {
       log('Could not set Language:', e);
    }

    // 5-3. 長さ: 短め (Length: Short)
    // ターゲット: mat-button-toggle 内の "短め"
    try {
       const shortToggle = await waitForElementByText('div.button-toggle-label', '短め', 5000);
       // 親のボタン要素をクリック
       const toggleBtn = shortToggle.closest('button');
       await clickElement(toggleBtn);
       log('Selected: Short');
       await sleep(500);
    } catch (e) {
        log('Could not select Short length:', e);
    }

    // 5-4. 焦点 (Focus)
    // ターゲット: textarea[placeholder*="次の方法をお試しください"]
    // または aria-label="このエピソードで AI ホストが焦点を当てるべきこと"
    try {
        const focusInput = await waitForElement('textarea[aria-label="このエピソードで AI ホストが焦点を当てるべきこと"]', 5000)
          .catch(() => waitForElement('textarea[placeholder*="次の方法をお試しください"]', 5000));
        
        await inputText(focusInput, '日本語、短め、AIホストが焦点を当てるべきことに、サイトを要約して');
        log('Input Focus instruction');
        await sleep(1000);
    } catch (e) {
        log('Could not input focus instruction:', e);
    }

    // Step 6: 生成 (Generate)
    log('Step 6: Clicking Generate...');
    // ターゲット: button:has(.mdc-button__label:contains("生成"))
    const generateBtn = await waitForElementByText('button span.mdc-button__label', '生成', 5000)
       .then(span => span.closest('button'))
       .catch(() => waitForElement('button:has(.mdc-button__label:contains("生成"))', 5000)); // jQuery like syntax not supported native, handled by waitForElementByText logic

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