/**
 * 歌词数据源 — LRCLIB（lrclib.net，免 key、开源、社区贡献）。
 *
 * 端点：
 *   - 精确：GET /api/get?artist_name=&track_name=&album_name=&duration=
 *           命中返回单条 { syncedLyrics, plainLyrics, ... }；未命中 404。
 *   - 模糊：GET /api/search?artist_name=&track_name=  返回候选数组。
 *
 * syncedLyrics 是带 [mm:ss.xx] 时间轴的 LRC 文本，plainLyrics 为纯文本回退。
 * 对欧美独立/另类（用户口味）覆盖良好。
 */

import { fetch } from "scripting"

const LRCLIB_BASE = "https://lrclib.net"
const UA = "ScriptingMusic/1.0 (https://github.com/ScriptingApp)"
const CACHE_TTL = 30 * 60 * 1000 // 30 分钟

/** 一行同步歌词。 */
export type LyricLine = {
  /** 起始时间（秒） */
  time: number
  text: string
}

/** 歌词结果：synced 优先，plain 回退；都为 null 表示无歌词。 */
export type LyricsResult = {
  synced: LyricLine[] | null
  plain: string | null
}

type CacheEntry = { at: number; data: LyricsResult }
const cache = new Map<string, CacheEntry>()

type LrclibRecord = {
  id?: number
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

function cacheKey(title: string, artist: string): string {
  return `${title.trim().toLowerCase()}|${artist.trim().toLowerCase()}`
}

/** 解析 LRC 文本为有序 LyricLine[]。一行可带多个时间标签；空文本行保留以占位。 */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  const tagRe = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  for (const raw of lrc.split(/\r?\n/)) {
    tagRe.lastIndex = 0
    const tags: number[] = []
    let m: RegExpExecArray | null
    let lastEnd = 0
    while ((m = tagRe.exec(raw)) !== null) {
      const min = parseInt(m[1], 10)
      const sec = parseInt(m[2], 10)
      const fracStr = m[3] ?? "0"
      // 归一化小数位：2 位→百分秒，3 位→毫秒
      const frac = parseInt(fracStr, 10) / Math.pow(10, fracStr.length)
      tags.push(min * 60 + sec + frac)
      lastEnd = tagRe.lastIndex
    }
    if (tags.length === 0) continue // 非时间行（如 [ar:] 元数据）跳过
    const text = raw.slice(lastEnd).trim()
    for (const t of tags) out.push({ time: t, text })
  }
  out.sort((a, b) => a.time - b.time)
  return out
}

function toResult(rec: LrclibRecord | null | undefined): LyricsResult {
  if (!rec) return { synced: null, plain: null }
  const synced = rec.syncedLyrics ? parseLrc(rec.syncedLyrics) : null
  return {
    synced: synced && synced.length > 0 ? synced : null,
    plain: rec.plainLyrics?.trim() ? rec.plainLyrics : null,
  }
}

async function httpGetJson(url: string): Promise<any | null> {
  try {
    console.log(`[歌词] 请求: ${url}`)
    const resp = await fetch(url, {
      headers: { "User-Agent": UA },
      timeout: 10,
    })
    console.log(`[歌词] 响应: ${resp.ok} ${resp.status}`)
    if (!resp.ok) return null
    return await resp.json()
  } catch (e) {
    console.error("[歌词] 请求失败:", url, e)
    return null
  }
}

// ===== 网易云音乐歌词回退 =====
const NETEASE_BASE = "https://music.163.com/api"
const NETEASE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"

async function fetchNetEaseLyrics(title: string, artist: string): Promise<LyricsResult> {
  try {
    // 1) 搜索获取 songId
    const searchUrl = `${NETEASE_BASE}/search/get/web?s=${encodeURIComponent(title + " " + artist)}&type=1&limit=5`
    console.log(`[歌词] 网易云搜索: ${searchUrl}`)
    const searchResp = await fetch(searchUrl, {
      headers: {
        "User-Agent": NETEASE_UA,
        "Referer": "https://music.163.com/",
      },
      timeout: 10,
    })
    if (!searchResp.ok) return { synced: null, plain: null }
    const searchData = await searchResp.json()
    const songs = searchData?.result?.songs
    if (!Array.isArray(songs) || songs.length === 0) {
      console.log("[歌词] 网易云搜索无结果")
      return { synced: null, plain: null }
    }
    const songId = songs[0]?.id
    if (!songId) return { synced: null, plain: null }

    // 2) 获取歌词
    const lyricUrl = `${NETEASE_BASE}/song/lyric?id=${songId}&lv=1&tv=-1`
    console.log(`[歌词] 网易云歌词: ${lyricUrl}`)
    const lyricResp = await fetch(lyricUrl, {
      headers: {
        "User-Agent": NETEASE_UA,
        "Referer": "https://music.163.com/",
      },
      timeout: 10,
    })
    if (!lyricResp.ok) return { synced: null, plain: null }
    const lyricData = await lyricResp.json()

    // 解析 synced lyrics
    const lrcText = lyricData?.lrc?.lyric
    const transText = lyricData?.tlyric?.lyric
    if (lrcText) {
      const synced = parseLrc(lrcText)
      if (synced.length > 0) {
        console.log(`[歌词] 网易云返回 ${synced.length} 行同步歌词`)
        return { synced, plain: null }
      }
    }
    // 回退到纯文本
    if (transText && !lrcText) {
      const lines = transText.split(/\r?\n/).filter((l: string) => l.trim())
      if (lines.length > 0) {
        return { synced: null, plain: lines.join("\n") }
      }
    }
    return { synced: null, plain: null }
  } catch (e) {
    console.error("[歌词] 网易云请求失败:", e)
    return { synced: null, plain: null }
  }
}

/** 选出最佳候选：优先有 syncedLyrics、其次 duration 最接近、再次 plainLyrics。 */
function pickBest(list: LrclibRecord[], duration?: number): LrclibRecord | null {
  if (!list || list.length === 0) return null
  const scored = list
    .filter(r => !r.instrumental)
    .map(r => {
      let score = 0
      if (r.syncedLyrics) score += 1000
      else if (r.plainLyrics) score += 100
      if (duration && r.duration) {
        score -= Math.min(50, Math.abs(r.duration - duration))
      }
      return { r, score }
    })
    .sort((a, b) => b.score - a.score)
  return scored.length > 0 ? scored[0].r : null
}

export type LyricsQuery = {
  title: string
  artist: string
  album?: string
  /** 歌曲时长（秒），有助精确匹配。 */
  duration?: number
}

class LyricsSource {
  /**
   * 获取歌词：先 /api/get 精确匹配，未命中再 /api/search 模糊匹配。
   * 失败返回 { synced: null, plain: null }。30 分钟缓存。
   */
  async fetchLyrics(q: LyricsQuery): Promise<LyricsResult> {
    const title = (q.title || "").trim()
    const artist = (q.artist || "").trim()
    if (!title) return { synced: null, plain: null }

    const key = cacheKey(title, artist)
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data

    let result: LyricsResult = { synced: null, plain: null }

    // 1) LRCLIB 精确 get（带 album/duration 提升命中率）
    const getParams = new URLSearchParams({ track_name: title })
    if (artist) getParams.set("artist_name", artist)
    if (q.album) getParams.set("album_name", q.album)
    if (q.duration && isFinite(q.duration) && q.duration > 0) {
      getParams.set("duration", String(Math.round(q.duration)))
    }
    const got = await httpGetJson(`${LRCLIB_BASE}/api/get?${getParams.toString()}`)
    if (got && (got.syncedLyrics || got.plainLyrics)) {
      result = toResult(got as LrclibRecord)
    }

    // 2) LRCLIB 模糊 search 回退
    if (!result.synced && !result.plain) {
      const sParams = new URLSearchParams({ track_name: title })
      if (artist) sParams.set("artist_name", artist)
      const list = await httpGetJson(`${LRCLIB_BASE}/api/search?${sParams.toString()}`)
      if (Array.isArray(list)) {
        result = toResult(pickBest(list as LrclibRecord[], q.duration))
      }
    }

    // 3) 网易云音乐回退（中文歌曲覆盖更好）
    if (!result.synced && !result.plain) {
      console.log("[歌词] LRCLIB 未命中，尝试网易云")
      result = await fetchNetEaseLyrics(title, artist)
    }

    cache.set(key, { at: Date.now(), data: result })
    return result
  }
}

export const lyrics = new LyricsSource()
