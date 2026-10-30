# Tạo video tự dựng theo nội dung repo

1. Mở http://localhost:3002 và tải lại trang để nhận giao diện mới.
2. Dán link repo công khai dạng `https://github.com/owner/repo`, bấm **Quét Dữ Liệu**. Kiểm tra dòng nguồn: web ghi rõ các file thực sự đọc được.
3. Chọn template, mức độ giải thích và số giây. Giữ bật **Tự dựng theo nội dung repo** và **Cân audio theo số giây đã chọn**. Số cảnh do nội dung quyết định, không bắt buộc sáu cảnh hay năm hook.
4. Chọn giọng. Mặc định **Dùng từ điển phát âm**; bấm nghe thử. Tên kênh mặc định DevPeek36, đọc “đép bít ba sáu”. Chữ trên hình/phụ đề vẫn là DevPeek36 và thuật ngữ gốc.
5. Bấm **Chuẩn Bị & Duyệt Kịch Bản**. Mỗi cảnh có phần **Storyboard**: mục đích, hình dự kiến, trích đoạn nguồn và lý do chuyển cảnh. Duyệt các mục cần kiểm tra nguồn và phần kiến thức bị lược bỏ.
6. Có thể đổi bố cục sang **Sơ đồ · input → xử lý → output**, **Ví dụ minh họa · từng bước**, workflow hoặc code. Mở phần JSON bố cục để sửa nội dung; code có thể thêm `highlightLines: [1, 3]`. Đổi bố cục đặt lại phần hình, nên kiểm tra lại.
7. **Xem thử bố cục** để kiểm tra hình (preview không voice, 3 giây/cảnh); sau đó **Duyệt & Render Video**. Bản MP4 dùng audio thật và thời lượng đã cân.

## Sửa phát âm

Mở tab **Từ Điển Phát Âm**, thêm/sửa bằng cách thay mục từ rồi lưu. Ví dụ:

| Từ gốc | Cách đọc gửi TTS |
|---|---|
| DevPeek36 | đép bít ba sáu |
| GitHub | ghít háp |
| API | ây pi ai |

Sau khi lưu, nghe thử lại. Giọng đã render trước đó không tự đổi; cần tạo lại voice/render. Chọn **Đọc nguyên bản, bỏ qua từ điển** nếu muốn để dịch vụ tự đọc tiếng Anh. Từ điển chỉ ảnh hưởng giọng, không Việt hóa chữ trên hình. Khi có thay phát âm, phụ đề giữ chữ gốc nhưng timing được ước lượng.

## Khi lời đọc không vừa thời lượng

Web điều chỉnh tempo vừa phải sau khi đo TTS. Nếu lệch quá xa, web báo cần rút gọn/bổ sung lời hoặc chọn số giây khác. Không tự cắt bỏ cuối câu. Khi bật cân thời lượng, tốc độ thanh trượt là tốc độ tạo giọng ban đầu; tempo cuối có thể thay đổi để khớp số giây. Tắt cân thời lượng để giữ tốc độ đó và để thời lượng theo audio.

Nguồn ngắn không nên kéo dài bằng nội dung bịa; nguồn dài có thể chọn 90/120/180 giây và duyệt ý bị lược bỏ. Tải MP3/WAV giữ nguyên audio, không áp từ điển hoặc cân tempo.

Minh họa input/output là hình giải thích từ tài liệu; hệ thống chưa tự cài/chạy repo hoặc quay demo thật. Cần kiểm tra các nhận định của AI trước khi xuất.

## Outro DevPeek36

Kịch bản mới có lời chào tạm biệt và mời Follow kênh để cập nhật repo, tin tức công nghệ. Mọi style pack có thẻ kênh, con trỏ bấm Follow rồi chuyển thành Đã theo dõi. Animation tự vừa thời lượng cảnh và xuất cùng MP4. Bạn vẫn sửa được lời outro ở bước duyệt. Project đã lưu giữ nguyên lời cũ: tạo kịch bản mới hoặc sửa cảnh cuối rồi tạo lại voice/render.

Logo DevPeek36 có sẵn được dùng tự động ở đầu video và thẻ Follow. Trong **Ảnh, screenshot & logo dự án → Logo đầu video & thẻ Follow**, mặc định là logo kênh; chọn một ảnh đã tải lên để thay cho bản dựng. Không cần tải lại logo DevPeek36 mỗi lần.

## Kiểm tra thuật ngữ trước khi tạo giọng

Trong bản duyệt, mở **Cách đọc thuật ngữ · kiểm tra trước khi xuất**. Mỗi cảnh cho xem văn bản thực gửi TTS. Có thể đặt từ điển riêng cho video, ví dụ `{"Agent":"ây chình","OpenDesign":"âu pần đi dai"}`, rồi bấm **Áp dụng & xem cách đọc**, nghe thử cảnh có thuật ngữ. Chữ trên hình và phụ đề vẫn dùng tiếng Anh gốc. Từ điển chung vẫn sửa ở tab Từ Điển Phát Âm; từ điển riêng đi cùng script.json và ưu tiên hơn mục chung cùng tên.

Nguồn ảnh được hiện bằng nhãn ngắn (ví dụ GitHub · owner/repo); URL đầy đủ được giữ trong media.json. Video cũ cần render lại để có nhãn mới và cách đọc mới.
