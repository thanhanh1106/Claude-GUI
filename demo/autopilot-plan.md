# Kế hoạch: Dự án tự động (lên kế hoạch → lập lịch → nhiều agent)

Demo: `demo/autopilot.html` (7 bước). Dự kiến phát hành ở bản **1.10.0**. Trạng thái: **chờ duyệt**, chưa sửa code app.

## Mục tiêu

Bạn đưa design hoặc yêu cầu lớn và bảo "lên kế hoạch". Claude (model mạnh) viết kế hoạch chi tiết rồi hỏi **"Bạn có muốn tôi tự động lập lịch trình chạy?"**. Nếu đồng ý, việc được chia thành nhiều task trong hàng đợi, mỗi task được đề xuất model và effort riêng để tiết kiệm. Bạn duyệt, sửa nếu muốn, rồi hàng đợi chạy hết. Gặp vấn đề hoặc design đổi thì dừng lại hỏi và sửa lịch.

## Nguyên tắc

- Mọi thứ đều chạy qua Claude CLI như hiện nay (vẫn ghi vào `~/.claude/projects`), không giả mạo gì.
- **Model mạnh quyết định, model rẻ thực thi.** Lập kế hoạch, đổi lịch và phân tích design đổi luôn do phiên điều phối (Opus) làm. Task Haiku chỉ nhận prompt đã viết hoàn chỉnh, không phải tự suy ra "cái gì đã đổi".
- Không bao giờ nhét thay đổi vào phiên đang chạy.
- Mỗi task chạy trong một phiên mới để ngữ cảnh gọn và rẻ. Ngữ cảnh chung đi qua tệp.

## Các phần cần làm

### 1. Bộ skill đi kèm GUI
- Thư mục plugin trong app gồm 3 skill:
  - `lap-ke-hoach`: lên kế hoạch, hỏi có lập lịch không, chia task và đề xuất model/effort.
  - `lam-task`: đọc ngữ cảnh và bàn giao, làm đúng phạm vi, ghi bàn giao cho task sau.
  - `xin-doi-lich`: khi kế hoạch sai thì dừng và ghi yêu cầu đổi lịch.
- Nạp bằng `--plugin-dir` (CLI 2.1.312 có cờ này). Chỉ phiên chạy từ GUI thấy các skill, `~/.claude/skills` không bị đụng tới. Bản đóng gói sẽ chép plugin ra thư mục userData vì CLI không đọc được bên trong asar.
- Cài đặt có mục "Bộ skill của Claude GUI" (bật/tắt, xem nội dung).
- Ô nhập có nút "📐 Lên kế hoạch & lập lịch" để gọi skill trực tiếp, không phụ thuộc vào việc skill tự kích hoạt.

### 2. Tệp trao đổi giữa agent và GUI
Đặt trong `.claude-gui/runs/<id>/`. GUI tự thêm thư mục này vào `.git/info/exclude`.

| Tệp | Ai ghi | Nội dung |
|---|---|---|
| `plan.md` | planner | Kế hoạch cho người đọc |
| `plan.json` | planner | Task: title, prompt, model, effort, deps, tiêu chí xong, checkpoint, lý do |
| `context.md` | planner | Bức tranh tổng: mục tiêu, quyết định, quy ước, **phiên bản design hiện hành**, lịch sử đổi design |
| `design/sources.json` | planner | **Dấu vân tay design**: Figma (file, frame và node id, hash cấu trúc từ `get_metadata`), gdd (project, các trang, `release.sha`) |
| `handoff/<task>.md` | từng task | Đã làm gì, tệp nào, lưu ý cho task sau, đạt tiêu chí chưa |
| `replan/<task>.json` | task | Lý do, mức độ, đề xuất đổi lịch |

GUI nhận ra các tệp này khi agent ghi (qua công cụ Write) và hiện thẻ tương ứng.

### 3. Màn duyệt (trong Lịch & hàng đợi, loại kế hoạch "Dự án")
- Task chia theo giai đoạn. Mỗi task sửa được prompt, model, effort, phụ thuộc, "dừng chờ duyệt", "nối tiếp phiên trước".
- Chi phí ước tính tương đối so với chạy hết bằng Opus (giá tương đối × hệ số effort × độ lớn). Sau khi chạy hiện chi phí thật từ usage.
- Khi nào chạy: ngay, khi giới hạn 5 giờ hồi, hoặc vào giờ cụ thể. Hết giới hạn giữa chừng thì tự tạm dừng và chạy tiếp.
- Chính sách đổi lịch: **Luôn hỏi tôi** (mặc định), Tự sửa việc nhỏ, hoặc Để planner tự quyết.
- **Nguồn design**: hiện các nguồn đã ghi, kèm ô "Tự kiểm tra design trước mỗi giai đoạn".
- **MCP được dùng**: tự đề xuất cho phép trước các công cụ **chỉ đọc** (`figma get_*`, các công cụ đọc của `gdd`) để hàng đợi không đứng chờ. Công cụ ghi vào design (`use_figma`…) bị chặn.
- Nút "Góp ý cho Claude sửa kế hoạch": gửi về phiên lập kế hoạch, màn duyệt tự cập nhật.

### 4. Phần chạy hàng đợi (mở rộng `sched.js`)
- Prompt mỗi task = skill `lam-task` + `context.md` + bàn giao của các task phụ thuộc + prompt task + tiêu chí xong.
- Điểm dừng chờ duyệt sau task hoặc giai đoạn.
- Task xong mà chưa ghi bàn giao thì GUI nhắc một câu. Bàn giao ghi "chưa đạt tiêu chí" hoặc task lỗi thì dừng và hỏi (lưới an toàn khi agent không tự nhận ra vấn đề).

### 5. Đổi lịch và thay đổi design
- **Task xin đổi lịch**: hàng đợi tạm dừng, robot và thông báo Windows gọi bạn, yêu cầu được chuyển cho phiên điều phối. Phiên điều phối soạn bản sửa dạng thêm, sửa, bỏ task. Bạn chọn Chấp nhận, Sửa rồi chấp nhận, Bỏ qua, hoặc Dừng.
- **Nút "📝 Cập nhật yêu cầu / design"** của dự án:
  - Design nằm trong Figma hoặc gdd có MCP thì **chỉ cần gõ một câu**. Phiên điều phối tự lấy bản mới qua MCP, so với `design/sources.json`, và chỉ đọc lại phần đã đổi.
  - Task đang chạy có 3 lựa chọn: **cho chạy xong rồi áp dụng** (mặc định), dừng ở điểm an toàn (ghi bàn giao rồi dừng), hoặc chỉ hoãn các task sau.
  - Kết quả: `context.md` lên phiên bản design mới. Task đã xong bị ảnh hưởng thì thêm task "sửa lại" (không mở lại phiên cũ). Task chưa chạy được viết lại prompt hoàn chỉnh.
- **Tự phát hiện design đổi** (nếu bật): trước mỗi giai đoạn chạy một kiểm tra Haiku, effort thấp.
  - **gdd**: `get_changes(since_sha)` cho biết chính xác trang nào đổi.
  - **Figma**: `get_metadata` các frame đã ghi, rồi GUI so hash cấu trúc. MCP không trả về phiên bản file nên chỉ bắt được thay đổi về cấu trúc (lớp, vị trí, kích thước). Đổi chỉ màu hoặc chữ có thể không bắt được; khi đó bạn gõ một câu báo.
  - Không đổi thì chạy tiếp (tốn khoảng một lượt Haiku). Có đổi thì dừng và hiện "Design đã đổi — Phân tích & đề xuất sửa lịch", rồi đi tiếp luồng ở trên.

### 6. Kiểm thử và phát hành
- Chạy thử trong app với một dự án nhỏ: lên kế hoạch → duyệt → chạy 3–4 task Haiku/Sonnet → giả lập xin đổi lịch → giả lập design đổi.
- Tăng phiên bản lên 1.10.0, cập nhật README / HUONG-DAN, phát hành, kiểm tra máy chủ cập nhật.

## Giới hạn và chưa làm trong bản này
- Chạy **tuần tự**. Song song bằng git worktree để giai đoạn sau.
- Agent tự nhận ra kế hoạch sai không chắc chắn 100%. Lưới an toàn là tiêu chí xong trong bàn giao và trạng thái lỗi.
- Lệnh shell ngoài danh sách cho phép vẫn hỏi quyền; robot sẽ gọi bạn.
- Figma chỉ phát hiện tự động được thay đổi cấu trúc (xem trên).

## Mặc định đề xuất (đổi được khi duyệt)
- Chính sách đổi lịch: **Luôn hỏi tôi**.
- Task đang chạy khi design đổi: **Cho chạy xong rồi áp dụng**.
- Tự kiểm tra design trước mỗi giai đoạn: **bật**.
- Tệp trao đổi: `.claude-gui/` trong dự án, loại khỏi git.
