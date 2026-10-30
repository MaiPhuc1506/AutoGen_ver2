# Kiểm chứng thiết kế video mẫu — bản đầu, 29/10/2026

Bản này đã bị người dùng phản hồi chưa giống template/hook/hiệu ứng. Báo cáo sửa và bản MP4 mới nằm ở `reference-v2-close-study.md`; không dùng nhận định hình ảnh của bản đầu làm kết luận cho bản mới.

## Đã tích hợp
- Mặc định video mới từ web URL/văn bản/JSON, generator AI/source-only và CLI dùng thiết kế `reference`.
- 16 bố cục dùng chung nền tối, ánh sáng dịu, thẻ viền mờ, chữ trắng/cam/mint, phụ đề tách khỏi nội dung và profile CTA bằng branding dự án.
- Hai kiểu hook, ba cách kể và hai nhịp độc lập; bộ dữ liệu pacing mở rộng được. Không lấy số liệu hay asset từ video Glance làm mặc định.
- Khối có ID ổn định, mốc chỉnh tay/cụm lời/timing dự phòng; chỉnh được ở bước duyệt và inspector timeline. Chưa thêm track kéo thả riêng cho từng khối hoặc undo/redo riêng cho các ô timing.
- Có nút chuyển thiết kế cho dự án hiện tại. Script cũ không tự đổi; không sửa video hoặc asset gốc của người dùng. Không thêm dependency, không commit.

## Kết quả thực tế

```text
npx tsc --noEmit: exit 0
npm test: 47 test files passed; 226 tests passed; exit 0
node --check public/studio.js: exit 0
node --check public/app.js: exit 0
node --check src/render/templates/animations.js: exit 0
git diff --check: exit 0
```

Repo chưa có lệnh lint trong package.json. Đã kiểm tra cú pháp JavaScript và diff; không tuyên bố đã chạy ESLint.

Test mới: validate schema/timing; 16 layout có các reveal ID; script cũ không tự opt-in; ưu tiên timing tay; timestamp low không được nhận thành word anchor high; chặn cuối cảnh; preset pacing thứ hai; hai kiểu hook và hai nguồn nội dung không phụ thuộc Glance; route block-plan và preview với mốc tay.

Hai fixture nội dung độc lập (bài báo, repo; URL example.test và GitHub mẫu) đi qua generator source-only và POST /api/studio/preview-script, đều HTTP 200, script hợp lệ và có reference-design. Đây là dữ liệu kiểm thử, không phải xác minh ingest hai URL thật hoặc gọi LLM thật.

### Render mới

`output/reference-design-validation/video.mp4`: HyperFrames draft, 491 frame, hoàn thành khoảng 42,2 giây ở lần cuối. ffprobe:

```text
1080×1920
30/1 fps
Có stream audio
16.366667 giây
```

Audio không phải im lặng: FFmpeg mean -24,5 dBFS, peak -7,3 dBFS. Đo toàn mix, không coi là LUFS hay chất lượng giọng đã được duyệt.

Đã xem khung hình đầu, screenshot/callout, các thẻ workflow bổ sung dần, cửa sổ code và profile cuối. Chữ trong mẫu không tràn/cắt, nội dung và caption tách vùng. Ảnh tổng hợp tại `output/reference-design-validation/contact-sheet.jpg`.

### Lưu timing qua UI → export

Trong browser tại local Studio, mở Timeline Editor → dự án kiểm chứng → inspector hook → Nhịp xuất hiện từng khối. Đổi benefit thành 0,65 giây, lưu script, nhận toast thành công. Tải lại trang, giá trị vẫn 0,65. Render lại bằng voice đã lưu, composition cuối có:

```html
data-block-id="benefit" data-reveal-at="0.650" data-timing-basis="manual"
```

Ảnh UI: `output/reference-design-validation/studio-timeline.png`. Không sửa dữ liệu project gốc; thao tác trên bản sao kiểm chứng.

### Hồi quy

`output/legacy-reference-regression/script.json` giống nguyên bản `output/template-pack-flat-vector-validation/script.json` theo so sánh JSON. Render lại ở chế độ legacy bằng HyperFrames draft 24 fps (engine hỗ trợ 24/30/60): 1080×1920, có audio, 16,375 giây, exit 0. HTML không có reference-design; giữ pack flat-vector. Đã trích và xem ảnh tổng hợp. Lệnh rerender được đồng bộ khoảng nghỉ/hold/CSS/font với pipeline cho editorial, thay vì luôn dùng khoảng nghỉ 0,3 giây và CSS classic.

## Chưa kiểm chứng / giới hạn
- Chưa nghe trực tiếp toàn bộ video; chưa xác nhận chất giọng, nhạc/SFX, độ lệch từng từ bằng tai hoặc đánh giá giống mẫu 100%.
- Audio mẫu tái sử dụng từ fixture đã có; không sao chép audio của video tham chiếu, chưa thử gợi ý hook bằng LLM thật với preset mới.
- Caption timestamp thấp giữ chữ trắng và không nhấn từng từ. Mẫu mới không giả vờ có word alignment chính xác khi provider chỉ có ước lượng.
- Preview nhanh vẫn là layout-only, thời gian dự phòng, chưa phải preview audio chính xác. Bản MP4 là bước kiểm tra cuối.
- HyperFrames có cảnh báo không chặn về composition dài và hai ảnh avatar dùng chung nguồn; file cuối được kiểm chứng độc lập bằng ffprobe.

## Cách dùng
Khởi động lại server project để nạp module mới, rồi tải lại trang. Xem `docs/reference-design-guide.md`. Diff riêng của lượt thay đổi này ở `docs/reference-design-changes.patch`; không gộp các chỉnh sửa có sẵn trước lượt làm việc này vào commit.
