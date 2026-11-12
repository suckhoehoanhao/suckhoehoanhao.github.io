# Landing page đặt hàng – Sức Khỏe Hoàn Hảo

Trang bán hàng 1 file (`index.html`), tối ưu điện thoại và máy tính. Đơn khách đặt được ghi vào Google Sheet theo mẫu cột:

`Ngày giờ | STT | TÊN NGƯỜI NHẬN | SĐT | ĐỊA CHỈ ĐẦY ĐỦ | GHI CHÚ | NỘI DUNG | COD /CK | SỐ TIỀN COD | Note | TỈNH/TP`

(vd `12/11/2026 14:35`, STT đếm lại từ 1 mỗi ngày, sang ngày mới tự chèn dòng đỏ tổng tiền)

và gửi email kèm file Excel (.xlsx) các đơn trong ngày.

## Cấu trúc

| File | Dùng để |
|---|---|
| `index.html` | Landing page: Logo → Tiêu đề → Bán chạy → Tất cả sản phẩm (popup chi tiết) → Đặt nhanh + Hình + USP → Số liệu → Lợi ích → Phản hồi khách hàng → Đặt hàng → Footer + bản đồ |
| `img/` | Logo, ảnh sản phẩm (WebP nén nhẹ) |
| `apps-script/Code.gs` | Code nhận đơn, dán vào Google Apps Script |

## 1. Bật nhận đơn (Google Apps Script)

1. Tạo Google Sheet mới → **Tiện ích mở rộng → Apps Script** → xoá code mẫu, dán toàn bộ `apps-script/Code.gs`.
2. Sửa `EMAIL_TO` thành email nhận đơn → Lưu.
3. Chọn hàm `setup` → **Chạy** → cấp quyền.
4. **Triển khai → Tuỳ chọn triển khai mới → Ứng dụng web**
   - Thực thi với tư cách: **Tôi**
   - Người có quyền truy cập: **Bất kỳ ai**
5. Copy link kết thúc bằng `/exec`.

## 2. Gắn link vào landing page

Mở `index.html` (trên GitHub bấm biểu tượng bút chì), sửa khối `CONFIG` ở đầu file:

```js
ORDER_API: "https://script.google.com/macros/s/xxxx/exec",
PIXEL_ID: "123456789012345",
```

Commit → khoảng 1 phút sau trang tự cập nhật.

Chưa có `ORDER_API` thì trang chạy **chế độ thử**: vẫn báo đặt thành công nhưng không lưu đơn.

## 3. Link chạy quảng cáo

- Trang chính: `https://<tên-tài-khoản>.github.io/skhh-landing/`
- Tự thêm sản phẩm vào giỏ: `?sp=dau-phong`, `?sp=ruou-tu-vi&qty=2`, `?sp=dau-phong,ruou-tu-vi`
- Thêm UTM để đối soát: `&utm_source=fb&utm_campaign=...&utm_content=...` (lưu ở sheet `LOG_WEB`)

Mã sản phẩm: `dau-phong`, `ruou-tu-vi`, `thong-kinh-lac-thuy`, `dap-thao-moc`, `bot-ngam-chan`, `molm-nguyen-ban`, `molm-bo-mau`, `molm-cat-loi`, `molm-sam-que`, `molm-nhau`, `ngu-vi-toi-thuong`, `ngu-vi-toi-den`, `toi-den-co-don`, `thanh-xuan-duoc`, `pha-huong-dan`.

## Sự kiện Facebook Pixel

`PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase` (value + currency VND, eventID = mã đơn).

## Sửa giá / sản phẩm / phí ship

Trong `index.html`: mảng `PRODUCTS` (tên, giá, ảnh, tên viết tắt ghi vào cột NỘI DUNG) và `SHIP_FEE`, `FREESHIP_FROM` trong `CONFIG`.

## Phản hồi khách hàng

Mục này tự ẩn khi chưa có dữ liệu. Chỉ điền phản hồi **thật** của khách, trong `index.html` (khối `window.REVIEWS`):

```js
window.REVIEWS = [
  {name:"Chị Lan", place:"Thủ Đức", text:"Nội dung khách nhắn…", img:"img/review-1.jpg"}
];
```

Ảnh chụp feedback bỏ vào thư mục `img/`.
