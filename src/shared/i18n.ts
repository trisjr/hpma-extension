/**
 * i18n.ts — chuỗi UI hai ngôn ngữ (VI mặc định, EN) cho extension pages.
 * Từ điển phẳng, key kiểu hóa để thiếu key là lỗi compile.
 */

export type Lang = 'vi' | 'en';

export type Localized = Record<Lang, string>;

export const DEFAULT_LANG: Lang = 'vi';

const vi = {
  'lang.switch': 'Ngôn ngữ: Tiếng Việt. Bấm để đổi sang English',
  'lang.badge': 'VI',
  'header.bm': 'Business Manager',
  'header.checking': 'Đang kiểm tra tab…',
  'header.attached': 'Đang bám',
  'header.supported': 'hỗ trợ',
  'header.unreachable': 'Chưa kết nối',
  'mode.group': 'Mode lần chạy',
  'mode.dry': 'Dry-run',
  'mode.assist': 'Assist',
  'mode.full': 'Full',
  'nav.label': 'Màn hình',
  'flows.title': 'Flows',
  'flows.sortHint': 'Xếp theo rủi ro tăng dần',
  'flows.locked': 'Chưa mở write',
  'flows.soon': 'Chưa có màn cấu hình',
  'risk.read': 'Đọc',
  'risk.write': 'Ghi thường',
  'risk.sensitive': 'Ghi nhạy cảm',
  'tier.read': 'Không cần duyệt',
  'tier.write': 'Duyệt 1 lớp',
  'tier.sensitive': 'Duyệt 2 lớp',
  'notice.unreachable':
    'Chưa kết nối. Mở tab business.facebook.com rồi tải lại tab đó (tab mở trước khi cài hoặc reload extension chưa có content script).',
  'notice.retry': 'Kiểm tra lại',
  'footer.writes': 'Ghi hôm nay',
  'footer.curfew': 'Curfew {from}–{to}',
  'footer.curfewOff': 'Curfew tắt',
  'footer.kill': 'Kill-switch',
  'soon.title': 'Đang xây dựng',
  'soon.body': 'Màn hình này chưa được dựng.',
  'soon.back': 'Quay lại Flows',
  'popup.options': 'Mở Options',
  'popup.openPanel': 'Mở side panel',
  'popup.openFailed':
    'Không mở được side panel. Thử lại hoặc mở từ menu của trình duyệt.',
  'popup.killAll': 'Kill-switch · dừng mọi queue',
  'pa.title': 'Gán partner vào TKQC',
  'pa.desc': 'Cấp quyền trên TKQC của BM này cho một BM đối tác.',
  'pa.back': 'Flows',
  'pa.stepOf': 'Bước {n}/4',
  'pa.stepsLabel': 'Các bước cấu hình',
  'pa.step.1': 'Đối tác',
  'pa.step.2': 'TKQC',
  'pa.step.3': 'Quyền',
  'pa.step.4': 'Chạy',
  'pa.step.doneLabel': 'Bước {n}, {name}: đã xong. Mở lại để sửa',
  'pa.edit': 'Sửa',
  'pa.editBm': 'Sửa BM đối tác',
  'pa.editAccounts': 'Sửa danh sách TKQC',
  'pa.editPerms': 'Sửa quyền',
  'pa.cancel': 'Huỷ',
  'pa.prev': 'Quay lại',
  'pa.next.2': 'Tiếp · Chọn TKQC',
  'pa.next.3': 'Tiếp · Chọn quyền',
  'pa.next.4': 'Tiếp · Xem lại & chạy',
  'pa.bm.title': 'BM đối tác nhận quyền',
  'pa.bm.desc': 'Đối tác sẽ được cấp quyền trên TKQC bạn chọn ở bước sau.',
  'pa.bm.label': 'BM ID đối tác',
  'pa.bm.placeholder': '15–17 chữ số',
  'pa.bm.help':
    'Đối tác lấy BM ID ở Cài đặt doanh nghiệp › Thông tin doanh nghiệp.',
  'pa.bm.empty': 'Nhập BM ID đối tác (15–17 chữ số).',
  'pa.bm.digits': 'BM ID chỉ gồm chữ số.',
  'pa.bm.length': 'BM ID phải có 15–17 chữ số · đang có {n}.',
  'pa.bm.ok': 'Hợp lệ · tên BM đối tác sẽ được đọc lại khi chạy.',
  'pa.bm.note':
    'Bước 1–3 chỉ lưu cấu hình. Chưa có gì được ghi lên BM cho tới khi bạn chạy và xác nhận.',
  'pa.bm.summary': 'BM đối tác',
  'pa.hint.bmOk': 'Tiếp theo: chọn TKQC nhận partner',
  'pa.hint.bmBad': 'Sửa BM ID đối tác để tiếp tục',
  'pa.acc.title': 'TKQC nhận partner',
  'pa.acc.session': 'Danh sách từ phiên BM đang đăng nhập',
  'pa.acc.source': 'BM nguồn · {id}',
  'pa.acc.refresh': 'Tải lại',
  'pa.acc.loadMore': 'Tải thêm TKQC',
  'pa.acc.useManual': 'Nhập tên hoặc ID thủ công',
  'pa.acc.useList': 'Chọn từ danh sách',
  'pa.acc.clearUnlisted': 'Bỏ chọn các mục ngoài danh sách đang tải',
  'pa.acc.limit': 'Tối đa {n} TKQC mỗi lần chạy.',
  'pa.acc.error.business':
    'Không xác định được BM nguồn hoặc BM đã đổi. Mở Cài đặt doanh nghiệp của BM cần thao tác rồi tải lại danh sách.',
  'pa.acc.error.token':
    'Chưa lấy được token phiên. Mở Business Manager, đăng nhập lại nếu cần, rồi tải lại danh sách; hoặc nhập TKQC thủ công.',
  'pa.acc.error.expired':
    'Phiên truy cập đã hết hạn. Tải lại trang BM hoặc đăng nhập lại, rồi tải lại danh sách.',
  'pa.acc.error.permission':
    'Phiên hiện tại thiếu quyền đọc danh sách TKQC. Kiểm tra quyền BM hoặc nhập TKQC thủ công.',
  'pa.acc.error.rate':
    'Meta đang giới hạn lượt đọc. Chờ một lúc rồi tải lại danh sách.',
  'pa.acc.error.network':
    'Không kết nối được tới BM hoặc Meta. Kiểm tra kết nối, tải lại trang BM rồi thử lại.',
  'pa.acc.error.response':
    'Không đọc được phản hồi danh sách TKQC. Thử tải lại hoặc nhập TKQC thủ công.',
  'pa.acc.loaded': 'Đã chọn {n} · Đã tải {total} TKQC',
  'pa.acc.emptyPage':
    'Chưa có TKQC trong phần đã tải. Chọn “Tải thêm TKQC” để xem tiếp.',
  'pa.acc.desc': 'TKQC đã có partner này sẽ được bỏ qua khi chạy.',
  'pa.acc.searchLabel': 'Tìm TKQC',
  'pa.acc.searchPlaceholder': 'Tìm theo tên hoặc ID',
  'pa.acc.selected': 'Đã chọn {n}/{total}',
  'pa.acc.selectAll': 'Chọn tất cả đang hoạt động',
  'pa.acc.clearAll': 'Bỏ chọn tất cả',
  'pa.acc.more': 'Xem thêm {n} TKQC',
  'pa.acc.active': 'Hoạt động',
  'pa.acc.restricted': 'Bị hạn chế',
  'pa.acc.loading': 'Đang tải danh sách TKQC…',
  'pa.acc.empty': 'BM này chưa có TKQC nào.',
  'pa.acc.noMatch': 'Không có TKQC khớp “{q}”.',
  'pa.acc.batch': 'Hơn 10 TKQC: sẽ xác nhận theo từng mẻ 10.',
  'pa.acc.sample':
    'Dữ liệu TKQC mẫu: chưa nối flow đọc kiểm kê (FR-08), danh sách này chưa lấy từ BM thật.',
  'pa.acc.summary': 'TKQC',
  'pa.acc.paste.desc':
    'Engine khớp từng mục với danh sách tài sản trong hộp thoại của BM. TKQC đã có partner sẽ được bỏ qua nếu nhận ra khi chạy.',
  'pa.acc.paste.label': 'Dán tên hoặc ID TKQC, mỗi dòng một mục',
  'pa.acc.paste.placeholder': 'Spa Hoa\n238100451187',
  'pa.acc.paste.count': '{n} mục hợp lệ',
  'pa.acc.paste.dup': '{n} dòng trùng đã được bỏ.',
  'pa.acc.paste.long': '{n} dòng quá dài (tối đa {max} ký tự) đã được bỏ.',
  'pa.acc.paste.over': '{n} dòng vượt giới hạn {max} mục đã được bỏ.',
  'pa.hint.accOk': '{n} TKQC sẽ nhận partner',
  'pa.hint.accBad': 'Chọn ít nhất 1 TKQC để tiếp tục',
  'pa.perm.title': 'Quyền cấp cho partner',
  'pa.perm.desc': 'Áp dụng giống nhau cho cả {n} TKQC đã chọn.',
  'pa.perm.ADVERTISE': 'Chạy quảng cáo',
  'pa.perm.ADVERTISE.desc': 'Tạo và sửa quảng cáo trên TKQC',
  'pa.perm.ANALYZE': 'Phân tích',
  'pa.perm.ANALYZE.desc': 'Xem hiệu quả và báo cáo',
  'pa.perm.MANAGE': 'Quản lý',
  'pa.perm.MANAGE.desc': 'Toàn quyền TKQC, gồm người dùng và thanh toán',
  'pa.perm.high': 'quyền cao',
  'pa.perm.warnTitle': 'Bạn đang cấp quyền Quản lý',
  'pa.perm.warnBody':
    'BM đối tác sẽ toàn quyền trên TKQC: thêm, xoá người dùng và đổi thanh toán. Chỉ cấp khi có hợp đồng.',
  'pa.hint.perms': '{n} quyền · tiếp theo chọn mode',
  'pa.hint.permsHigh': '{n} quyền · có quyền cao · tiếp theo chọn mode',
  'pa.hint.permsBad': 'Chọn ít nhất 1 quyền để tiếp tục',
  'pa.review.title': 'Xem lại cấu hình',
  'pa.review.accounts': 'TKQC · {n}',
  'pa.review.perms': 'Quyền · {n}',
  'pa.review.mode': 'Mode lần chạy này',
  'pa.review.changeMode': 'Đổi mode ở thanh trên cùng',
  'pa.review.fullLocked':
    'Full đang khoá: chưa đủ điều kiện mở write (probe ≥ 95% và dry-run pass).',
  'pa.review.diff': 'Xem trước diff',
  'pa.review.diffSoon': 'Chưa dựng',
  'pa.mode.dry.tag': 'Chạy thử',
  'pa.mode.dry.desc':
    'Điều hướng và điền form, bỏ mọi bước ghi. Không thay đổi BM.',
  'pa.mode.assist.tag': 'Dẫn tôi làm',
  'pa.mode.assist.desc':
    'Dẫn tới trước nút Assign rồi dừng. Bạn tự bấm bước cuối trong tab BM.',
  'pa.mode.full.tag': 'Thực thi',
  'pa.mode.full.desc':
    'Chạy hết, mỗi bước ghi đều verify-readback và có pacing. Sẽ ghi thật.',
  'pa.run.dry': 'Chạy thử trên {n} TKQC',
  'pa.run.assist': 'Dẫn tôi làm trên {n} TKQC',
  'pa.run.full': 'Thực thi trên {n} TKQC',
  'pa.hint.runDry': 'Không thay đổi BM · chỉ hiện diff “sẽ làm gì”',
  'pa.hint.runAssist': 'Bạn bấm bước cuối trong tab BM',
  'pa.hint.runFull': 'Sẽ ghi thật · cần xác nhận 2 lớp trước khi chạy',
  'pa.run.disconnected': 'Chưa kết nối tab BM, không thể chạy',
  'pa.run.curfew': 'Đang trong curfew 0h–6h, chưa thể ghi',
  'pa.run.budget': 'Đã hết ngân sách ghi hôm nay',
  'sim.chip': 'Mô phỏng',
  'sim.hint':
    'Lần chạy này do simulator mô phỏng, không có gì được thao tác trên BM.',
  'diff.title': 'Xem trước thay đổi',
  'diff.sub': 'Gán partner · theo cấu hình hiện tại',
  'diff.back': 'Quay lại sửa cấu hình',
  'diff.continue': 'Tiếp tục · xác nhận 2 lớp',
  'diff.fullLocked': 'Full đang khoá, chỉ chạy thử hoặc Assist.',
  'diff.table': 'Bảng diff',
  'diff.partnerBm': 'BM đối tác',
  'diff.colAsset': 'TKQC · quyền',
  'diff.colOp': 'Thao tác',
  'diff.sum.add': 'thêm',
  'diff.sum.change': 'thay đổi',
  'diff.sum.remove': 'gỡ',
  'diff.sum.skip': 'bỏ qua',
  'diff.op.add': 'Thêm',
  'diff.op.change': 'Thay đổi',
  'diff.op.skip': 'Bỏ qua',
  'diff.op.unknown': 'Chưa đọc',
  'diff.sum.unknown': 'chưa đọc',
  'diff.noteUnknown':
    'Engine sẽ bỏ qua TKQC đã có partner nếu nhận ra khi chạy.',
  'diff.noteChange': 'Partner đã có {have}, chỉ thêm {n} quyền.',
  'diff.noteSkip': 'Đã tồn tại đủ quyền, bỏ qua (idempotent).',
  'diff.budget':
    'Sẽ ghi trên {n} TKQC, dùng 1 trong {left} lượt ghi còn lại hôm nay.',
  'diff.nothing': 'Không có gì để thay đổi. Mọi TKQC đã có đủ quyền.',
  'run.step.1': 'Mở Cài đặt BM › Đối tác',
  'run.step.2': 'Tìm đối tác hoặc mở thêm đối tác',
  'run.step.3': 'Xác minh BM ID và mở chọn tài sản',
  'run.step.4': 'Chọn TKQC',
  'run.step.5': 'Tick quyền',
  'run.step.6': 'Bấm Assign',
  'run.step.7': 'Verify readback',
  'run.stepState.pending': 'chờ',
  'run.stepState.running': 'đang chạy',
  'run.stepState.ok': 'ok',
  'run.stepState.waiting': 'chờ bạn',
  'run.stepState.skipped': 'skipped (dry-run)',
  'run.stepState.failed': 'fail',
  'run.writeStep': 'bước ghi',
  'run.steps': 'Các bước',
  'run.banner.dry.title': 'Dry-run · Không thay đổi BM',
  'run.banner.dry.desc':
    'Điều hướng và điền form thật, bỏ mọi bước ghi. Kết quả là diff để bạn duyệt.',
  'run.banner.assist.title': 'Assist · Bạn bấm bước cuối',
  'run.banner.assist.desc':
    'Panel dẫn tới trước nút ghi rồi dừng. Không có gì được chèn vào trang BM.',
  'run.status.running': 'Đang chạy',
  'run.status.waiting-user': 'Đang chờ bạn',
  'run.status.paused': 'Tạm dừng',
  'run.runId': 'runId',
  'run.started': 'Bắt đầu',
  'run.elapsed': 'Đã chạy',
  'run.progress': 'TKQC {i}/{n} · {name}',
  'run.stepOf': 'Bước {k}/7',
  'run.next.label': 'Bước tiếp theo',
  'run.next.title': 'Bấm Assign trong tab BM',
  'run.next.1': 'Chuyển sang tab BM đang bám.',
  'run.next.2': 'Kiểm tra hộp thoại Assign partners: BM {bm}, quyền {tasks}.',
  'run.next.3': 'Bấm nút Assign ở cuối hộp thoại.',
  'run.next.waiting':
    'Đang chờ bạn bấm Assign… panel tự sang verify khi hộp thoại đóng.',
  'run.next.simulate': 'Giả lập: tôi đã bấm Assign',
  'run.next.engineDone': 'Tôi đã bấm Assign, kiểm tra ngay',
  'run.batch': 'Mẻ {i}/{n}',
  'run.auditFailed': 'Không ghi được audit log. Kiểm tra dung lượng lưu trữ.',
  'run.hidden.title': 'Tab BM đang bị ẩn',
  'run.hidden.body': 'Run tạm dừng, tự chạy tiếp khi bạn quay lại tab BM.',
  'run.willDo.title': 'Sẽ làm gì (đến lúc này)',
  'run.willDo.full': 'Xem diff đầy đủ',
  'run.willDo.line': 'Gán BM …{bm} → {name} · {tasks}',
  'run.stop': 'Dừng',
  'run.paused.title': 'Mất kết nối với tab BM',
  'run.paused.body': 'Run tạm dừng an toàn và chưa ghi gì.',
  'run.resync': 'Kết nối lại (re-sync)',
  'run.otherTab': 'Chọn tab BM khác',
  'run.paused.what': 'Re-sync làm gì',
  'run.paused.what1': 'Đọc lại trang, kiểm tra đúng BM và surface.',
  'run.paused.what2': 'Tiếp tục từ bước {k} với cùng mode {mode}.',
  'run.paused.what3': 'Nếu tab giờ là BM khác, run bị huỷ, không đoán.',
  'run.empty.title': 'Chưa có lần chạy nào',
  'run.empty.body': 'Cấu hình một flow rồi chạy để xem tiến độ ở đây.',
  'run.empty.cta': 'Về Flows',
  'result.title.done.dry': 'Chạy thử xong · {w} TKQC sẽ gán, {s} bỏ qua',
  'result.title.done': 'Hoàn tất · {w} ghi, {s} bỏ qua',
  'result.title.pending': 'Chờ admin thứ 2 duyệt',
  'result.title.failed': 'Dừng ở bước {k} · {name}',
  'result.title.stopped': 'Đã dừng bởi bạn',
  'result.sub.failed': 'TKQC {i}/{n} · {runId} · {time}',
  'result.range': '{runId} · {from} → {to}',
  'result.targets': 'Kết quả từng TKQC',
  'result.o.queued': 'chưa chạy',
  'result.o.running': 'đang chạy',
  'result.o.done': 'done · verify khớp',
  'result.o.doneDry': 'sẽ gán · không ghi',
  'result.o.skipped-existing': 'đã có · bỏ qua',
  'result.o.failed': 'lỗi',
  'result.o.pending-approval': 'chờ duyệt',
  'result.o.unverified': 'chưa xác minh',
  'result.unverified.hint':
    'Chưa xác minh được. Kiểm tra tay trước khi chạy lại.',
  'result.unverified.cancelNote':
    'Nếu bạn đã đóng hộp thoại bằng Cancel thì quyền chưa được gán.',
  'result.title.interrupted': 'Run bị gián đoạn',
  'result.readback.title': 'Verify-readback · {name}',
  'result.readback.body':
    'đọc lại  {time} · {id}\npartner  {bm}\nquyền    {tasks}\nso khớp  {k}/{k} đúng như diff',
  'result.copy': 'Copy',
  'result.copied': 'Đã sao chép',
  'result.undo.title': 'Cần hoàn tác?',
  'result.undo.body':
    'Gỡ partner khỏi {n} TKQC vừa gán. Cần Full và flow Gỡ partner (chưa mở).',
  'result.undo.btn': 'Gỡ lại (undo) {n} TKQC',
  'result.pending.body':
    'BM này yêu cầu một admin khác duyệt việc gán partner. Yêu cầu đã được gửi trong BM; khi được duyệt, quyền tự có hiệu lực.',
  'result.pending.noReplay': 'Extension sẽ không chạy lại.',
  'result.pending.noReplayBody':
    'Bấm lại sẽ tạo yêu cầu trùng; hãy nhắc admin duyệt yêu cầu đang chờ.',
  'result.pending.recheck': 'Kiểm tra lại trạng thái',
  'result.pending.recheckNote':
    'Chỉ đọc lại trạng thái, không gửi yêu cầu mới. Lần kiểm tra cuối {time}.',
  'result.pending.copyReminder': 'Copy lời nhắc gửi admin',
  'result.pending.reminder':
    'Nhờ duyệt yêu cầu gán partner BM {bm} vào {n} TKQC đang chờ trong Business Settings.',
  'result.failed.reason': 'Lý do',
  'result.failed.bodyAct':
    'BM báo tài khoản của bạn không có quyền quản lý TKQC {name}. Verify-readback xác nhận TKQC này chưa bị thay đổi.',
  'result.failed.bodyLocate':
    'Không tìm thấy phần tử ở bước {k} của TKQC {name}. Dry-run không ghi nên BM không bị thay đổi.',
  'result.failed.code': '{code} · bước {k}',
  'result.failed.copyErr': 'Copy lỗi',
  'result.failed.hint':
    'Nhờ admin BM kiểm tra quyền của bạn, rồi chạy lại các TKQC chưa xong bằng Dry-run trước.',
  'result.failed.reconfig': 'Cấu hình lại cho {n} TKQC chưa xong',
  'result.failed.assigned': '{n} TKQC đã được gán trước khi lỗi xảy ra.',
  'result.stopped.body':
    'Bạn đã dừng lần chạy. Các TKQC chưa xong chưa bị thay đổi.',
  'result.done.btn': 'Xong',
  'opt.title': 'Cài đặt HPMA Copilot',
  'opt.sub': 'v{version} · áp dụng cho mọi BM trên trình duyệt này',
  'opt.tabs': 'Mục cài đặt',
  'opt.tab.pacing': 'Pacing & limit',
  'opt.tab.audit': 'Audit log',
  'opt.tab.devtest': 'Devtest',
  'opt.loading': 'Đang tải cài đặt…',
  'opt.pacing.delayTitle': 'Độ trễ giữa các bước',
  'opt.pacing.delaySub':
    'Giữ nhịp như người thao tác. Bạn tự chọn số giây; càng ngắn càng dễ bị Meta chặn.',
  'opt.pacing.base': 'Delay nền',
  'opt.pacing.baseHint': 'Khuyến nghị từ {rec} giây · tối thiểu {min} giây',
  'opt.pacing.baseWarn':
    'Dưới mức khuyến nghị {rec} giây: thao tác nhanh hơn người thật, dễ bị Meta chặn tạm thời. Vẫn lưu được.',
  'opt.pacing.jitter': 'Jitter',
  'opt.pacing.jitterHint': 'Ngẫu nhiên quanh delay nền · tối thiểu {min}%',
  'opt.pacing.write': 'Thêm trước bước ghi',
  'opt.pacing.writeHint': 'Cộng thêm trước Assign, Remove, Save',
  'opt.unit.sec': 'giây',
  'opt.unit.pct': '± %',
  'opt.err.invalid': 'Nhập một số hợp lệ.',
  'opt.err.minSec': 'Không được dưới {min} giây.',
  'opt.err.minPct': 'Không được dưới {min}% (ngưỡng an toàn).',
  'opt.err.range': 'Nhập giá trị từ {min} đến {max}.',
  'opt.preview.title': 'Xem trước nhịp chạy',
  'opt.preview.read': 'Bước đọc cách nhau {lo}–{hi} giây.',
  'opt.preview.write': 'Bước ghi cách nhau {lo}–{hi} giây.',
  'opt.preview.blocked':
    'Chưa xem trước được nhịp chạy khi có ô chưa hợp lệ hoặc dưới ngưỡng an toàn.',
  'opt.limits.title': 'Giới hạn ghi mỗi ngày theo loại BM',
  'opt.limits.sub':
    'Mỗi lượt chạy có ghi tính 1 lượt, kể cả khi kết quả là pending-approval. Đọc và Dry-run không tính.',
  'opt.limits.table': 'Giới hạn ghi theo loại BM',
  'opt.limits.colKind': 'Loại BM',
  'opt.limits.colDetect': 'Nhận diện',
  'opt.limits.colWrites': 'Lượt ghi / ngày',
  'opt.limits.colBatch': 'Mẻ tối đa',
  'opt.limits.writesAria': 'Lượt ghi mỗi ngày, {kind}',
  'opt.limits.batchAria': 'Mẻ tối đa, {kind}',
  'opt.limits.note':
    'Side panel đang dùng hàng "BM thường" cho tới khi nhận diện được loại BM.',
  'opt.kind.new': 'BM mới',
  'opt.kind.newDetect': 'Tạo dưới 30 ngày',
  'opt.kind.standard': 'BM thường',
  'opt.kind.standardDetect': 'Mặc định',
  'opt.kind.verified': 'BM đã xác minh',
  'opt.kind.verifiedDetect': 'Có xác minh doanh nghiệp',
  'opt.curfew.title': 'Curfew',
  'opt.curfew.sub': 'Trong khung giờ này chỉ chạy flow đọc và Dry-run.',
  'opt.curfew.switch': 'Bật curfew',
  'opt.curfew.on': 'Đang bật',
  'opt.curfew.off': 'Đang tắt',
  'opt.curfew.from': 'Từ',
  'opt.curfew.to': 'Đến',
  'opt.curfew.tz': 'Múi giờ',
  'opt.curfew.offWarn':
    'Tắt curfew cho phép chạy ghi lúc 0h–6h. Khuyến nghị giữ bật.',
  'opt.save.none': 'Chưa có thay đổi.',
  'opt.save.dirty': 'Có thay đổi chưa lưu.',
  'opt.save.invalid': 'Sửa các ô báo lỗi trước khi lưu.',
  'opt.save.done': 'Đã lưu.',
  'opt.save.fail': 'Không lưu được: kiểm tra dung lượng lưu trữ rồi thử lại.',
  'opt.save.btn': 'Lưu thay đổi',
  'opt.reset.btn': 'Khôi phục mặc định',
  'opt.reset.confirm': 'Bỏ các thay đổi chưa lưu và đưa form về mặc định?',
  'opt.reset.yes': 'Khôi phục',
  'opt.reset.no': 'Giữ lại',
  'opt.audit.title': 'Audit log',
  'opt.audit.sub':
    'Mỗi bước ghi, kể cả Dry-run, đều có một dòng. Lưu cục bộ 90 ngày.',
  'opt.audit.sample': 'Dữ liệu mẫu',
  'opt.audit.sampleNote':
    'Chưa có audit thật nên đang hiện dữ liệu mẫu để duyệt giao diện.',
  'opt.audit.csv': 'Export CSV',
  'opt.audit.jsonl': 'Export JSONL',
  'opt.audit.verbose':
    'logDetail đang là verbose: file export có thể chứa tên TKQC và BM ID.',
  'opt.audit.filters': 'Bộ lọc',
  'opt.audit.from': 'Từ ngày',
  'opt.audit.to': 'Đến ngày',
  'opt.audit.flow': 'Flow',
  'opt.audit.result': 'Kết quả',
  'opt.audit.search': 'Tìm',
  'opt.audit.searchHint': 'BM, target, runId',
  'opt.audit.table': 'Bảng audit log',
  'opt.audit.empty': 'Không có dòng nào khớp bộ lọc.',
  'opt.audit.none': 'Chưa có dòng audit nào.',
  'opt.audit.count': '{from}–{to} trong {total} dòng',
  'opt.audit.loading': 'Đang tải audit log…',
  'opt.flow.all': 'Tất cả flow',
  'opt.flow.partner-assign': 'Gán partner',
  'opt.flow.partner-remove': 'Gỡ partner',
  'opt.flow.rename': 'Đổi tên TKQC',
  'opt.flow.inventory': 'Kiểm kê tài sản',
  'opt.result.all': 'Tất cả kết quả',
  'opt.result.done': 'done',
  'opt.result.pending': 'pending-approval',
  'opt.result.failed': 'failed',
  'opt.result.skip': 'bỏ qua',
  'opt.result.dry': 'không ghi (dry-run)',
  'opt.mode.read': 'Đọc',
  'opt.col.time': 'Thời gian',
  'opt.col.flow': 'Flow',
  'opt.col.bm': 'BM',
  'opt.col.target': 'Target',
  'opt.col.mode': 'Mode',
  'opt.col.result': 'Kết quả',
  'opt.col.run': 'runId',
  'opt.pager': 'Phân trang',
  'opt.pager.prev': 'Trang trước',
  'opt.pager.next': 'Trang sau',
  'opt.pager.page': 'Trang {n}',
  'opt.dev.title': 'Devtest',
  'opt.dev.sub':
    'Dành cho dev và operator nâng cao. Cờ ở đây không mở khoá Full, không hạ ngưỡng probe hay giới hạn an toàn.',
  'opt.dev.on': 'Bật',
  'opt.dev.off': 'Tắt',
  'opt.dev.devtest': 'Bật devtest',
  'opt.dev.devtestDesc':
    'Hiện công cụ debug trong side panel và ghi thời gian từng bước.',
  'opt.dev.probeTab': 'Hiện tab Probe',
  'opt.dev.probeTabDesc':
    'Cho operator xem hit-rate selector ngay trong side panel.',
  'opt.dev.snapshot': 'Lưu DOM snapshot khi selector trượt',
  'opt.dev.snapshotDesc':
    'Chỉ lưu cục bộ, tự xoá sau 24 giờ. Không gửi đi đâu.',
  'opt.dev.logDetail': 'Mức chi tiết log',
  'opt.dev.logDetailDesc':
    'off: chỉ audit · basic: thêm step và selector · verbose: thêm nội dung field. Tự về off sau 24 giờ.',
  'opt.dev.verboseWarn':
    'verbose ghi cả tên TKQC và BM ID vào log cục bộ, có thể lọt vào file export. Tắt khi debug xong.',
  'opt.dev.scenario': 'Kịch bản mô phỏng',
  'opt.dev.scenarioDesc':
    'Chỉ áp dụng cho run mô phỏng. Không ảnh hưởng BM thật. Tham số ?scenario= trên URL side panel vẫn được ưu tiên.',
  'opt.dev.alwaysTitle': 'Luôn bật, không tắt được',
  'opt.dev.alwaysBody':
    'Kill-switch · audit log · từ chối vùng đỏ · emergency stop khi gặp checkpoint, CAPTCHA, temp-block.',
  'opt.dev.saveFail': 'Không lưu được cờ này. Thử lại.',
  'opt.dev.useSim': 'Dùng simulator thay engine',
  'opt.dev.useSimDesc':
    'Side panel chạy mô phỏng trên dữ liệu mẫu thay vì engine thật trên tab BM. Chỉ có tác dụng khi devtest đang bật.',
  'opt.dev.unlockTitle': 'Khoá khẩn cấp đang bật',
  'opt.dev.unlockBody':
    'Engine đã dừng khẩn cấp (checkpoint, đăng nhập, chặn tần suất) và Assist đang bị khoá. Chỉ gỡ sau khi bạn đã xử lý tay trên BM. Dry-run vẫn chạy được.',
  'opt.dev.unlockBtn': 'Gỡ khoá khẩn cấp',
  'opt.dev.unlockFail': 'Không gỡ được khoá. Thử lại.',
  'err.ERR_BUSY':
    'Đang có một run khác trong tab BM này. Đợi run đó xong hoặc dừng nó rồi chạy lại.',
  'err.ERR_INVALID_CONFIG':
    'Cấu hình không hợp lệ (BM ID, danh sách TKQC hoặc quyền). Sửa lại ở các bước cấu hình rồi chạy lại.',
  'err.ERR_UNSUPPORTED_MODE':
    'Engine chưa hỗ trợ mode này. Chọn Dry-run hoặc Assist.',
  'err.ERR_CURFEW':
    'Đang trong khung curfew nên chưa chạy Assist được. Chạy lại ngoài khung giờ này hoặc dùng Dry-run.',
  'err.ERR_BUDGET':
    'Đã hết ngân sách ghi hôm nay. Chạy lại vào ngày mai hoặc dùng Dry-run.',
  'err.ERR_EMERGENCY':
    'Đang có khoá khẩn cấp sau một lần dừng vì checkpoint hoặc đăng nhập. Xử lý tay trên BM rồi gỡ khoá ở Options › Devtest. Đừng tự chạy lại.',
  'err.ERR_RATE_LIMITED':
    'Meta báo chặn tạm thời do thao tác quá nhanh. Run đã dừng và Assist bị khoá 24 giờ. Đợi rồi mới thử lại, đừng chạy lại ngay.',
  'err.ERR_WRONG_SURFACE':
    'Chưa ở trang Cài đặt doanh nghiệp. Mở business.facebook.com/latest/settings rồi chạy lại.',
  'err.ERR_NO_BUSINESS':
    'Tab hiện tại không có business_id nên không tự chuyển trang được. Chọn đúng Business Manager trên tab BM rồi thử lại.',
  'err.ERR_SURFACE_TIMEOUT':
    'Đã chuyển tab sang Cài đặt doanh nghiệp nhưng trang chưa sẵn sàng sau 20 giây. Kiểm tra tab BM (đăng nhập, checkpoint) rồi thử lại.',
  'surface.moving': 'Đang mở Cài đặt doanh nghiệp trên tab BM…',
  'err.ERR_UNEXPECTED_DIALOG':
    'Xuất hiện hộp thoại ngoài dự kiến nên run dừng để nhường bạn. Đóng hộp thoại trên tab BM, kiểm tra tay rồi chạy lại.',
  'err.ERR_LOCATE_TIMEOUT':
    'Không tìm thấy một thành phần trên trang BM (nhãn có thể đã đổi). Sao chép mã lỗi gửi cho dev.',
  'err.ERR_LOCATE_AMBIGUOUS':
    'Có nhiều thành phần cùng khớp một nhãn trên trang BM nên engine không đoán. Sao chép mã lỗi gửi cho dev.',
  'err.ERR_STEP_TIMEOUT':
    'Một bước chờ quá lâu mà trang không đổi. Kiểm tra mạng và tab BM rồi chạy lại bằng Dry-run.',
  'err.ERR_TYPE_MISMATCH':
    'Nội dung gõ vào ô nhập không khớp giá trị cần nhập. Kiểm tra tab BM rồi chạy lại bằng Dry-run.',
  'err.ERR_PERMISSION_MISMATCH':
    'Bộ quyền trong wizard khác cấu hình (có quyền bật dư hoặc không bật được). Engine dừng để không cấp sai quyền; kiểm tra tab BM rồi chạy lại bằng Dry-run.',
  'err.ERR_EXISTING_PERMISSIONS':
    'TKQC đã được gán nhưng chưa xác nhận đủ quyền yêu cầu. Kiểm tra và cập nhật quyền bằng nút Quản lý trong tài sản đã chỉ định, rồi chạy lại Dry-run.',
  'err.ERR_TARGET_NOT_FOUND':
    'Không tìm thấy TKQC đã nhập trong danh sách tài sản của BM. Kiểm tra tên hoặc ID rồi cấu hình lại.',
  'err.ERR_TARGET_AMBIGUOUS':
    'Một mục khớp từ 2 TKQC trở lên nên engine không đoán. Dùng ID đầy đủ hoặc tên chính xác hơn.',
  'err.ERR_NO_TARGETS':
    'Không chọn được TKQC nào trong danh sách của BM. Kiểm tra tên hoặc ID đã dán rồi cấu hình lại.',
  'err.ERR_VERIFY_UNREADABLE':
    'Không đọc lại được kết quả. Có thể đã ghi: kiểm tra tay, đừng chạy lại.',
  'err.ERR_CHECKPOINT':
    'Meta yêu cầu xác minh (checkpoint hoặc CAPTCHA). Run dừng khẩn cấp và Assist bị khoá. Xử lý tay trên BM, đừng tự chạy lại.',
  'err.ERR_LOGGED_OUT':
    'Phiên đăng nhập BM đã hết hoặc bị đăng xuất. Đăng nhập lại trên tab BM rồi chạy lại. Extension không tự điền gì.',
  'err.ERR_TAB_RELOADED':
    'Tab BM đã tải lại hoặc mất kết nối nên run bị mất và không tự chạy tiếp. Kiểm tra tay trên BM xem đã có thay đổi chưa rồi mới chạy lại.',
  'err.ERR_INTERNAL': 'Lỗi nội bộ của engine. Sao chép mã lỗi gửi cho dev.',
} as const;

export type MessageKey = keyof typeof vi;

const en: Record<MessageKey, string> = {
  'lang.switch': 'Language: English. Press to switch to Tiếng Việt',
  'lang.badge': 'EN',
  'header.bm': 'Business Manager',
  'header.checking': 'Checking tab…',
  'header.attached': 'Attached',
  'header.supported': 'supported',
  'header.unreachable': 'Not connected',
  'mode.group': 'Run mode',
  'mode.dry': 'Dry-run',
  'mode.assist': 'Assist',
  'mode.full': 'Full',
  'nav.label': 'Screens',
  'flows.title': 'Flows',
  'flows.sortHint': 'Sorted by rising risk',
  'flows.locked': 'Write not unlocked',
  'flows.soon': 'No config screen yet',
  'risk.read': 'Read',
  'risk.write': 'Standard write',
  'risk.sensitive': 'Sensitive write',
  'tier.read': 'No approval',
  'tier.write': '1-step approval',
  'tier.sensitive': '2-step approval',
  'notice.unreachable':
    'Not connected. Open a business.facebook.com tab and reload it (tabs opened before installing or reloading the extension have no content script).',
  'notice.retry': 'Check again',
  'footer.writes': 'Writes today',
  'footer.curfew': 'Curfew {from}–{to}',
  'footer.curfewOff': 'Curfew off',
  'footer.kill': 'Kill-switch',
  'soon.title': 'Under construction',
  'soon.body': 'This screen has not been built yet.',
  'soon.back': 'Back to Flows',
  'popup.options': 'Open Options',
  'popup.openPanel': 'Open side panel',
  'popup.openFailed':
    'Could not open the side panel. Try again or open it from the browser menu.',
  'popup.killAll': 'Kill-switch · stop all queues',
  'pa.title': 'Assign partner to ad accounts',
  'pa.desc': "Grant a partner BM access to this BM's ad accounts.",
  'pa.back': 'Flows',
  'pa.stepOf': 'Step {n}/4',
  'pa.stepsLabel': 'Setup steps',
  'pa.step.1': 'Partner',
  'pa.step.2': 'Accounts',
  'pa.step.3': 'Permissions',
  'pa.step.4': 'Run',
  'pa.step.doneLabel': 'Step {n}, {name}: done. Reopen to edit',
  'pa.edit': 'Edit',
  'pa.editBm': 'Edit partner BM',
  'pa.editAccounts': 'Edit ad account list',
  'pa.editPerms': 'Edit permissions',
  'pa.cancel': 'Cancel',
  'pa.prev': 'Back',
  'pa.next.2': 'Next · Pick accounts',
  'pa.next.3': 'Next · Pick permissions',
  'pa.next.4': 'Next · Review & run',
  'pa.bm.title': 'Partner BM receiving access',
  'pa.bm.desc': 'The partner gets access to the ad accounts you pick next.',
  'pa.bm.label': 'Partner BM ID',
  'pa.bm.placeholder': '15–17 digits',
  'pa.bm.help':
    'The partner finds their BM ID in Business settings › Business info.',
  'pa.bm.empty': 'Enter the partner BM ID (15–17 digits).',
  'pa.bm.digits': 'BM ID must contain digits only.',
  'pa.bm.length': 'BM ID must be 15–17 digits · currently {n}.',
  'pa.bm.ok': 'Valid · the partner BM name is read again when the run starts.',
  'pa.bm.note':
    'Steps 1–3 only save the setup. Nothing is written to the BM until you run and confirm.',
  'pa.bm.summary': 'Partner BM',
  'pa.hint.bmOk': 'Next: pick the ad accounts to share',
  'pa.hint.bmBad': 'Fix the partner BM ID to continue',
  'pa.acc.title': 'Ad accounts receiving the partner',
  'pa.acc.session': 'Accounts from your signed-in BM session',
  'pa.acc.source': 'Source BM · {id}',
  'pa.acc.refresh': 'Reload',
  'pa.acc.loadMore': 'Load more ad accounts',
  'pa.acc.useManual': 'Enter names or IDs manually',
  'pa.acc.useList': 'Choose from the list',
  'pa.acc.clearUnlisted': 'Deselect items outside the loaded list',
  'pa.acc.limit': 'Up to {n} ad accounts per run.',
  'pa.acc.error.business':
    'The source BM is missing or has changed. Open Business Settings for the BM you want to use, then reload the list.',
  'pa.acc.error.token':
    'No session token was found. Open Business Manager, sign in again if needed, then reload the list; or enter accounts manually.',
  'pa.acc.error.expired':
    'Your access session has expired. Reload BM or sign in again, then reload the list.',
  'pa.acc.error.permission':
    'This session cannot read the ad account list. Check your BM permissions or enter accounts manually.',
  'pa.acc.error.rate':
    'Meta is limiting read requests. Wait a while before reloading the list.',
  'pa.acc.error.network':
    'Cannot connect to BM or Meta. Check your connection, reload BM, then try again.',
  'pa.acc.error.response':
    'Cannot read the ad account response. Reload the list or enter accounts manually.',
  'pa.acc.loaded': '{n} selected · {total} accounts loaded',
  'pa.acc.emptyPage':
    'No accounts in the loaded portion. Choose “Load more ad accounts” to continue.',
  'pa.acc.desc': 'Ad accounts that already have this partner are skipped.',
  'pa.acc.searchLabel': 'Search ad accounts',
  'pa.acc.searchPlaceholder': 'Search by name or ID',
  'pa.acc.selected': '{n}/{total} selected',
  'pa.acc.selectAll': 'Select all active',
  'pa.acc.clearAll': 'Clear all',
  'pa.acc.more': 'Show {n} more ad accounts',
  'pa.acc.active': 'Active',
  'pa.acc.restricted': 'Restricted',
  'pa.acc.loading': 'Loading ad accounts…',
  'pa.acc.empty': 'This BM has no ad accounts.',
  'pa.acc.noMatch': 'No ad account matches “{q}”.',
  'pa.acc.batch': 'More than 10 ad accounts: confirmed in batches of 10.',
  'pa.acc.sample':
    'Sample ad accounts: the inventory read flow (FR-08) is not wired yet, so this list does not come from a real BM.',
  'pa.acc.summary': 'Accounts',
  'pa.acc.paste.desc':
    'The engine matches each entry against the asset list in the BM dialog. Ad accounts that already have the partner are skipped if recognized during the run.',
  'pa.acc.paste.label': 'Paste ad account names or IDs, one per line',
  'pa.acc.paste.placeholder': 'Spa Hoa\n238100451187',
  'pa.acc.paste.count': '{n} valid entries',
  'pa.acc.paste.dup': '{n} duplicate lines were dropped.',
  'pa.acc.paste.long':
    '{n} lines too long (max {max} characters) were dropped.',
  'pa.acc.paste.over': '{n} lines over the {max}-entry limit were dropped.',
  'pa.hint.accOk': '{n} ad accounts will receive the partner',
  'pa.hint.accBad': 'Pick at least 1 ad account to continue',
  'pa.perm.title': 'Permissions for the partner',
  'pa.perm.desc': 'Applied the same way to all {n} selected ad accounts.',
  'pa.perm.ADVERTISE': 'Run ads',
  'pa.perm.ADVERTISE.desc': 'Create and edit ads on the ad account',
  'pa.perm.ANALYZE': 'Analyze',
  'pa.perm.ANALYZE.desc': 'View performance and reports',
  'pa.perm.MANAGE': 'Manage',
  'pa.perm.MANAGE.desc':
    'Full control of the ad account, incl. users and billing',
  'pa.perm.high': 'high access',
  'pa.perm.warnTitle': 'You are granting Manage access',
  'pa.perm.warnBody':
    'The partner BM gets full control of the ad account: add and remove users and change billing. Only grant this under a contract.',
  'pa.hint.perms': '{n} permissions · next, pick the mode',
  'pa.hint.permsHigh':
    '{n} permissions · incl. high access · next, pick the mode',
  'pa.hint.permsBad': 'Pick at least 1 permission to continue',
  'pa.review.title': 'Review setup',
  'pa.review.accounts': 'Accounts · {n}',
  'pa.review.perms': 'Permissions · {n}',
  'pa.review.mode': 'Mode for this run',
  'pa.review.changeMode': 'Change the mode in the top bar',
  'pa.review.fullLocked':
    'Full is locked: write is not unlocked yet (probe ≥ 95% and dry-run pass).',
  'pa.review.diff': 'Preview diff',
  'pa.review.diffSoon': 'Not built',
  'pa.mode.dry.tag': 'Trial run',
  'pa.mode.dry.desc':
    'Navigates and fills forms, skips every write step. Does not change the BM.',
  'pa.mode.assist.tag': 'Guide me',
  'pa.mode.assist.desc':
    'Leads you to the Assign button and stops. You click the last step in the BM tab.',
  'pa.mode.full.tag': 'Execute',
  'pa.mode.full.desc':
    'Runs everything, each write step is verified by readback and paced. Writes for real.',
  'pa.run.dry': 'Trial run on {n} ad accounts',
  'pa.run.assist': 'Guide me on {n} ad accounts',
  'pa.run.full': 'Execute on {n} ad accounts',
  'pa.hint.runDry':
    'Does not change the BM · only shows a “what will happen” diff',
  'pa.hint.runAssist': 'You click the last step in the BM tab',
  'pa.hint.runFull': 'Writes for real · 2-step confirmation before running',
  'pa.run.disconnected': 'BM tab not connected, cannot run',
  'pa.run.curfew': 'Curfew 0h–6h, writes are not allowed now',
  'pa.run.budget': "Today's write budget is used up",
  'sim.chip': 'Simulated',
  'sim.hint':
    'This run is produced by the simulator, nothing is done on the BM.',
  'diff.title': 'Preview changes',
  'diff.sub': 'Assign partner · from the current setup',
  'diff.back': 'Back to edit setup',
  'diff.continue': 'Continue · 2-step confirmation',
  'diff.fullLocked': 'Full is locked, only trial run or Assist.',
  'diff.table': 'Diff table',
  'diff.partnerBm': 'Partner BM',
  'diff.colAsset': 'Ad account · permissions',
  'diff.colOp': 'Action',
  'diff.sum.add': 'added',
  'diff.sum.change': 'changed',
  'diff.sum.remove': 'removed',
  'diff.sum.skip': 'skipped',
  'diff.op.add': 'Add',
  'diff.op.change': 'Change',
  'diff.op.skip': 'Skip',
  'diff.op.unknown': 'Not read',
  'diff.sum.unknown': 'not read',
  'diff.noteUnknown':
    'The engine skips ad accounts that already have the partner if it recognizes them during the run.',
  'diff.noteChange': 'Partner already has {have}, adding {n} more.',
  'diff.noteSkip': 'Already has every permission, skipped (idempotent).',
  'diff.budget':
    'Writes on {n} ad accounts, uses 1 of the {left} writes left today.',
  'diff.nothing': 'Nothing to change. Every ad account already has access.',
  'run.step.1': 'Open BM settings › Partners',
  'run.step.2': 'Find partner or open Add partner',
  'run.step.3': 'Verify BM ID and open asset selection',
  'run.step.4': 'Pick the ad accounts',
  'run.step.5': 'Tick the permissions',
  'run.step.6': 'Click Assign',
  'run.step.7': 'Verify readback',
  'run.stepState.pending': 'waiting',
  'run.stepState.running': 'running',
  'run.stepState.ok': 'ok',
  'run.stepState.waiting': 'your turn',
  'run.stepState.skipped': 'skipped (dry-run)',
  'run.stepState.failed': 'fail',
  'run.writeStep': 'write step',
  'run.steps': 'Steps',
  'run.banner.dry.title': 'Dry-run · BM is not changed',
  'run.banner.dry.desc':
    'Navigates and fills real forms, skips every write step. The result is a diff for you to review.',
  'run.banner.assist.title': 'Assist · You click the last step',
  'run.banner.assist.desc':
    'The panel leads you to the write button and stops. Nothing is injected into the BM page.',
  'run.status.running': 'Running',
  'run.status.waiting-user': 'Waiting for you',
  'run.status.paused': 'Paused',
  'run.runId': 'runId',
  'run.started': 'Started',
  'run.elapsed': 'Elapsed',
  'run.progress': 'Ad account {i}/{n} · {name}',
  'run.stepOf': 'Step {k}/7',
  'run.next.label': 'Next step',
  'run.next.title': 'Click Assign in the BM tab',
  'run.next.1': 'Switch to the attached BM tab.',
  'run.next.2':
    'Check the Assign partners dialog: BM {bm}, permissions {tasks}.',
  'run.next.3': 'Click the Assign button at the bottom of the dialog.',
  'run.next.waiting':
    'Waiting for you to click Assign… the panel moves to verify when the dialog closes.',
  'run.next.simulate': 'Simulate: I clicked Assign',
  'run.next.engineDone': 'I clicked Assign, check now',
  'run.batch': 'Batch {i}/{n}',
  'run.auditFailed': 'Could not write the audit log. Check the storage quota.',
  'run.hidden.title': 'The BM tab is hidden',
  'run.hidden.body':
    'The run is paused and continues by itself when you return to the BM tab.',
  'run.willDo.title': 'What will happen (so far)',
  'run.willDo.full': 'See the full diff',
  'run.willDo.line': 'Assign BM …{bm} → {name} · {tasks}',
  'run.stop': 'Stop',
  'run.paused.title': 'Lost connection to the BM tab',
  'run.paused.body': 'The run paused safely and has not written anything.',
  'run.resync': 'Reconnect (re-sync)',
  'run.otherTab': 'Pick another BM tab',
  'run.paused.what': 'What re-sync does',
  'run.paused.what1': 'Reads the page again and checks the BM and surface.',
  'run.paused.what2': 'Continues from step {k} in the same {mode} mode.',
  'run.paused.what3':
    'If the tab is now another BM, the run is cancelled, no guessing.',
  'run.empty.title': 'No run yet',
  'run.empty.body': 'Set up a flow and run it to follow progress here.',
  'run.empty.cta': 'Go to Flows',
  'result.title.done.dry':
    'Trial run done · {w} ad accounts to assign, {s} skipped',
  'result.title.done': 'Done · {w} written, {s} skipped',
  'result.title.pending': 'Waiting for a 2nd admin to approve',
  'result.title.failed': 'Stopped at step {k} · {name}',
  'result.title.stopped': 'Stopped by you',
  'result.sub.failed': 'Ad account {i}/{n} · {runId} · {time}',
  'result.range': '{runId} · {from} → {to}',
  'result.targets': 'Result per ad account',
  'result.o.queued': 'not run',
  'result.o.running': 'running',
  'result.o.done': 'done · verified',
  'result.o.doneDry': 'would assign · no write',
  'result.o.skipped-existing': 'already has · skipped',
  'result.o.failed': 'error',
  'result.o.pending-approval': 'pending approval',
  'result.o.unverified': 'not verified',
  'result.unverified.hint':
    'Could not verify. Check by hand before running again.',
  'result.unverified.cancelNote':
    'If you closed the dialog with Cancel, the access was not assigned.',
  'result.title.interrupted': 'Run interrupted',
  'result.readback.title': 'Verify-readback · {name}',
  'result.readback.body':
    'readback {time} · {id}\npartner  {bm}\ntasks    {tasks}\nmatch    {k}/{k} as in the diff',
  'result.copy': 'Copy',
  'result.copied': 'Copied',
  'result.undo.title': 'Need to undo?',
  'result.undo.body':
    'Remove the partner from the {n} ad accounts just assigned. Needs Full and the Remove partner flow (not open yet).',
  'result.undo.btn': 'Undo {n} ad accounts',
  'result.pending.body':
    'This BM requires another admin to approve assigning a partner. The request was sent inside the BM; once approved, the access takes effect.',
  'result.pending.noReplay': 'The extension will not run again.',
  'result.pending.noReplayBody':
    'Clicking again would create a duplicate request; remind the admin to approve the pending one.',
  'result.pending.recheck': 'Check status again',
  'result.pending.recheckNote':
    'Only re-reads the status, never sends a new request. Last check {time}.',
  'result.pending.copyReminder': 'Copy reminder for the admin',
  'result.pending.reminder':
    'Please approve the pending request assigning partner BM {bm} to {n} ad accounts in Business Settings.',
  'result.failed.reason': 'Reason',
  'result.failed.bodyAct':
    'The BM says your account has no permission to manage ad account {name}. Verify-readback confirms this ad account was not changed.',
  'result.failed.bodyLocate':
    'Element not found at step {k} of ad account {name}. Dry-run does not write, so the BM is unchanged.',
  'result.failed.code': '{code} · step {k}',
  'result.failed.copyErr': 'Copy error',
  'result.failed.hint':
    'Ask a BM admin to check your permissions, then rerun the unfinished ad accounts as a trial run first.',
  'result.failed.reconfig': 'Set up again for {n} unfinished ad accounts',
  'result.failed.assigned': '{n} ad accounts were assigned before the error.',
  'result.stopped.body':
    'You stopped the run. Unfinished ad accounts were not changed.',
  'result.done.btn': 'Done',
  'opt.title': 'HPMA Copilot settings',
  'opt.sub': 'v{version} · applies to every BM in this browser',
  'opt.tabs': 'Settings sections',
  'opt.tab.pacing': 'Pacing & limit',
  'opt.tab.audit': 'Audit log',
  'opt.tab.devtest': 'Devtest',
  'opt.loading': 'Loading settings…',
  'opt.pacing.delayTitle': 'Delay between steps',
  'opt.pacing.delaySub':
    'Keep a human pace. You choose the seconds; the shorter, the likelier Meta throttles you.',
  'opt.pacing.base': 'Base delay',
  'opt.pacing.baseHint':
    'Recommended from {rec} seconds · at least {min} second',
  'opt.pacing.baseWarn':
    'Below the recommended {rec} seconds: faster than a human, likely to trigger a temporary Meta block. You can still save.',
  'opt.pacing.jitter': 'Jitter',
  'opt.pacing.jitterHint': 'Random around the base delay · at least {min}%',
  'opt.pacing.write': 'Extra before a write step',
  'opt.pacing.writeHint': 'Added before Assign, Remove, Save',
  'opt.unit.sec': 'seconds',
  'opt.unit.pct': '± %',
  'opt.err.invalid': 'Enter a valid number.',
  'opt.err.minSec': 'Must not be below {min} second(s).',
  'opt.err.minPct': 'Must not be below {min}% (safety threshold).',
  'opt.err.range': 'Enter a value from {min} to {max}.',
  'opt.preview.title': 'Run pace preview',
  'opt.preview.read': 'Read steps are {lo}–{hi} seconds apart.',
  'opt.preview.write': 'Write steps are {lo}–{hi} seconds apart.',
  'opt.preview.blocked':
    'Cannot preview the pace while a field is invalid or below the safety threshold.',
  'opt.limits.title': 'Daily write limit by BM type',
  'opt.limits.sub':
    'Each run that writes counts as 1, even when the result is pending-approval. Reads and Dry-run do not count.',
  'opt.limits.table': 'Write limits by BM type',
  'opt.limits.colKind': 'BM type',
  'opt.limits.colDetect': 'Detected as',
  'opt.limits.colWrites': 'Writes / day',
  'opt.limits.colBatch': 'Max batch',
  'opt.limits.writesAria': 'Writes per day, {kind}',
  'opt.limits.batchAria': 'Max batch, {kind}',
  'opt.limits.note':
    'The side panel uses the "Standard BM" row until the BM type can be detected.',
  'opt.kind.new': 'New BM',
  'opt.kind.newDetect': 'Created under 30 days ago',
  'opt.kind.standard': 'Standard BM',
  'opt.kind.standardDetect': 'Default',
  'opt.kind.verified': 'Verified BM',
  'opt.kind.verifiedDetect': 'Business verified',
  'opt.curfew.title': 'Curfew',
  'opt.curfew.sub': 'During this window only read flows and Dry-run can run.',
  'opt.curfew.switch': 'Enable curfew',
  'opt.curfew.on': 'On',
  'opt.curfew.off': 'Off',
  'opt.curfew.from': 'From',
  'opt.curfew.to': 'To',
  'opt.curfew.tz': 'Time zone',
  'opt.curfew.offWarn':
    'Turning curfew off allows write runs between 0:00 and 6:00. We recommend keeping it on.',
  'opt.save.none': 'No changes.',
  'opt.save.dirty': 'You have unsaved changes.',
  'opt.save.invalid': 'Fix the fields with errors before saving.',
  'opt.save.done': 'Saved.',
  'opt.save.fail': 'Could not save: check the storage quota and try again.',
  'opt.save.btn': 'Save changes',
  'opt.reset.btn': 'Restore defaults',
  'opt.reset.confirm':
    'Discard unsaved changes and reset the form to defaults?',
  'opt.reset.yes': 'Restore',
  'opt.reset.no': 'Keep editing',
  'opt.audit.title': 'Audit log',
  'opt.audit.sub':
    'Every write step, including Dry-run, has one row. Kept locally for 90 days.',
  'opt.audit.sample': 'Sample data',
  'opt.audit.sampleNote':
    'There is no real audit yet, so sample data is shown to review the screen.',
  'opt.audit.csv': 'Export CSV',
  'opt.audit.jsonl': 'Export JSONL',
  'opt.audit.verbose':
    'logDetail is verbose: the export file may contain ad account names and BM IDs.',
  'opt.audit.filters': 'Filters',
  'opt.audit.from': 'From date',
  'opt.audit.to': 'To date',
  'opt.audit.flow': 'Flow',
  'opt.audit.result': 'Result',
  'opt.audit.search': 'Search',
  'opt.audit.searchHint': 'BM, target, runId',
  'opt.audit.table': 'Audit log table',
  'opt.audit.empty': 'No rows match the filters.',
  'opt.audit.none': 'There are no audit rows yet.',
  'opt.audit.count': '{from}–{to} of {total} rows',
  'opt.audit.loading': 'Loading audit log…',
  'opt.flow.all': 'All flows',
  'opt.flow.partner-assign': 'Assign partner',
  'opt.flow.partner-remove': 'Remove partner',
  'opt.flow.rename': 'Rename ad account',
  'opt.flow.inventory': 'Asset inventory',
  'opt.result.all': 'All results',
  'opt.result.done': 'done',
  'opt.result.pending': 'pending-approval',
  'opt.result.failed': 'failed',
  'opt.result.skip': 'skipped',
  'opt.result.dry': 'no write (dry-run)',
  'opt.mode.read': 'Read',
  'opt.col.time': 'Time',
  'opt.col.flow': 'Flow',
  'opt.col.bm': 'BM',
  'opt.col.target': 'Target',
  'opt.col.mode': 'Mode',
  'opt.col.result': 'Result',
  'opt.col.run': 'runId',
  'opt.pager': 'Pagination',
  'opt.pager.prev': 'Previous page',
  'opt.pager.next': 'Next page',
  'opt.pager.page': 'Page {n}',
  'opt.dev.title': 'Devtest',
  'opt.dev.sub':
    'For developers and advanced operators. These flags do not unlock Full or lower probe thresholds or safety limits.',
  'opt.dev.on': 'On',
  'opt.dev.off': 'Off',
  'opt.dev.devtest': 'Enable devtest',
  'opt.dev.devtestDesc':
    'Show debug tools in the side panel and record the timing of each step.',
  'opt.dev.probeTab': 'Show Probe tab',
  'opt.dev.probeTabDesc':
    'Lets operators see selector hit-rate right in the side panel.',
  'opt.dev.snapshot': 'Save DOM snapshot when a selector misses',
  'opt.dev.snapshotDesc':
    'Stored locally only and deleted after 24 hours. Never sent anywhere.',
  'opt.dev.logDetail': 'Log detail level',
  'opt.dev.logDetailDesc':
    'off: audit only · basic: adds steps and selectors · verbose: adds field content. Returns to off after 24 hours.',
  'opt.dev.verboseWarn':
    'verbose writes ad account names and BM IDs to the local log, which can end up in export files. Turn it off when you finish debugging.',
  'opt.dev.scenario': 'Simulation scenario',
  'opt.dev.scenarioDesc':
    'Applies to simulated runs only. Does not affect a real BM. A ?scenario= parameter on the side panel URL still takes priority.',
  'opt.dev.alwaysTitle': 'Always on, cannot be turned off',
  'opt.dev.alwaysBody':
    'Kill-switch · audit log · red-zone refusal · emergency stop on checkpoint, CAPTCHA, temp-block.',
  'opt.dev.saveFail': 'Could not save this flag. Try again.',
  'opt.dev.useSim': 'Use the simulator instead of the engine',
  'opt.dev.useSimDesc':
    'The side panel runs a simulation on sample data instead of the real engine on the BM tab. Only takes effect while devtest is on.',
  'opt.dev.unlockTitle': 'Emergency lock is on',
  'opt.dev.unlockBody':
    'The engine made an emergency stop (checkpoint, login, rate limit) and Assist is locked. Only remove it after you have handled the BM by hand. Dry-run still works.',
  'opt.dev.unlockBtn': 'Remove emergency lock',
  'opt.dev.unlockFail': 'Could not remove the lock. Try again.',
  'err.ERR_BUSY':
    'Another run is already active in this BM tab. Wait for it to finish or stop it, then run again.',
  'err.ERR_INVALID_CONFIG':
    'Invalid setup (BM ID, ad account list or permissions). Fix it in the setup steps and run again.',
  'err.ERR_UNSUPPORTED_MODE':
    'The engine does not support this mode yet. Pick Dry-run or Assist.',
  'err.ERR_CURFEW':
    'Inside the curfew window, so Assist cannot run. Run again outside this window or use Dry-run.',
  'err.ERR_BUDGET':
    "Today's write budget is used up. Run again tomorrow or use Dry-run.",
  'err.ERR_EMERGENCY':
    'An emergency lock is on after a stop caused by a checkpoint or login. Handle it by hand on the BM, then remove the lock in Options › Devtest. Do not rerun on your own.',
  'err.ERR_RATE_LIMITED':
    'Meta reports a temporary block for acting too fast. The run stopped and Assist is locked for 24 hours. Wait before trying again, do not rerun right away.',
  'err.ERR_WRONG_SURFACE':
    'Not on the Business settings page. Open business.facebook.com/latest/settings and run again.',
  'err.ERR_NO_BUSINESS':
    'The current tab has no business_id, so it cannot switch pages by itself. Pick the right Business Manager in the BM tab and try again.',
  'err.ERR_SURFACE_TIMEOUT':
    'The tab was sent to Business settings but the page was not ready after 20 seconds. Check the BM tab (login, checkpoint) and try again.',
  'surface.moving': 'Opening Business settings in the BM tab…',
  'err.ERR_UNEXPECTED_DIALOG':
    'An unexpected dialog appeared, so the run stopped and left control to you. Close the dialog in the BM tab, check by hand, then run again.',
  'err.ERR_LOCATE_TIMEOUT':
    'Could not find an element on the BM page (the label may have changed). Copy the error code and send it to the dev.',
  'err.ERR_LOCATE_AMBIGUOUS':
    'Several elements on the BM page match one label, so the engine does not guess. Copy the error code and send it to the dev.',
  'err.ERR_STEP_TIMEOUT':
    'A step waited too long without the page changing. Check the network and the BM tab, then rerun as a Dry-run.',
  'err.ERR_TYPE_MISMATCH':
    'The text typed into an input does not match the intended value. Check the BM tab, then rerun as a Dry-run.',
  'err.ERR_PERMISSION_MISMATCH':
    'The permission set in the wizard differs from your config (an extra permission is on, or one cannot be turned on). The engine stopped to avoid granting the wrong access; check the BM tab and re-run with Dry-run.',
  'err.ERR_EXISTING_PERMISSIONS':
    'This ad account is already assigned, but the requested permissions could not be confirmed. Check and update access using Manage in assigned assets, then rerun a Dry-run.',
  'err.ERR_TARGET_NOT_FOUND':
    'The ad account you entered was not found in the BM asset list. Check the name or ID and set up again.',
  'err.ERR_TARGET_AMBIGUOUS':
    'One entry matches 2 or more ad accounts, so the engine does not guess. Use the full ID or a more exact name.',
  'err.ERR_NO_TARGETS':
    'No ad account could be selected from the BM list. Check the pasted names or IDs and set up again.',
  'err.ERR_VERIFY_UNREADABLE':
    'Could not read the result back. It may have been written: check by hand, do not rerun.',
  'err.ERR_CHECKPOINT':
    'Meta asks for verification (checkpoint or CAPTCHA). The run made an emergency stop and Assist is locked. Handle it by hand on the BM, do not rerun on your own.',
  'err.ERR_LOGGED_OUT':
    'The BM session expired or you were logged out. Log in again in the BM tab and run again. The extension never fills anything in.',
  'err.ERR_TAB_RELOADED':
    'The BM tab reloaded or lost connection, so the run was lost and does not continue. Check by hand on the BM whether anything changed before running again.',
  'err.ERR_INTERNAL':
    'Internal engine error. Copy the error code and send it to the dev.',
};

const messages: Record<Lang, Record<MessageKey, string>> = { vi, en };

export function translate(
  lang: Lang,
  key: MessageKey,
  params?: Record<string, string | number>
): string {
  const text = messages[lang][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  );
}

// Dùng cho khoá dựng động từ mã lỗi (`err.<code>`): mã lạ thì không có câu mô tả.
export function isMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(vi, key);
}

export function isLang(value: unknown): value is Lang {
  return value === 'vi' || value === 'en';
}
