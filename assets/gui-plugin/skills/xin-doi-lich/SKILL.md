---
name: xin-doi-lich
description: Dùng khi đang làm một task trong hàng đợi "dự án tự động" của Claude GUI mà phát hiện kế hoạch không còn đúng (design mâu thuẫn với code, giả định sai, thiếu bước phải làm trước, việc lớn hơn nhiều so với ước lượng) — dừng đúng lúc và ghi yêu cầu đổi lịch để phiên điều phối sửa kế hoạch.
user-invocable: false
---

# Xin đổi lịch (Claude GUI)

Bạn **không** tự sửa kế hoạch và **không** làm lệch phạm vi task. Việc của bạn: dừng ở điểm an toàn và báo rõ.

1. Dừng sửa code. Nếu đang dở, để code ở trạng thái không hỏng (hoàn tác phần dở nếu cần).
2. Ghi `RUN/replan/<id task>.json`:
   ```json
   {
     "task": "<id task>",
     "severity": "block",
     "reason": "Mô tả vấn đề cụ thể: thấy gì, ở tệp nào, vì sao kế hoạch hiện tại không làm được / sẽ sai",
     "proposal": "Đề xuất: thêm task gì trước, sửa task nào, bỏ task nào (gợi ý, phiên điều phối sẽ quyết)",
     "done": "Phần đã làm được (nếu có)"
   }
   ```
   `severity`: `"block"` = không làm tiếp được; `"warn"` = làm được nhưng kế hoạch nên sửa (khi đó vẫn làm xong task rồi mới ghi tệp này).
3. Ghi bàn giao như thường (skill `claude-gui:lam-task`), dòng `Đạt tiêu chí:` ghi `không` hoặc `một phần`.
4. Kết thúc lượt, trả lời ngắn: đã xin đổi lịch vì sao.

Claude GUI sẽ tạm dừng hàng đợi, gọi người dùng, và nhờ phiên điều phối soạn bản sửa lịch.
