# Agent Note: Electron 桌面外壳——在现有 Web 服务器之上的原生窗口

Status: implemented

[English](2026-08-14-electron-desktop-shell.md) | 中文

## 问题

DeepSeek Harness 通过 `dsh web` 提供浏览器 GUI：它在本地回环 HTTP 服务器上提供已构建的前端。今天启动该 GUI 需要终端：用户先运行 `pnpm dsh web`（或已安装的 `dsh web`），再打开打印出的 URL。没有桌面入口，因此产品无法在 Windows、Linux 或 macOS 上通过点击已安装的应用程序启动。

GUI 分层 Agent Note 已经预留了 Electron 客户端，但其规划中的载体通过 `file://` 加载前端，并经 IPC 桥接路由 fetch。该载体尚未实现；客户端连接层仍假设 HTTP 上行链路和 WebSocket 下行链路。因此，交付桌面应用需要先决定使用哪种传输，以及现在要改动多少客户端层。

## 决策

`apps/desktop`（`@deepseek-ai/dsh-desktop`）是围绕现有 Web 服务器的薄 Electron 外壳。它不修改任何客户端或主机包。

### 进程模型

Electron 主进程以 `ELECTRON_RUN_AS_NODE=1` 外加 Node 的 `--expose-internals` 标志，以及参数 `web --host 127.0.0.1 --port 0` 启动随附的 CLI 作为子进程。Electron 内嵌自己的 Node 运行时，但不会暴露 `node-addon-require-builtin` 所期望的 embedder symbol，因此子进程使用 `--expose-internals` 来获取 HMR 服务所需的 internal loader。启动器从 `@deepseek-ai/dsh` 依赖解析 CLI bin，从 stdout 读取 `dsh web: http://127.0.0.1:<port>` 就绪行，并在 `BrowserWindow` 中加载该 URL。子进程在 `before-quit` 时被终止。`port 0` 请求操作系统分配空闲回环端口，因此两个应用实例永不冲突，服务器也永不绑定网络接口。

启动器逻辑与 Electron 无关，位于 `src/launcher.ts`；`src/main.ts` 负责窗口与生命周期，`src/preload.ts` 仅暴露 `platform` 与 `versions` 元数据。单元测试覆盖就绪行解析、参数组装和 bin 解析。

### 安全姿态

窗口使用 `contextIsolation: true`、`nodeIntegration: false`，且 preload 不导出任何特权 API。外部 URL 在系统浏览器中打开，离开回环源的同窗口导航被阻止。现有的 `/api` 浏览器信任围栏仍然适用，因为前端与回环 HTTP/WebSocket 传输通信的方式与 `dsh web` 完全相同。

### 打包
Electron Builder 在 Windows 上生成 NSIS 安装程序，在 Linux 上生成 AppImage 与 deb，在 macOS 上生成 dmg 与 zip。桌面包依赖 `@deepseek-ai/dsh`，因此安装程序通过现有依赖闭包捆绑 CLI 与 Web 前端 dist。禁用了 `asar` 并跳过原生重编译：被启动的 CLI 子进程需要读取真实的 `node_modules`。用于访问 Node 内部模块的运行时插件在 Electron 下不可用，因此外壳改为向子进程传递 `--expose-internals`，而不依赖该插件。

## 曾考虑的替代方案

| 被拒绝 | 一句话原因 |
|---|---|
| 通过 `file://` 加载前端并使用 IPC fetch 桥接 | 规划中的载体需要在连接层新增 `AbstractApiClient.doFetch` 实现和一个主进程桥接；这是客户端层项目而非外壳包装，会让桌面入口阻塞在该工作上 |
| 在 Electron 内进程内启动 Cordis web profile | CLI 仅打包其 bin 入口和哈希分块，未暴露可编程启动 API，因此进程内启动会分叉 CLI 的启动路径并重复其关闭逻辑 |
| 使用固定端口 | 固定端口会在实例间冲突，并可能把未认证的回环服务器暴露给更广的进程；由操作系统分配端口可默认保持私密姿态 |
| 将桌面应用放在 workspace 之外 | `apps/*` 是仓库的产品组装层，且已有发布约束；新 workspace 成员能保持打包、类型检查和文档门禁一致 |
| 通过 pnpm 启用 Electron 默认二进制下载 | Electron 43 不再执行 postinstall，因此 workspace 在开发流程中记录显式的 `install-electron` 步骤，而非添加无用的 build-script 白名单条目 |

## 后果

用户可以在三大桌面平台安装并点击桌面应用，外壳复用经过测试的 `dsh web` 组装，不触及 agent loop 或客户端包。代价是交付的 Electron 外壳仍运行回环 HTTP 服务器，而非最终的 `file://`/IPC 载体；该工作仍保留在 GUI 分层 Agent Note 中，必须在其落地后，桌面应用才能去掉子进程服务器。打包刻意按主机进行：每个安装程序在各自平台上构建，桌面包不接入根库构建，因为它是最终产品而非可发布的库产物。
