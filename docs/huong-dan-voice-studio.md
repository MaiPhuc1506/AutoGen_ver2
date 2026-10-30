# Dùng Voice Studio trong lc_autogen

## Mở web

Bản đang chạy để thử: http://localhost:3002 . Hai cổng 3000/3001 đã có server cũ, nên bản nâng cấp dùng 3002.

Khi mở lại sau này, tại thư mục repo chạy `npm run web` rồi mở địa chỉ terminal hiển thị. Nếu cổng 3000 đang bận, dùng `PORT=3002 npm run web`. Server phải khởi động lại sau khi cập nhật code; tải lại trang không tự cập nhật backend.

## Cách 1 — Dùng ngay với Edge

1. Trong **Giọng đọc & phong cách**, chọn **Tạo giọng AI**.
2. Chọn **Edge TTS**, **Nam Minh** hoặc **Hoài My**. Bắt đầu ở **1.10x**, thử thêm 1.00x hoặc 1.20x.
3. Bấm **Nghe thử giọng**. Có thể sửa đoạn nghe thử bằng câu của bạn. Edge cần Internet.
4. Chọn **Tech Editorial · Xanh đen / cam**. Mở **Xem phong cách** để xem demo chuyển động.
5. Chọn tab **Từ Văn Bản / Chủ Đề**, nhập tiêu đề, nội dung và tên kênh; hoặc dùng tab URL để quét bài viết.
6. Bấm **Chuẩn Bị & Duyệt Kịch Bản**. Sửa lời đọc và chữ chính từng cảnh. Nghe thử cảnh nếu cần.
7. Bấm **Duyệt & Render Video**. Chờ hoàn tất rồi xem/tải MP4. Có thể mở lại trong Thư viện Video / Timeline Editor.

Phần tên giọng cũ trong form được thay bởi bảng chọn chung ở trên. Chế độ JSON và nút Render của timeline dùng cấu hình lưu trong JSON/dự án, không tự ghi đè theo bảng tạo video mới.

## Cách 2 — Mang giọng từ Vbee / ElevenLabs vào

1. Trên dịch vụ bạn chọn, tạo giọng và tải về MP3 hoặc WAV.
2. Trên web, chọn **Tải MP3 / WAV có sẵn**, chọn file. Giới hạn: 30 MB, dài 1 giây–10 phút. Dùng thanh audio để nghe lại.
3. Nếu có phụ đề khớp audio, chọn file **SRT** hoặc dán vào ô SRT.
4. Dùng tab văn bản, dán **đúng toàn bộ lời đọc của file** vào nội dung. Hệ thống chia lời thành các cảnh, không thêm lời vào audio.
5. Bấm chuẩn bị kịch bản. Bạn có thể nghe audio ngay trong bản duyệt; chỉnh **Bắt đầu cảnh tại giây** cho các cảnh sau cảnh đầu. Nếu SRT có đủ cue, mốc và lời mỗi cảnh tự lấy theo SRT; bạn vẫn có thể sửa. Mốc phải tăng dần và nhỏ hơn thời lượng audio.
6. Duyệt chữ trên hình và render.

Audio tải lên giữ tốc độ gốc. Muốn đổi tốc độ hãy xuất file mới từ dịch vụ. Re-TTS từng cảnh không áp dụng cho dự án dùng audio tải lên.

**Không có SRT:** phụ đề và mốc cảnh được ước lượng, cần xem lại video. **Có SRT:** thời gian phụ đề theo cụm từ SRT; chưa có căn chính xác từng từ. Preset mới không bật karaoke khi timestamp từ chỉ là ước lượng.

## Dùng API Vbee / ElevenLabs trực tiếp

Không bắt buộc ở bản đầu. Bạn có thể luôn dùng cách tải MP3/WAV ở trên.

Nếu muốn tạo giọng trực tiếp trên web, điền thông tin server vào `.env.local` và khởi động lại web:

- ElevenLabs: `ELEVENLABS_API_KEY`; nên đặt `ELEVENLABS_MODEL_ID=eleven_flash_v2_5`. Sau đó chọn ElevenLabs trong web và dán Voice ID từ tài khoản của bạn.
- Vbee: `VBEE_APP_ID`, `VBEE_ACCESS_TOKEN`. Sau đó chọn Vbee và dán Voice Code (hoặc dùng mã mặc định từ cấu hình).
- LucyLab: `VIETNAMESE_API_KEY`, chọn LucyLab rồi điền Voice ID.

Không gửi API key qua ô Voice ID, không đưa key vào kịch bản. Nghe thử trực tiếp có thể tiêu tốn quota của dịch vụ.

## Chất lượng và giới hạn bản đầu

- Tech Editorial là một phong cách mới, chưa phải toàn bộ 15 phong cách của mg-styles-15.
- Preview phong cách là demo bố cục, không phải bản preview nội dung cuối của bạn.
- Chữ ngắn, mỗi cảnh một ý sẽ dễ xem hơn. Cần kiểm tra lại thông tin do AI tạo từ nguồn.
- Giọng Nam Minh/Hoài My là lựa chọn có sẵn; chưa xác định được đúng giọng trong video tham chiếu.
- File nằm trong `output/<tên-dự-án>/`; audio upload gốc trong `.uploads/`. Giữ `.uploads/` nếu còn cần render lại các dự án dùng voice tải lên.
- BGM chỉ phát khi có file nhạc thực tế; checkbox không tự tạo nhạc. Repo hiện chưa có sẵn bộ SFX đầy đủ.

## Bản Dynamic và chọn hook

- Trong **Nhịp chuyển động**, chọn **Dynamic** để có chữ bật theo cụm, gạch nhấn, chữ số, thẻ đánh số và nền chuyển động. Chọn **Calm** để dùng chuyển động nhẹ như bản đầu.
- **Âm thanh nhấn cảnh nhẹ** có thể tắt, nhất là khi file voice đã mix sẵn âm thanh.
- Sau khi chuẩn bị kịch bản, xem **Chọn một cách mở đầu**. Bấm một phương án sẽ thay lời đọc và headline cảnh đầu; vẫn có thể sửa thủ công.
- Nếu thấy **Đang dựng từ câu có trong nguồn**, web chưa dùng AI để viết lại hook. Hãy nhập nguồn đủ chi tiết; hoặc cấu hình LLM và kiểm tra kết nối trước khi tạo lại kịch bản. Không cần key để dùng giọng Edge hoặc upload audio.
- Dự án dùng voice tải lên giữ nguyên lời/audio nên không có nút đổi hook tự động; muốn đổi câu mở phải thay audio tương ứng.
- Video đã render trước khi nâng cấp giữ hình cũ. Tạo bản mới với Dynamic hoặc đặt `motionPreset: "dynamic"` trong JSON rồi render lại để dùng hiệu ứng mới.
