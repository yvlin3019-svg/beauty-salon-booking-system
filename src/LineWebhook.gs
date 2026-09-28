/**
 * ============================================================
 * LINE Messaging API - Webhook 接收與回覆
 * ============================================================
 * 部署與設定步驟請參考 README.md「LINE 串接」章節
 *
 * 【重要限制先說清楚】
 * Google Apps Script 的網頁應用程式沒辦法讀取 HTTP 請求的標頭（header），
 * 所以這裡沒辦法做到 LINE 官方建議的「x-line-signature」簽章驗證，
 * 安全性比正規伺服器架構弱一些，這是 Apps Script 平台本身的限制。
 * 對小型工作室、流量不大的情況風險可接受，但請知悉這個取捨。
 * ============================================================
 */

// ------------------------------------------------------------
// 1. Webhook 進入點：LINE 平台會把所有事件用 POST 送到這裡
// ------------------------------------------------------------
// 除錯用：把訊息直接寫進試算表的「LINE除錯紀錄」分頁，不用在 Apps Script 介面裡找執行紀錄
function logLineDebug(label, content) {
  try {
    const headers = ['時間', '項目', '內容'];
    const sheet = getOrCreateSheet('LINE除錯紀錄', headers);
    sheet.appendRow([new Date(), label, String(content).slice(0, 500)]);
  } catch (err) {
    // 除錯紀錄本身失敗就算了，不要影響主要流程
  }
}

function doPost(e) {
  // 注意：這裡刻意用 HtmlService.createHtmlOutput 而不是 ContentService.createTextOutput，
  // 因為後者在 LINE／Telegram 這類 Webhook 驗證時，Google 前端伺服器會回傳 302 轉址，
  // 導致對方平台判定「沒有正確回應 200」而失敗，換成 HtmlService 可以避開這個問題。
  try {
    if (!e || !e.postData || !e.postData.contents) {
      logLineDebug('doPost 被呼叫，但沒有 postData（可能是 Verify 按鈕測試）', '');
      return HtmlService.createHtmlOutput('OK');
    }
    logLineDebug('收到原始內容', e.postData.contents);
    const body = JSON.parse(e.postData.contents);
    const events = body.events || [];

    events.forEach(event => {
      try {
        handleLineEvent(event);
      } catch (err) {
        Logger.log('處理單一事件時發生錯誤：' + err.message);
      }
    });

    return HtmlService.createHtmlOutput('OK');
  } catch (err) {
    Logger.log('doPost 發生錯誤：' + err.message);
    return HtmlService.createHtmlOutput('OK'); // 一律回 200，避免 LINE 一直重送
  }
}

// ------------------------------------------------------------
// 2. 事件分派
// ------------------------------------------------------------
function handleLineEvent(event) {
  if (event.type === 'follow') {
    handleFollowEvent(event);
    return;
  }
  if (event.type === 'message' && event.message && event.message.type === 'text') {
    handleTextMessage(event);
    return;
  }
  // 其他事件類型（貼圖、圖片、取消好友等）目前不處理
}

// 客人第一次加好友：發送歡迎訊息 + 預約須知圖片，並引導他傳電話號碼完成綁定
function handleFollowEvent(event) {
  const userId = event.source && event.source.userId;
  if (!userId) return;

  const messages = [
    { type: 'text', text: LINE_REPLY_TEMPLATES.welcomeMessage },
  ];

  // 有設定預約須知圖片網址的話才加進去（要放公開可連結的網址，不能是本機檔案）
  if (LINE_REPLY_TEMPLATES.noticeImageUrl) {
    messages.push({
      type: 'image',
      originalContentUrl: LINE_REPLY_TEMPLATES.noticeImageUrl,
      previewImageUrl: LINE_REPLY_TEMPLATES.noticeImageUrl,
    });
  }

  // 電話綁定的引導改成從網頁預約成功畫面帶過來，這裡的加好友歡迎訊息維持單純不用另外要求

  replyToLine(event.replyToken, messages);
}

// ------------------------------------------------------------
// 3. 文字訊息處理：依內容判斷要做什麼
// ------------------------------------------------------------
function handleTextMessage(event) {
  const userId = event.source && event.source.userId;
  const text = (event.message.text || '').trim();
  if (!userId || !text) return;

  const boundPhone = getPhoneByLineUserId(userId);

  // 情況一：訊息是一串數字，看起來像電話號碼 → 進入「待確認」狀態，等客人回1才正式生效
  if (/^09\d{8}$/.test(text) || /^0\d{8,9}$/.test(text)) {
    handlePhoneBindingRequest(event.replyToken, userId, text);
    return;
  }

  // 情況一之二：客人回「1」→ 確認剛剛輸入的電話，正式完成綁定
  if (text === '1') {
    handlePhoneBindingConfirm(event.replyToken, userId);
    return;
  }

  // 情況二：查詢預約（唯讀，不能取消/修改，需先完成綁定）
  if (text.includes('查詢預約') || text.includes('我的預約')) {
    handleQueryBooking(event.replyToken, boundPhone);
    return;
  }

  // 情況三：取消/改期相關關鍵字 → 一律導回私訊店家，不做自動取消
  if (text.includes('取消') || text.includes('改期') || text.includes('改時間')) {
    replyToLine(event.replyToken, [
      { type: 'text', text: '如需取消或調整預約時段，請直接在這裡告訴我們您的姓名與想調整的內容，由專人為您處理喔！' },
    ]);
    return;
  }

  // 情況三之二：預約時間查詢 → 回覆說明文字 + 預約網站連結（即時空檔，比手動維護的圖片準確）
  if (text.includes('預約時間') || text.includes('可預約') || text.includes('時刻表')) {
    handleBookingTimeInquiry(event.replyToken);
    return;
  }

  // 情況四：眉毛/睫毛快速預約（菜單圖片+預約表單連結）
  const mentionsEyebrow = text.includes('眉毛') || text.includes('霧眉') || text.includes('淡色');
  const mentionsEyelash = text.includes('睫毛') || text.includes('嫁接');

  if (mentionsEyebrow) {
    handleQuickBookingRequest(event.replyToken, 'eyebrow');
    return;
  }
  if (mentionsEyelash) {
    handleQuickBookingRequest(event.replyToken, 'eyelash');
    return;
  }

  // 其他訊息：沒有比對到任何關鍵字，不主動回覆（避免洗版），只記錄下來
  Logger.log('未比對到關鍵字的訊息：' + text);
}

function handleQuickBookingRequest(replyToken, categoryId) {
  const tpl = LINE_REPLY_TEMPLATES[categoryId];
  if (!tpl) return;

  const bookingUrl = ScriptApp.getService().getUrl() + '?category=' + categoryId;
  const messages = [];
  if (tpl.menuImageUrl) {
    messages.push({ type: 'image', originalContentUrl: tpl.menuImageUrl, previewImageUrl: tpl.menuImageUrl });
  }
  messages.push({
    type: 'text',
    text: `預約表單⬇️，詳細項目與可預約時間段皆以預約表單實際顯示為主：\n${bookingUrl}`,
  });
  replyToLine(replyToken, messages);
}

function handleBookingTimeInquiry(replyToken) {
  const bookingUrl = ScriptApp.getService().getUrl();
  replyToLine(replyToken, [
    {
      type: 'text',
      text: `${LINE_REPLY_TEMPLATES.bookingTimeText}\n\n即時空檔請直接到預約網站查看／預約：\n${bookingUrl}`,
    },
  ]);
}

// ------------------------------------------------------------
// 4. 回應內容範本 —— 請把下面文字換成您原本自動回應設定裡的實際內容
// ------------------------------------------------------------
const LINE_REPLY_TEMPLATES = {
  welcomeMessage:
    'xxx您好！\n歡迎來到漂亮水兒🫧眉睫工作室\n\n' +
    '📌工作室位置：台中北屯 近一德洋樓，預約成功後才會提供詳細地址！\n' +
    '📝預約前請務必詳閱「預約須知」！\n' +
    '🛎️新客會事先收取定金，定金收到後即完成預約！\n\n' +
    '作品 IG |  PRETTYSURE.STUDIO\n' +
    '🔗https://reurl.cc/xLdevb\n\n' +
    '一人作業，收到信息後將盡快回覆您\n' +
    'Have a nice day💫',
  // 預約須知圖片的公開網址，請填入可以被外部直接連結、看到圖片本身的網址（不是本機檔案路徑）
  noticeImageUrl: 'https://i.imgur.com/o4qDkfe.jpeg',
  bookingTimeText:
    '🕊️預約前請詳閱預約須知\n' +
    '💌當日空檔請直接詢問，時段皆可以微調🦭\n' +
    '🫧8:00/9:00/20:00/21:00 時段不加價，需要可詢問\n' +
    '🤍希望水水們都能約到理想時間，請盡量提前預約 3Q～',

  // 眉毛（霧眉）分類專屬內容
  eyebrow: {
    quickBookingText:
      '眉の快速預約.ᐟ.ᐟ\n' +
      '① 姓名：\n' +
      '② 電話：\n' +
      '③ 予約項目：霧眉/淡色\n' +
      '④ 予約時段：\n' +
      '⑤ 是否已詳閱預約須知：是 / 否\n' +
      '⑥ 眉毛是否有霧過：無 / 有\n' +
      '＊如有眉毛底色的的客人，請提供素顏眉毛照片\n' +
      '（需正面平視鏡頭，只露出眼睛及眉毛即可）',
    // 眉毛菜單圖片的公開網址，待補
    menuImageUrl: 'https://i.imgur.com/ian3211.jpeg',
    // 眉毛術前注意事項圖片的公開網址（選填，文字版已經跟系統裡霧眉分類的注意事項共用，不用重複填）
    noticeImageUrl: 'https://i.imgur.com/vlSrm00.jpeg',
  },

  // 睫毛（接睫毛）分類專屬內容
  eyelash: {
    quickBookingText:
      '睫の快速預約.ᐟ.ᐟ\n' +
      '① 姓名：\n' +
      '② 電話：\n' +
      '③ 予約項目：日式稼接 / 睫毛管理\n' +
      '④ 稼接根數：（100本～160本）/ 現場討論 / 補睫\n' +
      '⑤ 予約時段：（可提供多個理想時段）\n' +
      '⑥ 是否需要卸睫：是 / 否\n' +
      '⑦ 是否加購下睫毛：是 / 否\n' +
      '⑧ 是否已詳閱預約須知：是 / 否',
    // 睫毛菜單圖片的公開網址，待補
    menuImageUrl: 'https://i.imgur.com/oXHjznl.jpeg',
    // 睫毛術前注意事項圖片的公開網址（選填，文字版已經跟系統裡睫毛分類的注意事項共用，不用重複填）
    noticeImageUrl: 'https://i.imgur.com/f7wmkYD.jpeg',
  },
};

// ------------------------------------------------------------
// 5. 電話綁定
// ------------------------------------------------------------
// 客人傳電話號碼 → 存成「待確認」狀態，回覆請他確認
function handlePhoneBindingRequest(replyToken, userId, phoneText) {
  const phone = normalizePhoneForLookup(phoneText);

  const headers = ['LINE User ID', '電話', '狀態', '綁定時間'];
  const sheet = getOrCreateSheet(CONFIG.LINE_BINDING_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();

  let existingRow = -1;
  let existingStatus = '';
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      existingRow = i + 1;
      existingStatus = data[i][2];
      break;
    }
  }

  // 已經確認過的綁定，不能自己傳新電話覆蓋，要走店家人工處理
  if (existingStatus === '已確認') {
    replyToLine(replyToken, [
      { type: 'text', text: '您已經完成電話綁定囉，如需修改電話號碼，請直接聯繫店家協助處理。' },
    ]);
    return;
  }

  if (existingRow !== -1) {
    sheet.getRange(existingRow, 2).setValue("'" + phone);
    sheet.getRange(existingRow, 3).setValue('待確認');
    sheet.getRange(existingRow, 4).setValue(new Date());
  } else {
    sheet.appendRow([userId, "'" + phone, '待確認', new Date()]);
  }

  replyToLine(replyToken, [
    { type: 'text', text: `您的電話是 ${phone}，確認無誤請回「1」，有誤請再輸入一次電話號碼，如後續需要修改請聯繫店家。` },
  ]);
}

// 客人回「1」→ 把待確認的電話正式改成已確認
function handlePhoneBindingConfirm(replyToken, userId) {
  const headers = ['LINE User ID', '電話', '狀態', '綁定時間'];
  const sheet = getOrCreateSheet(CONFIG.LINE_BINDING_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== userId) continue;

    if (data[i][2] === '已確認') {
      // 已經確認過了，回「1」沒有意義，安靜略過不回覆，避免誤觸發
      return;
    }
    if (data[i][2] !== '待確認') return; // 沒有待確認的紀錄，忽略

    const phone = normalizePhoneForLookup(data[i][1]);
    sheet.getRange(i + 1, 3).setValue('已確認');
    replyToLine(replyToken, [
      { type: 'text', text: `電話 ${phone} 綁定成功！之後可以直接傳「查詢預約」查看您的預約時間喔。` },
    ]);
    return;
  }
  // 完全沒有任何綁定紀錄時，回「1」不做任何回應
}

// 查詢綁定電話，只回傳「已確認」狀態的，待確認中的不算數
function getPhoneByLineUserId(userId) {
  const headers = ['LINE User ID', '電話', '狀態', '綁定時間'];
  const sheet = getOrCreateSheet(CONFIG.LINE_BINDING_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId && data[i][2] === '已確認') {
      return normalizePhoneForLookup(data[i][1]);
    }
  }
  return null;
}

// ------------------------------------------------------------
// 6. 查詢預約（唯讀）
// ------------------------------------------------------------
function handleQueryBooking(replyToken, phone) {
  if (!phone) {
    replyToLine(replyToken, [
      { type: 'text', text: '請先傳您的電話號碼完成綁定，才能查詢預約喔！' },
    ]);
    return;
  }

  const bookings = getMyUpcomingBookings(phone);
  if (!bookings.length) {
    replyToLine(replyToken, [
      { type: 'text', text: '目前查不到您尚未到店的預約紀錄。' },
    ]);
    return;
  }

  const lines = bookings.map(b => `・${b.apptStr}　${b.category}/${b.mainItem}`);
  replyToLine(replyToken, [
    { type: 'text', text: `您目前的預約：\n${lines.join('\n')}\n\n如需取消或調整，請直接跟我們說喔！` },
  ]);
}

// ------------------------------------------------------------
// 7. 呼叫 LINE API：回覆（Reply，免費，須在收到訊息後盡快回覆）
// ------------------------------------------------------------
// 固定的四顆快速回覆按鈕，附加在每次回覆訊息的最後一則，客人不用打字，點了效果等同輸入對應文字
function getQuickReplyItems() {
  return {
    items: [
      { type: 'action', action: { type: 'message', label: '查詢我的預約', text: '查詢預約' } },
      { type: 'action', action: { type: 'message', label: '眉毛項目', text: '眉毛項目' } },
      { type: 'action', action: { type: 'message', label: '睫毛項目', text: '睫毛項目' } },
      { type: 'action', action: { type: 'message', label: '本月可預約時間', text: '預約時間' } },
    ],
  };
}

function replyToLine(replyToken, messages) {
  if (!replyToken) return;
  if (messages && messages.length) {
    messages[messages.length - 1].quickReply = getQuickReplyItems();
  }
  try {
    const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN },
      payload: JSON.stringify({ replyToken: replyToken, messages: messages }),
      muteHttpExceptions: true,
    });
    logLineDebug('回覆結果 HTTP ' + response.getResponseCode(), response.getContentText());
  } catch (err) {
    logLineDebug('回覆 LINE 訊息失敗', err.message);
  }
}

// ------------------------------------------------------------
// 8. 呼叫 LINE API：推播（Push，主動發送，有用量限制，之後做「術前提醒」會用到）
// ------------------------------------------------------------
function pushToLine(userId, messages) {
  if (!userId) return;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN },
      payload: JSON.stringify({ to: userId, messages: messages }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    Logger.log('推播 LINE 訊息失敗：' + err.message);
  }
}

// 【只需要執行一次】手動觸發外部網路呼叫的授權
// 在 Apps Script 編輯器選這個函式、點執行，會跳出授權視窗，點「允許」補齊「呼叫外部網址」的權限
function grantExternalRequestPermission() {
  const response = UrlFetchApp.fetch('https://api.line.me/v2/bot/info', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN },
    muteHttpExceptions: true,
  });
  Logger.log('測試呼叫完成，HTTP 狀態碼：' + response.getResponseCode());
  Logger.log('回應內容：' + response.getContentText());
}
