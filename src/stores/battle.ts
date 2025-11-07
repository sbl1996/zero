import { defineStore } from 'pinia'
import { dmgAttack, getDefRefForRealm, resolveWeaknessDamage } from '@/composables/useDamage'
import { CULTIVATION_ACTION_WEIGHTS, DEFAULT_WARMUP_SECONDS } from '@/composables/useLeveling'
import { resolveSkillAftercast, resolveSkillChargeTime, resolveSkillCooldown, resolveQiCost } from '@/composables/useSkills'
import { makeRng, randRange } from '@/composables/useRng'
import { bossUnlockMap } from '@/data/monsters'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { ITEMS } from '@/data/items'
import { getDropEntries, rollDropCount, weightedPick } from '@/data/drops'
import type { EquipmentTier } from '@/data/drops'
import { getSkillDefinition } from '@/data/skills'
import { resolveMonsterSkillProfile, resolveMonsterSkillSelector } from '@/data/monsterSkills'
import { MAX_EQUIP_LEVEL } from '@/composables/useEnhance'
import { realmTierContentLevel } from '@/utils/realm'
import type { NumericRealmTier } from '@/utils/realm'
import { useInventoryStore } from './inventory'
import { usePlayerStore } from './player'
import { useProgressStore } from './progress'
import { useUiStore } from './ui'
import { useQuestStore } from './quests'
import { DODGE_WINDOW_MS } from '@/constants/dodge'
import type { CultivationEnvironment } from '@/composables/useLeveling'
import type {
  BattleState,
  Monster,
  FlashEffectKind,
  Equipment,
  EquipSlot,
  LootResult,
  ItemLootResult,
  QiOperationState,
  SkillDefinition,
  MonsterSkillDefinition,
  MonsterSkillHit,
  MonsterSkillProfile,
  FloatText,
  PendingItemUseState,
  SkillChargeState,
} from '@/types/domain'

const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]))

type CultivationActionKey = keyof typeof CULTIVATION_ACTION_WEIGHTS

interface CultivationFrameMetrics {
  qiSpent: number
  extraQiRestored: number
  actions: Partial<Record<CultivationActionKey, number>>
}

function createEmptyCultivationMetrics(): CultivationFrameMetrics {
  return {
    qiSpent: 0,
    extraQiRestored: 0,
    actions: {},
  }
}

const TICK_INTERVAL_MS = 1000 / 20
const MAX_FRAME_TIME = 0.25
const FALLBACK_SKILL_COOLDOWN = 2
export const ITEM_COOLDOWN = 10
const SKILL_SLOT_COUNT = 4
const MAX_MONSTER_ACTIONS_PER_TICK = 4
const AUTO_REMATCH_BASE_DELAY = 800
const AUTO_REMATCH_MIN_INTERVAL = 5000
const DODGE_SKILL_ID = 'qi_dodge'
const DODGE_REFUND_PERCENT = 0.04
const DEFAULT_ITEM_USE_DURATION_MS = 1000

const EQUIPMENT_TIER_REALM: Record<EquipmentTier, NumericRealmTier> = {
  iron: 1,
  steel: 2,
  knight: 3,
  mithril: 4,
  rune: 5,
  dragon: 6,
  celestial: 7,
}

type EquipmentTemplateDef = (typeof BASE_EQUIPMENT_TEMPLATES)[number]
type TierSlotTemplates = Partial<Record<EquipSlot, EquipmentTemplateDef[]>>

const EQUIPMENT_TEMPLATES_BY_TIER: Record<EquipmentTier, TierSlotTemplates> = Object.entries(EQUIPMENT_TIER_REALM).reduce(
  (acc, [tier, requiredRealmTier]) => {
    const tierTemplates = BASE_EQUIPMENT_TEMPLATES.filter((template) => template.requiredRealmTier === requiredRealmTier)
    const grouped: TierSlotTemplates = {}
    for (const template of tierTemplates) {
      const slot = template.slot
      if (!grouped[slot]) grouped[slot] = []
      grouped[slot]!.push(template)
    }
    acc[tier as EquipmentTier] = grouped
    return acc
  },
  {} as Record<EquipmentTier, TierSlotTemplates>,
)

let lootSequence = 1

function makeEquipmentId(templateId: string) {
  const seq = lootSequence++
  return `${templateId}-drop-${Date.now()}-${seq}`
}

function createEquipmentFromTemplate(
  template: (typeof BASE_EQUIPMENT_TEMPLATES)[number],
  initialLevel = 0,
): Equipment {
  return {
    id: makeEquipmentId(template.id),
    name: template.name,
    slot: template.slot,
    level: initialLevel,
    mainStat: { ...template.baseMain },
    subs: { ...template.baseSubs },
    exclusive: template.exclusive,
    flatCapMultiplier: template.flatCapMultiplier,
    requiredRealmTier: template.requiredRealmTier,
  }
}

interface DrawEquipmentOptions {
  initialLevelRange?: [number, number]
}

function drawEquipmentFromTier(
  tier: EquipmentTier,
  rng: () => number,
  options?: DrawEquipmentOptions,
): Equipment | null {
  const grouped = EQUIPMENT_TEMPLATES_BY_TIER[tier]
  if (!grouped) return null
  const slots = Object.keys(grouped) as EquipSlot[]
  if (!slots.length) return null
  const slot = slots[Math.floor(rng() * slots.length)]
  if (!slot) return null
  const templates = grouped[slot]
  if (!templates || !templates.length) return null
  const template = templates[Math.floor(rng() * templates.length)]
  if (!template) return null
  const [minRange, maxRange] = options?.initialLevelRange ?? [0, 0]
  const minLevel = Math.max(0, Math.floor(minRange))
  const maxLevel = Math.max(minLevel, Math.min(MAX_EQUIP_LEVEL, Math.floor(maxRange)))
  const span = maxLevel - minLevel + 1
  const roll = span > 0 ? Math.floor(rng() * span) : 0
  const initialLevel = minLevel + roll
  return createEquipmentFromTemplate(template, initialLevel)
}

function aggregateItemDrop(
  map: Map<string, ItemLootResult>,
  itemId: string,
  quantity: number,
): ItemLootResult {
  const existing = map.get(itemId)
  if (existing) {
    existing.quantity += quantity
    return existing
  }
  const definition = ITEM_MAP.get(itemId)
  const entry: ItemLootResult = {
    kind: 'item',
    itemId,
    name: definition?.name ?? itemId,
    quantity,
  }
  map.set(itemId, entry)
  return entry
}

function defaultQiOperationState(): QiOperationState {
  return {
    mode: 'idle',
    startedAt: null,
    lastTickAt: null,
    warmupSeconds: DEFAULT_WARMUP_SECONDS,
    progress: 0,
    fValue: 0,
  }
}

function cloneQiOperationState(operation: QiOperationState): QiOperationState {
  return {
    mode: operation.mode,
    startedAt: operation.startedAt,
    lastTickAt: operation.lastTickAt,
    warmupSeconds: operation.warmupSeconds,
    progress: operation.progress,
    fValue: operation.fValue,
  }
}

function resolveMonsterHp(monster: Monster): number {
  return Math.max(0, monster.hp)
}

function resolveMonsterQi(_monster: Monster) {
  return 0
}

function resolveMonsterAtk(monster: Monster): number {
  return monster.stats.ATK
}

function resolveMonsterAgi(monster: Monster): number {
  return monster.stats.AGI
}

function resolveMonsterRealmPower(monster: Monster): number {
  return realmTierContentLevel(monster.realmTier)
}

function resolveMonsterPenetration(monster: Monster) {
  const fallbackLevel = resolveMonsterRealmPower(monster)
  return monster.penetration || {
    flat: 0,
    pct: Math.min(Math.max(0.1 + 0.012 * fallbackLevel, 0), 0.6),
  }
}

function createMonsterSkillCooldownMap(profile: MonsterSkillProfile): Record<string, number> {
  const cooldowns: Record<string, number> = {}
  const skills = [profile.basic, ...profile.extras]
  skills.forEach((skill) => {
    cooldowns[skill.id] = 0
  })
  return cooldowns
}

function findMonsterSkill(profile: MonsterSkillProfile, skillId: string): MonsterSkillDefinition | null {
  if (profile.basic.id === skillId) return profile.basic
  return profile.extras.find((skill) => skill.id === skillId) ?? null
}

function buildSkillStateSnapshot(
  cooldowns: Record<string, number>,
  delaySeconds: number,
): Record<string, number> {
  const snapshot: Record<string, number> = {}
  const delay = Math.max(0, delaySeconds)
  Object.entries(cooldowns).forEach(([skillId, remaining]) => {
    const adjusted = Math.max((remaining ?? 0) - delay, 0)
    snapshot[skillId] = adjusted
  })
  return snapshot
}

function resolveMonsterCooldownFloor(cooldowns: Record<string, number>): number {
  let floor = Infinity
  const entries = Object.values(cooldowns)
  if (entries.length === 0) return 0
  for (let index = 0; index < entries.length; index += 1) {
    const value = entries[index]
    if (!Number.isFinite(value)) {
      floor = Math.min(floor, 0)
      continue
    }
    const normalized = typeof value === 'number' ? value : 0
    const remaining = Math.max(0, normalized)
    if (remaining < floor) {
      floor = remaining
      if (floor === 0) break
    }
  }
  return floor === Infinity ? 0 : floor
}

function resolveInitialMonsterDelay(monster: Monster, profile: MonsterSkillProfile): number {
  if (Number.isFinite(monster.attackInterval) && monster.attackInterval > 0) {
    return monster.attackInterval
  }
  return Math.max(profile.basic.cooldown ?? 0, 0)
}

function resolveItemUseDurationMs(itemId: string, _player: ReturnType<typeof usePlayerStore>): number {
  const definition = ITEM_MAP.get(itemId)
  let base = DEFAULT_ITEM_USE_DURATION_MS
  if (definition && 'useDurationMs' in definition && typeof definition.useDurationMs === 'number') {
    base = Math.max(definition.useDurationMs, 0)
  }
  if (!Number.isFinite(base) || base < 0) {
    base = DEFAULT_ITEM_USE_DURATION_MS
  }
  // Hook for future modifiers (talents or gear can adjust drink speed)
  return base
}

function initialState(): BattleState {
  return {
    monster: null,
    monsterHp: 0,
    monsterQi: 0,
    rngSeed: Date.now() >>> 0,
    floatTexts: [],
    flashEffects: [],
    concluded: 'idle',
    lastOutcome: null,
    rematchTimer: null,
    lastAutoRematchAt: null,
    loot: [],
    loopHandle: null,
    lastTickAt: 0,
    battleStartedAt: null,
    battleEndedAt: null,
    monsterNextSkill: null,
    monsterNextSkillTimer: 0,
    monsterNextSkillTotal: 0,
    monsterCurrentSkill: null,
    monsterSkillCooldowns: {},
    skillCooldowns: Array(SKILL_SLOT_COUNT).fill(0),
    itemCooldowns: {},
    actionLockUntil: null,
    pendingDodge: null,
    pendingItemUse: null,
    monsterFollowup: null,
    skillCharges: Array(SKILL_SLOT_COUNT).fill(null),
    activeSkillChargeSlot: null,
    playerQi: 0,
    playerQiMax: 0,
    qiOperation: defaultQiOperationState(),
    cultivationFrame: createEmptyCultivationMetrics(),
    skillChain: {
      lastSkillId: null,
      targetId: null,
      streak: 0,
    },
    skillRealmNotified: {},
    skillCooldownBonuses: {},
    monsterVulnerability: null,
  }
}

let floatId = 1
let flashId = 1

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function getNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export const useBattleStore = defineStore('battle', {
  state: () => initialState(),
  getters: {
    inBattle(state) {
      // In battle when there's an active monster and either:
      // - Battle is idle (ongoing)
      // - Victory achieved and rematch is scheduled (for normal monsters)
      // - Victory achieved against a boss (showing victory screen)
      return !!state.monster && (
        state.concluded === 'idle' ||
        (state.concluded === 'victory' && state.rematchTimer !== null) ||
        (state.concluded === 'victory' && state.monster?.isBoss)
      )
    },
  },
  actions: {
    reset() {
      this.stopLoop()
      this.clearRematchTimer()
      Object.assign(this, initialState())
      const player = usePlayerStore()
      player.setRecoveryMode('idle')
      player.stopQiOperation()
      player.stopQiOperation()
    },
    exitBattle() {
      this.stopLoop()
      this.clearRematchTimer()
      const player = usePlayerStore()
      const slotCount = player.skills.loadout.length || SKILL_SLOT_COUNT
      this.monster = null
      this.monsterHp = 0
      this.monsterQi = 0
      this.concluded = 'idle'
      this.floatTexts = []
      this.flashEffects = []
      this.rematchTimer = null
      this.skillCooldowns = Array(slotCount).fill(0)
      this.itemCooldowns = {}
      this.monsterSkillCooldowns = {}
      this.actionLockUntil = null
      this.pendingDodge = null
      this.pendingItemUse = null
      this.monsterFollowup = null
      this.skillCharges = Array(slotCount).fill(null)
      this.activeSkillChargeSlot = null
      this.monsterNextSkill = null
      this.monsterNextSkillTimer = 0
      this.monsterNextSkillTotal = 0
      this.monsterCurrentSkill = null
      this.lastTickAt = 0
      this.battleStartedAt = null
      this.battleEndedAt = null
      this.playerQi = 0
      this.playerQiMax = 0
      this.qiOperation = defaultQiOperationState()
      this.resetCultivationMetrics()
      player.setRecoveryMode('idle')
      this.skillChain = {
        lastSkillId: null,
        targetId: null,
        streak: 0,
      }
      this.skillRealmNotified = {}
      this.skillCooldownBonuses = {}
      this.monsterVulnerability = null
      // 保留lastOutcome和loot以便在结算页面显示
      // this.lastOutcome = null
      // this.loot = []
    },
    start(monster: Monster, seed?: number) {
      this.clearRematchTimer()
      this.stopLoop()
      this.monster = monster
      this.monsterHp = resolveMonsterHp(monster)
      this.monsterQi = resolveMonsterQi(monster)
      this.concluded = 'idle'
      this.floatTexts = []
      this.flashEffects = []
      this.rngSeed = (seed ?? Date.now()) >>> 0
      this.lastOutcome = null
      this.loot = []
      this.battleStartedAt = Date.now()
      this.battleEndedAt = null
      const player = usePlayerStore()
      this.resetCultivationMetrics()
      player.setRecoveryMode('run')
      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)
      const slotCount = player.skills.loadout.length || SKILL_SLOT_COUNT
      this.skillCooldowns = Array(slotCount).fill(0)
      this.itemCooldowns = {}
      const profile = monster.skillProfile ?? resolveMonsterSkillProfile(monster)
      this.monsterSkillCooldowns = createMonsterSkillCooldownMap(profile)
      this.actionLockUntil = null
      this.pendingDodge = null
      this.pendingItemUse = null
      this.monsterFollowup = null
      this.skillCharges = Array(slotCount).fill(null)
      this.activeSkillChargeSlot = null
      this.monsterNextSkill = null
      this.monsterNextSkillTimer = 0
      this.monsterNextSkillTotal = 0
      this.monsterCurrentSkill = null
      this.lastTickAt = getNow()
      this.skillChain = {
        lastSkillId: null,
        targetId: monster.id ?? null,
        streak: 0,
      }
      this.skillRealmNotified = {}
      this.skillCooldownBonuses = {}
      this.monsterVulnerability = null
      const initialDelay = resolveInitialMonsterDelay(monster, profile)
      this.planNextMonsterSkill(initialDelay)
      this.startLoop()
    },
    planNextMonsterSkill(delaySeconds: number) {
      if (!this.monster || this.concluded !== 'idle') return
      const delay = Math.max(0, Number.isFinite(delaySeconds) ? delaySeconds : 0)
      const cooldownFloor = resolveMonsterCooldownFloor(this.monsterSkillCooldowns)
      const totalDelay = Math.max(delay, cooldownFloor)
      this.monsterNextSkillTimer = totalDelay
      this.monsterNextSkillTotal = totalDelay
      const skill = this.selectMonsterSkill(totalDelay)
      this.monsterNextSkill = skill
      this.setupMonsterComboTelegraph(skill, totalDelay)
    },
    selectMonsterSkill(delaySeconds: number): MonsterSkillDefinition | null {
      const monster = this.monster
      if (!monster) return null
      const selector = monster.skillSelector ?? resolveMonsterSkillSelector(monster)
      const profile = monster.skillProfile ?? resolveMonsterSkillProfile(monster)
      const skillStates = buildSkillStateSnapshot(this.monsterSkillCooldowns, delaySeconds)
      const rng = makeRng(this.rngSeed ^ 0x3c6ef372)
      this.rngSeed = (this.rngSeed + 0xa4093822) >>> 0
      const choice = selector({ monster, skillStates, rng })
      if (!choice) return null
      return findMonsterSkill(profile, choice)
    },
    setupMonsterComboTelegraph(skill: MonsterSkillDefinition | null, delaySeconds: number) {
      if (!skill || skill.hits.length <= 1) {
        if (this.monsterFollowup && this.monsterFollowup.stage === 'telegraph') {
          this.monsterFollowup = null
        }
        return
      }
      const hits = skill.hits
      const baseHit = hits[0]
      const extraHits = hits.slice(1)
      if (!baseHit || extraHits.length === 0) {
        if (this.monsterFollowup && this.monsterFollowup.stage === 'telegraph') {
          this.monsterFollowup = null
        }
        return
      }
      const firstExtraDelay = extraHits[0]?.delay ?? 0
      const baseDelay = baseHit.delay ?? 0
      const timer = Math.max(0, Math.max(delaySeconds, 0) + Math.max(firstExtraDelay - baseDelay, 0))
      const now = this.lastTickAt || getNow()
      this.monsterFollowup = {
        source: skill.id,
        skillId: skill.id,
        stage: 'telegraph',
        timer,
        delay: firstExtraDelay,
        baseMultiplier: baseHit.multiplier ?? 1,
        hits: extraHits,
        nextHitIndex: 0,
        lastHitDelay: baseDelay,
        label: skill.comboLabel ?? `×${hits.length}`,
        lastUpdatedAt: now,
      }
    },
    executeReadyMonsterSkill(): boolean {
      if (!this.monster || this.concluded !== 'idle') return false
      let skill = this.monsterNextSkill
      if (!skill) {
        skill = this.selectMonsterSkill(0)
      }
      if (!skill) return false
      this.monsterNextSkill = null
      this.monsterNextSkillTimer = 0
      this.monsterNextSkillTotal = 0
      this.monsterCurrentSkill = skill
      this.monsterSkillCooldowns[skill.id] = skill.cooldown
      this.monsterAttack(skill)
      return true
    },
    activateMonsterComboSequence(
      skill: MonsterSkillDefinition | null | undefined,
      baseHit: MonsterSkillHit,
      extraHits: MonsterSkillHit[],
    ) {
      if (!skill || extraHits.length === 0) {
        if (this.monsterFollowup && this.monsterFollowup.stage === 'telegraph') {
          this.monsterFollowup = null
        }
        return
      }
      const now = this.lastTickAt || getNow()
      const baseDelay = baseHit.delay ?? 0
      const nextHit = extraHits[0]
      if (this.monsterFollowup && this.monsterFollowup.stage === 'telegraph' && this.monsterFollowup.skillId === skill.id) {
        this.monsterFollowup.stage = 'active'
        this.monsterFollowup.nextHitIndex = 0
        this.monsterFollowup.hits = extraHits
        this.monsterFollowup.timer = nextHit ? Math.max(nextHit.delay - baseDelay, 0) : 0
        this.monsterFollowup.lastHitDelay = baseDelay
        this.monsterFollowup.baseMultiplier = baseHit.multiplier ?? 1
        this.monsterFollowup.lastUpdatedAt = now
      } else {
        this.monsterFollowup = {
          source: skill.id,
          skillId: skill.id,
          stage: 'active',
          timer: nextHit ? Math.max(nextHit.delay - baseDelay, 0) : 0,
          delay: nextHit?.delay ?? 0,
          baseMultiplier: baseHit.multiplier ?? 1,
          hits: extraHits,
          nextHitIndex: 0,
          lastHitDelay: baseDelay,
          label: skill.comboLabel ?? `×${extraHits.length + 1}`,
          lastUpdatedAt: now,
        }
      }
    },
    onMonsterSkillResolved(skill: MonsterSkillDefinition | null) {
      if (!skill) {
        this.monsterCurrentSkill = null
        return
      }
      const delay = Math.max(0, skill.aftercast ?? 0)
      this.monsterCurrentSkill = null
      this.planNextMonsterSkill(delay)
    },
    clearRematchTimer() {
      if (this.rematchTimer !== null) {
        clearTimeout(this.rematchTimer)
        this.rematchTimer = null
      }
    },
    startLoop() {
      if (this.loopHandle !== null) return
      this.loopHandle = setInterval(() => {
        this.tick()
      }, TICK_INTERVAL_MS)
    },
    stopLoop() {
      if (this.loopHandle !== null) {
        clearInterval(this.loopHandle)
        this.loopHandle = null
      }
    },
    resetCultivationMetrics() {
      this.cultivationFrame = createEmptyCultivationMetrics()
    },
    recordQiSpent(amount: number) {
      if (!Number.isFinite(amount) || amount <= 0) return
      this.cultivationFrame.qiSpent += amount
    },
    recordQiRestored(amount: number) {
      if (!Number.isFinite(amount) || amount <= 0) return
      this.cultivationFrame.extraQiRestored += amount
    },
    recordCultivationAction(action: CultivationActionKey, value = 1) {
      if (!Number.isFinite(value) || value <= 0) return
      const current = this.cultivationFrame.actions[action] ?? 0
      this.cultivationFrame.actions[action] = current + value
    },
    cleanupSkillCooldownBonuses(nowMs: number) {
      Object.keys(this.skillCooldownBonuses).forEach((skillId) => {
        const bonus = this.skillCooldownBonuses[skillId]
        if (!bonus || bonus.expiresAt <= nowMs) {
          delete this.skillCooldownBonuses[skillId]
        }
      })
    },
    applyCultivationTick(deltaSeconds: number) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
      const player = usePlayerStore()
      const env: CultivationEnvironment = this.monster?.isBoss ? 'boss_battle' : 'battle'
      if (player.res.hpMax > 0 && player.res.hp / player.res.hpMax <= 0.2) {
        this.recordCultivationAction('lowHpPersistence', deltaSeconds)
      }
      player.tickCultivation(deltaSeconds, {
        environment: env,
        qiSpent: this.cultivationFrame.qiSpent,
        extraQiRestored: this.cultivationFrame.extraQiRestored,
        actions: this.cultivationFrame.actions,
        inBattle: true,
        bossBattle: this.monster?.isBoss ?? false,
      })

      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)
      this.resetCultivationMetrics()
    },
    tick() {
      if (!this.monster || this.concluded !== 'idle') {
        this.stopLoop()
        return
      }

      const player = usePlayerStore()
      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)

      const now = getNow()
      const last = this.lastTickAt || now
      let delta = (now - last) / 1000
      if (!Number.isFinite(delta) || delta < 0) {
        delta = 0
      }
      if (delta > MAX_FRAME_TIME) {
        delta = MAX_FRAME_TIME
      }
      this.lastTickAt = now

      if (delta <= 0) return

      this.tickSkillCharges(delta, now)
      this.resolvePendingItemUse(now)
      if (!this.monster || this.concluded !== 'idle') return

      for (let index = 0; index < this.skillCooldowns.length; index += 1) {
        const remaining = this.skillCooldowns[index] ?? 0
        if (remaining > 0) {
          const next = remaining - delta
          this.skillCooldowns[index] = next > 0 ? next : 0
        }
      }

      const entries = Object.entries(this.itemCooldowns)
      if (entries.length > 0) {
        for (let i = 0; i < entries.length; i += 1) {
          const [itemId, value] = entries[i]!
          const next = value - delta
          if (next <= 0) {
            delete this.itemCooldowns[itemId]
          } else {
            this.itemCooldowns[itemId] = next
          }
        }
      }

      const monsterSkillIds = Object.keys(this.monsterSkillCooldowns)
      if (monsterSkillIds.length > 0) {
        for (let index = 0; index < monsterSkillIds.length; index += 1) {
          const skillId = monsterSkillIds[index]
          if (!skillId) continue
          const remaining = this.monsterSkillCooldowns[skillId] ?? 0
          const next = remaining - delta
          this.monsterSkillCooldowns[skillId] = next > 0 ? next : 0
        }
      }

      if (this.monsterNextSkillTimer > 0) {
        this.monsterNextSkillTimer = Math.max(0, this.monsterNextSkillTimer - delta)
      }
      let actionsResolved = 0
      while (this.monster && this.concluded === 'idle' && this.monsterNextSkillTimer <= 0) {
        const executed = this.executeReadyMonsterSkill()
        if (!executed) break
        actionsResolved += 1
        if (actionsResolved >= MAX_MONSTER_ACTIONS_PER_TICK) break
        if (this.monsterNextSkillTimer > 0) break
      }

      const followup = this.monsterFollowup
      if (followup && this.concluded === 'idle' && this.monster) {
        const reference = Number.isFinite(followup.lastUpdatedAt) ? followup.lastUpdatedAt : this.lastTickAt
        let elapsedSeconds = 0
        if (typeof reference === 'number' && Number.isFinite(reference)) {
          elapsedSeconds = Math.max(0, (now - reference) / 1000)
        } else {
          elapsedSeconds = Math.max(0, delta)
        }
        if (elapsedSeconds > 0) {
          followup.timer -= elapsedSeconds
          followup.lastUpdatedAt = now
        }
        if (followup.stage === 'active' && followup.timer <= 0) {
          this.resolveMonsterFollowupAttack()
        }
      }

      this.applyCultivationTick(delta)
    },
    getSkillCooldown(slotIndex: number) {
      return this.skillCooldowns[slotIndex] ?? 0
    },
    isSkillReady(slotIndex: number) {
      return this.getSkillCooldown(slotIndex) <= 0
    },
    getItemCooldown(itemId: string) {
      return this.itemCooldowns[itemId] ?? 0
    },
    pushFloat(value: string, kind: FloatText['kind'], variant?: FloatText['variant']) {
      const id = floatId++
      let x = 0.5
      let y = 0.5

      if (kind === 'hitP') {
        x = randomInRange(0.18, 0.38)
        y = randomInRange(0.38, 0.68)
      } else if (kind === 'hitE') {
        x = randomInRange(0.62, 0.82)
        y = randomInRange(0.24, 0.54)
      } else if (kind === 'heal') {
        x = randomInRange(0.22, 0.42)
        y = randomInRange(0.22, 0.5)
      } else if (kind === 'loot') {
        x = randomInRange(0.38, 0.62)
        y = randomInRange(0.18, 0.32)
      }

      this.floatTexts.push({ id, x, y, value, kind, variant })
      if (this.floatTexts.length > 12) this.floatTexts.shift()

      const lifespan = kind === 'miss' ? 900 : 1400
      setTimeout(() => {
        const index = this.floatTexts.findIndex((text) => text.id === id)
        if (index !== -1) this.floatTexts.splice(index, 1)
      }, lifespan)
    },
    triggerFlash(kind: FlashEffectKind) {
      const id = flashId++
      this.flashEffects.push({ id, kind })
      setTimeout(() => {
        this.flashEffects = this.flashEffects.filter((effect) => effect.id !== id)
      }, 760)
    },
    scheduleRematch(monster: Monster) {
      this.clearRematchTimer()
      const now = Date.now()
      let delay = AUTO_REMATCH_BASE_DELAY
      if (this.lastAutoRematchAt !== null) {
        const elapsed = now - this.lastAutoRematchAt
        if (elapsed < AUTO_REMATCH_MIN_INTERVAL) {
          delay = Math.max(delay, AUTO_REMATCH_MIN_INTERVAL - elapsed)
        }
      }
      this.rematchTimer = setTimeout(() => {
        this.rematchTimer = null
        this.start(monster)
        this.lastAutoRematchAt = Date.now()
      }, delay)
    },
    applyVictoryLoot(monster: Monster, player: ReturnType<typeof usePlayerStore>): LootResult[] {
      const entries = getDropEntries(monster)
      if (!entries.length) return []

      const lootRng = makeRng(this.rngSeed ^ 0x243f6a88)
      this.rngSeed = (this.rngSeed + 0x6a09e667) >>> 0
      const dropCount = rollDropCount(monster, lootRng)
      if (dropCount <= 0) return []

      const inventory = useInventoryStore()
      const itemDrops = new Map<string, ItemLootResult>()
      const equipmentDrops: LootResult[] = []
      let extraGold = 0
      let hasExtraGold = false
      const baseRewardGold = monster.rewards.gold

      for (let index = 0; index < dropCount; index += 1) {
        const choice = weightedPick(entries, lootRng)
        if (!choice) continue

        if (choice.kind === 'item') {
          const quantity = choice.quantity ?? 1
          if (quantity <= 0) continue
          inventory.addItem(choice.itemId, quantity)
          aggregateItemDrop(itemDrops, choice.itemId, quantity)
        } else if (choice.kind === 'equipment') {
          const levelRange: [number, number] = monster.isBoss ? [2, 5] : [0, 2]
          const equipment = drawEquipmentFromTier(choice.tier, lootRng, { initialLevelRange: levelRange })
          if (!equipment) continue
          inventory.addEquipment(equipment)
          equipmentDrops.push({
            kind: 'equipment',
            equipment,
            name: equipment.name,
            quantity: 1,
          })
        } else if (choice.kind === 'gold') {
          const multiplier = Math.max(choice.multiplier, 0)
          if (multiplier > 1) {
            const bonus = Math.round(baseRewardGold * (multiplier - 1))
            if (bonus > 0) {
              extraGold += bonus
              hasExtraGold = true
            }
          }
        }
      }

      let totalGold = baseRewardGold
      if (hasExtraGold) {
        totalGold += extraGold
      }

      if (totalGold > baseRewardGold) {
        player.gainGold(totalGold)
      }

      const lootResults: LootResult[] = []
      if (equipmentDrops.length > 0) {
        lootResults.push(...equipmentDrops)
      }
      if (itemDrops.size > 0) {
        lootResults.push(...itemDrops.values())
      }
      if (totalGold > baseRewardGold) {
        lootResults.push({
          kind: 'gold',
          name: 'GOLD',
          amount: totalGold,
          hasBonus: true,
        })
      }

      return lootResults
    },
    conclude(result: 'victory' | 'defeat', loot: LootResult[] = []) {
      const currentMonster = this.monster
      this.stopLoop()
      this.resetCultivationMetrics()
      const player = usePlayerStore()
      const slotCount = player.skills.loadout.length || SKILL_SLOT_COUNT
      this.concluded = result
      this.battleEndedAt = Date.now()
      this.loot = loot
      if (currentMonster) {
        this.lastOutcome = {
          monsterId: currentMonster.id,
          monsterName: currentMonster.name,
          result,
          drops: loot.length > 0 ? loot : undefined,
        }
      }
      this.monsterHp = 0
      this.skillCooldowns = Array(slotCount).fill(0)
      this.itemCooldowns = {}
      this.monsterNextSkill = null
      this.monsterNextSkillTimer = 0
      this.monsterNextSkillTotal = 0
      this.monsterCurrentSkill = null
      this.lastTickAt = 0
      this.actionLockUntil = null
      this.pendingDodge = null
      this.pendingItemUse = null
      this.monsterFollowup = null
      this.skillCharges = Array(slotCount).fill(null)
      this.activeSkillChargeSlot = null
      player.setRecoveryMode('idle')
      if (result === 'victory') {
        if (currentMonster) {
          // 检查金手指设置中的自动重赛开关，只有普通怪且开启自动重赛才会自动重赛
          if (!currentMonster.isBoss) {
            const uiStore = useUiStore()
            if (uiStore.autoRematchAfterVictory) {
              this.scheduleRematch(currentMonster)
            }
          }
        }
      } else {
        this.clearRematchTimer()
        this.monster = null
        this.monsterHp = 0
      }
    },
    playerUseSkill(slotIndex: number, options?: { silent?: boolean }): boolean {
      if (!this.monster || this.concluded !== 'idle') return false

      const player = usePlayerStore()
      const silent = options?.silent ?? false
      if (this.pendingItemUse) {
        if (!silent) this.pushFloat('正在使用道具', 'miss')
        return false
      }
      const now = getNow()
      if (this.actionLockUntil !== null && now < this.actionLockUntil) {
        if (!silent) this.pushFloat('动作硬直中', 'miss')
        return false
      }
      if (this.activeSkillChargeSlot !== null && this.activeSkillChargeSlot !== slotIndex) {
        if (!silent) this.pushFloat('蓄力中', 'miss')
        return false
      }
      const loadout = player.skills.loadout

      if (slotIndex < 0 || slotIndex >= loadout.length) {
        if (!silent) this.pushFloat('无效技能槽', 'miss')
        return false
      }

      const skillId = loadout[slotIndex] ?? null
      if (!skillId) {
        if (!silent) this.pushFloat('未装备技能', 'miss')
        return false
      }

      const skill = getSkillDefinition(skillId)
      if (!skill) {
        if (!silent) this.pushFloat('技能不存在', 'miss')
        return false
      }

      const operationMode = player.res.operation?.mode ?? 'idle'
      if (operationMode === 'idle') {
        if (!silent) this.pushFloat('需先运转斗气', 'miss')
        return false
      }

      const cooldownRemaining = this.getSkillCooldown(slotIndex)
      if (cooldownRemaining > 0) {
        if (!silent) this.pushFloat(`冷却中 ${cooldownRemaining.toFixed(1)}s`, 'miss')
        return false
      }

      const progress = player.ensureSkillProgress(skillId)
      const level = Math.max(progress.level, 1)
      const nowReal = Date.now()
      this.cleanupSkillCooldownBonuses(nowReal)

      const chargeTime = resolveSkillChargeTime(skill, level)
      const aftercastTime = resolveSkillAftercast(skill, level)
      if (chargeTime > 0) {
        return this.startSkillCharge(slotIndex, {
          skill,
          skillId,
          level,
          chargeTime,
          aftercastTime,
          silent,
          now,
        })
      }

      let qiCost = 0
      if (skill.cost.type === 'qi') {
        qiCost = resolveQiCost(skill, level, player.res.qiMax)
        if (qiCost > 0 && !player.spendQi(qiCost)) {
          if (!silent) this.pushFloat('斗气不足', 'miss')
          return false
        }
        if (qiCost > 0) this.recordQiSpent(qiCost)
      }

      const totalLockMs = aftercastTime * 1000
      if (totalLockMs > 0) {
        const unlockAt = now + totalLockMs
        this.actionLockUntil = this.actionLockUntil === null ? unlockAt : Math.max(this.actionLockUntil, unlockAt)
      }

      const skillCooldown = this.resolveEffectiveSkillCooldown(skillId, skill, level, nowReal)
      this.setSkillCooldownForLoadout(loadout, skillId, skillCooldown)

      return this.executeSkillEffect(skill, skillId, qiCost, silent)
    },
    startSkillCharge(
      slotIndex: number,
      options: {
        skill: SkillDefinition
        skillId: string
        level: number
        chargeTime: number
        aftercastTime: number
        silent: boolean
        now: number
      },
    ): boolean {
      const player = usePlayerStore()
      const { skill, skillId, level, chargeTime, aftercastTime, silent, now } = options
      if (chargeTime <= 0) return false

      const loadout = player.skills.loadout
      const existing = this.skillCharges[slotIndex]
      const progress = existing ? Math.max(0, Math.min(existing.progress, 1)) : 0

      let qiCost = 0
      if (skill.cost.type === 'qi') {
        qiCost = resolveQiCost(skill, level, player.res.qiMax)
        if (qiCost > 0 && player.res.qi < qiCost) {
          if (!silent) this.pushFloat('斗气不足', 'miss')
          return false
        }
      }

      const chargeState: SkillChargeState = {
        slotIndex,
        skillId,
        level,
        chargeTime,
        aftercastTime,
        qiCost,
        status: progress >= 1 ? 'charged' : 'charging',
        progress,
        startedAt: now,
        lastUpdatedAt: now,
        silent: existing ? existing.silent && silent : silent,
      }

      this.skillCharges.splice(slotIndex, 1, chargeState)
      this.activeSkillChargeSlot = slotIndex

      // Reset cooldown display while charging (ensure consistency if resuming)
      this.setSkillCooldownForLoadout(loadout, skillId, 0)

      return true
    },
    releaseSkillCharge(slotIndex: number, options?: { silent?: boolean }): boolean {
      const state = this.skillCharges[slotIndex]
      if (!state) return false
      const now = getNow()
      const silentOverride = options?.silent

      this.advanceChargeState(state, now)

      if (state.progress >= 1 && state.status !== 'rewinding') {
        const committed = this.commitChargedSkill(state, now, silentOverride)
        if (committed) {
          this.skillCharges.splice(slotIndex, 1, null)
          if (this.activeSkillChargeSlot === slotIndex) {
            this.activeSkillChargeSlot = null
          }
          return true
        }
        state.status = 'rewinding'
        state.lastUpdatedAt = now
      } else {
        state.status = 'rewinding'
        state.lastUpdatedAt = now
      }

      if (this.activeSkillChargeSlot === slotIndex) {
        this.activeSkillChargeSlot = null
      }
      return false
    },
    cancelSkillCharge(slotIndex: number) {
      const state = this.skillCharges[slotIndex]
      if (!state) return
      if (state.status === 'rewinding') return
      const now = getNow()
      this.advanceChargeState(state, now)
      state.status = 'rewinding'
      state.lastUpdatedAt = now
      if (this.activeSkillChargeSlot === slotIndex) {
        this.activeSkillChargeSlot = null
      }
    },
    advanceChargeState(state: SkillChargeState, now: number) {
      const delta = Math.max(0, (now - state.lastUpdatedAt) / 1000)
      if (delta <= 0) return
      if (state.status === 'charging') {
        const progress = state.progress + delta / Math.max(state.chargeTime, 0.001)
        state.progress = progress >= 1 ? 1 : progress
        state.status = state.progress >= 1 ? 'charged' : 'charging'
      } else if (state.status === 'charged') {
        state.progress = 1
      } else if (state.status === 'rewinding') {
        const progress = state.progress - delta / Math.max(state.chargeTime, 0.001)
        state.progress = progress <= 0 ? 0 : progress
      }
      state.lastUpdatedAt = now
    },
    commitChargedSkill(state: SkillChargeState, now: number, silentOverride?: boolean): boolean {
      const player = usePlayerStore()
      const skill = getSkillDefinition(state.skillId)
      if (!skill) return false

      const silent = silentOverride ?? state.silent ?? false
      const qiCost = state.qiCost
      if (skill.cost.type === 'qi') {
        if (qiCost > 0 && player.res.qi < qiCost) {
          if (!silent) this.pushFloat('斗气不足', 'miss')
          return false
        }
        if (qiCost > 0 && !player.spendQi(qiCost)) {
          if (!silent) this.pushFloat('斗气不足', 'miss')
          return false
        }
        if (qiCost > 0) this.recordQiSpent(qiCost)
      }

      const nowReal = Date.now()
      this.cleanupSkillCooldownBonuses(nowReal)
      const cooldown = this.resolveEffectiveSkillCooldown(state.skillId, skill, state.level, nowReal)
      const loadout = player.skills.loadout
      this.setSkillCooldownForLoadout(loadout, state.skillId, cooldown)

      const aftercastLock = state.aftercastTime * 1000
      if (aftercastLock > 0) {
        const unlockAt = now + aftercastLock
        this.actionLockUntil = this.actionLockUntil === null ? unlockAt : Math.max(this.actionLockUntil, unlockAt)
      }

      return this.executeSkillEffect(skill, state.skillId, qiCost, silent)
    },
    resolveEffectiveSkillCooldown(skillId: string, skill: SkillDefinition, level: number, nowReal: number): number {
      let cooldown = resolveSkillCooldown(skill, level, FALLBACK_SKILL_COOLDOWN)
      const bonus = this.skillCooldownBonuses[skillId]
      if (bonus) {
        if (nowReal <= bonus.expiresAt) {
          const reduction = Math.min(Math.max(bonus.reductionPercent, 0), 0.9)
          cooldown *= Math.max(0, 1 - reduction)
        }
        delete this.skillCooldownBonuses[skillId]
      }
      return cooldown
    },
    setSkillCooldownForLoadout(loadout: Array<string | null>, skillId: string, cooldown: number) {
      for (let index = 0; index < loadout.length; index += 1) {
        if (loadout[index] === skillId) {
          this.skillCooldowns[index] = cooldown
        }
      }
    },
    tickSkillCharges(deltaSeconds: number, now: number) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return
      const readyStates: SkillChargeState[] = []
      let activeSlot: number | null = null
      for (let index = 0; index < this.skillCharges.length; index += 1) {
        const state = this.skillCharges[index]
        if (!state) continue
        const rate = deltaSeconds / Math.max(state.chargeTime, 0.001)
        if (state.status === 'charging') {
          const progress = state.progress + rate
          state.progress = progress >= 1 ? 1 : progress
          state.status = state.progress >= 1 ? 'charged' : 'charging'
          state.lastUpdatedAt = now
          if (state.status === 'charged') {
            readyStates.push(state)
          } else {
            activeSlot = state.slotIndex
          }
        } else if (state.status === 'charged') {
          state.progress = 1
          state.lastUpdatedAt = now
          readyStates.push(state)
        } else if (state.status === 'rewinding') {
          const progress = state.progress - rate
          if (progress <= 0) {
            this.skillCharges.splice(index, 1, null)
            if (this.activeSkillChargeSlot === state.slotIndex) {
              this.activeSkillChargeSlot = null
            }
            continue
          }
          state.progress = progress
          state.lastUpdatedAt = now
        }
      }

      if (readyStates.length > 0) {
        for (const state of readyStates) {
          const committed = this.commitChargedSkill(state, now, state.silent)
          if (committed) {
            this.skillCharges.splice(state.slotIndex, 1, null)
            if (this.activeSkillChargeSlot === state.slotIndex) {
              this.activeSkillChargeSlot = null
            }
          } else {
            state.status = 'rewinding'
            state.lastUpdatedAt = now
          }
        }
      }

      if (activeSlot !== null) {
        this.activeSkillChargeSlot = activeSlot
      } else {
        const hasActive = this.skillCharges.some(
          (entry) => entry && (entry.status === 'charging' || entry.status === 'charged'),
        )
        if (!hasActive) {
          this.activeSkillChargeSlot = null
        }
      }
    },
    resolvePendingItemUse(nowMs: number) {
      const pending = this.pendingItemUse
      if (!pending) return
      const duration = Math.max(pending.durationMs, 0)
      let progress: number
      if (duration > 0) {
        progress = (nowMs - pending.startedAt) / duration
      } else {
        progress = 1
      }
      if (!Number.isFinite(progress)) {
        progress = duration > 0 ? 0 : 1
      }
      progress = Math.max(0, Math.min(progress, 1))
      if (progress !== pending.progress) {
        pending.progress = progress
      }
      if (progress < 1) {
        this.pendingItemUse = pending
        return
      }
      this.pendingItemUse = null
      void this.finishPendingItemUse(pending)
    },
    async finishPendingItemUse(pending: PendingItemUseState) {
      if (!this.monster || this.concluded !== 'idle') return

      const inventory = useInventoryStore()
      const player = usePlayerStore()

      if (!inventory.spend(pending.itemId, 1)) {
        if (!pending.silent) this.pushFloat('无库存', 'miss')
        return
      }

      const beforeHp = player.res.hp
      const beforeQi = player.res.qi
      const beforeOverflow = player.cultivation.realm.overflow

      const applied = await player.useItem(pending.itemId)
      if (!applied) {
        inventory.addItem(pending.itemId, 1)
        if (!pending.silent) this.pushFloat('未生效', 'miss')
        return
      }

      const hpGain = Math.max(player.res.hp - beforeHp, 0)
      if (hpGain > 0) {
        this.pushFloat(`+${Math.round(hpGain)}`, 'heal')
      }

      const qiGain = Math.max(player.res.qi - beforeQi, 0)
      if (qiGain > 0) {
        this.recordQiRestored(qiGain)
        this.pushFloat(`斗气+${Math.round(qiGain)}`, 'heal')
      }

      const overflowChange = Math.max(player.cultivation.realm.overflow - beforeOverflow, 0)
      if (overflowChange > 0) {
        this.pushFloat(`ΔBP+${overflowChange.toFixed(2)}`, 'loot')
      }

      this.itemCooldowns[pending.itemId] = ITEM_COOLDOWN
      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)
    },
    executeSkillEffect(skill: SkillDefinition, skillId: string, qiCost: number, silent: boolean): boolean {
      if (!this.monster || this.concluded !== 'idle') return false

      const player = usePlayerStore()
      const targetId = this.monster?.id ?? null
      if (this.skillChain.lastSkillId === skillId && this.skillChain.targetId === targetId) {
        this.skillChain.streak += 1
      } else {
        this.skillChain = {
          lastSkillId: skillId,
          targetId,
          streak: 1,
        }
      }
      const streak = this.skillChain.streak
      const stats = player.finalStats
      const rng = makeRng(this.rngSeed)
      this.rngSeed = (this.rngSeed + 0x9e3779b9) >>> 0

      const result = skill.execute({
        stats,
        monster: this.monster,
        rng,
        resources: player.res,
        cultivation: player.cultivation,
        progress: player.skills.progress[skillId] ?? undefined,
      })

      const nowMs = Date.now()
      const activeVulnerability = this.monsterVulnerability
      let dmg = Math.max(0, Math.round(result.damage ?? 0))
      const weaknessTriggered = Boolean(result.weaknessTriggered)
      if (activeVulnerability) {
        if (nowMs > activeVulnerability.expiresAt) {
          this.monsterVulnerability = null
        } else if (dmg > 0 && activeVulnerability.percent > 0) {
          const multiplier = 1 + Math.max(activeVulnerability.percent, 0)
          dmg = Math.round(dmg * multiplier)
          if (typeof result.coreDamage === 'number') {
            result.coreDamage = Math.round(Math.max(result.coreDamage, 0) * multiplier)
          }
        }
      }

      const hit = result.hit ?? dmg > 0

      if (dmg > 0) {
        this.applyPlayerDamage(dmg, skill.flash, { weakness: weaknessTriggered })
        this.recordCultivationAction('attackHit', 1)
        if (skillId === 'star_realm_dragon_blood_break') {
          this.recordCultivationAction('finisherHit', 1)
        }
      } else {
        this.triggerFlash(skill.flash)
      }

      if (result.healSelf && result.healSelf > 0) {
        player.heal(result.healSelf)
        this.pushFloat(`+${result.healSelf}`, 'heal')
      }

      if (result.gainQi && result.gainQi > 0) {
        const beforeQi = player.res.qi
        player.restoreQi(result.gainQi)
        const gained = Math.max(player.res.qi - beforeQi, 0)
        if (gained > 0) {
          this.recordQiRestored(gained)
          this.pushFloat(`斗气+${Math.round(gained)}`, 'heal')
        }
      }

      if (result.spendQi && result.spendQi > 0) {
        if (player.spendQi(result.spendQi)) {
          this.recordQiSpent(result.spendQi)
        } else if (!silent) {
          this.pushFloat('斗气不足', 'miss')
        }
      }

      if (result.message) {
        this.pushFloat(result.message, 'miss')
      }

      if (result.cooldownBonus && result.cooldownBonus.targetSkillId && result.cooldownBonus.durationMs > 0) {
        const reduction = Math.min(Math.max(result.cooldownBonus.reductionPercent, 0), 0.9)
        if (reduction > 0) {
          this.skillCooldownBonuses[result.cooldownBonus.targetSkillId] = {
            reductionPercent: reduction,
            expiresAt: nowMs + result.cooldownBonus.durationMs,
          }
        }
      }

      if (result.applyVulnerability && result.applyVulnerability.percent > 0 && hit) {
        this.monsterVulnerability = {
          percent: Math.max(result.applyVulnerability.percent, 0),
          expiresAt: nowMs + Math.max(result.applyVulnerability.durationMs, 0),
        }
        this.pushFloat('目标易伤', 'miss')
      }

      if (result.superArmorMs && result.superArmorMs > 0) {
        this.pushFloat('霸体', 'miss')
      }

      const usage = player.recordSkillUsage(skill, {
        rng,
        baseCooldown: skill.cooldown ?? FALLBACK_SKILL_COOLDOWN,
        hit,
        streak,
        timestamp: nowMs,
      })
      if (usage) {
        if (usage.blockedByRealm && !this.skillRealmNotified[skillId]) {
          this.pushFloat('已达当前上限', 'miss')
          this.skillRealmNotified[skillId] = true
        }
        if (usage.leveledUp) {
          this.pushFloat(`${skill.name} Lv.${usage.progress.level}`, 'loot')
          this.skillRealmNotified[skillId] = false
        }
      }

      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)

      if (skillId === DODGE_SKILL_ID) {
        const attemptTime = getNow()
        const refundTarget = player.res.qiMax * DODGE_REFUND_PERCENT
        const refund = Math.min(refundTarget, Math.max(qiCost, 0))
        this.pendingDodge = {
          attemptedAt: attemptTime,
          invincibleUntil: attemptTime + DODGE_WINDOW_MS,
          refundAmount: refund,
          consumedQi: qiCost,
          refundGranted: false,
        }
      }

      if (this.concluded !== 'idle') return true

      if (this.monsterHp <= 0 && this.monster) {
        this.handleMonsterDefeat(player)
      }

      return true
    },
    cancelItemUse(reason: 'cancelled' | 'interrupted' = 'cancelled'): boolean {
      const pending = this.pendingItemUse
      if (!pending) return false
      this.pendingItemUse = null
      if (reason === 'interrupted' && !pending.silent) {
        this.pushFloat('喝药被打断', 'miss')
      }
      return true
    },
    handleMonsterDefeat(player: ReturnType<typeof usePlayerStore>) {
      if (!this.monster) return

      player.gainGold(this.monster.rewards.gold)

      const progress = useProgressStore()
      progress.markMonsterCleared(this.monster.id)

      if (this.monster.isBoss) {
        const nextMapId = bossUnlockMap[this.monster.id]
        if (nextMapId) {
          progress.unlockMap(nextMapId)
        }
      }

      // Update quest progress and drops
      const questStore = useQuestStore()
      const questRng = makeRng(this.rngSeed ^ 0x1b873593)
      this.rngSeed = (this.rngSeed + 0x85ebca6b) >>> 0
      const questResult = questStore.handleMonsterDefeat(this.monster.id, { rng: questRng, mapId: progress.currentMapId })
      // Show quest item drop notices
      for (const drop of questResult.drops) {
        this.pushFloat(`获得 ${drop.name} x${drop.quantity}`, 'loot')
      }
      // Show quest completion/turn-in notices
      if (questResult.prepared && questResult.prepared.length) {
        for (const questId of questResult.prepared) {
          const qName = questStore.definitionMap[questId]?.name ?? questId
          this.pushFloat(`可交付「${qName}」`, 'loot')
        }
      }

      const loot = this.applyVictoryLoot(this.monster, player)

      this.conclude('victory', loot)
    },
    async useItem(itemId: string, options?: { silent?: boolean }): Promise<boolean> {
      if (!this.monster || this.concluded !== 'idle') return false

      const silent = options?.silent ?? false
      const now = getNow()

      if (this.pendingItemUse) {
        if (!silent) this.pushFloat('正在使用道具', 'miss')
        return false
      }

      if (this.actionLockUntil !== null && now < this.actionLockUntil) {
        if (!silent) this.pushFloat('动作硬直中', 'miss')
        return false
      }

      const cooldownRemaining = this.getItemCooldown(itemId)
      if (cooldownRemaining > 0) {
        if (!silent) this.pushFloat(`冷却中 ${cooldownRemaining.toFixed(1)}s`, 'miss')
        return false
      }

      const inventory = useInventoryStore()
      const player = usePlayerStore()
      const def = ITEMS.find(item => item.id === itemId)

      if (!def) {
        if (!silent) this.pushFloat('无法使用', 'miss')
        return false
      }

      const quantity = inventory.quantity(itemId)
      if (quantity <= 0) {
        if (!silent) this.pushFloat('无库存', 'miss')
        return false
      }

      const durationMs = resolveItemUseDurationMs(itemId, player)
      this.pendingItemUse = {
        itemId,
        startedAt: now,
        resolveAt: now + durationMs,
        durationMs,
        progress: durationMs > 0 ? 0 : 1,
        silent,
      }

      if (durationMs <= 0) {
        this.resolvePendingItemUse(now)
      }

      return true
    },
    applyPlayerDamage(
      dmg: number,
      source: 'attack' | 'skill' | 'ult',
      options?: { weakness?: boolean },
    ) {
      this.monsterHp = Math.max(0, this.monsterHp - dmg)
      const variant: FloatText['variant'] = options?.weakness ? 'weakness' : undefined
      this.pushFloat(`-${dmg}`, 'hitE', variant)
      this.triggerFlash(source)
    },
    monsterAttack(skill?: MonsterSkillDefinition) {
      if (!this.monster || this.concluded !== 'idle') return
      const currentSkill = skill ?? this.monsterCurrentSkill
      const hits = currentSkill?.hits ?? []
      const baseHit = hits[0]
      let baseMultiplier = baseHit?.multiplier ?? 1
      if (hits.length > 1 && baseHit) {
        this.activateMonsterComboSequence(currentSkill, baseHit, hits.slice(1))
      } else if (this.monsterFollowup && this.monsterFollowup.stage === 'telegraph') {
        this.monsterFollowup = null
      }
      const rng = makeRng(this.rngSeed ^ 0x517cc1b7)
      this.rngSeed = (this.rngSeed + 0x7f4a7c15) >>> 0

      this.resolveMonsterAttackWithRng(rng, baseMultiplier)
      if (!currentSkill || hits.length <= 1) {
        this.onMonsterSkillResolved(currentSkill ?? null)
      }
    },
    resolveMonsterAttackWithRng(rng: () => number, damageMultiplier = 1) {
      if (!this.monster || this.concluded !== 'idle') return
      const player = usePlayerStore()
      const stats = player.finalStats
      const now = getNow()

      let dodged = false
      const dodgeAttempt = this.pendingDodge
      if (dodgeAttempt) {
        const windowStart = dodgeAttempt.attemptedAt
        const windowEnd = dodgeAttempt.invincibleUntil
        if (now >= windowStart && now <= windowEnd) {
          dodged = true
          this.pushFloat('闪避!', 'miss')
          if (!dodgeAttempt.refundGranted) {
            const refund = Math.max(dodgeAttempt.refundAmount, 0)
            if (refund > 0) {
              const beforeQi = player.res.qi
              player.restoreQi(refund)
              const gained = Math.max(player.res.qi - beforeQi, 0)
              if (gained > 0) {
                this.recordQiRestored(gained)
                this.pushFloat(`斗气+${Math.round(gained)}`, 'heal')
              }
            }
            this.recordCultivationAction('perfectDodge', 1)
            dodgeAttempt.refundGranted = true
          }
        }
        if (now >= windowEnd) {
          this.pendingDodge = null
        } else {
          this.pendingDodge = dodgeAttempt
        }
      }

      if (dodged) {
        this.playerQi = player.res.qi
        this.playerQiMax = player.res.qiMax
        this.qiOperation = cloneQiOperationState(player.res.operation)
        return
      }

      this.cancelItemUse('interrupted')

      const penetration = resolveMonsterPenetration(this.monster)
      const defRef = getDefRefForRealm(player.cultivation.realm)
      const damageResult = dmgAttack(resolveMonsterAtk(this.monster), stats.totals.DEF, randRange(rng, 0, 1), {
        penPct: penetration.pct,
        penFlat: penetration.flat,
        defRef,
        defenderTough: 1,
      })
      const agiAttacker = resolveMonsterAgi(this.monster)
      const agiDefender = stats.totals.AGI ?? 0
      const weakness = resolveWeaknessDamage(damageResult.damage, agiAttacker, agiDefender, randRange(rng, 0, 1))

      const multiplier = Math.max(damageMultiplier, 0)
      let incoming = Math.max(0, weakness.damage)
      if (multiplier !== 1) {
        incoming *= multiplier
      }
      // Qi Shielding (BATTLE.md §4.3)
      const f = Math.max(0, Math.min(1, player.res.operation.fValue || 0))
      if ((player.res.operation.mode !== 'idle') && f > 0 && incoming > 0) {
        const ratioEff = 0.90 * f
        const absorbedCap = 0.60 * incoming
        const desiredAbsorb = incoming * ratioEff
        const canAbsorb = Math.min(desiredAbsorb, absorbedCap)
        const w = 1.1
        const qiNeed = canAbsorb * w
        const qiHave = Math.max(player.res.qi, 0)
        if (qiHave >= qiNeed) {
          if (qiNeed > 0) {
            if (player.spendQi(qiNeed)) this.recordQiSpent(qiNeed)
          }
          incoming -= canAbsorb
        } else if (qiHave > 0) {
          const partialAbsorb = qiHave / w
          if (player.spendQi(qiHave)) this.recordQiSpent(qiHave)
          incoming -= partialAbsorb
        }
      }

      const dealt = Math.round(Math.max(0, incoming))
      player.receiveDamage(dealt)
      this.pushFloat(`-${dealt}`, 'hitP')
      this.recordCultivationAction('damageTaken', 1)
      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)

      if (player.res.hp <= 0) {
        this.applyDeathPenalty()
        this.conclude('defeat')
      }
    },
    resolveMonsterFollowupAttack() {
      const followup = this.monsterFollowup
      if (!followup) return
      if (!this.monster || this.concluded !== 'idle') {
        this.monsterFollowup = null
        return
      }
      const hit = followup.hits[followup.nextHitIndex]
      if (!hit) {
        this.monsterFollowup = null
        if (this.concluded === 'idle') {
          this.onMonsterSkillResolved(this.monsterCurrentSkill)
        }
        return
      }
      const rng = makeRng(this.rngSeed ^ 0xd2511f53)
      this.rngSeed = (this.rngSeed + 0x94d049bb) >>> 0
      this.resolveMonsterAttackWithRng(rng, hit.multiplier)
      followup.nextHitIndex += 1
      followup.lastHitDelay = hit.delay
      if (followup.nextHitIndex < followup.hits.length) {
        const nextHit = followup.hits[followup.nextHitIndex]!
        const deltaDelay = Math.max(nextHit.delay - followup.lastHitDelay, 0)
        followup.timer = deltaDelay
        followup.lastUpdatedAt = this.lastTickAt || getNow()
        this.monsterFollowup = followup
      } else {
        this.monsterFollowup = null
        if (this.concluded === 'idle') {
          this.onMonsterSkillResolved(this.monsterCurrentSkill)
        }
      }
    },
    applyDeathPenalty() {
      const player = usePlayerStore()

      const goldLoss = Math.floor(player.gold / 3)
      player.gold -= goldLoss

      this.pushFloat(`复活! 损失 ${goldLoss}G`, 'heal')
      this.pushFloat('斗气崩散，需重新预热', 'miss')

      player.restoreFull()
      player.setRecoveryMode('idle')
      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)
      this.resetCultivationMetrics()
    },
  },
})
