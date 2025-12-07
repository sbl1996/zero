import { defineStore } from 'pinia'
import { watch } from 'vue'
import { QUEST_DEFINITIONS, QUEST_DEFINITION_MAP, QUEST_ITEM_DEFINITIONS } from '@/data/quests'
import { BASE_EQUIPMENT_TEMPLATES, instantiateEquipment } from '@/data/equipment'
import type {
  QuestDefinition,
  QuestObjective,
  QuestObjectiveKill,
  QuestObjectiveKillCollect,
  QuestObjectiveProgress,
  QuestProgressEntry,
  QuestReward,
  QuestRewardEquipmentTemplate,
  QuestRuntimeStatus,
  QuestSaveState,
} from '@/types/domain'
import {
  areQuestObjectivesComplete,
  cloneQuestReward,
  createProgressEntry,
  isQuestAvailable,
  setObjectiveProgress,
} from '@/utils/quest'
import type { QuestPrerequisiteContext } from '@/utils/quest'
import { usePlayerStore } from './player'
import { useInventoryStore } from './inventory'
import { useProgressStore } from './progress'

const QUEST_ITEM_MAP = QUEST_ITEM_DEFINITIONS.reduce(
  (acc, item) => {
    acc[item.id] = item
    return acc
  },
  {} as Record<string, (typeof QUEST_ITEM_DEFINITIONS)[number]>,
)

interface QuestItemDrop {
  questId: string
  objectiveId: string
  itemId: string
  name: string
  quantity: number
}

interface MonsterDefeatContext {
  monsterId: string
  mapId: string | null
  rng: () => number
}

let questEquipmentSequence = 1
const MAX_TRACKED_QUESTS = 4

function instantiateEquipmentFromTemplate(entry: QuestRewardEquipmentTemplate) {
  const template = BASE_EQUIPMENT_TEMPLATES.find(item => item.id === entry.templateId)
  if (!template) return null
  questEquipmentSequence += 1
  const uniqueId = `${template.id}-quest-${Date.now()}-${questEquipmentSequence}`
  return instantiateEquipment(template, {
    level: entry.initialLevel ?? 0,
    id: uniqueId,
  })
}

function resolveRealmTierValue(): number | null {
  const player = usePlayerStore()
  const tier = player.cultivation.realm.tier
  if (typeof tier === 'number') return tier
  if (tier === 'sanctuary') return 10
  return null
}

function collectClearedMonsters(): Set<string> {
  const progress = useProgressStore()
  return new Set(
    Object.entries(progress.data.clearedMonsters)
      .filter(([, cleared]) => !!cleared)
      .map(([monsterId]) => monsterId),
  )
}

function questItemName(itemId: string): string {
  return QUEST_ITEM_MAP[itemId]?.name ?? itemId
}

function isObjectiveOnMap(objective: QuestObjective, mapId: string | null): boolean {
  if ('mapIds' in objective && Array.isArray(objective.mapIds) && objective.mapIds.length > 0) {
    if (!mapId) return false
    return objective.mapIds.includes(mapId)
  }
  return true
}

function includesMonster(objective: QuestObjectiveKill | QuestObjectiveKillCollect, monsterId: string): boolean {
  return objective.monsterIds.includes(monsterId)
}

export const useQuestStore = defineStore('quests', {
  state: () => ({
    definitions: QUEST_DEFINITIONS as QuestDefinition[],
    available: [] as string[],
    active: [] as string[],
    readyToTurnIn: [] as string[],
    completed: [] as string[],
    progressById: {} as Record<string, QuestProgressEntry>,
    questItems: {} as Record<string, number>,
    completionLog: [] as QuestSaveState['completionLog'],
    tracked: [] as string[],
    watchersInitialized: false,
  }),
  getters: {
    definitionMap(): Record<string, QuestDefinition> {
      return QUEST_DEFINITION_MAP
    },
    availableQuests(state): QuestDefinition[] {
      return state.available.map(id => QUEST_DEFINITION_MAP[id]).filter((item): item is QuestDefinition => !!item)
    },
    activeQuests(state): QuestDefinition[] {
      return state.active.map(id => QUEST_DEFINITION_MAP[id]).filter((item): item is QuestDefinition => !!item)
    },
    readyQuests(state): QuestDefinition[] {
      return state.readyToTurnIn.map(id => QUEST_DEFINITION_MAP[id]).filter((item): item is QuestDefinition => !!item)
    },
    completedQuestDefinitions(state): QuestDefinition[] {
      return state.completed.map(id => QUEST_DEFINITION_MAP[id]).filter((item): item is QuestDefinition => !!item)
    },
    questItemsView(state) {
      return Object.entries(state.questItems)
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => ({
          itemId,
          quantity,
          name: questItemName(itemId),
        }))
    },
    completionLogView(state) {
      return state.completionLog.slice()
    },
  },
  actions: {
    hydrate(save?: QuestSaveState) {
      this.available = []
      this.active = []
      this.readyToTurnIn = []
      this.completed = []
      this.progressById = {}
      this.questItems = {}
      this.completionLog = []
      this.tracked = []
      if (save) {
        this.active = [...(save.active ?? [])]
        this.readyToTurnIn = [...(save.readyToTurnIn ?? [])]
        this.completed = [...(save.completed ?? [])]
        if (save.progress) {
          this.progressById = Object.entries(save.progress).reduce(
            (acc, [questId, entry]) => {
              acc[questId] = {
                ...entry,
                objectives: Object.entries(entry.objectives ?? {}).reduce(
                  (objAcc, [objectiveId, progress]) => {
                    objAcc[objectiveId] = { ...progress }
                    return objAcc
                  },
                  {} as Record<string, QuestObjectiveProgress>,
                ),
              }
              return acc
            },
            {} as Record<string, QuestProgressEntry>,
          )
        }
        if (save.questItems) {
          this.questItems = { ...save.questItems }
        }
        if (save.completionLog) {
          this.completionLog = save.completionLog.map(entry => ({
            questId: entry.questId,
            lastSubmittedAt: entry.lastSubmittedAt,
            repeatCount: entry.repeatCount,
            lastRewards: cloneQuestReward(entry.lastRewards),
          }))
        }
        this.tracked = [...(save.tracked ?? [])]
      }
      this.pruneTracked()
      this.refreshAvailability()
    },
    getStatus(questId: string): QuestRuntimeStatus {
      if (this.active.includes(questId)) return 'active'
      if (this.readyToTurnIn.includes(questId)) return 'readyToTurnIn'
      if (this.available.includes(questId)) return 'available'
      if (this.completed.includes(questId)) return 'completed'
      return 'locked'
    },
    progressOf(questId: string): QuestProgressEntry | null {
      if (!this.active.includes(questId) && !this.readyToTurnIn.includes(questId)) {
        return null
      }
      return this.progressById[questId] ?? null
    },
    serialize(): QuestSaveState {
      return {
        active: [...this.active],
        readyToTurnIn: [...this.readyToTurnIn],
        completed: [...this.completed],
        tracked: [...this.tracked],
        questItems: { ...this.questItems },
        completionLog: this.completionLog.map(entry => ({
          questId: entry.questId,
          lastSubmittedAt: entry.lastSubmittedAt,
          repeatCount: entry.repeatCount,
          lastRewards: cloneQuestReward(entry.lastRewards),
        })),
        progress: Object.entries(this.progressById).reduce(
          (acc, [questId, entry]) => {
            acc[questId] = {
              questId: entry.questId,
              status: entry.status,
              acceptedAt: entry.acceptedAt,
              completedAt: entry.completedAt,
              objectives: Object.entries(entry.objectives).reduce(
                (objAcc, [objectiveId, progress]) => {
                  objAcc[objectiveId] = { ...progress }
                  return objAcc
                },
                {} as Record<string, QuestObjectiveProgress>,
              ),
            }
            return acc
          },
          {} as Record<string, QuestProgressEntry>,
        ),
      }
    },
    isTracked(questId: string) {
      return this.tracked.includes(questId)
    },
    canTrack(questId: string) {
      const status = this.getStatus(questId)
      return status === 'active' || status === 'readyToTurnIn'
    },
    pruneTracked() {
      const seen = new Set<string>()
      const filtered = this.tracked.filter((questId) => {
        if (!this.canTrack(questId)) return false
        if (seen.has(questId)) return false
        seen.add(questId)
        return true
      })
      this.tracked = filtered.slice(0, MAX_TRACKED_QUESTS)
    },
    track(questId: string) {
      if (!this.canTrack(questId)) {
        this.untrack(questId)
        return false
      }
      const next = [questId, ...this.tracked.filter(id => id !== questId)]
      this.tracked = next.slice(0, MAX_TRACKED_QUESTS)
      return true
    },
    untrack(questId: string) {
      const before = this.tracked.length
      this.tracked = this.tracked.filter(id => id !== questId)
      return this.tracked.length !== before
    },
    toggleTrack(questId: string, nextState?: boolean) {
      const shouldTrack = typeof nextState === 'boolean' ? nextState : !this.isTracked(questId)
      return shouldTrack ? this.track(questId) : this.untrack(questId)
    },
    initWatchers() {
      if (this.watchersInitialized) return
      this.watchersInitialized = true
      const player = usePlayerStore()
      const progress = useProgressStore()
      watch(
        () => player.cultivation.realm.tier,
        () => {
          this.refreshAvailability()
        },
        { deep: true },
      )
      watch(
        () => progress.data.clearedMonsters,
        () => {
          this.refreshAvailability()
        },
        { deep: true },
      )
      watch(
        () => [...this.completed],
        () => {
          this.refreshAvailability()
        },
      )
    },
    refreshAvailability() {
      const realmTier = resolveRealmTierValue()
      const completedQuestIds = new Set(this.completed)
      const clearedMonsters = collectClearedMonsters()
      const context: QuestPrerequisiteContext = {
        realmTier,
        completedQuestIds,
        clearedMonsterIds: clearedMonsters,
      }

      const nextAvailable: string[] = []
      this.definitions.forEach((definition) => {
        const id = definition.id
        if (this.completed.includes(id) && !definition.repeatable) return
        if (this.readyToTurnIn.includes(id)) return
        if (this.active.includes(id)) return
        if (isQuestAvailable(definition, context)) {
          nextAvailable.push(id)
        }
      })
      this.available = nextAvailable
      this.pruneTracked()
    },
    accept(questId: string) {
      if (this.active.includes(questId) || this.readyToTurnIn.includes(questId)) return false
      const definition = this.definitionMap[questId]
      if (!definition) return false
      if (!definition.repeatable && this.completed.includes(questId)) return false
      if (!this.available.includes(questId)) return false
      const acceptedAt = Date.now()
      const progress = createProgressEntry(definition, acceptedAt)
      this.progressById[questId] = progress
      this.active.push(questId)
      this.available = this.available.filter(id => id !== questId)
      this.refreshAvailability()
      return true
    },
    abandon(questId: string) {
      const definition = this.definitionMap[questId]
      if (!definition) return false
      if (definition.allowAbandon === false) return false
      const isActive = this.active.includes(questId)
      const isReady = this.readyToTurnIn.includes(questId)
      if (!isActive && !isReady) return false
      if (isReady) {
        this.readyToTurnIn = this.readyToTurnIn.filter(id => id !== questId)
      }
      if (isActive) {
        this.active = this.active.filter(id => id !== questId)
      }
      const progress = this.progressById[questId]
      if (progress) {
        definition.objectives.forEach((objective) => {
          if ('itemId' in objective) {
            const amount = progress.objectives[objective.id]?.current ?? 0
            if (amount > 0) {
              const current = this.questItems[objective.itemId] ?? 0
              const next = Math.max(0, current - amount)
              if (next > 0) {
                this.questItems[objective.itemId] = next
              } else {
                delete this.questItems[objective.itemId]
              }
            }
          }
        })
      }
      delete this.progressById[questId]
      this.untrack(questId)
      this.refreshAvailability()
      return true
    },
    handleMonsterDefeat(monster: MonsterDefeatContext['monsterId'], context: Omit<MonsterDefeatContext, 'monsterId'>) {
      const monsterId = monster
      const { rng, mapId } = context
      const questDrops: QuestItemDrop[] = []
      const prepared: string[] = []
      const timestamp = Date.now()

      this.active.slice().forEach((questId) => {
        const definition = this.definitionMap[questId]
        if (!definition) return
        const progress = this.progressById[questId]
        if (!progress) return
        let updated = false

        definition.objectives.forEach((objective) => {
          if (!isObjectiveOnMap(objective, mapId)) return
          if (objective.type === 'kill') {
            if (!includesMonster(objective, monsterId)) return
            const current = progress.objectives[objective.id]
            if (!current) return
            const nextValue = Math.min(objective.amount, current.current + 1)
            if (nextValue !== current.current) {
              progress.objectives[objective.id] = setObjectiveProgress(current, nextValue, objective.amount)
              updated = true
            }
          } else if (objective.type === 'killCollect') {
            if (!includesMonster(objective, monsterId)) return
            const current = progress.objectives[objective.id]
            if (!current) return
            if (current.completed) return
            const remaining = objective.amount - current.current
            if (remaining <= 0) return
            const roll = rng()
            if (roll <= objective.dropRate) {
              const gained = Math.min(objective.maxPerKill ?? 1, remaining)
              const nextValue = current.current + gained
              progress.objectives[objective.id] = setObjectiveProgress(current, nextValue, objective.amount)
              this.questItems[objective.itemId] = (this.questItems[objective.itemId] ?? 0) + gained
              questDrops.push({
                questId,
                objectiveId: objective.id,
                itemId: objective.itemId,
                name: questItemName(objective.itemId),
                quantity: gained,
              })
              updated = true
            }
          }
        })

        if (updated && areQuestObjectivesComplete(progress)) {
          this.active = this.active.filter(id => id !== questId)
          if (!this.readyToTurnIn.includes(questId)) {
            this.readyToTurnIn.push(questId)
          }
          progress.status = 'readyToTurnIn'
          progress.completedAt = timestamp
          prepared.push(questId)
        }
      })

      if (prepared.length > 0) {
        this.refreshAvailability()
      }

      return { drops: questDrops, prepared }
    },
    submit(questId: string): QuestReward | null {
      if (!this.readyToTurnIn.includes(questId)) return null
      const definition = this.definitionMap[questId]
      if (!definition) return null
      const progress = this.progressById[questId]
      if (!progress) return null
      if (!areQuestObjectivesComplete(progress)) return null

      const timestamp = Date.now()
      const rewardsSnapshot = this.applyRewards(definition)
      this.readyToTurnIn = this.readyToTurnIn.filter(id => id !== questId)
      if (!this.completed.includes(questId)) {
        this.completed.push(questId)
      }
      this.untrack(questId)
      progress.status = 'completed'
      progress.completedAt = progress.completedAt ?? timestamp
      const existingIndex = this.completionLog.findIndex(entry => entry.questId === questId)
      const rewardsRecord = cloneQuestReward(rewardsSnapshot)
      if (existingIndex >= 0) {
        const existing = this.completionLog[existingIndex]!
        const updated = {
          questId,
          lastSubmittedAt: timestamp,
          repeatCount: existing.repeatCount + 1,
          lastRewards: rewardsRecord,
        }
        this.completionLog.splice(existingIndex, 1)
        this.completionLog.unshift(updated)
      } else {
        this.completionLog.unshift({
          questId,
          lastSubmittedAt: timestamp,
          repeatCount: 1,
          lastRewards: rewardsRecord,
        })
      }
      this.refreshAvailability()
      return rewardsSnapshot
    },
    applyRewards(definition: QuestDefinition): QuestReward {
      const rewardClone = cloneQuestReward(definition.rewards)
      const player = usePlayerStore()
      const inventory = useInventoryStore()
      if (rewardClone.gold && rewardClone.gold > 0) {
        player.gainGold(rewardClone.gold)
      }
      if (rewardClone.items) {
        rewardClone.items.forEach(item => {
          if (item.quantity > 0) {
            inventory.addItem(item.itemId, item.quantity)
          }
        })
      }
      if (rewardClone.equipmentTemplates) {
        rewardClone.equipmentTemplates.forEach(entry => {
          const equipment = instantiateEquipmentFromTemplate(entry)
          if (equipment) {
            inventory.addEquipment(equipment, { markNew: true })
          }
        })
      }
      if (rewardClone.skillUnlocks) {
        rewardClone.skillUnlocks.forEach(skillId => {
          usePlayerStore().unlockSkill(skillId)
        })
      }

      definition.objectives.forEach((objective) => {
        if ('itemId' in objective) {
          const required = objective.amount
          const current = this.questItems[objective.itemId] ?? 0
          const next = Math.max(0, current - required)
          if (next > 0) {
            this.questItems[objective.itemId] = next
          } else {
            delete this.questItems[objective.itemId]
          }
        }
      })

      return rewardClone
    },
  },
})
