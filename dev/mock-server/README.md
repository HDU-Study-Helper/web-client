# 独立本地 Mock Backend

**仅本机开发演示，全部数据为虚构。不会访问钉钉、学习通、教务或任何真实平台，不提供真实登录，不要输入真实账号、密码或密钥。** 使用 Node 内置 `http` / `crypto`，无需新增依赖。仅新增本目录，不修改前端、现有测试、依赖或 Vite 配置。

## 启动与联调

要求 Node.js **22+**（自测使用内置 fetch、getSetCookie、node:test）。在 `web-client` 根目录运行：

```powershell
node dev/mock-server/server.cjs
```

默认仅监听 **127.0.0.1:2610**，匹配当前 Vite 的 `HAA_API_TARGET` 默认值 `http://127.0.0.1:2610`。浏览器仍打开现有 Vite **http://127.0.0.1:5173/**；本服务不占用5173，也不启动或替换前端服务器。开发时已用临时监听确认2610可用，但启动时如已占用会明确报错，不会终止其他进程。`Ctrl+C` 停止。

改端口时分别在后端和前端启动终端设置（Vite需重新启动才能读取环境变量）：

```powershell
# 后端终端
$env:MOCK_PORT='2611'
node dev/mock-server/server.cjs

# 前端终端：沿用项目原有Vite启动命令
$env:HAA_API_TARGET='http://127.0.0.1:2611'
# HAA_BACKEND_ORIGIN 应不设置，或设为 http://127.0.0.1:2611
```

后端Host仅接受 `127.0.0.1:<实际端口>` / `localhost:<实际端口>`，写请求Origin必须等于对应的 `http://<Host>`。Vite现有代理先验证浏览器同源，再重写Origin至后端，因而无需CORS。不要配置公网地址或外部反代来暴露此服务；它不是生产级认证系统。

## 演示账号

| 用途 | 账号 | 密码 |
| --- | --- | --- |
| 普通HAA模拟登录 | `student` | `correct-password` |
| 管理员角色模拟登录 | `admin` | `correct-password` |
| 向导教务模拟连接 | `synthetic-student` | `synthetic-school-password` |

以上均为公开的虚构演示凭据，不是实际密钥。管理员仅用于菜单展示，**本mock不实现 `/admin` 页面**。教务拒绝其他账号密码，不储存提交密码，不将密码放入日志或status。

## Cookie / CSRF 契约

1. 首先 `GET /api/v1/auth/me`；未登录返回401，同时设置 `academic_mock_session`（HttpOnly、SameSite=Lax、Path=/）和前端可读的 `academic_csrf`（SameSite=Lax、Path=/）。前端App已自动进行此请求。
2. 所有写请求（包括login）携带cookie，以及 `X-CSRF-Token: <academic_csrf值>`，并携带匹配后端Host的Origin；JSON体使用 `Content-Type: application/json`。
3. login成功轮换session ID和CSRF cookie；logout删除当前会话并清除cookie。有效期8小时，内存延迟清理；每次登录创建干净的会话。即使同一演示账号，在不同浏览器会话中的连接、群选择、导入及模拟配置也完全隔离。
4. 每次响应 `Cache-Control: no-store`，错误为 `{error:{code,message,retryable:false},request_id}`，兼容现有 `ApiError`。401表示HAA会话错误；教务账号不匹配用400 `auth_required`，避免意外让前端退出HAA。

HTTP本地开发cookie不设置Secure。不可将此策略复制到生产服务。写请求体上限64KiB。

## 覆盖路由

所有路径都以 `/api/v1` 开头：

- `GET /auth/me`；`POST /auth/login`；`POST /auth/logout`。
- `GET /platforms/sources`、`GET /platforms/connections`、`GET /dws/connections`。
- `POST /platforms/{chaoxing|mooc|ucampus}/auth` → `{connection,auth}`；`GET /platforms/connections/:id/auth`；`DELETE /platforms/connections/:id/`。
- `POST /platforms/jwxt/login` → active教务连接。
- `POST /dws/link` 或 `POST /dws/connections/:id/link` → 验证码授权；`GET` / `DELETE /dws/connections/:id/link/:challenge` 轮询/取消。已授权后取消不会误断开连接。
- `GET /dws/connections/:id/available-groups`：每页2个，首屏有 `next_cursor:'page2'`；下一页传 `?cursor=page2`。`GET` / `PUT /dws/connections/:id/groups` 读写 `{groups:[{id,name}]}`，最多100个、不接受重复id，保存204。群名带“【模拟】”。
- `POST /platforms/connections/:id/sync`：校验 `resource:'schedule'`、学年2000–2100、学期1/2、学年范围内真实周一、1–24节有效且不重叠的连续编号作息。响应虚构固定结果 `records:3, generated:48, skipped_practice:1, retired_modifications:[]`。按学年/学期替换内存中的导入记录，无真实课程生成。

当前向导学期与每日作息草稿本来保存在浏览器localStorage，**没有独立的学期/作息保存HTTP请求**；它们通过sync的 `calendar:{week_one_monday,periods}` 一并验证/保存。跳过教务时不导入，也不伪造导入成功。

## 扫码/验证码模拟

授权按时间自动推进，无需真实扫描或输入验证码：默认 `pending` → 2秒后 `scanned` → 4.5秒后 `authorized`，120秒到期；轮询及连接刷新时计算状态，不启动常驻计时器。二维码/授权链接使用保留域名 **https://mock-auth.invalid/simulation-only/...**，仅使前端生成一个演示二维码，**不是可访问的官方授权地址**；不要点击或用真实平台扫描。UI里的“官方授权页”是现有前端通用文案，本mock不会连接真实平台。

启动前可配置：

```powershell
$env:MOCK_SCANNED_MS='2000'
$env:MOCK_AUTHORIZED_MS='4500'
$env:MOCK_EXPIRES_MS='120000'
$env:MOCK_AUTH_OUTCOME='authorized'  # authorized | expired | failed
node dev/mock-server/server.cjs
```

`expired` 保持pending/scanned直到expiresMs后过期；`failed` 在authorizedMs时失败；authorizedMs不能早于scannedMs。过期优先于尚未完成的授权，成功/失败/取消为终态。延迟范围0–3600000ms。对现有浏览器2秒轮询，建议scan=2000 / authorized=4500以观察完整推进。

## 仅本地控制端点

仍需已登录、写请求CSRF及Origin，且只操作**当前会话**：

- `GET /api/v1/mock/status`：查看模拟标识、当前连接、群、导入请求及结果，不包含密码、session ID和CSRF。
- `POST /api/v1/mock/config`：JSON如 `{ "outcome":"failed", "scannedMs":2000, "authorizedMs":4500, "expiresMs":120000 }`，仅影响后续新授权，方便测试失败后恢复。
- `POST /api/v1/mock/reset`：清空本会话连接/群/导入和配置，保留登录、轮换CSRF。不会清除浏览器localStorage；重走向导需在前端调整设置或清理该演示用户草稿。

## 真实HTTP smoke验证

```powershell
node --test dev/mock-server/selftest.cjs
# 也可直接 node dev/mock-server/selftest.cjs
```

测试在127.0.0.1的OS分配临时端口启动真实HTTP服务，通过fetch请求，结束后关闭监听及连接；不占2610或5173，不依赖正在运行的前端，也不会留下后台服务器。覆盖cookie登录/恢复/退出、CSRF和Origin拒绝、错误密码、同账号不同会话隔离、来源列表、钉钉pending→scanned→authorized、验证码、取消语义、学习通授权、MOOC失败、过期、U校园删除、群分页/保存/去重校验、虚构教务登录、课表导入/重导入/非法周一及重叠校验、reset。

数据仅在进程内存存在，重启、退出登录或reset即丢失；前端草稿的localStorage生命周期独立。自测是后端HTTP契约验证，不是实际平台登录验证或完整浏览器视觉E2E。
