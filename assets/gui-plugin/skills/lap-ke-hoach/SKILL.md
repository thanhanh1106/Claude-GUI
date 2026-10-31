---
name: lap-ke-hoach
description: Lên kế hoạch chi tiết cho một việc lớn (design, tài liệu thiết kế, yêu cầu nhiều bước) rồi hỏi người dùng có muốn tự động lập lịch chạy không; nếu có thì chia thành nhiều task, đề xuất model + effort cho từng task và ghi plan.json để Claude GUI mở màn duyệt. Dùng khi người dùng bảo "lên kế hoạch", "chia việc", "lập lịch chạy", "làm theo design này", hoặc khi được yêu cầu soạn lại / sửa kế hoạch của một dự án tự động.
user-invocable: true
---

# Lên kế hoạch & lập lịch (Claude GUI)

Bạn là **phiên điều phối**: hiểu toàn cục, quyết định cách chia việc. Bạn **không tự làm các task** — các task sẽ do nhiều phiên khác (thường rẻ hơn) làm theo hàng đợi của Claude GUI.

## 1. Hiểu việc
- Đọc hết design / tài liệu / yêu cầu được đưa. Design trong Figma hoặc trang tài liệu có MCP thì đọc qua MCP (Figma: `get_design_context`, `get_metadata`; tài liệu thiết kế: `read_page`, `search`…).
- Đọc phần code liên quan để biết cái gì đã có, quy ước của dự án (CLAUDE.md, cấu trúc thư mục, mẫu có sẵn).
- Chỗ nào mơ hồ mà ảnh hưởng tới cách chia việc thì hỏi người dùng (AskUserQuestion) trước.

## 2. Viết kế hoạch
- Chọn mã chạy `<runId>`: chữ thường không dấu + ngày, vd `man-shop-2910`. Thư mục chạy: `<thư mục dự án>/.claude-gui/runs/<runId>/` (gọi là RUN).
- Ghi `RUN/plan.md`: mục tiêu, hiện trạng, các giai đoạn, rủi ro — cho người đọc.
- Tóm tắt kế hoạch trong chat (ngắn gọn).

## 3. Hỏi có lập lịch không
Dùng AskUserQuestion, câu hỏi: **"Bạn có muốn tôi tự động lập lịch trình chạy?"** với các lựa chọn:
- "Có — chia task và đưa vào hàng đợi để tôi duyệt"
- "Có, và dừng chờ tôi duyệt sau mỗi giai đoạn"
- "Không — chỉ cần bản kế hoạch"

Chọn "Không" thì dừng ở đây.

## 4. Chia task (khi người dùng đồng ý)
Mỗi task phải **tự đứng được**: một phiên mới chỉ đọc prompt của task + context.md + bàn giao của các task nó phụ thuộc là làm được, không cần đọc lại cuộc trò chuyện này.

- Prompt task viết đầy đủ, cụ thể: làm gì, ở tệp/thư mục nào, theo mẫu nào có sẵn, không làm gì. Với model rẻ (haiku) càng phải cụ thể.
- `acceptance`: tiêu chí xong kiểm tra được (chạy lệnh gì, thấy gì).
- `deps`: id các task phải xong trước.
- `size`: độ lớn ước lượng 1–5.
- Đề xuất **model + effort rẻ nhất mà vẫn làm đúng**, kèm `why` (một câu):
  - `haiku` · low/medium — việc lặp, có khuôn, sinh code theo mẫu, đổi tên hàng loạt, test theo danh sách case rõ ràng, tài liệu.
  - `sonnet` · medium/high — triển khai tính năng, nối API, UI theo design, sửa lỗi thường.
  - `opus` · high — kiến trúc, mô hình dữ liệu, thay đổi rủi ro (tiền tệ, bảo mật, migrate dữ liệu), lỗi khó, rà soát tổng.
  - `fable` chỉ khi thật sự cần (đắt nhất).
- `checkpoint: true` sau task / giai đoạn rủi ro (người dùng duyệt trước khi chạy tiếp). Người dùng chọn "dừng sau mỗi giai đoạn" thì đặt checkpoint ở task cuối mỗi giai đoạn.
- `continue: true` chỉ khi task gắn chặt với task ngay trước và cần nguyên ngữ cảnh của phiên đó (hiếm).
- Nên có một task rà soát tổng ở cuối (chạy test, đọc diff, so với design).

## 5. Ghi tệp
1. `RUN/context.md` — bức tranh tổng mà mọi task đều đọc (giữ gọn, ≤ 150 dòng):
   - Mục tiêu; tóm tắt design (màn hình, luồng, dữ liệu); **Design hiện hành: v1** (+ nguồn);
   - Quyết định đã chốt; quy ước code của dự án; những gì không được đổi.
2. `RUN/design/sources.json` (khi design đọc qua MCP) — ghi lại bản design đã đọc để sau này biết có đổi không:
   ```json
   {
     "figma": { "fileKey": "…", "frames": [ { "name": "Shop/Items", "nodeId": "12:40" } ] },
     "gdd": { "project": "…", "pages": ["…"], "sha": "<release.sha lúc đọc>" },
     "other": "mô tả nguồn khác nếu có"
   }
   ```
   Với mỗi frame Figma: gọi `get_metadata` cho node đó và ghi **nguyên văn** kết quả XML vào `RUN/design/figma/<nodeId thay ':' bằng '-'>.xml`.
3. `RUN/plan.json` — **ghi cuối cùng** (Claude GUI mở màn duyệt khi thấy tệp này):
   ```json
   {
     "version": 1,
     "name": "Tên ngắn của dự án",
     "goal": "Một hai câu mục tiêu",
     "dir": "<đường dẫn tuyệt đối thư mục dự án>",
     "addDirs": ["<thư mục khác cần đụng tới, nếu có>"],
     "phases": [ { "id": 1, "name": "Nền móng" }, { "id": 2, "name": "Triển khai" } ],
     "mcp": ["mcp__figma__get_design_context", "mcp__figma__get_metadata", "mcp__gdd"],
     "tasks": [
       { "id": "t1", "phase": 1, "title": "…", "prompt": "…", "acceptance": "…",
         "model": "opus", "effort": "high", "size": 3, "why": "…",
         "deps": [], "checkpoint": false, "continue": false }
     ]
   }
   ```
   - `mcp`: các công cụ MCP **chỉ đọc** mà task cần (tên đầy đủ `mcp__<server>__<tool>`, hoặc `mcp__<server>` cho cả server chỉ-đọc). Không đưa công cụ ghi/sửa design.
   - id task là chuỗi ngắn ổn định (`t1`, `t2`…).

Xong thì nói ngắn: đã chia N task / M giai đoạn, model nào dùng cho việc gì. **Không bắt đầu làm task nào.**

## Khi được yêu cầu soạn lại kế hoạch
(Claude GUI gửi: task xin đổi lịch, design/yêu cầu thay đổi, hoặc góp ý của người dùng.)
- Đọc `RUN/plan.json`, `RUN/context.md`, các bàn giao `RUN/handoff/*.md` và yêu cầu kèm theo.
- Design thay đổi: lấy bản mới qua MCP, so với `RUN/design/sources.json` (và các tệp XML đã lưu) — chỉ đọc kỹ phần đã đổi. Cập nhật `context.md` (**Design hiện hành: vN**, thêm mục "Thay đổi design vN" và lịch sử), cập nhật `sources.json` (sha mới) và các tệp XML.
- Ghi lại **toàn bộ** `RUN/plan.json`:
  - Giữ nguyên id của task cũ. Task đã xong (`"status": "done"` trong tệp GUI đưa) giữ nguyên, **không** sửa prompt của nó; phần việc cần làm lại → thêm task mới (vd "Sửa lại … theo design v2").
  - Task chưa chạy bị ảnh hưởng → viết lại prompt **hoàn chỉnh** (model rẻ không phải tự suy ra cái gì đã đổi).
  - Task không còn cần → bỏ khỏi danh sách.
  - Thêm trường `"change": "một câu tóm tắt thay đổi"` ở cấp gốc.
- Không tự làm task.
