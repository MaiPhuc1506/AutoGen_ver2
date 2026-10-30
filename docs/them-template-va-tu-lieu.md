# Dùng screenshot, logo và template trong Auto Gen

1. Tải lại http://localhost:3002/.
2. Giữ lựa chọn **Thuật ngữ tiếng Anh → Giữ nguyên AI, API, GitHub, prompt…**. Áp dụng cho bản mới, nghe thử và render. Bản cũ đã ghi “ây ai” cần sửa lời hoặc tạo lại.
3. Dán link GitHub. Mặc định web tự lấy tư liệu khi chuẩn bị bản nháp. Hoặc bấm **Lấy screenshot & ảnh GitHub** trước. Thư viện hiển thị screenshot, ảnh README và avatar tác giả riêng biệt.
4. Có logo riêng: **Tải ảnh / logo** (PNG/JPG/WebP/GIF, dưới 10 MB), rồi chọn ở **Logo cố định trên video**. Không chọn thì không có logo. Avatar tác giả chỉ dùng làm logo nếu bạn chủ động chọn.
5. Chọn **Tech Editorial**, **Dynamic**, và **Explainer · Navy / xanh sáng** nếu thích nền navy. Đây là palette của renderer hiện tại, không phải bộ Remotion được nhập nguyên.
6. **Chuẩn Bị & Duyệt Kịch Bản**. Trong từng cảnh:
   - Sửa lời đọc và chữ chính.
   - Đổi **Bố cục cảnh**; đổi bố cục đặt lại phần chữ hiển thị, giữ lời đọc.
   - Mở **Sửa đầy đủ nội dung bố cục (JSON)** để sửa bullets, hai phía so sánh, steps, code, ghi chú… theo đúng mẫu. Code tối đa 10 dòng/600 ký tự; workflow 2–4 bước.
   - Chọn **Ảnh / screenshot cho cảnh** và **Thẻ screenshot / ảnh**, **Logo lớn giữa cảnh** hoặc **Ảnh nền**.
   - Chọn chuyển cảnh cut/fade/slide/zoom.
7. **Xem thử bố cục · không voice** để xem các cảnh chạy ba giây/cảnh. Đây là kiểm tra bố cục; thời lượng thật phụ thuộc voice. **Nghe thử cảnh này** để kiểm tra phát âm.
8. **Duyệt & Render Video**, xem hết rồi tải MP4.

Ảnh README không phải lúc nào cũng là logo, và ảnh screenshot không thay cho đoạn demo thật. GIF/ảnh động hiện dùng khung hình đầu. Khi web báo không lấy được ảnh, tải ảnh thủ công. Thư viện chọn ảnh hiện nằm trong phiên trang; tư liệu đã chọn được đóng gói vào thư mục video khi render.

## Thêm kiểu cảnh mới bằng code

Không thể dán repo Remotion bất kỳ rồi chạy ngay. Với kiểu cảnh HTML/GSAP mới:

1. Thêm object Zod có `template` literal và giới hạn dữ liệu ở `src/render/script-schema.ts`, rồi thêm vào union TemplateData.
2. Thêm renderer trong `src/render/html-composer.ts`; escape mọi chữ do người dùng/AI cung cấp.
3. Thêm CSS vào styles.css và nếu cần styles.tech-editorial.css. Giữ vùng logo/header và vùng phụ đề không chồng hình.
4. Thêm GSAP timeline seekable trong animations.js; không dùng thời gian thực, random hoặc setInterval.
5. Đăng ký id, nhãn và dữ liệu mặc định trong `src/render/template-catalog.ts`. Trình chọn ở web lấy từ catalogue này.
6. Mô tả cách AI dùng nó trong system-prompt.ts. JSON schema thật tự cập nhật theo Zod.
7. Thêm fixture/test schema+composer, chạy TypeScript/test, render mẫu thật và ffprobe. Kiểm tra seek tiến/lùi và mobile.

Template React/Remotion cần được port từng phần sang hợp đồng này hoặc cần một adapter renderer riêng; phiên bản này chưa có adapter Remotion.
