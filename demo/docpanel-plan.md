# Sổ tài liệu theo phiên — kế hoạch (chờ duyệt)

Demo tương tác: `demo/docpanel.html` (8 bước).

## Mục tiêu
Hỏi nhanh design / tài liệu hệ thống bằng model rẻ (Haiku), không phải hỏi trong phiên chính đang chạy Opus. Câu trả lời chỉ lấy từ tài liệu đã nạp, kèm trích dẫn (kiểu NotebookLM).

## Luồng chính (bạn đã nêu)
1. **Mở sổ**: nút `📚 Tài liệu` trên thanh phiên mở khung bên phải.
2. **Nạp tài liệu**, có 3 cách:
   - dùng lại bộ nguồn đã lưu của dự án;
   - nhờ Haiku tự tìm (quét `*.md` trong dự án, tìm trên gdd, đọc link Figma trong tin nhắn đầu phiên), rồi đề xuất danh sách kèm lý do và kích thước; bạn tick chọn;
   - tự thêm: trang gdd, link Figma, tệp hoặc thư mục `.md`, dán chữ.
3. **Sổ đi theo phiên**:
   - Đổi phiên thì khung đổi theo.
   - Phiên chưa mở sổ thì khung tự ẩn.
   - Sidebar hiện dấu 📚 cho phiên đã có sổ.
4. **Phiên mới** trong cùng dự án: đề nghị "Dùng lại ngay" (không tốn lượt), "Tìm lại theo việc của phiên này", hoặc "Không cần".
5. **Hỏi đáp trong phạm vi**:
   - Trả lời kèm số trích dẫn; bấm số để xem đúng đoạn gốc, nút ↗ mở nguồn.
   - Không có trong tài liệu thì nói rõ là không có, không bịa.

## Đề xuất thêm (luồng bạn chưa nêu)
| # | Luồng | Vì sao đáng có |
|---|---|---|
| A | **Chèn vào chat**: đưa câu trả lời + đoạn trích (~vài trăm token) vào ô nhập phiên chính | Đây là chỗ tiết kiệm thật: Opus nhận đúng đoạn cần, không tự đi đọc cả trang gdd/Figma |
| B | **Bôi đen chữ trong chat chính → "Tra trong tài liệu"** | Hỏi ngược lại không cần gõ lại |
| C | **Báo mâu thuẫn** giữa các nguồn (vd gdd 5 lượt, Figma ghi 3) | Hay gặp nhất khi code theo design |
| D | **Câu hỏi mở cho designer**: câu không có trong tài liệu hoặc bị mâu thuẫn → ghi vào danh sách, xuất `.md` gửi designer | Gom việc cần hỏi người, không bị quên |
| E | **Ghim ghi chú** dùng chung cho cả dự án; phiên mới thấy luôn | Câu đã hỏi rồi không phải hỏi lại (0 đồng) |
| F | **Tài liệu đổi**: gdd sha mới / `.md` đổi mtime / frame Figma đổi cấu trúc → nguồn chuyển màu cảnh báo, câu trả lời và ghi chú cũ bị đánh dấu "có thể cũ", có nút nạp lại & hỏi lại | Tránh code theo bản design cũ |
| G | **Nâng model cho riêng một câu** (↻ Sonnet) khi Haiku trả lời chưa tới | Mặc định rẻ, chỉ trả thêm khi cần |
| H | **Tóm tắt + 3 câu hỏi gợi ý** sau khi nạp (tắt được) | Nắm nhanh tài liệu có gì |
| I | **"Biết phiên chính đang làm gì"**: gửi kèm tên phiên + tin nhắn gần nhất (~150 token) | Câu trả lời đúng ngữ cảnh việc đang làm |
| J | **Tách cửa sổ riêng** (⧉) cho màn hình thứ 2, vẫn đi theo phiên đang chọn | Phiên chính không bị chật |
| K | **Chân sổ báo chi phí**: tổng tiền của sổ, so với ước tính nếu hỏi model phiên chính | Thấy rõ đã tiết kiệm được bao nhiêu |
| L | **Dùng chung với Dự án tự động**: `sources.json` của autopilot thành bộ nguồn của sổ, và ngược lại | Một chỗ khai báo design |

Để giai đoạn 2:
- **Phiên chính tự hỏi sổ**: GUI cung cấp một MCP `ask_docs` để Opus nhờ Haiku tra rồi chỉ nhận đoạn trích.
- **Kèm ảnh frame Figma trong câu trả lời** (tốn token ảnh hơn).

## Thiết kế kỹ thuật
- **Mỗi sổ là một phiên CLI riêng** (Haiku · low mặc định):
  - Mọi lần hỏi đều resume cùng session id để giữ cache.
  - Có ghi jsonl như phiên thường nên vẫn đồng bộ tracking. Không dùng `--no-session-persistence`.
  - Phiên sổ không hiện lẫn trong sidebar (gắn dưới phiên cha), mở được từ ⋯ → "Mở phiên sổ trong lịch sử".
- **Chỉ cho đọc** (đã kiểm tra các cờ này có trong CLI 2.1.312):
  - `--tools Read,Grep,Glob` bỏ hết Bash/Edit/Write. Ít tool thì system prompt nhỏ hơn nên càng rẻ.
  - `--allowedTools` chỉ cho các tool đọc của MCP nguồn đã chọn (vd `mcp__gdd__read_page`, `mcp__gdd__search`, `mcp__figma__get_metadata`…).
  - Tool khác mà xin quyền thì GUI tự từ chối.
  - `--append-system-prompt` (hoặc skill `claude-gui:so-tai-lieu` trong bộ plugin sẵn có) đặt quy tắc: chỉ trả lời từ nguồn; mỗi ý phải có trích dẫn; không có thì nói "không có"; nguồn mâu thuẫn thì báo.
- **Không nhồi cả tài liệu vào ngữ cảnh**:
  - GUI gửi "mục lục nguồn": danh sách tệp + heading, trang gdd + sha, frame Figma.
  - Khi hỏi, Haiku tự tra đúng mục bằng `Grep`/`Read offset`, `find_in_page`/`read_page section`, `get_metadata`.
  - Tài liệu lớn mấy cũng chỉ tốn phần được tra.
- **Định dạng trả lời**: văn bản + khối trích dẫn JSON (`{n, src, loc, quote}`) ở cuối. GUI tách khối đó ra để vẽ số [1][2] và hộp đoạn gốc. Với tệp local, GUI tự đọc dòng gốc (miễn phí).
- **Lưu trữ**:
  - Theo dự án, `<dự án>/.claude-gui/notebook/`:
    - `sources.json`: bộ nguồn;
    - `notes.md`: ghi chú ghim;
    - `questions.md`: câu hỏi mở.
    - Thư mục này đã được tự thêm vào `.git/info/exclude`.
  - Theo phiên, trong settings: phiên cha → session id của sổ, nguồn đang bật, khung mở/đóng.
- **Phát hiện tài liệu đổi**:
  - gdd: so `release.sha` (có `get_changes`).
  - `.md`: mtime.
  - Figma: so XML cấu trúc frame như autopilot đang làm.
  - Kiểm tra khi mở sổ hoặc trước khi hỏi, tối đa 1 lần / 10 phút.
- **Ngữ cảnh phiên dài**: hội thoại sổ dài quá thì ⋯ → "Làm mới hội thoại": giữ nguồn và ghi chú, mở phiên sổ mới.

## Chi phí (ước tính)
- Mỗi câu hỏi Haiku · low ~0.002–0.004 USD (tra 1–3 mục).
- Cùng câu đó hỏi Opus trong phiên chính đắt hơn hàng chục lần: giá Opus cao hơn, và phiên chính đang mang cả ngữ cảnh dài.
- Luồng A (chèn vào chat) thì Opus chỉ đọc ~300 token đoạn trích thay vì tự gọi MCP đọc cả trang.

## Chia việc khi làm
1. Khung sổ + gắn theo phiên + nạp nguồn thủ công + hỏi đáp có trích dẫn (lõi).
2. Haiku tự tìm nguồn + bộ nguồn dự án + phiên mới dùng lại.
3. Chèn vào chat, bôi đen để tra, ghim, câu hỏi mở, mâu thuẫn.
4. Phát hiện tài liệu đổi + nâng model từng câu + tách cửa sổ + chi phí.

## Cần bạn chốt
1. **Sổ theo phiên hay theo dự án?** Đề xuất: hội thoại theo phiên (như bạn nói); bộ nguồn + ghim theo dự án để phiên mới dùng lại.
2. **"Chỉ trong tài liệu" có cho đọc code không?** Đề xuất mặc định không. Thêm nút "So với code" khi cần (vẫn Haiku, chỉ đọc).
3. **Khung bên phải hay cửa sổ riêng?** Đề xuất: mặc định khung bên phải (chung chỗ với khung xem tệp, có tab chuyển); có nút tách cửa sổ.
