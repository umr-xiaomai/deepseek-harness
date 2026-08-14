# `@deepseek-ai/dsh-desktop`

[English](README.md) | 中文

DeepSeek Harness Web GUI 的 Electron 桌面外壳。它在操作系统分配的本地回环端口上启动随附的 `dsh web` 服务器，并在原生窗口中打开同一个浏览器界面，因此点击已安装的应用程序即可启动产品，无需终端。

## 功能

- 通过 Electron-as-Node 子进程方式启动 `dsh web`（`ELECTRON_RUN_AS_NODE=1` 外加 `--expose-internals`），保留现有 Web 组合及其安全姿态。
- 将服务器绑定到 `127.0.0.1` 并使用端口 `0`，因此不会与其他实例冲突，也不会监听任何网络接口。
- 在 Electron `BrowserWindow` 中加载返回的回环 URL；外部链接在系统浏览器中打开。
- 退出时停止子进程服务器。

## 从源码运行

前置条件：Node 22.19+ 或 24+、pnpm，以及已完成构建的仓库。在仓库根目录执行：

```sh
pnpm install
pnpm run build
pnpm install-electron
pnpm desktop:dev
```

`pnpm install-electron` 会下载一次 Electron 运行时；`pnpm desktop:dev` 会构建本包并启动 Electron。Web 前端与 CLI 运行时必须先由 `pnpm run build` 构建完成。

## 测试

```sh
pnpm desktop:test
```

单元测试覆盖与 Electron 无关的启动器逻辑：就绪行解析、参数组装与 CLI 入口解析。

## 打包

Electron Builder 从本包生成安装程序：

```sh
pnpm desktop:pack:win     # NSIS .exe
pnpm desktop:pack:linux   # AppImage and .deb
pnpm desktop:pack:mac     # .dmg and .zip
pnpm desktop:pack         # host-platform targets
```

产物位于 `apps/desktop/release/`。不做交叉构建：请分别在各自平台上构建对应目标。

## 工作原理

主进程（[`src/main.ts`](src/main.ts)）等待 Electron 就绪后，调用 [`src/launcher.ts`](src/launcher.ts) 以 `--expose-internals web --host 127.0.0.1 --port 0` 参数启动随附的 CLI bin。启动器从 `@deepseek-ai/dsh` 依赖解析该 bin，读取 `dsh web: http://127.0.0.1:<port>` 就绪行，并将 URL 交给窗口加载器。极简 preload（[`src/preload.ts`](src/preload.ts)）仅暴露平台元数据；任何特权 Electron API 都不会进入渲染进程。

Electron 的长期方案是通过 IPC fetch 桥接以 `file://` 加载前端，而非使用回环 HTTP 服务器。这需要 GUI 分层 Agent Note 中描述的客户端连接载体工作，此处刻意将其延后。
