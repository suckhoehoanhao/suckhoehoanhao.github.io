/**
 * NHẬN ĐƠN LANDING PAGE – SỨC KHỎE HOÀN HẢO
 * ------------------------------------------------------------
 * Mỗi đơn khách đặt trên landing page:
 *   1. Ghi ngay vào sheet "ĐƠN HÀNG" đúng mẫu: Ngày | STT | TÊN NGƯỜI NHẬN | SĐT |
 *      ĐỊA CHỈ ĐẦY ĐỦ | GHI CHÚ | NỘI DUNG | COD/CK | SỐ TIỀN COD (nghìn) | Note
 *      - Cột Ngày ghi rõ ngày giờ từng đơn (vd 12/11/2026 14:35), STT đếm lại từ 1 mỗi ngày
 *      - Sang ngày mới tự chèn dòng đỏ TỔNG TIỀN của ngày trước
 *   2. Trong ~1 phút gửi email báo đơn mới, đính kèm file Excel (.xlsx) toàn bộ đơn trong ngày.
 *   3. Lưu file Excel theo ngày vào thư mục Drive "ĐƠN HÀNG LANDING SKHH" (DonHang_dd-MM-yyyy.xlsx),
 *      tự cập nhật mỗi khi có đơn mới trong ngày.
 *   3. Sheet "LOG_WEB" lưu nguồn quảng cáo (utm, fbclid) để đối soát Ads.
 *
 * CÀI ĐẶT (làm 1 lần):
 *   1. Tạo Google Sheet mới > Tiện ích mở rộng > Apps Script > xoá code mẫu, dán toàn bộ file này.
 *   2. Sửa EMAIL_TO bên dưới > bấm Lưu.
 *   3. Chọn hàm "setup" > Chạy > Cấp quyền (Nâng cao > Đi tới dự án > Cho phép).
 *   4. Triển khai > Tuỳ chọn triển khai mới > Loại: Ứng dụng web
 *        Thực thi với tư cách: Tôi | Người có quyền truy cập: Bất kỳ ai > Triển khai
 *   5. Copy "URL ứng dụng web" (đuôi /exec) dán vào ORDER_API trong file index.html.
 *   (Tuỳ chọn) chạy hàm "testOrder" để thử: sinh 1 đơn test + gửi mail. Xoá dòng test sau đó.
 *
 * Sửa code sau khi đã triển khai: Triển khai > Quản lý triển khai > Sửa (bút chì) >
 *   Phiên bản: Phiên bản mới > Triển khai (giữ nguyên link /exec).
 */

const CONFIG = {
  EMAIL_TO: 'email-nhan-don@gmail.com',   // nhiều người nhận: 'a@gmail.com,b@gmail.com'
  SHOP_NAME: 'Sức Khỏe Hoàn Hảo',
  SHEET_ORDERS: 'ĐƠN HÀNG',
  SHEET_LOG: 'LOG_WEB',
  DRIVE_FOLDER: 'ĐƠN HÀNG LANDING SKHH',   // thư mục Drive chứa file Excel theo ngày ('' = không lưu)
  TZ: 'Asia/Ho_Chi_Minh',
  ORDER_PREFIX: 'SKHH',     // mã đơn dạng SKHH-01, SKHH-02…
  DEDUPE_MINUTES: 3,         // cùng SĐT + cùng nội dung trong 3 phút = bấm trùng, không ghi 2 lần
  // Meta Conversions API: gửi lượt mua (Purchase) từ máy chủ, trùng event_id = mã đơn với Pixel trên web để Meta tự gộp.
  // Mã truy cập KHÔNG dán vào code: Cài đặt dự án > Thuộc tính tập lệnh > thêm META_CAPI_TOKEN.
  PIXEL_ID: '2171296483467236',
  CAPI_TEST_CODE: ''         // mã "Kiểm tra sự kiện" (TEST12345) khi muốn thử, để trống khi chạy thật
};

const HEADERS = ['Ngày', 'STT', 'TÊN NGƯỜI NHẬN', 'SĐT', 'ĐỊA CHỈ ĐẦY ĐỦ', 'GHI CHÚ', 'NỘI DUNG', 'COD /CK', 'SỐ TIỀN COD', 'Note'];
const WIDTHS = [118, 40, 170, 110, 420, 110, 380, 60, 80, 90];
const FORMATS = ['@', '0', '@', '@', '@', '@', '@', '@', '#,##0', '@'];
const LOG_HEADERS = ['Thời gian', 'Mã đơn', 'Ngày giờ', 'STT', 'Tên', 'SĐT', 'Địa chỉ', 'Ghi chú', 'Nội dung', 'COD/CK',
  'Số tiền (nghìn)', 'Tổng (VNĐ)', 'utm_source', 'utm_campaign', 'utm_content', 'fbclid', 'Trang', 'Thiết bị', 'Đã gửi mail', 'Tỉnh/TP',
  'fbp', 'fbc', 'Meta CAPI', 'Sản phẩm (mã)'];
const L = { time: 0, id: 1, day: 2, stt: 3, name: 4, phone: 5, addr: 6, note: 7, content: 8, pay: 9, amount: 10, total: 11,
  page: 16, ua: 17, sent: 18, fbp: 20, fbc: 21, capi: 22, items: 23 };
const COLOR = { header: '#1c4f8f', red: '#ff0000', yellow: '#ffff00' };

/** Mở Google Sheet đơn hàng: script gắn trong Sheet thì dùng luôn Sheet đó,
 *  script độc lập thì tự tạo Sheet "ĐƠN HÀNG – Landing SKHH" ở lần chạy đầu và nhớ ID. */
function ss_() {
  const active = SpreadsheetApp.getActive();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('ĐƠN HÀNG – Landing SKHH');
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

/* ============ API nhận đơn ============ */
function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.website) return json_({ ok: true, orderId: 'OK' });                      // bot (honeypot)

    const name = clean_(d.name, 80);
    const phone = normPhone_(d.phone);
    const province = clean_(d.province, 60);
    const address = d.street ? [clean_(d.street, 160), clean_(d.ward, 80), province].filter(String).join(', ') : clean_(d.address, 300);
    const note = clean_(d.note, 300);
    const pay = d.payment === 'ck' ? 'ck' : 'cod';
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 50).map(function (i) {
      return {
        id: clean_(i.id, 40),
        short: clean_(i.short || i.name, 60),
        qty: Math.min(999, Math.max(0, parseInt(i.qty, 10) || 0)),
        price: Math.max(0, Number(i.price) || 0)
      };
    }).filter(function (i) { return i.qty > 0 && i.short; });

    if (name.length < 2 || /[0-9@]|https?:|www\./i.test(name)) return json_({ ok: false, error: 'Vui lòng nhập họ tên người nhận' });
    if (!isMobileVN_(phone)) return json_({ ok: false, error: 'Số điện thoại chưa đúng' });
    if (address.length < 5) return json_({ ok: false, error: 'Thiếu địa chỉ' });
    if (d.street !== undefined && !province) return json_({ ok: false, error: 'Chưa chọn tỉnh / thành phố' });
    if (!items.length) return json_({ ok: false, error: 'Chưa có sản phẩm' });

    const ship = (d.ship === null || d.ship === undefined || d.ship === '') ? null : Math.max(0, Number(d.ship) || 0);
    const subtotal = items.reduce(function (s, i) { return s + i.qty * i.price; }, 0);
    const total = subtotal + (ship || 0);
    const content = items.map(function (i) { return i.qty + ' ' + i.short; }).join(', ');

    const lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      const ss = ss_();
      const sh = ensureOrders_(ss);
      const lg = ensureLog_(ss);
      const props = PropertiesService.getScriptProperties();
      const now = new Date();

      // chống bấm trùng
      const dup = findDuplicate_(lg, phone, content, now);
      if (dup) return json_({ ok: true, orderId: dup, duplicate: true });

      // nghi rác: vẫn nhận đơn (nhân viên gọi kiểm tra) nhưng KHÔNG báo lượt mua cho Meta
      const flags = [];
      const secs = Number(d.t);
      if (d.t !== undefined && secs >= 0 && secs < 6) flags.push('điền đơn quá nhanh (' + secs + ' giây)');
      const same24h = countPhone_(lg, phone, now, 24);
      if (same24h >= 2) flags.push('SĐT này đã đặt ' + same24h + ' đơn trong 24h');
      if (/(\d)\1{6}/.test(phone)) flags.push('SĐT nhiều số lặp, gọi xác minh');
      const flag = flags.length ? '⚠ NGHI RÁC: ' + flags.join('; ') : '';

      // ngày mới -> chốt tổng ngày cũ, STT về 1
      const today = Utilities.formatDate(now, CONFIG.TZ, 'dd/MM/yyyy');
      const stamp = Utilities.formatDate(now, CONFIG.TZ, 'dd/MM/yyyy HH:mm');
      const lastDay = props.getProperty('LAST_DAY');
      let stt = Number(props.getProperty('DAY_STT') || 0);
      if (lastDay !== today) {
        if (lastDay) {
          const block = findDayBlock_(sh, lastDay);
          if (block) addTotalRow_(sh, sh.getLastRow() + 1, block.start, block.end);
        }
        stt = 0;
        props.setProperty('LAST_DAY', today);
      }
      stt++;
      props.setProperty('DAY_STT', String(stt));

      // Mã đơn: SKHH-01, SKHH-02… tăng dần cho mọi đơn (không reset theo ngày)
      const seq = Number(props.getProperty('ORDER_SEQ') || 0) + 1;
      props.setProperty('ORDER_SEQ', String(seq));
      const orderId = CONFIG.ORDER_PREFIX + '-' + String(seq).padStart(2, '0');
      const addrCell = note ? address + '\nnote : ' + note : address;
      const shipNote = ship === 0 ? 'freeship' : (ship ? 'ship ' + Math.round(ship / 1000) + 'k' : '');
      const amountK = Math.round(total / 1000);
      const row = [stamp, stt, name, phone, addrCell, shipNote, content, pay, amountK, flag];

      const r = sh.getLastRow() + 1;
      writeOrderRow_(sh, r, row);

      lg.appendRow([now, orderId, stamp, stt, name, "'" + phone, addrCell, shipNote, content, pay, amountK, total,
        clean_(d.utm_source, 100), clean_(d.utm_campaign, 150), clean_(d.utm_content, 150), clean_(d.fbclid, 300),
        clean_(d.page, 300), clean_(d.ua, 300), '', province,
        clean_(d.fbp, 120), clean_(d.fbc, 300), flag ? 'bỏ qua: nghi rác' : '', JSON.stringify(items.map(function (i) { return [i.id, i.qty, i.price]; }))]);

      props.setProperty('PENDING', '1');
      props.setProperty('CAPI_PENDING', '1');
      return json_(flag ? { ok: true, orderId: orderId, total: total, flag: true } : { ok: true, orderId: orderId, total: total });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Lỗi hệ thống, vui lòng gọi hotline' });
  }
}

function doGet() {
  return ContentService.createTextOutput('API nhận đơn ' + CONFIG.SHOP_NAME + ' đang chạy ✓');
}

/* ============ Gửi email (trigger mỗi 1 phút) ============ */
function processQueue() {
  const props = PropertiesService.getScriptProperties();
  try { sendCapi_(); } catch (e) { console.error('Meta CAPI: ' + e); }
  if (props.getProperty('PENDING') !== '1') return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    props.setProperty('PENDING', '0');
    const ss = ss_();
    const sh = ensureOrders_(ss);
    const lg = ensureLog_(ss);
    const n = lg.getLastRow();
    if (n < 2) return;
    const start = Math.max(2, n - 299);
    const vals = lg.getRange(start, 1, n - start + 1, LOG_HEADERS.length).getValues();
    const pending = [];
    vals.forEach(function (v, i) {
      // Google Sheets có thể tự đổi cột "Ngày giờ" thành kiểu Date -> chuẩn hoá lại dạng dd/MM/yyyy HH:mm
      if (v[L.time] instanceof Date) v[L.day] = Utilities.formatDate(v[L.time], CONFIG.TZ, 'dd/MM/yyyy HH:mm');
      else if (v[L.day] instanceof Date) v[L.day] = Utilities.formatDate(v[L.day], CONFIG.TZ, 'dd/MM/yyyy HH:mm');
      if (v[L.id] && v[L.sent] !== 'x') pending.push({ row: start + i, v: v });
    });
    if (!pending.length) return;

    // file Excel: tất cả đơn của ngày (theo đơn mới nhất trong lô)
    const day = String(pending[pending.length - 1].v[L.day]).slice(0, 10);
    const xlsx = makeDayXlsx_(sh, day);
    if (xlsx) { try { saveToDrive_(xlsx); } catch (e) { console.error('Lưu Drive lỗi: ' + e); } }

    const totalK = pending.reduce(function (s, p) { return s + Number(p.v[L.amount] || 0); }, 0);
    const first = pending[0].v;
    const subject = pending.length === 1
      ? '🛒 Đơn mới ' + first[L.id] + ' – ' + first[L.name] + ' – ' + first[L.amount] + 'k'
      : '🛒 ' + pending.length + ' đơn mới – ' + CONFIG.SHOP_NAME + ' – ' + totalK + 'k';

    MailApp.sendEmail({
      to: CONFIG.EMAIL_TO,
      subject: subject,
      name: CONFIG.SHOP_NAME + ' – Đơn web',
      htmlBody: emailHtml_(pending, ss.getUrl(), day),
      attachments: xlsx ? [xlsx] : []
    });

    pending.forEach(function (p) { lg.getRange(p.row, L.sent + 1).setValue('x'); });
  } catch (err) {
    props.setProperty('PENDING', '1');   // lỗi -> thử lại ở lần chạy sau
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/* ============ Meta Conversions API (lượt mua từ máy chủ) ============
 * Không gửi họ tên, SĐT, địa chỉ, ghi chú cho Meta: chỉ mã đơn, giá trị, mã sản phẩm,
 * cookie Facebook của trình duyệt (fbp/fbc) và trình duyệt (user agent). */
function sendCapi_(force) {
  const props = PropertiesService.getScriptProperties();
  if (!force && props.getProperty('CAPI_PENDING') !== '1') return;
  const token = props.getProperty('META_CAPI_TOKEN');
  if (!token || !CONFIG.PIXEL_ID) return;                          // chưa có mã -> giữ lại, gửi sau
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const lg = ensureLog_(ss_());
    const n = lg.getLastRow();
    if (n < 2) { props.setProperty('CAPI_PENDING', '0'); return; }
    const start = Math.max(2, n - 299);
    const vals = lg.getRange(start, 1, n - start + 1, LOG_HEADERS.length).getValues();
    const now = Date.now(), rows = [], events = [];
    vals.forEach(function (v, i) {
      if (!v[L.id] || v[L.capi] !== '') return;
      const row = start + i;
      const t = v[L.time] instanceof Date ? v[L.time].getTime() : now;
      if (now - t > 6.5 * 864e5) { rows.push([row, 'quá 7 ngày, bỏ qua']); return; }
      const fbp = String(v[L.fbp] || ''), fbc = String(v[L.fbc] || '');
      if (!fbp && !fbc) { rows.push([row, 'không có cookie Facebook, bỏ qua']); return; }
      let items = [];
      try { items = JSON.parse(v[L.items] || '[]'); } catch (e) {}
      const ud = { client_user_agent: String(v[L.ua] || '').slice(0, 400) || undefined };
      if (fbp) ud.fbp = fbp;
      if (fbc) ud.fbc = fbc;
      events.push({
        event_name: 'Purchase', event_time: Math.floor(t / 1000), event_id: String(v[L.id]),
        action_source: 'website', event_source_url: String(v[L.page] || 'https://suckhoehoanhao.github.io/'),
        user_data: ud,
        custom_data: {
          currency: 'VND', value: Number(v[L.total]) || 0, order_id: String(v[L.id]), content_type: 'product',
          content_ids: items.map(function (x) { return x[0]; }).filter(String),
          contents: items.filter(function (x) { return x[0]; }).map(function (x) { return { id: x[0], quantity: x[1], item_price: x[2] }; }),
          num_items: items.reduce(function (s, x) { return s + (Number(x[1]) || 0); }, 0)
        }
      });
      rows.push([row, null]);
    });
    if (events.length) {
      const body = { data: events, access_token: token };
      if (CONFIG.CAPI_TEST_CODE) body.test_event_code = CONFIG.CAPI_TEST_CODE;
      const res = UrlFetchApp.fetch('https://graph.facebook.com/v22.0/' + CONFIG.PIXEL_ID + '/events', {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true
      });
      const code = res.getResponseCode(), txt = res.getContentText();
      const stamp = Utilities.formatDate(new Date(), CONFIG.TZ, 'dd/MM HH:mm');
      const status = code === 200 ? 'đã gửi ' + stamp + (CONFIG.CAPI_TEST_CODE ? ' (test)' : '') : 'lỗi ' + code + ': ' + txt.slice(0, 180);
      rows.forEach(function (r) { if (r[1] === null) r[1] = status; });
      console.log('Meta CAPI ' + code + ' ' + txt.slice(0, 300));
    }
    rows.forEach(function (r) { lg.getRange(r[0], L.capi + 1).setValue(r[1]); });
    props.setProperty('CAPI_PENDING', '0');
  } finally {
    lock.releaseLock();
  }
}

/** Gửi lại các đơn chưa gửi Meta (ô "Meta CAPI" để trống). Xoá chữ "lỗi…" trong ô đó rồi chạy hàm này để gửi lại. */
function resendCapi() { sendCapi_(true); }

/** Thử Conversions API: gửi 1 sự kiện Purchase có mã kiểm tra (Meta KHÔNG tính vào số liệu thật). Xem kết quả ở Nhật ký thực thi. */
function testCapi() {
  const token = PropertiesService.getScriptProperties().getProperty('META_CAPI_TOKEN');
  if (!token) { console.log('Chưa có META_CAPI_TOKEN trong Thuộc tính tập lệnh'); return; }
  const now = Math.floor(Date.now() / 1000);
  const body = { test_event_code: CONFIG.CAPI_TEST_CODE || 'TEST20261113', access_token: token, data: [{
    event_name: 'Purchase', event_time: now, event_id: 'TEST-' + now, action_source: 'website',
    event_source_url: 'https://suckhoehoanhao.github.io/',
    user_data: { fbp: 'fb.1.' + (now * 1000) + '.1234567890', client_user_agent: 'Mozilla/5.0 (test)' },
    custom_data: { currency: 'VND', value: 175000, order_id: 'TEST-' + now, content_type: 'product', content_ids: ['dau-phong'],
      contents: [{ id: 'dau-phong', quantity: 1, item_price: 175000 }], num_items: 1 } }] };
  const res = UrlFetchApp.fetch('https://graph.facebook.com/v22.0/' + CONFIG.PIXEL_ID + '/events', {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true });
  console.log('Meta trả về ' + res.getResponseCode() + ': ' + res.getContentText());
}

/* ============ Cài đặt & test ============ */
function setup() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone(CONFIG.TZ);
  formatHeader_(ensureOrders_(ss));                       // luôn cập nhật dòng tiêu đề theo mẫu mới
  const lg = ensureLog_(ss);
  lg.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold').setBackground('#eeeeee');
  const blank = ss.getSheetByName('Trang tính1') || ss.getSheetByName('Sheet1');
  if (blank && ss.getSheets().length > 2 && blank.getLastRow() === 0) ss.deleteSheet(blank);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'processQueue') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processQueue').timeBased().everyMinutes(1).create();
  DriveApp.getRootFolder(); // xin quyền Drive để xuất file Excel
  console.log('Xong. Sheet đơn hàng: ' + ss.getUrl());
  console.log('Còn lại mail gửi được hôm nay: ' + MailApp.getRemainingDailyQuota());
}

function testOrder() {
  const res = doPost({ postData: { contents: JSON.stringify({
    name: 'Khách Test', phone: '0900000000', street: '318 Nguyễn Thị Minh Khai', ward: 'Phường Phú Lợi', province: 'TP. Hồ Chí Minh',
    note: 'đơn thử, xoá sau', payment: 'cod',
    items: [{ short: 'dphh 50ml', qty: 1, price: 175000 }, { short: 'rượu tứ vị 500ml', qty: 2, price: 131000 }],
    ship: null, utm_source: 'test'
  }) } });
  console.log(res.getContent());
  processQueue();
}

/* ============ Helpers ============ */
function ensureOrders_(ss) {
  let sh = ss.getSheetByName(CONFIG.SHEET_ORDERS);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_ORDERS, 0);
  if (sh.getLastRow() === 0) formatHeader_(sh);
  return sh;
}

function ensureLog_(ss) {
  let lg = ss.getSheetByName(CONFIG.SHEET_LOG);
  if (!lg) lg = ss.insertSheet(CONFIG.SHEET_LOG);
  if (lg.getLastRow() === 0) {
    lg.appendRow(LOG_HEADERS);
    lg.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold').setBackground('#eeeeee');
    lg.setFrozenRows(1);
  } else if (lg.getLastColumn() < LOG_HEADERS.length) {
    lg.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold').setBackground('#eeeeee');
  }
  lg.getRange('C:C').setNumberFormat('@');
  return lg;
}

function formatHeader_(sh) {
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setBackground(COLOR.header).setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.getRange(1, 10).setFontColor(COLOR.red).setHorizontalAlignment('left');
  sh.getRange(1, 3).setHorizontalAlignment('left');
  sh.setRowHeight(1, 48);
  sh.setFrozenRows(1);
  WIDTHS.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  sh.getRange('A:A').setNumberFormat('@');
  sh.getRange('D:D').setNumberFormat('@');
}

function writeOrderRow_(sh, r, row) {
  const rg = sh.getRange(r, 1, 1, HEADERS.length);
  rg.setNumberFormats([FORMATS]).setValues([row])
    .setBackground(null).setFontColor('#000000').setFontWeight('normal').setVerticalAlignment('middle');
  sh.getRange(r, 5).setWrap(true);
  sh.getRange(r, 7).setWrap(true);
  sh.getRange(r, 6).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(r, 9).setHorizontalAlignment('right');
  sh.getRange(r, 10).setFontColor(COLOR.red);
  if (row[7] === 'ck') sh.getRange(r, 8).setFontColor(COLOR.red);
  if (String(row[9]).indexOf('⚠') === 0) rg.setBackground('#fff4cc');
}

function addTotalRow_(sh, r, start, end) {
  sh.getRange(r, 1, 1, HEADERS.length).setBackground(COLOR.red);
  sh.getRange(r, 9).setFormula('=SUM(I' + start + ':I' + end + ')')
    .setFontColor(COLOR.yellow).setFontWeight('bold').setNumberFormat('#,##0').setHorizontalAlignment('right');
}

/** Tìm khối đơn của 1 ngày: dòng có cột A = ngày, kéo xuống tới hết các dòng STT liên tiếp */
function findDayBlock_(sh, day) {
  const last = sh.getLastRow();
  if (last < 2) return null;
  const v = sh.getRange(2, 1, last - 1, 2).getDisplayValues();
  const isDay = function (r) { return r[1] !== '' && String(r[0]).slice(0, 10) === day; };
  let end = -1;
  for (let i = v.length - 1; i >= 0; i--) { if (isDay(v[i])) { end = i; break; } }
  if (end < 0) return null;
  let start = end;
  while (start - 1 >= 0 && isDay(v[start - 1])) start--;
  return { start: start + 2, end: end + 2 };
}

/** Số đơn của 1 SĐT trong N giờ gần nhất (đọc LOG_WEB) */
function countPhone_(lg, phone, now, hours) {
  const n = lg.getLastRow();
  if (n < 2) return 0;
  const start = Math.max(2, n - 299);
  const v = lg.getRange(start, 1, n - start + 1, L.phone + 1).getValues();
  let c = 0;
  v.forEach(function (r) {
    const t = r[L.time] instanceof Date ? r[L.time].getTime() : 0;
    if (r[L.id] && now.getTime() - t < hours * 3600000 && String(r[L.phone]).replace(/^'/, '') === phone) c++;
  });
  return c;
}

/** SĐT di động Việt Nam: 03x/05x/07x/08x/09x, 10 số, không phải dãy lặp hay dãy liên tiếp */
function isMobileVN_(p) {
  return /^0(3[2-9]|5[25689]|7[06-9]|8[1-9]|9\d)\d{7}$/.test(p) && !/^0(\d)\1{8}$/.test(p) && ['0123456789', '0987654321'].indexOf(p) < 0;
}

function findDuplicate_(lg, phone, content, now) {
  const n = lg.getLastRow();
  if (n < 2) return null;
  const start = Math.max(2, n - 29);
  const v = lg.getRange(start, 1, n - start + 1, L.content + 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    const t = v[i][L.time] instanceof Date ? v[i][L.time].getTime() : 0;
    if (now.getTime() - t > CONFIG.DEDUPE_MINUTES * 60000) continue;
    if (String(v[i][L.phone]).replace(/^'/, '') === phone && v[i][L.content] === content) return v[i][L.id];
  }
  return null;
}

/** Tạo file .xlsx chứa tất cả đơn của ngày, cùng mẫu cột + dòng tổng đỏ */
function makeDayXlsx_(sh, day) {
  const block = findDayBlock_(sh, day);
  if (!block) return null;
  const data = sh.getRange(block.start, 1, block.end - block.start + 1, HEADERS.length).getValues();
  const fileName = 'DonHang_' + day.replace(/\//g, '-');
  const tmp = SpreadsheetApp.create(fileName);
  try {
    const t = tmp.getSheets()[0];
    t.setName('ĐƠN HÀNG');
    formatHeader_(t);
    data.forEach(function (row, i) {
      row[0] = String(row[0]);
      row[3] = String(row[3]);
      writeOrderRow_(t, i + 2, row);
    });
    addTotalRow_(t, data.length + 2, 2, data.length + 1);
    SpreadsheetApp.flush();
    const resp = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + tmp.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) { console.error('Export xlsx lỗi ' + resp.getResponseCode()); return null; }
    return resp.getBlob().setName(fileName + '.xlsx');
  } finally {
    DriveApp.getFileById(tmp.getId()).setTrashed(true);
  }
}

function emailHtml_(pending, sheetUrl, day) {
  const th = 'style="background:' + COLOR.header + ';color:#fff;padding:8px;border:1px solid #c9d3e3;font-size:13px;text-align:left"';
  const td = 'style="padding:7px 8px;border:1px solid #d9d9d9;font-size:13px;vertical-align:top"';
  let rows = '';
  let sum = 0;
  pending.forEach(function (p) {
    const v = p.v;
    sum += Number(v[L.amount] || 0);
    rows += '<tr>' +
      '<td ' + td + ' nowrap>' + esc_(v[L.day]) + '</td>' +
      '<td ' + td + '>' + esc_(v[L.stt]) + '</td>' +
      '<td ' + td + '><b>' + esc_(v[L.name]) + '</b><br><span style="color:#888">' + esc_(v[L.id]) + '</span></td>' +
      '<td ' + td + '><a href="tel:' + esc_(String(v[L.phone]).replace(/^'/, '')) + '">' + esc_(String(v[L.phone]).replace(/^'/, '')) + '</a></td>' +
      '<td ' + td + '>' + esc_(v[L.addr]).replace(/\n/g, '<br>') + '</td>' +
      '<td ' + td + '><b>' + esc_(v[L.note]) + '</b></td>' +
      '<td ' + td + '>' + esc_(v[L.content]) + '</td>' +
      '<td ' + (v[L.pay] === 'ck' ? td.replace('vertical-align:top', 'vertical-align:top;color:#ff0000') : td) + '>' + esc_(v[L.pay]) + '</td>' +
      '<td ' + td + ' align="right"><b>' + esc_(v[L.amount]) + '</b></td>' +
      '</tr>';
  });
  return '<div style="font-family:Arial,sans-serif;color:#222">' +
    '<p style="font-size:15px">Có <b>' + pending.length + ' đơn mới</b> từ landing page (' + esc_(day) + '). ' +
    'File Excel đính kèm = <b>toàn bộ đơn trong ngày</b>.</p>' +
    '<table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%">' +
    '<tr><th ' + th + '>Ngày giờ</th><th ' + th + '>STT</th><th ' + th + '>TÊN NGƯỜI NHẬN</th><th ' + th + '>SĐT</th>' +
    '<th ' + th + '>ĐỊA CHỈ ĐẦY ĐỦ</th><th ' + th + '>GHI CHÚ</th><th ' + th + '>NỘI DUNG</th><th ' + th + '>COD /CK</th><th ' + th + '>SỐ TIỀN COD</th></tr>' +
    rows +
    '<tr><td colspan="8" style="background:#ff0000;padding:7px 8px"></td><td style="background:#ff0000;color:#ffff00;font-weight:bold;padding:7px 8px" align="right">' + sum + '</td></tr>' +
    '</table>' +
    '<p style="font-size:13px;color:#666">Số tiền tính theo nghìn đồng (131 = 131.000đ). ' +
    '<a href="' + sheetUrl + '">Mở Google Sheet đơn hàng</a></p></div>';
}

/** Lưu / cập nhật file Excel của ngày vào thư mục Drive */
function saveToDrive_(blob) {
  if (!CONFIG.DRIVE_FOLDER) return;
  const it = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.DRIVE_FOLDER);
  const name = blob.getName();
  const old = folder.getFilesByName(name);
  while (old.hasNext()) old.next().setTrashed(true);
  folder.createFile(blob.copyBlob().setName(name));
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function clean_(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0009\u000B-\u001F]/g, ' ').replace(/^[=+\-@\s]+/, '').trim().slice(0, max || 200);
}
function normPhone_(p) {
  let v = String(p || '').replace(/[^\d+]/g, '');
  if (v.indexOf('+84') === 0) v = '0' + v.slice(3);
  else if (v.indexOf('84') === 0 && v.length === 11) v = '0' + v.slice(2);
  return v;
}
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/* Kiểm tra xuất Excel + lưu Drive (chạy tay khi cần) */
function testExcel() {
  const sh = ensureOrders_(ss_());
  const day = Utilities.formatDate(new Date(), CONFIG.TZ, 'dd/MM/yyyy');
  console.log('Ngày: ' + day + ' | block: ' + JSON.stringify(findDayBlock_(sh, day)));
  const x = makeDayXlsx_(sh, day);
  console.log('xlsx: ' + (x ? x.getName() + ' ' + x.getBytes().length + ' bytes' : 'NULL'));
  if (x) { saveToDrive_(x); console.log('Đã lưu Drive vào thư mục ' + CONFIG.DRIVE_FOLDER); }
}

/* Xoá đơn thử (tên chứa "TEST") + đặt lại bộ đếm mã đơn về SKHH-01. Chỉ chạy tay. */
function resetTestOrders() {
  const ss = ss_();
  [CONFIG.SHEET_ORDERS, CONFIG.SHEET_LOG].forEach(function (name) {
    const sh = ss.getSheetByName(name); if (!sh) return;
    const col = name === CONFIG.SHEET_ORDERS ? 3 : 5;   // cột tên
    for (let r = sh.getLastRow(); r >= 2; r--) {
      if (/TEST/.test(String(sh.getRange(r, col).getValue()))) sh.deleteRow(r);
    }
  });
  const p = PropertiesService.getScriptProperties();
  ['ORDER_SEQ', 'DAY_STT', 'LAST_DAY', 'PENDING'].forEach(function (k) { p.deleteProperty(k); });
  const it = DriveApp.getFoldersByName(CONFIG.DRIVE_FOLDER);
  if (it.hasNext()) { const f = it.next().getFilesByName('DonHang_' + Utilities.formatDate(new Date(), CONFIG.TZ, 'dd-MM-yyyy') + '.xlsx'); while (f.hasNext()) f.next().setTrashed(true); }
  console.log('Đã xoá đơn thử. Đơn tiếp theo: ' + CONFIG.ORDER_PREFIX + '-01');
}
