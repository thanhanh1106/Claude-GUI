# Claude GUI

Giao diện desktop cho Claude Code, bố cục theo bản Claude Code desktop mới nhất. **Mọi yêu cầu đều chạy qua Claude CLI (`claude.exe`)** bằng giao thức `stream-json`, nên đăng nhập, quyền, settings, hooks, MCP và chính sách của team đều do CLI xử lý y như khi dùng terminal.

## Dùng

- Chạy `dist\ClaudeGUI-1.19.0-portable.exe` (không cần cài). Máy chỉ cần có `claude` CLI đã đăng nhập.
- Nếu `claude` không nằm trong PATH: Cài đặt (`Ctrl ,`) → Claude Code → "Đường dẫn Claude CLI".

## Tính năng

**Phiên làm việc**
- Thanh bên hiện **mọi phiên cũ của máy/tài khoản** (đọc `~/.claude/projects`), nhóm theo dự án hoặc theo ngày, có tìm kiếm, lọc (đang chạy / lưu trữ), đổi tên, lưu trữ, xoá (vào Thùng rác).
- **Cây phiên con**: phiên có tác tử phụ hiện nút đếm (vd `› 3`) — bấm để mở cây các phiên con ngay dưới (tự mở khi có tác tử đang chạy). Bấm phiên con để xem toàn bộ những gì tác tử đó đã làm (chỉ xem, tự cập nhật khi tác tử đang chạy); thẻ tác tử trong hội thoại có nút "Phiên con".
- Nhận biết phiên đang chạy ở terminal khác (biểu tượng terminal); chuột phải → "Tiếp tục trong terminal" (`claude --resume`).
- **Phiên mới theo thư mục**: nút `+` cạnh mỗi dự án, hoặc chọn thư mục ngay dưới ô nhập (thư mục gần đây / chọn thư mục khác), bật **Worktree** cho repo git.

**Ô nhập & điều khiển**
- Chế độ quyền: Hỏi trước / Tự chấp nhận sửa / Lập kế hoạch / Tự động / Bỏ qua quyền (`Shift+Tab` đổi nhanh); nhớ chế độ theo từng thư mục.
- Chọn model + **thanh kéo Effort** (low → max), nút `/compact`.
- **Gợi ý câu nhắn tiếp theo**: sau mỗi lượt, Claude đoán câu bạn sẽ nhắn tiếp và hiện mờ trong ô nhập — bấm `Tab` để dán vào, `Enter` để gửi (giống bản desktop; dùng `--prompt-suggestions` của CLI, tốn thêm một yêu cầu nhỏ mỗi lượt; tắt ở Cài đặt → Chung).
- **Mỗi phiên giữ riêng** chữ đang gõ dở, tệp đính kèm, model, effort và chế độ quyền — chuyển qua lại không bị kéo theo; model/effort của phiên được nhớ cả khi mở lại app.
- **Mức sử dụng** (bấm vòng tròn cạnh nút gửi): ngữ cảnh, giới hạn phiên 5 giờ, giới hạn hàng tuần (tất cả model / từng model) kèm giờ làm mới — lấy qua CLI (`get_usage`, cùng dữ liệu lệnh `/usage`), tự cập nhật sau mỗi lượt trả lời.
- Gõ **`/usage`** (hoặc "Chi tiết" trong ô mức sử dụng) mở bảng đầy đủ như bản desktop: giới hạn gói, phiên này, "Điều gì đang dùng nhiều nhất" (hôm nay / 7 ngày, skill/MCP/plugin tốn nhiều).
- Phiên rất dài (hàng trăm MB) mở ngay: chỉ đọc phần cuối tệp trước, phần cũ hơn tải dần khi cuộn lên.
- Gợi ý lệnh `/` (kể cả skill, lệnh tuỳ chỉnh), nhắc tệp bằng `@`, dán/kéo thả ảnh & tệp, nhắn bổ sung **ngay giữa lượt** khi Claude đang làm: tin được coi là *bổ sung ngữ cảnh* cho việc đang làm — Claude tiếp thu rồi làm tiếp việc cũ, không bỏ dở (tin hiện nhãn "↳ gửi giữa lượt"; tắt ở Cài đặt → Nhập liệu).
- **Nút ▴ cạnh nút gửi** (`Ctrl+Shift+Enter`): Gửi ngay · **Đổi hướng** (dừng việc đang làm rồi làm theo tin này) · **Xếp sau việc hiện tại** · Lên lịch gửi… · Mở phiên mới sau khi xong…
- **Dừng có tóm tắt** (giống GUI chính): bấm Dừng/`Esc` khi Claude đang dùng công cụ → Claude dừng gọn rồi trả lời một đoạn ngắn: đã xong gì, còn dở gì, file nào đang sửa dở. Bấm Dừng lần nữa để dừng hẳn; tắt trong Cài đặt → Nhập liệu.

**Lịch & hàng đợi** (mục ngay dưới "Phiên mới"; lần đầu cập nhật có hướng dẫn 8 bước, xem lại bằng nút `?`):
- **Kế hoạch** = chuỗi bước, mỗi bước là một prompt (một thẻ sửa được bất cứ lúc nào, kể cả khi lịch đã lên). Thẻ cam **Phiên mới**: chọn thư mục, agent (`~/.claude/agents`), model, effort, chế độ quyền. Thẻ xanh **Nối tiếp phiên**: gửi vào phiên của bước trước (hoặc một phiên bất kỳ), chọn effort. Mỗi bước đính kèm được thư mục, repo, ảnh, tệp/video.
- **Kích hoạt**: bấm chạy · hẹn giờ · lặp theo thứ trong tuần · **khi giới hạn 5 giờ / tuần hồi lại** · khi một phiên đang chạy xong. Điều kiện giữa các bước: khi xong thành công / dù lỗi / chờ N phút / chờ giới hạn hồi.
- Hết giới hạn giữa chừng → kế hoạch tạm dừng và tự chạy tiếp khi giới hạn hồi. Đóng app khi còn lịch chờ → app thu xuống khay hệ thống (tắt được). Có kế hoạch mẫu để bắt đầu nhanh.

**Dự án tự động** (đưa design / yêu cầu lớn → Claude lên kế hoạch → bạn duyệt → nhiều agent chạy theo hàng đợi):
- **Bộ skill đi kèm GUI** (`claude-gui:lap-ke-hoach`, `lam-task`, `xin-doi-lich`) được nạp cho mọi phiên mở từ GUI bằng `--plugin-dir` — không đụng `~/.claude/skills`. Bật/tắt và xem nội dung ở Cài đặt → Claude Code → Bộ skill của Claude GUI.
- Bảo Claude "lên kế hoạch" (hoặc menu ▴ cạnh nút gửi → **Lên kế hoạch & lập lịch**): Claude đọc design (Figma / tài liệu qua MCP) và code, viết kế hoạch, hỏi **"Bạn có muốn tôi tự động lập lịch trình chạy?"**. Đồng ý → chia task, **đề xuất model + effort cho từng task** (kèm lý do), ghi `.claude-gui/runs/<id>/plan.json` — GUI tự mở **màn duyệt** trong Lịch & hàng đợi. Thư mục `.claude-gui/` tự được thêm vào `.git/info/exclude`.
- Màn duyệt: task theo giai đoạn, sửa tên / prompt / tiêu chí xong / model / effort / phụ thuộc / điểm dừng chờ duyệt, thêm / bỏ task; chi phí ước tính so với chạy hết bằng Opus (trọng số theo giá: Haiku 1 · Sonnet 20 · Opus 40 · Fable 100); khi nào chạy (ngay / khi giới hạn 5 giờ hồi / vào lúc); MCP được cho phép trước (chỉ đọc) và chế độ quyền.
- Mỗi task chạy một **phiên mới** (ngữ cảnh gọn, rẻ); GUI ghép vào prompt `context.md` (bức tranh tổng) + **bàn giao** của các task phụ thuộc. Xong task, agent ghi bàn giao (`Đạt tiêu chí: có / một phần / không`) cho task sau.
- **Xin đổi lịch**: task thấy kế hoạch sai → dừng, ghi lý do; hàng đợi tạm dừng, robot + thông báo gọi bạn → **phiên điều phối** (model mạnh) soạn bản sửa lịch (thêm / sửa / bỏ task) → bạn duyệt rồi chạy tiếp. Chính sách: luôn hỏi / tự nhờ planner soạn / để planner tự quyết.
- **Cập nhật yêu cầu / design** giữa chừng: chỉ cần gõ một câu (design có MCP thì phiên điều phối tự lấy bản mới, so với bản đã ghi, chỉ đọc lại phần đổi); task đang chạy được làm xong hoặc dừng ở điểm an toàn. Không bao giờ nhét thay đổi vào phiên đang chạy.
- **Tự kiểm tra design trước mỗi giai đoạn** (Haiku · thấp): tài liệu thiết kế dùng `get_changes`; Figma so cấu trúc frame (`get_metadata`). Có đổi → dừng hỏi; không đổi → chạy tiếp.
- Task chưa đạt tiêu chí / lỗi / bị dừng → dừng chờ bạn (chạy lại, làm tiếp, bỏ qua, nhờ sửa lịch).

**Sổ tài liệu** (nút 📖 trên thanh tiêu đề, `Ctrl+Shift+L`) — hỏi nhanh design / tài liệu hệ thống bằng model rẻ, không phải hỏi phiên chính đang chạy Opus:
- Khung bên phải **đi theo phiên**: mỗi phiên có sổ riêng (một phiên CLI Haiku · low, ẩn khỏi danh sách phiên nhưng vẫn ghi jsonl như mọi phiên); đổi phiên là đổi sổ, phiên chưa mở sổ thì khung ẩn.
- **Thư viện tài liệu dùng chung**: gõ tên tính năng (vd "Loạn chiến cửu châu") → sổ tìm trong thư viện và các tệp `.md` của dự án ngay tại máy (không tốn lượt). Phiên khác / phiên mới tìm lại được tài liệu đã lưu. Không có → báo không có và xin tài liệu: tệp, thư mục, link Figma, trang gdd / MCP, dán nội dung — hoặc **Nhờ tìm trên MCP** (gdd…), chọn nguồn rồi lưu thành tài liệu.
- Trả lời **chỉ trong phạm vi tài liệu** (giống NotebookLM), mỗi ý có số trích dẫn — bấm để xem đoạn gốc / mở tệp đúng dòng. Không có thì nói "Không có trong tài liệu"; nguồn mâu thuẫn thì báo **⚠ Mâu thuẫn** kèm cả hai bên.
- Dưới câu trả lời: **Chèn vào chat** (đưa câu trả lời + nguồn vào ô nhập phiên chính), **📌 Ghim** (ghi chú gắn với tài liệu, phiên khác dùng lại; gõ câu hỏi trùng sẽ gợi ý ghi chú cũ), **❓ Câu hỏi mở** (gom câu tài liệu thiếu / mâu thuẫn, xuất `.md` gửi designer), **↻ Sonnet** (hỏi lại trong phiên riêng chỉ mang tài liệu + câu hỏi).
- Bôi đen chữ trong chat chính → **Tra trong tài liệu**. gdd báo tài liệu đã đổi → cảnh báo, ghi chú ghim cũ bị đánh dấu "có thể cũ" (tệp `.md` đổi sau khi ghim cũng vậy).
- Phiên sổ chạy gọn cho rẻ: chỉ `Read/Grep/Glob`, chỉ nạp MCP mà tài liệu cần (`--strict-mcp-config`), bỏ các tool MCP dạng ghi, system prompt riêng — ~13k token ngữ cảnh mỗi lượt thay vì ~96k khi nạp mọi MCP. Chân sổ hiện chi phí thực tế.

**Chuyển kế hoạch / dự án tự động sang máy khác** (Lịch & hàng đợi) — kế hoạch đang treo mà dư máy thì đẩy sang Claude GUI máy kia chạy:
- **Xuất…** (kế hoạch thường) hoặc **⋯ → Xuất sang máy khác…** (dự án tự động) → tệp `.cgpack`: kế hoạch + thư mục RUN (context.md, plan.md, plan.json, design, bàn giao) + tệp đính kèm + trạng thái git (nhánh, commit, commit chưa push, tệp chưa commit) + danh sách đường dẫn tuyệt đối. Không gói lịch sử phiên; không gói thư mục `C:\WSP\anhnvt`. Máy cũ tự **tắt** kế hoạch và đánh dấu "đã xuất" để không chạy trùng.
- Máy kia: **Nhập** → chọn lại thư mục tương ứng (✓/✗ có tồn tại), xem trạng thái git + MCP cần dùng (vd gdd) → GUI thay đường dẫn trong kế hoạch / tệp RUN và ghi **ghi chú CHUYỂN MÁY** ở đầu context.md (hoặc đầu prompt từng bước): xuất từ máy nào / nhập vào đâu, thư mục đã đổi, đường dẫn **không có ở máy này**, phiên cũ không có, git cần ở commit nào. Kế hoạch nhập vào ở trạng thái tắt — xem rồi bật / duyệt.

**Hỏi người thật qua Lark** (Cài đặt → Lark) — Claude soạn câu hỏi cho game designer / người khác, bạn duyệt rồi bot gửi, câu trả lời quay về đúng phiên:
- Cần một app tự tạo trên Lark Developer: bật Bot; quyền bắt buộc `im:message:send_as_bot`, `im:message.p2p_msg:readonly`, `im:message:readonly` (tải ảnh / tệp người kia gửi), `contact:user.id:readonly` (tuỳ chọn `im:message.group_at_msg:readonly` để hỏi trong nhóm); sự kiện **Message received** (`im.message.receive_v1`) nhận qua **kết nối dài** (không cần server); publish và thêm người cần hỏi vào phạm vi dùng. Dán App ID + Secret vào Cài đặt → Lark (Secret mã hoá bằng safeStorage), thêm danh bạ (tên, vai trò, email Lark, **giới tính + tuổi** để Claude xưng hô đúng anh / chị / em / cô / chú thay vì đoán theo tên; có ô "Gọi là" để tự đặt). Điền thêm giới tính / tuổi của bạn ở mục Câu trả lời.
- Bảo Claude "hỏi designer đi" → Claude soạn câu hỏi đủ ngữ cảnh → **thẻ duyệt** (chọn người nhận, sửa nội dung, Gửi / Chép / Huỷ). Không bấm Gửi thì không có gì được gửi ra ngoài. Tự soạn: menu ▴ cạnh nút gửi → **Hỏi qua Lark…**; Sổ tài liệu → ❓ Câu hỏi mở → **📨 Lark**.
- Người nhận nhắn lại bao nhiêu tin cũng được (Reply hoặc nhắn thẳng cho bot) → tin vào **khung chat Lark trên ô nhập** của đúng phiên (chấm số ở thanh bên, mỗi người một tab). Bot không gửi "đã nhận". Chờ và chat qua lại **không tốn token**: Claude chỉ đọc khi bấm **Phân tích (n tin)** — cả cụm trong một lượt — hoặc khi bạn gửi tin tiếp theo (tin Lark chưa phân tích được kèm vào). Claude nhận **cả đoạn chat hai chiều** (câu bạn hỏi trong khung chat + câu trả lời, tin mới đánh dấu ★), không chỉ câu trả lời — để hiểu đúng ngữ cảnh. Ô nhập trong khung để nhắn thẳng cho người đó qua bot, không qua Claude (hiện bên kia là "Tên bạn: …"). Câu hỏi từ Sổ tài liệu thì trả lời tự ghim vào tài liệu. Tin không gắn với phiên nào vào **Hộp thư** (Cài đặt → Lark).
- Khung chat gửi / nhận **ảnh, video, tệp** (📎, dán ảnh Ctrl+V, kéo thả; cần quyền `im:resource`) — tệp nhận được tải về máy, Claude đọc được khi Phân tích. Hiện **✓✓ Đã xem** khi người kia đọc tin (thêm sự kiện **Message read** `im.message.message_read_v1`).
- Cài đặt → Lark có **hướng dẫn tạo bot từng bước kèm hình minh hoạ** màn hình Lark Developer.
- Bot chỉ nhắn được người **cùng tổ chức** với app và nằm trong phạm vi dùng. Đổi sang app khác (tổ chức khác) chỉ cần thay App ID / Secret.

**Hội thoại**
- Trả lời hiển thị trực tiếp khi Claude đang gõ, chữ hiện dần đều đặn (tắt được: Cài đặt → Chung → "Hiệu ứng chữ mượt"), markdown, tô màu code, nút sao chép.
- Thẻ công cụ: lệnh Bash/PowerShell kèm output, diff có số dòng khi sửa tệp, todo, tác tử phụ.
- **Tác tử phụ & tác vụ chạy nền**: thẻ tác tử hiện tiến độ trực tiếp (đang chạy nền · số công cụ · token · thời gian · công cụ đang dùng) và vẫn quay cho tới khi tác tử thật sự xong. Khi lượt chính đã trả lời mà tác tử vẫn chạy: dòng "Đang chờ N tác vụ chạy nền…", thanh tác vụ trên ô nhập (bấm để xem danh sách, bấm một dòng để nhảy tới thẻ, nút dừng từng tác vụ), chấm vòng ở thanh bên. Tác tử xong → Claude tự tiếp tục và hiện là đang chạy.
- Hộp xin quyền (Cho phép / Luôn cho phép / Từ chối / bảo Claude làm khác), trả lời câu hỏi trắc nghiệm, duyệt kế hoạch.
- 4 chế độ xem: Bình thường / **Suy nghĩ** (mở sẵn phần suy nghĩ, thẻ công cụ vẫn thu gọn) / Chi tiết / Tóm tắt (`Ctrl O`).

**Bắt kịp bản desktop gốc (1.18)**
- **Tự chạy tiếp khi giới hạn hồi**: hết giới hạn 5 giờ / tuần giữa chừng → thẻ đếm ngược tới giờ hồi, ô "Tự chạy tiếp" (mặc định bật), sửa được lời nhắn sẽ gửi; tới giờ GUI tự gửi vào đúng phiên (kể cả khi app vừa mở lại), phiên chờ có biểu tượng đồng hồ ở thanh bên. Phiên do Lịch / dự án tự động điều khiển thì để kế hoạch tự chạy tiếp.
- **Hỏi bên lề** (`/btw câu hỏi` hoặc `Ctrl+;`): khung nổi hỏi nhanh về việc đang làm mà không chen vào phiên chính (kể cả khi Claude đang chạy). Chạy phiên rẽ nhánh `--resume … --fork-session` chỉ có công cụ đọc; vẫn ghi jsonl như mọi phiên nhưng ẩn khỏi danh sách. "Chèn vào chat" / "Gửi vào phiên chính". Model: theo phiên chính (dùng lại cache) hoặc Haiku / Sonnet.
- **Góp ý từng dòng trên diff**: rê chuột vào dòng (thẻ Sửa tệp, diff trong bảng Thay đổi, diff git) → **+** → gõ góp ý; gom nhiều góp ý, `Ctrl+Enter` hoặc thanh "N góp ý" trên ô nhập để gửi một lần (kèm `tệp:dòng` và đoạn code).
- **Thẻ /code-review**: kết quả review (công cụ ReportFindings của CLI) hiện thành danh sách vấn đề có mức độ, nút Xem trong tệp · Sửa lỗi này · Sửa tất cả.
- **Chọn phần tử trên trang** (nút ⌖ trên khung xem trang web / HTML, `Ctrl+Shift+S`): rê chuột thấy khung cam, bấm để đính phần tử vào ô nhập — selector, chữ, style chính, HTML rút gọn và ảnh chụp đúng vùng đó.
- **Sửa tệp trong khung xem**: nút ✎ Sửa trên tab tệp, tự lưu sau 1 giây (`Ctrl+S` lưu ngay; tắt tự lưu ở Cài đặt → Khung xem), giữ nguyên CRLF / BOM; Claude sửa cùng lúc → báo xung đột (Giữ bản của tôi / Lấy bản mới). Nút ⋯ / chuột phải tab: Đính vào chat, Mở bằng VS Code / Cursor / Rider / Zed / Notepad++ (tự dò), Hiện trong thư mục, Sao chép đường dẫn.
- **Phiên nói chuyện với nhau**: GUI tự làm một MCP server HTTP nội bộ (`claude-gui`: list_sessions, read_session, send_to_session) cho mọi phiên — Claude đọc / nhắn được phiên khác; tin nhắn tới hiện thành thẻ, **bạn bấm Gửi** mới tới Claude ở phiên đó (biểu tượng tin nhắn ở thanh bên). Gõ `@` trong ô nhập để nhắc một phiên (kèm các lượt gần nhất của phiên đó). Tắt ở Cài đặt → Nhập liệu.
- **Đổi chỗ khung**: kéo đầu khung Xem trước / Sổ tài liệu / khung phải sang trái hoặc phải vùng chat (hoặc chuột phải đầu khung). Nút ⧉ trên khung xem **tách tab ra cửa sổ riêng** (đặt sang màn hình thứ 2).
- **Dev servers** (nút ▶ trên khung xem): đọc `.claude/launch.json` của dự án (cùng định dạng bản gốc: name, runtimeExecutable, runtimeArgs, cwd, env, port, autoPort, url), bật / tắt từng server, xem log, server lên thì tự mở tab xem trước của phiên. "Thiết lập…" nhờ Claude tự dò và viết launch.json. Tắt app là tắt server.
- **PR / MR**: chip trên thanh tiêu đề cho nhánh hiện tại — trạng thái CI, số góp ý review, tự merge. Menu: **Tự sửa CI & góp ý** (GUI gom log job CI lỗi + góp ý chưa giải quyết rồi giao Claude sửa, push), **Merge khi sẵn sàng**, Mở trên web, Tạo MR / PR. **GitLab** (kể cả server nội bộ): nhập link server + Personal Access Token (quyền api, lưu mã hoá) ở Cài đặt → Claude Code → Git; GitHub dùng GitHub CLI (`gh`). Tuỳ chọn tự lưu trữ phiên khi MR / PR đã merge hoặc đóng.
- **Lịch**: lần lỡ (máy tắt / ngủ) chỉ chạy bù **một lần** và chỉ trong 7 ngày; thêm lựa chọn "Hỏi trước khi chạy bù" (nút Chạy bù ngay / Bỏ qua). **Giữ máy không ngủ** khi có lịch trong 30 phút tới hoặc kế hoạch đang chạy.

**Gợi ý việc ngoài phạm vi, mượt hơn (1.19)**
- **Claude gợi ý việc ngoài phạm vi** (giống "Start a task that Claude suggests" của bản gốc): đang làm mà thấy lỗi / lỗ hổng ngoài phạm vi, Claude không tự sửa mà gọi công cụ `suggest_task` (MCP nội bộ `claude-gui`) → thẻ trong chat: mức độ, **vì sao là vấn đề, bằng chứng (đoạn code đúng dòng, bấm để mở tệp), ảnh hưởng, vì sao không sửa ở đây, hướng sửa** (thiếu mục nào công cụ trả lỗi để Claude gợi ý lại) và prompt sẽ gửi. Nút: **Mở phiên mới** (phiên con nằm dưới phiên cha ở thanh bên, thẻ hiện trạng thái), **Làm ở đây**, **Lưu vào hàng đợi** (Lịch & hàng đợi: chạy khi bấm / sau khi phiên này xong / khi giới hạn 5 giờ hồi / vào lúc…; xong thì commit, tuỳ chọn push + tạo MR / PR), **Tuỳ chọn** (model, quyền, nhánh, báo kết quả về phiên này), Mở / Lưu tất cả khi có nhiều việc, × để bỏ. Claude rút lại được gợi ý đã cũ (`withdraw_task`).
- **Quy trình nhóm: sửa lỗi ở nhánh git riêng** (Cài đặt → Chung, mặc định bật): việc gợi ý mở phiên mới / chạy từ hàng đợi tự tạo nhánh (`fix/…`, chọn được nhánh gốc) trong worktree riêng `.claude/worktrees/…` (tự thêm vào `.git/info/exclude`); "Làm ở đây" hiện cảnh báo.
- **Cài đặt hết giật**: khung trang giữ nguyên, chuyển mục chỉ đổi phần nội dung (viên chọn trượt theo), đổi tuỳ chọn sửa tại chỗ (giữ vị trí cuộn, video / ảnh thu nhỏ không nạp lại), phần tải chậm (Quyền, MCP) giữ sẵn chỗ bằng khối xương; mở / đóng có hiệu ứng.
- **Chuyển sang phiên chưa nạp**: viên chọn + tiêu đề đổi ngay, chờ quá 150 ms thì hiện khối xương, nạp xong nội dung mới hiện so le (không còn bật ra + nhảy); lần đầu chỉ dựng ~1 màn hình, phần ngoài màn hình trong lượt dài được bỏ qua khi tính bố cục (thời gian đứng hình khi mở phiên 250 MB giảm từ ~0.5 s xuống ~0.15 s); **rê chuột lên phiên ~0.1 s là đọc trước**, bấm vào hiện ngay.
- **Animation**: chữ stream hiện dần như mực thấm, "Đang suy nghĩ…" có vệt sáng, khối mới trồi lên, thẻ xin quyền trượt lên / thu lại, thẻ lỗi rung nhẹ, số +N −M đếm lên, chip "↓ n tin mới" khi đang cuộn lên, sao chép → dấu tick; thanh bên: các dòng trượt khi đổi chỗ / thêm / lưu trữ, phiên xong thì chấm thành tick xanh có sóng, huy hiệu nảy, đổi tên trôi lên, mở nhóm so le; ô nhập giãn mượt, chip đính kèm vào / ra, kéo thả có khung nét đứt chạy, nút Gửi ↔ Dừng có vòng quay, menu `/` `@` so le + nền chọn trượt; khung xem trước / tab giãn ra; git stage trượt sang nhóm Đã stage; thanh hạn mức đầy dần; hộp thoại / menu / thông báo có hiệu ứng lúc đóng; nút lún khi nhấn, công tắc nảy; thẻ "giới hạn hồi" có vòng đếm ngược. Tất cả tắt khi bật "Giảm hiệu ứng".

**Khung xem tệp & web** (nút con mắt trên thanh tiêu đề, `Ctrl+Shift+B`; `Ctrl+P` mở nhanh tệp trong dự án):
- **Mỗi phiên một bộ tab riêng** (giống app gốc): đổi phiên thì khung đổi theo, phiên chưa có xem trước thì khung đóng; mở lại phiên cũ (kể cả sau khi tắt app) vẫn thấy đúng tab của nó. Phiên chạy nền tạo tệp / bật server → tab vào đúng phiên đó, chấm xanh ở thanh bên, mở phiên ra là khung tự mở. Thẻ lệnh in địa chỉ `localhost` có nút **Mở xem trước**.
- Bấm tên tệp trên thẻ công cụ (Read/Edit/Write), link tệp hoặc `đường/dẫn.cs:42` trong câu trả lời → mở ở khung bên phải: code tô màu + số dòng (nhảy tới dòng), markdown hiển thị đẹp (có nút Mã nguồn), ảnh, HTML/SVG xem trước. Tệp bị sửa → tự tải lại.
- Link `localhost` / IP nội bộ → mở trang ngay trong khung, tương tác như trình duyệt (lùi/tiến/tải lại, ô địa chỉ, DevTools, mở ra trình duyệt ngoài). Gõ `3000` là ra `http://localhost:3000`. Web bên ngoài vẫn mở bằng trình duyệt (Ctrl+bấm link localhost cũng vậy).
- Xem trước HTML chạy qua máy chủ cục bộ `127.0.0.1` (không phải `file://`) nên demo dùng `<script type="module">`, `fetch()`, tệp JSON… chạy như web thật. Xem **PDF** ngay trong khung. Trang localhost chưa bật server → tự thử lại trong ~1 phút.
- Link tệp hiểu cả `C:\…`, `file:///…`, `/c/…` (Git Bash), `tệp.cs:10-20`, đường dẫn tương đối theo gốc repo hoặc chỉ tên tệp (tìm trong các tệp phiên đã đụng tới và trong dự án).
- Nhiều tab, nhớ lại khi mở lại app.
- **Tự mở xem trước** (giống app gốc): Claude tạo tệp HTML/Markdown/PDF/SVG/ảnh hoặc bật server `localhost` → khung xem tự mở ngay cạnh chat (không mở sang Chrome). Chỉ giữ **một tab tự mở**: cùng tệp / cùng server thì tải lại tab đó, thứ mới thì thay tab cũ (tab bạn tự mở không bị đóng). Tắt ở Cài đặt → Khung xem.

**Xem ảnh**: bấm vào ảnh bạn gửi, ảnh trong kết quả công cụ hoặc trong câu trả lời → xem toàn màn hình: lăn chuột để phóng to, kéo để di chuyển, nhấp đúp vừa khung/100%, ←/→ chuyển ảnh, sao chép ảnh, Esc đóng.

**Chia đôi màn hình** (nút cạnh terminal, `Ctrl+\`, `Ctrl`+bấm hoặc bấm chuột giữa vào phiên ở thanh bên, hoặc chuột phải → "Mở ở khung bên phải"): xem và nhắn 2 phiên song song. Khung phải có ô nhập riêng (Enter gửi, Esc dừng, Tab dùng gợi ý), trạng thái đang chạy / chờ quyền; nút đổi chỗ hai khung, kéo đường chia để đổi độ rộng.

**Terminal tích hợp** (nút `>_` hoặc ``Ctrl+` ``): terminal ngay trong cửa sổ, mỗi phiên một terminal riêng tại thư mục của phiên; kéo mép trên để đổi chiều cao, nút mở lại, nút mở ra cửa sổ Windows Terminal/PowerShell riêng. Chọn shell ở Cài đặt → Chung → Terminal (PowerShell 7 / Windows PowerShell / cmd / Git Bash).

**Bảng chi tiết** (nút bên phải thanh tiêu đề): Thay đổi, Việc cần làm, Môi trường (thư mục, nhánh, worktree), Sử dụng.

**Thay đổi theo repo**: ngoài tab "Phiên này", Claude sửa tệp thuộc repo git nào thì repo đó tự thành một tab (kèm repo của thư mục phiên). Trong mỗi tab:
  - Nhánh hiện tại (bấm để chuyển / tạo nhánh), số commit ↑ chưa đẩy / ↓ chưa kéo, Pull · Push · làm mới.
  - **Stage thủ công**: tích ô cạnh tệp; bấm tệp để xem diff và stage / bỏ stage / hoàn tác **từng đoạn**. Tệp Claude sửa có nhãn ✳ Claude.
  - Ô commit (`Ctrl+Enter`), **✨ Gợi ý nội dung** (Haiku đọc diff đã stage, theo phong cách commit của repo), Commit & Push, sửa commit trước (amend).
  - **Giao Claude commit**: chạy ở phiên nền riêng (chọn model + effort, mặc định Haiku / thấp) hoặc ngay phiên hiện tại; chọn luật (theo repo / Conventional Commits / tách nhiều commit theo việc / gộp một commit); **ghi chú cho agent** (vd tách theo việc, tách từng đoạn, bỏ qua dist/log/.env, mã task…); chỉ tệp ✳ Claude sửa, rồi push, nhớ lựa chọn cho repo. Có thể xem trước lời nhắn sẽ gửi.
  - **Cây git**: đồ thị nhánh 40 commit gần nhất (bấm commit để xem tệp, Checkout, Tạo nhánh, Sao chép mã), "Mở lớn" xem 400 commit.

**Giao diện & trang trí** (Cài đặt → Giao diện & trang trí):
- 26 chủ đề: Theo hệ thống, Claude sáng/tối, Tokyo Night, Catppuccin Mocha/Latte, Dracula, Nord, Rosé Pine, GitHub Dark/Light, Solarized Light, One Dark Pro, Gruvbox Dark/Light, Monokai Pro, Ayu Mirage/Light, Everforest, Kanagawa, Synthwave '84 (chữ neon), Cyberpunk, Material Ocean, Sakura, Matcha, Tương phản cao. Khối code và terminal đổi màu theo.
- **Ảnh nền**: ảnh tĩnh, ảnh động (GIF/WebP/APNG) hoặc video (MP4/WebM). **Cắt ảnh**: khung cắt khóa theo tỉ lệ vùng chat (hoặc cả cửa sổ / tự do), kéo để di chuyển, kéo góc để đổi cỡ, lăn chuột để phóng to, có ô xem trước cửa sổ app; chọn ảnh xong tự mở khung cắt với vùng gợi ý theo chủ thể trong ảnh. Hoặc chọn "Toàn bộ ảnh" (không cắt, phần thừa lấp bằng bản nhoè). Chỉnh độ rõ, độ nhoè, kính mờ, làm dịu vùng chữ.
- **Tự đổi ảnh nền theo giờ** (Cài đặt › Giao diện › Tự đổi ảnh nền theo giờ): gom nhiều ảnh / video vào **kho**, mỗi ảnh có **vùng cắt riêng** (bấm ✂ trên ảnh). Đổi **tuần tự** (◀ ▶ sắp thứ tự), **ngẫu nhiên** (tuỳ chọn xem hết kho mới lặp) mỗi 5 phút – 4 giờ hoặc mỗi lần mở app, hoặc **theo khung giờ trong ngày** (gán giờ bắt đầu cho từng ảnh, có thanh 24h xem trước). Chuyển ảnh mờ dần / mờ dần + phóng nhẹ; mặc định đợi lúc bạn không gõ và Claude không đang trả lời mới đổi. 👁 dùng ngay, **Đổi ngay ▶** sang ảnh kế.
- Màu nhấn tự chọn · viền cầu vồng khi Claude đang làm · logo cầu vồng/phát sáng · pháo giấy hoặc logo nở hoa khi xong lượt dài · bong bóng tin nhắn gradient · vệt sáng con trỏ · âm thanh (gửi / xong / cần xác nhận) · tự đổi chủ đề theo giờ.
- **Linh vật robot** kiểu Emo: đôi mắt LED biểu cảm theo việc Claude đang làm (nghĩ, gõ, đọc, sửa tệp, chạy lệnh, chờ quyền, xong, lỗi, ngủ…), mặt màu hổ phách/cam khi sắp hết giới hạn 5 giờ / tuần, chuyển mượt khi đổi phiên; **đeo tai nghe và nhún theo nhạc** khi máy đang phát nhạc. Kéo thả hoặc chuột phải để đổi vị trí (góc ô chat, ló sau ô chat, trên thanh tiêu đề, thanh bên, bảng chi tiết, tự do) và cỡ.
  - **Trang phục ngày lễ** tự mặc đúng ngày (không cần chọn): Tết Nguyên Đán, Ông Công Ông Táo, Giỗ Tổ, Vu Lan, Trung thu (ngày âm tính theo lịch Việt Nam), 30/4, 2/9, 20/10, 20/11, Tết Dương lịch, Valentine, 8/3, 1/4, 22/4, 1/5, 4/5, 1/6, Ngày Lập trình viên, Halloween, Noel… kèm tuyết rơi / pháo hoa / cánh hoa quanh robot.
  - **Cầm đồ nghề theo việc Claude làm**: kính đọc (Read/Grep), bút (Edit/Write), cờ lê (Bash), kính lúp (tra web), loa (tác tử phụ), bảng kẹp (lập kế hoạch). Nhận ra **test pass/fail, build, git commit/push** từ lệnh Bash: test fail có con bọ bò trên màn LED, test pass hiện dấu ✔ và pháo giấy.
  - **Gọi bạn**: phiên khác đang chờ trả lời thì robot vẫy tay về phía thanh bên, phiên đó viền vàng. **Ra desktop** khi thu nhỏ app / app ở khay: ngồi góc màn hình, báo xong việc, lỗi, Claude hỏi, xin quyền — **trả lời nhanh / cho phép ngay trong bóng nói**; bấm robot để mở lại đúng phiên, kéo để đổi chỗ.
  - Ngữ cảnh ≥ 80% thì phình má, ≥ 92% gợi ý chạy `/compact`; giới hạn vừa hồi thì báo (kèm thông báo Windows); lịch sắp chạy trong 5 phút thì màn LED đếm ngược.
  - **Giờ giấc**: chào buổi sáng, sau 23 giờ đội mũ ngủ và nhắc nghỉ, làm liên tục 2 tiếng nhắc uống nước, **Pomodoro** 25/5 phút (thanh đếm dưới mắt). Tắt được ở Cài đặt.
  - **Tương tác**: giữ chuột trên robot để vuốt ve, chọc 5 lần thì chóng mặt, lắc mạnh khi kéo thì say xe, **bấm đúp mở menu nhanh** (giới hạn, Lịch & hàng đợi, tới phiên đang chạy, Pomodoro…), tiếng bíp kiểu R2-D2 (mặc định tắt).
  - **Lên cấp**: dùng app tích XP (lượt xong, test pass, lịch chạy xong) để mở phụ kiện (nơ, tai mèo, ăng-ten, mũ len, kính râm, khăn, vương miện) và màu mắt — trong "Robot của tôi" (chuột phải robot hoặc Cài đặt).
  - **Ví token**: rê chuột / bấm đúp robot thấy số hôm nay (chi phí quy đổi, token, số lượt). Phiên Opus/Fable có ngữ cảnh ~250k token trở lên (hoặc một lượt ≈ $2 trở lên) → nhắc ghi kết luận vào Sổ tài liệu rồi sang phiên mới / chạy `/compact`. Giới hạn 5 giờ ≥ 92% thì mệt lả; hết giới hạn thì ngủ, màn LED xen kẽ pin cạn và **đồng hồ đếm ngược tới lúc hồi**.
  - **Đưa thư Lark**: có tin Lark chưa xem (phiên nào cũng được) → robot cầm phong bì có chữ cái đầu tên người gửi, bấm vào robot mở đúng khung chat. Bên kia "Đã xem" → robot gật đầu. Tin của bạn chờ quá 40 phút chưa có trả lời → robot hỏi "nhắc lại không?" và điền sẵn câu nhắc vào ô chat Lark. Không nhắc khi tin cuối của bạn chỉ là câu chào / xác nhận ("ok anh nhé", "cảm ơn"). Nút **✕ trên khung chat Lark** đóng hội thoại với người đó (tin chưa phân tích bỏ qua, khung ẩn, robot thôi nhắc); họ nhắn lại thì khung tự mở như bình thường; mở lại tay: chuột phải phiên › Mở lại chat Lark với….
  - **Git & build**: commit → pháo hoa, push → tên lửa bay lên (cả khi commit/push từ khung Thay đổi), conflict khi merge/rebase → toát mồ hôi, test/build đỏ → cầm vợt bắt bọ, một lượt sửa ≥ 15 tệp → bê thùng nặng ghi số tệp + gợi ý xem lại thay đổi.
  - **Nuôi robot** (Cài đặt › Giao diện › Nuôi robot — **mặc định tắt**, có công tắc riêng cho từng phần): robot có đầu / thân / tay / chân (tự chọn trong "Robot của tôi") và tự đi lại. Trong app: đứng trên mép ô nhập, ngồi trên phiên ★, nhảy lên phiên đang chờ trả lời và lên thẻ xin quyền (cầm biển "?" khi Claude hỏi), mang thư Lark tới gõ cửa, đi theo chữ khi Claude đang trả lời (bạn cuộn lên đọc thì ngồi chờ, bấm vào để cuộn xuống), cầm đúng đồ theo việc (kính lúp khi đọc, bút khi sửa, gọi robot mini khi giao việc cho tác tử phụ). Xong lượt rơi ⚡ hạt năng lượng, commit thêm hạt, test fail có con bọ để robot bắt; Claude làm lâu mà bạn rảnh thì rủ chơi bóng. Kéo / ném robot, vuốt ve, bấm đúp mở **túi đồ** (đồ ăn, bóng, tắm, ngủ, mini game bắt bọ 30 giây), **Ctrl+Shift+P** gọi robot tới con trỏ. Chỉ số đói / buồn ngủ / vui / sạch không bao giờ làm robot chết, chỉ ỉu xìu (tắt được). **Tiến hoá** theo thói quen: Cú đêm, Thợ máy, Tia chớp, Vua — mặc dạng cao nhất hoặc tự chọn. Có **nhật ký robot** và dòng "Robot viết" trong tổng kết ngày.
  - **Ra desktop khi nuôi robot**: thu nhỏ app (hoặc bấm sang cửa sổ khác — tắt được) thì robot nhảy ra đúng chỗ nó đang đứng, đi trên taskbar, leo lên thanh tiêu đề các cửa sổ đang mở (cửa sổ bị kéo đi thì đi theo, đóng thì rơi xuống), có "nhà" cạnh khay hệ thống (giường, đèn đọc, cây, mèo… mở theo cấp) để ngủ / đọc sách; Claude hỏi thì chạy tới chỗ con trỏ cầm biển; app toàn màn hình thì ra mép ló đầu. App chỉ đọc **vị trí** cửa sổ (không đọc nội dung), và chỉ khi robot đang ở ngoài desktop.
  - **Trên trang dự án tự động**: robot nhỏ đi dọc thanh tiến độ (khi nuôi robot thì kéo xe đẩy chở số task đã xong), dự án dừng chờ duyệt / xin đổi lịch thì giơ biển "CẦN BẠN XEM" (bấm vào robot để cuộn tới chỗ cần xử lý).
  - **Tổng kết cuối ngày** (sau 17:30, hoặc sáng hôm sau nếu bỏ lỡ): số phiên, lượt, token, chi phí quy đổi, task tự động xong, commit/push, test pass, chuỗi ngày liên tiếp. **Huy hiệu** (+30 XP mỗi cái): Cú đêm, Chim sớm, Commit 3 repo một lèo, Không dùng Opus cả ngày, Chi tiêu khéo, Test xanh, Phóng tàu, Quản đốc, Lượt marathon, Chuỗi 7 ngày, Bưu tá — xem trong "Robot của tôi".
  - **Thói quen**: bấm "Cho phép" cùng một quyền 3 lần → gợi ý thêm luật luôn cho phép (cho dự án này vào `.claude/settings.local.json`, hoặc mọi dự án vào `~/.claude/settings.json`). Gõ cùng một câu 3 lần → gợi ý lưu thành lệnh tắt `~/.claude/commands/<tên>.md` (gõ `/tên` để dùng).
- Chuyển động mượt khi đổi phiên, mở thẻ công cụ, tin nhắn bay lên khi gửi.
- "Giảm hiệu ứng" tắt mọi chuyển động; hiệu ứng tự dừng khi cửa sổ bị ẩn.

**Chi phí & token** (menu tài khoản › Chi phí & token theo ngày, hoặc bấm đúp robot): hôm nay / 7 / 30 / 90 ngày — chi phí quy đổi theo giá API, token vào/ra/cache, biểu đồ theo ngày, bảng theo model, theo dự án, phiên tốn nhất (bấm để mở phiên), và ước tính **"nếu phần Opus/Fable chạy bằng Sonnet"**. Gói Max/Pro không trừ tiền theo số này — dùng để so sánh mức dùng. Số liệu ghi theo từng lượt chạy qua GUI (từ 1.16.0) vào `usage-stats.json` trong thư mục dữ liệu của app, giữ 120 ngày.

**Đánh dấu sao phiên hay dùng**: rê chuột vào dòng phiên ở thanh bên → bấm ☆ (hoặc chuột phải › Đánh dấu sao). Phiên đánh dấu được ghim trong nhóm **★ Đã đánh dấu** trên cùng danh sách, không bị trôi theo thời gian.

**Máy thợ trong mạng LAN** (Cài đặt › Máy thợ (LAN)): bật "Nhận việc từ máy khác" ở máy dư → máy đó mở cổng 8766, có **khoá** riêng. Ở máy chính, trang kế hoạch / dự án tự động › **Giao máy thợ…**: nhập tên máy hoặc IP + khoá, bấm Kiểm tra, chọn thư mục tương ứng bên máy thợ (gợi ý từ các thư mục máy đó hay dùng, có ✓/✗ kiểm tra tồn tại) → Gửi. Gói được gửi thẳng qua mạng (không cần chép tệp), máy thợ nhập như "Nhập .cgpack" (đổi đường dẫn, ghi chú CHUYỂN MÁY đầu context.md, cảnh báo git) và **chạy luôn** nếu git bên đó đã có đúng commit (không thì để TẮT chờ bạn xem). Máy chính tắt kế hoạch để không chạy trùng, và mỗi phút hỏi máy thợ: trạng thái, task nào xong, đang dừng vì sao, **bàn giao mới nhất** — hiện ngay trong trang kế hoạch, báo khi xong / dừng chờ xem. Lần đầu bật máy thợ, Windows có thể hỏi tường lửa — chọn mạng Riêng (Private).

**Cài đặt**: Chung (chủ đề, cỡ chữ, phím gửi, thông báo, terminal) · Claude Code (model, effort, chế độ mặc định, system prompt bổ sung, thư mục thêm, biến môi trường, tham số CLI) · Quyền (sửa allow/ask/deny trong `~/.claude/settings.json`, có bản sao lưu `.bak`) · MCP & mở rộng · Tài khoản & sử dụng · Cập nhật · Phím tắt · Giới thiệu.

## Cập nhật

- **Claude CLI**: GUI so phiên bản với npm, có nút "Cập nhật" (chạy `claude update`) và tuỳ chọn tự cập nhật.
- **Claude GUI**: tự kiểm tra khi mở và mỗi 6 giờ. Khi có bản mới, bản portable tự tải, thay file `.exe` rồi mở lại. Để trống **Nguồn cập nhật** thì tự dò lần lượt `http://ADMIN:8765` (tên máy chủ — không đổi khi đổi mạng), `http://192.168.1.66:8765`, `http://192.168.1.35:8765` (danh sách `defaultUpdateSources` trong `package.json`); nguồn tự đặt không trả lời thì cũng thử các nguồn này. Nguồn tự đặt có thể là:
  - thư mục chung, vd `\\server\share\ClaudeGUI`
  - URL chứa `latest.json`
  - GitHub `owner/repo` (lấy file `.exe` trong release mới nhất)

Phát hành bản mới cho cả team:

```
# 1. tăng "version" trong package.json
# 2. build + tạo latest.json + chép lên thư mục chung
npm run release -- "Ghi chú phát hành" --publish "\\server\share\ClaudeGUI"
```

## Phím tắt

`Enter` gửi · `Shift+Enter` xuống dòng · `Esc` dừng / từ chối · `Shift+Tab` đổi chế độ quyền · `Ctrl+N` phiên mới · `Ctrl+Tab` / `Ctrl+Shift+Tab` chuyển phiên · `Ctrl+K` tìm phiên · `Ctrl+O` chế độ xem · `Ctrl+Shift+M` chế độ quyền · `Ctrl+Shift+I` model · `Ctrl+Shift+E` effort · `Ctrl+Shift+D` bảng Thay đổi · ``Ctrl+` `` terminal · `Ctrl+B` thanh bên · `Ctrl+Shift+B` khung xem trước · `Ctrl+;` hỏi bên lề · `Ctrl+Shift+S` chọn phần tử trên trang · `Ctrl+,` cài đặt · `Ctrl+/` danh sách phím tắt · `F12` DevTools

## Chưa có so với bản desktop chính thức

Môi trường cloud/SSH/WSL, Remote Control & điều khiển từ điện thoại, Dispatch / Projects, computer use, Claude tự điều khiển trình duyệt trong khung xem (chụp / bấm / điền form), mở một phiên ở cửa sổ app thứ hai (GUI chạy một cửa sổ chính — tách được khung xem ra cửa sổ riêng), đồng bộ phiên giữa các máy (CLI chỉ lưu phiên trên máy này).

## Phát triển

```
npm install
node node_modules/electron/install.js   # nếu npm bỏ qua bước tải Electron
npm start                               # chạy thử
npm run dist                            # build exe portable → dist/
npm run dist:setup                      # build bộ cài đặt (NSIS)
```

Cấu trúc: `main.js` (tiến trình CLI, lịch sử phiên, git, cập nhật) · `preload.js` (cầu nối IPC) · `src/` (giao diện: `app.js`, `settings.js`, `lib.js`, `styles.css`) · `assets/` (icon Claude) · `scripts/release.js` (tạo `latest.json`).

Biểu tượng Claude là thương hiệu của Anthropic (lấy từ Wikimedia Commons), chỉ dùng nội bộ.
