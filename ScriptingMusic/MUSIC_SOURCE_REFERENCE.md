# 音源架构参考：lx-music-source

参考项目：

- https://github.com/pdone/lx-music-source

本文用于记录 Scripting Music 的音源设计参考与实现约定。后续优化音源、搜索、播放直链解析、歌词/封面补全时，应优先遵循本文。

## 1. 参考项目定位

`pdone/lx-music-source` 是一组洛雪音乐自定义音源脚本集合，主要用于给 LX Music 客户端提供第三方音源能力。

它的核心价值不在 UI，而在于：

- 多音源统一注册
- 按 source 暴露能力
- 通过 action 分发请求
- 支持不同平台的音质列表
- 失败时按错误码区分处理
- 部分源支持音乐直链、封面、歌词

## 2. 可参考的设计点

### 2.1 统一音源接口

LX 音源脚本通常围绕统一 action 工作，例如：

- `musicUrl`：获取播放直链
- `pic`：获取封面
- `lyric`：获取歌词

Scripting Music 中也应保持统一音源抽象：

```ts
export interface MusicSource {
  readonly id: MusicProvider
  readonly label: string
  readonly isAggregator?: boolean

  search(query: string): Promise<MusicData[]>
  resolveAudioUrl(info: ResolveInput): Promise<string>
  resolveVideoUrl?(info: ResolveInput): Promise<string>
}
```

新增音源时，必须实现或兼容这个接口，而不是在页面层直接写请求逻辑。

### 2.2 Source 元信息

参考 LX 的 `sources` 注册方式，Scripting Music 的每个源也应明确描述：

- 源 ID
- UI 名称
- 是否聚合源
- 支持能力：搜索、音频解析、视频解析、歌词、封面
- 支持音质或优先级
- 是否短时直链

建议后续扩展：

```ts
type SourceCapability = "search" | "musicUrl" | "videoUrl" | "lyric" | "pic"

type SourceDescriptor = {
  id: string
  label: string
  capabilities: SourceCapability[]
  qualities?: string[]
  shortLivedUrl?: boolean
}
```

### 2.3 Action 分发思想

LX 源通过 action 分发：

```text
action = musicUrl / lyric / pic
source = kw / kg / tx / wy / mg / local
```

Scripting Music 中不需要完全复制事件系统，但可以参考其思想：

- 页面只调用 `music.search()`、`music.resolveAudioUrl()`
- `class/music.ts` 负责路由 provider
- 各 provider 细节放在 `class/sources/`
- 页面层禁止直接调用具体第三方接口

### 2.4 多源回退

LX 生态通常允许多个源并存。Scripting Music 中推荐采用：

1. 当前 provider 优先
2. 已有 `audio_url` 可用时优先复用
3. 短时直链源播放前实时解析
4. 当前源失败后，按候选评分回退其它源
5. 最终失败时向 UI 返回明确错误

示例策略：

```text
本地文件 -> 已缓存短时直链 -> 当前 provider 实时解析 -> 聚合搜索候选 -> 失败提示
```

### 2.5 错误码和限流处理

参考项目中常见错误：

- 频率限制
- IP 被限制
- 参数错误
- 获取直链失败
- 服务器内部错误

Scripting Music 应将这类错误归一化，避免页面层出现难懂异常。

建议错误类型：

```ts
type SourceErrorCode =
  | "RATE_LIMITED"
  | "BLOCKED"
  | "NOT_FOUND"
  | "INVALID_PARAM"
  | "UPSTREAM_ERROR"
  | "NETWORK_ERROR"
```

## 3. 不直接照搬的原因

`pdone/lx-music-source` 面向 LX Music 插件环境，依赖 `globalThis.lx` 提供的：

- `request`
- `on`
- `send`
- `EVENT_NAMES`
- `env`
- `version`

Scripting App 没有这个运行环境，因此不能直接把这些 JS 文件复制进项目运行。

如果要复用思路，需要改写为 Scripting 环境可用的 TypeScript 模块：

- 使用 `fetch` 或 Scripting 的网络 API
- 使用本项目的 `MusicSource` 接口
- 通过 `class/music.ts` 统一分发
- 不依赖 `globalThis.lx`

## 4. 当前项目音源现状

当前 Scripting Music 已有：

```text
class/sources/
├── source.ts             # 统一接口
├── source_mp3juice.ts    # MP3Juice 搜索 + savetube 解析
├── source_lxmusic.ts     # LX Music 聚合入口
├── itunes_meta.ts        # iTunes 元数据富化
├── itunes_browse.ts      # iTunes 艺人/专辑/歌曲浏览
├── charts.ts             # iTunes 榜单/发现页
├── resolve_real.ts       # 按标题/艺人解析真实音源
├── match_utils.ts        # 候选评分
├── lyrics.ts             # 歌词
├── artist_info.ts        # 艺人信息
└── album_info.ts         # 专辑信息
```

其中：

- iTunes 用于合法试听、榜单、元数据、发现页
- MP3Juice 用于搜索和完整音频解析
- LX Music 当前作为聚合入口，后续可接入更多 provider

## 5. 后续优化方向

### 5.1 统一 Provider Registry

新增 `source_registry.ts`：

```ts
export const sourceRegistry = {
  mp3juice: sourceMP3Juice,
  lxmusic: sourceLxMusic,
}
```

`class/music.ts` 只做 registry 路由，不写具体源逻辑。

### 5.2 候选解析和评分

参考 LX 多源思路，完整播放/下载时不应只拿第一条搜索结果，而应：

1. 搜索多个候选
2. 用 `match_utils.ts` 按标题、艺人、时长评分
3. 排除明显翻唱、live、remix、karaoke 等变体
4. 选最高分候选解析

### 5.3 歌词/封面能力插件化

后续每个源可以声明是否支持：

- 歌词
- 翻译歌词
- 封面
- 专辑信息

页面层只关心统一结果，不关心来源。

### 5.4 缓存和限流

- 搜索结果短缓存
- 直链短缓存
- CDN 缓存
- 失败源冷却时间
- 429/频率限制自动延迟重试

### 5.5 合规和安全

音源能力只用于个人学习和研究。后续实现必须注意：

- 不提交 API Key、Cookie、Token
- 不硬编码私人服务密钥
- 不在 README 中宣传侵权用途
- 对失败、限流、版权不可用等情况给出明确提示

## 6. 实现约定

1. 新增音源必须放在 `class/sources/`。
2. 新增音源必须实现 `MusicSource` 接口。
3. 页面层不能直接请求音源接口。
4. 播放和下载前必须实时解析短时直链。
5. 源失败不能阻塞 UI，应返回明确错误并允许回退。
6. 所有网络请求必须有错误处理。
7. 所有新增音源能力必须更新本文件和项目 README。

## 7. 参考链接

- LX Music Source: https://github.com/pdone/lx-music-source
- Scripting Quick Start: https://scriptingapp.github.io/guide/Quick%20Start
