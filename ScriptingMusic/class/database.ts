import { Path } from "scripting"
import { fileManager } from "./file_manager"
import { setting } from "./setting"
import { id as idGen } from "./id"

export type Music = {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  cover_url?: string
  audio_url?: string
  provider?: string
  /** provider 侧的原始 id；为空时回退到 id（历史数据兼容） */
  source_id?: string
  is_downloaded: boolean
  file_size?: number
  added_at: number
  play_count: number
  last_played_at?: number
  is_favorite: boolean
}

export type Playlist = {
  id: string
  name: string
  cover?: string
  created_at: number
  updated_at: number
  music_count: number
}

export type PlaylistMusic = {
  playlist_id: string
  music_id: string
  added_at: number
  position: number
}

export type SearchHistory = {
  id: string
  keyword: string
  searched_at: number
}

export type DownloadTask = {
  id: string
  music_id: string
  session_id?: string
  status: "pending" | "downloading" | "paused" | "cancelled" | "completed" | "failed"
  progress: number
  error?: string
  created_at: number
  updated_at: number
}

type StoreData = {
  version: number
  music: Music[]
  playlist: Playlist[]
  playlist_music: PlaylistMusic[]
  search_history: SearchHistory[]
  download_task: DownloadTask[]
}

const EMPTY_STORE = (): StoreData => ({
  version: 1,
  music: [],
  playlist: [],
  playlist_music: [],
  search_history: [],
  download_task: []
})

/**
 * 免费版兼容数据库。
 *
 * 原实现依赖 Scripting PRO 才能使用的 SQLite API。这里改为 FileManager + JSON 文件存储，
 * 对外保留原 Database 方法，页面层无需改动。
 *
 * 存储文件：<basePath>/music_store.json
 */
class Database {
  private data: StoreData = EMPTY_STORE()
  private dbPath: string = ""
  private opened = false
  private saveQueue: Promise<void> = Promise.resolve()
  private changeListeners: Array<() => void> = []

  async init(): Promise<void> {
    if (this.opened) return
    await fileManager.init()
    const basePath = setting.getBasePath()
    await FileManager.createDirectory(basePath, true)
    this.dbPath = Path.join(basePath, "music_store.json")
    await this.load()
    this.opened = true
  }

  /** 当前 JSON 存储文件绝对路径（保留旧接口名，供迁移逻辑使用） */
  getDbPath(): string {
    return this.dbPath
  }

  /** 是否已初始化 */
  isOpen(): boolean {
    return this.opened
  }

  /** 重新按当前 setting.getBasePath() 打开存储。用于存储位置切换后。 */
  async reopen(): Promise<void> {
    this.close()
    await this.init()
  }

  private ensureOpen(): void {
    if (!this.opened) throw new Error("Database not initialized")
  }

  private async load(): Promise<void> {
    if (!(await FileManager.exists(this.dbPath))) {
      this.data = EMPTY_STORE()
      await this.persistNow()
      return
    }

    try {
      const text = await FileManager.readAsString(this.dbPath)
      const raw = JSON.parse(text || "{}")
      this.data = this.normalizeStore(raw)
      this.recountPlaylistMusic()
    } catch (e) {
      console.error("[database-json] load failed, fallback to empty store:", e)
      this.data = EMPTY_STORE()
      await this.persistNow()
    }
  }

  private normalizeStore(raw: Partial<StoreData>): StoreData {
    return {
      version: typeof raw.version === "number" ? raw.version : 1,
      music: Array.isArray(raw.music) ? raw.music.map(m => this.normalizeMusic(m as Partial<Music>)).filter(Boolean) as Music[] : [],
      playlist: Array.isArray(raw.playlist) ? raw.playlist.map(p => this.normalizePlaylist(p as Partial<Playlist>)).filter(Boolean) as Playlist[] : [],
      playlist_music: Array.isArray(raw.playlist_music) ? raw.playlist_music.map(pm => this.normalizePlaylistMusic(pm as Partial<PlaylistMusic>)).filter(Boolean) as PlaylistMusic[] : [],
      search_history: Array.isArray(raw.search_history) ? raw.search_history.map(s => this.normalizeSearchHistory(s as Partial<SearchHistory>)).filter(Boolean) as SearchHistory[] : [],
      download_task: Array.isArray(raw.download_task) ? raw.download_task.map(t => this.normalizeDownloadTask(t as Partial<DownloadTask>)).filter(Boolean) as DownloadTask[] : []
    }
  }

  private normalizeMusic(m: Partial<Music>): Music | null {
    if (!m || !m.id) return null
    return {
      id: String(m.id),
      title: String(m.title ?? ""),
      artist: String(m.artist ?? "未知艺术家"),
      album: String(m.album ?? "未知专辑"),
      duration: Number(m.duration ?? 0),
      cover_url: m.cover_url || undefined,
      audio_url: m.audio_url || undefined,
      provider: m.provider || undefined,
      source_id: m.source_id || undefined,
      is_downloaded: !!m.is_downloaded,
      file_size: m.file_size === undefined ? undefined : Number(m.file_size),
      added_at: Number(m.added_at ?? Date.now()),
      play_count: Number(m.play_count ?? 0),
      last_played_at: m.last_played_at === undefined ? undefined : Number(m.last_played_at),
      is_favorite: !!m.is_favorite
    }
  }

  private normalizePlaylist(p: Partial<Playlist>): Playlist | null {
    if (!p || !p.id) return null
    return {
      id: String(p.id),
      name: String(p.name ?? "未命名歌单"),
      cover: p.cover || undefined,
      created_at: Number(p.created_at ?? Date.now()),
      updated_at: Number(p.updated_at ?? Date.now()),
      music_count: Number(p.music_count ?? 0)
    }
  }

  private normalizePlaylistMusic(pm: Partial<PlaylistMusic>): PlaylistMusic | null {
    if (!pm || !pm.playlist_id || !pm.music_id) return null
    return {
      playlist_id: String(pm.playlist_id),
      music_id: String(pm.music_id),
      added_at: Number(pm.added_at ?? Date.now()),
      position: Number(pm.position ?? 0)
    }
  }

  private normalizeSearchHistory(s: Partial<SearchHistory>): SearchHistory | null {
    if (!s || !s.id || !s.keyword) return null
    return {
      id: String(s.id),
      keyword: String(s.keyword),
      searched_at: Number(s.searched_at ?? Date.now())
    }
  }

  private normalizeDownloadTask(t: Partial<DownloadTask>): DownloadTask | null {
    if (!t || !t.id || !t.music_id) return null
    return {
      id: String(t.id),
      music_id: String(t.music_id),
      session_id: t.session_id || undefined,
      status: (t.status || "pending") as DownloadTask["status"],
      progress: Number(t.progress ?? 0),
      error: t.error || undefined,
      created_at: Number(t.created_at ?? Date.now()),
      updated_at: Number(t.updated_at ?? Date.now())
    }
  }

  private async save(): Promise<void> {
    this.ensureOpen()
    this.saveQueue = this.saveQueue.then(async () => {
      await this.persistNow()
      this.emitChange()
    }).catch(e => {
      console.error("[database-json] save failed:", e)
    })
    await this.saveQueue
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.push(listener)
    return () => {
      this.changeListeners = this.changeListeners.filter(l => l !== listener)
    }
  }

  private emitChange(): void {
    for (const listener of this.changeListeners) {
      try { listener() } catch (e) { console.error("[database-json] change listener failed:", e) }
    }
  }

  private async persistNow(): Promise<void> {
    const json = JSON.stringify(this.data, null, 2)
    await FileManager.writeAsString(this.dbPath, json)
  }

  private cloneMusic(m: Music): Music {
    return { ...m }
  }

  private clonePlaylist(p: Playlist): Playlist {
    return { ...p }
  }

  private cloneSearchHistory(s: SearchHistory): SearchHistory {
    return { ...s }
  }

  private cloneDownloadTask(t: DownloadTask): DownloadTask {
    return { ...t }
  }

  private recountPlaylistMusic(): void {
    const musicIds = new Set(this.data.music.map(m => m.id))
    this.data.playlist_music = this.data.playlist_music.filter(pm => musicIds.has(pm.music_id))
    for (const p of this.data.playlist) {
      p.music_count = this.data.playlist_music.filter(pm => pm.playlist_id === p.id).length
    }
  }

  // Music CRUD
  /**
   * 插入新歌曲；如果 id 已存在，只更新可变元信息 + 下载状态。
   * 用户行为字段（play_count / is_favorite / last_played_at / added_at）一律保留。
   */
  async addMusic(music: Omit<Music, "play_count" | "is_favorite">): Promise<void> {
    this.ensureOpen()
    const idx = this.data.music.findIndex(m => m.id === music.id)
    if (idx >= 0) {
      const old = this.data.music[idx]
      this.data.music[idx] = {
        ...old,
        title: music.title,
        artist: music.artist,
        album: music.album,
        duration: music.duration,
        cover_url: music.cover_url,
        audio_url: music.audio_url,
        provider: music.provider,
        source_id: music.source_id,
        is_downloaded: old.is_downloaded || !!music.is_downloaded,
        file_size: music.is_downloaded ? music.file_size : old.file_size
      }
    } else {
      this.data.music.unshift({
        ...music,
        is_downloaded: !!music.is_downloaded,
        play_count: 0,
        is_favorite: false
      })
    }
    await this.save()
  }

  async getMusic(id: string): Promise<Music | null> {
    this.ensureOpen()
    const music = this.data.music.find(m => m.id === id)
    return music ? this.cloneMusic(music) : null
  }

  async getAllMusic(): Promise<Music[]> {
    this.ensureOpen()
    return [...this.data.music].sort((a, b) => b.added_at - a.added_at).map(m => this.cloneMusic(m))
  }

  async getDownloadedMusic(): Promise<Music[]> {
    this.ensureOpen()
    return this.data.music.filter(m => m.is_downloaded).sort((a, b) => b.added_at - a.added_at).map(m => this.cloneMusic(m))
  }

  async getFavoriteMusic(): Promise<Music[]> {
    this.ensureOpen()
    return this.data.music.filter(m => m.is_favorite).sort((a, b) => b.added_at - a.added_at).map(m => this.cloneMusic(m))
  }

  async getRecentlyPlayed(limit: number = 20): Promise<Music[]> {
    this.ensureOpen()
    return this.data.music
      .filter(m => m.last_played_at !== undefined)
      .sort((a, b) => (b.last_played_at ?? 0) - (a.last_played_at ?? 0))
      .slice(0, limit)
      .map(m => this.cloneMusic(m))
  }

  async getMusicByArtist(): Promise<{ artist: string, count: number, musics: Music[] }[]> {
    this.ensureOpen()
    const grouped = new Map<string, Music[]>()
    for (const music of [...this.data.music].sort((a, b) => a.artist.localeCompare(b.artist) || b.added_at - a.added_at)) {
      if (!grouped.has(music.artist)) grouped.set(music.artist, [])
      grouped.get(music.artist)!.push(this.cloneMusic(music))
    }
    return Array.from(grouped.entries())
      .map(([artist, musics]) => ({ artist, count: musics.length, musics }))
      .sort((a, b) => b.count - a.count)
  }

  async getMusicByAlbum(): Promise<{ album: string, artist: string, count: number, musics: Music[] }[]> {
    this.ensureOpen()
    const grouped = new Map<string, Music[]>()
    for (const music of [...this.data.music].sort((a, b) => a.album.localeCompare(b.album) || a.artist.localeCompare(b.artist) || b.added_at - a.added_at)) {
      const key = `${music.album}|${music.artist}`
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(this.cloneMusic(music))
    }
    return Array.from(grouped.entries())
      .map(([key, musics]) => {
        const [album, artist] = key.split("|")
        return { album, artist, count: musics.length, musics }
      })
      .sort((a, b) => b.count - a.count)
  }

  async updateMusicDownloadStatus(id: string, isDownloaded: boolean, fileSize?: number): Promise<void> {
    this.ensureOpen()
    const music = this.data.music.find(m => m.id === id)
    if (!music) return
    music.is_downloaded = isDownloaded
    music.file_size = fileSize
    await this.save()
  }

  async updateMusicPlayCount(id: string): Promise<void> {
    this.ensureOpen()
    const music = this.data.music.find(m => m.id === id)
    if (!music) return
    music.play_count = (music.play_count || 0) + 1
    music.last_played_at = Date.now()
    await this.save()
  }

  /** 仅更新「最近播放时间」，不动 play_count。 */
  async touchLastPlayed(id: string): Promise<void> {
    this.ensureOpen()
    const music = this.data.music.find(m => m.id === id)
    if (!music) return
    music.last_played_at = Date.now()
    await this.save()
  }

  /** 播放时补封面专用：只更新 cover_url，不动其余字段。 */
  async updateCoverUrl(id: string, coverUrl: string): Promise<void> {
    this.ensureOpen()
    const music = this.data.music.find(m => m.id === id)
    if (!music) return
    music.cover_url = coverUrl
    await this.save()
  }

  async toggleFavorite(id: string): Promise<boolean> {
    this.ensureOpen()
    const music = this.data.music.find(m => m.id === id)
    if (!music) return false
    music.is_favorite = !music.is_favorite
    await this.save()
    return music.is_favorite
  }

  async deleteMusic(id: string): Promise<void> {
    this.ensureOpen()
    const music = this.data.music.find(m => m.id === id)
    if (music?.is_downloaded) {
      await fileManager.deleteAudio(id)
      await fileManager.deleteCover(id)
      await fileManager.deleteLyrics(id)
    }

    this.data.music = this.data.music.filter(m => m.id !== id)
    this.data.playlist_music = this.data.playlist_music.filter(pm => pm.music_id !== id)
    this.recountPlaylistMusic()
    await this.save()
  }

  // Playlist CRUD
  async createPlaylist(name: string, cover?: string): Promise<string> {
    this.ensureOpen()
    const id = idGen.playlist()
    const now = Date.now()
    this.data.playlist.unshift({ id, name, cover, created_at: now, updated_at: now, music_count: 0 })
    await this.save()
    return id
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    this.ensureOpen()
    const playlist = this.data.playlist.find(p => p.id === id)
    return playlist ? this.clonePlaylist(playlist) : null
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    this.ensureOpen()
    this.recountPlaylistMusic()
    return [...this.data.playlist].sort((a, b) => b.created_at - a.created_at).map(p => this.clonePlaylist(p))
  }

  async addMusicToPlaylist(playlistId: string, musicId: string): Promise<void> {
    this.ensureOpen()
    if (!this.data.music.some(m => m.id === musicId)) {
      throw new Error(`Music not found: ${musicId}`)
    }
    const playlist = this.data.playlist.find(p => p.id === playlistId)
    if (!playlist) throw new Error(`Playlist not found: ${playlistId}`)
    const existing = this.data.playlist_music.some(pm => pm.playlist_id === playlistId && pm.music_id === musicId)
    if (existing) return

    const now = Date.now()
    const positions = this.data.playlist_music.filter(pm => pm.playlist_id === playlistId).map(pm => pm.position)
    const position = positions.length ? Math.max(...positions) + 1 : 0
    this.data.playlist_music.push({ playlist_id: playlistId, music_id: musicId, added_at: now, position })
    playlist.music_count += 1
    playlist.updated_at = now
    await this.save()
  }

  async removeMusicFromPlaylist(playlistId: string, musicId: string): Promise<void> {
    this.ensureOpen()
    const before = this.data.playlist_music.length
    this.data.playlist_music = this.data.playlist_music.filter(pm => !(pm.playlist_id === playlistId && pm.music_id === musicId))
    if (this.data.playlist_music.length !== before) {
      const playlist = this.data.playlist.find(p => p.id === playlistId)
      if (playlist) {
        playlist.music_count = Math.max(0, playlist.music_count - 1)
        playlist.updated_at = Date.now()
      }
      await this.save()
    }
  }

  async getPlaylistMusic(playlistId: string): Promise<Music[]> {
    this.ensureOpen()
    const byId = new Map(this.data.music.map(m => [m.id, m]))
    return this.data.playlist_music
      .filter(pm => pm.playlist_id === playlistId)
      .sort((a, b) => a.position - b.position)
      .map(pm => byId.get(pm.music_id))
      .filter(Boolean)
      .map(m => this.cloneMusic(m as Music))
  }

  async deletePlaylist(id: string): Promise<void> {
    this.ensureOpen()
    this.data.playlist = this.data.playlist.filter(p => p.id !== id)
    this.data.playlist_music = this.data.playlist_music.filter(pm => pm.playlist_id !== id)
    await this.save()
  }

  // Search History
  async addSearchHistory(keyword: string): Promise<void> {
    this.ensureOpen()
    const kw = keyword.trim()
    if (!kw) return
    const id = idGen.search()
    this.data.search_history = this.data.search_history.filter(s => s.keyword !== kw)
    this.data.search_history.unshift({ id, keyword: kw, searched_at: Date.now() })
    this.data.search_history = this.data.search_history.slice(0, 100)
    await this.save()
  }

  async getSearchHistory(limit: number = 20): Promise<SearchHistory[]> {
    this.ensureOpen()
    return [...this.data.search_history]
      .sort((a, b) => b.searched_at - a.searched_at)
      .slice(0, limit)
      .map(s => this.cloneSearchHistory(s))
  }

  async clearSearchHistory(): Promise<void> {
    this.ensureOpen()
    this.data.search_history = []
    await this.save()
  }

  // Download Task
  async createDownloadTask(musicId: string): Promise<string> {
    this.ensureOpen()
    // 一首歌同时最多一条 download_task：先清掉旧行（失败/残留），避免重试时累积僵尸行。
    this.data.download_task = this.data.download_task.filter(t => t.music_id !== musicId)
    const id = idGen.download()
    const now = Date.now()
    this.data.download_task.unshift({ id, music_id: musicId, status: "pending", progress: 0, created_at: now, updated_at: now })
    await this.save()
    return id
  }

  async updateDownloadTask(id: string, status: DownloadTask["status"], progress: number, error?: string): Promise<void> {
    this.ensureOpen()
    const task = this.data.download_task.find(t => t.id === id)
    if (!task) return
    task.status = status
    task.progress = progress
    task.error = error
    task.updated_at = Date.now()
    await this.save()
  }

  async getDownloadTask(id: string): Promise<DownloadTask | null> {
    this.ensureOpen()
    const task = this.data.download_task.find(t => t.id === id)
    return task ? this.cloneDownloadTask(task) : null
  }

  async getAllDownloadTasks(): Promise<DownloadTask[]> {
    this.ensureOpen()
    return [...this.data.download_task].sort((a, b) => b.created_at - a.created_at).map(t => this.cloneDownloadTask(t))
  }

  async deleteDownloadTask(id: string): Promise<void> {
    this.ensureOpen()
    this.data.download_task = this.data.download_task.filter(t => t.id !== id)
    await this.save()
  }

  async updateDownloadTaskSessionId(id: string, sessionId: string): Promise<void> {
    this.ensureOpen()
    const task = this.data.download_task.find(t => t.id === id)
    if (!task) return
    task.session_id = sessionId
    task.updated_at = Date.now()
    await this.save()
  }

  async getDownloadTaskBySessionId(sessionId: string): Promise<DownloadTask | null> {
    this.ensureOpen()
    const task = this.data.download_task.find(t => t.session_id === sessionId)
    return task ? this.cloneDownloadTask(task) : null
  }

  async getDownloadTaskByMusicId(musicId: string): Promise<DownloadTask | null> {
    this.ensureOpen()
    const task = this.data.download_task.find(t => t.music_id === musicId)
    return task ? this.cloneDownloadTask(task) : null
  }

  close(): void {
    this.opened = false
  }
}

export const database = new Database()
