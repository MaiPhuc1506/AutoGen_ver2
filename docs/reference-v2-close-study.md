# Đối chiếu sát video tham chiếu — bản sửa 2

Ngày 29/10/2026. Phản hồi của người dùng: hook, template và hiệu ứng bản trước chưa giống video gửi kèm. Đây là chỉnh sửa renderer, không chỉ đổi bảng màu.

## Quan sát trực tiếp

Nguồn: `/Users/mbp/Downloads/Download.mp4`, 576×1024, 30fps, 87,832683 giây. Xem lại hook 0–8 giây ở 4 frame/giây; phần dựng bảng 12–36 giây ở 1 frame/giây; phần còn lại mỗi 2 giây. Xem riêng khung 1 giây và 28 giây ở độ phân giải gốc.

- Hook: khối kính khoảng x137/y160, 300×300; logo ở trong, nhãn loại sản phẩm, tên sản phẩm ở y484; pill repo y555; đối chiếu trước/sau y612; phụ đề y742. Tên sản phẩm không phải cả câu hook. Lời mở đầu dẫn từ vấn đề tới giải pháp.
- Hook hiện mờ/nhỏ rồi rõ khoảng 0,25–0,75 giây; giữ hình tới gần giây 6; có ánh màu chạy qua tên; toàn nhóm mờ/tan khi đổi cảnh.
- Bảng cơ chế: x42/y154, rộng492; panel cơ chế cao160; hai hàng trạng thái ở y330/y421; hai thẻ cuối ở y514. Các thẻ được bổ sung, không bỏ toàn bộ bảng ở mỗi câu.
- Các phần sau dùng nhóm tính năng tím, hàng icon, code window, ảnh tư liệu, nhóm lưu ý và profile kính. Phụ đề trắng/cam cùng một vùng; hạt màu mờ, các điểm nối có glow.
- Chưa xác định font/easing/giọng đọc gốc. Không coi số RAM, widget, tốc độ của Glance là dữ kiện dự án.

## Thay đổi tích hợp

- `src/render/reference-scenes.ts`: renderer riêng của reference, đủ 16 bố cục; composer legacy giữ đường dựng riêng. Hero có `templateData.hero` (name/category/repository/before/after). Logo sản phẩm được dùng khi media có presentation=logo, nếu thiếu dùng biểu tượng video trung tính do dự án dựng bằng CSS/SVG.
- `scene.referenceBoard`: rows và cards bổ sung trên cùng cảnh; semantic rows có màu/badge/trạng thái tắt; stable IDs detail-N và metric-N đi qua block-plan/timeline. Bảng cơ chế giữ cả nhãn và mô tả từ dữ liệu nodes.
- `styles.reference.css`: vị trí đo từ mẫu nhân1,875 lên1080×1920; board923px rộng ở y289, kính563px ở y300, captions y1380; thẻ nhỏ và header nằm trong panel. Bảng dài tự thu vừa vùng nội dung sau khi font tải xong.
- GSAP: blur→focus, scale nhẹ khi hiện, blur/fade cả nhóm lúc rời cảnh, title gradient sweep, pulse các điểm nối, hạt nền màu. Timeline seek được; không dùng CSS animation theo đồng hồ.
- Schema/generator: trường mới tùy chọn; prompt phân biệt tên sản phẩm và lời hook, hướng dẫn dữ liệu bảng; source-only chỉ thêm liên từ tương phản cho dạng câu phù hợp, không thêm lợi ích/số liệu.
- Studio: trường chỉnh tên/category/repo/trước/sau, JSON thẻ bổ sung, lựa chọn nhấn từ ước lượng hoặc chỉ dùng mốc chính xác. JSON nhập vào cũng qua schema và bản duyệt trước khi render.
- Caption low vẫn giữ `accuracy: low`. `highlightMode: estimated` cho phép tô cam theo timing ước lượng, không giả thành word alignment high. Khi thiếu mốc từ, nhịp có thể lệch giọng và cần duyệt.

## Bản dựng kiểm tra

`output/reference-v2-close-study/video.mp4` dùng lời đọc mới về tính năng thật của AutoGen; không dùng lời hay logo Glance. Hook voice: “Thay vì dựng từng cảnh thủ công, bạn nhập nội dung, duyệt lời đọc rồi xuất video dọc với AutoGen.” Có cơ chế + 2 hàng + 2 thẻ, tính năng, code + thẻ timing, giới hạn và profile.

```sh
npm run rerender -- output/reference-v2-close-study --draft --fps=30
```

Edge NamMinh 1,10×, phát âm original. Provider hiện trả mốc low; bản mẫu dùng chế độ nhấn ước lượng. Nhạc/SFX theo pipeline hiện có. Bản MP4 được kiểm tra hình ảnh, không khẳng định đã nghe hoặc khớp giọng gốc.

Ảnh: hook.png, mechanism.png, features.png, code.png, limits.png, outro.png, contact-sheet.jpg. `studio-review.png` chứng minh các trường hero/caption trong bản duyệt; preview UI mở được với dữ liệu bảng thực. Không khởi động render lần nữa từ nút duyệt khi QA.

Các kiểm tra cuối và thông số ffprobe được ghi bên dưới sau khi chạy. Script cũ vẫn dùng renderer cũ; không thay video người dùng đã xuất, không commit.

## Kết quả cuối thực tế

```text
npx tsc --noEmit: exit 0
npm test: 47 files passed, 229 tests passed; exit 0 (30,84 giây)
node --check public/studio.js: exit 0
node --check public/app.js: exit 0
node --check src/render/templates/animations.js: exit 0
git diff --check: exit 0
ffprobe: video 1080×1920, 30/1 fps; có audio; 38,533333 giây
FFmpeg toàn mix: mean -24,2 dBFS, peak -6,7 dBFS (không phải LUFS)
```

Lần chạy test trong lúc render CPU cao có 5 timeout 5 giây; chạy lại sau khi render kết thúc thì 229/229 pass, không tăng timeout. Log cuối nằm cạnh MP4: tests.log, typecheck.log, render.log, ffprobe.json.

Đã xem hook, bảng cơ chế, tính năng, code, lưu ý và outro từ MP4 cuối. `hook-comparison.jpg` và `board-comparison.jpg`: bên trái video nguồn, bên phải bản dựng mới. Nhãn/màu tích cực và số liệu dùng nội dung AutoGen, không lấy các phát biểu về Glance. `motion-study.jpg` trích 0,15/0,35/0,7/5,9/6,2/6,6 giây để kiểm tra focus và đổi cảnh.

Browser QA: nhập JSON → schema validation → bản duyệt, thấy trường tên/category/repo/trước/sau, mode nhấn từ và JSON thẻ bổ sung; nút xem thử trả đúng hero và bảng đang sửa. Ảnh `studio-hook-fields.png` và `studio-review.png`. Một lần QA trước khi nối luồng duyệt đã vô tình mở render trùng; đã dừng đúng tiến trình render đó và xóa riêng thư mục QA trùng. Bản MP4 kiểm chứng ở trên được giữ nguyên.

Đạt: cấu trúc hình mở đầu theo mẫu, bảng tích lũy, hiệu ứng focus/blur/sweep/pulse, tích hợp 16 bố cục, sửa được dữ liệu và timing, typecheck/tests/render thật. Chưa xác nhận: font/easing/giọng/nhạc giống chính xác nguồn; độ khớp từ của mốc low; LLM thật với prompt mới. Không tuyên bố giống 100%.
