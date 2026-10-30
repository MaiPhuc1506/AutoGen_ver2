# Thiết kế chung theo video tham chiếu

Ngày: 29/10/2026, Asia/Ho_Chi_Minh.

## Cập nhật bản sửa 2
Bản đầu chưa đạt độ gần mẫu theo phản hồi người dùng. Quyết định hiện tại: dùng renderer reference riêng trong `src/render/reference-scenes.ts`, thay vì trang trí lại HTML layout legacy. Hero tách tên sản phẩm khỏi câu hook; body là các bảng tích lũy. Thêm `scene.referenceBoard`, `templateData.hero`, và `captions.highlightMode` tùy chọn. Hiệu ứng có blur/focus/exit và sweep/pulse trên GSAP; bỏ grain SVG lớn, không bỏ blur chuyển động ngắn. Xem `reference-v2-close-study.md` cho mốc đo, triển khai và kiểm chứng mới. Các chi tiết bên dưới ghi lại thiết kế bản đầu; khi khác nhau, quyết định bản sửa 2 được ưu tiên.

## Yêu cầu đã chốt
Người dùng đồng ý triển khai tự chủ, bỏ các điểm chờ duyệt trong prompt trước. Toàn bộ loại video và bố cục của Studio mới dùng một thiết kế chung dựa trên `/Users/mbp/Downloads/Download.mp4`. Tận dụng renderer, TTS, media và timeline hiện có. Không đổi framework, không thêm dependency. Không tự ghi đè video/dự án người dùng đã lưu.

## Phân tích tham chiếu
Đã đo bằng ffprobe: 87,832683 s; 576×1024, 30 fps; H.264, AAC stereo 44,1 kHz. Trích 3 frame/s trong 10 giây đầu, 1 frame/4 s ở phần còn lại và xem contact sheet. Các mốc cảnh dưới đây là khoảng quan sát, không phải phân tích từng frame chính xác.

| Khoảng giây (ước lượng) | Nội dung / bố cục |
| --- | --- |
| 0–6,3 | Vấn đề nhiều tab; logo sản phẩm, tên và chip lợi ích, không thay toàn cảnh theo mỗi cụm caption |
| 6,3–18 | Thanh repo + screenshot; lần lượt bổ sung so sánh cách đóng gói |
| 18–35 | Thẻ cơ chế nạp theo yêu cầu, cache; thêm trạng thái bật/tắt và các chỉ số |
| 35–47 | Nhóm widget và tính năng, thẻ phụ xuất hiện dần |
| 47–64 | Cửa sổ code và ảnh giao diện, thẻ mô tả tùy biến |
| 64–81 | Thẻ lưu ý / giới hạn và câu hỏi liên hệ lại hook |
| 81–84,5 | CTA/profile |
| 84,5–87,8 | Phần kết nền tảng TikTok, không tái tạo |

Bốn trục:
- Hook: vấn đề quen thuộc → giải pháp → lợi ích. Số liệu RAM/widget/dung lượng trong video chưa xác minh; không đưa vào preset mới.
- Bố cục: nội dung tập trung phía trên/giữa, các thẻ lồng theo nhóm, caption tách bên dưới. Screenshot, code và sơ đồ mang thông tin riêng, không chép toàn bộ voice lên slide.
- Phong cách: nền gần đen ánh xanh; glow xanh nhạt/cam, particles nhỏ; thẻ viền mờ, bo góc; chữ trắng, nhấn cam; mint cho giá trị tích cực, đỏ nhạt cho giới hạn. Font sans đậm; chưa xác định được font gốc. Dùng Be Vietnam Pro đang đóng gói trong repo để hỗ trợ tiếng Việt.
- Timing: logo hiện trong khoảng 0–0,7 giây ở mẫu đầu, giữ bố cục vài giây và lần lượt bổ sung thẻ. Caption thay theo cụm ngắn, nhấn từ. Fade/dịch nhẹ là diễn giải từ frame mẫu; không khẳng định đúng easing gốc.

Âm thanh đo bằng FFmpeg `silencedetect=noise=-35dB:d=0.18,volumedetect`: mean -23,9 dBFS, sample peak 0 dBFS. Ví dụ các khoảng mức thấp 2,435–2,664; 6,493–6,728; 10,165–10,416 giây; cuối 84,475–87,423. Đây là số đo toàn mix, không tách voice/nhạc, không phải LUFS. Chưa nghe/phiên âm đầy đủ nên không suy ra giọng, provider hay tốc độ tiếng/giây chính xác. Không sao chép âm thanh của mẫu.

## Quyết định triển khai
- `templatePack: reference` là mặc định cho script mới từ cả AI và source-only; 16 bố cục hiện có cùng dùng một hệ màu, khoảng cách và lớp caption. Giao diện chính chuyển gallery phong cách thành gallery bố cục chung thiết kế.
- `creative` tùy chọn tách `presetId`, `hookType`, `structureId`, `pacingId`. Hai kiểu hook: problem-solution, question. Cấu trúc explainer/news/review truyền vào prompt AI; source-only giữ dữ kiện nguồn, không có khả năng biên tập tương đương AI.
- `REFERENCE_PRESETS` là registry dữ liệu cho khoảng nghỉ, giữ cuối và thời lượng vào cảnh. `reference-quick` chứng minh thêm tổ hợp bằng dữ liệu; ghi đè pacing không đổi hook/structure.
- `scene.blockTiming` tùy chọn lưu mốc theo ID ổn định; `atSec` chỉnh tay ưu tiên, sau đó phrase + occurrence hoặc cụm chữ trên thẻ khớp timestamp độ tin cậy high; cuối cùng fallback có nhãn estimated. Không biến timestamp ước lượng thành high.
- Composer gắn `data-block-id`, `data-reveal-at`, `data-timing-basis`; animation dùng các mốc này, mọi chuyển động seek được, không random hoặc timer.
- CSS reference áp dụng cho mọi layout, ẩn hình học/trang trí lớn, giữ thẻ có chiều sâu. Chỉnh CSS visibility của wrapper cũ để không che khối con. Font/runtime cục bộ, cùng markup/CSS cho preview và export.
- Studio Review và inspector timeline cho chỉnh giây xuất hiện từng khối. Timeline có nút chuyển dự án hiện tại sang thiết kế mới; người dùng lưu/render để tạo hình mới. Không thay đổi file video cũ hàng loạt.

## Tương thích và giới hạn
Script cũ không có creative/reference giữ đường dựng cũ. Không migration hàng loạt. Thêm tổ hợp từ bố cục/style đã có chỉ cần dữ liệu registry; bố cục/hiệu ứng hoàn toàn mới vẫn cần code renderer. Preview duyệt nhanh là layout-only và timing ước lượng, không dùng để kết luận khớp âm thanh. Nhấn từ chỉ bật với timestamp high. Sửa lời/TTS có thể làm thay đổi mốc tự động; mốc chỉnh tay được giữ và chặn ở cuối cảnh khi cần.

Thiết kế này học cấu trúc tổng quát; không tái tạo logo Glance, handle, caption, hình ảnh hoặc audio của tác giả. Không cam kết giống 100%.

Hiệu năng: bỏ SVG turbulence của lớp grain cũ (kích thước 4 lần canvas), blur/backdrop và CSS animation thời gian thực trong chế độ mới; particles dùng GSAP có thể seek. Đây là thay đổi riêng reference, không sửa lớp dựng legacy.
