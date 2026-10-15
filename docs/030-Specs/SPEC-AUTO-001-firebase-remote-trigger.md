---
id: SPEC-AUTO-001
type: technical-spec
status: draft
created: 2026-10-14
related:
  [
    SPEC-ENG-001,
    SPEC-ENG-002,
    PRD-001,
    'research/08',
    'research/09',
    'research/12',
    'research/19',
    'research/21',
  ]
---

# SPEC-AUTO-001 — Điều khiển flow từ xa qua Firebase Realtime Database

> Bối cảnh: hiện mọi flow được kích hoạt bằng tay từ side panel (SPEC-ENG-001 §3–4, SPEC-ENG-002). Anh muốn vận hành **nhiều Chrome profile song song — mỗi profile đảm nhiệm một flow trên một BM cố định** — và phát lệnh tập trung qua **Firebase Realtime Database (RTDB)** thay vì ngồi bấm từng máy. Văn bản này định nghĩa schema RTDB, vòng đời job, dispatcher chạy trong service worker (SW) của extension, và các cổng an toàn **không được** bypass. Pattern "Relay → WebSocket/SSE/Firebase vào extension" đã được tiên liệu ở `research/08` §Insights; vận hành nhiều máy xem thêm `research/15`.

## 1. Mục đích & phạm vi

Biến RTDB thành **hàng đợi lệnh tập trung**: một nguồn điều phối (ops CLI ở pha 1–2, dashboard ở pha 3, coordinator cho chuỗi) ghi job; extension ở mỗi Chrome profile lắng nghe, nhặt job đúng loại flow của mình, chạy engine hiện có trong content script, rồi ghi kết quả ngược lên RTDB. Không viết lại engine: dispatcher chỉ **dựng đúng `RunStartCommand` mà side panel đang gửi** (`src/shared/messaging.ts:30–40`) và bơm vào con đường `tabs.sendMessage` đã có.

**Trong phạm vi:**

- Schema RTDB: `machines`, `jobs` (partition theo `businessId`), vòng đời trạng thái, presence/heartbeat, Database Rules.
- Module `src/background/firebaseRelay.ts` (SW): kết nối RTDB, nhận diện machine, claim job, dispatch, báo kết quả, cancel từ xa.
- Job payload cho 2 flow hiện có: `partner-assign` và `partner-approve` (gồm quy trình 2 pha scan → review → run).
- Chuỗi `assign → approve` giữa hai profile **cùng BM** (admin 1 gán, admin 2 duyệt) do coordinator điều phối (§7.3): hợp đồng dữ liệu, thuật toán đối chiếu, quyền của coordinator. **Thiết kế chốt ở spec này, triển khai ở pha 3** (§9).
- Ops CLI tạo/duyệt job qua client SDK để Database Rules luôn áp dụng (§7.4).
- Cổng an toàn, bảo mật (Auth + Database Rules), thay đổi manifest, 3 pha triển khai.

**Ngoài phạm vi:**

- Gỡ `FULL_LOCKED` (`src/sidepanel/SidePanel.tsx:43`) và chính sách chạy `full` không người giám sát — chỉ nêu điều kiện để mở ở pha 3, quyết định ở Q4.
- Dashboard web tạo/duyệt job (là sản phẩm riêng; spec này chỉ chốt hợp đồng dữ liệu nó ghi/đọc).
- Hạ tầng chạy coordinator/janitor (D14): pha 2 là CLI Node chạy trên máy anh, không cần Blaze; Cloud Functions chỉ cân nhắc ở pha 3. **Coordinator của chuỗi §7.3 là bắt buộc nếu dùng auto-match** (pha 3); spec chốt hợp đồng dữ liệu, thuật toán, quyền và cách chạy ở §7.3.g.
- Automation mới ngoài 2 flow đã có engine.

## 2. Quyết định đã chốt

| #   | Quyết định                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| :-- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | RTDB là **kênh lệnh từ xa duy nhất**. Extension không mở thêm cổng nào khác (không webhook, không `externally_connectable`); trang BM vẫn không có đường message vào extension (SPEC-ENG-001 §4).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| D2  | **1 Chrome profile = 1 flow = 1 BM.** Danh tính `flow` + `businessId` của profile do **custom claim** `{ machineId, bm, flow }` quyết định (ops gán, §4.3, §8.2) — Rules cưỡng chế ở server, Options chỉ hiển thị (§4.3); machine record chỉ phản chiếu lại để giám sát. Dispatcher từ chối job khác flow ở client, Rules từ chối claim job khác flow ở server, và engine vốn đã từ chối khi tab ở BM khác (controller `start`, SPEC-ENG-001). "Khác flow" tính theo bảng chấp nhận ở §5.1: machine `partner-approve` phục vụ cả job `requests.scan`.                                                                                                                                   |
| D3  | **Không phát minh hình dáng lệnh mới.** Job mang `flow` + `config` đúng shape `RunConfig`/`ApproveConfig` hiện tại; dispatcher map thẳng thành `RunStartCommand`, engine tự validate lại bằng `parseRunConfig`/`parseApproveConfig` như hôm nay. Ngoại lệ duy nhất đã duyệt: Q2 có thể thêm một trường đánh dấu nguồn SW vào `RunStartCommand` (§8.1).                                                                                                                                                                                                                                                                                                                                  |
| D4  | Listener đặt ở **service worker**, không đặt ở side panel (panel chỉ sống khi user mở). Kèm cơ chế sống còn SW: WebSocket RTDB + `chrome.alarms` heartbeat dự phòng (§6.3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| D5  | **Claim job bằng RTDB transaction** `pending → claimed` kèm `claimedBy` — hai machine cùng BM + flow không bao giờ chạy trùng một job. Rules phải cho phép đúng thao tác này (§8.2). Engine mỗi profile chỉ 1 run active (`ERR_BUSY`), dispatcher chạy **tuần tự**, không chạy song song.                                                                                                                                                                                                                                                                                                                                                                                               |
| D6  | Flow duyệt request giữ nguyên gate "con người đã xem danh sách" (`ApproveConfig.requests` bắt buộc, `src/shared/approve.ts:20–27`): automation chạy **2 pha** — job scan ghi candidate lên RTDB, con người duyệt trên dashboard, job run mới được tạo (§7.2). Gate này được **cưỡng chế bằng Database Rules** (job run phải tham chiếu `scanJobId` đã `done`, §8.2), không chỉ là quy ước. Có một đường thay thế được duyệt riêng, opt-in theo job: chuỗi auto-match (D12, §7.3). Rules chỉ bảo đảm job duyệt tham chiếu một scan đã `done`; việc `requests` chép đúng từ scan đó là trách nhiệm của ops CLI (§7.4) và engine vẫn chỉ duyệt request đang có thật trong Needs review.    |
| D7  | **Mọi gate an toàn hiện hữu giữ nguyên**: emergency lock, rate-limit 24 h, curfew, write budget, watcher checkpoint/CAPTCHA/logout, pacing sàn (`MICRO_MIN_MS`, `BATCH_MIN_MS`). Job từ xa không có đặc quyền gì thêm so với lệnh bấm tay. **Lưu ý:** engine bỏ qua emergency/rate-limit/curfew/budget khi `mode === 'dry'` (`controller.ts:96`) và `RequestsRead` không đi qua controller, nên với job từ xa **dispatcher tự kiểm thêm** `engine:emergencyStop` và `engine:rateLimitedUntil` (`src/shared/budget.ts:9,11`) trong `storage.local` trước khi claim **bất kỳ** job nào, kể cả `dry` và `requests.scan` (§5.1 bước 2). Đây là cổng chặt hơn bấm tay, không phải nới.       |
| D8  | `mode` của job chỉ nhận `dry` (pha 2) và `assist`/`full` (pha 3, sau Q4). Tuyệt đối không có đường nào để job `full` chạy khi `FULL_LOCKED` còn đúng với flow đó. **`FULL_LOCKED` chỉ tồn tại ở panel** (`SidePanel.tsx:43`); `isRunCommand` (`messaging.ts:121–124`) và controller (`controller.ts:77`) đều **chấp nhận** `full` cho `partner-approve`. Vì vậy có hai lớp khoá độc lập: (1) hằng `REMOTE_ALLOWED_MODES` trong `jobDispatcher.ts` (pha 1–2: `['dry']`), job có `mode` ngoài danh sách → `error` `ERR_JOB_INVALID`, không gửi lệnh; (2) Database Rules từ chối ghi job có `mode` ngoài danh sách của pha (§8.2). Mở mode mới phải sửa **cả hai** trong cùng một release. |
| D9  | Vòng đời job gồm `cancelled`: cờ `cancelRequested` trên RTDB → dispatcher gửi `run.stop`; tiếp tục là công việc của người vận hành (không tự resume), giống định hướng "không tự chạy tiếp sau reload" hiện nay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D10 | Job được **partition theo BM**: `ext/jobs/<businessId>/<jobId>`. Machine chỉ listen nhánh BM của mình → không đọc được job (chứa `queries`/`requests`) của BM khác, tranh chấp claim chỉ còn giữa các máy cùng BM, khỏi lọc client-side theo `businessId`. Kill-switch cũng theo BM (§5.3).                                                                                                                                                                                                                                                                                                                                                                                             |
| D11 | Mọi mốc thời gian trên RTDB dùng **server timestamp** (`ServerValue.TIMESTAMP`, số ms), không dùng đồng hồ máy: ordering, offline (5 phút) và reclaim (15 phút) không được lệch theo clock của từng profile.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| D12 | Ngoài đường HITL của D6, có **đường auto-match** (hướng b) bật theo **từng job assign** (`chain.auto = true` do ops đặt): khi run assign của admin 1 dừng ở `pending-approval` (BM yêu cầu admin thứ 2 duyệt, `partnerAssign.ts:795`), coordinator tự scan Needs review **trên cùng BM** bằng máy `partner-approve` của admin 2, rồi tạo job approve cho **đúng tập request khớp với TKQC đang chờ duyệt**. Gate thay cho "người xem": đối chiếu khớp + chỉ `approve` (không bao giờ `decline`) + trần/ngày; rules cưỡng chế phần nguồn gốc (provenance), phần đối chiếu tập con chạy ở coordinator (§7.3). **Triển khai ở pha 3** (chỉ có ý nghĩa khi assign ghi thật).                |
| D13 | **Máy extension không bao giờ tạo job** — kể cả chuỗi `assign → approve`. Chuỗi được điều phối bởi **coordinator** (thành phần ngoài extension) với danh tính riêng (custom claim `coordinator`) và quyền hẹp: chỉ tạo job `requests.scan`/`partner-approve` thuộc một chuỗi do ops khai trên job assign **cùng nhánh BM** (§7.3, §8.2).                                                                                                                                                                                                                                                                                                                                                |
| D14 | **Coordinator = module Node độc lập `coordinator/`** (chốt Q9; n8n loại), logic tách khỏi nơi chạy: hai hàm thuần `onAssignFinished` và `tick`. **Pha 2 chạy bằng CLI trên máy anh** (vòng lặp 60 giây, không cần Blaze) và chỉ gồm janitor (reclaim §5.4, dọn TTL PII, prune job cũ) cùng ops CLI (§7.4); phần chuỗi bật ở pha 3. **Pha 3 mới cân nhắc đưa lên Cloud Functions** bọc cùng logic. Ở cả hai nơi: khởi tạo với `databaseAuthVariableOverride` mang claim `coordinator` để Database Rules vẫn áp dụng; không có HTTP endpoint (giữ D1) (§7.3.g).                                                                                                                           |
| D15 | **Mọi thao tác ghi job đi qua Rules.** Firebase console ghi bằng quyền admin, **bỏ qua** Security Rules (không kiểm `mode`, `scanJobId`, `approvedBy`, `createdAt`). Vì vậy console chỉ dùng để **đọc** và bật kill-switch khẩn cấp; tạo/duyệt/huỷ job dùng ops CLI đăng nhập bằng tài khoản có claim `ops` qua client SDK (§7.4).                                                                                                                                                                                                                                                                                                                                                      |

## 3. Kiến trúc tổng thể

```
Nguồn điều phối (ops CLI / dashboard; coordinator cho chuỗi)
        │  ghi job qua client SDK — luôn chịu Database Rules (D15)
        ▼
┌────────────────────── Firebase RTDB ──────────────────────┐
│  /ext/machines/<machineId>   presence, flow, businessId   │
│  /ext/jobs/<businessId>/<jobId>  pending → … → done|error │
└───────────────────────────────────────────────────────────┘
        ▲ listen (WebSocket)          ▲ ghi status/result/presence
        │                              │
┌───────┴──── Service Worker ─────────┴────────────────────────┐
│  firebaseRelay: auth → listen jobs → claim (transaction) →   │
│  dựng RunStartCommand → ensureSurface → tabs.sendMessage     │
│  lắng run.state / lastRun → ghi ngược lên job                │
└──────────────────┬───────────────────────────────────────────┘
                   │ chrome.tabs.sendMessage (sender.url thuộc extension → content chấp nhận)
                   ▼
        Content script (tab BM của profile) — engine hiện có:
        controller → runner → flows/partnerAssign | partnerApprove
        audit, writeBudget, lastRun → storage.local
```

**Coordinator (ngoài extension):** khi cần chuỗi nhiều flow trên cùng một BM (profile admin 1 assign → profile admin 2 approve), một thành phần riêng đứng cạnh RTDB — không nằm trong SW của profile nào — nghe trạng thái job và tạo job kế tiếp ở **cùng nhánh BM** (§7.3). Các máy vẫn chỉ biết nhận job của nhánh BM mình; không máy nào biết về máy khác (D13).

Nguyên tắc tương thích: SW là extension page nên message từ SW tới content script đi qua **đúng bộ lọc `sender.url`** hiện có (`src/content/index.ts`, nhận từ "Nguồn lệnh" của SPEC-ENG-001 §12a) — không cần nới validation phía content.

Bố cục mã mới:

| File (mới nếu không ghi)                     | Vai trò                                                                                                                      |
| :------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `src/background/firebaseRelay.ts`            | Vòng đời kết nối RTDB: auth, listen, reconnect/backoff, heartbeat presence                                                   |
| `src/background/jobDispatcher.ts`            | State machine claim → dispatch → report; map job → `RunStartCommand`; queue tuần tự (§5, §6)                                 |
| `src/shared/remoteJob.ts`                    | Type `RemoteJob`, `MachineRecord`, type guard viết tay (cùng triết lý `messaging.ts`)                                        |
| `src/shared/machineId.ts`                    | Sinh/đọc `machineId` ổn định trong `storage.local` (§4.3)                                                                    |
| `src/background/index.ts` (mở rộng)          | Khởi động relay khi SW bật; giữ broker ad-accounts hiện có                                                                   |
| `src/shared/hooks/useRunEngine.ts` (mở rộng) | Tách phần dựng command + `ensureSurface` thành hàm dùng chung panel lẫn SW (hoặc nhân bản tối thiểu)                         |
| `src/options/` (thêm mục Remote)             | Hiện `machineId`, `flow` + `businessId` (read-only, đọc từ claim), cảnh báo lệch claim, trạng thái kết nối, nút ngắt kết nối |

## 4. Schema RTDB

### 4.1. Cây dữ liệu

```
ext/
  machines/
    <machineId>                    // ULID, ổn định theo profile (§4.3)
      connectedAt: 1760432400000   // server timestamp (ms), ghi khi SW khởi động/wake
      lastHeartbeatAt: 1760434200000 // server timestamp, cập nhật mỗi ~60 s — nguồn sự thật duy nhất về presence
      flow: "partner-assign"       // flow duy nhất profile này phục vụ (job flow chấp nhận: §5.1)
      businessId: "987654321098765"// BM của profile; quyết định nhánh jobs mà SW listen
      status: "idle"               // idle | busy | blocked (blocked = job đang xếp chờ khoá an toàn, §5.2)
      blockedReason: null          // emergency | rate-limited | curfew | budget | logged-out | checkpoint
      blockedUntil: null           // server timestamp; null = không có hạn (cần người gỡ tại profile)
      currentJobId: null           // job đang giữ (set ngay sau khi claim thắng, xoá khi job kết thúc/un-claim)
      extensionVersion: "0.8.0"    // phục vụ chẩn đoán & rollout
  // Danh tính máy KHÔNG nằm trong cây dữ liệu mà ở custom claims của tài khoản Firebase Auth
  // (ops gán qua Admin SDK): { machineId, bm, flow }  — máy (flow ∈ partner-assign | partner-approve);  { ops: true } — người vận hành;
  // { coordinator: true } — tài khoản dịch vụ của coordinator (§7.3, §8.2).
  killSwitch/
    <businessId> | global: true    // §5.3
  chains/
    <assignJobId>                  // chỉ coordinator ghi; ops đọc để giám sát (§7.3, pha 3)
      status: "waiting-scan"       // waiting-scan | scanning | approving | done | partial | held | skipped | error
      businessId: "…"              // BM của job assign = BM của scan/approve (chuỗi không rời nhánh)
      expected: 3                  // |E| = số TKQC outcome `pending-approval` của job assign
      attempts: 1                  // số lần scan đã chạy
      nextActionAt: 1760432520000  // server timestamp; coordinator poll mỗi phút
      scanJobId: null              // scan gần nhất
      approveJobId: null
      matched: null                // |M|
      unmatched: null              // số request trong scan không khớp E (không bị chạm tới)
      ambiguous: null              // số request bị bỏ vì mơ hồ (cR(k) > cE(k), §7.3.c)
      remaining: null              // counts.queued của job assign: TKQC chưa chạy, ops tạo job assign mới
      updatedAt: 1760432400000
      error: null                  // { code, message }
  jobs/
    <businessId>/                  // D10: partition theo BM
      <jobId>                      // RTDB push key
        // ---- Phần BẤT BIẾN: ops tạo một lần, không ai sửa được sau đó (rules §8.2) ----
        flow: "partner-assign"     // "partner-assign" | "partner-approve" | "requests.scan"
        mode: "dry"                // dry | assist | full (rules chặn theo pha, D8)
        businessId: "987654321098765" // bắt buộc trùng <businessId> của path (rules kiểm)
        config: { … }              // đúng shape RunConfig / ApproveConfig / ScanConfig (§7)
        createdAt: 1760432400000   // server timestamp
        createdBy: "<uid>"         // = auth.uid của người/dịch vụ tạo (rules kiểm)
        scanJobId: null            // bắt buộc với flow partner-approve (§7.2, rules kiểm)
        approvedBy: null           // bắt buộc với flow partner-approve: uid người đã xem (approval = human) hoặc uid coordinator (auto-match)
        approval: null             // flow partner-approve: "human" | "auto-match" (D6 / D12)
        chain: null                // xem §7.3: trên job assign = khai chuỗi (ops); trên scan/approve do coordinator tạo = provenance
        cancelRequested: false     // chỉ ops ghi được
        // ---- Phần TRẠNG THÁI: máy claim ghi, qua transaction trên node `state` ----
        state:
          status: "pending"        // §4.2 (prose trong spec viết tắt là `status`)
          claimedBy: null          // machineId thắng transaction
          claimedAt: null
          startedAt: null
          finishedAt: null
          progressAt: null         // nhịp cuối cùng SW cập nhật khi run tiến triển
          runStatus: null          // phản chiếu RunState.status khi `running` (running | paused | waiting-user)
          pauseReason: null        // vd. 'hidden' — để dashboard phân biệt run treo vì tab ẩn
          result: null             // §4.4
          error: null              // { code, message, stepIndex? }
```

Việc tách `state/` khỏi phần bất biến là có chủ đích: transaction claim (D5) chỉ ghi node `state`, nên rules cho phép máy claim mà **không** cho nó đụng tới `config`/`flow`/`mode`. Trong văn bản còn lại, `status`, `claimedBy`, `progressAt`… hiểu là các trường dưới `state/`; query lắng nghe dùng `orderByChild('state/status')`.

Khác với dữ liệu mẫu anh đang có (`jobs/01 { action: "ADD_PARTNER" }`, chưa partition): thêm tầng `<businessId>`, bỏ nhãn `action` tự do, dùng **`flow` = id flow của engine** (`partner-assign`, `partner-approve`) để map trực tiếp, tránh bảng ánh xạ song song; job scan dùng flow giả `requests.scan` (§7.2). Trường `machine0N { type }` được nâng cấp thành `machines/<machineId> { flow, businessId }` vì cần nhiều hơn một chữ cái loại việc.

### 4.2. Vòng đời job (state machine)

```
                ┌──────────────┐   transaction claim (D5)   ┌──────────┐
   ghi job  ──▶ │   pending    │ ─────────────────────────▶ │ claimed  │
                └──────────────┘                            └────┬─────┘
                     ▲                                           │ run.start accepted
                     │ reclaim CHỈ từ `claimed` khi machine      ▼
                     │ chết (§5.4)                          ┌──────────┐
                     │                                      │ running  │ ── machine chết ──▶ error
                     │                                      └────┬─────┘    (ERR_MACHINE_LOST, §5.4)
            ┌──────────────────┬───────────────┬────────────────┤
            ▼                  ▼               ▼                ▼
        ┌───────┐        ┌─────────┐     ┌───────────┐    ┌───────────┐
        │ done  │        │  error  │     │ cancelled │    │  error    │ (engine reject ngay:
        └───────┘        └─────────┘     └───────────┘    │ ERR_BUSY, ├──▶ đổi lại pending
                                                          │ surface…) │    hoặc error tuỳ mã
                                                          └───────────┘
```

- `pending → claimed`: chỉ qua **transaction** trên node `state` (`status === 'pending' → { status:'claimed', claimedBy: machineId, claimedAt: TIMESTAMP }`). Handler: giá trị hiện tại `null` (cache cục bộ chưa có — SDK luôn gọi lần đầu với giá trị cache) → **trả `null`**, không abort: SDK so hash với server, thấy khác và gọi lại với giá trị thật (**giả định — kiểm ở pha 0 #4**: nếu server áp Rules trước khi so hash thì lần ghi `null` bị `permission_denied` thay vì được gọi lại; đường lui: `get()` node `state` ngay trước transaction để cache luôn ấm); `status !== 'pending'` → trả `undefined` (abort). Transaction thất bại = máy khác đã nhặt, bỏ qua. **Ngay sau khi thắng**, máy ghi `machines/<id>.currentJobId = <jobId>` và `status = 'busy'` (hai lần ghi không atomic; nếu SW chết giữa chừng, reconcile vẫn tìm thấy job qua index `state/claimedBy`, §5.1 bước 0).
- `claimed → running`: khi `run.start` trả `{ ok: true, runId }`; ghi `startedAt` **và** `progressAt` cùng giá trị (rules reclaim chỉ đọc `progressAt`, §8.2).
- Job đang `claimed` mà bị khoá an toàn chặn (§5.2) giữ nguyên `claimed`; máy chuyển `status = 'blocked'` kèm `blockedReason`/`blockedUntil` để dashboard phân biệt với máy đang chạy.
- `running → done | error | cancelled`: theo `RunState.status` khi run kết thúc (bảng dưới); ghi `finishedAt`, `result` hoặc `error`, máy về `idle`. Trong lúc `running`, SW phản chiếu `runStatus`/`pauseReason` để dashboard thấy run `paused` vì tab ẩn hay `waiting-user` (assist).

| `RunState.status` (`src/shared/run.ts:130`) | `state.status` của job                                                                 | Ghi chú                                                                                        |
| :------------------------------------------ | :------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| `running`, `paused`, `waiting-user`         | `running` (+ `runStatus`, `pauseReason`)                                               | Chưa kết thúc                                                                                  |
| `done`                                      | `done`                                                                                 |                                                                                                |
| `pending-approval`                          | `done`, `result.runStatus = 'pending-approval'`                                        | Run assign dừng vì BM cần admin 2 duyệt; target sau mẻ đó còn `queued` (`counts.queued`, §4.4) |
| `failed`                                    | `error` (`error.code` = mã của run)                                                    | Mã checkpoint/logout còn chuyển máy sang `blocked` (§5.2)                                      |
| `stopped`                                   | `cancelled` nếu `cancelRequested`/kill-switch; ngược lại `error` `ERR_STOPPED_LOCALLY` | Người tại profile bấm dừng trên panel, hoặc emergency cục bộ                                   |

- Mọi trạng thái → `cancelled`: khi `cancelRequested = true` (§5.3). Job `claimed/running` bị cancel mà engine đã kịp ghi một phần thì `result.partial = true`.
- Chỉ dispatcher của máy claim job mới được ghi `status`/`result`/`error` của job đó — siết bằng Database Rules (§8.2).

### 4.3. Machine identity & presence

- `chrome.runtime.id` **không ổn định** khi cài extension unpacked/qua các profile → không dùng làm khoá. `machineId` là ULID sinh lần đầu, lưu `storage.local`, xem/sửa ở Options › Remote; xoá dữ liệu extension = machine mới (chấp nhận). Machine mới chỉ hoạt động sau khi ops gán custom claims `{ machineId, bm, flow }` cho tài khoản Auth của profile đó qua Admin SDK (§8.2) — bước cấp máy thủ công, ghi vào runbook; profile phải đăng nhập lại/refresh token để nhận claim.
- **Profile nào làm flow nào = claim `flow`, không phải lựa chọn của user.** SW đọc `flow`/`bm` từ `getIdTokenResult()` (không từ storage) để ghi `machines/<id>` và lọc job; Options › Remote hiển thị hai giá trị này **read-only** kèm cảnh báo khi token thiếu claim (máy chưa được cấp) hoặc tab BM đang ở BM khác `bm`. Lý do không cho user chọn tại Options/popup: nếu chọn tự do thì claim `flow` mất tác dụng (user tự nâng quyền sang flow khác); muốn đổi flow của profile = ops gán lại claim + profile refresh token. Popup chỉ hiện trạng thái (flow, idle/busy/blocked, `blockedReason`), không có control đổi flow.
- Presence: **chỉ heartbeat** — SW ghi `lastHeartbeatAt = ServerValue.TIMESTAMP` mỗi ~60 s (qua alarm, §6.3). Dashboard coi máy **offline** khi `serverNow − lastHeartbeatAt > 5 phút`, với `serverNow = Date.now() + .info/serverTimeOffset`.
- **Không có trường `online` / `onDisconnect`**: SW MV3 bị giết liên tục nên socket đóng/mở liên tục, `online` sẽ flapping dù profile vẫn khoẻ (run vẫn chạy trong content script). Mọi quyết định offline/reclaim dựa vào heartbeat.
- SW khi bật (startup/wake) ghi `connectedAt`, đọc `flow`/`businessId` từ claim `flow`/`bm` của ID token (§4.3) — không từ storage, không tự suy từ tab; panel vẫn bắt buộc chọn đúng BM khi vận hành tay.

### 4.4. Kết quả (`job.result`)

Tóm tắt từ `RunState`/`lastRun`, dạng thuần dữ liệu, **không PII ngoài những gì job đã mang**:

```ts
type JobResult = {
  runId: string;
  runStatus: RunState['status']; // done | failed | stopped | pending-approval
  counts: {
    done: number;
    failed: number;
    skipped: number;
    unverified: number;
    pendingApproval: number;
    // Target chưa chạy tới vì run dừng sớm (vd. `pending-approval` dừng cả run, `partnerAssign.ts:796`).
    // Không ai tự chạy lại phần này: ops tạo job assign mới cho phần còn lại (§7.3.d).
    queued: number;
  };
  partial?: boolean; // bị cancel/stop giữa chừng
  // Chỉ job `partner-assign` có `chain.auto`: TKQC đã gửi lệnh gán và đang chờ admin 2 duyệt, lấy từ
  // `RunTarget` (`src/shared/run.ts:86`) với outcome === 'pending-approval' (`partnerAssign.ts:795`).
  // KHÔNG gồm 'done' (gán xong, không sinh request), 'skipped-existing', 'failed', 'unverified'
  // (không chắc → không đưa vào tập duyệt tự động), 'queued'.
  awaitingApproval?: { accountId: string; name: string }[];
  // Chỉ khi logDetail của profile ≠ 'off' (giữ đúng luật audit SPEC-ENG-001 §8):
  detail?: { code?: string; stepIndex?: number; lang?: string };
};
```

Chi tiết đầy đủ vẫn nằm ở audit trong `storage.local` của từng profile; RTDB chỉ là giám sát tập trung.

**Ngoại lệ PII đã chấp nhận — `result.scan`:** job `requests.scan` ghi `result.scan = { requests: ApproveRequest[] }` (tên BM đối tác/user lấy từ BM, là dữ liệu **mới**, không có sẵn trong job). Đây là chủ đích vì dashboard cần danh sách để người duyệt (D6). Ràng buộc đi kèm: nhánh `ext/jobs/<businessId>` đã riêng tư theo BM (D10); `result.scan` bị xoá sau **24 giờ** kể từ `finishedAt` (bước janitor trong `tick` của coordinator, §7.3.g; pha 1, trước khi có coordinator, ops xoá bằng ops CLI); không ghi trường nào ngoài `ApproveRequest`. Luật `logDetail` không áp cho `result.scan` vì scan là thao tác chỉ đọc do người vận hành chủ động tạo.

**Ngoại lệ PII thứ hai — `result.awaitingApproval`:** cần để coordinator đối chiếu (§7.3); chỉ ghi khi job assign có `chain.auto`, gồm `accountId` + `name` TKQC vốn đã nằm trong `config.queries` hoặc do engine resolve ra; cùng TTL 24 giờ như `result.scan`.

**Retention của job:** job ở trạng thái cuối (`done`/`error`/`cancelled`) bị janitor xoá sau **30 ngày** kể từ `finishedAt` (rules cho phép coordinator xoá đúng loại job này, §8.2). Audit đầy đủ vẫn ở `storage.local` từng profile; RTDB không phải kho lưu lâu dài.

## 5. Dispatcher trong service worker

### 5.1. Vòng tuần tự

0. **Reconcile khi SW khởi động/wake** (trước khi nhặt job mới): RTDB chỉ lọc được theo **một** `orderByChild`, nên đọc `machines/<id>.currentJobId` trước; đồng thời query `ext/jobs/<businessId>` `orderByChild('state/claimedBy').equalTo(machineId)` (index §8.2) rồi lọc client-side `status in (claimed, running)` — bắt được cả job đã claim mà SW chết trước khi kịp ghi `currentJobId`. Với mỗi job tìm thấy: gửi `run.sync` tới tab BM — có run khớp → nối lại reporting; không có run (SW chết trước `run.start`) → trả job về `pending` (un-claim, tính vào bộ đếm retry); run đã kết thúc khi SW chết → chốt `done`/`error` từ `RunState`. Chỉ sau reconcile mới được claim job mới.
1. Listen `ext/jobs/<businessId>` (D10) theo `orderByChild('state/status')` = `pending`, rồi lọc client-side theo **flow chấp nhận** của máy (bảng dưới). Rules phải khai `.indexOn: ["state/status"]` cho nhánh này (§8.2), nếu không SDK tải cả nhánh về client.
2. Với mỗi job hợp lệ theo thứ tự `createdAt`, **cổng trước khi claim** (dừng ở cổng đầu tiên không qua):

   - `machine.status === 'idle'`;
   - `ext/killSwitch/global` và `ext/killSwitch/<businessId>` không bật (rules cũng kiểm, §8.2);
   - **khoá cục bộ của engine** (D7): `engine:emergencyStop` không đặt và `engine:rateLimitedUntil` đã qua — áp cho **mọi** job kể cả `dry`/`requests.scan`, vì engine bỏ qua các khoá này ở `dry`. Không qua → không claim, máy `blocked` (`blockedReason` tương ứng; emergency thì `blockedUntil = null`, chờ người gỡ ở Options).

   Qua hết → transaction claim (§4.2) → thắng thì dispatch, thua thì bỏ qua.

3. Dispatch: validate shape bằng guard trong `remoteJob.ts` — sai shape, hoặc `mode ∉ REMOTE_ALLOWED_MODES` (D8), thì `status: 'error'`, `error.code = 'ERR_JOB_INVALID'`, **không gửi lệnh, không retry** (phải claim trước rồi mới ghi được `error`, vì chỉ máy giữ job được ghi `state`). Job có `flow` ngoài bảng chấp nhận của máy → bỏ qua **trước** khi claim, không error (có thể dành cho máy khác cùng BM).

   | `machines/<id>.flow` | Job `flow` được chấp nhận          |
   | :------------------- | :--------------------------------- |
   | `partner-assign`     | `partner-assign`                   |
   | `partner-approve`    | `partner-approve`, `requests.scan` |

   Job `requests.scan` **không** đi qua `RunStartCommand`: dispatcher gửi `RequestsRead` (§7.2), nên nhánh dispatch tách theo `flow`; tuy vậy vẫn qua cùng claim/report/cancel và cùng bộ lọc `sender.url` của content script.

   **Thoát `blocked`:** mỗi lần alarm heartbeat (§6.3), máy `blocked` kiểm lại đúng điều kiện đã chặn nó — đọc lại `engine:emergencyStop`/`engine:rateLimitedUntil`, so `blockedUntil` với giờ server, hoặc thăm dò lại `location.read` với `logged-out`. Điều kiện đã hết (kể cả khi người vừa gỡ khoá ở Options hay đăng nhập lại) → `status = 'idle'`, xoá `blockedReason`/`blockedUntil`, rồi nhặt job (job `claimed` đang chờ khoá có hạn thì start lại trước). Không có đường nào khác ra khỏi `blocked`.

4. **Tìm/chuẩn bị tab BM của profile theo §5.5** (SW không có "tab đang active" như panel), rồi `ensureSurface` tới surface flow yêu cầu → `tabs.sendMessage(runStart)` (hoặc `RequestsRead` với job scan).
5. Nhận `StartReply`: `ok:false` → xử lý theo mã (bảng dưới); `ok:true` → `running`, theo dõi `run.state`/`run.sync` tới khi run kết thúc → ghi `result`, máy `idle`, nhặt job tiếp.

### 5.2. Ánh xạ lỗi

Ba tầng lỗi khác nhau, không trộn: (a) lỗi khi **chuẩn bị tab** (`ensureSurface`, tìm tab — trước khi gửi lệnh); (b) `StartReply` — `run.start` chỉ trả được các mã ở `controller.ts:75–105`; (c) mã kết thúc của run **đang `running`** (`RunState.status = 'failed'`).

**(a) Chuẩn bị tab** — job vẫn `claimed`:

| Lỗi                                                                                             | Hành động dispatcher                                                                          |
| :---------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------- |
| Không liên lạc được tab BM, `ERR_SURFACE_TIMEOUT`, `ERR_TAB_RELOADED`                           | `pending` lại (un-claim) + backoff; quá 3 lần liên tiếp → `error` (`ERR_SURFACE_UNREACHABLE`) |
| Trang đăng nhập (content script báo `location.reply` không có `business_id` sau khi điều hướng) | Máy `blocked` (`logged-out`, không hạn), job `pending` lại; cần người tại profile             |

**(b) `StartReply.code`** — job vẫn `claimed`:

| Mã                                                                   | Hành động dispatcher                                                                                                                                                                                   |
| :------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_BUSY` (không do chính mình — vd. user đang chạy tay trên panel) | Trả job về `pending` (transaction un-claim), máy backoff 5 phút trước khi nhặt lại                                                                                                                     |
| `ERR_BM_CHANGED` / `ERR_NO_BUSINESS`                                 | Điều hướng lại theo `machine.businessId` (§5.5.3) rồi start lại 1 lần; vẫn lỗi → `pending` + backoff, quá 3 lần → `error` (`ERR_SURFACE_UNREACHABLE`)                                                  |
| `ERR_RATE_LIMITED`                                                   | Giữ `claimed`, máy `blocked` (`rate-limited`, `blockedUntil` = `engine:rateLimitedUntil`), ngủ tới hạn rồi start lại; quá 24 h kể từ `claimedAt` → `error`                                             |
| `ERR_CURFEW`                                                         | Như trên với `blockedUntil` = hết khung curfew                                                                                                                                                         |
| `ERR_BUDGET`                                                         | Như trên với `blockedUntil` = đầu ngày ngân sách kế tiếp. Job `partner-approve` có `requests.length` lớn hơn trần ngày (`writesPerDay`) thì không bao giờ vừa → `error` ngay (`ERR_BUDGET`), không chờ |
| `ERR_EMERGENCY`                                                      | Khoá **không có hạn**: job → `error` (`ERR_EMERGENCY`), máy `blocked` (`emergency`, `blockedUntil = null`) và không claim gì nữa tới khi người gỡ khoá ở Options (§5.1 bước 2)                         |
| `ERR_INVALID_CONFIG`, `ERR_UNSUPPORTED_MODE`                         | `error`, không retry — lỗi từ phía người tạo job                                                                                                                                                       |

**(c) Run kết thúc `failed`** — job đã `running`, không có đường quay lại `claimed`/`pending` (D9: không tự chạy lại):

| Mã                                              | Hành động dispatcher                                                                                                                                                  |
| :---------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERR_CHECKPOINT`, `ERR_LOGGED_OUT`              | Job `error` với mã đó; máy `blocked` (`checkpoint`/`logged-out`, không hạn). Engine đã tự đặt emergency khi gặp checkpoint/CAPTCHA (D7) nên bước 2 của §5.1 cũng chặn |
| `ERR_RATE_LIMITED` (engine phát hiện giữa run)  | Job `error`; máy `blocked` tới `engine:rateLimitedUntil`                                                                                                              |
| `ERR_TAB_RELOADED`                              | Job `error`, không tự chạy lại (§6.3)                                                                                                                                 |
| Mã khác (`ERR_LOCATE_*`, `ERR_STEP_TIMEOUT`, …) | Job `error` với mã đó; máy về `idle`                                                                                                                                  |

### 5.3. Cancel & stop khẩn

- `ops cancel` (§7.4; dashboard ở pha 3) đặt `cancelRequested: true`. SW đang giữ job đó → gửi `run.stop` (run kết thúc trong ≤ 1 step, FR-01) → `cancelled`. Job còn `pending` (chưa máy nào giữ, nên không máy nào được ghi `state`) → ops CLI tự ghi `state.status = 'cancelled'` ngay trong cùng lệnh (rule (c), §8.2); dispatcher cũng bỏ qua mọi job có `cancelRequested` khi chọn job để claim.
- Cancel **không** gỡ các khoá an toàn; muốn bấm "dừng khẩn cấp toàn hệ thống" thì ghi cờ `ext/killSwitch/global = true` (hoặc `ext/killSwitch/<businessId> = true` để dừng riêng một BM): SW của máy tương ứng thấy cờ → cancel job đang chạy + từ chối claim tới khi cờ được gỡ bằng tay; rule claim (a) ở §8.2 cũng từ chối claim khi cờ bật, nên máy chạy bản cũ/lỗi vẫn không nhặt được job. Đây là thao tác duy nhất được phép làm bằng Firebase console khi khẩn cấp (D15). Kill-switch lớp dashboard này **bổ sung**, không thay thế, cờ `emergencyStop` cục bộ của engine. **Giới hạn đã biết:** máy mất kết nối RTDB sẽ không thấy cờ; run đang chạy dở tiếp tục tới hết (không có job mới vì job cũng đến từ RTDB). Chấp nhận, vì run bị chặn bởi write budget và pacing.

### 5.4. Job mồ côi (reclaim)

Hai đường, tách bạch:

- **Máy còn sống nhưng mất dấu job** (SW chết giữa `claimed` và `run.start`): xử lý bởi **reconcile khi khởi động** (§5.1 bước 0), không cần janitor.
- **Máy chết hẳn** (profile đóng, máy tắt), điều kiện chung: mốc cuối (`progressAt`, hoặc `startedAt`/`claimedAt` khi chưa có progress) cũ hơn **TTL 15 phút** **và** heartbeat của `claimedBy` cũ hơn 5 phút. Điều kiện AND chỉ dành cho ca này; một máy heartbeat còn tươi thì luôn tự reconcile được. Hành động tuỳ trạng thái:
  - `claimed` (chưa `run.start`, chưa chạm BM) → trả về `pending`, xoá `claimedBy`. An toàn vì chưa có thao tác nào.
  - `running` → **`error` `ERR_MACHINE_LOST`, không trả về `pending`.** Máy có thể chỉ mất kết nối RTDB/Auth trong khi run vẫn chạy trong content script; trả về `pending` sẽ để máy khác cùng BM chạy lại job đó — trái D9 (không tự chạy tiếp). Người vận hành kiểm audit tại profile rồi tạo job mới nếu cần.

Quy tắc chung: chủ reclaim là **janitor** — ops CLI (lệnh `janitor` chạy tay) ở pha 1; từ pha 2 là bước reclaim trong vòng lặp của CLI coordinator (D14, Q6); máy anh tắt thì không reclaim, job chờ tới lần chạy sau. Rules cho coordinator **đúng hai** chuyển trạng thái này, kèm điều kiện heartbeat/TTL kiểm ngay trong rules (§8.2). SW của các machine khác **không tự reclaim** để tránh đua nhiều bên ghi.

### 5.5. Tìm và chuẩn bị tab BM (đối chiếu code hiện có)

Panel luôn có sẵn `tabId` (`tabs.query({ active, currentWindow })`, `useConnection.ts`); SW thì không. Manifest Chrome hiện **không** có `tabs` lẫn `host_permissions`, nên bộ lọc `url` của `tabs.query` bị bỏ qua và `tab.url` không đọc được. Dispatcher vì vậy làm như sau, **không thêm quyền** nào:

1. **Tìm tab:** `tabs.query({})` lấy danh sách tab, gửi `location.read` tới từng tab (tab không có content script thì lỗi và bị bỏ qua), giữ tab có `businessId` khớp `machine.businessId`. Nhiều tab khớp → ưu tiên tab không có run đang chạy (`run.sync`), rồi tab `active` của cửa sổ.
2. **Không có tab nào khớp** (vd. vừa khởi động lại Chrome) → `tabs.create({ url: surfaceUrl(surface, machine.businessId), active: true })` rồi đợi content script trả lời đúng trang/BM như vòng thăm dò của `ensureSurface`. `active: true` là bắt buộc: tab nền là `hidden` nên runner sẽ `paused` vô hạn (§8.1). Tab BM đang ở màn đăng nhập → `ensureSurface` không tới được trang có `business_id`; xử lý theo §5.2 (a): máy `blocked` (`logged-out`), job `pending` lại, không retry nóng. (`ERR_LOGGED_OUT` của engine chỉ xuất hiện khi bị đăng xuất **giữa run**, §5.2 (c).)
3. **Tab đang ở BM khác hoặc trang không có `business_id`:** hiện `ensureSurface` điều hướng giữ **BM hiện tại của tab** (`before.businessId`), nên start sẽ bị `ERR_BM_CHANGED`/`ERR_NO_BUSINESS` (`controller.ts`). Sửa `ensureSurface` nhận thêm `businessId` ưu tiên (tham số tuỳ chọn, panel không truyền thì giữ hành vi cũ); dispatcher luôn truyền `machine.businessId`. Đây là đổi mã dùng chung với panel, **không** đổi engine.
4. **Job `requests.scan` đi đường khác `run.start`:** `RequestsRead` không qua `controller` (không kiểm `ERR_BUSY`, không tự điều hướng) mà đọc DOM của tab hiện tại. Dispatcher phải `ensureSurface` tới trang Requests trước khi gửi, và **không** gửi khi tab đang có run (`run.sync` active → `ERR_BUSY`, un-claim như §5.2). Kết quả scan rỗng chỉ được coi là "không có request" khi tab đã xác nhận đang ở đúng trang Requests; nếu không đọc được thì job `error`, không ghi `requests: []`.
5. **Sau khi run kết thúc:** dispatcher ghi `result` lên RTDB rồi gửi `run.clear` để content script bỏ `finished`, tránh panel của profile hiển thị run cũ. `lastRun` trong `storage.local` vẫn giữ theo luật hiện hành của engine.
6. **Lắng nghe `run.state`:** `background/index.ts` hiện chỉ có listener cho Graph broker với điều kiện lọc chặt. Listener cho `run.state` của dispatcher là **listener riêng**, chỉ nhận `sender.id === runtime.id` và `isRunEvent`; không nới điều kiện của broker. `runtime.sendMessage` từ content script **đánh thức** SW đang ngủ, với điều kiện listener được đăng ký **đồng bộ ở top-level** của module SW — trước mọi `await` khởi tạo Firebase/Auth; đăng ký sau `await` thì event đánh thức SW bị bỏ lỡ. Handler ghi `progressAt`/`runStatus` sau khi relay sẵn sàng (đợi một promise khởi tạo dùng chung). `run.sync` theo alarm vẫn là nguồn sự thật cho trạng thái cuối (§5.1 bước 0, §6.3), vì event có thể đến khi relay chưa kết nối xong.

Mã sửa ở `ensureSurface.ts`/`useRunEngine.ts` giữ tương thích ngược để panel chạy tay không đổi hành vi.

## 6. Kết nối Firebase từ extension

### 6.1. Phương thức kết nối (chọn 1, Q1)

| Hướng                                                                                  | Tải                                                                                                                        | Hiện                | Ưu                                                                         | Nhược                                                                                                                  |
| :------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------- | :------------------ | :------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------- |
| **A. `firebase` + `firebase-database` (Web SDK, WebSocket)**                           | ~120 KB cho riêng `firebase-database`; **cộng `firebase-auth` (phải đo lại tổng bundle SW, ước tính 200–300 KB minified)** | cần thêm dependency | `onDisconnect`, offline cache, reconnect/backoff chuẩn của SDK, listen gọn | dependency đầu tiên ngoài UI (không cần nới CSP/quyền host, §6.4)                                                      |
| **B. RTDB REST + streaming (`fetch` + `ReadableStream`, `Accept: text/event-stream`)** | 0 KB                                                                                                                       | thuần platform      | không dependency; `chrome.alarms` vốn đã có mặt trong plan                 | `EventSource` **không có trong SW** → phải tự parse SSE bằng stream; tự làm reconnect/backoff; không có `onDisconnect` |

**Đề xuất A, đã chốt** (D4 kèm Q1): SDK xử lý sẵn reconnect, token refresh và transaction (claim, D5) — viết lại dễ sai trong môi trường SW bị giết liên tục. Presence vẫn chỉ bằng heartbeat, không dùng `onDisconnect` (§4.3).

### 6.2. Xác thực

- Mỗi profile đăng nhập một tài khoản **Firebase Auth email/password** thuộc tổ chức (user nhập ở Options › Remote; session giữ trong `indexedDB` — không lưu mật khẩu). **Bắt buộc** khởi tạo bằng `initializeAuth(app, { persistence: indexedDBLocalPersistence })`; `getAuth()` mặc định dùng `localStorage`, không tồn tại trong SW. Chỉ dùng luồng email/password (không popup/redirect/reCAPTCHA) để không kéo script từ xa, vốn bị MV3 cấm.
- Không dùng anonymous auth: Database Rules cần `auth.uid` ổn định để map `uid → machineId` (§8.2).

### 6.3. Sống còn của service worker (MV3)

Chrome giết SW sau ~30 s không hoạt động (`research/09` §kỹ thuật). Kế hoạch hai lớp:

1. **Cơ chế chính — `chrome.alarms`** (quyền **`alarms`**), alarm `firebase-heartbeat` chu kỳ 1 phút (sàn Chrome ≥ 120 là 30 s): đánh thức SW → nếu socket rớt thì reconnect, chạy reconcile (§5.1 bước 0), ghi `lastHeartbeatAt`. Alarm cũng là điểm khởi động lại relay sau khi SW bị giết giữa chừng.
2. Phụ: WebSocket RTDB gia hạn tuổi thọ SW chỉ khi có message trong cửa sổ ~30 s, mà keep-alive của RTDB thưa hơn mức đó → **không được dựa vào socket để giữ SW sống**; SW có thể bị giết giữa hai heartbeat và đó là hành vi bình thường (vì vậy không có `online`/`onDisconnect`, §4.3).

- Khi SW chết **giữa run**: run vẫn tiếp tục trong content script (state của run ở content, D4 của SPEC-ENG-001); SW sống lại đọc `currentJobId` → `run.sync` → nối lại reporting; tab BM reload giữa run thì run mất như hiện nay → job `error` (`ERR_TAB_RELOADED`), không tự chạy lại (D9).
- Firefox: ngoài phạm vi automation (Q7); cơ chế alarms/WebSocket trên event page Firefox chỉ kiểm chứng khi bản Firefox vào scope.

### 6.4. Manifest & CSP

- **Chỉ nhánh Chrome** trong `vite.config.ts` (Q7: Firefox ngoài phạm vi): thêm permission **`alarms`** — và chỉ thế. `firebaseRelay` phải bị loại khỏi bundle Firefox (entry/flag build riêng) để `pnpm build:firefox` không kéo SDK. **Không** đụng `<all_urls>`, không thêm `tabs`/`scripting`.
- **Không thêm `host_permissions` cho Firebase.** Endpoint RTDB (`*.firebasedatabase.app`, gồm WebSocket) và Auth (`identitytoolkit.googleapis.com`, `securetoken.googleapis.com`) đều trả CORS cho mọi origin, và WebSocket không bị chặn bởi host permission; thêm quyền host chỉ sinh cảnh báo khi cài và có thể bắt user duyệt lại khi cập nhật, trái quy tắc quyền tối thiểu. **Giả định — kiểm ở spike pha 0** (§9): nếu SW bị chặn thật, mới thêm đúng host của instance (`https://tnm---hpma-default-rtdb.asia-southeast1.firebasedatabase.app/*`), không dùng wildcard.
- **Không khai `content_security_policy`.** Manifest hiện không có CSP tuỳ biến, và CSP mặc định của MV3 (`script-src 'self'; object-src 'self'`) không giới hạn `connect-src`, nên kết nối tới Firebase không cần nới gì. Tự khai CSP chỉ có nguy cơ siết nhầm.
- Pha 1 chỉ dùng **badge** (`action.setBadgeText`, không cần quyền). Nếu muốn notification mới thêm `notifications` — là quyết định riêng, qua reviewer.
- Thêm `alarms` vẫn là **thay đổi quyền** → qua `extension-security-reviewer` và cập nhật CLAUDE.md/permission notes như mọi lần nới quyền trước (tiền lệ SPEC-ENG-001 §10).

## 7. Job payload theo flow

### 7.1. `partner-assign`

```jsonc
{
  "flow": "partner-assign",
  "mode": "dry", // pha 2; assist/full ở pha 3 theo Q4
  "businessId": "987654321098765", // phải khớp machines/<id>.businessId
  "config": {
    "partnerBmId": "1234567890123456", // 15–17 chữ số (validateBmId)
    "queries": ["SHOP LAN 1", "1234567890"], // tên hoặc ID TKQC, ≤ 200 mục, ≤ 200 ký tự/mục
    "tasks": ["ADVERTISE", "ANALYZE"], // tập con PartnerTask, không rỗng
  },
}
```

Dispatcher map 1-1 thành `RunStartCommand`; engine kiểm lại toàn bộ (D3). Người tạo job chịu trách nhiệm chất lượng `queries` trùng khớp (khớp chính xác không đoán — SPEC-ENG-001 §5.2).

### 7.2. `partner-approve` — bắt buộc 2 pha (D6)

`ApproveConfig.requests` là "danh sách user đã xem" (`approve.ts:25`) — không thể sinh job duyệt trực tiếp từ dashboard mà không có bước quét. Quy trình:

1. **Job scan** (chỉ đọc):
   ```jsonc
   {
     "flow": "requests.scan",
     "mode": "dry",
     "businessId": "…",
     "config": { "partnerName": "BM ĐỐI TÁC" },
   }
   ```
   Chạy trên máy `partner-approve` của BM đó (bảng chấp nhận §5.1). Dispatcher gửi `RequestsRead` tới content script, ghi kết quả về `job.result.scan = { requests: ApproveRequest[] }` rồi `done` (PII: xem ngoại lệ ở §4.4, TTL 24 h).
2. **Con người review** bằng ops CLI (`ops approve <scanJobId>`, §7.4; dashboard ở pha 3): thấy danh sách, chọn action, tạo **job run** — **`scanJobId`, `approvedBy` và `approval: "human"` bắt buộc**:
   ```jsonc
   {
     "flow": "partner-approve",
     "mode": "dry", // hoặc assist/full ở pha 3
     "businessId": "…",
     "config": {
       "partnerName": "BM ĐỐI TÁC",
       "action": "approve",
       "requests": [
         /* chép y nguyên từ job.result.scan, ≤ 50 mục */
       ],
     },
     "scanJobId": "<jobId bước 1>",
     "approvedBy": "<uid ops đã xem danh sách>",
     "approval": "human",
   }
   ```
3. Machine nhận job run → dispatch như thường. `parseApproveConfig` vẫn là guard cuối.

**Cưỡng chế bằng Rules (không chỉ quy ước):** job `partner-approve` chỉ được tạo khi `scanJobId` trỏ tới job cùng `businessId`, `flow == 'requests.scan'`, `status == 'done'`; `approvedBy` phải bằng `auth.uid` của người tạo. Khuyến nghị vận hành (rules không đếm được số tài khoản ops nên không cưỡng chế): người duyệt khác người tạo job scan khi có từ hai ops trở lên.

**Giới hạn của cưỡng chế, nói thẳng:** Rules bảo đảm _có_ một scan `done` cùng BM, **không** bảo đảm `config.requests` được chép từ đúng scan đó (Rules không so được hai danh sách). Một ops cố ý vẫn ghi được `requests` tuỳ ý kèm một `scanJobId` hợp lệ. Lớp bảo vệ còn lại: ops CLI chỉ cho chọn **tập con** của `result.scan.requests` (không có ô nhập tay), và engine chỉ duyệt request đang có thật trong Needs review khớp `partnerName` (SPEC-ENG-002).

Ops CLI (pha 1–2) và dashboard (pha 3) **bắt buộc** hiển thị rõ danh sách trước khi cho tạo job run — tương đương màn "Xem trước" của panel; đây là HITL được chuyển chỗ, không bị xoá. Đường này (`approval: "human"`) là **mặc định**; đường tự động duy nhất là chuỗi auto-match ở §7.3.

### 7.3. Chuỗi `assign → approve` tự động (D12, D13)

**Tình huống (mô hình SPEC-ENG-002):** BM X bật yêu cầu admin thứ hai duyệt. Profile của **admin 1** (máy `partner-assign`, BM X) gán TKQC của X cho BM đối tác P; Meta không áp quyền ngay mà sinh request "‹admin 1› requests to give **P** access to the ‹TKQC› ad account" ở **Settings › Requests › Needs review của chính BM X**, và run assign dừng ở `pending-approval` (`partnerAssign.ts:795–797`). Profile của **admin 2** (máy `partner-approve`, **cùng BM X**) duyệt. Hai profile cùng BM, khác flow, không biết nhau (D2); chuỗi do **coordinator** nối lại và **không bao giờ rời nhánh `ext/jobs/<X>`**.

> **Giả định cần xác nhận ở pha 0 (§9):** request nằm ở Needs review của BM sở hữu TKQC (X), không phải của BM đối tác P. Suy ra từ `partnerAssign.ts` (dấu hiệu "cần duyệt" hiện ngay sau bước gán, ở phía X) và SPEC-ENG-002 (`partnerName` = tên BM được cấp quyền). Nếu DOM thật cho thấy ngược lại, §7.3 phải viết lại phần nhánh BM trước khi code.

```
Ops tạo job assign (có chain.auto) ─▶ nhánh BM X ─▶ [admin 1] chạy ─▶ run dừng ở pending-approval
                                                     state=done, result.runStatus='pending-approval',
                                                     result.awaitingApproval = E
                                                                    │ coordinator thấy
                                       ┌────────────────────────────┘
                                       ▼  chains/<assignJobId> được tạo (transaction, idempotent)
                     (chờ scanDelaysSec[n]) tạo job requests.scan ở CÙNG nhánh BM X
                                       ▼
                       [admin 2] quét ─▶ result.scan.requests = R
                                       ▼  coordinator đối chiếu R với E ──▶ M (tập khớp)
                          M rỗng ─▶ chờ lần scan kế (hết lượt: error)
                          M đủ (|M| = |E|) hoặc hết lượt ─▶ tạo job partner-approve (requests = M)
                                       ▼
                       [admin 2] approve ─▶ done ─▶ chains/<id> = done | partial
```

#### a. Khai chuỗi — ops đặt trên job assign (bất biến sau khi tạo)

```jsonc
{
  "flow": "partner-assign",
  "mode": "assist", // chuỗi chỉ có nghĩa khi assign ghi thật (pha 3); dry không bao giờ sinh pending-approval
  "businessId": "<BM X>",
  "config": { "partnerBmId": "…", "queries": ["…"], "tasks": ["ADVERTISE"] },
  "chain": {
    "auto": true, // opt-in tường minh theo từng job; vắng = không chuỗi
    "partnerName": "TÊN BM P", // tên BM đối tác như hiện trong request; dùng làm RequestsRead/ApproveConfig.partnerName
    "requesterName": "Tên admin 1", // tuỳ chọn, khuyến nghị: tên người yêu cầu như hiện trong request; có thì lọc thêm theo `requester`
    "mode": "dry", // mode của scan + approve; rules giới hạn theo pha (D8)
    "scanDelaysSec": [120, 300, 600], // độ trễ trước lần scan thứ 1, 2, 3 (tham số, đo thực địa — Q10)
    "ttlSec": 86400,
  },
}
```

Chỉ ops được khai `chain`. Không có trường BM đích: scan/approve của chuỗi luôn nằm ở đúng nhánh BM của job assign, nên coordinator **không** thể kéo chuỗi sang BM khác (rules kiểm, §8.2). Nhánh X phải có một máy `partner-approve` (profile admin 2).

#### b. Điều kiện kích hoạt

Coordinator chỉ khởi chuỗi khi job assign `state.status == 'done'` **và** `result.runStatus == 'pending-approval'` **và** `chain.auto == true` **và** `result.awaitingApproval` (E) không rỗng **và** `counts.unverified == 0`. Bảng đầy đủ — xét **từ trên xuống, dòng đầu tiên khớp thắng**:

| Job assign kết thúc                                                            | Chuỗi                                                                      |
| :----------------------------------------------------------------------------- | :------------------------------------------------------------------------- |
| Bất kỳ, `counts.unverified > 0`                                                | `held` + cờ cảnh báo (có thể đã ghi mà không đọc lại được; để người quyết) |
| `error` / `cancelled`, E rỗng                                                  | `skipped` — không có gì để duyệt                                           |
| `error` / `cancelled`, E không rỗng                                            | `held` — cần người xem; coordinator không tự duyệt phần dang dở            |
| `done`, `result.runStatus == 'done'` (BM không yêu cầu duyệt, hoặc mode `dry`) | `skipped`                                                                  |
| `done`, `result.runStatus == 'pending-approval'`, E không rỗng                 | **khởi chuỗi**                                                             |

`counts.queued > 0` (run dừng sớm vì `pending-approval`, các TKQC sau chưa chạy) **không** chặn chuỗi: E vẫn được duyệt, còn phần chưa chạy ghi vào `chains/<id>.remaining` để ops tạo job assign mới — coordinator không tự tạo assign (D13).

#### c. Thuật toán đối chiếu (coordinator, mã tin cậy)

- **E** = `result.awaitingApproval` (outcome `pending-approval`). **R** = `result.scan.requests` của scan gần nhất (đã được content script lọc theo `chain.partnerName`).
- **Chuẩn hoá** bằng đúng hàm engine dùng khi so request: `matchKey` (`src/content/engine/text.ts:15`, cùng hàm `requestList.ts:109,113` dùng) — không viết bộ chuẩn hoá thứ hai. `text.ts` là module thuần không phụ thuộc DOM/`browser`, coordinator import trực tiếp theo đường dẫn tương đối và có test khoá hành vi chung.
- **Đối chiếu nguồn gốc của E** (E do máy ghi vào `state`, không bất biến): mỗi phần tử E phải khớp một mục `config.queries` bất biến — theo `accountId` khi query là ID, hoặc `matchKey(name) == matchKey(query)` khi query là tên. Có phần tử lạ → chuỗi `error` `ERR_CHAIN_PROVENANCE`, không tạo job nào.
- Một request `r ∈ R` là **ứng viên** của tên `k` khi `matchKey(r.account) == k` (và `matchKey(r.requester) == matchKey(chain.requesterName)` nếu có khai `requesterName`).
- **Quy tắc đa tập, một luật duy nhất:** gọi `cE(k)` = số phần tử E tên `k`, `cR(k)` = số ứng viên tên `k` trong R.
  - `cR(k) ≤ cE(k)` → mọi ứng viên tên `k` vào **M** (hai TKQC cùng tên đã gán thì duyệt đủ hai, không hơn).
  - `cR(k) > cE(k)` → **mơ hồ**: không phân biệt được request nào thuộc TKQC vừa gán (request chỉ có tên hiển thị, không có ID — Q10), nên **không** ứng viên nào tên `k` vào M; ghi `chains/<id>.ambiguous += cR(k)`, để người xử lý.
- Khớp **chính xác** sau chuẩn hoá, không đoán, không so gần đúng (SPEC-ENG-001 §5.2). `|M| ≤ |E|` luôn đúng theo cách xây dựng. Request còn lại (`R \ M`) **không bao giờ bị chạm tới**; chỉ ghi `chains/<id>.unmatched`. Có `unmatched > 0` không phải lỗi — có thể là request hợp lệ khác cho cùng P; ops thấy trên ops CLI/dashboard.

#### d. Lịch scan, duyệt và kết thúc

1. Scan lần _n_ tạo ở nhánh BM X sau `scanDelaysSec[n-1]` (Meta có thể chưa hiển thị request ngay), `config = { partnerName: chain.partnerName }`. Khoá job xác định: `chain-<assignJobId>-scan-<n>`.
2. Sau mỗi scan: nếu `|M| == |E|` → tạo job approve ngay; nếu `0 < |M| < |E|` và còn lượt → chờ lượt sau để gom thêm; hết lượt thì duyệt `M` hiện có (chuỗi → `partial`, phần thiếu để người xử lý); nếu `|M| == 0` và hết lượt → `error` `ERR_CHAIN_NO_MATCH`.
3. Job approve: khoá `chain-<assignJobId>-approve`, `flow: "partner-approve"`, `approval: "auto-match"`, `config = { partnerName: chain.partnerName, action: "approve", requests: M }` — **`action` luôn `approve`, không bao giờ `decline`** (decline không đảo ngược; rules cưỡng chế, §8.2). `scanJobId` = scan đã dùng để đối chiếu, `approvedBy` = uid coordinator, kèm `chain: { assignJobId }`.
4. Khi job approve `done` → `chains/<id>.status = done` (hoặc `partial` như trên). `error` → chuỗi `error`, **không retry tự động** (engine đã khoá/checkpoint thì giữ nguyên theo D7).
5. Quá `ttlSec` kể từ `finishedAt` của job assign mà chuỗi chưa kết thúc → `error` `ERR_CHAIN_TTL`, và coordinator đặt `cancelRequested` cho job scan/approve còn `pending` của chính chuỗi đó.

Khoá job xác định + rules `!data.exists()` làm cho coordinator **idempotent**: trigger chạy hai lần không sinh hai job approve.

#### e. Ràng buộc an toàn (không nới D7)

- Job approve đi qua đúng engine: `parseApproveConfig`, so khớp `partnerName` với danh sách Needs review sống, emergency lock, curfew, write budget, pacing, checkpoint/CAPTCHA — như lệnh bấm tay. Engine không duyệt gì ngoài `requests` đã nêu.
- `mode` của chuỗi bị chặn bởi D8/`FULL_LOCKED` như mọi job. **Ở `dry`** chuỗi chạy tới bước không ghi; **ở `assist`** engine dừng chờ `run.assistDone` (cần người, §8.1); chuỗi chỉ thực sự "tự động" khi `partner-approve` được phép `full` (Q4).
- **Trần/ngày:** `maxAutoApprovePerDay` theo BM (đề xuất trùng trần `partner-approve` của Q4); vượt trần → chuỗi `held`, chờ người. Coordinator đếm bằng các chuỗi `done|partial` trong 24 giờ của BM đó.
- **Kill-switch:** coordinator kiểm `killSwitch/global` và `killSwitch/<BM X>` trước mỗi lần tạo job; đang bật → chuỗi `held`, không tạo thêm (rules claim cũng chặn máy, §8.2).
- **Quyền hẹp của coordinator (rules, §8.2):** không tạo được job `partner-assign`; chỉ tạo `requests.scan`/`partner-approve` ở **cùng nhánh** với job assign mà `chain.assignJobId` trỏ tới, job đó phải `done` với `result.runStatus == 'pending-approval'` và do ops khai `chain.auto`; `config.partnerName` phải bằng `chain.partnerName`; chỉ `action: approve`; chỉ `mode` đúng bằng `chain.mode`.

#### f. Ranh giới tin cậy (nói thẳng)

Rules **không** kiểm được "M là tập con của E" (không có phép so tập trong Rules). Phần đó nằm ở mã coordinator, nên coordinator là thành phần tin cậy: lộ credential của nó cho phép tạo job approve với `requests` tuỳ ý **trong phạm vi**: nhánh BM của job assign, `partnerName` do ops khai, `action: approve`, mode cho phép, khi chuỗi tương ứng còn hợp lệ. Đầu vào E cũng không hoàn toàn tin được: máy giữ job assign ghi được `state` tuỳ ý (rule (b), §8.2), nên một profile admin 1 bị chiếm có thể khai E khống — vì vậy coordinator đối chiếu E với `config.queries` bất biến (§7.3.c). Giảm thiểu: (1) engine vẫn chỉ duyệt request đang có thật trong Needs review khớp `partnerName`; (2) coordinator chạy bằng danh tính có claim `coordinator` — nếu dùng Admin SDK phải khởi tạo với `databaseAuthVariableOverride` mang đúng claim đó, vì Admin SDK mặc định **bỏ qua Rules** (khi đó mọi ràng buộc ở §8.2 vô hiệu); (3) khoá bí mật nằm ở secret manager của nền tảng chạy, không trong repo/extension; (4) mọi hành động ghi `chains/<id>` và `createdBy = "coordinator"` (uid của `databaseAuthVariableOverride`) để audit.

#### g. Cách chạy coordinator — **module độc lập, CLI ở pha 2 (đã chốt, D14 / Q9)**

Coordinator là package Node riêng `coordinator/` ở gốc repo, **không thuộc bản build extension** (không đụng `pnpm build`/`build:firefox`, không vào pnpm workspace của extension). Logic nằm trong hai hàm thuần, không phụ thuộc nơi chạy:

| Hàm                | Pha | Việc                                                                                                                                                                   |
| :----------------- | :-- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tick` — janitor   | 2   | Reclaim job mồ côi (§5.4); dọn `result.scan`/`result.awaitingApproval` quá 24 giờ (§4.4); xoá job trạng thái cuối quá 30 ngày (§4.4)                                   |
| `onAssignFinished` | 3   | Với job assign có `chain.auto` đã kết thúc chưa có `chains/<assignJobId>`: tạo bản ghi bằng transaction (idempotent), xác định `skipped`/`held`/khởi chuỗi theo §7.3.b |
| `tick` — chuỗi     | 3   | Xử lý `chains` có `nextActionAt` đến hạn: tạo scan lần _n_, đối chiếu khi scan `done`, tạo job approve, chốt `done`/`partial`/`error`, kiểm TTL và trần/ngày           |

**Nơi chạy:**

- **Pha 2: CLI trên máy anh** (`coordinator watch`): vòng lặp 60 giây chạy phần janitor. **Liệt kê BM:** Rules chỉ cấp quyền đọc ở `ext/jobs/$businessId`, không ở `ext/jobs`, nên coordinator không đọc được cả cây; nó lấy tập `businessId` phân biệt từ `ext/machines` rồi query từng nhánh (`orderByChild('state/status')`, `.indexOn` §8.2). Không cần gói Blaze. Có lệnh `coordinator once` để chạy một vòng bằng tay. Máy anh tắt thì reclaim và dọn PII tạm dừng; dữ liệu không mất vì mọi trạng thái nằm trong RTDB.
- **Pha 3:** bật thêm phần chuỗi trong cùng vòng lặp (mỗi vòng: tìm assign `chain.auto` đã kết thúc chưa có `chains` → `onAssignFinished`, rồi `tick`). Tuỳ chọn, khi cần chạy không có người: bọc cùng các hàm bằng Cloud Functions 2nd gen (`onValueUpdated` cho `onAssignFinished`, lịch 1 phút cho `tick`; cần Blaze + cảnh báo ngân sách, `maxInstances` 1–3, deploy với `codebase` riêng trong `firebase.json` để không xoá function của hệ thống khác dùng chung project). Chuyển nơi chạy không được đổi logic hay schema.

Ràng buộc triển khai:

- **Danh tính hẹp (bắt buộc):** Admin SDK khởi tạo với `databaseAuthVariableOverride: { uid: 'coordinator', token: { coordinator: true } }` để Database Rules vẫn áp dụng (§7.3.f). Không dùng Admin SDK trần cho bất kỳ thao tác ghi nào.
- **Không mở cổng mới (D1):** không có HTTP endpoint; mọi đầu vào của coordinator là dữ liệu trong RTDB do ops/máy ghi qua Rules.
- **Credential:** CLI dùng service account riêng, quyền tối thiểu (chỉ RTDB của project). Khoá JSON nằm ngoài repo (biến môi trường hoặc Keychain), quyền file 600, không commit; xoay khoá định kỳ. Khoá này là điểm nhạy cảm nhất của chuỗi (§7.3.f): giới hạn "hẹp" của claim chỉ nằm trong code (`databaseAuthVariableOverride`), không nằm trong khoá. **Ai lấy được file khoá bỏ tham số đó là bỏ qua toàn bộ Rules, đọc/ghi được cả instance** (kể cả `user`, `wallets`, `realtime` của hệ thống khác); IAM không giới hạn được theo nhánh dữ liệu. **Rủi ro đã được anh chấp nhận** (dự án nội bộ, instance dùng chung); cách giảm triệt để là tách `ext` sang **project Firebase riêng ở gói Spark** (miễn phí, có sẵn một RTDB mặc định — chỉ instance RTDB thứ hai trong _cùng_ project mới cần Blaze). Đề xuất xem lại ở Q3 trước pha 2. Ở pha 3 Functions dùng danh tính runtime nên không còn khoá tải về.
- **Idempotent và chịu chạy lại:** chạy trùng hoặc hai CLI đồng thời không sinh job thừa; mọi `create` dùng khoá xác định (§7.3.d) nên lần hai bị rules từ chối `!data.exists()` và coordinator coi đó là "đã làm".
- **Thư mục & kiểm thử:** `coordinator/` với bộ test riêng; test bằng Firebase Emulator Suite (RTDB) cùng bộ rules test ở §10. Không cần emulator Functions ở pha 2.

### 7.4. Ops CLI — đường tạo job chịu Rules (D15)

Firebase console bỏ qua Security Rules, nên mọi thao tác ghi job của người vận hành đi qua một CLI nhỏ trong cùng package `coordinator/` (lệnh `ops …`), dùng **client SDK** (`firebase/database` + `firebase/auth`) và đăng nhập email/password bằng tài khoản có claim `ops` — không dùng service account, nên mọi ràng buộc ở §8.2 áp dụng như với dashboard.

| Lệnh                                    | Việc                                                                                                                                                                                             |
| :-------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ops assign <bm> --file job.json`       | Tạo job `partner-assign` (kể cả `chain` ở pha 3); `createdAt = ServerValue.TIMESTAMP`, `createdBy = auth.uid`                                                                                    |
| `ops scan <bm> --partner "<tên BM>"`    | Tạo job `requests.scan`                                                                                                                                                                          |
| `ops approve <scanJobId>`               | Đọc `result.scan.requests`, in danh sách, cho chọn **tập con** + action (không có ô nhập request tay), hỏi xác nhận rồi tạo job `partner-approve` (`approval: "human"`, `approvedBy = auth.uid`) |
| `ops cancel <bm> <jobId>`               | Đặt `cancelRequested = true`                                                                                                                                                                     |
| `ops kill [<bm>]` / `ops unkill [<bm>]` | Bật/gỡ kill-switch                                                                                                                                                                               |
| `ops status`                            | Máy online/offline theo heartbeat, máy `blocked` và lý do, job đang chạy                                                                                                                         |
| `ops janitor`                           | Pha 1: chạy janitor một lần bằng tay bằng quyền ops (trước khi có `coordinator watch`)                                                                                                           |

Pha 3 dashboard thay dần CLI nhưng giữ cùng hợp đồng dữ liệu.

## 8. An toàn & bảo mật

### 8.1. Các cổng giữ nguyên từ engine (D7); hai thay đổi cần duyệt riêng

| Cổng hiện hữu                                                                         | Trạng thái với automation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| :------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emergencyStop`, `rateLimitedUntil` (chặn start; user gỡ tay ở Options)               | **Giữ nguyên, và chặt hơn bấm tay:** engine bỏ qua hai khoá này ở `dry`, nhưng dispatcher kiểm chúng trước **mọi** claim, kể cả `dry`/`requests.scan` (D7, §5.1 bước 2). Rate-limit có hạn thì xếp chờ (§5.2); emergency không có hạn, checkpoint/CAPTCHA vẫn khoá khẩn cấp và không tự xoá.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Curfew, `writeBudget` ngày                                                            | **Giữ nguyên** — chính là lý do các máy chạy giờ và số lượng có hạn là acceptable. Nguồn tạo job nên tôn trọng `research/19` về trần/ngày.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Pacing sàn (`parsePacing`)                                                            | **Giữ nguyên**, không có flag nào trong job hạ pacing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Visibility gate** (`src/content/engine/runner.ts:195,203`; run `paused` khi tab ẩn) | **Cần sửa có chủ đích (Q2), và đây là sửa engine + command:** mô hình nhiều profile = nhiều cửa sổ Chrome, tab BM của mỗi profile thường không `visible` — kể cả tab active, không minimized, nếu cửa sổ bị cửa sổ khác che (Chrome tính native window occlusion → `hidden`). Content script không biết trạng thái cửa sổ, nên đề xuất: SW hỏi `windows.get` (tab active, không minimized) rồi đánh dấu nguồn SW + trạng thái cửa sổ ở `RunStartCommand` (ngoại lệ D3 đã nêu); runner chỉ nới gate khi cờ này có mặt. Còn phải đo thực địa timer throttling ở tab hidden (pacing có thể lệch). Là đổi hành vi an toàn → qua reviewer + test thực địa trước pha 3; cho tới lúc đó vận hành bằng cách giữ tab visible (mỗi profile một màn hình/không chồng cửa sổ). |
| **Assist = engine không bấm nút cuối, chờ `run.assistDone`**                          | Ở pha 3, `assist` từ xa cần định nghĩa ai bấm: đề xuất SW tự gửi `run.assistDone` **chỉ khi** dashboard có lệnh xác nhận tường minh của người (thêm bước confirm trên dashboard), thay vì tự động.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `FULL_LOCKED` / write gate probe ≥ 95% (PRD §8)                                       | **Giữ khóa** trong pha 1–2. `FULL_LOCKED` chỉ chặn ở panel; engine nhận `full` cho `partner-approve` (`messaging.ts:121–124`, `controller.ts:77`), nên với job từ xa khoá nằm ở `REMOTE_ALLOWED_MODES` của dispatcher **và** Rules (D8). Mở cho `partner-approve` ở pha 3 chỉ khi: (a) probe gate data đủ tin cậy trên chính BM mục tiêu, (b) anh duyệt chính sách full không giám sát (Q4).                                                                                                                                                                                                                                                                                                                                                                       |

### 8.2. Firebase Database Rules (phác thảo)

Danh tính dựa trên **custom claims** do ops gán qua Admin SDK (không có bảng ánh xạ trong DB để máy tự sửa): `ops: true` (người vận hành), `machineId`, `bm` và `flow` (máy: ID máy + BM duy nhất nó được đụng tới + flow duy nhất nó được claim; `flow` ∈ `partner-assign` | `partner-approve`, máy `partner-approve` được claim thêm job `requests.scan` theo bảng §5.1), `coordinator: true` (tài khoản dịch vụ của coordinator, §7.3; **không** kiêm `ops`). Máy không tự khai được `bm` nên không thể đọc nhánh BM khác.

```jsonc
{
  "rules": {
    "ext": {
      // Không dùng `auth != null`: Auth pool dùng chung với hệ thống khác (§9 pha 0), mọi user
      // của hệ thống đó đều "đã đăng nhập". Mọi quyền đọc đều gắn với một claim của ext.
      "machines": {
        // ops giám sát; coordinator cần heartbeat (reclaim) và tập businessId (liệt kê nhánh, §7.3.g)
        ".read": "auth.token.ops === true || auth.token.coordinator === true",
        "$machineId": {
          // Máy chỉ đọc/ghi record của chính mình và chỉ khai đúng BM + flow được cấp trong claim
          ".read": "auth.token.machineId === $machineId",
          ".write": "auth.token.machineId === $machineId",
          ".validate": "newData.child('businessId').val() === auth.token.bm && newData.child('flow').val() === auth.token.flow"
        }
      },
      "killSwitch": {
        ".read": "auth.token.ops === true || auth.token.coordinator === true || auth.token.machineId != null",
        ".write": "auth.token.ops === true"
      },
      "chains": {
        // Coordinator ghi tiến trình chuỗi; ops giám sát. Máy không đọc/ghi.
        ".read": "auth.token.ops === true || auth.token.coordinator === true",
        ".indexOn": ["nextActionAt"],
        "$assignJobId": { ".write": "auth.token.coordinator === true" }
      },
      "jobs": {
        "$businessId": {
          ".indexOn": ["state/status", "state/claimedBy"],
          // Máy chỉ đọc nhánh BM của mình; ops và coordinator đọc mọi nhánh (nhưng không đọc được
          // `ext/jobs` gốc — coordinator liệt kê nhánh qua `ext/machines`, §7.3.g)
          ".read": "auth.token.ops === true || auth.token.coordinator === true || auth.token.bm === $businessId",
          "$jobId": {
            // Tạo/xoá cả node: ops; coordinator được TẠO (không ghi đè: !data.exists()) và chỉ XOÁ
            // job trạng thái cuối quá 30 ngày (retention §4.4). Không clause nào khác ghi được các
            // trường bất biến (flow, mode, config…) → sau khi tạo, không máy nào sửa được config.
            ".write":
              "(auth.token.ops === true && (!data.exists() || !newData.exists())) " +
              "|| (auth.token.coordinator === true && !data.exists()) " +
              "|| (auth.token.coordinator === true && !newData.exists() " +
              "    && data.child('state/status').val().matches(/^(done|error|cancelled)$/) " +
              "    && data.child('state/finishedAt').val() < now - 2592000000)",
            // `data.exists() || …`: mọi điều kiện dưới đây chỉ áp khi TẠO node. Viết vậy để rule
            // đúng bất kể RTDB có chạy lại `.validate` của node cha khi ghi vào `state` hay không —
            // nếu có mà thiếu vế này thì `createdAt === now` làm hỏng mọi claim/update (kiểm ở pha 0).
            ".validate":
              "data.exists() || ( " +
              "newData.hasChildren(['flow','mode','businessId','config','createdAt','createdBy','state']) " +
              "&& newData.child('businessId').val() === $businessId " +
              "&& newData.child('createdAt').val() === now " +
              "&& newData.child('createdBy').val() === auth.uid " +
              "&& (newData.child('flow').val() === 'partner-assign' " +
              "    || newData.child('flow').val() === 'partner-approve' " +
              "    || newData.child('flow').val() === 'requests.scan') " +
              // D8: pha 1–2 chỉ 'dry'. Pha 3 sửa dòng này thành 'dry' || 'assist' (|| 'full' theo Q4)
              "&& newData.child('mode').val() === 'dry' " +
              "&& newData.child('state/status').val() === 'pending' " +
              "&& !newData.child('state/claimedBy').exists() " +
              // D6 (human): job duyệt do ops tạo, tham chiếu scan `done` cùng BM, approvedBy = người tạo
              "&& (newData.child('flow').val() !== 'partner-approve' || ( " +
              "      newData.child('approval').val() === 'human' && auth.token.ops === true " +
              "   && newData.child('approvedBy').val() === auth.uid " +
              "   && root.child('ext/jobs/' + $businessId + '/' + newData.child('scanJobId').val() + '/flow').val() === 'requests.scan' " +
              "   && root.child('ext/jobs/' + $businessId + '/' + newData.child('scanJobId').val() + '/state/status').val() === 'done') " +
              // D12 (auto-match): chỉ coordinator, chỉ approve, mode = chain.mode, scan done cùng BM,
              // và provenance (xem dưới). Phần "requests ⊆ E" KHÔNG kiểm được ở Rules → mã coordinator (§7.3.f)
              "   || ( newData.child('approval').val() === 'auto-match' && auth.token.coordinator === true " +
              "     && newData.child('approvedBy').val() === auth.uid " +
              "     && newData.child('config/action').val() === 'approve' " +
              "     && root.child('ext/jobs/' + $businessId + '/' + newData.child('scanJobId').val() + '/flow').val() === 'requests.scan' " +
              "     && root.child('ext/jobs/' + $businessId + '/' + newData.child('scanJobId').val() + '/state/status').val() === 'done')) " +
              // Coordinator không bao giờ tạo assign; scan/approve của nó phải mang provenance hợp lệ:
              // job assign CÙNG NHÁNH ($businessId — chuỗi không rời BM), `done` + dừng ở pending-approval,
              // do ops khai chain.auto, mode và partnerName khớp chain. Viết tắt trong phác thảo này:
              //   A ≡ root.child('ext/jobs/' + $businessId + '/' + newData.child('chain/assignJobId').val())
              "&& (auth.token.coordinator !== true || ( " +
              "      (newData.child('flow').val() === 'requests.scan' || newData.child('approval').val() === 'auto-match') " +
              "   && A.child('flow').val() === 'partner-assign' " +
              "   && A.child('state/status').val() === 'done' " +
              "   && A.child('state/result/runStatus').val() === 'pending-approval' " +
              "   && A.child('chain/auto').val() === true " +
              "   && A.child('chain/mode').val() === newData.child('mode').val() " +
              "   && A.child('chain/partnerName').val() === newData.child('config/partnerName').val())) " +
              // `chain` khai trên job assign: chỉ ops, chỉ flow partner-assign.
              // Pha 1–2 (chuỗi chưa bật): thay cả vế này bằng `!newData.child('chain/auto').exists()`.
              "&& (!newData.child('chain/auto').exists() || ( " +
              "      auth.token.ops === true && newData.child('flow').val() === 'partner-assign' " +
              "   && newData.child('chain/partnerName').isString() " +
              "   && newData.child('chain/partnerName').val().length > 0 " +
              "   && newData.child('chain/partnerName').val().length <= 100 " +
              "   && newData.child('chain/mode').val() === 'dry')) " +   // pha 3: nới theo D8
              ")",

            // ops huỷ job bất kỳ; coordinator chỉ huỷ job của chính chuỗi nó tạo (TTL, §7.3.d)
            "cancelRequested": {
              ".write": "auth.token.ops === true || (auth.token.coordinator === true && data.parent().child('chain/assignJobId').exists())",
              ".validate": "newData.isBoolean()"
            },

            "state": {
              ".write":
                // (a) CLAIM: pending → claimed, claimedBy phải là chính máy này, đúng BM của nó (D5),
                //     và kill-switch toàn cục/của BM đang tắt (§5.3) — chặn cả máy chạy bản cũ/lỗi.
                //     Flow: claim `flow` phải khớp `flow` của job (data.parent() = node job); riêng
                //     máy partner-approve được claim thêm requests.scan (bảng §5.1). Máy không thể
                //     tự nới vì `flow` nằm trong token do ops gán, không nằm trong DB
                "(auth.token.bm === $businessId && data.child('status').val() === 'pending' " +
                "  && (data.parent().child('flow').val() === auth.token.flow " +
                "      || (auth.token.flow === 'partner-approve' && data.parent().child('flow').val() === 'requests.scan')) " +
                "  && newData.child('status').val() === 'claimed' " +
                "  && newData.child('claimedBy').val() === auth.token.machineId " +
                "  && root.child('ext/killSwitch/global').val() !== true " +
                "  && root.child('ext/killSwitch/' + $businessId).val() !== true) " +
                // (b) Máy đang giữ job cập nhật tiếp (running/done/error/cancelled hoặc un-claim → pending).
                //     Rộng có chủ đích: máy ghi được cả `result` — coordinator không tin mù E (§7.3.c, f)
                "|| (auth.token.bm === $businessId && data.child('claimedBy').val() === auth.token.machineId) " +
                // (c) ops: cancel job pending, janitor chạy tay ở pha 1 (§7.4)
                "|| auth.token.ops === true " +
                // (d) coordinator reclaim (§5.4): heartbeat của máy giữ job cũ hơn 5 phút, VÀ
                //     claimed quá 15 phút → pending (xoá claimedBy); hoặc running không progress quá
                //     15 phút → error ERR_MACHINE_LOST. Không đường nào đưa `running` về `pending`.
                //     (SW ghi `progressAt` ngay cùng `startedAt`, nên running luôn có progressAt.)
                "|| (auth.token.coordinator === true " +
                "  && root.child('ext/machines/' + data.child('claimedBy').val() + '/lastHeartbeatAt').val() < now - 300000 " +
                "  && ( (data.child('status').val() === 'claimed' && data.child('claimedAt').val() < now - 900000 " +
                "        && newData.child('status').val() === 'pending' && !newData.child('claimedBy').exists()) " +
                "    || (data.child('status').val() === 'running' && data.child('progressAt').val() < now - 900000 " +
                "        && newData.child('status').val() === 'error' " +
                "        && newData.child('error/code').val() === 'ERR_MACHINE_LOST') ))",
              ".validate":
                "newData.child('status').val().matches(/^(pending|claimed|running|done|error|cancelled)$/)",
              // Janitor của coordinator chỉ được XOÁ dữ liệu PII này (TTL 24 giờ, §4.4), không ghi gì khác
              "result": {
                "scan": { ".write": "auth.token.coordinator === true && !newData.exists()" },
                "awaitingApproval": { ".write": "auth.token.coordinator === true && !newData.exists()" }
              }
            }
          }
        }
      }
    }
  }
}
```

Điểm cần kiểm bằng rules-unit-testing (§10):

- **Nền tảng (chạy đầu tiên, pha 0):** ghi vào `state` của một job đã tồn tại **không** bị `.validate` của `$jobId` chặn (xác nhận vế `data.exists() ||` hoạt động đúng, bất kể hành vi validate node cha); `update()` chỉ một trường heartbeat của `machines/<id>` vẫn qua `.validate`.
- **Máy:** máy A claim được job `pending` cùng BM; máy A **không** claim/đọc được job BM khác; máy `partner-assign` **không** claim được job `partner-approve`/`requests.scan` cùng BM, máy `partner-approve` claim được `requests.scan` nhưng không claim được `partner-assign`; máy ghi `machines/<id>.flow` ≠ claim `flow` bị `permission_denied`; token thiếu claim `flow` không claim được job nào; claim bị từ chối khi `killSwitch/global` hoặc `killSwitch/<bm>` bật; máy B không ghi được `state` của job A đang giữ; máy không sửa được `config`/`mode`; máy không tạo được job; máy chỉ đọc được record `machines/<id>` của chính mình.
- **Ops:** tạo job được; `mode: 'full'` bị từ chối ở pha < 3; `createdBy ≠ auth.uid` bị từ chối; job `partner-approve` thiếu `scanJobId`, thiếu `approval`, hoặc trỏ tới scan chưa `done` bị từ chối.
- **Coordinator (D13):** tạo được `requests.scan`/`partner-approve` khi provenance hợp lệ; **không** tạo được `partner-assign`; không tạo được khi `chain.assignJobId` trỏ sang nhánh khác (job không tồn tại ở nhánh hiện tại); không tạo được khi job assign chưa `done`, `runStatus ≠ 'pending-approval'` hoặc không có `chain.auto`; không tạo được `action: decline`, `mode` khác `chain.mode`, `partnerName` khác `chain.partnerName`; không ghi đè được job đã tồn tại (idempotent); reclaim `claimed → pending` chỉ được khi heartbeat cũ > 5 phút và `claimedAt` cũ > 15 phút; **không** đưa được `running → pending`; `running → error ERR_MACHINE_LOST` chỉ khi đủ điều kiện; chỉ xoá được job cuối quá 30 ngày; chỉ xoá (không ghi) được `result.scan`/`result.awaitingApproval`.
- **Người ngoài:** tài khoản đăng nhập của hệ thống dùng chung (không claim ext) không đọc được `machines`, `killSwitch`, `chains`, `jobs`.

Nguyên tắc: **RTDB là kênh điều khiển từ xa của extension thao tác BM thật** — ai ghi được `/ext/jobs` là ai bấm được nút trên BM. `ops` dùng custom claim qua Admin SDK; không public signup; audit ai tạo job bằng `createdBy` (= `auth.uid`, rules kiểm). Firebase console ghi bằng quyền admin và **bỏ qua toàn bộ khối Rules này** — vì vậy D15 cấm tạo/sửa job bằng console.

### 8.3. PII & audit

- Job đã mang `queries` (tên/ID TKQC) và `requests` (tên BM đối tác) — database RTDB vì thế **riêng tư theo tổ chức**, bật App Check khi có dashboard công khai hơn (Q5).
- `job.result` tuân thủ luật `logDetail` (§4.4); không bao giờ ghi cookie/token/session lên RTDB.

## 9. Lộ trình triển khai

**Pha 0 — chuẩn bị, không code (cổng vào pha 1).** Hiện trạng đã xác nhận: project `tnm---hpma` gói **Spark**; RTDB mặc định `tnm---hpma-default-rtdb` ở `asia-southeast1` (Q3), đang chứa dữ liệu hệ thống khác (`user`, `wallets`, `realtime`) và dữ liệu mẫu trong `ext` theo schema cũ (`isOnline`, `jobs/01`) — coi là dữ liệu thử, không giữ tương thích.

- **Rules dùng chung instance:** Rules là một file cho cả instance, `firebase deploy --only database` sẽ ghi đè và xoá Rules của `user`/`wallets`/`realtime`. Vì vậy §8.2 chỉ được **gộp tay vào nhánh `ext`** của Rules hiện có; không deploy file Rules riêng lên instance này. Nếu anh muốn tách hẳn, tạo instance RTDB thứ hai (bắt buộc Blaze) — quyết định lại trước pha 2.
- **Auth dùng chung user pool:** liệt kê claim hiện có và ai gán được chúng; các claim `ops`/`machineId`/`bm`/`flow`/`coordinator` không được trùng tên hay nới quyền hệ thống kia. Mọi user của hệ thống kia đều là `auth != null`, nên Rules `ext` không có quyền nào chỉ dựa trên "đã đăng nhập" (§8.2). Cấu hình Auth của extension (§6) trỏ vào project dùng chung này — trừ khi Q3 được chốt lại sang project riêng.
- **Kiểm tra entrypoint Auth cho MV3:** xác nhận `firebase/auth/web-extension` có tồn tại và từ phiên bản SDK nào (chưa xác nhận được); mục tiêu là không nạp remote script (gapi/reCAPTCHA) — vấn đề Chrome Web Store, thuộc phạm vi `extension-security-reviewer`.
- **Bốn giả định phải kiểm trước khi code** (mỗi cái có đường lui đã ghi):
  1. **Mô hình duyệt cùng BM (§7.3):** trên BM staging bật yêu cầu admin thứ hai duyệt, gán thật một TKQC, xác nhận request hiện ở Needs review của **BM sở hữu TKQC** và câu chữ khớp parser của SPEC-ENG-002. Sai → viết lại phần nhánh BM của §7.3 (chỉ ảnh hưởng pha 3).
  2. **`.validate` của node cha khi ghi node con (§8.2):** dựng emulator, chạy nhóm test "Nền tảng" của §8.2. Rules đã viết theo dạng `data.exists() || …` nên đúng ở cả hai hành vi; test để khoá lại điều đó.
  3. **Không cần `host_permissions` Firebase (§6.4):** build thử SW chỉ có `alarms`, kết nối RTDB + Auth email/password, ghi một heartbeat. Bị chặn → thêm đúng host của instance, qua `extension-security-reviewer`.
  4. **Transaction claim với cache lạnh (§4.2):** trên emulator, chạy transaction claim từ một client chưa từng đọc node `state`, xác nhận trả `null` lần đầu dẫn tới lần gọi lại với giá trị thật chứ không `permission_denied`. Sai → dùng đường lui `get()` trước transaction.
- **Tạo tài khoản** `ops`, máy (`machineId` + `bm` + `flow`), `coordinator` và gán claim; **chốt Q4 và N** (ngưỡng kill-switch); **thử thực địa Q2** (visibility gate).
- Chưa cần Blaze ở pha 0–2 nếu giữ nguyên instance mặc định (hoặc tách sang project Spark riêng, Q3) và coordinator chạy bằng CLI (D14); Blaze chỉ cần khi đưa coordinator lên Cloud Functions (pha 3) hoặc tạo instance thứ hai trong cùng project.

Pha 1 làm tuần tự: (1) hai spike `sender.url` của SW và thăm dò `location.read` (nếu hỏng, sửa §5.5 trước); (2) Auth + heartbeat; (3) listener chỉ đọc + badge + panel prefill; (4) ops CLI tối thiểu (`ops scan`, `ops assign`, `ops status`, `ops kill`) để tạo job thử qua Rules (D15); (5) manifest (`alarms`), rồi `extension-security-reviewer` + `cross-browser-checker`.

| Pha                                                       | Nội dung                                                                                                                                                                                                                                                                                                                                                                                                | Tiêu chí qua                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :-------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Dây thần kinh (không hành động)**                   | Auth + heartbeat + listen **chỉ đọc** (SW **không claim**, không đổi trạng thái job). Job `pending` mới → SW đặt **badge** trên icon extension và lưu job vào `storage.session`; người dùng tự bấm icon (`sidePanel.open()` cần user gesture nên SW không tự mở được panel), panel đọc job và prefill config, con người bấm Start như cũ. Dashboard/console xem được máy online/offline theo heartbeat. | 1 profile: kiểm tra thực tế `sender.url` của SW được content script chấp nhận (Chrome), SW tìm được tab BM bằng thăm dò `location.read`; badge đúng khi có job, panel prefill đúng, chạy tay thành công; heartbeat đúng ±10% và không phụ thuộc socket sống.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **2 — Tự chạy có giám sát (chỉ `dry` + `requests.scan`)** | Dispatcher đầy đủ (cổng trước claim, claim, tuần tự, report, cancel); coordinator chỉ gồm janitor (reclaim, TTL PII, retention) chạy bằng `coordinator watch` (D14); ops CLI đầy đủ (§7.4, gồm `ops approve` cho đường HITL D6). Chưa có chuỗi auto-match; chưa đụng visibility gate (máy vận hành để tab BM visible).                                                                                  | 2 profile (một máy `partner-assign`; một máy `partner-approve` phục vụ cả `requests.scan`) chạy hết hàng đợi 10 job dry không lỗi mapping; claim không trùng khi 2 máy cùng BM + flow cùng online; cancel dừng đúng ≤1 step; đặt `engine:emergencyStop` ở một profile → máy đó `blocked`, không claim job dry/scan nào; job `mode: 'assist'` lọt qua (giả lập rules lỏng) → dispatcher chốt `ERR_JOB_INVALID`, không gửi lệnh; giết SW giữa `claimed` và `run.start`, rồi giữa `running`: reconcile (§5.1 bước 0) nối lại hoặc chốt đúng, không dispatch trùng; tắt hẳn một profile giữa `running` → janitor chốt `ERR_MACHINE_LOST`, không chạy lại; rules unit test (§10) qua. |
| **3 — Ghi thật có chính sách**                            | Mở `assist` (kèm dashboard confirm, §8.1) rồi cân nhắc `full` cho `partner-approve`: yêu cầu visibility gate mới đã test thực địa (Q2), `FULL_LOCKED` gỡ theo quyết định Q4, đưa coordinator lên Cloud Functions (tuỳ chọn, cần Blaze) khi cần chạy không có người (Q6).                                                                                                                                | BM staging: 1 job assist end-to-end có confirm từ dashboard; runbook rollback (cập nhật rules cấm mode, killSwitch).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Mỗi pha là một bản release riêng; không nhảy pha khi tiêu chí chưa qua.

**Chuỗi auto-match (§7.3) theo pha:**

- **Pha 1–2: không triển khai.** `dry` assign không bao giờ dừng ở `pending-approval` (`partnerAssign.ts:763` đánh `done` mọi target), nên chuỗi không có gì để chạy thật; làm sớm chỉ thêm chi phí. Rules pha 1–2 từ chối `chain.auto` (§8.2).
- **Pha 3:** cài `onAssignFinished` + phần chuỗi của `tick`; kiểm hợp đồng dữ liệu, idempotency, lịch scan, kill-switch, các nhánh `skipped/held/partial/error` bằng RTDB emulator + dữ liệu mẫu. Sau đó chạy thật trên BM staging có bật yêu cầu admin thứ hai (profile admin 1 assign `assist`, profile admin 2 scan + duyệt) để đo `scanDelaysSec` và độ ổn định khớp tên; chỉ bật `full` cho `partner-approve` theo Q4. Chuỗi **không** là lý do để gỡ `FULL_LOCKED`.
- Coordinator (module `coordinator/`, D14) là phụ thuộc mới ở pha 2 (janitor + ops CLI), chạy bằng CLI trên máy anh: trước pha 2 cần sẵn service account riêng cho janitor (khoá ngoài repo, §7.3.g), tài khoản `ops` cho ops CLI, và Emulator Suite (RTDB) trong CI. Chưa cần Blaze; chỉ cần khi chuyển sang Cloud Functions ở pha 3.

**Nhận xét về giá trị theo pha:** pha 1–2 chỉ chứng minh đường ống (job `dry` không ghi gì lên BM); giá trị vận hành thật chỉ có từ pha 3, vốn phụ thuộc Q2, Q4 và `FULL_LOCKED`. Vì vậy **chốt Q4 và thử Q2 trước khi bắt đầu pha 2**; nếu Q4 ra kết quả "không bao giờ chạy full không giám sát" thì hệ thống chỉ còn giá trị ở mức `assist` có xác nhận từ dashboard và phạm vi pha 3 phải được viết lại.

**Tiêu chí dừng pha 3 (an toàn tài khoản):** trước khi mở ghi thật, chốt ngưỡng tạm dừng toàn bộ (kill-switch theo BM, §5.3) khi một BM gặp quá N lần checkpoint/CAPTCHA/`ERR_RATE_LIMITED` trong 24 giờ (N do anh chốt, đề xuất N = 1). Nhiều profile tự động điều khiển từ xa có rủi ro bị Meta gắn cờ cao hơn thao tác tay; write budget và curfew là giới hạn trên, không phải bảo đảm.

## 10. Kiểm chứng

- **Unit (vitest, thư mục `tests/remote/`):** guard `remoteJob.ts` (shape sai, mode lạ, `mode ∉ REMOTE_ALLOWED_MODES` → `ERR_JOB_INVALID` không gửi lệnh, businessId lệch định dạng); **cổng trước claim** (emergency/rate-limit cục bộ chặn cả job `dry` và `requests.scan`; kill-switch chặn); transaction claim với giá trị đầu `null` (cache lạnh) không abort nhầm; ánh xạ `RunState.status` → `state.status` đủ 7 trạng thái (§4.2, gồm `pending-approval` → `done` và `stopped` → `cancelled`/`ERR_STOPPED_LOCALLY`); ba tầng lỗi §5.2 (chuẩn bị tab / `StartReply` / kết thúc run), `ERR_EMERGENCY` → `error` + máy `blocked` không hạn; listener `run.state` đăng ký đồng bộ ở top-level SW; state machine dispatcher với RTDB giả (claim thắng/thua, ERR_BUSY → un-claim, budget/curfew → `blocked` rồi chạy tiếp, cancel giữa run, **reconcile khi khởi động**: job `claimed` mồ côi, run còn sống, run đã kết thúc trong lúc SW chết; dispatch tách đúng giữa `RunStartCommand` và `RequestsRead` theo `flow`; **§5.5:** tìm tab theo `businessId` bằng thăm dò `location.read`, tự `tabs.create` khi không có tab, `ensureSurface` với `businessId` ưu tiên, scan không gửi khi tab có run, scan rỗng chỉ tin khi đã ở đúng trang Requests, `run.clear` sau khi ghi kết quả); `JobResult` từ các `RunState` mẫu; ULID `machineId` ổn định qua reload.
- **Integration:** **RTDB emulator** (Firebase Emulator Suite) trong CI: 2 máy giả cùng flow tranh 1 job; reconcile tìm được job qua index `state/claimedBy` khi `currentJobId` chưa kịp ghi; janitor reclaim đúng TTL (`claimed → pending`, `running → ERR_MACHINE_LOST`), dọn PII 24 giờ, xoá job cuối 30 ngày, liệt kê nhánh BM qua `ext/machines`; rules test bằng `@firebase/rules-unit-testing` theo **toàn bộ danh sách ở cuối §8.2** (claim `ops`/`machineId`/`bm`/`coordinator`, người ngoài không claim; `.indexOn` có mặt); ops CLI tạo job qua client SDK bị Rules từ chối đúng như dashboard.
- **Coordinator — janitor (pha 2) và chuỗi §7.3 (pha 3), bộ test riêng nơi nó sống:** coordinator khởi tạo đúng với `databaseAuthVariableOverride` (kiểm bằng test rules rằng nó **bị** từ chối khi vượt quyền hẹp). Phần chuỗi (pha 3): đối chiếu E↔R bằng `matchKey` (khớp chính xác sau chuẩn hoá; `cR(k) ≤ cE(k)` → duyệt đủ, `cR(k) > cE(k)` → cả nhóm tên `k` không khớp, ghi `ambiguous`; lọc `requesterName` khi có; request khác không bị chạm); E có phần tử ngoài `config.queries` → `ERR_CHAIN_PROVENANCE`; các nhánh kích hoạt theo đúng thứ tự bảng §7.3.b (`unverified` trước tiên, `runStatus` `done` vs `pending-approval`, `error`/`cancelled` có/không có E); `counts.queued > 0` → ghi `remaining`, không tự tạo assign; lịch scan nhiều lượt và `partial`; `ERR_CHAIN_NO_MATCH`, `ERR_CHAIN_TTL`; idempotency (trigger hai lần → một job approve); kill-switch và trần/ngày → `held`; khoá job xác định không bị ghi đè.
- **Build gate:** `pnpm lint`, `tsc`, `lint:spell`, `pnpm build`, `pnpm build:firefox`; `extension-security-reviewer` + `cross-browser-checker` cho phần manifest (`alarms`) và background (CLAUDE.md).
- **Thực địa (anh):** checklist từng pha §9 trên BM staging với 2 Chrome profile.

## 11. Tiêu chí chấp nhận (tổng)

1. Không validator hay gate an toàn nào bị nới để "bỏ qua" kiểm tra — mọi job từ xa đi qua đúng các guard của lệnh bấm tay. **Ngoại lệ duy nhất, có điều kiện:** visibility gate trong `src/content/engine/runner.ts` và trường đánh dấu nguồn SW trên `RunStartCommand` (Q2, §8.1), chỉ được đưa vào ở pha 3 sau review + test thực địa; pha 1–2 không sửa `src/content/engine/**`. Ngược lại, job từ xa chịu cổng **chặt hơn** bấm tay: emergency/rate-limit cục bộ chặn cả `dry`/`requests.scan` (D7), và `REMOTE_ALLOWED_MODES` khoá mode độc lập với Rules (D8).
2. Hai machine cùng BM + `flow` không bao giờ chạy trùng một job (bằng chứng test transaction + rules ở §10).
3. SW chết/restart ở bất kỳ điểm nào của vòng đời job: không mất job trạng thái cuối (đọc lại từ RTDB), không dispatch trùng, run đang chạy được nối lại qua `run.sync` hoặc chốt `error` rõ ràng.
4. `cancelRequested` làm run dừng trong ≤ 1 step và job kết thúc `cancelled`.
5. Checkpoint/CAPTCHA/rate-limit trong run tự động → engine khoá như khi chạy tay; job `error`, máy `blocked` kèm `blockedReason`, không claim gì nữa tới khi khoá hết hạn hoặc được gỡ tay, không retry nóng; trạng thái hiện rõ ở `ops status`/dashboard. Máy chết giữa `running` → `ERR_MACHINE_LOST`, không bao giờ chạy lại tự động.
6. Manifest **Chrome** chỉ thêm `alarms` (host Firebase chỉ khi spike pha 0 chứng minh bắt buộc, §6.4; không khai CSP); manifest và bundle **Firefox** không đổi; lint/tsc/spell/build hai browser qua; rules emulator test qua.
7. Job `partner-approve` không thể tồn tại trong DB nếu không có job `requests.scan` `done` cùng BM (rules cưỡng chế, D6).
8. Chuỗi auto-match (pha 3): không máy extension nào tạo được job; coordinator không tạo được `partner-assign` hay `action: decline`, không tạo được job ngoài nhánh BM của job assign, không dùng `partnerName` khác `chain.partnerName`, không ghi đè job đã có; request không khớp E (hoặc mơ hồ) không bao giờ bị duyệt; E chứa TKQC ngoài `config.queries` thì chuỗi dừng `ERR_CHAIN_PROVENANCE`.
9. Chuỗi tôn trọng mọi gate D7/D8: không có đường nào để `mode` của chuỗi vượt quá mode pha hiện tại cho phép, và `FULL_LOCKED` không bị tác động bởi chuỗi.
10. Không job nào được tạo/sửa bằng Firebase console (D15); mọi job trong DB có `createdBy` = `auth.uid` của tài khoản `ops`/`coordinator` tạo ra nó.

## 12. Câu hỏi mở

| #   | Câu hỏi                                                                                                                                      | Đề xuất                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| :-- | :------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | SDK Web (`firebase-database`, ~120 KB) hay REST SSE tự viết (0 KB)?                                                                          | **ĐÃ CHỐT: SDK** (reconnect, token refresh, transaction; presence chỉ heartbeat) — dependency đã được anh duyệt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Q2  | Nới visibility gate cho run do SW phát (§8.1)?                                                                                               | Có, nhưng phải thử thực địa (occlusion + timer throttling, §8.1) **trước khi bắt đầu pha 2**, và chỉ đưa vào code ở pha 3 sau reviewer; trước đó giữ tab visible.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Q3  | Region RTDB và project Firebase nào (`firebaseio.com` vs `<region>.firebasedatabase.app`)?                                                   | **ĐÃ CHỐT (đề xuất mở lại trước pha 2):** dùng project `tnm---hpma` sẵn có, RTDB mặc định ở `asia-southeast1`, gộp tay Rules vào nhánh `ext` (§9 pha 0). **Đề xuất của em:** tách `ext` sang một **project Firebase riêng ở gói Spark** (miễn phí, có sẵn RTDB mặc định; giới hạn Spark — 100 kết nối đồng thời, 1 GB lưu trữ — dư cho vài chục profile). Giải quyết cùng lúc: Rules không còn phải gộp tay, Auth pool không dùng chung, lộ khoá service account không chạm `user`/`wallets`/`realtime`. Spec hiện vẫn viết để chạy được trên instance dùng chung; tách project chỉ đổi cấu hình, không đổi schema/Rules. |
| Q4  | Chính sách mở `assist`/`full` không giám sát: flow nào, trần job/ngày, khung giờ?                                                            | Chỉ `partner-approve` full sau khi probe ≥ 95% trên BM mục tiêu + trần 3 job/ngày + trong khung giờ curfew cho phép; `partner-assign` dừng ở assist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Q5  | Ai là "nguồn điều phối" giai đoạn đầu: dashboard web riêng, n8n, hay thao tác tay trên Firebase console?                                     | Pha 1–2: **ops CLI** (§7.4) — không phải Firebase console, vì console bỏ qua Rules (D15); console chỉ để đọc và bật kill-switch khẩn cấp. Pha 3: dashboard có nút confirm assist, cùng hợp đồng dữ liệu với ops CLI.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Q6  | Janitor reclaim chạy ở đâu khi dashboard không mở (nhiều máy chạy đêm)?                                                                      | Bước reclaim nằm trong `tick` của CLI coordinator (D14) từ pha 2; pha 1 chạy tay bằng `ops janitor`; chạy đêm không người thì cần Cloud Functions (pha 3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Q7  | Firefox có nằm trong phạm vi automation không (SW/websocket trên Firefox MV3 khác Chrome)?                                                   | Chưa. Automation chỉ Chrome ở các pha đầu; Firefox khi bản engine Firefox ổn định.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Q8  | `machineId`/auth khi cài lại extension (xoá storage = đổi machine) — vận hành có cần "đổi tên giữ máy"?                                      | Options › Remote hiển thị `machineId` + nút nhập lại `machineId` cũ (nhập tay). Lưu ý: danh tính được cưỡng chế bằng custom claim (§8.2), nên nhập lại `machineId` chỉ có tác dụng khi ops gán lại claim cho tài khoản mới — đây là bước thủ công có chủ đích, chống mạo danh máy.                                                                                                                                                                                                                                                                                                                                        |
| Q9  | Coordinator của chuỗi §7.3 chạy ở đâu: Cloud Function hay n8n?                                                                               | **ĐÃ CHỐT: module `coordinator/` chạy CLI ở pha 2**, Cloud Functions tuỳ chọn ở pha 3 (D14, §7.3.g); `databaseAuthVariableOverride` để vẫn chịu Rules. n8n bị loại.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Q10 | `scanDelaysSec` (độ trễ từ lúc assign dừng ở `pending-approval` tới khi request hiện ở Needs review của cùng BM) và độ ổn định khớp tên TKQC | Mặc định [120, 300, 600]; **đo thực địa ở pha 3** trên BM staging có bật yêu cầu admin thứ hai rồi chỉnh. Nếu khớp tên không ổn định (tên TKQC trùng/đổi), cân nhắc khớp theo `accountId` khi engine đọc được ID từ request — hiện `ApproveRequest` chỉ có `requester` + `account` (tên hiển thị).                                                                                                                                                                                                                                                                                                                        |
| Q11 | `maxAutoApprovePerDay` theo BM cho chuỗi auto-match                                                                                          | Trùng trần `partner-approve` của Q4 (đề xuất 3 job/ngày); vượt trần → `held`, chờ người.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
