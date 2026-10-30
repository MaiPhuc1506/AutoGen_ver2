# Hook mở bằng số sao GitHub

Theo yêu cầu người dùng, hook repo mở bằng **số lượng sao GitHub**, không phải điểm đánh giá 5 sao.

- Badge vàng xuất hiện ở 0,03 giây; ngôi sao xoay/bật sáng, tia sáng bật rồi tắt; số tăng qua 13 bước seek được, chốt khoảng 0,9 giây. Logo bắt đầu ở 0,9 giây, tên ở 1,05 giây, pill repo 1,15 và lợi ích 1,3 giây. Mốc chỉnh tay vẫn được ưu tiên.
- Đọc `stargazers_count` từ `https://api.github.com/repos/owner/repo`; chỉ nhận số nguyên không âm và `full_name` khớp repo. Không lấy số trong README/badge hay câu trả lời của LLM.
- Snapshot tùy chọn `metadata.githubStars={repoUrl,count,fetchedAt}` lưu nguồn và thời điểm. Số hiển thị rút gọn K/M, số gốc vẫn giữ trong JSON. Badge ghi ngày cập nhật.
- Server tạo bản nháp và pipeline render đọc số thật. Render cập nhật snapshot trong script; rerender dùng snapshot đã lưu để tái lập video. Nếu API lỗi/rate limit hoặc nguồn không phải repo GitHub, ẩn badge; không bịa số.
- `githubStarLeadIn` tùy chọn trên scene phục vụ block-plan; composer suy ra từ snapshot khớp repo, không tin cờ này để hiển thị số. Timing có ID `stars`, sửa được như các block khác.
- Dự án không có snapshot giữ hook cũ. Không thêm dependency hoặc thay đổi stack. Lời đọc giữ cho người dùng biên tập; badge không tự chèn câu mới vào lời đã duyệt/audio tải lên.

## Kiểm chứng

`src/script/github-stars.test.ts`: HTTP reader giả kiểm tra count thật/0, sai repo, số âm/số lẻ/string, API lỗi và URL không hợp lệ; renderer kiểm tra snapshot đúng nguồn, count 12.3K, stable ID và badge trước tên, đường dựng legacy.

Clip `output/github-stars-hook-validation/video.mp4` dùng repo GSAP với snapshot GitHub API lưu ở `github-stars.json`; đây là clip minh họa tính năng hook, không đổi nội dung video trước. Lời mở “Hơn 29 nghìn sao…” dựa vào snapshot 29.883 sao ngày 29/10/2026. Không coi giá trị này là số hiện tại cho mọi lần dựng sau.

## Kết quả thực tế

- `npx tsc --noEmit`: exit0.
- `npm test`: 48 files / 231 tests passed, exit0 (16,94 giây).
- Kiểm tra cú pháp JS và `git diff --check`: exit0.
- MP4 cuối: 1080×1920, 30fps, có audio, 10,433333 giây; xác minh độc lập bằng ffprobe trước khi thay clip thử cũ.
- Xem khung 0,2 / 0,55 / 0,95 / 1,6 giây: số tăng trước, sao sáng rồi tới logo/tên; đã sửa khoảng trống để count và nhãn không chồng chữ. Bằng chứng `star-animation.jpg`, `hook-3.png` cạnh MP4; tests.log/typecheck.log/render.log/ffprobe.json lưu cùng thư mục.
- Lần render hai worker sau khi sửa CSS bị timeout khi khởi động Chrome ở một worker. Xuất lại bằng một worker thành công (80,1 giây). Đây là lỗi hạ tầng render đã khắc phục trong lần kiểm chứng, không tăng timeout hoặc bỏ kiểm tra.
- Chưa nghe/duyệt độ khớp âm từng từ; provider trả timing low. Không thêm dependency, không commit. Diff lượt này: `docs/github-star-hook-changes.patch`.
