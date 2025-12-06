import { defineStore } from 'pinia'
import type { MapNode, MapNodeSpawnConfig } from '@/types/map'
import type { Monster } from '@/types/domain'
import { generateMonsterInstanceById } from '@/data/monsters'

interface MonsterInstance {
  instanceId: string
  monsterId: string
  monster: Monster
  spawnedAt: number
}

interface PendingRespawn {
  monsterId: string
  respawnAt: number
}

interface NodeSpawnState {
  nodeId: string
  mapId: string
  spawnConfig?: MapNodeSpawnConfig
  instances: MonsterInstance[]
  pendingRespawns: PendingRespawn[]
  nextBatchRefresh: number
}

const DEFAULT_BATCH_INTERVAL = 900 // seconds
const DEFAULT_RESPAWN_DELAY = 60 // seconds

let instanceCounter = 0

function getNow(): number {
  return Date.now()
}

function rollInteger(min: number, max: number) {
  const span = Math.max(0, Math.floor(max) - Math.floor(min))
  return Math.floor(min) + Math.floor(Math.random() * (span + 1))
}

function pickMonsterId(config: MapNodeSpawnConfig): string | null {
  if (!config.monsters.length) return null
  const totalWeight = config.monsters.reduce((sum, entry) => sum + (entry.weight ?? 1), 0)
  if (totalWeight <= 0) return null
  const roll = Math.random() * totalWeight
  let cursor = 0
  for (const entry of config.monsters) {
    cursor += entry.weight ?? 1
    if (roll <= cursor) {
      return entry.id
    }
  }
  return config.monsters[config.monsters.length - 1]?.id ?? null
}

function createInstance(monsterId: string, timestamp: number): MonsterInstance | null {
  instanceCounter += 1
  const monster = generateMonsterInstanceById(monsterId)
  if (!monster) return null
  return {
    instanceId: `${monsterId}-${instanceCounter}`,
    monsterId,
    monster,
    spawnedAt: timestamp,
  }
}

function resolveBatchInterval(config?: MapNodeSpawnConfig): number {
  if (!config?.intervalSeconds) return DEFAULT_BATCH_INTERVAL * 1000
  return Math.max(15, config.intervalSeconds) * 1000
}

function resolveRespawnDelay(config?: MapNodeSpawnConfig): number {
  if (!config?.respawnSeconds) return DEFAULT_RESPAWN_DELAY * 1000
  return Math.max(5, config.respawnSeconds) * 1000
}

export const useNodeSpawnStore = defineStore('node-spawns', {
  state: () => ({
    nodeStates: {} as Record<string, NodeSpawnState>,
    tickHandle: null as number | null,
  }),
  actions: {
    ensureInitialized(mapId: string, node: MapNode | undefined) {
      if (!node) return null
      if (!this.nodeStates[node.id]) {
        this.nodeStates[node.id] = this.createState(mapId, node)
      }
      this.startTicker()
      return this.nodeStates[node.id]
    },
    createState(mapId: string, node: MapNode): NodeSpawnState {
      const now = getNow()
      const state: NodeSpawnState = {
        nodeId: node.id,
        mapId,
        spawnConfig: node.spawn ?? undefined,
        instances: [],
        pendingRespawns: [],
        nextBatchRefresh: Number.POSITIVE_INFINITY,
      }
      if (node.spawn) {
        this.populateBatch(state, now)
      }
      return state
    },
    populateBatch(state: NodeSpawnState, timestamp: number) {
      state.instances = []
      state.pendingRespawns = []
      const config = state.spawnConfig
      if (!config || config.min <= 0 || config.max <= 0) {
        state.nextBatchRefresh = Number.POSITIVE_INFINITY
        return
      }
      const count = rollInteger(config.min, config.max)
      for (let i = 0; i < count; i += 1) {
        const monsterId = pickMonsterId(config)
        if (!monsterId) continue
        const instance = createInstance(monsterId, timestamp)
        if (!instance) continue
        state.instances.push(instance)
      }
      state.nextBatchRefresh = timestamp + resolveBatchInterval(config)
    },
    getNodeInstances(nodeId: string) {
      return this.nodeStates[nodeId]?.instances ?? []
    },
    getPendingRespawnCount(nodeId: string) {
      return this.nodeStates[nodeId]?.pendingRespawns.length ?? 0
    },
    getNextBatchRefresh(nodeId: string) {
      return this.nodeStates[nodeId]?.nextBatchRefresh ?? null
    },
    handleMonsterDefeat(nodeId: string, instanceId: string) {
      const state = this.nodeStates[nodeId]
      if (!state?.spawnConfig) return
      const index = state.instances.findIndex(instance => instance.instanceId === instanceId)
      if (index === -1) return
      const [instance] = state.instances.splice(index, 1)
      if (!instance) return
      const delay = resolveRespawnDelay(state.spawnConfig)
      state.pendingRespawns.push({
        monsterId: instance.monsterId,
        respawnAt: getNow() + delay,
      })
    },
    startTicker() {
      if (typeof window === 'undefined') return
      if (this.tickHandle) return
      this.tickHandle = window.setInterval(() => {
        this.processTimers()
      }, 1000)
    },
    stopTicker() {
      if (this.tickHandle) {
        clearInterval(this.tickHandle)
        this.tickHandle = null
      }
    },
    processTimers() {
      const now = getNow()
      Object.values(this.nodeStates).forEach(state => {
        if (!state.spawnConfig) return
        if (now >= state.nextBatchRefresh) {
          this.populateBatch(state, now)
          return
        }
        const ready: PendingRespawn[] = []
        const pending: PendingRespawn[] = []
        state.pendingRespawns.forEach(entry => {
          if (now >= entry.respawnAt) {
            ready.push(entry)
          } else {
            pending.push(entry)
          }
        })
        state.pendingRespawns = pending
        ready.forEach(entry => {
          const instance = createInstance(entry.monsterId, now)
          if (instance) {
            state.instances.push(instance)
          }
        })
      })
    },
  },
})
