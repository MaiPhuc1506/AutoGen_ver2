# ADR: Voice Studio và Tech Editorial

Ngày 25/10/2026. Giữ Node/TypeScript, Express, Zod và HyperFrames.

- Bản đầu gồm voice upload MP3/WAV, provider/voice/speed, preview audio, duyệt lời từng cảnh, preview phong cách và render. Không nhập nguyên cả 15 demo mg-styles-15; Tech Editorial là CSS/GSAP mới viết, lấy định hướng từ video tham chiếu. Không sao chép mã/asset từ bộ demo.
- Trường tùy chọn `visualStyle` và `voice.settingsSource: "script"` mở luồng mới. JSON cũ vẫn dùng cấu hình provider/tốc độ môi trường. V1 fixture giữ trong test hồi quy.
- Chọn provider/voice theo từng request, không ghi vào process.env. API key chỉ cấu hình server trong `.env.local`. Studio dùng Flash v2.5 nếu cấu hình cũ còn Multilingual v2 không hỗ trợ tiếng Việt.
- Edge/Vbee dùng tốc độ native. ElevenLabs/LucyLab dùng FFmpeg atempo (giữ cao độ), đồng thời co timestamp. Dải tốc độ Studio 0,5–2x, Vbee tối đa 1,9x. Không thêm API tham số chưa được xác minh.
- Cache audio dùng SHA256 của lời đã qua lexicon và cấu hình giọng/tốc độ/model/endpoint. Không lưu key. Cache cũ thiếu fingerprint được tạo lại một lần. Metadata lưu accuracy riêng; words.json vẫn là mảng để tương thích.
- Upload raw body tối đa 30 MB, xác minh container và audio bằng ffprobe, dài 1–600 giây, chuẩn hóa WAV mono. Tên lưu là UUID, không nhận đường dẫn do client cung cấp. Thư mục `.uploads` nằm ngoài public/output và được gitignore.
- Voice tải lên giữ track liên tục, không chèn silence vào giữa. Các đoạn MP3 dành cho timeline; bản mix dùng source liên tục. Mốc cảnh mặc định chia theo lượng lời, có thể sửa ở bước duyệt. Không tuyên bố có forced alignment.
- Có SRT thì giữ thời gian cue; từ bên trong cue vẫn là ước lượng. Không SRT thì caption chia theo lời và thời lượng. Style mới tắt highlight khi accuracy thấp; timing-quality.json mô tả chất lượng.
- Tech Editorial dùng cùng composer và pipeline, giảm gap còn 80 ms, outro hold 600 ms. Hiệu ứng chi tiết tìm cụm tương ứng trong timestamp lời; không tìm được thì stagger. Đây chưa phải đồng bộ ngữ nghĩa mọi thành phần.
- Thêm GSAP đúng phiên bản đang dùng (3.14.2) như dependency nhẹ để render offline, thay CDN cho preset mới. Font Be Vietnam Pro Bold đóng gói theo OFL, kèm giấy phép. Không thêm framework hoặc dependency upload.
- Preview phong cách là demo minh họa; video cuối dùng audio và nội dung thực. Chưa có preview toàn bộ bản dựng trước render ngoài trình chỉnh sửa hiện hữu.

- Render ra MP4 tạm riêng cho mỗi lần chạy, ffprobe xác nhận kích thước/audio/thời lượng rồi mới thay MP4 cũ. Watchdog chỉ xét file mới đã hợp lệ, giữ cách xử lý CLI treo sau khi hoàn tất.
- Bộ test cấu hình LLM dùng fake provider và phục hồi file cấu hình sau khi chạy; không để test ghi đè thiết lập người dùng.

## Bổ sung: hook và Dynamic (25/10/2026)

- `motionPreset: "dynamic" | "calm"` là tùy chọn. Script cũ không có trường này giữ animation cũ. UI tạo mới chọn Dynamic; Calm vẫn có trong dropdown.
- Dynamic dùng GSAP seekable cho từng cụm headline, chữ số, gạch nhấn, nền grid/orb/particles, thẻ đánh số, progress và sweep chuyển cảnh. Không dùng random hay timer cho hình.
- Sound design tùy chọn, hai hiệu ứng tổng hợp bằng FFmpeg tại máy, không tải sample. `scene.sfx` có sẵn vẫn ưu tiên; `soundDesign:false` tắt SFX. Thử nghiệm không thay voice hoặc nhạc gốc.
- Fallback kịch bản chỉ lấy câu và số trong nguồn, không thêm tính năng chung chung. Ba hướng hook từ nguồn để người dùng chọn; không gọi đó là hook AI. Mẫu viết lại chuyên biệt chỉ áp dụng khi có bằng chứng câu tương ứng trong nguồn.
- Khi có LLM, prompt yêu cầu hook ngắn, có kết quả/vấn đề cụ thể và payoff ngay sau hook; sửa schema comparison trong prompt. Web ưu tiên phần nội dung đã trích xuất/người dùng sửa thay vì đọc lại HTML giao diện GitHub.
- `generation` thông báo rõ AI / source-only / imported. Hook AI vẫn cần người dùng duyệt; không cam kết hiệu quả giữ chân hay chất lượng ngang mẫu chỉ từ unit test.
