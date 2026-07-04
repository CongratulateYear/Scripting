import {
  useEffect,
  useMemo,
  useState,
  List,
  Section,
  Text,
  HStack,
  VStack,
  Image,
  Button,
  Spacer,
  Picker,
  Group,
  Label,
  ProgressView,
} from "scripting"
import { Music, database } from "../../class/database"
import { music } from "../../class/music"
import { player } from "../../class/player"
import { fileManager } from "../../class/file_manager"
import { SongRow } from "../components/song_row"
import { ArtistResultsSection, AlbumResultsSection, ItunesSongResultsSection } from "./components/entity_results"
import { itunesBrowse, ItunesArtist, ItunesAlbum, ItunesTrack } from "../../class/sources/itunes_browse"
import { SearchPlaceholder } from "./components/search_placeholder"
import { addToHistory, getHistory, clearHistory } from "./components/search_history"
import { usePlayerState } from "../../class/player_state"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { downloadCenter } from "../../class/download_center"
import { LRUCache } from "../../class/lru_cache"
import type { MusicData } from "../../class/music"

type CacheEntry = { data: ItunesTrack[], timestamp: number }
type SearchMode = "online" | "artist" | "album" | "local"

const searchCache = new LRUCache<string, CacheEntry>(50)
const CACHE_DURATION = 5 * 60 * 1000

export function SearchView() {
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<SearchMode>("online")
  const [results, setResults] = useState<ItunesTrack[] | null>(null)
  const [lxResults, setLxResults] = useState<MusicData[] | null>(null)
  const [localResults, setLocalResults] = useState<Music[] | null>(null)
  const [artistResults, setArtistResults] = useState<ItunesArtist[] | null>(null)
  const [albumResults, setAlbumResults] = useState<ItunesAlbum[] | null>(null)
  const [localCoverExists, setLocalCoverExists] = useState<Record<string, boolean>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const playerState = usePlayerState()

  const history = useMemo(() => getHistory(), [historyVersion])

  useEffect(() => {
    const trimmed = inputValue.trim()
    if (trimmed && history.includes(trimmed) && trimmed !== query) {
      doSearch(trimmed)
    }
  }, [inputValue])

  // Re-run search when mode changes (if there's an active query)
  useEffect(() => {
    if (query) doSearch(query)
  }, [mode])

    async function doSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setQuery(trimmed)
    addToHistory(trimmed)
    setHistoryVersion(v => v + 1)

    if (mode === "local") {
      await doLocalSearch(trimmed)
    } else if (mode === "artist") {
      await doArtistSearch(trimmed)
    } else if (mode === "album") {
      await doAlbumSearch(trimmed)
    } else {
      await doOnlineSearch(trimmed)
    }
  }

  async function doArtistSearch(q: string) {
    setIsSearching(true)
    setArtistResults(null)
    setError(null)
    try {
      setArtistResults(await itunesBrowse.searchArtists(q))
    } catch {
      setError("搜索失败，请检查网络连接后重试")
      setArtistResults([])
    } finally {
      setIsSearching(false)
    }
  }

  async function doAlbumSearch(q: string) {
    setIsSearching(true)
    setAlbumResults(null)
    setError(null)
    try {
      setAlbumResults(await itunesBrowse.searchAlbums(q))
    } catch {
      setError("搜索失败，请检查网络连接后重试")
      setAlbumResults([])
    } finally {
      setIsSearching(false)
    }
  }

  async function doLocalSearch(q: string) {
    setIsSearching(true)
    setLocalResults(null)
    setError(null)
    try {
      const all = await database.getAllMusic()
      const lower = q.toLowerCase()
      const filtered = all.filter(m =>
        m.title.toLowerCase().includes(lower) ||
        m.artist.toLowerCase().includes(lower) ||
        m.album.toLowerCase().includes(lower)
      )
      setLocalResults(filtered)
      const exists: Record<string, boolean> = {}
      await Promise.all(filtered.map(async m => { exists[m.id] = await fileManager.coverExists(m.id) }))
      setLocalCoverExists(exists)
    } catch {
      setError("搜索失败")
      setLocalResults([])
    } finally {
      setIsSearching(false)
    }
  }

  async function doOnlineSearch(q: string) {
    const cacheKey = q
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setResults(cached.data)
      setError(null)
      return
    }
    setIsSearching(true)
    setResults(null)
    setLxResults(null)
    setError(null)
    try {
      // 并行搜索：LX Music（优先）+ iTunes
      const [lxItems, itunesItems] = await Promise.all([
        music.search(q).then(r => r.items).catch(() => [] as MusicData[]),
        itunesBrowse.searchSongs(q).catch(() => [] as ItunesTrack[]),
      ])
      setLxResults(lxItems)
      setResults(itunesItems)
      searchCache.set(cacheKey, { data: itunesItems, timestamp: Date.now() })
    } catch {
      setError("搜索失败，请检查网络连接后重试")
      setResults([])
      setLxResults([])
    } finally {
      setIsSearching(false)
    }
  }

  async function addToPlaylist(playlistId: string) {
    if (!selectedMusic) return
    try {
      const existing = await database.getMusic(selectedMusic.id)
      if (!existing) {
        await database.addMusic({
          id: selectedMusic.id,
          title: selectedMusic.title,
          artist: selectedMusic.artist || "未知艺术家",
          album: selectedMusic.album || "未知专辑",
          duration: selectedMusic.duration || 0,
          cover_url: selectedMusic.cover_url ?? "",
          audio_url: selectedMusic.audio_url || "",
          provider: selectedMusic.provider,
          source_id: selectedMusic.source_id,
          is_downloaded: false,
          added_at: Date.now(),
        })
      }
      await database.addMusicToPlaylist(playlistId, selectedMusic.id)
      setShowPlaylistPicker(false)
      setSelectedMusic(null)
      await Dialog.alert({ title: "已添加", message: "歌曲已添加到播放列表" })
    } catch (e) {
      console.error(e)
    }
  }

  async function deleteLocalMusic(m: Music) {
    try {
      await database.deleteMusic(m.id)
      setLocalResults(prev => prev ? prev.filter(x => x.id !== m.id) : prev)
    } catch (e) {
      console.error(e)
    }
  }

  async function playLocal(m: Music, list: Music[]) {
    const idx = list.indexOf(m)
    player.setQueue(list, idx)
    await player.play(m)
  }

  const dismissPlaylistPicker = () => { setShowPlaylistPicker(false); setSelectedMusic(null) }

  // LX Music 结果 → 播放（直接走 LX Music 源解析）
  async function playLxMusic(info: MusicData) {
    const musicData: Music = {
      id: info.id,
      title: info.title,
      artist: info.artist || "未知艺术家",
      album: info.album || "未知专辑",
      duration: info.duration || 0,
      cover_url: info.cover || "",
      audio_url: "",
      provider: info.provider || "lxmusic",
      source_id: info.id,
      is_downloaded: false,
      added_at: Date.now(),
      play_count: 0,
      is_favorite: false
    }
    await player.playNext(musicData)
  }

  // LX Music 结果 → 下载
  async function downloadLxMusic(info: MusicData) {
    await downloadCenter.enqueue({
      id: info.id,
      provider: info.provider || "lxmusic",
      title: info.title,
      artist: info.artist || "未知艺术家",
      album: info.album || "未知专辑",
      duration: info.duration || 0,
      cover: info.cover || "",
      source_id: info.id,
    })
  }

  const hasOnlineResults = results !== null && results.length > 0
  const hasLxResults = lxResults !== null && lxResults.length > 0
  const hasLocalResults = localResults !== null && localResults.length > 0
  const hasArtistResults = artistResults !== null && artistResults.length > 0
  const hasAlbumResults = albumResults !== null && albumResults.length > 0
  const showEmpty = mode === "online"
    ? (results !== null && results.length === 0 && lxResults !== null && lxResults.length === 0)
    : mode === "local"
      ? (localResults !== null && localResults.length === 0)
      : mode === "artist"
        ? (artistResults !== null && artistResults.length === 0)
        : (albumResults !== null && albumResults.length === 0)

  const currentPlayStatus = (id: string): "idle" | "loading" | "playing" => {
    if (playerState.currentMusic?.id !== id) return "idle"
    if (playerState.state === "loading") return "loading"
    if (playerState.state === "playing") return "playing"
    return "idle"
  }

  return (
    <List
      sheet={{
        isPresented: showPlaylistPicker,
        onChanged: (v: boolean) => { if (!v) dismissPlaylistPicker() },
        content: <PlaylistPickerContent onSelect={addToPlaylist} onDismiss={dismissPlaylistPicker} />
      }}
      searchable={{
        value: inputValue,
        onChanged: setInputValue,
        placement: "navigationBarDrawer",
        prompt: mode === "online" ? "搜索歌曲（在线）"
          : mode === "artist" ? "搜索艺人（在线）"
          : mode === "album" ? "搜索专辑（在线）"
          : "搜索本地歌曲"
      }}
      searchSuggestions={
        <>
          {!inputValue.trim() && history.map((h, i) => (
            <Text key={i} searchCompletion={h}>{`🕐 ${h}`}</Text>
          ))}
        </>
      }
      onSubmit={{
        triggers: "search",
        action: () => doSearch(inputValue)
      }}
      submitLabel="search">
      <Section>
        <Picker
                  label={<Text>搜索模式</Text>}
                  value={mode}
                  onChanged={(v: string) => setMode(v as SearchMode)}
                  pickerStyle="segmented"
                >
          <Text tag="online">歌曲</Text>
          <Text tag="artist">艺人</Text>
          <Text tag="album">专辑</Text>
          <Text tag="local">本地</Text>
        </Picker>
      </Section>

      {isSearching ? (
        <SearchPlaceholder kind="searching" />
      ) : error ? (
        <SearchPlaceholder kind="error" errorMessage={error} />
      ) : showEmpty ? (
        <SearchPlaceholder kind="empty" />
      ) : mode === "online" && (hasLxResults || hasOnlineResults) ? (
        <>
          {hasLxResults ? (
            <Section header={<Text>{"LX Music 搜索结果"}</Text>}>
            {lxResults!.map(info => (
              <LxMusicResultRow
                key={info.id}
                info={info}
                playStatus={currentPlayStatus(info.id)}
                onTap={() => playLxMusic(info)}
                onDownload={() => downloadLxMusic(info)}
                onAddToPlaylist={() => {
                  const m: Music = {
                    id: info.id,
                    title: info.title,
                    artist: info.artist || "未知艺术家",
                    album: info.album || "未知专辑",
                    duration: info.duration || 0,
                    cover_url: info.cover || "",
                    audio_url: "",
                    provider: info.provider || "lxmusic",
                    source_id: info.id,
                    is_downloaded: false,
                    added_at: Date.now(),
                    play_count: 0,
                    is_favorite: false
                  }
                  setSelectedMusic(m); setShowPlaylistPicker(true)
                }}
              />
            ))}
          </Section>
        ) : null}
        {hasOnlineResults ? (
          <Section header={<Text>{"其他来源"}</Text>}>
              <ItunesSongResultsSection
                tracks={results!}
                query={query}
                currentMusic={playerState.currentMusic}
                onAddToPlaylist={(m) => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
              />
            </Section>
          ) : null}
        </>
      ) : mode === "local" && hasLocalResults ? (
        <Section header={<Text>{`"${query}" 的本地结果`}</Text>}>
          {localResults!.map(m => (
            <SongRow
              itemId={m.id}
              music={m}
              queue={localResults!}
              coverExists={localCoverExists}
              onToggleFavorite={async (mm) => {
                await database.toggleFavorite(mm.id)
                setLocalResults(prev => prev ? prev.map(x => x.id === mm.id ? { ...x, is_favorite: !x.is_favorite } : x) : prev)
              }}
              onDelete={deleteLocalMusic}
              onAddToPlaylist={(mm) => { setSelectedMusic(mm); setShowPlaylistPicker(true) }}
            />
          ))}
        </Section>
      ) : mode === "artist" && hasArtistResults ? (
        <ArtistResultsSection artists={artistResults!} query={query} />
      ) : mode === "album" && hasAlbumResults ? (
        <AlbumResultsSection albums={albumResults!} query={query} />
      ) : (
        history.length > 0 ? (
          <Section
            header={
              <HStack>
                <Text>最近搜索</Text>
                <Spacer />
                <Button title="清除" action={() => { clearHistory(); setHistoryVersion(v => v + 1) }} />
              </HStack>
            }
          >
            {history.map((h, i) => (
              <Button key={i} action={() => doSearch(h)}>
                <HStack>
                  <Text>{h}</Text>
                  <Spacer />
                  <Image systemName="arrow.up.left" foregroundStyle="tertiaryLabel" />
                </HStack>
              </Button>
            ))}
          </Section>
        ) : null
      )}
    </List>
  )
}

// ---- LX Music 搜索结果行 ----
function LxMusicResultRow({
  info,
  playStatus,
  onTap,
  onDownload,
  onAddToPlaylist,
}: {
  info: MusicData
  playStatus: "idle" | "loading" | "playing"
  onTap: () => void
  onDownload: () => void
  onAddToPlaylist: () => void
}) {
  const [coverError, setCoverError] = useState(false)
  const isActive = playStatus === "loading" || playStatus === "playing"
  return (
    <HStack
      spacing={12}
      onTapGesture={onTap}
      contextMenu={{
        menuItems: (
          <Group>
            <Button title="播放" systemImage="play.fill" action={onTap} />
            <Button title="下载" systemImage="arrow.down.circle" action={onDownload} />
            <Button title="添加到播放列表" systemImage="music.note.list" action={onAddToPlaylist} />
          </Group>
        ),
      }}
      trailingSwipeActions={{
        actions: [
          <Button tint="systemBlue" action={onDownload}>
            <Label title="下载" systemImage="arrow.down.circle.fill" />
          </Button>,
        ],
      }}
    >
      {info.cover && !coverError ? (
        <Image imageUrl={info.cover} resizable={true} scaleToFill={true} frame={{ width: 56, height: 56 }} clipShape={{ type: "rect", cornerRadius: 8 }} onError={() => setCoverError(true)} placeholder={<Image systemName="music.note" frame={{ width: 56, height: 56 }} />} />
      ) : (
        <Image systemName="music.note" font="title3" foregroundStyle="secondaryLabel" frame={{ width: 56, height: 56 }} background="secondarySystemBackground" clipShape={{ type: "rect", cornerRadius: 8 }} />
      )}
      <VStack alignment="leading" spacing={2}>
        <Text font="headline" lineLimit={1} foregroundStyle={isActive ? "systemPink" : "label"}>{info.title}</Text>
        <HStack spacing={4}>
          <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>{info.artist || "未知艺术家"}</Text>
          <Text font="caption2" foregroundStyle="systemPink" fontWeight="medium">LX Music</Text>
        </HStack>
      </VStack>
      <Spacer />
      {playStatus === "loading" ? (
        <ProgressView controlSize="small" />
      ) : playStatus === "playing" ? (
        <Image systemName="waveform" font="body" foregroundStyle="systemPink" />
      ) : (
        <Image systemName="play.circle" font="title3" foregroundStyle="tertiaryLabel" />
      )}
    </HStack>
  )
}
