# Scripting

用于集中存放 [Scripting App](https://scriptingapp.github.io/) 脚本项目的公开仓库。

## 脚本列表

| 脚本 | 说明 | 一键导入 |
|---|---|---|
| ScriptingMusic | iOS Scripting App 音乐播放器 | [导入](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2FCongratulateYear%2FScripting%2Ftree%2Fmain%2FScriptingMusic%22%5D) |
| book | 基于书源的 iOS 阅读脚本，支持书源管理、链接识别导入、搜索、阅读、缓存和小组件 | [导入](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2FCongratulateYear%2FScripting%2Fraw%2Frefs%2Fheads%2Fmain%2Fbook.scripting%22%5D) |

## 仓库约定

- 每个脚本项目独立放在仓库根目录下的一个文件夹中，例如 `ScriptingMusic/`；单文件 `.scripting` 包也可以直接放在根目录，例如 `book.scripting`。
- 新脚本必须遵循 [`SCRIPTING_DEVELOPMENT_GUIDE.md`](./SCRIPTING_DEVELOPMENT_GUIDE.md)。
- 每个脚本目录应至少包含：
  - `script.json`
  - `index.tsx`
  - `README.md`
- 复杂脚本建议按功能拆分：`class/`、`page/`、`widget/`、`tests/`、`specs/`。

## ScriptingMusic

- 项目目录：[ScriptingMusic](./ScriptingMusic)
- 一键导入：[导入 ScriptingMusic](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2FCongratulateYear%2FScripting%2Ftree%2Fmain%2FScriptingMusic%22%5D)

## book

- 脚本文件：[book.scripting](./book.scripting)
- 一键导入：[导入 book](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2FCongratulateYear%2FScripting%2Fraw%2Frefs%2Fheads%2Fmain%2Fbook.scripting%22%5D)

### 近期修复

- 脚本名称改为 `book`，仓库文件改为 `book.scripting`。
- 内置书源和自定义书源都可以删除；需要恢复时可点“重置为内置演示源”。
- 修复书源删除后列表未立即生效 / 空列表自动恢复内置源的问题。
- 导入书源支持直接粘贴 JSON、网络导入地址、GitHub 仓库/文件链接，以及包含链接的说明文本。
- 支持从 `https://github.com/liufuyou/read` 这类整理仓库中递归识别链接并导入可用书源。
