/**
 * NHẬN ĐƠN LANDING PAGE – SỨC KHỎE HOÀN HẢO
 * ------------------------------------------------------------
 * Mỗi đơn khách đặt trên landing page:
 *   1. Ghi ngay vào sheet "ĐƠN HÀNG" đúng mẫu: Ngày giờ | STT | TÊN NGƯỜI NHẬN | SĐT |
 *      ĐỊA CHỈ ĐẦY ĐỦ | GHI CHÚ | NỘI DUNG | COD/CK | SỐ TIỀN COD (nghìn) | Note | TỈNH/TP
 *      - Mỗi đơn ghi rõ ngày giờ đặt (vd 12/11/2026 14:35), STT đếm lại từ 1 mỗi ngày
 *      - Sang ngày mới tự chèn dòng đỏ TỔNG TIỀN của ngày trước
 *   2. Trong ~1 phút gửi email báo đơn mới, đính kèm file Excel (.xlsx) toàn bộ đơn trong ngày.
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
  TZ: 'Asia/Ho_Chi_Minh',
  DEDUPE_MINUTES: 3          // cùng SĐT + cùng nội dung trong 3 phút = bấm trùng, không ghi 2 lần
};

const HEADERS = ['Ngày giờ', 'STT', 'TÊN NGƯỜI NHẬN', 'SĐT', 'ĐỊA CHỈ ĐẦY ĐỦ', 'GHI CHÚ', 'NỘI DUNG', 'COD /CK', 'SỐ TIỀN COD', 'Note', 'TỈNH/TP'];
const WIDTHS = [118, 40, 170, 110, 420, 110, 380, 60, 80, 90, 130];
const FORMATS = ['@', '0', '@', '@', '@', '@', '@', '@', '#,##0', '@', '@'];
const LOG_HEADERS = ['Thời gian', 'Mã đơn', 'Ngày giờ', 'STT', 'Tên', 'SĐT', 'Địa chỉ', 'Ghi chú', 'Nội dung', 'COD/CK',
  'Số tiền (nghìn)', 'Tổng (VNĐ)', 'utm_source', 'utm_campaign', 'utm_content', 'fbclid', 'Trang', 'Thiết bị', 'Đã gửi mail', 'Tỉnh/TP'];
const L = { time: 0, id: 1, day: 2, stt: 3, name: 4, phone: 5, addr: 6, note: 7, content: 8, pay: 9, amount: 10, total: 11, sent: 18 };
const COLOR = { header: '#1c4f8f', red: '#ff0000', yellow: '#ffff00' };

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
        short: clean_(i.short || i.name, 60),
        qty: Math.min(999, Math.max(0, parseInt(i.qty, 10) || 0)),
        price: Math.max(0, Number(i.price) || 0)
      };
    }).filter(function (i) { return i.qty > 0 && i.short; });

    if (name.length < 2) return json_({ ok: false, error: 'Thiếu họ tên' });
    if (!/^0\d{9}$/.test(phone)) return json_({ ok: false, error: 'Số điện thoại chưa đúng' });
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
      const ss = SpreadsheetApp.getActive();
      const sh = ensureOrders_(ss);
      const lg = ensureLog_(ss);
      const props = PropertiesService.getScriptProperties();
      const now = new Date();

      // chống bấm trùng
      const dup = findDuplicate_(lg, phone, content, now);
      if (dup) return json_({ ok: true, orderId: dup, duplicate: true });

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

      const orderId = 'SK' + Utilities.formatDate(now, CONFIG.TZ, 'ddMMyy') + '-' + ('00' + stt).slice(-3);
      const addrCell = note ? address + '\nnote : ' + note : address;
      const shipNote = ship === 0 ? 'freeship' : (ship ? 'ship ' + Math.round(ship / 1000) + 'k' : '');
      const amountK = Math.round(total / 1000);
      const row = [stamp, stt, name, phone, addrCell, shipNote, content, pay, amountK, '', province];

      const r = sh.getLastRow() + 1;
      writeOrderRow_(sh, r, row);

      lg.appendRow([now, orderId, stamp, stt, name, "'" + phone, addrCell, shipNote, content, pay, amountK, total,
        clean_(d.utm_source, 100), clean_(d.utm_campaign, 150), clean_(d.utm_content, 150), clean_(d.fbclid, 300),
        clean_(d.page, 300), clean_(d.ua, 300), '', province]);

      props.setProperty('PENDING', '1');
      return json_({ ok: true, orderId: orderId, total: total });
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
  if (props.getProperty('PENDING') !== '1') return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    props.setProperty('PENDING', '0');
    const ss = SpreadsheetApp.getActive();
    const sh = ensureOrders_(ss);
    const lg = ensureLog_(ss);
    const n = lg.getLastRow();
    if (n < 2) return;
    const start = Math.max(2, n - 299);
    const vals = lg.getRange(start, 1, n - start + 1, LOG_HEADERS.length).getValues();
    const pending = [];
    vals.forEach(function (v, i) { if (v[L.id] && v[L.sent] !== 'x') pending.push({ row: start + i, v: v }); });
    if (!pending.length) return;

    // file Excel: tất cả đơn của ngày (theo đơn mới nhất trong lô)
    const day = String(pending[pending.length - 1].v[L.day]).slice(0, 10);
    const xlsx = makeDayXlsx_(sh, day);

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

/* ============ Cài đặt & test ============ */
function setup() {
  const ss = SpreadsheetApp.getActive();
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
  console.log('Xong. Còn lại mail gửi được hôm nay: ' + MailApp.getRemainingDailyQuota());
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
  }
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
  const fileName = 'DonHang_' + day.replace(/\//g, '-') + '_SKHH';
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
