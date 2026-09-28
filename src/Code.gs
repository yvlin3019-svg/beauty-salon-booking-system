/**
 * ============================================================
 * 美業預約系統 - Google Apps Script 後端
 * ============================================================
 * 部署方式請參考 README.md
 * ============================================================
 */

// ------------------------------------------------------------
// 1. 基本設定
// ------------------------------------------------------------
const CONFIG = {
  CALENDAR_ID: 'primary',
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',
  CUSTOMER_SHEET_NAME: '客人資料',
  BOOKING_LOG_SHEET_NAME: '預約紀錄',
  SCHEDULE_SHEET_NAME: '營業時段設定',

  MIN_LEAD_TIME_MINUTES: 60,
  BOOKING_WINDOW_DAYS: 60,

  // ----------------------------------------------------------
  // 服務分類：霧眉 / 接睫毛
  // 每個分類底下有：主要項目(mainItems，單選必填)、
  // 加購群組(addonGroups，每組各自一個下拉，預設「無」)、
  // 優惠(discounts + discountMode: 'multi'=可複選checkbox / 'single'=單選下拉)
  // 以及術前注意事項全文(noticeText)
  // ----------------------------------------------------------
  CATEGORIES: [
    {
      id: 'eyebrow',
      name: '眉毛項目',
      noticeTitle: '霧眉術前注意事項',
      noticeText:
        '① 操作時間約3~3.5小時，請預留4小時時間\n\n' +
        '② 霧眉前1~2週避免熬夜、喝酒，請足夠休息！\n\n' +
        '③ 施作2週前「請勿修眉毛」！\n\n' +
        '④ 霧眉2週前請避免使用含酒精、美白、刺激成分的保養品及醫美雷射。請注重保濕和皮膚穩定！\n\n' +
        '⑤ 曾在他店操作過眉部紋繡殘留底色之狀況（顏色尚未退乾淨）皆屬「改眉」，價位另計\n\n' +
        '⑥ 請誠實告知身體狀況，有以下狀況者 如孕婦、患有糖尿病、心臟疾病、血液傳染疾病、疤痕體質、蠶豆症、皮膚病、嚴重過敏肌膚、完美主義、易焦慮擔心者，請勿預約！\n\n' +
        '「為維護雙方權益 請詳閱以上事項」\n' +
        '確認後即可填寫預約表格，預約成功視為「完全同意遵守」本工作室規範',
      mainItems: [
        { id: 'eyebrow_full', name: '半永久霧眉（贈3個月內補色1次）', price: 4500, duration: 210 },
        { id: 'eyebrow_touchup_1y', name: '舊客補色（一年內）', price: 2250, duration: 120 },
        { id: 'eyebrow_touchup_over1y', name: '舊客補色（一年以上，視為重新霧眉，霧眉時價88折）', price: null, priceFormula: { baseItemId: 'eyebrow_full', multiplier: 0.88 }, priceNote: '半永久霧眉現行金額88折，實際以現場確認為準', duration: 210 },
        { id: 'eyebrow_light_single', name: '無創淡色－單次', price: 1200, duration: 60 },
        { id: 'eyebrow_light_unlimited', name: '無創淡色－包堂不限次數', price: 4500, duration: 60 },
      ],
      addonGroups: [
        {
          groupId: 'oldbase',
          label: '舊底調整費',
          displayAs: 'buttons',
          options: [
            { id: 'none', name: '無', price: 0 },
            { id: 'oldbase_yes', name: '舊底調整費 ＋NTD.500', price: 500 },
          ],
        },
        {
          groupId: 'mens',
          label: '男士眉',
          displayAs: 'buttons',
          options: [
            { id: 'none', name: '無', price: 0 },
            { id: 'mens_yes', name: '男士眉 ＋NTD.500', price: 500 },
          ],
        },
      ],
      discountMode: 'multi', // 可疊加，畫面用 checkbox 複選
      discounts: [
        { id: 'ig', name: 'IG追蹤＋分享/標記', price: -200 },
        { id: 'birthday', name: '當月壽星', price: -200 },
        { id: 'group', name: '兩人以上同行（每人）', price: -200, requiresCompanionPhone: true },
        { id: 'redo', name: '續做霧眉優惠（僅限無創淡色）', price: -300, restrictedToMainItems: ['eyebrow_light_single', 'eyebrow_light_unlimited'] },
      ],
    },
    {
      id: 'eyelash',
      name: '睫毛項目',
      noticeTitle: '睫毛項目 術前注意事項',
      noticeText:
        '睫毛管理：自身睫毛捲翹、塑型，維持度約6~8週（視代謝速度）\n' +
        '日式嫁接：真睫毛上嫁接假睫毛，維持度約3~4週（視代謝速度及個人保養照護有所不同）\n' +
        '（真的猶豫不知道選什麼我們可以現場討論）\n\n' +
        '① 操作時長約1~1.5小時，請預留2小時時間\n\n' +
        '② 卸睫/加購下睫毛，請提前告知，需多預留半小時\n\n' +
        '③ 3個月內做過睫毛管理、角蛋白、紋繡眼線無法施作日式嫁接\n\n' +
        '④ 眼睛、眼皮發炎中或長針眼皆無法施作\n\n' +
        '⑤ 一個月內做過眼部周圍醫美手術或半年內做過眼部手術、雙眼皮手術、近視手術恢復中或紋繡傷口恢復中皆無法施作\n\n' +
        '⑥ 孕媽咪請確認是否可久躺（工作室使用平躺的美容床）\n\n' +
        '⑦ 操作當天「請勿」化眼妝、夾睫毛、睫毛膏，其它淡妝可，如果結束後要漂亮出門約會的水水可以帶化妝品補妝\n\n' +
        '⑧ 操作過程不可睜眼及使用手機\n\n' +
        '⑨ 操作前一天請讓眼睛足夠休息睡飽！避免眼睛敏感，當天可配戴日拋隱形眼鏡，不建議戴長戴型隱形眼鏡\n\n' +
        '「為維護雙方權益 請詳閱以上事項」\n' +
        '確認後即可填寫預約表格，預約成功視為「完全同意遵守」本工作室規範',
      mainItems: [
        { id: 'lash_curl', name: '上睫毛捲翹', price: 799, duration: 60 },
        { id: 'lash_100', name: '日式單根嫁接－上睫毛100本', price: 790, duration: 90 },
        { id: 'lash_120', name: '日式單根嫁接－上睫毛120本', price: 890, duration: 105 },
        { id: 'lash_140', name: '日式單根嫁接－上睫毛140本', price: 990, duration: 120 },
        { id: 'lash_160', name: '日式單根嫁接－上睫毛160本', price: 1090, duration: 135 },
        { id: 'lash_remove_only', name: '純卸睫不續接', price: 300, duration: 30 },
        // 以下兩項只給「我要補睫」專用流程使用，一般預約表單的主要項目下拉不會顯示（見 refillOnly 標記）
        { id: 'lash_refill_2w', name: '2週內補睫', price: null, priceNote: '依上次消費金額5折計算，現場確認', duration: 60, refillOnly: true, discountRate: 0.5 },
        { id: 'lash_refill_3w', name: '3週內補睫', price: null, priceNote: '依上次消費金額8折計算，現場確認', duration: 90, refillOnly: true, discountRate: 0.8 },
      ],
      addonGroups: [
        {
          groupId: 'lowlash_curl',
          label: '加購下睫毛（睫毛捲翹適用）',
          options: [
            { id: 'none', name: '無', price: 0 },
            { id: 'low_curl_yes', name: '加購下睫毛 ＋NTD.200', price: 200 },
          ],
        },
        {
          groupId: 'lowlash_extension',
          label: '加購下睫毛（日式嫁接適用）',
          options: [
            { id: 'none', name: '無', price: 0 },
            { id: 'low_20', name: '20本 ＋NTD.150', price: 150 },
            { id: 'low_30', name: '30本 ＋NTD.225', price: 225 },
          ],
        },
        {
          groupId: 'color',
          label: '彩睫加購',
          options: [
            { id: 'none', name: '無', price: 0 },
            { id: 'color_partial', name: '棕色/局部彩睫 ＋NTD.100', price: 100 },
            { id: 'color_full', name: '全眼彩睫/白色 ＋NTD.200', price: 200 },
          ],
        },
        {
          groupId: 'refill',
          label: '是否需要卸睫？',
          options: [
            { id: 'none', name: '無需卸睫', price: 0 },
            { id: 'refill_here_free', name: '本店卸除續接（免費）', price: 0 },
            { id: 'refill_other', name: '他店卸除續接（＋NTD.100~200）', price: null, priceNote: '需現場評估實際加價' },
          ],
        },
      ],
      discountMode: 'single', // 折扣僅擇一，畫面用單選下拉
      discounts: [
        { id: 'ig', name: 'IG/Threads追蹤＋分享標記', price: -100 },
        { id: 'referral', name: '舊帶新（需備註介紹人）', price: -100, requiresReferrerPhone: true },
        { id: 'birthday', name: '當月壽星', price: -100 },
      ],
    },
  ],

  // ----------------------------------------------------------
  // 工作室總須知（在客人選擇任何服務項目「之前」就要顯示並勾選同意）
  // ----------------------------------------------------------
  STUDIO_NOTICE: {
    title: '工作室預約須知',
    text:
      '♡ 居家工作室｜獨立空間，入內有貓咪\n\n' +
      '♡ 工作室空間有限，暫不開放攜伴\n\n' +
      '♡ 付款方式：現金、轉帳\n\n' +
      '♡ 採預約制，當日空檔請直接私訊Line詢問\n\n' +
      '♡ 新客預約需付定金，定金將於施作當天全數折抵！\n' +
      '　（眉毛項目：NTD.1000、睫毛項目：NTD.500）\n\n' +
      '♡ 遲到15分鐘以上，將視情況取消當次預約\n' +
      '　***遲到者費用將無法使用任何優惠，皆以原價計算***\n\n' +
      '♡ 取消or改期須提前「3天」告知，改期僅限「1次」\n' +
      '　「新客」無故未到、未依規定時間改期、遲到15分鐘以上，\n' +
      '　→ 定金恕不退還亦不沿用\n' +
      '　「舊客」無故未到、未依規定時間改期、遲到15分鐘以上，\n' +
      '　→ 需支付空檔補貼費，且下次預約需支付定金\n' +
      '　（空檔補貼費 → 眉毛項目：NTD.1000、睫毛項目：NTD.500）\n\n' +
      '♡ 取消預約 定金可保留30日\n\n' +
      '♡ 請誠實告知身體狀況，並詳閱各項目注意事項及須知\n\n' +
      '「為維護雙方權益 預約前請詳閱以上事項」\n' +
      '預約成功視為「完全同意遵守」本工作室規範\n\n' +
      '♡感謝水水們耐心地讀到這裡♡',
  },

  // 新客定金金額（依分類 id 對應），跟上面須知裡寫的金額一致
  DEPOSIT_AMOUNT: {
    eyebrow: 1000,
    eyelash: 500,
  },

  // 定金要在送出預約後幾小時內完成匯款
  DEPOSIT_DEADLINE_HOURS: 24,

  // 取消或改期政策：需提前幾天告知、改期最多幾次、取消後定金可保留幾天
  CANCEL_MODIFY_MIN_DAYS: 3,
  MAX_MODIFY_COUNT: 1,
  DEPOSIT_HOLD_DAYS: 30,

  // 新客得知管道選項（只有系統判斷是新客時才會問這一題）
  REFERRAL_SOURCES: ['Instagram', 'Threads', '朋友介紹', '其他'],
  // 選了這些選項時，前端會多跳出一個選填的文字框（例如介紹人姓名）
  REFERRAL_SOURCES_WITH_DETAIL: ['朋友介紹', '其他'],

  // 匯款資訊 —— 請務必填入真實的收款帳戶資訊，這裡先放預留文字
  BANK_INFO: {
    bankName: 'YOUR_BANK_NAME',
    bankCode: '000',
    account: 'YOUR_BANK_ACCOUNT',
  },

  DISCOUNT_USAGE_SHEET_NAME: '優惠使用紀錄',

  // ---- LINE Messaging API 設定 ----
  // 這兩個是密鑰，請自己從 LINE Official Account Manager →設定→Messaging API 取得後填入，不要交給任何人
  LINE_CHANNEL_ACCESS_TOKEN: '請填入您的 Channel access token',
  LINE_CHANNEL_SECRET: '請填入您的 Channel secret',
  LINE_BINDING_SHEET_NAME: 'LINE綁定',
  LINE_ADD_FRIEND_URL: 'https://line.me/R/ti/p/@YOUR_LINE_ID',

  // 優惠券規則：哪些優惠不受「永久限用一次」規則限制
  // birthday：每 365 天可再用一次（另外用生日月份判斷是否在檔期內）
  // 需要填介紹人電話的優惠（用 discount.requiresReferrerPhone 標記判斷）：不限次數，因為每介紹一位新朋友都能各自折抵一次
  BIRTHDAY_DISCOUNT_ID: 'birthday',
  BIRTHDAY_RESET_DAYS: 365,

  // 介紹人優惠券有效期限：從被介紹人「完成項目那天」起算幾個月內
  REFERRAL_CREDIT_VALID_MONTHS: 2,

  // 補睫預約規則：多少天內允許發起補睫、以及各時效對應的折扣
  TOUCHUP_MIN_DAYS_SINCE: 1,
  TOUCHUP_MAX_DAYS_SINCE: 21,
  TOUCHUP_TIER_2W_MAX_DAYS: 14, // 服務完成後 <=14 天，適用 2 週內補睫（5折）
};

// ------------------------------------------------------------
// 2. 網頁進入點
// ------------------------------------------------------------
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'book';
  const templateName = page === 'feedback' ? 'feedback' : (page === 'cancel' ? 'cancel' : 'index');
  const tpl = HtmlService.createTemplateFromFile(templateName);
  tpl.cancelUrl = ScriptApp.getService().getUrl() + '?page=cancel';
  tpl.bookUrl = ScriptApp.getService().getUrl();
  tpl.eventId = (e && e.parameter && e.parameter.id) || '';
  tpl.presetCategory = (e && e.parameter && e.parameter.category) || '';
  const titles = { cancel: '查詢／取消／修改預約', feedback: '服務反饋' };
  return tpl
    .evaluate()
    .setTitle(titles[page] || '線上預約')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ------------------------------------------------------------
// 3. 提供前端讀取設定
// ------------------------------------------------------------
function getBookingConfig() {
  return {
    categories: getCategoriesWithResolvedPrices(),
    bookingWindowDays: CONFIG.BOOKING_WINDOW_DAYS,
    studioNotice: CONFIG.STUDIO_NOTICE,
    depositAmount: CONFIG.DEPOSIT_AMOUNT,
    depositDeadlineHours: CONFIG.DEPOSIT_DEADLINE_HOURS,
    bankInfo: CONFIG.BANK_INFO,
    cancelModifyMinDays: CONFIG.CANCEL_MODIFY_MIN_DAYS,
    maxModifyCount: CONFIG.MAX_MODIFY_COUNT,
    depositHoldDays: CONFIG.DEPOSIT_HOLD_DAYS,
    referralSources: CONFIG.REFERRAL_SOURCES,
    referralSourcesWithDetail: CONFIG.REFERRAL_SOURCES_WITH_DETAIL,
    lineAddFriendUrl: CONFIG.LINE_ADD_FRIEND_URL,
  };
}

// 給前端用的分類資料：把有 priceFormula 的項目（例如舊客補色參照半永久霧眉打折）
// 先算出實際金額塞進 price，前端就不用自己處理换算邏輯
function getCategoriesWithResolvedPrices() {
  return CONFIG.CATEGORIES.map(cat => {
    const mainItems = cat.mainItems.map(item => {
      if (item.priceFormula) {
        const resolved = resolveMainItemPrice(cat, item);
        if (resolved !== null) return Object.assign({}, item, { price: resolved });
      }
      return item;
    });
    return Object.assign({}, cat, { mainItems: mainItems });
  });
}

// ------------------------------------------------------------
// 4. 找出主要項目物件（跨分類搜尋）
// ------------------------------------------------------------
function findMainItem(mainItemId) {
  for (const cat of CONFIG.CATEGORIES) {
    const item = cat.mainItems.find(m => m.id === mainItemId);
    if (item) return { category: cat, item: item };
  }
  return null;
}

// ------------------------------------------------------------
// 5. 查詢可預約時段
//    時段來源改成「營業時段設定」試算表，由店家自己每天手動填時段
//    （因為每天營業時間、公休都不固定，不能用固定公式自動產生）
//    回傳格式：{ status: 'unset' | 'closed' | 'ok', times: [...] }
//    - unset：這天完全沒有在試算表建立紀錄 → 代表店家還沒排班
//    - closed：這天有建立紀錄，但時段欄位是空的 → 代表公休/休息
//    - ok：正常回傳可預約的時段陣列（已扣掉被預約、已過期的時段）
// ------------------------------------------------------------
// 一次查詢「某年某月」整個月的空檔概況，給前端月曆格子使用
// 回傳：{ year, month, firstWeekday, days: [{ date, day, weekday, status, slotCount }, ...] }
function getAvailabilityOverviewForMonth(mainItemId, year, month) {
  const found = findMainItem(mainItemId);
  if (!found) throw new Error('找不到這個服務項目');

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();

  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const res = getAvailableSlots(dateStr, mainItemId);
    days.push({
      date: dateStr,
      day: day,
      weekday: d.getDay(),
      status: res.status,
      slotCount: (res.times || []).length,
    });
  }

  return { year: year, month: month, firstWeekday: firstDay.getDay(), days: days };
}

// 查詢某個日期區間內每一天的空檔概況，給前端「月曆格子」使用，一次查完一整個月
// 回傳：[{ date, weekday, status: 'unset'|'closed'|'ok', slotCount }, ...]
function getAvailabilityForRange(mainItemId, startDateStr, endDateStr, excludeEventId) {
  const found = findMainItem(mainItemId);
  if (!found) throw new Error('找不到這個服務項目');

  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T00:00:00');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

  const results = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const dateStr = Utilities.formatDate(cursor, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const res = getAvailableSlots(dateStr, mainItemId, excludeEventId);
    results.push({
      date: dateStr,
      weekday: cursor.getDay(),
      status: res.status,
      slotCount: (res.times || []).length,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}

// 給「修改預約」頁面用：用分類名稱＋主要項目名稱查一整個月的空檔概況，
// 並排除客人自己原本那筆預約，避免自己卡自己
function getAvailabilityForRangeByLabel(categoryName, mainItemName, startDateStr, endDateStr, excludeEventId) {
  const found = findMainItemByLabel(categoryName, mainItemName);
  if (!found) return [];
  return getAvailabilityForRange(found.item.id, startDateStr, endDateStr, excludeEventId);
}

// 判斷某個日期是不是「明天」（以日曆天為準，不是滾動24小時），明天整天不開放線上預約
function isTomorrow(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  return target.getTime() === tomorrow.getTime();
}

function getAvailableSlots(dateStr, mainItemId, excludeEventId) {
  const found = findMainItem(mainItemId);
  if (!found) throw new Error('找不到這個服務項目');
  const duration = found.item.duration;

  const date = new Date(dateStr + 'T00:00:00');
  if (isNaN(date.getTime())) throw new Error('日期格式錯誤');

  if (isTomorrow(date)) return { status: 'tomorrow_blocked', times: [] };

  const scheduled = getScheduledTimesForDate(dateStr);
  if (scheduled === null) return { status: 'unset', times: [] };
  if (scheduled.length === 0) return { status: 'closed', times: [] };

  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  let events = calendar.getEvents(dayStart, dayEnd);
  if (excludeEventId) events = events.filter(ev => ev.getId() !== excludeEventId);

  const now = new Date();
  const earliestAllowed = new Date(now.getTime() + CONFIG.MIN_LEAD_TIME_MINUTES * 60000);

  const availableTimes = [];
  scheduled.forEach(timeStr => {
    const parts = timeStr.split(':').map(Number);
    const h = parts[0], m = parts[1] || 0;
    if (isNaN(h) || isNaN(m)) return;
    const start = new Date(date);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + duration * 60000);
    if (start < earliestAllowed) return;
    if (isSlotFree(start, end, events)) availableTimes.push(timeStr);
  });

  return { status: 'ok', times: availableTimes };
}

// 從「營業時段設定」試算表讀取某一天的時段清單
// 找不到該日期的列 → 回傳 null（代表尚未排班）
// 找到但「可預約時段」欄位是空的 → 回傳 []（代表公休）
function getScheduledTimesForDate(dateStr) {
  const headers = ['日期', '可預約時段(逗號分隔，例如 10:30,13:00,15:30)', '備註'];
  const sheet = getOrCreateSheet(CONFIG.SCHEDULE_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowDateStr = normalizeDateCell(data[i][0]);
    if (rowDateStr === dateStr) {
      const timesRaw = String(data[i][1] || '').trim();
      if (!timesRaw) return [];
      return timesRaw.split(',').map(t => t.trim()).filter(Boolean);
    }
  }
  return null;
}

function normalizeDateCell(raw) {
  if (raw instanceof Date) {
    return Utilities.formatDate(raw, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(raw).trim();
}

function isSlotFree(slotStart, slotEnd, events) {
  for (const ev of events) {
    if (slotStart < ev.getEndTime() && slotEnd > ev.getStartTime()) return false;
  }
  return true;
}

// ------------------------------------------------------------
// 6. 送出預約
//    formData 格式：
//    {
//      name, phone, birthday, date, time, note,
//      categoryId, mainItemId,
//      addonSelections: { groupId: optionId, ... },
//      discountSelections: ['ig','birthday', ...]  // multi 分類是陣列，single 分類也統一用陣列（最多1個）
//      noticeAgreed: true
//    }
// ------------------------------------------------------------
// 檢查這支電話有沒有完成LINE綁定（狀態要是「已確認」才算數，待確認中的不算）
function isPhoneBoundToLine(phone) {
  const targetPhone = normalizePhoneForLookup(phone);
  if (!targetPhone) return false;
  const headers = ['LINE User ID', '電話', '狀態', '綁定時間'];
  const sheet = getOrCreateSheet(CONFIG.LINE_BINDING_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizePhoneForLookup(data[i][1]) === targetPhone && data[i][2] === '已確認') {
      return true;
    }
  }
  return false;
}

function submitBooking(formData) {
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(10000);
  if (!gotLock) return { success: false, message: '系統忙碌中，請稍後再試一次。' };

  try {
    if (!formData.noticeAgreed) {
      return { success: false, message: '請先閱讀並勾選同意術前注意事項' };
    }
    if (!formData.name || !formData.phone) {
      return { success: false, message: '姓名與電話為必填' };
    }
    // 如果是已存在的客人，前端顯示的姓名是遮蔽過的（例如「林O美」），
    // 這裡改用試算表裡真實的姓名，不要把遮蔽過的文字存進日曆或紀錄
    const existingInfo = lookupCustomerByPhone(formData.phone);
    if (!existingInfo.isNew && existingInfo.name) {
      formData.name = existingInfo.name;
    }
    if (!/^[\u4e00-\u9fa5]+$/.test(formData.name)) {
      return { success: false, message: '姓名請填寫中文姓名' };
    }
    if (!/^[0-9]+$/.test(formData.phone)) {
      return { success: false, message: '電話請只填寫數字' };
    }
    if (formData.birthday) {
      const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (formData.birthday > todayStr) {
        return { success: false, message: '生日不能是未來的日期' };
      }
    } else {
      return { success: false, message: '請填寫生日，才能享有生日優惠' };
    }

    const found = findMainItem(formData.mainItemId);
    if (!found) return { success: false, message: '服務項目錯誤' };
    const { category, item: mainItem } = found;

    // 驗證優惠是否可用（防止前端被繞過，後端一定要再檢查一次）
    const discountSelections = formData.discountSelections || [];
    let referrerPhoneForCredit = ''; // 舊帶新：會累積優惠券給對方
    let companionPhone = ''; // 兩人同行：當場折抵，不累積券
    for (const discountId of discountSelections) {
      const d = category.discounts.find(x => x.id === discountId);
      if (!d) continue;
      if ((d.requiresReferrerPhone || d.requiresCompanionPhone) && !normalizePhoneForLookup(formData.referrerPhone)) {
        return { success: false, message: `選擇「${d.name}」優惠時，請填寫對方電話` };
      }
      if (d.requiresReferrerPhone) referrerPhoneForCredit = formData.referrerPhone;
      if (d.requiresCompanionPhone) companionPhone = formData.referrerPhone;
    }
    const availability = getDiscountAvailability(formData.phone, category.id, mainItem.id);
    for (const discountId of discountSelections) {
      if (availability[discountId] && !availability[discountId].available) {
        return { success: false, message: `優惠「${availability[discountId].name || discountId}」目前無法使用：${availability[discountId].reason || '已使用過'}` };
      }
    }

    const [h, m] = formData.time.split(':').map(Number);
    const start = new Date(formData.date + 'T00:00:00');
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + mainItem.duration * 60000);

    if (isTomorrow(start)) {
      return { success: false, message: '明天不開放線上預約，如需預約請直接聯繫店家。' };
    }

    // 再次確認時段還空著
    const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
    const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start); dayEnd.setHours(23, 59, 59, 999);
    const events = calendar.getEvents(dayStart, dayEnd);
    if (!isSlotFree(start, end, events)) {
      return { success: false, message: '很抱歉，這個時段剛剛被別人預約走了，請重新選擇時段。' };
    }

    // 整理加購與優惠明細、計算金額
    const breakdown = buildBreakdown(category, mainItem, formData.addonSelections, formData.discountSelections);

    const serviceLabel = `${category.name}/${mainItem.name}`;
    // 先判斷是否為新客（電話目前有沒有出現在客人資料表），這一步不能晚於寫入預約紀錄，否則會被自己剛寫的這筆誤判
    const isNewCustomer = checkIsNewCustomer(formData.phone);
    const depositAmount = CONFIG.DEPOSIT_AMOUNT[category.id] || 0;

    const depositInfo = isNewCustomer
      ? {
          required: true,
          amount: depositAmount,
          deadlineHours: CONFIG.DEPOSIT_DEADLINE_HOURS,
          bank: CONFIG.BANK_INFO,
        }
      : { required: false };

    // 建立日曆事件
    const event = calendar.createEvent(
      `${formData.name} - ${category.name}/${mainItem.name}`,
      start,
      end,
      {
        description:
          `電話：${formData.phone}\n` +
          `生日：${formData.birthday || ''}\n` +
          `服務分類：${category.name}\n` +
          `主要項目：${mainItem.name}\n` +
          `明細：\n${breakdown.lines.join('\n')}\n` +
          `預估金額：${breakdown.hasVariable ? breakdown.total + '（含需現場確認之項目，實際以現場為準）' : 'NTD.' + breakdown.total}\n` +
          `客人身份：${isNewCustomer ? '新客' : '舊客'}\n` +
          (isNewCustomer
            ? `定金狀態：待付款，需於送出後${CONFIG.DEPOSIT_DEADLINE_HOURS}小時內完成匯款 NTD.${depositAmount}，否則預約取消\n`
            : '') +
          `備註：${formData.note || ''}`,
      }
    );

    // 先把這筆預約寫進「預約紀錄」表，再去重新整算到店次數，這樣次數才會正確算入這一筆
    logBooking(formData, category, mainItem, breakdown, start, event.getId(), isNewCustomer, depositAmount, null, referrerPhoneForCredit, companionPhone);
    const visitCount = upsertCustomerRecord(formData, serviceLabel, start);
    recordDiscountUsages(formData.phone, discountSelections, category, start, formData.referrerPhone, event.getId());
    updateCustomerCouponSummary(formData.phone);
    if (formData.referrerPhone) updateCustomerCouponSummary(formData.referrerPhone);

    return {
      success: true,
      message: '預約成功！',
      visitCount: visitCount,
      breakdown: breakdown,
      depositInfo: depositInfo,
      lineBound: isPhoneBoundToLine(formData.phone),
    };
  } catch (err) {
    return { success: false, message: '系統錯誤：' + err.message };
  } finally {
    lock.releaseLock();
  }
}

// 計算加購與優惠的金額明細
// 解析主要項目的實際金額：一般項目直接回傳price；有priceFormula的（例如舊客補色參照半永久霧眉打折）自動算出來
function resolveMainItemPrice(category, mainItem) {
  if (mainItem.price !== null) return mainItem.price;
  if (mainItem.priceFormula) {
    const baseItem = category.mainItems.find(m => m.id === mainItem.priceFormula.baseItemId);
    if (baseItem && baseItem.price !== null) {
      return Math.round(baseItem.price * mainItem.priceFormula.multiplier);
    }
  }
  return null;
}

function buildBreakdown(category, mainItem, addonSelections, discountSelections) {
  const lines = [];
  let total = 0;
  let hasVariable = false;

  const resolvedPrice = resolveMainItemPrice(category, mainItem);
  if (resolvedPrice === null) {
    hasVariable = true;
    lines.push(`主要項目：${mainItem.name}（${mainItem.priceNote || '時價'}）`);
  } else {
    total += resolvedPrice;
    const noteSuffix = mainItem.priceFormula ? '（依現行價格自動換算）' : '';
    lines.push(`主要項目：${mainItem.name}　NTD.${resolvedPrice}${noteSuffix}`);
  }

  (category.addonGroups || []).forEach(group => {
    const selectedId = (addonSelections && addonSelections[group.groupId]) || 'none';
    if (selectedId === 'none') return;
    const opt = group.options.find(o => o.id === selectedId);
    if (!opt) return;
    if (opt.price === null) {
      hasVariable = true;
      lines.push(`加購：${opt.name}（${opt.priceNote || '需現場確認'}）`);
    } else if (opt.price !== 0) {
      total += opt.price;
      lines.push(`加購：${opt.name}`);
    }
  });

  const discountIds = discountSelections || [];
  discountIds.forEach(discountId => {
    const d = category.discounts.find(x => x.id === discountId);
    if (!d) return;
    total += d.price;
    lines.push(`優惠：${d.name}　NTD.${d.price}`);
  });

  return { lines: lines, total: total, hasVariable: hasVariable };
}

// ------------------------------------------------------------
// 7. 試算表：客人資料
// ------------------------------------------------------------
function getSpreadsheet() {
  return CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet(name, headers) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    applyDateColumnFormats(sheet, name);
    applyStatusDropdown(sheet, name);
    applyCategoryDropdown(sheet, name);
    applyDepositStatusDropdown(sheet, name);
  }
  return sheet;
}

// 「狀態」欄位（預約紀錄表第12欄）加上下拉選單，避免手動打字打錯字（例如漏打「已」）導致同步失效
function applyStatusDropdown(sheet, sheetName) {
  if (sheetName !== CONFIG.BOOKING_LOG_SHEET_NAME) return;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['正常', '已取消'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 12, 2000, 1).setDataValidation(rule);
}

// 「分類」欄位（第4欄）加上下拉選單，避免手動打字打錯導致「修改時段」「補睫」等功能反查失敗
function applyCategoryDropdown(sheet, sheetName) {
  if (sheetName !== CONFIG.BOOKING_LOG_SHEET_NAME) return;
  const categoryNames = CONFIG.CATEGORIES.map(c => c.name);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(categoryNames, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 4, 2000, 1).setDataValidation(rule);
}

// 「定金狀態」欄位（第9欄）加上下拉選單，只放狀態文字，實際金額另外放「定金金額」欄
function applyDepositStatusDropdown(sheet, sheetName) {
  if (sheetName !== CONFIG.BOOKING_LOG_SHEET_NAME) return;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['待付款', '已付款', '不需要'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 9, 2000, 1).setDataValidation(rule);
}

// 【只需要執行一次】幫已經存在的「預約紀錄」分頁補上狀態欄位下拉選單
function setupStatusDropdown() {
  const sheet = getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID', '反饋表單連結', '反饋狀態', '介紹人電話', '補睫來源事件ID', '定金金額', '同行者電話']);
  applyStatusDropdown(sheet, CONFIG.BOOKING_LOG_SHEET_NAME);
  applyCategoryDropdown(sheet, CONFIG.BOOKING_LOG_SHEET_NAME);
  applyDepositStatusDropdown(sheet, CONFIG.BOOKING_LOG_SHEET_NAME);
  sheet.getRange(1, 20).setValue('定金金額');
  sheet.getRange(1, 21).setValue('同行者電話');
  Logger.log('狀態／分類／定金狀態下拉選單設定完成');
}

// 各分頁裡「日期/時間」欄位對應的儲存格格式（欄位編號為1-indexed）
function getDateColumnFormatsMap() {
  return {
    '客人資料': { 4: 'yyyy-mm-dd' },
    '預約紀錄': { 1: 'yyyy-mm-dd hh:mm', 10: 'yyyy-mm-dd hh:mm' },
    '優惠使用紀錄': { 5: 'yyyy-mm-dd hh:mm', 6: 'yyyy-mm-dd' },
    '營業時段設定': { 1: 'yyyy-mm-dd' },
  };
}

function applyDateColumnFormats(sheet, sheetName) {
  const colFormats = getDateColumnFormatsMap()[sheetName];
  if (!colFormats) return;
  Object.keys(colFormats).forEach(col => {
    sheet.getRange(2, Number(col), 2000, 1).setNumberFormat(colFormats[col]);
  });
}

// 【只需要執行一次】修正舊分頁（先前就已經建立的）的日期欄位格式，
// 讓「只有日期沒有幾點幾分」的欄位補回完整的時間顯示
function fixDateFormats() {
  applyDateColumnFormats(getOrCreateSheet(CONFIG.CUSTOMER_SHEET_NAME, ['電話', '姓名', '生日', '首次來店', '到店次數', '最近服務', '備註', '得知管道', '得知管道備註']), CONFIG.CUSTOMER_SHEET_NAME);
  applyDateColumnFormats(getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID', '反饋表單連結', '反饋狀態', '介紹人電話', '補睫來源事件ID']), CONFIG.BOOKING_LOG_SHEET_NAME);
  applyDateColumnFormats(getOrCreateSheet(CONFIG.DISCOUNT_USAGE_SHEET_NAME, ['電話', '優惠ID', '優惠名稱', '分類', '使用時間', '對應預約日期', '介紹人電話', '日曆事件ID', '狀態']), CONFIG.DISCOUNT_USAGE_SHEET_NAME);
  applyDateColumnFormats(getOrCreateSheet(CONFIG.SCHEDULE_SHEET_NAME, ['日期', '可預約時段(逗號分隔，例如 10:30,13:00,15:30)', '備註']), CONFIG.SCHEDULE_SHEET_NAME);
  Logger.log('日期格式修正完成');
}

function upsertCustomerRecord(formData, serviceLabel, startDate) {
  const headers = ['電話', '姓名', '生日', '首次來店', '到店次數', '最近服務', '備註', '得知管道', '得知管道備註'];
  const sheet = getOrCreateSheet(CONFIG.CUSTOMER_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  const dateStr = Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  for (let i = 1; i < data.length; i++) {
    if (normalizePhoneForLookup(data[i][0]) === normalizePhoneForLookup(formData.phone)) {
      const rowIndex = i + 1;
      if (formData.note) sheet.getRange(rowIndex, 7).setValue(formData.note);
      // 得知管道／得知管道備註（第8、9欄）只在第一次建立時寫入，回頭客不會被覆蓋
      const visitCount = recomputeCustomerSummary(formData.phone);
      return visitCount;
    }
  }

  const source = (formData.referralSource || '').trim();
  const detail = (formData.referralDetail || '').trim();
  sheet.appendRow([
    "'" + formData.phone,
    formData.name,
    formData.birthday || '',
    dateStr,
    0,
    '',
    formData.note || '',
    source,
    detail,
  ]);
  return recomputeCustomerSummary(formData.phone);
}

// 重新計算這位客人的到店次數與最近3筆服務（直接從「預約紀錄」表現算，不用手動加減，永遠準確）
function recomputeCustomerSummary(phone) {
  const targetPhone = normalizePhoneForLookup(phone);
  if (!targetPhone) return 0;

  const custHeaders = ['電話', '姓名', '生日', '首次來店', '到店次數', '最近服務', '備註', '得知管道', '得知管道備註'];
  const custSheet = getOrCreateSheet(CONFIG.CUSTOMER_SHEET_NAME, custHeaders);
  const custData = custSheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < custData.length; i++) {
    if (normalizePhoneForLookup(custData[i][0]) === targetPhone) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) return 0; // 還不是既有客人，略過

  const bookingHeaders = ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID', '反饋表單連結', '反饋狀態', '介紹人電話', '補睫來源事件ID', '定金金額', '同行者電話'];
  const bookingSheet = getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, bookingHeaders);
  const bookingData = bookingSheet.getDataRange().getValues();

  const validBookings = [];
  for (let i = 1; i < bookingData.length; i++) {
    if (normalizePhoneForLookup(bookingData[i][2]) !== targetPhone) continue;
    if (bookingData[i][11] === '已取消') continue;
    const apptDate = parseApptDateTime(bookingData[i][9]);
    if (!apptDate) continue;
    validBookings.push({ date: apptDate, label: `${bookingData[i][3]}/${bookingData[i][4]}` });
  }
  validBookings.sort((a, b) => b.date.getTime() - a.date.getTime());

  const visitCount = validBookings.length;
  const recentLines = validBookings.slice(0, 3).map(b =>
    `${Utilities.formatDate(b.date, Session.getScriptTimeZone(), 'yyyy-MM-dd')} ${b.label}`
  );

  custSheet.getRange(rowIndex, 5).setValue(visitCount);
  custSheet.getRange(rowIndex, 6).setValue(recentLines.join('\n'));
  return visitCount;
}

// 把「得知管道」下拉選項與補充文字（例如介紹人姓名）組成一段文字，給「預約紀錄」表的合併欄位用
function buildReferralText(formData) {
  const source = (formData.referralSource || '').trim();
  const detail = (formData.referralDetail || '').trim();
  if (!source) return '';
  return detail ? `${source}：${detail}` : source;
}

// 查詢這支電話是不是新客（客人資料表裡查不到就算新客），給前端判斷要不要問「得知管道」用
function checkIsNewCustomer(phone) {
  const targetPhone = normalizePhoneForLookup(phone);
  if (!targetPhone) return false;
  const headers = ['電話', '姓名', '生日', '首次來店', '到店次數', '最近服務', '備註', '得知管道', '得知管道備註'];
  const sheet = getOrCreateSheet(CONFIG.CUSTOMER_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (normalizePhoneForLookup(data[i][0]) === targetPhone) return false;
  }
  return true;
}

// 舊客直接帶出姓名／生日，不用每次重填；新客回傳 isNew:true，其餘欄位空白
function lookupCustomerByPhone(phone) {
  const targetPhone = normalizePhoneForLookup(phone);
  if (!targetPhone) return { isNew: true, name: '', birthday: '' };

  const headers = ['電話', '姓名', '生日', '首次來店', '到店次數', '最近服務', '備註', '得知管道', '得知管道備註'];
  const sheet = getOrCreateSheet(CONFIG.CUSTOMER_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (normalizePhoneForLookup(data[i][0]) !== targetPhone) continue;
    const bday = data[i][2];
    let birthdayStr = '';
    if (bday) {
      const bdayDate = bday instanceof Date ? bday : new Date(bday);
      if (!isNaN(bdayDate.getTime())) {
        birthdayStr = Utilities.formatDate(bdayDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    }
    return { isNew: false, name: data[i][1] || '', birthday: birthdayStr };
  }
  return { isNew: true, name: '', birthday: '' };
}

function logBooking(formData, category, mainItem, breakdown, startDate, eventId, isNewCustomer, depositAmount, touchupSourceEventId, referrerPhoneForCredit, companionPhone) {
  const headers = ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID', '反饋表單連結', '反饋狀態', '介紹人電話', '補睫來源事件ID', '定金金額', '同行者電話'];
  const sheet = getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, headers);
  const depositStatus = isNewCustomer ? '待付款' : '不需要';
  const feedbackUrl = ScriptApp.getService().getUrl() + '?page=feedback&id=' + eventId;
  sheet.appendRow([
    new Date(),
    formData.name,
    "'" + formData.phone,
    category.name,
    mainItem.name,
    breakdown.lines.join(' / '),
    breakdown.hasVariable ? breakdown.total + '(含現場確認項目)' : breakdown.total,
    isNewCustomer ? '新客' : '舊客',
    depositStatus,
    new Date(startDate),
    0,
    '正常',
    formData.note || '',
    buildReferralText(formData),
    eventId,
    feedbackUrl,
    '未評價',
    referrerPhoneForCredit ? "'" + normalizePhoneForLookup(referrerPhoneForCredit) : '',
    touchupSourceEventId || '',
    isNewCustomer ? depositAmount : '',
    companionPhone ? "'" + normalizePhoneForLookup(companionPhone) : '',
  ]);
  formatDateTimeColumns(sheet, sheet.getLastRow());
}

// 統一設定「建立時間」「預約日期時段」欄位的顯示格式，避免試算表自動格式化只顯示日期、看不到時間
function formatDateTimeColumns(sheet, row) {
  sheet.getRange(row, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss'); // 建立時間
  sheet.getRange(row, 10).setNumberFormat('yyyy-mm-dd hh:mm');   // 預約日期時段
}

// 送出預約成功後，把有使用到的優惠寫進「優惠使用紀錄」，供之後判斷是否用過
function recordDiscountUsages(phone, discountIds, category, apptDate, referrerPhone, eventId) {
  if (!discountIds || !discountIds.length) return;
  const headers = ['電話', '優惠ID', '優惠名稱', '分類', '使用時間', '對應預約日期', '介紹人電話', '日曆事件ID', '狀態'];
  const sheet = getOrCreateSheet(CONFIG.DISCOUNT_USAGE_SHEET_NAME, headers);
  const apptDateStr = Utilities.formatDate(apptDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  discountIds.forEach(discountId => {
    const d = category.discounts.find(x => x.id === discountId);
    if (!d) return;
    sheet.appendRow([
      "'" + normalizePhoneForLookup(phone),
      discountId,
      d.name,
      category.name,
      new Date(),
      apptDateStr,
      d.requiresReferrerPhone ? ("'" + normalizePhoneForLookup(referrerPhone || '')) : '',
      eventId,
      '正常',
    ]);
  });
}

// ------------------------------------------------------------
// 8. 客人自助取消預約
// ------------------------------------------------------------

// 依電話查詢這支電話「未來、尚未取消」的預約清單
function getMyUpcomingBookings(phone) {
  const targetPhone = normalizePhoneForLookup(phone);
  if (!targetPhone) return [];

  const headers = ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID'];
  const sheet = getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const rowPhone = normalizePhoneForLookup(row[2]);
    const status = row[11];
    const apptRaw = row[9];
    const modifyCount = Number(row[10]) || 0;
    if (rowPhone !== targetPhone) continue;
    if (status === '已取消') continue;

    const apptDate = parseApptDateTime(apptRaw);
    if (!apptDate || isNaN(apptDate.getTime()) || apptDate < now) continue;

    const daysUntil = (apptDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    results.push({
      rowIndex: i + 1,
      eventId: row[14],
      name: row[1],
      category: row[3],
      mainItem: row[4],
      apptStr: Utilities.formatDate(apptDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
      modifyCount: modifyCount,
      canModify: modifyCount < CONFIG.MAX_MODIFY_COUNT,
      withinMinDays: daysUntil < CONFIG.CANCEL_MODIFY_MIN_DAYS,
    });
  }
  return results;
}

// 客人確認取消：核對電話一致後，刪除日曆事件、更新試算表狀態
function cancelBookingByCustomer(eventId, phone) {
  const targetPhone = normalizePhoneForLookup(phone);
  const headers = ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID'];
  const sheet = getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) === String(eventId)) {
      if (normalizePhoneForLookup(data[i][2]) !== targetPhone) {
        return { success: false, message: '電話號碼不符，無法取消這筆預約。' };
      }
      if (data[i][11] === '已取消') {
        return { success: false, message: '這筆預約已經是取消狀態了。' };
      }

      const apptDate = parseApptDateTime(data[i][9]);
      const daysUntil = apptDate ? (apptDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24) : null;
      if (daysUntil !== null && daysUntil < CONFIG.CANCEL_MODIFY_MIN_DAYS) {
        return {
          success: false,
          message: `依規定取消需提前${CONFIG.CANCEL_MODIFY_MIN_DAYS}天告知，這筆預約已經不足${CONFIG.CANCEL_MODIFY_MIN_DAYS}天，無法線上自動取消。請直接透過官方LINE聯繫店家處理，依規定可能需支付相關費用。`,
        };
      }

      try {
        const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
        const event = calendar.getEventById(eventId);
        if (event) event.deleteEvent();
      } catch (err) {
        // 日曆事件可能已經被刪過，忽略錯誤繼續更新試算表狀態
      }

      sheet.getRange(i + 1, 12).setValue('已取消'); // 狀態欄
      sheet.getRange(i + 1, 13).setValue(
        (data[i][12] ? data[i][12] + '；' : '') + '客人於 ' +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + ' 自行取消'
      ); // 備註欄

      // 同步重新計算「客人資料」表的到店次數與最近服務，避免被取消的預約還算在次數裡
      const serviceLabel = `${data[i][3]}/${data[i][4]}`;
      recomputeCustomerSummary(data[i][2]);
      markDiscountUsageStatus(eventId, '已取消');
      updateCustomerCouponSummary(data[i][2]);

      return {
        success: true,
        message: `預約已成功取消。若已付定金，依規定可保留${CONFIG.DEPOSIT_HOLD_DAYS}日內使用於下次預約，請於期限內透過官方LINE聯繫店家。`,
      };
    }
  }
  return { success: false, message: '找不到這筆預約，可能已經被取消或資料有誤。' };
}

// 取消預約時，把該筆計入的到店次數扣回、並從服務歷史中移除對應那一筆
// 預約日期變動時，同步更新客人資料的最近服務、優惠使用紀錄裡對應的日期
// oldDateStr 可為 null（不知道舊日期時，客人資料那邊改用重新整算，優惠使用紀錄仍會更新）
function syncRelatedDatesForEvent(eventId, phone, categoryName, mainItemName, oldDateStr, newDateStr) {
  if (oldDateStr && newDateStr && oldDateStr !== newDateStr) {
    recomputeCustomerSummary(phone);
  }

  const headers = ['電話', '優惠ID', '優惠名稱', '分類', '使用時間', '對應預約日期', '介紹人電話', '日曆事件ID', '狀態'];
  const sheet = getOrCreateSheet(CONFIG.DISCOUNT_USAGE_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7]) === String(eventId)) {
      sheet.getRange(i + 1, 6).setValue(newDateStr);
    }
  }
}

// 依日曆事件ID，把「優惠使用紀錄」裡對應的列標成指定狀態（取消預約時優惠一起作廢，復原時一起恢復）
function markDiscountUsageStatus(eventId, status) {
  if (!eventId) return;
  const headers = ['電話', '優惠ID', '優惠名稱', '分類', '使用時間', '對應預約日期', '介紹人電話', '日曆事件ID', '狀態'];
  const sheet = getOrCreateSheet(CONFIG.DISCOUNT_USAGE_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7]) === String(eventId)) {
      sheet.getRange(i + 1, 9).setValue(status);
    }
  }
}

// 依日曆事件ID，把「優惠使用紀錄」裡對應的列的日曆事件ID改成新的（復原預約時，日曆事件會用新ID重建）
function updateDiscountUsageEventId(oldEventId, newEventId) {
  if (!oldEventId || !newEventId) return;
  const headers = ['電話', '優惠ID', '優惠名稱', '分類', '使用時間', '對應預約日期', '介紹人電話', '日曆事件ID', '狀態'];
  const sheet = getOrCreateSheet(CONFIG.DISCOUNT_USAGE_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][7]) === String(oldEventId)) {
      sheet.getRange(i + 1, 8).setValue(newEventId);
    }
  }
}

// 更新「客人資料」表裡這位客人的「可用優惠券數／明細」欄位（第11、12欄），異動當下就更新，不用等刷新
function updateCustomerCouponSummary(phone) {
  try {
    const targetPhone = normalizePhoneForLookup(phone);
    if (!targetPhone) return;

    const custHeaders = ['電話', '姓名', '生日', '首次來店', '到店次數', '最近服務', '備註', '得知管道', '得知管道備註'];
    const custSheet = getOrCreateSheet(CONFIG.CUSTOMER_SHEET_NAME, custHeaders);
    const custData = custSheet.getDataRange().getValues();

    let rowIndex = -1;
    for (let i = 1; i < custData.length; i++) {
      if (normalizePhoneForLookup(custData[i][0]) === targetPhone) { rowIndex = i + 1; break; }
    }
    if (rowIndex === -1) return; // 還不是客人資料表裡的既有客人，略過

    const coupons = getMyCoupons(phone);
    const detail = [];
    coupons.categories.forEach(cat => {
      cat.items.forEach(item => detail.push(`${cat.name}-${item.name}：${item.status}`));
    });

    custSheet.getRange(1, 11).setValue('可用優惠券數');
    custSheet.getRange(1, 12).setValue('可用優惠明細');
    custSheet.getRange(rowIndex, 11).setValue(coupons.totalCount);
    custSheet.getRange(rowIndex, 12).setValue(detail.join('; '));
  } catch (err) {
    // 優惠券摘要更新失敗不影響主要流程，安靜略過
  }
}

// 復原預約：重新建立日曆事件（原本的已經被刪除，救不回來，只能新建一個）、
// 把到店次數與最近服務重新整算、優惠使用紀錄恢復成已使用，三邊資料重新對齊
function restoreBooking(sheet, row, rowData) {
  const oldEventId = rowData[14];
  const phone = rowData[2];
  const categoryName = rowData[3];
  const mainItemName = rowData[4];
  const apptDate = parseApptDateTime(rowData[9]);
  if (!apptDate) return;

  const found = findMainItemByLabel(categoryName, mainItemName);
  const duration = found ? found.item.duration : 60;
  const newEnd = new Date(apptDate.getTime() + duration * 60000);

  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  const newEvent = calendar.createEvent(`${rowData[1]} - ${categoryName}/${mainItemName}`, apptDate, newEnd, {
    description: `電話：${phone}\n（此筆預約曾被取消後又復原，日曆事件為系統重新建立）`,
  });
  const newEventId = newEvent.getId();

  sheet.getRange(row, 15).setValue(newEventId); // 日曆事件ID欄
  sheet.getRange(row, 13).setValue(
    (rowData[12] ? rowData[12] + '；' : '') + '狀態復原為正常，日曆事件已重新建立（原ID：' + oldEventId + '）'
  ); // 備註欄

  recomputeCustomerSummary(phone);
  markDiscountUsageStatus(oldEventId, '正常');
  updateDiscountUsageEventId(oldEventId, newEventId);
  updateCustomerCouponSummary(phone);
}

// 【只需要執行一次】把既有的「客人資料」表從舊欄位結構搬到新的：
// 刪除「服務歷史」欄（改用「最近服務」保留最近3筆即可，完整紀錄查「預約紀錄」表就好）
// 新增「得知管道備註」欄（把原本混在「得知管道」裡的補充文字分開存，方便下拉篩選統計）
function migrateCustomerSheetColumns() {
  const sheet = getSpreadsheet().getSheetByName(CONFIG.CUSTOMER_SHEET_NAME);
  if (!sheet) { Logger.log('客人資料表不存在，略過遷移'); return; }

  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const historyColIndex = headerRow.indexOf('服務歷史'); // 0-indexed
  if (historyColIndex !== -1) {
    sheet.deleteColumn(historyColIndex + 1); // 1-indexed
    Logger.log('已刪除「服務歷史」欄位');
  } else {
    Logger.log('找不到「服務歷史」欄位，可能已經遷移過了');
  }

  const headerRow2 = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const referralColIndex = headerRow2.indexOf('得知管道'); // 0-indexed
  const hasDetailCol = headerRow2.indexOf('得知管道備註') !== -1;
  if (referralColIndex !== -1 && !hasDetailCol) {
    sheet.insertColumnAfter(referralColIndex + 1);
    sheet.getRange(1, referralColIndex + 2).setValue('得知管道備註');
    Logger.log('已新增「得知管道備註」欄位');
  } else if (hasDetailCol) {
    Logger.log('「得知管道備註」欄位已經存在，略過');
  }

  Logger.log('遷移完成，接下來執行 setupCouponSummaryForAllCustomers 可以順便把所有既有客人的「最近服務」重新整算成最新格式');
}

// 【只需要執行一次】幫所有既有客人補上「可用優惠券數／明細」欄位的初始值
function setupCouponSummaryForAllCustomers() {
  const custHeaders = ['電話', '姓名', '生日', '首次來店', '到店次數', '最近服務', '備註', '得知管道', '得知管道備註'];
  const custSheet = getOrCreateSheet(CONFIG.CUSTOMER_SHEET_NAME, custHeaders);
  const custData = custSheet.getDataRange().getValues();
  for (let i = 1; i < custData.length; i++) {
    if (custData[i][0]) {
      recomputeCustomerSummary(custData[i][0]);
      updateCustomerCouponSummary(custData[i][0]);
    }
  }
  Logger.log('已為 ' + (custData.length - 1) + ' 位客人更新最近服務與優惠券摘要欄位');
}

function normalizePhoneForLookup(raw) {
  if (!raw) return '';
  return String(raw).replace(/[\s\-()]/g, '').trim();
}

// ------------------------------------------------------------
// 優惠可用性檢查（給前端灰掉已用過的選項、後端送出前再驗證一次）
// 回傳：{ discountId: { available: bool, name, reason }, ... }
// ------------------------------------------------------------
function getDiscountAvailability(phone, categoryId, mainItemId) {
  const category = CONFIG.CATEGORIES.find(c => c.id === categoryId);
  const result = {};
  if (!category) return result;

  const targetPhone = normalizePhoneForLookup(phone);
  const headers = ['電話', '優惠ID', '優惠名稱', '分類', '使用時間', '對應預約日期', '介紹人電話', '日曆事件ID', '狀態'];
  const sheet = getOrCreateSheet(CONFIG.DISCOUNT_USAGE_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  category.discounts.forEach(d => {
    // 限定特定主要項目才能選的優惠（例如續做霧眉優惠），不符合資格的項目直接擋掉
    if (d.restrictedToMainItems && mainItemId && d.restrictedToMainItems.indexOf(mainItemId) === -1) {
      result[d.id] = { available: false, name: d.name, reason: '此項目不適用' };
      return;
    }

    if (d.requiresReferrerPhone || d.requiresCompanionPhone) {
      result[d.id] = { available: true, name: d.name };
      return;
    }

    if (!targetPhone) {
      result[d.id] = { available: true, name: d.name };
      return;
    }

    // 找出這支電話用過這個優惠的最後一次紀錄（已取消的預約連帶的優惠使用不算數）
    let lastUsed = null;
    for (let i = 1; i < data.length; i++) {
      if (normalizePhoneForLookup(data[i][0]) !== targetPhone) continue;
      if (data[i][1] !== d.id) continue;
      if (data[i][8] === '已取消') continue;
      const usedAt = data[i][4] instanceof Date ? data[i][4] : new Date(data[i][4]);
      if (!lastUsed || usedAt > lastUsed) lastUsed = usedAt;
    }

    if (!lastUsed) {
      result[d.id] = { available: true, name: d.name };
      return;
    }

    if (d.id === CONFIG.BIRTHDAY_DISCOUNT_ID) {
      const daysSinceUsed = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
      result[d.id] = daysSinceUsed >= CONFIG.BIRTHDAY_RESET_DAYS
        ? { available: true, name: d.name }
        : { available: false, name: d.name, reason: '已使用過（每年可再用一次）' };
      return;
    }

    result[d.id] = { available: false, name: d.name, reason: '已使用過' };
  });

  return result;
}

// ------------------------------------------------------------
// 客人查詢自己可用的優惠券（分類條列，已使用過的不顯示，並計算總張數）
// 回傳：{ totalCount, categories: [{ name, items: [{ name, status }] }] }
// ------------------------------------------------------------
function getMyCoupons(phone) {
  const targetPhone = normalizePhoneForLookup(phone);
  if (!targetPhone) return { totalCount: 0, categories: [] };

  // 客人的生日月份
  const custHeaders = ['電話', '姓名', '生日', '首次來店', '到店次數', '最近服務', '備註', '得知管道', '得知管道備註'];
  const custSheet = getOrCreateSheet(CONFIG.CUSTOMER_SHEET_NAME, custHeaders);
  const custData = custSheet.getDataRange().getValues();
  let birthMonth = null;
  for (let i = 1; i < custData.length; i++) {
    if (normalizePhoneForLookup(custData[i][0]) !== targetPhone) continue;
    const bday = custData[i][2];
    if (bday) {
      const bdayDate = bday instanceof Date ? bday : new Date(bday);
      if (!isNaN(bdayDate.getTime())) birthMonth = bdayDate.getMonth() + 1;
    }
    break;
  }

  // 介紹人優惠券：查「預約紀錄」裡介紹人電話是自己、且未取消、未過期的紀錄，依分類分開計算
  const bookingHeaders = ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID', '反饋表單連結', '反饋狀態', '介紹人電話', '補睫來源事件ID'];
  const bookingSheet = getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, bookingHeaders);
  const bookingData = bookingSheet.getDataRange().getValues();
  const now = new Date();
  const referralByCategory = {}; // { 分類名稱: { count, nearestExpiry } }

  for (let i = 1; i < bookingData.length; i++) {
    if (normalizePhoneForLookup(bookingData[i][17]) !== targetPhone) continue;
    if (bookingData[i][11] === '已取消') continue;

    const apptDate = parseApptDateTime(bookingData[i][9]);
    if (!apptDate) continue;
    const expiry = new Date(apptDate);
    expiry.setMonth(expiry.getMonth() + CONFIG.REFERRAL_CREDIT_VALID_MONTHS);
    if (expiry < now) continue;

    const catName = bookingData[i][3];
    if (!referralByCategory[catName]) referralByCategory[catName] = { count: 0, nearestExpiry: null };
    referralByCategory[catName].count++;
    if (!referralByCategory[catName].nearestExpiry || expiry < referralByCategory[catName].nearestExpiry) {
      referralByCategory[catName].nearestExpiry = expiry;
    }
  }

  let totalCount = 0;
  const categories = [];

  CONFIG.CATEGORIES.forEach(cat => {
    const availability = getDiscountAvailability(phone, cat.id);
    const items = [];

    cat.discounts.forEach(d => {
      if (d.restrictedToMainItems) return; // 限定特定項目才能用的優惠（例如續做霧眉優惠），不算一般優惠券，不顯示
      if (d.id === CONFIG.BIRTHDAY_DISCOUNT_ID) {
        const a = availability[d.id];
        if (a && a.available && birthMonth) {
          items.push({ name: '當月壽星優惠', status: `${birthMonth}月份可使用` });
          totalCount++;
        }
        return;
      }
      if (d.requiresReferrerPhone) {
        const credit = referralByCategory[cat.name];
        if (credit && credit.count > 0) {
          items.push({
            name: d.name,
            status: `目前有 ${credit.count} 張，最近到期日 ${Utilities.formatDate(credit.nearestExpiry, Session.getScriptTimeZone(), 'yyyy-MM-dd')}`,
          });
          totalCount += credit.count;
        }
        // 沒有券的時候整條不顯示，不留「目前沒有」這種提示文字
        return;
      }
      const a = availability[d.id];
      if (a && a.available) {
        items.push({ name: d.name, status: '可使用' });
        totalCount++;
      }
    });

    if (items.length) categories.push({ name: cat.name, items: items });
  });

  return { totalCount: totalCount, categories: categories };
}

// ------------------------------------------------------------
// 店家查壽星：改用「客人資料」表裡的「生日月份」欄位（公式即時聯動），
// 不用另外維護一個表格，也不會有忘記刷新的問題。
// 【只需要執行一次】幫已經存在的「客人資料」分頁補上這一欄
// ------------------------------------------------------------
function setupBirthdayMonthColumn() {
  const headers = ['電話', '姓名', '生日', '首次來店', '到店次數', '最近服務', '備註', '得知管道', '得知管道備註'];
  const sheet = getOrCreateSheet(CONFIG.CUSTOMER_SHEET_NAME, headers);

  // 第10欄放「生日月份」，用公式直接參照第3欄（生日），生日一改這欄就跟著變
  sheet.getRange(1, 10).setValue('生日月份');
  const lastRow = Math.max(sheet.getLastRow(), 2);
  for (let row = 2; row <= 2000; row++) {
    sheet.getRange(row, 10).setFormula(`=IF(C${row}="","",MONTH(C${row}))`);
  }

  Logger.log('生日月份欄位設定完成，之後可以直接對「生日月份」欄位表頭使用篩選功能查詢特定月份的壽星。');
}

// 「預約日期時段」欄位可能被試算表自動存成 Date 物件，也可能是純文字，這裡統一轉成 Date
function parseApptDateTime(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return raw;
  const parsed = new Date(String(raw).trim().replace(' ', 'T'));
  return isNaN(parsed.getTime()) ? null : parsed;
}

// ------------------------------------------------------------
// 9. 客人自助修改預約時段（只改日期／時段，服務項目不變）
// ------------------------------------------------------------

// 用「分類名稱＋主要項目名稱」反查 CONFIG 裡對應的項目設定（找時長用）
function findMainItemByLabel(categoryName, mainItemName) {
  for (const cat of CONFIG.CATEGORIES) {
    if (cat.name !== categoryName) continue;
    const item = cat.mainItems.find(m => m.name === mainItemName);
    if (item) return { category: cat, item: item };
  }
  return null;
}

// 給修改預約頁面用：查詢某天可選時段時，要把「自己原本那筆」排除，
// 否則自己原本佔用的時段會被系統誤判成「已被別人預約」
function getAvailableSlotsForModify(dateStr, categoryName, mainItemName, excludeEventId) {
  const found = findMainItemByLabel(categoryName, mainItemName);
  if (!found) return { status: 'unset', times: [] };
  return getAvailableSlots(dateStr, found.item.id, excludeEventId);
}

function modifyBookingByCustomer(eventId, phone, newDate, newTime) {
  const targetPhone = normalizePhoneForLookup(phone);
  const headers = ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID'];
  const sheet = getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) !== String(eventId)) continue;

    if (normalizePhoneForLookup(data[i][2]) !== targetPhone) {
      return { success: false, message: '電話號碼不符，無法修改這筆預約。' };
    }
    if (data[i][11] === '已取消') {
      return { success: false, message: '這筆預約已經取消，無法修改，請重新預約。' };
    }

    const modifyCount = Number(data[i][10]) || 0;
    if (modifyCount >= CONFIG.MAX_MODIFY_COUNT) {
      return {
        success: false,
        message: `依規定改期僅限${CONFIG.MAX_MODIFY_COUNT}次，這筆預約已經使用過改期，如需再次調整請直接透過官方LINE聯繫店家。`,
      };
    }

    const oldApptStrRaw = data[i][9];
    const oldApptDate = parseApptDateTime(oldApptStrRaw);
    const daysUntil = oldApptDate ? (oldApptDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24) : null;
    if (daysUntil !== null && daysUntil < CONFIG.CANCEL_MODIFY_MIN_DAYS) {
      return {
        success: false,
        message: `依規定改期需提前${CONFIG.CANCEL_MODIFY_MIN_DAYS}天告知，這筆預約已經不足${CONFIG.CANCEL_MODIFY_MIN_DAYS}天，無法線上自動改期。請直接透過官方LINE聯繫店家處理，依規定可能需支付相關費用。`,
      };
    }

    const categoryName = data[i][3];
    const mainItemName = data[i][4];
    const found = findMainItemByLabel(categoryName, mainItemName);
    if (!found) {
      return { success: false, message: '找不到對應的服務項目設定，請透過官方LINE聯繫店家協助修改。' };
    }
    const duration = found.item.duration;

    const parts = String(newTime).split(':').map(Number);
    const newStart = new Date(newDate + 'T00:00:00');
    newStart.setHours(parts[0], parts[1] || 0, 0, 0);
    const newEnd = new Date(newStart.getTime() + duration * 60000);

    if (isTomorrow(newStart)) {
      return { success: false, message: '明天不開放線上改期，如需調整請直接聯繫店家。' };
    }

    const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
    const dayStart = new Date(newStart); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(newStart); dayEnd.setHours(23, 59, 59, 999);
    const events = calendar.getEvents(dayStart, dayEnd).filter(ev => ev.getId() !== eventId);
    if (!isSlotFree(newStart, newEnd, events)) {
      return { success: false, message: '很抱歉，這個新時段剛剛被別人預約走了，請重新選擇。' };
    }

    try {
      const event = calendar.getEventById(eventId);
      if (event) {
        event.setTime(newStart, newEnd);
      } else {
        calendar.createEvent(`${data[i][1]} - ${categoryName}/${mainItemName}`, newStart, newEnd);
      }
    } catch (err) {
      return { success: false, message: '更新日曆時發生錯誤：' + err.message };
    }

    const newApptStr = Utilities.formatDate(newStart, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    sheet.getRange(i + 1, 10).setValue(newApptStr).setNumberFormat('yyyy-mm-dd hh:mm'); // 預約日期時段欄
    sheet.getRange(i + 1, 11).setValue(modifyCount + 1); // 改期次數欄
    sheet.getRange(i + 1, 13).setValue(
      (data[i][12] ? data[i][12] + '；' : '') + '客人於 ' +
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
      ' 自行改期（原：' + oldApptStrRaw + '）'
    ); // 備註欄

    // 試算表日期欄已經更新，這時候再重新整算客人資料的最近服務，才會讀到最新日期
    recomputeCustomerSummary(data[i][2]);

    return {
      success: true,
      message: `預約時段已成功修改。依規定改期僅限${CONFIG.MAX_MODIFY_COUNT}次，這筆已使用過，如需再調整請聯繫店家。`,
      newApptStr: newApptStr,
    };
  }
  return { success: false, message: '找不到這筆預約，可能已經被取消或資料有誤。' };
}

// 把客人服務歷史裡舊日期的那筆，換成修改後的新日期
// ------------------------------------------------------------
// 10. 補睫預約（限定完成日式嫁接後 7~25 天內的紀錄可發起）
// ------------------------------------------------------------

// 查詢這支電話有哪些日式嫁接紀錄，目前落在可補睫的天數範圍內
// 算兩個時間點之間差幾個「日曆天」（只看年月日，忽略時分秒），符合「隔天算1天」的直覺
function calendarDaysBetween(fromDate, toDate) {
  const a = new Date(fromDate); a.setHours(0, 0, 0, 0);
  const b = new Date(toDate); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function getTouchupEligibleBookings(phone) {
  const targetPhone = normalizePhoneForLookup(phone);
  if (!targetPhone) return [];

  const headers = ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID', '反饋表單連結', '反饋狀態', '介紹人電話', '補睫來源事件ID'];
  const sheet = getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();
  const now = new Date();

  const eyelash = CONFIG.CATEGORIES.find(c => c.id === 'eyelash');
  const eligibleMainItemNames = eyelash.mainItems
    .filter(m => /日式單根嫁接/.test(m.name))
    .map(m => m.name);

  const results = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (normalizePhoneForLookup(row[2]) !== targetPhone) continue;
    if (row[11] === '已取消') continue;
    if (eligibleMainItemNames.indexOf(row[4]) === -1) continue;

    const apptDate = parseApptDateTime(row[9]);
    if (!apptDate) continue;
    const daysSince = calendarDaysBetween(apptDate, now);
    if (daysSince < CONFIG.TOUCHUP_MIN_DAYS_SINCE || daysSince > CONFIG.TOUCHUP_MAX_DAYS_SINCE) continue;

    const tierId = daysSince <= CONFIG.TOUCHUP_TIER_2W_MAX_DAYS ? 'lash_refill_2w' : 'lash_refill_3w';
    const tierItem = eyelash.mainItems.find(m => m.id === tierId);

    const amountMatch = String(row[6]).match(/\d+/);
    const originalAmount = amountMatch ? Number(amountMatch[0]) : 0;

    results.push({
      eventId: row[14],
      name: row[1],
      mainItem: row[4],
      apptStr: Utilities.formatDate(apptDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      daysSince: Math.floor(daysSince),
      tierId: tierId,
      tierName: tierItem.name,
      discountRate: tierItem.discountRate,
      originalAmount: originalAmount,
    });
  }
  return results;
}

// 送出補睫預約：金額 = 原消費金額 × 折扣（5折/8折） + 這次新加購的原價
function submitTouchupBooking(formData) {
  const lock = LockService.getScriptLock();
  const gotLock = lock.tryLock(10000);
  if (!gotLock) return { success: false, message: '系統忙碌中，請稍後再試一次。' };

  try {
    if (!formData.noticeAgreed) return { success: false, message: '請先閱讀並勾選同意術前注意事項' };
    if (!formData.name || !formData.phone) return { success: false, message: '姓名與電話為必填' };

    const category = CONFIG.CATEGORIES.find(c => c.id === 'eyelash');
    const mainItem = category.mainItems.find(m => m.id === formData.tierId);
    if (!mainItem || !mainItem.refillOnly) return { success: false, message: '補睫項目錯誤' };

    // 重新驗證這筆原始預約真的符合資格（防止竄改網址或參數）
    const eligible = getTouchupEligibleBookings(formData.phone)
      .find(b => String(b.eventId) === String(formData.originalEventId) && b.tierId === formData.tierId);
    if (!eligible) {
      return { success: false, message: '找不到符合資格的原始預約紀錄，可能已經超過補睫期限，請重新查詢或聯繫店家。' };
    }

    const [h, m] = formData.time.split(':').map(Number);
    const start = new Date(formData.date + 'T00:00:00');
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + mainItem.duration * 60000);

    if (isTomorrow(start)) {
      return { success: false, message: '明天不開放線上預約，如需預約請直接聯繫店家。' };
    }

    const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
    const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start); dayEnd.setHours(23, 59, 59, 999);
    const events = calendar.getEvents(dayStart, dayEnd);
    if (!isSlotFree(start, end, events)) {
      return { success: false, message: '很抱歉，這個時段剛剛被別人預約走了，請重新選擇時段。' };
    }

    const rateLabel = mainItem.discountRate === 0.5 ? '5折' : '8折';
    const baseAmount = Math.round(eligible.originalAmount * mainItem.discountRate);
    const lines = [`補睫基礎金額（原消費 NTD.${eligible.originalAmount} × ${rateLabel}）　NTD.${baseAmount}`];
    let total = baseAmount;

    (category.addonGroups || []).forEach(group => {
      if (group.groupId === 'refill') return; // 補睫流程本身就是卸睫續接，不用再問一次
      const selectedId = (formData.addonSelections && formData.addonSelections[group.groupId]) || 'none';
      if (selectedId === 'none') return;
      const opt = group.options.find(o => o.id === selectedId);
      if (!opt) return;
      if (opt.price === null) {
        lines.push(`加購：${opt.name}（${opt.priceNote || '需現場確認'}）`);
      } else if (opt.price !== 0) {
        total += opt.price;
        lines.push(`加購：${opt.name}（原價）　NTD.${opt.price}`);
      }
    });

    const serviceLabel = `${category.name}/${mainItem.name}`;

    const event = calendar.createEvent(
      `${formData.name} - ${category.name}/${mainItem.name}（補睫）`,
      start,
      end,
      {
        description:
          `電話：${formData.phone}\n` +
          `補睫項目：${mainItem.name}\n` +
          `原預約日期：${eligible.apptStr}（原項目：${eligible.mainItem}）\n` +
          `明細：\n${lines.join('\n')}\n` +
          `預估金額：NTD.${total}（依上次消費金額折算，實際以現場結算為主）\n` +
          `備註：${formData.note || ''}`,
      }
    );

    const breakdown = { lines: lines, total: total, hasVariable: true };
    // 先把這筆補睫預約寫進「預約紀錄」表，再重新整算到店次數，這樣次數才會正確算入這一筆
    logBooking(formData, category, mainItem, breakdown, start, event.getId(), false, 0, formData.originalEventId, '', '');
    const visitCount = upsertCustomerRecord(formData, serviceLabel, start);

    return { success: true, message: '補睫預約成功！', visitCount: visitCount, total: total };
  } catch (err) {
    return { success: false, message: '系統錯誤：' + err.message };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------
// 11. 試算表 → 日曆 聯動（手動改「預約紀錄」表，日曆自動跟著更新）
// ------------------------------------------------------------

// 【只需要執行一次】在 Apps Script 編輯器選這個函式、點執行，
// 就會建立好監看試算表編輯動作的觸發器，之後不用再手動處理。
// 【只需要執行一次】一次把「試算表→日曆」「日曆→試算表」兩個觸發器都建立好
function setupAllSyncTriggers() {
  createEditTrigger();
  createCalendarSyncTrigger();
  Logger.log('雙向同步觸發器都建立完成。');
}

function createEditTrigger() {
  // 避免重複建立同一個觸發器
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'onSheetEdit') ScriptApp.deleteTrigger(t);
  });

  const ss = getSpreadsheet();
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  Logger.log('觸發器建立完成，之後手動編輯「預約紀錄」表的日期或狀態欄位，日曆會自動同步。');
}

// 試算表被編輯時自動執行（由上面 createEditTrigger 建立的觸發器呼叫，不要自己手動執行這個函式）
function onSheetEdit(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.BOOKING_LOG_SHEET_NAME) return;

    const row = e.range.getRow();
    if (row === 1) return; // 表頭列不處理

    const col = e.range.getColumn();
    // 1-indexed 欄位對照：10=預約日期時段，12=狀態
    if (col !== 10 && col !== 12) return;

    const rowData = sheet.getRange(row, 1, 1, 21).getValues()[0];
    const eventId = rowData[14]; // 日曆事件ID
    if (!eventId) return;

    if (col === 12) {
      const newStatus = rowData[11];
      const oldStatus = e.oldValue || '';

      if (newStatus === '已取消' && oldStatus !== '已取消') {
        // 狀態改成「已取消」→ 刪除日曆事件、扣回到店次數、優惠使用紀錄一起作廢
        try {
          const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
          const event = calendar.getEventById(eventId);
          if (event) event.deleteEvent();
        } catch (err) {
          // 日曆事件可能已經不存在，忽略錯誤繼續處理其他部分
        }
        recomputeCustomerSummary(rowData[2]);
        markDiscountUsageStatus(eventId, '已取消');
        updateCustomerCouponSummary(rowData[2]);
        return;
      }

      if (newStatus === '正常' && oldStatus === '已取消') {
        // 狀態改回「正常」→ 復原：重新建立日曆事件、加回到店次數、優惠使用紀錄一起恢復
        restoreBooking(sheet, row, rowData);
        return;
      }
      return;
    }

    if (col === 10) {
      const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
      const event = calendar.getEventById(eventId);
      if (!event) return; // 已取消狀態下沒有日曆事件可以改時間，直接跳過

      // 預約日期時段被改 → 自動更新日曆事件的時間
      const apptDate = parseApptDateTime(rowData[9]);
      if (!apptDate) return; // 格式看不懂就跳過，不硬套錯誤時間

      const categoryName = rowData[3];
      const mainItemName = rowData[4];
      const found = findMainItemByLabel(categoryName, mainItemName);
      const duration = found ? found.item.duration : 60; // 找不到對應項目時，預設用 60 分鐘
      const newEnd = new Date(apptDate.getTime() + duration * 60000);
      event.setTime(apptDate, newEnd);
      e.range.setNumberFormat('yyyy-mm-dd hh:mm');

      // 同步更新客人資料的服務歷史、優惠使用紀錄的對應日期
      const newDateStr = Utilities.formatDate(apptDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      let oldDateStr = null;
      if (e.oldValue) {
        const oldApptDate = parseApptDateTime(e.oldValue);
        if (oldApptDate) oldDateStr = Utilities.formatDate(oldApptDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
      syncRelatedDatesForEvent(eventId, rowData[2], categoryName, mainItemName, oldDateStr, newDateStr);
    }
  } catch (err) {
    // 安靜失敗，不要讓您編輯試算表時跳出干擾用的錯誤訊息
  }
}

// ------------------------------------------------------------
// 12. 日曆 → 試算表 聯動（需要先在 Apps Script 啟用「進階 Google 日曆服務」）
// ------------------------------------------------------------

// 【只需要執行一次】建立監看日曆變動的觸發器
function createCalendarSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'onCalendarUpdated') ScriptApp.deleteTrigger(t);
  });

  // 'primary' 是 Apps Script 內部的代稱，forUserCalendar 需要真正的日曆 ID（通常是 Email），
  // 先透過 CalendarApp 把它解析成實際 ID，否則會被 Google 伺服器拒絕、跳出籠統的錯誤訊息
  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (!calendar) {
    throw new Error('找不到 CONFIG.CALENDAR_ID 指定的日曆，請確認設定是否正確');
  }
  const realCalendarId = calendar.getId();

  ScriptApp.newTrigger('onCalendarUpdated')
    .forUserCalendar(realCalendarId)
    .onEventUpdated()
    .create();

  Logger.log('日曆監看觸發器建立完成（日曆ID：' + realCalendarId + '）。之後手動改日曆事件的時間或刪除事件，試算表會自動同步。');
}

// 日曆有變動時自動執行。因為日曆本身不會告訴我們「哪一筆事件變了」，
// 用 sync token 的方式跟 Google 要「上次同步之後有哪些事件變動過」的清單
function onCalendarUpdated(e) {
  try {
    const calendarId = (e && e.calendarId) || CalendarApp.getCalendarById(CONFIG.CALENDAR_ID).getId();
    const props = PropertiesService.getScriptProperties();
    const tokenKey = 'CAL_SYNC_TOKEN_' + calendarId;
    let syncToken = props.getProperty(tokenKey);

    let pageToken = null;
    let response;

    do {
      const options = { maxResults: 50 };
      if (pageToken) options.pageToken = pageToken;
      if (syncToken) options.syncToken = syncToken;
      else options.timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      try {
        response = Calendar.Events.list(calendarId, options);
      } catch (err) {
        // sync token 失效（例如太久沒同步），清掉重新做一次完整比對
        props.deleteProperty(tokenKey);
        syncToken = null;
        delete options.syncToken;
        options.timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        response = Calendar.Events.list(calendarId, options);
      }

      (response.items || []).forEach(applyCalendarEventChangeToSheet);
      pageToken = response.nextPageToken;
      if (!pageToken && response.nextSyncToken) {
        props.setProperty(tokenKey, response.nextSyncToken);
      }
    } while (pageToken);
  } catch (err) {
    // 安靜失敗，避免日曆同步失敗干擾其他功能
  }
}

// 把單一個「有變動的日曆事件」套用回「預約紀錄」表對應的那一列
function applyCalendarEventChangeToSheet(ev) {
  const eventId = ev.id;
  const headers = ['建立時間', '姓名', '電話', '分類', '主要項目', '明細', '預估金額', '客人身份', '定金狀態', '預約日期時段', '改期次數', '狀態', '備註', '得知管道', '日曆事件ID', '反饋表單連結', '反饋狀態', '介紹人電話', '補睫來源事件ID'];
  const sheet = getOrCreateSheet(CONFIG.BOOKING_LOG_SHEET_NAME, headers);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][14]) !== String(eventId)) continue; // 找不到就代表不是本系統建立的事件，略過

    const rowIndex = i + 1;
    const phone = data[i][2];
    const categoryName = data[i][3];
    const mainItemName = data[i][4];

    if (ev.status === 'cancelled') {
      if (data[i][11] !== '已取消') {
        sheet.getRange(rowIndex, 12).setValue('已取消');
        sheet.getRange(rowIndex, 13).setValue(
          (data[i][12] ? data[i][12] + '；' : '') + '偵測到日曆事件被刪除，系統自動標記取消（請確認是否為誤刪）'
        );
        recomputeCustomerSummary(phone);
        markDiscountUsageStatus(eventId, '已取消');
        updateCustomerCouponSummary(phone);
      }
      return;
    }

    if (ev.start && ev.start.dateTime) {
      const newStart = new Date(ev.start.dateTime);
      const oldApptDate = parseApptDateTime(data[i][9]);

      // 時間跟原本記錄的一樣（誤差在1分鐘內）就不用更新，避免無意義的寫入
      if (oldApptDate && Math.abs(oldApptDate.getTime() - newStart.getTime()) < 60000) return;

      const newApptStr = Utilities.formatDate(newStart, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      sheet.getRange(rowIndex, 10).setValue(newApptStr).setNumberFormat('yyyy-mm-dd hh:mm');

      const oldDateStr = oldApptDate ? Utilities.formatDate(oldApptDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : null;
      const newDateStr = Utilities.formatDate(newStart, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      syncRelatedDatesForEvent(eventId, phone, categoryName, mainItemName, oldDateStr, newDateStr);
    }
    return;
  }
}