import { defineStore } from 'pinia'
import { getGameMap } from '@/data/maps'
import type { MapBgmConfig } from '@/types/map'

type BgmScene = 'ambient' | 'battle'

const DEFAULT_VOLUME = 0.0
const AMBIENT_TO_BATTLE_FADE_OUT_MS = 100
const AMBIENT_TO_BATTLE_FADE_IN_MS = 100
const BATTLE_TO_AMBIENT_FADE_OUT_MS = 300
const BATTLE_TO_AMBIENT_FADE_IN_MS = 600
const VOLUME_STORAGE_KEY = 'bgm-volume'
const MUTED_STORAGE_KEY = 'bgm-muted'

const INTERACTION_EVENTS: Array<keyof WindowEventMap> = ['pointerdown', 'keydown']

let deferredPlaybackHandler: (() => void) | null = null

function clearDeferredPlaybackHandler() {
  if (typeof window === 'undefined' || !deferredPlaybackHandler) {
    deferredPlaybackHandler = null
    return
  }
  const handler = deferredPlaybackHandler
  INTERACTION_EVENTS.forEach((eventName) => {
    window.removeEventListener(eventName, handler)
  })
  deferredPlaybackHandler = null
}

function deferPlaybackUntilGesture(audio: HTMLAudioElement) {
  if (typeof window === 'undefined') return
  clearDeferredPlaybackHandler()
  const handler = () => {
    audio.play().catch(() => {
      // Ignore play errors during deferred playback attempts.
    })
    clearDeferredPlaybackHandler()
  }
  deferredPlaybackHandler = handler
  INTERACTION_EVENTS.forEach((eventName) => {
    window.addEventListener(eventName, handler)
  })
}

function sanitizeVolume(value: number | null | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return DEFAULT_VOLUME
  return Math.max(0, Math.min(1, value))
}

function loadInitialVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_VOLUME
  try {
    const raw = window.localStorage.getItem(VOLUME_STORAGE_KEY)
    if (!raw) return DEFAULT_VOLUME
    return sanitizeVolume(Number(raw))
  } catch {
    return DEFAULT_VOLUME
  }
}

function pickTrack(config: MapBgmConfig | undefined, scene: BgmScene): string | null {
  if (!config) return null
  if (scene === 'battle') {
    return config.battle ?? config.ambient ?? null
  }
  return config.ambient ?? config.battle ?? null
}

function loadInitialMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(MUTED_STORAGE_KEY)
    return raw === '1'
  } catch {
    return false
  }
}

function getTransitionDurations(previousScene: BgmScene | null, currentScene: BgmScene) {
  if (!previousScene || previousScene === currentScene) return null
  if (previousScene === 'ambient' && currentScene === 'battle') {
    return {
      fadeOut: AMBIENT_TO_BATTLE_FADE_OUT_MS,
      fadeIn: AMBIENT_TO_BATTLE_FADE_IN_MS,
    }
  }
  if (previousScene === 'battle' && currentScene === 'ambient') {
    return {
      fadeOut: BATTLE_TO_AMBIENT_FADE_OUT_MS,
      fadeIn: BATTLE_TO_AMBIENT_FADE_IN_MS,
    }
  }
  return null
}

export const useBgmStore = defineStore('bgm', {
  state: () => ({
    activeMapId: null as string | null,
    scene: 'ambient' as BgmScene,
    currentSrc: null as string | null,
    currentAmbientMapId: null as string | null,
    audioEl: null as HTMLAudioElement | null,
    volume: loadInitialVolume(),
    muted: loadInitialMuted(),
    ambientResume: null as { mapId: string; time: number } | null,
    transitionToken: 0,
  }),
  actions: {
    setActiveMap(mapId: string | null | undefined) {
      const nextId = mapId ?? null
      if (this.activeMapId === nextId) return
      this.activeMapId = nextId
      this.currentAmbientMapId = null
      this.refreshTrack()
    },
    setScene(scene: BgmScene) {
      if (this.scene === scene) return
      const previousScene = this.scene
      this.scene = scene
      this.refreshTrack(previousScene)
    },
    refreshTrack(previousScene: BgmScene | null = null) {
      const map = this.activeMapId ? getGameMap(this.activeMapId) : null
      const nextSrc = pickTrack(map?.bgm, this.scene)
      this.switchToTrack(nextSrc, previousScene)
    },
    ensureAudioElement() {
      if (typeof window === 'undefined' || typeof Audio === 'undefined') {
        return null
      }
      if (this.audioEl) return this.audioEl
      const audio = new Audio()
      audio.loop = true
      audio.volume = this.volume
      audio.muted = this.muted
      this.audioEl = audio
      return audio
    },
    setVolume(value: number) {
      const nextVolume = sanitizeVolume(value)
      this.volume = nextVolume
      const audio = this.ensureAudioElement()
      if (audio && !this.muted) {
        audio.volume = nextVolume
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(VOLUME_STORAGE_KEY, String(nextVolume))
        } catch {
          // Ignore write failures (private mode etc.)
        }
      }
    },
    setMuted(value: boolean) {
      this.muted = value
      const audio = this.ensureAudioElement()
      if (audio) {
        audio.muted = value
        if (!value) {
          audio.volume = this.volume
        }
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(MUTED_STORAGE_KEY, value ? '1' : '0')
        } catch {
          // ignore
        }
      }
    },
    rememberAmbientResume(audio: HTMLAudioElement) {
      if (!this.activeMapId || !this.currentSrc) return
      this.ambientResume = {
        mapId: this.activeMapId,
        time: audio.currentTime,
      }
    },
    async fadeVolume(
      audio: HTMLAudioElement,
      targetVolume: number,
      duration: number,
      token: number,
      startOverride?: number,
    ) {
      const hasAnimationSupport =
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function' &&
        typeof performance !== 'undefined'
      const startVolume = typeof startOverride === 'number' ? startOverride : audio.volume
      if (!hasAnimationSupport || duration <= 0 || startVolume === targetVolume) {
        audio.volume = targetVolume
        return
      }
      await new Promise<void>((resolve) => {
        const startTime = performance.now()
        const step = () => {
          if (token !== this.transitionToken) {
            resolve()
            return
          }
          const elapsed = performance.now() - startTime
          const progress = Math.min(1, elapsed / duration)
          audio.volume = startVolume + (targetVolume - startVolume) * progress
          if (progress >= 1) {
            resolve()
            return
          }
          window.requestAnimationFrame(step)
        }
        window.requestAnimationFrame(step)
      })
    },
    async switchToTrack(src: string | null, previousScene: BgmScene | null = null) {
      const audio = this.ensureAudioElement()
      if (!audio) return
      const transitionId = ++this.transitionToken
      const currentScene = this.scene
      const sceneChanged = Boolean(previousScene && previousScene !== currentScene)
      const transitionDurations = getTransitionDurations(previousScene, currentScene)

      if (previousScene === 'ambient' && currentScene === 'battle') {
        this.rememberAmbientResume(audio)
      }

      if (!src) {
        if (sceneChanged && this.currentSrc && transitionDurations) {
          await this.fadeVolume(audio, 0, transitionDurations.fadeOut, transitionId)
          if (transitionId !== this.transitionToken) return
        }
        audio.pause()
        if (this.currentSrc) {
          audio.currentTime = 0
        }
        this.currentSrc = null
        if (currentScene !== 'ambient') {
          this.currentAmbientMapId = null
        }
        clearDeferredPlaybackHandler()
        return
      }

      const activeMapId = this.activeMapId ?? null
      const shouldRestartForMap = currentScene === 'ambient' && this.currentAmbientMapId !== activeMapId
      const shouldResumeAmbient =
        previousScene === 'battle' &&
        currentScene === 'ambient' &&
        this.ambientResume &&
        this.ambientResume.mapId === activeMapId

      const hasSameTrack = this.currentSrc === src && !shouldRestartForMap

      if (hasSameTrack) {
        if (shouldResumeAmbient) {
          audio.currentTime = this.ambientResume!.time
        }
        if (audio.paused) {
          audio.play().catch(() => {
            deferPlaybackUntilGesture(audio)
          })
        }
        if (sceneChanged && transitionDurations) {
          audio.volume = 0
          await this.fadeVolume(audio, this.volume, transitionDurations.fadeIn, transitionId)
        } else if (!this.muted) {
          audio.volume = this.volume
        }
        return
      }

      if (sceneChanged && this.currentSrc && transitionDurations) {
        await this.fadeVolume(audio, 0, transitionDurations.fadeOut, transitionId)
        if (transitionId !== this.transitionToken) return
      } else {
        audio.pause()
      }

      this.currentSrc = src
      audio.src = src
      audio.currentTime = shouldResumeAmbient ? this.ambientResume!.time : 0
      this.currentAmbientMapId = currentScene === 'ambient' ? activeMapId : null

      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          deferPlaybackUntilGesture(audio)
        })
      }

      if (sceneChanged && transitionDurations) {
        audio.volume = 0
        await this.fadeVolume(audio, this.volume, transitionDurations.fadeIn, transitionId)
      } else if (!this.muted) {
        audio.volume = this.volume
      }
    },
  },
})
