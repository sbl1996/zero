import { defineStore } from 'pinia'
import { dmgAttack, getDefRefForRealm, resolveWeaknessDamage } from '@/composables/useDamage'
import { CULTIVATION_ACTION_WEIGHTS, DEFAULT_WARMUP_SECONDS } from '@/composables/useLeveling'
import { resolveSkillAftercast, resolveSkillChargeTime, resolveSkillCooldown, resolveQiCost } from '@/composables/useSkills'
import { makeRng, randRange, randBool } from '@/composables/useRng'
import { bossUnlockMap, generateMonsterInstanceById } from '@/data/monsters'
import { BASE_EQUIPMENT_TEMPLATES, instantiateEquipment } from '@/data/equipment'
import { CORE_SHARD_BASE_ID, getCoreShardConfig } from '@/data/cultivationCores'
import { ITEMS, isItemConsumedOnUse } from '@/data/items'
import { getDropEntries, rollDropCount, weightedPick } from '@/data/drops'
import type { EquipmentTier } from '@/data/drops'
import { getSkillDefinition } from '@/data/skills'
import { getSkillEffectDefinition } from '@/data/skillEffects'
import {
  DEFAULT_SKILL_ID,
  resolveMonsterSkillProfile,
  resolveMonsterSkillSelector,
  rollAttackInterval,
} from '@/data/monsterSkills'
import { resolveMonsterOpeningStrategy } from '@/data/monsterOpenings'
import { MAX_EQUIP_LEVEL } from '@/composables/useEnhance'
import { realmTierContentLevel } from '@/utils/realm'
import type { NumericRealmTier } from '@/utils/realm'
import { useInventoryStore } from './inventory'
import { usePlayerStore } from './player'
import { useProgressStore } from './progress'
import { useUiStore } from './ui'
import { useQuestStore } from './quests'
import { useNodeSpawnStore } from './nodeSpawns'
import { DODGE_WINDOW_MS } from '@/constants/dodge'
import { resolveDodgeSuccessChance } from '@/composables/useDodge'
import type { CultivationEnvironment } from '@/composables/useLeveling'
import { travelToMap } from '@/utils/travel'
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
  MonsterSkillPlanEntry,
  MonsterComboPreviewInfo,
  FloatText,
  PendingItemUseState,
  SkillChargeState,
  Stats,
  QuestLootResult,
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
const DEFAULT_MONSTER_SKILL_PLAN_DEPTH = 3
const AUTO_REMATCH_BASE_DELAY = 800
const AUTO_REMATCH_MIN_INTERVAL = 5000
const DEFAULT_ITEM_USE_DURATION_MS = 1000
const CORE_DROP_RNG_MAGIC = 0xc2b2ae35
const TIGER_FURY_DURATION_MS = 10_000
const TIGER_FURY_MAX_STACKS = 10
const TIGER_FURY_STACK_BONUS = 0.04
const DRAGON_BLOOD_STACK_QI_RATIO = 0.1
const DRAGON_BLOOD_MAX_STACKS = 20
const DRAGON_BLOOD_STACK_ATK_DEF_BONUS = 0.01
const DRAGON_BLOOD_STACK_RECOVERY_BONUS = 0.02
const CALAMITY_ASH_MAX_STACKS = 8
const CALAMITY_ASH_DURATION_MS = 8000
const CALAMITY_ASH_TICK_MS = 1000
const VIOLET_SHROUD_REFLECT_MULTIPLIER = 0.5
const VIOLET_SHROUD_QI_DRAIN_PER_SEC = 0.02
const VIOLET_SHROUD_SHIELD_CAP = 0.9

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
  return instantiateEquipment(template, {
    level: initialLevel,
    id: makeEquipmentId(template.id),
  })
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

function createComboPreviewInfo(skill: MonsterSkillDefinition | null | undefined): MonsterComboPreviewInfo | null {
  if (!skill || skill.hits.length <= 1) return null
  const hits = skill.hits
  const baseHit = hits[0]
  const extraHits = hits.slice(1)
  if (!baseHit || extraHits.length === 0) return null
  return {
    skillId: skill.id,
    label: skill.comboLabel ?? `×${hits.length}`,
    baseDelay: baseHit.delay ?? 0,
    hits: extraHits,
  }
}

function getEntryTimeToExecutionSeconds(entry: MonsterSkillPlanEntry | null, referenceMs: number): number {
  if (!entry) return 0
  return Math.max(0, (entry.scheduledAt - referenceMs) / 1000)
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

function clampInitialCooldown(value: number | undefined | null): number {
  if (!Number.isFinite(value) || (value ?? 0) < 0) return 0
  return value as number
}

function createMonsterSkillCooldownMap(profile: MonsterSkillProfile): Record<string, number> {
  const cooldowns: Record<string, number> = {}
  cooldowns[profile.basic.id] = clampInitialCooldown(profile.basic.cooldown)
  profile.extras.forEach((skill) => {
    cooldowns[skill.id] = clampInitialCooldown(skill.cooldown)
  })
  return cooldowns
}

function isDodgeSkill(definition: SkillDefinition | null | undefined): definition is SkillDefinition {
  return Boolean(definition?.dodgeConfig)
}

function resolveDodgeConfig(definition: SkillDefinition | null | undefined) {
  const fallbackText = '闪避!'
  return {
    windowMs: Math.max(definition?.dodgeConfig?.windowMs ?? DODGE_WINDOW_MS, 0),
    refundPercentOfQiMax: Math.max(definition?.dodgeConfig?.refundPercentOfQiMax ?? 0, 0),
    successText: definition?.dodgeConfig?.successText ?? fallbackText,
  }
}

function buildMonsterOpeningPlan(
  monster: Monster,
  profile: MonsterSkillProfile,
  referenceMs: number,
): MonsterSkillPlanEntry[] {
  const strategy = resolveMonsterOpeningStrategy(monster)
  if (!strategy || strategy.length === 0) return []
  const entries: MonsterSkillPlanEntry[] = []
  strategy.forEach((action) => {
    const delaySeconds = Math.max(0, action.at ?? 0)
    const skill = findMonsterSkill(profile, action.skillId, monster)
    if (!skill) return
    const scheduledAt = referenceMs + delaySeconds * 1000
    const comboPreview = createComboPreviewInfo(skill)
    entries.push({
      skill,
      scheduledAt,
      prepDuration: delaySeconds,
      comboPreview,
    })
  })
  return entries.sort((a, b) => a.scheduledAt - b.scheduledAt)
}

function cloneMonsterSkill(skill: MonsterSkillDefinition | null): MonsterSkillDefinition | null {
  if (!skill) return null
  return {
    ...skill,
    hits: skill.hits.map((hit) => ({ ...hit })),
  }
}

function findMonsterSkill(
  profile: MonsterSkillProfile,
  skillId: string,
  monster: Monster,
  rng?: () => number,
): MonsterSkillDefinition | null {
  if (profile.basic.id === skillId) {
    const skill = cloneMonsterSkill(profile.basic)
    if (!skill) return null
    skill.cooldown = rollAttackInterval(monster.attackInterval, rng)
    return skill
  }
  const found = profile.extras.find((skill) => skill.id === skillId) ?? null
  return cloneMonsterSkill(found)
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

function resolveInitialMonsterDelay(_: Monster, __: MonsterSkillProfile): number {
  return 0
}

function resolveMonsterSkillPlanDepth(monster: Monster | null): number {
  if (!monster) return DEFAULT_MONSTER_SKILL_PLAN_DEPTH
  return Math.max(1, monster.skillPlanDepth ?? DEFAULT_MONSTER_SKILL_PLAN_DEPTH)
}

function getSkillAftercastSeconds(skill: MonsterSkillDefinition | null): number {
  if (!skill) return 0
  return Math.max(0, skill.aftercast ?? 0)
}

function simulateCooldownsAfterPlan(
  plan: MonsterSkillPlanEntry[],
  baseCooldowns: Record<string, number>,
  referenceMs: number,
): Record<string, number> {
  let snapshot = { ...baseCooldowns }
  let previousScheduledMs = referenceMs
  for (let index = 0; index < plan.length; index += 1) {
    const entry = plan[index]
    if (!entry) continue
    const scheduledAt = entry.scheduledAt
    const spanSeconds = Math.max(0, (scheduledAt - previousScheduledMs) / 1000)
    snapshot = buildSkillStateSnapshot(snapshot, spanSeconds)
    if (entry.skill) {
      snapshot[entry.skill.id] = entry.skill.cooldown
    }
    previousScheduledMs = scheduledAt
  }
  return snapshot
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
    monsterRngSeed: Date.now() >>> 0,
  rngSeed: Date.now() >>> 0,
  floatTexts: [],
  flashEffects: [],
  skillEffects: [],
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
    monsterSkillPlan: [],
    monsterChargingSkill: null,
    monsterActionOffsetMs: 0,
    monsterStunUntil: null,
    skillCooldowns: Array(SKILL_SLOT_COUNT).fill(0),
    itemCooldowns: {},
    monsterFollowupPreview: null,
    actionLockUntil: null,
    pendingDodge: null,
    dodgeAttempts: 0,
    dodgeSuccesses: 0,
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
    playerSuperArmor: null,
    playerBloodRage: null,
    playerTigerFury: null,
    playerVioletShroud: null,
    playerAgiBuff: null,
    monsterVulnerability: null,
    monsterChargingDebuff: null,
    monsterCalamityAsh: { layers: [] },
    originNodeId: null,
    originNodeInstanceId: null,
    pendingQuestCompletions: [],
  }
}

let floatId = 1
let flashId = 1
let skillEffectId = 1
let calamityLayerId = 1

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
    isToggleSkillActive(skillId: string): boolean {
      if (skillId === 'violet_shroud') {
        return Boolean(this.playerVioletShroud?.active)
      }
      return false
    },
    reset() {
      this.stopLoop()
      this.clearRematchTimer()
      Object.assign(this, initialState())
      const player = usePlayerStore()
      player.setRecoveryMode('idle')
      player.stopQiOperation()
      player.stopQiOperation()
      this.originNodeId = null
      this.originNodeInstanceId = null
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
      this.skillEffects = []
      this.rematchTimer = null
      this.skillCooldowns = Array(slotCount).fill(0)
      this.itemCooldowns = {}
      this.monsterSkillCooldowns = {}
      this.actionLockUntil = null
      this.pendingDodge = null
      this.dodgeAttempts = 0
      this.dodgeSuccesses = 0
      this.dodgeAttempts = 0
      this.dodgeSuccesses = 0
      this.pendingItemUse = null
      this.monsterFollowup = null
      this.monsterFollowupPreview = null
      this.skillCharges = Array(slotCount).fill(null)
      this.activeSkillChargeSlot = null
      this.monsterNextSkill = null
      this.monsterNextSkillTimer = 0
      this.monsterNextSkillTotal = 0
      this.monsterCurrentSkill = null
      this.monsterChargingSkill = null
      this.originNodeId = null
      this.originNodeInstanceId = null
      this.pendingQuestCompletions = []
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
      this.playerBloodRage = null
      this.playerTigerFury = null
      this.playerVioletShroud = null
      this.playerAgiBuff = null
      this.monsterVulnerability = null
      this.monsterChargingDebuff = null
      this.monsterCalamityAsh = { layers: [] }
      this.playerSuperArmor = null
      this.monsterStunUntil = null
      this.monsterSkillPlan = []
      this.syncMonsterSkillPlanPreview()
      // 保留lastOutcome和loot以便在结算页面显示
      // this.lastOutcome = null
      // this.loot = []
    },
    start(monster: Monster, options?: { seed?: number; originNodeId?: string | null; originNodeInstanceId?: string | null }) {
      this.clearRematchTimer()
      this.stopLoop()
      this.monster = monster
      this.monsterHp = resolveMonsterHp(monster)
      this.monsterQi = resolveMonsterQi(monster)
      this.concluded = 'idle'
      this.floatTexts = []
      this.flashEffects = []
      this.skillEffects = []
      const initialSeed = (options?.seed ?? Date.now()) >>> 0
      this.rngSeed = initialSeed
      this.monsterRngSeed = initialSeed
      this.originNodeId = options?.originNodeId ?? null
      this.originNodeInstanceId = options?.originNodeInstanceId ?? null
      this.lastOutcome = null
      this.loot = []
      const now = getNow()
      this.battleStartedAt = now
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
      const initialBasicIntervalRng = makeRng(this.monsterRngSeed ^ 0x3c6ef372)
      const initialBasicInterval = rollAttackInterval(monster.attackInterval, initialBasicIntervalRng)
      this.monsterRngSeed = (this.monsterRngSeed + 0xa4093822) >>> 0
      this.monsterSkillCooldowns[DEFAULT_SKILL_ID] = initialBasicInterval
      this.actionLockUntil = null
      this.pendingDodge = null
      this.pendingItemUse = null
      this.monsterFollowup = null
      this.monsterFollowupPreview = null
      this.skillCharges = Array(slotCount).fill(null)
      this.activeSkillChargeSlot = null
      this.monsterNextSkill = null
      this.monsterNextSkillTimer = 0
      this.monsterNextSkillTotal = 0
      this.monsterCurrentSkill = null
      this.monsterChargingSkill = null
      this.lastTickAt = now
      this.skillChain = {
        lastSkillId: null,
        targetId: monster.id ?? null,
        streak: 0,
      }
      this.skillRealmNotified = {}
      this.skillCooldownBonuses = {}
      this.playerBloodRage = null
      this.playerTigerFury = null
      this.playerVioletShroud = null
      this.playerAgiBuff = null
      this.monsterVulnerability = null
      this.monsterChargingDebuff = null
      this.monsterCalamityAsh = { layers: [] }
      this.playerSuperArmor = null
      this.monsterStunUntil = null
      const initialDelay = resolveInitialMonsterDelay(monster, profile)
      this.monsterSkillPlan = buildMonsterOpeningPlan(monster, profile, now)
      this.extendMonsterSkillPlan(initialDelay)
      this.startLoop()
    },
    syncMonsterSkillPlanPreview() {
      const now = this.lastTickAt || getNow()
      if (this.monsterChargingSkill) {
        const remainingSeconds = Math.max(0, (this.monsterChargingSkill.endsAt - now) / 1000)
        this.monsterNextSkill = this.monsterChargingSkill.skill
        this.monsterNextSkillTimer = remainingSeconds
        this.monsterNextSkillTotal = this.monsterChargingSkill.chargeSeconds
        if (this.monsterFollowupPreview && this.monsterFollowupPreview.skillId === this.monsterChargingSkill.skill.id) {
          this.monsterFollowupPreview = null
        }
        return
      }
      const nextEntry = this.monsterSkillPlan[0] ?? null
      if (!nextEntry) {
        this.monsterNextSkill = null
        this.monsterNextSkillTimer = 0
        this.monsterNextSkillTotal = 0
        this.monsterFollowupPreview = null
        return
      }
      const timeToNext = getEntryTimeToExecutionSeconds(nextEntry, now)
      this.monsterNextSkill = nextEntry.skill
      this.monsterNextSkillTimer = timeToNext
      this.monsterNextSkillTotal = nextEntry.prepDuration ?? timeToNext
      this.setupMonsterComboTelegraph(nextEntry.skill, timeToNext)
    },
    startMonsterSkillCharge(skill: MonsterSkillDefinition, chargeSeconds: number, nowMs: number) {
      const secs = Math.max(0, chargeSeconds)
      if (secs <= 0) return
      this.monsterChargingSkill = {
        skill,
        chargeSeconds: secs,
        startedAt: nowMs,
        endsAt: nowMs + secs * 1000,
      }
      if (this.monsterFollowupPreview && this.monsterFollowupPreview.skillId === skill.id) {
        this.monsterFollowupPreview = null
      }
      this.syncMonsterSkillPlanPreview()
      // Add charging buff to monster
      const durationMs = secs * 1000
      this.monsterChargingDebuff = {
        expiresAt: nowMs + durationMs,
        durationMs,
      }
      // 蓄力技能的后摇从蓄力结束开始，所以这里传入蓄力时间+后摇时间
      this.extendMonsterSkillPlan(secs + getSkillAftercastSeconds(skill))
    },
    cancelMonsterSkillCharge() {
      if (!this.monsterChargingSkill) return
      this.monsterChargingSkill = null
      this.monsterCurrentSkill = null
      // Remove charging buff when charge is cancelled
      this.monsterChargingDebuff = null
    },
    completeMonsterSkillCharge(_nowMs: number) {
      const charge = this.monsterChargingSkill
      if (!charge) return
      this.monsterChargingSkill = null
      // Remove charging buff when charge is completed
      this.monsterChargingDebuff = null
      if (!this.monster || this.concluded !== 'idle') return
      this.monsterAttack(charge.skill)
    },
    tickMonsterSkillCharge(nowMs: number) {
      if (!this.monsterChargingSkill) return
      if (nowMs >= this.monsterChargingSkill.endsAt) {
        this.completeMonsterSkillCharge(nowMs)
      }
    },
    extendMonsterSkillPlan(initialDelayHint = 0) {
      if (!this.monster || this.concluded !== 'idle') {
        this.monsterSkillPlan = []
        this.syncMonsterSkillPlanPreview()
        return
      }
      const depth = resolveMonsterSkillPlanDepth(this.monster)
      if (depth <= 0) {
        this.monsterSkillPlan = []
        this.syncMonsterSkillPlanPreview()
        return
      }
      const now = this.lastTickAt || getNow()
      const plan = this.monsterSkillPlan
        .filter((entry): entry is MonsterSkillPlanEntry => Boolean(entry))
        .filter((entry) => entry.scheduledAt >= now)
        .slice()
        .sort((a, b) => a.scheduledAt - b.scheduledAt)
      let cooldowns = simulateCooldownsAfterPlan(plan, this.monsterSkillCooldowns, now)
      const lastEntry = plan.length > 0 ? plan[plan.length - 1]! : null
      let lastStartSeconds = lastEntry ? getEntryTimeToExecutionSeconds(lastEntry, now) : 0
      let delayHint = lastEntry
        ? getSkillAftercastSeconds(lastEntry.skill)
        : Math.max(0, Number.isFinite(initialDelayHint) ? initialDelayHint : 0)

      while (plan.length < depth) {
        const cooldownFloor = resolveMonsterCooldownFloor(cooldowns)
        const entryDelay = Math.max(delayHint, cooldownFloor)
        const scheduledSeconds = lastStartSeconds + entryDelay
        const skill = this.selectMonsterSkill(entryDelay, cooldowns)
        const scheduledAt = now + scheduledSeconds * 1000
        const comboPreview = createComboPreviewInfo(skill)
        plan.push({
          skill,
          scheduledAt,
          prepDuration: scheduledSeconds,
          comboPreview,
        })
        cooldowns = buildSkillStateSnapshot(cooldowns, entryDelay)
        if (skill) {
          cooldowns[skill.id] = skill.cooldown
        }
        lastStartSeconds = scheduledSeconds
        delayHint = getSkillAftercastSeconds(skill)
      }

      this.monsterSkillPlan = plan
      this.syncMonsterSkillPlanPreview()
    },
    selectMonsterSkill(delaySeconds: number, baseCooldowns?: Record<string, number>): MonsterSkillDefinition | null {
      const monster = this.monster
      if (!monster) return null
      const selector = monster.skillSelector ?? resolveMonsterSkillSelector(monster)
      const profile = monster.skillProfile ?? resolveMonsterSkillProfile(monster)
      const skillStates = buildSkillStateSnapshot(baseCooldowns ?? this.monsterSkillCooldowns, delaySeconds)
      const rng = makeRng(this.monsterRngSeed ^ 0x3c6ef372)
      this.monsterRngSeed = (this.monsterRngSeed + 0xa4093822) >>> 0
      const choice = selector({ monster, skillStates, rng })
      if (!choice) return null
      return findMonsterSkill(profile, choice, monster, rng)
    },
    setupMonsterComboTelegraph(skill: MonsterSkillDefinition | null, delaySeconds: number) {
      const comboPreview = createComboPreviewInfo(skill)
      if (!skill || !comboPreview) {
        this.monsterFollowupPreview = null
        return
      }
      const hits = skill.hits
      const baseHit = hits[0]
      const firstExtraDelay = comboPreview.hits[0]?.delay ?? 0
      const timer = Math.max(
        0,
        Math.max(delaySeconds, 0) + Math.max(firstExtraDelay - comboPreview.baseDelay, 0),
      )
      const now = this.lastTickAt || getNow()
      this.monsterFollowupPreview = {
        source: skill.id,
        skillId: skill.id,
        stage: 'telegraph',
        timer,
        delay: firstExtraDelay,
        baseMultiplier: baseHit?.multiplier ?? 1,
        hits: comboPreview.hits,
        nextHitIndex: 0,
        lastHitDelay: comboPreview.baseDelay,
        label: comboPreview.label,
        lastUpdatedAt: now,
      }
    },
    executeReadyMonsterSkill(): boolean {
      if (!this.monster || this.concluded !== 'idle') return false
      if (this.monsterSkillPlan.length === 0) {
        this.extendMonsterSkillPlan()
        return false
      }
      const currentEntry = this.monsterSkillPlan[0]
      if (!currentEntry) return false
      const now = this.lastTickAt || getNow()
      if (currentEntry.scheduledAt > now) return false
      this.monsterSkillPlan = this.monsterSkillPlan.slice(1)
      const resolvedSkill = currentEntry.skill ?? this.selectMonsterSkill(0)
      if (!resolvedSkill) {
        this.monsterCurrentSkill = null
        this.extendMonsterSkillPlan(getSkillAftercastSeconds(currentEntry.skill))
        return false
      }
      this.monsterCurrentSkill = resolvedSkill
      this.monsterSkillCooldowns[resolvedSkill.id] = resolvedSkill.cooldown
      const chargeSeconds = Math.max(0, resolvedSkill.chargeSeconds ?? 0)
      if (chargeSeconds > 0) {
        this.startMonsterSkillCharge(resolvedSkill, chargeSeconds, now)
        return true
      }
      this.monsterAttack(resolvedSkill)
      this.extendMonsterSkillPlan(getSkillAftercastSeconds(resolvedSkill))
      return true
    },
    activateMonsterComboSequence(
      skill: MonsterSkillDefinition | null | undefined,
      baseHit: MonsterSkillHit,
      extraHits: MonsterSkillHit[],
    ) {
      if (!skill || extraHits.length === 0) {
        if (this.monsterFollowupPreview && (!this.monsterFollowupPreview.skillId || this.monsterFollowupPreview.skillId === skill?.id)) {
          this.monsterFollowupPreview = null
        }
        return
      }
      const now = this.lastTickAt || getNow()
      const baseDelay = baseHit.delay ?? 0
      const nextHit = extraHits[0]
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
      if (this.monsterFollowupPreview && this.monsterFollowupPreview.skillId === skill.id) {
        this.monsterFollowupPreview = null
      }
    },
    onMonsterSkillResolved(_skill: MonsterSkillDefinition | null) {
      this.monsterCurrentSkill = null
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
      this.applyDragonBloodQiSpent(amount)
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
    applyPlayerTrueDamage(
      amount: number,
      flash: FlashEffectKind = 'skill',
      options?: { showVisuals?: boolean },
    ) {
      if (!this.monster || this.concluded !== 'idle') return
      let finalDamage = Math.max(0, Math.round(amount))
      if (finalDamage <= 0) return
      const nowMs = getNow()
      const vuln = this.monsterVulnerability
      if (vuln) {
        if (nowMs > vuln.expiresAt) {
          this.monsterVulnerability = null
        } else if (vuln.percent > 0) {
          const mult = 1 + Math.max(vuln.percent, 0)
          finalDamage = Math.round(finalDamage * mult)
        }
      }
      const tigerBonus = this.resolveTigerFuryBonus(nowMs)
      if (tigerBonus > 0) {
        finalDamage = Math.round(finalDamage * (1 + tigerBonus))
      }
      if (finalDamage <= 0) return
      const showVisuals = options?.showVisuals !== false
      if (showVisuals) {
        this.applyPlayerDamage(finalDamage, flash, { weakness: false })
      } else {
        this.monsterHp = Math.max(0, this.monsterHp - finalDamage)
        this.pushFloat(`-${finalDamage}`, 'hitE')
      }
      this.recordCultivationAction('attackHit', 1)
      if (this.concluded !== 'idle') return
      if (this.monsterHp <= 0 && this.monster) {
        const player = usePlayerStore()
        this.handleMonsterDefeat(player)
      }
    },
    addCalamityAshStacks(count: number, perSecondDamage: number, nowMs = getNow()) {
      if (!this.monster || this.concluded !== 'idle') return
      if (!Number.isFinite(count) || count <= 0) return
      const stacks = Math.min(CALAMITY_ASH_MAX_STACKS, Math.max(0, Math.floor(count)))
      const dmgPerSec = Math.max(0, perSecondDamage)
      const layers = Array.isArray(this.monsterCalamityAsh?.layers) ? [...this.monsterCalamityAsh.layers] : []
      for (let i = 0; i < stacks; i += 1) {
        layers.push({
          id: calamityLayerId++,
          appliedAt: nowMs,
          expiresAt: nowMs + CALAMITY_ASH_DURATION_MS,
          nextTickAt: nowMs + CALAMITY_ASH_TICK_MS,
          perSecondDamage: dmgPerSec,
        })
        if (layers.length > CALAMITY_ASH_MAX_STACKS) {
          layers.shift()
        }
      }
      this.monsterCalamityAsh = { layers }
    },
    tickCalamityAsh(nowMs: number) {
      if (!this.monster || this.concluded !== 'idle') {
        this.monsterCalamityAsh = { layers: [] }
        return
      }
      const layers = Array.isArray(this.monsterCalamityAsh?.layers) ? this.monsterCalamityAsh.layers : []
      if (layers.length === 0) return
      const remaining: typeof layers = []
      for (const layer of layers) {
        if (nowMs >= layer.expiresAt) continue
        let nextTickAt = layer.nextTickAt
        while (nowMs >= nextTickAt && nextTickAt <= layer.expiresAt) {
          this.applyPlayerTrueDamage(layer.perSecondDamage, 'skill', { showVisuals: false })
          if (this.concluded !== 'idle' || !this.monster) return
          nextTickAt += CALAMITY_ASH_TICK_MS
        }
        remaining.push({
          ...layer,
          nextTickAt,
        })
      }
      this.monsterCalamityAsh = { layers: remaining }
    },
  explodeCalamityAsh(multiplier: number, nowMs = getNow()) {
    if (!this.monster || this.concluded !== 'idle') {
      this.monsterCalamityAsh = { layers: [] }
      return
    }
      this.tickCalamityAsh(nowMs)
      const layers = Array.isArray(this.monsterCalamityAsh?.layers) ? this.monsterCalamityAsh.layers : []
      if (layers.length === 0) return
      const mult = Math.max(0, multiplier)
      let total = 0
      for (const layer of layers) {
        const remainingSeconds = Math.max(0, (layer.expiresAt - nowMs) / 1000)
        const ticksRemaining = Math.ceil(remainingSeconds)
        total += Math.max(0, layer.perSecondDamage) * ticksRemaining
      }
      this.monsterCalamityAsh = { layers: [] }
      if (total <= 0 || mult <= 0) return
      this.applyPlayerTrueDamage(total * mult, 'ult', { showVisuals: false })
    },
  toggleVioletShroudState(desiredOn: boolean, nowMs: number) {
    if (!this.monster || this.concluded !== 'idle') return
    if (desiredOn) {
      this.playerVioletShroud = { active: true, lastDrainAt: nowMs, drainCarryMs: 0 }
      this.pushFloat('神火罩', 'miss', 'playerBuff')
    } else if (this.playerVioletShroud) {
      this.playerVioletShroud = null
      this.pushFloat('神火罩结束', 'miss')
    }
  },
    tickVioletShroud(nowMs: number) {
      const state = this.playerVioletShroud
      if (!state || !state.active) return
      const player = usePlayerStore()
      const qiMax = Math.max(player.res.qiMax, 0)
      const drainPerTick = qiMax * VIOLET_SHROUD_QI_DRAIN_PER_SEC
      let carry = Math.max(0, nowMs - state.lastDrainAt) + Math.max(0, state.drainCarryMs)
      let lastDrainAt = state.lastDrainAt
      while (carry >= 1000) {
        if (drainPerTick <= 0) break
        if (player.spendQi(drainPerTick)) {
          this.recordQiSpent(drainPerTick)
          carry -= 1000
          lastDrainAt += 1000
        } else {
          this.playerVioletShroud = null
          this.pushFloat('神火罩结束', 'miss')
          this.playerQi = player.res.qi
          this.playerQiMax = player.res.qiMax
          this.qiOperation = cloneQiOperationState(player.res.operation)
          return
        }
      }
      this.playerVioletShroud = {
        active: true,
        lastDrainAt,
        drainCarryMs: carry,
      }
      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)
    },
    handleVioletShroudOnHit(stats: Stats) {
      const shroud = this.playerVioletShroud
      if (!shroud || !shroud.active) return
      const atk = Math.max(stats.totals.ATK ?? 0, 0)
      const dmg = atk * VIOLET_SHROUD_REFLECT_MULTIPLIER
      if (dmg <= 0) return
      this.applyPlayerTrueDamage(dmg, 'skill')
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
      const qiRecoveryMultiplier = this.resolveDragonBloodRecoveryMultiplier()
      player.tickCultivation(deltaSeconds, {
        environment: env,
        qiSpent: this.cultivationFrame.qiSpent,
        extraQiRestored: this.cultivationFrame.extraQiRestored,
        actions: this.cultivationFrame.actions,
        inBattle: true,
        bossBattle: this.monster?.isBoss ?? false,
        recoveryMultiplier: qiRecoveryMultiplier,
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

      if (this.playerSuperArmor && now > this.playerSuperArmor.expiresAt) {
        this.playerSuperArmor = null
      }
      if (this.playerTigerFury) {
        const player = usePlayerStore()
        const isTiger = player.cultivation.method.id === 'tiger_stripe'
        if (!isTiger || now > this.playerTigerFury.expiresAt) {
          this.playerTigerFury = null
        }
      }
      if (this.playerAgiBuff && now > this.playerAgiBuff.expiresAt) {
        this.playerAgiBuff = null
      }
      if (this.monsterVulnerability && now > this.monsterVulnerability.expiresAt) {
        this.monsterVulnerability = null
      }
      if (this.monsterChargingDebuff && now > this.monsterChargingDebuff.expiresAt) {
        this.monsterChargingDebuff = null
      }
      this.tickVioletShroud(now)
      this.tickCalamityAsh(now)
      if (!this.monster || this.concluded !== 'idle') {
        this.stopLoop()
        return
      }
      let monsterStunned = false
      if (this.monsterStunUntil !== null) {
        if (now < this.monsterStunUntil) {
          monsterStunned = true
        } else {
          this.monsterStunUntil = null
        }
      }
      if (!monsterStunned) {
        this.tickMonsterSkillCharge(now)
      }
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

      const nextEntry = this.monsterSkillPlan[0] ?? null
      if (this.monsterChargingSkill) {
        // 更新蓄力剩余时间
        const remainingSeconds = Math.max(0, (this.monsterChargingSkill.endsAt - now) / 1000)
        this.monsterNextSkillTimer = remainingSeconds
      } else if (nextEntry) {
        const timeToNext = getEntryTimeToExecutionSeconds(nextEntry, now)
        this.monsterNextSkillTimer = timeToNext
        this.monsterNextSkillTotal = nextEntry.prepDuration ?? timeToNext
        this.monsterNextSkill = nextEntry.skill
      } else {
        this.monsterNextSkillTimer = 0
        this.monsterNextSkillTotal = 0
        this.monsterNextSkill = null
      }
      if (!monsterStunned && !this.monsterChargingSkill) {
        let actionsResolved = 0
        while (this.monster && this.concluded === 'idle') {
          const headEntry = this.monsterSkillPlan[0]
          if (!headEntry || headEntry.scheduledAt > now) break
          const executed = this.executeReadyMonsterSkill()
          if (!executed) break
          actionsResolved += 1
          if (actionsResolved >= MAX_MONSTER_ACTIONS_PER_TICK) break
          if (this.monsterSkillPlan.length === 0) break
        }
      }

      const followup = this.monsterFollowup
      if (!monsterStunned && followup && this.concluded === 'idle' && this.monster) {
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

      const preview = this.monsterFollowupPreview
      if (!monsterStunned && preview && this.concluded === 'idle' && this.monster) {
        const reference = Number.isFinite(preview.lastUpdatedAt) ? preview.lastUpdatedAt : this.lastTickAt
        let elapsedSeconds = 0
        if (typeof reference === 'number' && Number.isFinite(reference)) {
          elapsedSeconds = Math.max(0, (now - reference) / 1000)
        } else {
          elapsedSeconds = Math.max(0, delta)
        }
        if (elapsedSeconds > 0) {
          preview.timer = Math.max(0, preview.timer - elapsedSeconds)
          preview.lastUpdatedAt = now
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
        const sameKindTexts = this.floatTexts.filter(text => text.kind === kind)
        const offsetIndex = sameKindTexts.length
        const verticalOffset = offsetIndex * 0.06 // 每个同类型提示垂直偏移6%
        x = randomInRange(0.18, 0.38)
        y = randomInRange(0.38, 0.68) - verticalOffset * 0.5
      } else if (kind === 'hitE') {
        const sameKindTexts = this.floatTexts.filter(text => text.kind === kind)
        const offsetIndex = sameKindTexts.length
        const verticalOffset = offsetIndex * 0.06
        x = randomInRange(0.62, 0.82)
        y = randomInRange(0.24, 0.54) - verticalOffset * 0.5
      } else if (kind === 'heal') {
        const sameKindTexts = this.floatTexts.filter(text => text.kind === kind)
        const offsetIndex = sameKindTexts.length
        const verticalOffset = offsetIndex * 0.06
        x = randomInRange(0.22, 0.42)
        y = randomInRange(0.22, 0.5) - verticalOffset * 0.5
      } else if (kind === 'loot') {
        const sameKindTexts = this.floatTexts.filter(text => text.kind === kind)
        const offsetIndex = sameKindTexts.length
        const verticalOffset = offsetIndex * 0.06
        x = randomInRange(0.38, 0.62)
        y = randomInRange(0.18, 0.32) - verticalOffset * 0.5
      } else if (kind === 'miss') {
        // 根据variant区分我方buff和敌方buff
        if (variant === 'playerBuff') {
          // 我方buff：靠近左侧（玩家侧）
          const sameKindTexts = this.floatTexts.filter(text => text.kind === kind && text.variant === 'playerBuff')
          const offsetIndex = sameKindTexts.length
          const verticalOffset = offsetIndex * 0.08
          x = randomInRange(0.25, 0.40)
          y = randomInRange(0.45, 0.60) - verticalOffset * 0.5
        } else if (variant === 'enemyBuff') {
          // 敌方buff：靠近右侧（敌人侧）
          const sameKindTexts = this.floatTexts.filter(text => text.kind === kind && text.variant === 'enemyBuff')
          const offsetIndex = sameKindTexts.length
          const verticalOffset = offsetIndex * 0.08
          x = randomInRange(0.60, 0.75)
          y = randomInRange(0.30, 0.45) - verticalOffset * 0.5
        } else {
          // 其他miss类型提示（原有逻辑）
          const sameKindTexts = this.floatTexts.filter(text => text.kind === kind && !text.variant)
          const offsetIndex = sameKindTexts.length
          const verticalOffset = offsetIndex * 0.06
          x = 0.5
          y = 0.5 - verticalOffset * 0.3
        }
      }

      this.floatTexts.push({ id, x, y, value, kind, variant })
      if (this.floatTexts.length > 12) this.floatTexts.shift()

      const lifespan = kind === 'miss' ? 900 : 1400
      setTimeout(() => {
        const index = this.floatTexts.findIndex((text) => text.id === id)
        if (index !== -1) this.floatTexts.splice(index, 1)
      }, lifespan)
    },
    applyDragonBloodQiSpent(amount: number) {
      if (!Number.isFinite(amount) || amount <= 0) return
      const player = usePlayerStore()
      if (player.cultivation.method.id !== 'dragon_blood') {
        this.playerBloodRage = null
        return
      }
      const qiMax = Math.max(player.res.qiMax, 0)
      const threshold = qiMax * DRAGON_BLOOD_STACK_QI_RATIO
      if (threshold <= 0) return
      const current = this.playerBloodRage ?? { stacks: 0, progressQi: 0 }
      let stacks = current.stacks
      let progressQi = current.progressQi + amount
      while (progressQi >= threshold && stacks < DRAGON_BLOOD_MAX_STACKS) {
        progressQi -= threshold
        stacks += 1
      }
      if (stacks >= DRAGON_BLOOD_MAX_STACKS) {
        progressQi = Math.min(progressQi, threshold)
      }
      this.playerBloodRage = { stacks, progressQi }
    },
    clearDragonBloodRage() {
      if (!this.playerBloodRage) return
      this.playerBloodRage = null
    },
    resolveDragonBloodBonus() {
      const player = usePlayerStore()
      if (player.cultivation.method.id !== 'dragon_blood') {
        this.playerBloodRage = null
        return null
      }
      const state = this.playerBloodRage
      if (!state || state.stacks <= 0) return null
      const stacks = Math.min(state.stacks, DRAGON_BLOOD_MAX_STACKS)
      return {
        stacks,
        atkBonus: stacks * DRAGON_BLOOD_STACK_ATK_DEF_BONUS,
        defBonus: stacks * DRAGON_BLOOD_STACK_ATK_DEF_BONUS,
        recoveryBonus: stacks * DRAGON_BLOOD_STACK_RECOVERY_BONUS,
      }
    },
    resolveDragonBloodRecoveryMultiplier(): number {
      const bonus = this.resolveDragonBloodBonus()
      if (!bonus) return 1
      return Math.max(0, 1 + bonus.recoveryBonus)
    },
    applyPlayerBattleStatBonuses(baseStats: Stats): Stats {
      const now = getNow()
      const agiBuff = this.playerAgiBuff && now <= this.playerAgiBuff.expiresAt ? this.playerAgiBuff : null
      if (this.playerAgiBuff && !agiBuff) {
        this.playerAgiBuff = null
      }
      const bonus = this.resolveDragonBloodBonus()
      const atkMultiplier = 1 + Math.max(bonus?.atkBonus ?? 0, 0)
      const defMultiplier = 1 + Math.max(bonus?.defBonus ?? 0, 0)
      const agiMultiplier = agiBuff ? 1 + Math.max(agiBuff.percent, 0) : 1
      if (atkMultiplier === 1 && defMultiplier === 1 && agiMultiplier === 1) return baseStats
      const nextTotals = { ...baseStats.totals }
      const nextSnapshot: Stats['snapshot'] = { ...baseStats.snapshot }

      const applyMultiplier = (key: keyof Stats['totals'], multiplier: number) => {
        const breakdown = baseStats.snapshot[key]
        const body = breakdown?.body ?? 0
        const qi = breakdown?.qi ?? 0
        const bonusPart = breakdown?.bonus ?? 0
        const baseTotal = breakdown?.total ?? body + qi + bonusPart
        const total = Math.max(0, Math.round(baseTotal * multiplier))
        nextTotals[key] = total
        nextSnapshot[key] = {
          body,
          qi,
          bonus: total - body - qi,
          total,
        }
      }

      if (atkMultiplier !== 1) applyMultiplier('ATK', atkMultiplier)
      if (defMultiplier !== 1) applyMultiplier('DEF', defMultiplier)
      if (agiMultiplier !== 1) applyMultiplier('AGI', agiMultiplier)

      return {
        ...baseStats,
        totals: nextTotals,
        snapshot: nextSnapshot,
      }
    },
    gainTigerFuryStack(nowMs: number) {
      const player = usePlayerStore()
      if (player.cultivation.method.id !== 'tiger_stripe') return
      const previous = this.playerTigerFury
      const nextStacks = Math.min(TIGER_FURY_MAX_STACKS, (previous?.stacks ?? 0) + 1)
      this.playerTigerFury = {
        stacks: nextStacks,
        expiresAt: nowMs + TIGER_FURY_DURATION_MS,
        durationMs: TIGER_FURY_DURATION_MS,
      }
      // this.pushFloat(`虎煞 x${nextStacks}`, 'miss', 'playerBuff')
    },
    setTigerFuryStacks(stacks: number, nowMs: number) {
      const player = usePlayerStore()
      if (player.cultivation.method.id !== 'tiger_stripe') return
      const count = Math.min(TIGER_FURY_MAX_STACKS, Math.max(0, Math.floor(stacks)))
      if (count <= 0) {
        this.clearTigerFury()
        return
      }
      this.playerTigerFury = {
        stacks: count,
        expiresAt: nowMs + TIGER_FURY_DURATION_MS,
        durationMs: TIGER_FURY_DURATION_MS,
      }
      this.pushFloat(`虎煞 x${count}`, 'miss', 'playerBuff')
    },
    clearTigerFury() {
      if (!this.playerTigerFury) return
      this.playerTigerFury = null
    },
    resolveTigerFuryBonus(nowMs: number): number {
      const state = this.playerTigerFury
      if (!state) return 0
      const player = usePlayerStore()
      if (player.cultivation.method.id !== 'tiger_stripe') {
        this.playerTigerFury = null
        return 0
      }
      if (nowMs > state.expiresAt) {
        this.playerTigerFury = null
        return 0
      }
      const stacks = Math.min(state.stacks, TIGER_FURY_MAX_STACKS)
      return Math.max(0, stacks * TIGER_FURY_STACK_BONUS)
    },
    triggerFlash(kind: FlashEffectKind) {
      const id = flashId++
      this.flashEffects.push({ id, kind })
      setTimeout(() => {
        this.flashEffects = this.flashEffects.filter((effect) => effect.id !== id)
      }, 760)
    },
    triggerSkillEffect(skillId: string, durationMs = 1100) {
      const id = skillEffectId++
      const expiresAt = getNow() + durationMs
      this.skillEffects.push({ id, skillId, expiresAt })
      setTimeout(() => {
        this.skillEffects = this.skillEffects.filter((effect) => effect.id !== id)
      }, durationMs)
    },
    scheduleRematch(monster: Monster) {
      this.clearRematchTimer()
      const now = getNow()
      let delay = AUTO_REMATCH_BASE_DELAY
      if (this.lastAutoRematchAt !== null) {
        const elapsed = now - this.lastAutoRematchAt
        if (elapsed < AUTO_REMATCH_MIN_INTERVAL) {
          delay = Math.max(delay, AUTO_REMATCH_MIN_INTERVAL - elapsed)
        }
      }
      this.rematchTimer = setTimeout(() => {
        this.rematchTimer = null
        const nextMonster =
          generateMonsterInstanceById(monster.id, { rankOverride: monster.rank }) ?? monster
        this.start(nextMonster)
        this.lastAutoRematchAt = getNow()
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
          inventory.addEquipment(equipment, { markNew: true })
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
    awardCoreDrop(monster: Monster): ItemLootResult | null {
      const drop = monster.rewards.coreDrop
      if (!drop) return null
      const chance = Math.max(0, Math.min(1, drop.chance ?? 0))
      if (chance <= 0) return null
      const rng = makeRng(this.rngSeed ^ CORE_DROP_RNG_MAGIC)
      this.rngSeed = (this.rngSeed + CORE_DROP_RNG_MAGIC) >>> 0
      if (rng() >= chance) {
        return null
      }
      const rawTier = Number(drop.tier)
      if (!Number.isFinite(rawTier)) return null
      const tier = Math.min(9, Math.max(1, Math.floor(rawTier)))
      const config = getCoreShardConfig(tier)
      const itemId = config?.id ?? `${CORE_SHARD_BASE_ID}${tier}`
      const itemName = config?.name ?? `${tier}级晶核`
      const inventory = useInventoryStore()
      inventory.addItem(itemId, 1)
      this.pushFloat(`获得 ${itemName} x1`, 'loot')
      return {
        kind: 'item',
        itemId,
        name: itemName,
        quantity: 1,
      }
    },
    conclude(result: 'victory' | 'defeat', loot: LootResult[] = []) {
      const currentMonster = this.monster
      this.stopLoop()
      this.resetCultivationMetrics()
      const player = usePlayerStore()
      const slotCount = player.skills.loadout.length || SKILL_SLOT_COUNT
      this.concluded = result
      this.floatTexts = []
      this.battleEndedAt = getNow()
      this.loot = loot
      const questsPrepared = this.pendingQuestCompletions.length > 0
        ? [...this.pendingQuestCompletions]
        : undefined
      this.pendingQuestCompletions = []
      if (currentMonster) {
        this.lastOutcome = {
          monsterId: currentMonster.id,
          monsterName: currentMonster.name,
          result,
          drops: loot.length > 0 ? loot : undefined,
          questsPrepared,
        }
      }
      this.monsterHp = 0
      this.skillCooldowns = Array(slotCount).fill(0)
      this.itemCooldowns = {}
      this.monsterNextSkill = null
      this.monsterNextSkillTimer = 0
      this.monsterNextSkillTotal = 0
      this.monsterCurrentSkill = null
      this.monsterChargingSkill = null
      this.lastTickAt = 0
      this.actionLockUntil = null
      this.pendingDodge = null
      this.pendingItemUse = null
      this.monsterFollowup = null
      this.skillCharges = Array(slotCount).fill(null)
      this.activeSkillChargeSlot = null
      this.monsterSkillPlan = []
      this.playerVioletShroud = null
      this.monsterCalamityAsh = { layers: [] }
      this.syncMonsterSkillPlanPreview()
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
      const nowReal = getNow()
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

      const nowReal = getNow()
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
      const definition = ITEMS.find((item) => item.id === pending.itemId)
      const consumedOnUse = isItemConsumedOnUse(definition)

      if (consumedOnUse && !inventory.spend(pending.itemId, 1)) {
        if (!pending.silent) this.pushFloat('无库存', 'miss')
        return
      }

      const beforeHp = player.res.hp
      const beforeQi = player.res.qi
      const beforeOverflow = player.cultivation.realm.overflow

      const result = await player.useItem(pending.itemId)
      if (!result.applied) {
        if (consumedOnUse) {
          inventory.addItem(pending.itemId, 1)
        }
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

      if (result.teleportToMapId) {
        this.exitBattle()
        travelToMap(result.teleportToMapId)
      }
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
      const stats = this.applyPlayerBattleStatBonuses(player.finalStats)
      const rng = makeRng(this.rngSeed)
      this.rngSeed = (this.rngSeed + 0x9e3779b9) >>> 0

      const progress = player.skills.progress[skillId] ?? undefined
      const skillLevel = Math.max(progress?.level ?? 1, 1)
      const calamityPerSecondDamage = Math.max(stats.totals.ATK * 0.1, 0)
      const wasToggleActive = this.isToggleSkillActive(skillId)

      const result = skill.execute({
        stats,
        monster: this.monster,
        rng,
        resources: player.res,
        cultivation: player.cultivation,
        progress,
        battle: {
          tigerFuryStacks: this.playerTigerFury?.stacks ?? 0,
          calamityAshStacks: this.monsterCalamityAsh?.layers?.length ?? 0,
          violetShroudActive: Boolean(this.playerVioletShroud?.active),
        },
      })

      const nowMs = getNow()
      const activeVulnerability = this.monsterVulnerability
      const delayedSpec = result.delayedDamage
      const hasDelayedDamage = Boolean(delayedSpec && Number.isFinite(delayedSpec.delayMs))
      let dmg = Math.max(0, Math.round(result.damage ?? 0))
      const weaknessTriggered = Boolean(result.weaknessTriggered)
      if (!hasDelayedDamage) {
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

        const tigerBonus = this.resolveTigerFuryBonus(nowMs)
        if (tigerBonus > 0 && dmg > 0) {
          const multiplier = 1 + tigerBonus
          dmg = Math.round(dmg * multiplier)
          if (typeof result.coreDamage === 'number') {
            result.coreDamage = Math.round(Math.max(result.coreDamage, 0) * multiplier)
          }
        }
      } else {
        dmg = 0
      }

      const hit = result.hit ?? (hasDelayedDamage ? true : dmg > 0)

      if (!silent) {
        const effectDef = getSkillEffectDefinition(skillId)
        if (effectDef) {
          this.triggerSkillEffect(effectDef.skillId, effectDef.durationMs)
        }
      }

      if (dmg > 0) {
        this.applyPlayerDamage(dmg, skill.flash, { weakness: weaknessTriggered })
        this.recordCultivationAction('attackHit', 1)
        if (skillId === 'star_realm_dragon_blood_break') {
          this.recordCultivationAction('finisherHit', 1)
        }
      } else {
        this.triggerFlash(skill.flash)
      }

      if (hasDelayedDamage) {
        const delayMs = Math.max(delayedSpec?.delayMs ?? 0, 0)
        const pendingDamage = Math.max(0, Math.round(delayedSpec?.damage ?? result.damage ?? 0))
        const pendingCore = delayedSpec?.coreDamage ?? result.coreDamage
        const pendingWeakness = delayedSpec?.weaknessTriggered ?? weaknessTriggered
        const pendingFlash = delayedSpec?.flash ?? skill.flash
        setTimeout(() => {
          if (!this.monster || this.concluded !== 'idle') return
          const applyAt = getNow()
          let finalDamage = pendingDamage
          let finalCore = pendingCore
          const vuln = this.monsterVulnerability
          if (vuln) {
            if (applyAt > vuln.expiresAt) {
              this.monsterVulnerability = null
            } else if (finalDamage > 0 && vuln.percent > 0) {
              const mult = 1 + Math.max(vuln.percent, 0)
              finalDamage = Math.round(finalDamage * mult)
              if (typeof finalCore === 'number') {
                finalCore = Math.round(Math.max(finalCore, 0) * mult)
              }
            }
          }
          const tigerBonusNow = this.resolveTigerFuryBonus(applyAt)
          if (tigerBonusNow > 0 && finalDamage > 0) {
            const mult = 1 + tigerBonusNow
            finalDamage = Math.round(finalDamage * mult)
            if (typeof finalCore === 'number') {
              finalCore = Math.round(Math.max(finalCore, 0) * mult)
            }
          }
          if (finalDamage > 0) {
            this.applyPlayerDamage(finalDamage, pendingFlash, { weakness: pendingWeakness })
            this.recordCultivationAction('attackHit', 1)
            if (skillId === 'star_realm_dragon_blood_break') {
              this.recordCultivationAction('finisherHit', 1)
            }
          } else {
            this.triggerFlash(pendingFlash)
          }
          if (this.concluded !== 'idle') return
          if (this.monsterHp <= 0 && this.monster) {
            this.handleMonsterDefeat(player)
          }
        }, delayMs)
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

      if (result.applyCalamityAshStacks && result.applyCalamityAshStacks > 0) {
        this.addCalamityAshStacks(result.applyCalamityAshStacks, calamityPerSecondDamage, nowMs)
      }

      if (result.triggerCalamityExplosion && result.triggerCalamityExplosion.multiplier > 0 && hit) {
        this.explodeCalamityAsh(result.triggerCalamityExplosion.multiplier, nowMs)
      }

      if (typeof result.toggleVioletShroud === 'boolean') {
        this.toggleVioletShroudState(result.toggleVioletShroud, nowMs)
        const toggledOn = result.toggleVioletShroud && !wasToggleActive
        if (toggledOn) {
          if (this.actionLockUntil !== null && this.actionLockUntil > nowMs) {
            this.actionLockUntil = nowMs
          }
          this.setSkillCooldownForLoadout(player.skills.loadout, skillId, 0)
        }
      }

      if (typeof result.setTigerFuryStacks === 'number') {
        this.setTigerFuryStacks(result.setTigerFuryStacks, nowMs)
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
        const durationMs = Math.max(result.applyVulnerability.durationMs, 0)
        this.monsterVulnerability = {
          percent: Math.max(result.applyVulnerability.percent, 0),
          expiresAt: nowMs + durationMs,
          durationMs,
        }
        this.pushFloat('目标易伤', 'miss', 'enemyBuff')
      }

      if (hit && result.applyPlayerAgiBuff && result.applyPlayerAgiBuff.percent > 0) {
        const durationMs = Math.max(result.applyPlayerAgiBuff.durationMs, 0)
        if (durationMs > 0) {
          this.playerAgiBuff = {
            percent: Math.max(result.applyPlayerAgiBuff.percent, 0),
            expiresAt: nowMs + durationMs,
            durationMs,
          }
          this.pushFloat('敏捷提升', 'miss', 'playerBuff')
        }
      }

      if (result.monsterStunMs && result.monsterStunMs > 0 && hit) {
        this.applyMonsterStun(result.monsterStunMs)
      }

      if (result.superArmorMs && result.superArmorMs > 0) {
        const durationMs = Math.max(result.superArmorMs, 0)
        const label = (result.superArmorLabel || '').trim() || '霸体'
        this.playerSuperArmor = {
          expiresAt: nowMs + durationMs,
          durationMs,
          label,
        }
        this.pushFloat(label, 'miss', 'playerBuff')
      }

      const usage = player.recordSkillUsage(skill, {
        rng,
        baseCooldown: skill.getCooldown(skillLevel),
        hit,
        streak,
        timestamp: nowMs,
      })
      if (usage) {
        if (usage.xpWholeGained > 0) {
          this.pushFloat(`【${skill.name}】XP+${usage.xpWholeGained}`, 'loot')
        }
        if (usage.blockedByRealm && !this.skillRealmNotified[skillId]) {
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

      if (isDodgeSkill(skill)) {
        this.dodgeAttempts += 1
        const attemptTime = getNow()
        const dodgeConfig = resolveDodgeConfig(skill)
        const refundTarget = player.res.qiMax * dodgeConfig.refundPercentOfQiMax
        const refund = Math.min(refundTarget, Math.max(qiCost, 0))
        this.pendingDodge = {
          skillId,
          attemptedAt: attemptTime,
          invincibleUntil: attemptTime + dodgeConfig.windowMs,
          refundAmount: refund,
          consumedQi: qiCost,
          refundGranted: false,
          successText: dodgeConfig.successText,
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

      if (this.originNodeId && this.originNodeInstanceId) {
        const nodeSpawns = useNodeSpawnStore()
        nodeSpawns.handleMonsterDefeat(this.originNodeId, this.originNodeInstanceId)
        this.originNodeInstanceId = null
        this.originNodeId = null
      }

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
      const questLoot: QuestLootResult[] = questResult.drops.map(drop => ({
        kind: 'questItem',
        itemId: drop.itemId,
        name: drop.name,
        quantity: drop.quantity,
        questId: drop.questId,
      }))
      // Show quest item drop notices
      for (const drop of questResult.drops) {
        this.pushFloat(`获得 ${drop.name} x${drop.quantity}`, 'loot')
      }
      // Show quest completion/turn-in notices
      if (questResult.prepared && questResult.prepared.length) {
        this.pendingQuestCompletions.push(...questResult.prepared)
        for (const questId of questResult.prepared) {
          const qName = questStore.definitionMap[questId]?.name ?? questId
          this.pushFloat(`可交付「${qName}」`, 'loot')
        }
      }

      const coreLoot = this.awardCoreDrop(this.monster)
      const loot = [...questLoot, ...this.applyVictoryLoot(this.monster, player)]
      if (coreLoot) {
        loot.unshift(coreLoot)
      }

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
    applyMonsterStun(durationMs: number) {
      if (!this.monster || this.concluded !== 'idle' || durationMs <= 0) return
      const now = getNow()
      const until = now + durationMs
      const wasCharging = Boolean(this.monsterChargingSkill)
      this.monsterStunUntil = this.monsterStunUntil === null ? until : Math.max(this.monsterStunUntil, until)
      this.monsterCurrentSkill = null
      if (this.monsterFollowup) {
        this.monsterFollowup = null
      }
      if (this.monsterFollowupPreview) {
        this.monsterFollowupPreview = null
      }
      if (wasCharging) {
        this.cancelMonsterSkillCharge()
      }
      if (this.monsterSkillPlan.length > 0) {
        const earliest = this.monsterSkillPlan.reduce(
          (minTime, entry) => Math.min(minTime, entry.scheduledAt),
          Number.POSITIVE_INFINITY,
        )
        const requiredAt = now + durationMs
        const offset = Math.max(0, requiredAt - earliest)
        if (offset > 0) {
          this.monsterSkillPlan = this.monsterSkillPlan.map(entry => ({
            ...entry,
            scheduledAt: entry.scheduledAt + offset,
          }))
        }
      }
      if (wasCharging) {
        this.extendMonsterSkillPlan()
      } else {
        this.syncMonsterSkillPlanPreview()
      }
      this.pushFloat('眩晕', 'miss')
    },
    monsterAttack(skill?: MonsterSkillDefinition) {
      if (!this.monster || this.concluded !== 'idle') return
      const currentSkill = skill ?? this.monsterCurrentSkill
      const hits = currentSkill?.hits ?? []
      const baseHit = hits[0]
      let baseMultiplier = baseHit?.multiplier ?? 1
      if (currentSkill?.id && this.monsterFollowupPreview && this.monsterFollowupPreview.skillId === currentSkill.id) {
        this.monsterFollowupPreview = null
      }
      if (hits.length > 1 && baseHit) {
        this.activateMonsterComboSequence(currentSkill, baseHit, hits.slice(1))
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
      const stats = this.applyPlayerBattleStatBonuses(player.finalStats)
      const now = getNow()
      const agiAttacker = resolveMonsterAgi(this.monster)
      const agiDefender = stats.totals.AGI ?? 0

      let dodged = false
      const dodgeAttempt = this.pendingDodge
      if (dodgeAttempt) {
        const windowStart = dodgeAttempt.attemptedAt
        const windowEnd = dodgeAttempt.invincibleUntil
        if (now >= windowStart && now <= windowEnd) {
          const chance = resolveDodgeSuccessChance(agiAttacker, agiDefender)
          if (chance > 0 && randBool(rng, chance)) {
            dodged = true
            // const successText = dodgeAttempt.successText || '闪避!'
            // this.pushFloat(successText, 'miss')
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
        }
        if (now >= windowEnd) {
          this.pendingDodge = null
        } else {
          this.pendingDodge = dodgeAttempt
        }
      }

      if (dodged) {
        this.dodgeSuccesses += 1
        this.gainTigerFuryStack(now)
        if (dodgeAttempt?.skillId === 'fire_feather_flash') {
          const perSecondDamage = Math.max(stats.totals.ATK * 0.1, 0)
          if (perSecondDamage > 0) {
            this.addCalamityAshStacks(1, perSecondDamage, now)
          }
        }
        this.playerQi = player.res.qi
        this.playerQiMax = player.res.qiMax
        this.qiOperation = cloneQiOperationState(player.res.operation)
        return
      }

      // Check for super armor (invincibility)
      if (this.playerSuperArmor && now <= this.playerSuperArmor.expiresAt) {
        // this.pushFloat('霸体!', 'miss')
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
      const weakness = resolveWeaknessDamage(damageResult.damage, agiAttacker, agiDefender, randRange(rng, 0, 1))

      const multiplier = Math.max(damageMultiplier, 0)
      let incoming = Math.max(0, weakness.damage)
      if (multiplier !== 1) {
        incoming *= multiplier
      }
      // Qi Shielding (BATTLE.md §4.3)
      const f = Math.max(0, Math.min(1, player.res.operation.fValue || 0))
      const shroudActive = Boolean(this.playerVioletShroud?.active)
      if ((player.res.operation.mode !== 'idle') && f > 0 && incoming > 0) {
        const ratioEff = 0.90 * f
        const absorbedCapBase = shroudActive ? VIOLET_SHROUD_SHIELD_CAP : 0.60
        const absorbedCap = Math.max(0, Math.min(absorbedCapBase * incoming, incoming))
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
      if (dealt > 0) {
        this.clearTigerFury()
      }
      if (shroudActive && dealt > 0) {
        this.handleVioletShroudOnHit(stats)
      }
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
