# Scripting 脚本开发规范

本文基于 Scripting 官方 Quick Start 文档整理：

- 官方文档：https://scriptingapp.github.io/guide/Quick%20Start

本仓库内所有脚本项目都应遵循本文约定。

## 1. 基本原则

Scripting App 使用 TypeScript 与 React 类似的 TSX 语法编写 UI，底层包装 SwiftUI 视图能力。脚本应优先使用 `scripting` 包提供的组件和 API。

常用导入示例：

```ts
import { VStack, HStack, ZStack, Text, Button, List, Section, Navigation, Script } from "scripting"
```

## 2. 推荐项目结构

每个脚本独立放在一个目录中：

```text
ScriptName/
├── script.json          # 脚本元信息
├── index.tsx            # 主入口
├── README.md            # 脚本说明与安装方式
├── page/                # 页面组件
├── class/               # 业务逻辑、状态管理、数据访问
├── widget/              # 小组件，可选
├── tests/               # 测试/诊断脚本，可选
└── specs/               # 需求和设计记录，可选
```

## 3. 入口文件规范

`index.tsx` 是脚本主入口。需要呈现 UI 时，必须使用 `Navigation.present`，并在视图关闭后调用 `Script.exit()`，避免资源泄漏。

推荐模板：

```tsx
import { Navigation, Script, VStack, Text } from "scripting"

function App() {
  return (
    <VStack>
      <Text>Hello, Scripting!</Text>
    </VStack>
  )
}

async function main() {
  try {
    await Navigation.present({
      element: <App />,
    })
  } finally {
    Script.exit()
  }
}

main()
```

## 4. 组件规范

- 使用函数式组件。
- 组件名称使用 PascalCase。
- props 必须显式声明 TypeScript 类型。
- 复杂 UI 拆分到 `page/` 或 `components/`。

示例：

```tsx
import { HStack, Text, Button } from "scripting"

type GreetingProps = {
  name: string
  onTap?: () => void
}

function Greeting({ name, onTap }: GreetingProps) {
  return (
    <HStack>
      <Text>{`Hello, ${name}!`}</Text>
      <Button title="Click" action={onTap} />
    </HStack>
  )
}
```

## 5. 常用视图组件

官方 Quick Start 中提到的常用视图包括：

- 布局：`VStack`、`HStack`、`ZStack`、`Grid`
- 控件：`Button`、`Picker`、`Toggle`、`Slider`、`ColorPicker`
- 集合：`List`、`Section`
- 日期时间：`DatePicker`
- 文本输入：`Text`、`Label`、`TextField`
- 导航：`NavigationStack`、`NavigationLink`、`Navigation.present`

## 6. Hooks 使用规范

Scripting 支持 React 风格 Hooks。

### useState

用于简单本地状态：

```tsx
const [count, setCount] = useState(0)
```

### useEffect

用于副作用、订阅、异步加载。必须清理计时器和订阅。

```tsx
useEffect(() => {
  const timer = setTimeout(() => {}, 1000)
  return () => clearTimeout(timer)
}, [])
```

### useReducer

复杂状态逻辑优先使用 `useReducer`。

### useMemo / useCallback

- 昂贵计算使用 `useMemo`。
- 传给子组件或订阅的稳定回调用 `useCallback`。
- 不要过度使用，只有确实能减少重复计算或重渲染时再使用。

### useContext

跨组件共享状态使用 `createContext` + `useContext`，避免多层 props 传递。

## 7. 状态管理约定

- 简单页面状态使用 `useState`。
- 跨页面播放器、下载队列、用户配置等共享状态，应集中在 `class/` 中封装。
- 需要 UI 同步的全局状态，应提供订阅接口或 Context Provider。
- 异步状态至少区分：`idle`、`loading`、`success`、`error`。

## 8. 异步与错误处理

所有异步操作必须捕获错误：

```ts
try {
  await doSomething()
} catch (e) {
  console.error(e)
  await Dialog.alert({ title: "操作失败", message: String(e) })
}
```

建议封装统一的 `safeRun` / `safeAction`。

## 9. UI 呈现和退出

- `Navigation.present` 返回 Promise，视图关闭后才完成。
- UI 脚本结束时必须调用 `Script.exit()`。
- 如果启用最小化或后台能力，应在退出前清理计时器、订阅、播放器等资源。

## 10. 数据存储规范

- 免费版兼容优先：避免强依赖付费 API，例如 SQLite。
- 简单数据优先使用 `Storage` 或 `FileManager + JSON`。
- 文件路径应统一通过封装类管理，例如 `file_manager.ts`。
- 写文件前确保目录存在。
- 删除数据时同步清理相关资源，如音频、封面、歌词、缓存。

## 11. 脚本导入链接规范

仓库中的每个脚本都应提供 Scripting 一键导入链接：

```text
https://scripting.fun/import_scripts?urls=["GitHub 脚本目录 URL"]
```

需要 URL 编码后写入 README。例如：

```md
[导入 ScriptingMusic](https://scripting.fun/import_scripts?urls=%5B%22https%3A%2F%2Fgithub.com%2FCongratulateYear%2FScripting%2Ftree%2Fmain%2FScriptingMusic%22%5D)
```

## 12. README 要求

每个脚本目录必须有 README，至少包含：

- 脚本名称
- 功能说明
- 运行环境
- 一键导入链接
- 数据存储说明
- 主要目录结构
- 注意事项或权限说明

## 13. 维护约定

- 新增脚本后，同步更新仓库根 README 的脚本列表。
- 修改目录结构后，同步更新对应 README。
- 不要提交密钥、Token、Cookie、账号密码等敏感信息。
- 测试脚本和诊断脚本应放在 `tests/` 或 `specs/`，不要混在主入口。
