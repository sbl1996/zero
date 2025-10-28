import { defineStore } from 'pinia'
import { dmgAttack, getDefRefForRealm, resolveWeaknessDamage } from '@/composables/useDamage'
import { CULTIVATION_ACTION_WEIGHTS, DEFAULT_WARMUP_SECONDS, applyDeltaBp } from '@/composables/useLeveling'
import { resolveSkillAftercast, resolveSkillChargeTime, resolveSkillCooldown, resolveQiCost } from '@/composables/useSkills'
import { makeRng, randRange } from '@/composables/useRng'
import { bossUnlockMap } from '@/data/monsters'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { ITEMS } from '@/data/items'
import { getDropEntries, rollDropCount, weightedPick } from '@/data/drops'
import type { EquipmentTier } from '@/data/drops'
import { getSkillDefinition } from '@/data/skills'
import { MAX_EQUIP_LEVEL } from '@/composables/useEnhance'
import { realmTierContentLevel } from '@/utils/realm'
import type { NumericRealmTier } from '@/utils/realm'
import { useInventoryStore } from './inventory'
import { usePlayerStore } from './player'
import { useProgressStore } from './progress'
import { useUiStore } from './ui'
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
  FloatText,
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

const TICK_INTERVAL_MS = 1000 / 15
const MAX_FRAME_TIME = 0.25
const DEFAULT_MONSTER_ATTACK_INTERVAL = 1.6
const FALLBACK_SKILL_COOLDOWN = 2
export const ITEM_COOLDOWN = 10
const SKILL_SLOT_COUNT = 4
const AUTO_REMATCH_BASE_DELAY = 800
const AUTO_REMATCH_MIN_INTERVAL = 5000
const DODGE_SKILL_ID = 'qi_dodge'
const DODGE_REFUND_PERCENT = 0.04
const GOLDEN_SHEEP_ID = 'boss-golden-sheep'
const GOLDEN_SHEEP_DOUBLE_STRIKE_CHANCE = 0.20
const GOLDEN_SHEEP_DOUBLE_STRIKE_INTERVAL = 0.25
const GOLDEN_SHEEP_DOUBLE_STRIKE_MULTIPLIER = 0.60
const GOLDEN_SHEEP_FOLLOWUP_LABEL = '×2'

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

function resolveMonsterAttackInterval(monster: Monster | null | undefined): number {
  if (!monster) return DEFAULT_MONSTER_ATTACK_INTERVAL
  return monster.attackInterval > 0 ? monster.attackInterval : DEFAULT_MONSTER_ATTACK_INTERVAL
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
    monsterTimer: DEFAULT_MONSTER_ATTACK_INTERVAL,
    skillCooldowns: Array(SKILL_SLOT_COUNT).fill(0),
    itemCooldowns: {},
    actionLockUntil: null,
    pendingDodge: null,
    pendingSkillCast: null,
    monsterFollowup: null,
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
      this.monster = null
      this.monsterHp = 0
      this.monsterQi = 0
      this.concluded = 'idle'
      this.floatTexts = []
      this.flashEffects = []
      this.rematchTimer = null
      this.skillCooldowns = Array(this.skillCooldowns.length || SKILL_SLOT_COUNT).fill(0)
      this.itemCooldowns = {}
      this.actionLockUntil = null
      this.pendingDodge = null
      this.pendingSkillCast = null
      this.monsterFollowup = null
      this.monsterTimer = DEFAULT_MONSTER_ATTACK_INTERVAL
      this.lastTickAt = 0
      this.battleStartedAt = null
      this.battleEndedAt = null
      this.playerQi = 0
      this.playerQiMax = 0
      this.qiOperation = defaultQiOperationState()
      this.resetCultivationMetrics()
      const player = usePlayerStore()
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
      this.actionLockUntil = null
      this.pendingDodge = null
      this.pendingSkillCast = null
      this.monsterFollowup = null
      this.monsterTimer = resolveMonsterAttackInterval(monster)
      this.lastTickAt = getNow()
      this.skillChain = {
        lastSkillId: null,
        targetId: monster.id ?? null,
        streak: 0,
      }
      this.skillRealmNotified = {}
      this.skillCooldownBonuses = {}
      this.monsterVulnerability = null
      this.scheduleGoldenSheepFollowupTelegraph()
      this.startLoop()
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
    scheduleGoldenSheepFollowupTelegraph() {
      if (!this.monster || this.concluded !== 'idle') return
      if (this.monster.id !== GOLDEN_SHEEP_ID) return
      if (this.monsterFollowup) return
      const timeToNextAttack = Math.max(0, this.monsterTimer)
      const rng = makeRng(this.rngSeed ^ 0x3c6ef372)
      this.rngSeed = (this.rngSeed + 0xa4093822) >>> 0
      const roll = randRange(rng, 0, 1)
      if (roll > GOLDEN_SHEEP_DOUBLE_STRIKE_CHANCE) return
      this.monsterFollowup = {
        source: 'golden_sheep_double_strike',
        stage: 'telegraph',
        timer: timeToNextAttack + GOLDEN_SHEEP_DOUBLE_STRIKE_INTERVAL,
        delay: GOLDEN_SHEEP_DOUBLE_STRIKE_INTERVAL,
        damageMultiplier: GOLDEN_SHEEP_DOUBLE_STRIKE_MULTIPLIER,
        label: GOLDEN_SHEEP_FOLLOWUP_LABEL,
      }
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

      this.resolvePendingSkillCast(now)
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

      this.monsterTimer -= delta
      let attacksResolved = 0
      while (this.monsterTimer <= 0 && this.concluded === 'idle' && this.monster) {
        const interval = resolveMonsterAttackInterval(this.monster)
        this.monsterAttack()
        this.monsterTimer += interval
        attacksResolved += 1
      }

      if (attacksResolved > 0) {
        this.scheduleGoldenSheepFollowupTelegraph()
      }

      const followup = this.monsterFollowup
      if (followup && this.concluded === 'idle' && this.monster) {
        followup.timer -= delta
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
      this.skillCooldowns = Array(this.skillCooldowns.length || SKILL_SLOT_COUNT).fill(0)
      this.itemCooldowns = {}
      this.monsterTimer = DEFAULT_MONSTER_ATTACK_INTERVAL
      this.lastTickAt = 0
      this.actionLockUntil = null
      this.pendingDodge = null
      this.pendingSkillCast = null
      this.monsterFollowup = null
      const player = usePlayerStore()
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
      const now = getNow()
      if (this.actionLockUntil !== null && now < this.actionLockUntil) {
        if (!silent) this.pushFloat('动作硬直中', 'miss')
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

      let qiCost = 0
      if (skill.cost.type === 'qi') {
        qiCost = resolveQiCost(skill, level, player.res.qiMax)
        if (qiCost > 0 && !player.spendQi(qiCost)) {
          if (!silent) this.pushFloat('斗气不足', 'miss')
          return false
        }
        if (qiCost > 0) this.recordQiSpent(qiCost)
      }
      const chargeTime = resolveSkillChargeTime(skill, level)
      const aftercastTime = resolveSkillAftercast(skill, level)
      const totalLockMs = (chargeTime + aftercastTime) * 1000
      if (totalLockMs > 0) {
        const unlockAt = now + totalLockMs
        this.actionLockUntil = this.actionLockUntil === null ? unlockAt : Math.max(this.actionLockUntil, unlockAt)
      }

      let skillCooldown = resolveSkillCooldown(skill, level, FALLBACK_SKILL_COOLDOWN)
      const bonus = this.skillCooldownBonuses[skillId]
      if (bonus) {
        if (nowReal <= bonus.expiresAt) {
          const reduction = Math.min(Math.max(bonus.reductionPercent, 0), 0.9)
          skillCooldown *= Math.max(0, 1 - reduction)
        }
        delete this.skillCooldownBonuses[skillId]
      }
      for (let index = 0; index < loadout.length; index += 1) {
        if (loadout[index] === skillId) {
          this.skillCooldowns[index] = skillCooldown
        }
      }
      if (chargeTime > 0) {
        this.pendingSkillCast = {
          skillId,
          resolveAt: now + chargeTime * 1000,
          qiCost,
          silent,
        }
        return true
      }

      return this.executeSkillEffect(skill, skillId, qiCost, silent)
    },
    resolvePendingSkillCast(nowMs: number) {
      const pending = this.pendingSkillCast
      if (!pending) return
      if (pending.resolveAt > nowMs) return
      const skill = getSkillDefinition(pending.skillId)
      this.pendingSkillCast = null
      if (!skill) return
      this.executeSkillEffect(skill, pending.skillId, pending.qiCost, pending.silent)
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

      const loot = this.applyVictoryLoot(this.monster, player)

      const now = Date.now()
      const strength = Math.max(1, resolveMonsterRealmPower(this.monster))
      const rewardDelta = this.monster.rewards.deltaBp
      const baseDelta = typeof rewardDelta === 'number' ? Math.max(rewardDelta, 0) : 0.0025 * strength
      const deltaResult = applyDeltaBp(player.cultivation, baseDelta, now)
      if (deltaResult.applied > 0 || deltaResult.overflow > 0) {
        if (deltaResult.applied > 0) this.pushFloat(`ΔBP+${deltaResult.applied.toFixed(2)}`, 'loot')
        if (deltaResult.overflow > 0 || player.cultivation.realm.bottleneck) {
          this.pushFloat('储能溢出/瓶颈', 'miss')
        }
        player.refreshDerived()
      }

      this.conclude('victory', loot)
    },
    async useItem(itemId: string, options?: { silent?: boolean }): Promise<boolean> {
      if (!this.monster || this.concluded !== 'idle') return false

      const silent = options?.silent ?? false
      const now = getNow()
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

      const used = inventory.spend(itemId, 1)
      if (!used) {
        if (!silent) this.pushFloat('无库存', 'miss')
        return false
      }

      const beforeHp = player.res.hp
      const beforeQi = player.res.qi
      const beforeOverflow = player.cultivation.realm.overflow
      const applied = await player.useItem(itemId)
      if (!applied) {
        inventory.addItem(itemId, 1)
        if (!silent) this.pushFloat('未生效', 'miss')
        return false
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

      this.itemCooldowns[itemId] = ITEM_COOLDOWN
      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)
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
    monsterAttack() {
      if (!this.monster || this.concluded !== 'idle') return
      if (this.monsterFollowup && this.monsterFollowup.stage === 'telegraph') {
        this.monsterFollowup.stage = 'active'
        this.monsterFollowup.timer = this.monsterFollowup.delay
      }
      const rng = makeRng(this.rngSeed ^ 0x517cc1b7)
      this.rngSeed = (this.rngSeed + 0x7f4a7c15) >>> 0

      this.resolveMonsterAttackWithRng(rng, 1)
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
      this.monsterFollowup = null
      if (!followup) return
      if (!this.monster || this.concluded !== 'idle') return
      const rng = makeRng(this.rngSeed ^ 0xd2511f53)
      this.rngSeed = (this.rngSeed + 0x94d049bb) >>> 0
      this.resolveMonsterAttackWithRng(rng, followup.damageMultiplier)
      if (this.concluded === 'idle') {
        this.scheduleGoldenSheepFollowupTelegraph()
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
