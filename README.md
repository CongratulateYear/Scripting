# Scripting

用于集中存放 [Scripting App](https://scriptingapp.github.io/) 脚本项目的公开仓库。

## 脚本列表

| 脚本 | 说明 | 一键导入 |
|---|---|---|
| ScriptingMusic | iOS Scripting App 音乐播放器 | [导入](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2FCongratulateYear%2FScripting%2Ftree%2Fmain%2FScriptingMusic%22%5D) |

## 仓库约定

- 每个脚本项目独立放在仓库根目录下的一个文件夹中，例如 `ScriptingMusic/`。
- 新脚本必须遵循 [`SCRIPTING_DEVELOPMENT_GUIDE.md`](./SCRIPTING_DEVELOPMENT_GUIDE.md)。
- 每个脚本目录应至少包含：
  - `script.json`
  - `index.tsx`
  - `README.md`
- 复杂脚本建议按功能拆分：`class/`、`page/`、`widget/`、`tests/`、`specs/`。

## ScriptingMusic

- 项目目录：[ScriptingMusic](./ScriptingMusic)
- 一键导入：[导入 ScriptingMusic](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2FCongratulateYear%2FScripting%2Ftree%2Fmain%2FScriptingMusic%22%5D)
