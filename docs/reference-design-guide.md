# Dùng thiết kế video mẫu

Tạo video mới từ URL, văn bản, CLI hoặc JSON trong web: mặc định dùng Studio tối theo video mẫu. Gallery chính là 16 bố cục trong cùng thiết kế, không còn ép nội dung đổi sang màu/hiệu ứng MG khác nhau. Chọn thumbnail chỉ xem thử bố cục; hệ thống vẫn phối cảnh theo nội dung.

1. Chọn **Cách mở đầu**, **Cách kể nội dung**, **Nhịp chuyển động**. Các lựa chọn độc lập với bố cục từng cảnh và số giây mục tiêu.
2. Tạo bản nháp và chọn hook; sửa lời đọc, chữ, ảnh, code và chuyển cảnh trong bước duyệt.
3. Mở **Nhịp xuất hiện từng khối**. Để trống để tự khớp cụm lời; nhập số giây tính từ đầu cảnh để chỉnh tay. Mốc tự động dùng timestamp chính xác khi có; nếu không có thì ước lượng và ghi nhãn trong composition. Chỉnh lời có thể làm thay đổi mốc tự động.
4. Bấm **Xem thử** để duyệt bố cục. Preview này chưa có giọng và dùng thời gian dự phòng; mốc chỉnh tay dài hơn 3 giây sẽ kéo dài cảnh preview. Không dùng preview này để kết luận khớp giọng.
5. Render và xem bản MP4. Trong bản duyệt, chọn nhấn từ theo mốc chính xác hoặc cho phép ước lượng khi TTS thiếu mốc từ. Dữ liệu low vẫn ghi low; màu cam ở chế độ ước lượng có thể lệch giọng. Nghe/xem lại TTS thật trước khi đăng.

Dự án đã lưu: mở Timeline Editor, bấm **Áp dụng thiết kế video mẫu cho dự án**, lưu kịch bản rồi render. Lời và nguồn ảnh không đổi. Mốc từng khối cũng chỉnh được ở inspector của cảnh trên timeline. Video đã xuất trước đây không tự thay đổi.

Trường JSON mới, đều tùy chọn:

```json
{
  "templatePack": "reference",
  "creative": {
    "presetId": "reference",
    "hookType": "problem-solution",
    "structureId": "explainer",
    "pacingId": "narrated"
  }
}
```

Hook khác: `question`. Cấu trúc khác: `news`, `review`; cấu trúc là chỉ dẫn cho AI, chế độ source-only chỉ ghép câu có nguồn. Nhịp khác: `quick`. Để thêm tổ hợp mới từ các chức năng đã có, đăng ký thêm dữ liệu trong `REFERENCE_PRESETS` và thêm ID vào schema; không cần sửa animation. Kiểu bố cục hoàn toàn mới cần renderer tương ứng.

Trong cảnh có thể ghi `"blockTiming":{"item-0":{"atSec":1.8}}`. Hoặc neo cụm lời: `"blockTiming":{"item-0":{"phrase":"nạp theo yêu cầu","occurrence":1}}`. Mốc chỉnh tay ưu tiên; mốc vượt cảnh được chặn để có đủ thời gian hiện. ID các khối lấy từ `/api/studio/block-plan`; không nhập HTML/JavaScript hay CSS selector từ ngoài.

Render lại từ voice đã lưu: `npm run rerender -- output/<du-an> --draft`. Có thể thêm `--fps=24`; HyperFrames hỗ trợ 24, 30 và 60 fps, mặc định vẫn 30 fps và 1080×1920. Lệnh tạo lại video trong thư mục dự án đã chọn, nên dùng bản sao nếu cần giữ bản MP4 trước đó.


### Hook và bảng theo video mẫu (bản sửa 2)
Trong bản duyệt, điền **Tên sản phẩm trên hook**, **Nhãn loại sản phẩm**, **Repo**, **Trước**, **Sau**. Tên sản phẩm nằm dưới khối kính, còn câu “Thay vì…” nằm ở lời đọc/phụ đề. Chọn ảnh sản phẩm và **Logo lớn giữa cảnh** để thay biểu tượng video trung tính. Nhãn trước/sau chỉ dùng lợi ích có trong nguồn.

Mở **Thẻ bổ sung trên cùng bảng (JSON)** ở cảnh cơ chế/code/lưu ý để bổ sung rows/cards. Với data-flow, bảng cơ chế giữ ở trên, các hàng và thẻ lần lượt hiện phía dưới. Ví dụ:

```json
{
  "rows": [{"title":"Duyệt trước khi xuất","detail":"Chỉnh lời đọc và tư liệu","tone":"mint","badge":"XEM"}],
  "cards": [{"label":"Đầu ra video dọc","value":"1080 × 1920","tone":"blue"}]
}
```

Mốc các thẻ bổ sung có ID `detail-0`, `metric-0`,... trong **Nhịp xuất hiện từng khối**. Không thêm quá nhiều nội dung vào một bảng; hệ thống thu vừa bảng dài, chữ sẽ nhỏ đi.

Kịch bản JSON cũng mở bước duyệt trước khi render. Kiểm chứng và mẫu mới: `reference-v2-close-study.md`, `output/reference-v2-close-study/video.mp4`. Bản cũ ở `reference-design-validation` chỉ là kiểm chứng lần đầu, chưa đạt mức gần mẫu người dùng mong muốn.

### Mở đầu bằng số sao GitHub
Video repo ở preset reference tự lấy số sao GitHub: badge sao hiện trước, đếm số và phát sáng, rồi tới logo/tên sản phẩm. Bản duyệt ghi số sao và ngày lấy; số được đọc lại khi render. Không lấy được số thì bỏ badge. Lời đọc vẫn chỉnh riêng ở bước duyệt; nếu muốn đọc “hơn ... nghìn sao”, hãy dùng số thực được hiển thị. Có thể chỉnh mốc badge bằng block ID `stars`. Xem `docs/adr-github-star-hook.md` và clip `output/github-stars-hook-validation/video.mp4`.

### Giọng chính và phát âm
Mặc định mới là **Nam Minh 1,20×**, chế độ **Thông minh · Số, ngày giờ & từ điển thuật ngữ**. Bộ chuẩn hóa text của ZeroTTS được dùng trước khi gửi văn bản sang Edge; không cần chạy model ZeroTTS. Nghe thử và render dùng cùng cách chuẩn hóa. Xem chuỗi đọc thực trong **Cách đọc thuật ngữ · kiểm tra trước khi xuất**; sửa từ khó ở Từ điển phát âm hoặc override riêng của video. Chữ trên template/phụ đề vẫn giữ nguyên. Script cũ giữ mode đã lưu; chọn smart nếu muốn dùng cho dự án cũ.
