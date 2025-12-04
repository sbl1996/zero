<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import type { CultivationEnvironment } from '@/composables/useLeveling'
import { useBattleStore } from '@/stores/battle'
import { usePlayerStore } from '@/stores/player'

const battle = useBattleStore()
const player = usePlayerStore()

let tickTimer: ReturnType<typeof setInterval> | null = null
let lastTickTs: number | null = null

function nowMs() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
}

function resolveEnvironment(): CultivationEnvironment {
  return player.res.recovery.mode === 'meditate' ? 'meditation' : 'idle'
}

function startTicker() {
  stopTicker()
  lastTickTs = nowMs()
  tickTimer = setInterval(() => {
    const now = nowMs()
    const delta = Math.min(Math.max(((now - (lastTickTs || now)) / 1000), 0), 0.25)
    lastTickTs = now
    if (!player.hasCharacter || battle.inBattle || delta <= 0) return
    const environment = resolveEnvironment()
    player.tickCultivation(delta, { environment, inBattle: false, bossBattle: false })
  }, 200)
}

function stopTicker() {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
  lastTickTs = null
}

onMounted(startTicker)
onBeforeUnmount(stopTicker)
</script>

<template />
