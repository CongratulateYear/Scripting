import { createContext, useObservable, useEffect, useContext } from "scripting"
import { player, PlayerState, PlayMode } from "./player"
import { Music } from "./database"

type PlayerStateData = {
  state: PlayerState
  currentMusic: Music | null
  queue: Music[]
  isPlaying: boolean
  isLoading: boolean
  playMode: PlayMode
  currentIndex: number
}

type PlayerProgressData = {
  currentTime: number
  duration: number
}

function snapshotState(): PlayerStateData {
  const s = player.getState()
  return {
    state: s,
    currentMusic: player.getCurrentMusic(),
    queue: player.getQueue(),
    isPlaying: s === "playing",
    isLoading: s === "loading",
    playMode: player.getPlayMode(),
    currentIndex: player.getCurrentIndex()
  }
}

const initialState: PlayerStateData = {
  state: "idle",
  currentMusic: null,
  queue: [],
  isPlaying: false,
  isLoading: false,
  playMode: "sequential",
  currentIndex: -1
}

const initialProgress: PlayerProgressData = {
  currentTime: 0,
  duration: 0
}

const PlayerStateContext = createContext<PlayerStateData>()
const PlayerProgressContext = createContext<PlayerProgressData>()

export function PlayerStateProvider({ children }: { children: JSX.Element }) {
  const state = useObservable<PlayerStateData>(initialState)

  useEffect(() => {
    state.setValue(snapshotState())

    const updateSnapshot = () => state.setValue(snapshotState())

    const unsubscribe = player.on({
      onStateChange: updateSnapshot,
      onMusicChange: updateSnapshot,
      onQueueChange: updateSnapshot,
      onPlayModeChange: updateSnapshot
    })

    return unsubscribe
  }, [])

  return (
    <PlayerStateContext.Provider value={state.value}>
      {children}
    </PlayerStateContext.Provider>
  )
}

export function PlayerProgressProvider({ children }: { children: JSX.Element }) {
  const progress = useObservable<PlayerProgressData>(initialProgress)

  useEffect(() => {
    const unsubscribe = player.on({
      onMusicChange: (music) => {
        progress.setValue({
          currentTime: 0,
          duration: music?.duration ?? 0
        })
      },
      onProgressChange: (current, dur) => {
        const validDuration = isFinite(dur) && dur > 0 ? dur : progress.value.duration
        progress.setValue({ currentTime: current, duration: validDuration })
      }
    })
    return unsubscribe
  }, [])

  return (
    <PlayerProgressContext.Provider value={progress.value}>
      {children}
    </PlayerProgressContext.Provider>
  )
}

export function usePlayerState(): PlayerStateData {
  return useContext(PlayerStateContext)
}

export function usePlayerProgress(): PlayerProgressData {
  return useContext(PlayerProgressContext)
}
