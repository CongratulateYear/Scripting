import type { MusicData, MusicProvider } from "../music"
import type { MusicSource, ResolveInput } from "./source"
import { sourceMP3Juice } from "./source_mp3juice"

/**
 * LX Music 聚合源适配器。
 *
 * 参考洛雪音源项目的做法：上层只依赖统一的 search / resolveAudioUrl 接口，
 * 底层源可随时替换或增加。
 *
 * 注意：洛雪自定义源里的 kw/wy/tx/kg/mg 直链接口需要平台自己的 songId/hash。
 * 当前项目搜索结果来自 MP3Juice/YouTube，拿 YouTube id 去请求这些平台会稳定失败，
 * 还会导致每次播放前多等待数秒。因此这里不再做无效跨平台探测，直接委托当前可用源。
 */

const LX_MUSIC_PROVIDER = "lxmusic" as MusicProvider

class SourceLxMusic implements MusicSource {
  readonly id = LX_MUSIC_PROVIDER
  readonly label = "LX Music"
  readonly isAggregator = true

  /** 搜索委托 MP3Juice，结果标记为 lxmusic，便于以后继续扩展更多底层源。 */
  async search(query: string): Promise<MusicData[]> {
    const results = await sourceMP3Juice.search(query)
    return results.map(r => ({
      ...r,
      provider: LX_MUSIC_PROVIDER,
      // 保留底层真实 id，后续解析可直接还原给 MP3Juice
      id: r.id,
    }))
  }

  /** 解析音频直链：当前直接走 MP3Juice，避免无效 LX 平台探测造成播放等待。 */
  async resolveAudioUrl(info: ResolveInput): Promise<string> {
    return sourceMP3Juice.resolveAudioUrl({
      ...info,
      provider: "mp3juice",
      source_id: info.source_id ?? info.id,
    })
  }

  /** 解析视频直链：委托 MP3Juice。 */
  async resolveVideoUrl(info: ResolveInput): Promise<string> {
    return sourceMP3Juice.resolveVideoUrl({
      ...info,
      provider: "mp3juice",
      source_id: info.source_id ?? info.id,
    })
  }
}

export const sourceLxMusic = new SourceLxMusic()
