import { defineStore } from 'pinia'
import { dmgAttack, getDefRefForRealm } from '@/composables/useDamage'
import { CULTIVATION_ACTION_WEIGHTS, DEFAULT_WARMUP_SECONDS, applyDeltaBp } from '@/composables/useLeveling'
import { makeRng, randRange } from '@/composables/useRng'
import { bossUnlockMap } from '@/data/monsters'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { ITEMS } from '@/data/items'
import { getDropEntries, rollDropCount, weightedPick } from '@/data/drops'
import type { EquipmentTier } from '@/data/drops'
import { getSkillDefinition } from '@/data/skills'
import { MAX_EQUIP_LEVEL } from '@/composables/useEnhance'
import { useInventoryStore } from './inventory'
import { usePlayerStore } from './player'
import { useProgressStore } from './progress'
import { useUiStore } from './ui'
import { DODGE_LOCK_DURATION_MS, DODGE_WINDOW_MS } from '@/constants/dodge'
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
const MONSTER_ATTACK_INTERVAL = 1.6
const FALLBACK_SKILL_COOLDOWN = 2
export const ITEM_COOLDOWN = 10
const SKILL_SLOT_COUNT = 4
const AUTO_REMATCH_BASE_DELAY = 800
const AUTO_REMATCH_MIN_INTERVAL = 5000
const DODGE_SKILL_ID = 'qi_dodge'
const DODGE_REFUND_PERCENT = 0.04

const EQUIPMENT_TIER_LEVEL: Record<EquipmentTier, number> = {
  iron: 1,
  steel: 10,
  knight: 20,
  mithril: 30,
  rune: 40,
  dragon: 50,
  celestial: 60,
}

type EquipmentTemplateDef = (typeof BASE_EQUIPMENT_TEMPLATES)[number]
type TierSlotTemplates = Partial<Record<EquipSlot, EquipmentTemplateDef[]>>

const EQUIPMENT_TEMPLATES_BY_TIER: Record<EquipmentTier, TierSlotTemplates> = Object.entries(EQUIPMENT_TIER_LEVEL).reduce(
  (acc, [tier, requiredLevel]) => {
    const tierTemplates = BASE_EQUIPMENT_TEMPLATES.filter((template) => (template.requiredLevel ?? 0) === requiredLevel)
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
    requiredLevel: template.requiredLevel,
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

function resolveMonsterHpMax(monster: Monster): number {
  if (monster.resources?.hpMax) return monster.resources.hpMax
  if (monster.attributes?.caps.hpMax) return monster.attributes.caps.hpMax
  if (typeof monster.hpMax === 'number') return monster.hpMax
  return 0
}

function resolveMonsterQi(monster: Monster): number {
  if (monster.resources?.qi) return monster.resources.qi
  if (monster.resources?.qiMax) return monster.resources.qiMax
  return 0
}

function resolveMonsterAtk(monster: Monster): number {
  if (monster.attributes?.totals.ATK !== undefined) return monster.attributes.totals.ATK
  if (typeof monster.atk === 'number') return monster.atk
  return 0
}

function resolveMonsterAgi(monster: Monster): number {
  if (monster.attributes?.totals.AGI !== undefined) return monster.attributes.totals.AGI
  if (typeof monster.agi === 'number') return monster.agi
  const level = monster.lv ?? 1
  return 10 + level * 2
}

function resolveMonsterPenetration(monster: Monster) {
  const fallbackLevel = monster.lv ?? 1
  if (monster.penetration) {
    return {
      flat: monster.penetration.flat ?? 0,
      pct: monster.penetration.pct ?? Math.min(Math.max(0.1 + 0.012 * fallbackLevel, 0), 0.6),
    }
  }
  return {
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
    monsterTimer: MONSTER_ATTACK_INTERVAL,
    skillCooldowns: Array(SKILL_SLOT_COUNT).fill(0),
    itemCooldowns: {},
    actionLockUntil: null,
    pendingDodge: null,
    playerQi: 0,
    playerQiMax: 0,
    qiOperation: defaultQiOperationState(),
    cultivationFrame: createEmptyCultivationMetrics(),
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
      this.monsterTimer = MONSTER_ATTACK_INTERVAL
      this.lastTickAt = 0
      this.battleStartedAt = null
      this.battleEndedAt = null
      this.playerQi = 0
      this.playerQiMax = 0
      this.qiOperation = defaultQiOperationState()
      this.resetCultivationMetrics()
      const player = usePlayerStore()
      player.setRecoveryMode('idle')
      // 保留lastOutcome和loot以便在结算页面显示
      // this.lastOutcome = null
      // this.loot = []
    },
    start(monster: Monster, seed?: number) {
      this.clearRematchTimer()
      this.stopLoop()
      this.monster = monster
      this.monsterHp = resolveMonsterHpMax(monster)
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
      this.monsterTimer = MONSTER_ATTACK_INTERVAL
      this.lastTickAt = getNow()
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
      while (this.monsterTimer <= 0 && this.concluded === 'idle' && this.monster) {
        this.monsterAttack()
        this.monsterTimer += MONSTER_ATTACK_INTERVAL
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
    pushFloat(value: string, kind: 'hitP' | 'hitE' | 'heal' | 'miss' | 'loot') {
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

      this.floatTexts.push({ id, x, y, value, kind })
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
      const baseRewardGold = monster.rewardGold ?? 0

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
      this.monsterTimer = MONSTER_ATTACK_INTERVAL
      this.lastTickAt = 0
      this.actionLockUntil = null
      this.pendingDodge = null
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

      let qiCost = 0
      if (skill.cost.type === 'qi') {
        const percent = Math.max(skill.cost.percentOfQiMax ?? 0, 0)
        const base = Math.max(skill.cost.amount ?? 0, 0)
        const mastery = player.mastery.entries[skillId]
        const reduction = Math.min(Math.max(mastery?.bonus.costReduction ?? 0, 0), 0.9)
        qiCost = (base + percent * player.res.qiMax) * (1 - reduction)
        if (qiCost > 0 && !player.spendQi(qiCost)) {
          if (!silent) this.pushFloat('斗气不足', 'miss')
          return false
        }
        if (qiCost > 0) this.recordQiSpent(qiCost)
      }

      const stats = player.finalStats
      const rng = makeRng(this.rngSeed)
      this.rngSeed = (this.rngSeed + 0x9e3779b9) >>> 0

      const result = skill.execute({
        stats,
        monster: this.monster,
        rng,
        resources: player.res,
        cultivation: player.cultivation,
        mastery: player.mastery.entries[skillId] ?? undefined,
      })

      const dmg = Math.max(0, Math.round(result.damage ?? 0))
      if (dmg > 0) {
        this.applyPlayerDamage(dmg, skill.flash)
        this.recordCultivationAction('attackHit', 1)
        if (skillId === 'destiny_slash') {
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

      this.playerQi = player.res.qi
      this.playerQiMax = player.res.qiMax
      this.qiOperation = cloneQiOperationState(player.res.operation)

      if (skillId === DODGE_SKILL_ID) {
        const attemptTime = getNow()
        const refundTarget = player.res.qiMax * DODGE_REFUND_PERCENT
        const refund = Math.min(refundTarget, Math.max(qiCost, 0))
        this.pendingDodge = {
          attemptedAt: attemptTime,
          refundAmount: refund,
          consumedQi: qiCost,
        }
        this.actionLockUntil = attemptTime + DODGE_LOCK_DURATION_MS
      }

      const skillCooldown = skill.cooldown ?? FALLBACK_SKILL_COOLDOWN
      for (let index = 0; index < loadout.length; index += 1) {
        if (loadout[index] === skillId) {
          this.skillCooldowns[index] = skillCooldown
        }
      }

      if (this.concluded !== 'idle') return true

      if (this.monsterHp <= 0 && this.monster) {
        player.gainGold(this.monster.rewardGold ?? 0)

        const progress = useProgressStore()
        progress.markMonsterCleared(this.monster.id)

        if (this.monster.isBoss) {
          const nextMapId = bossUnlockMap[this.monster.id]
          if (nextMapId) {
            progress.unlockMap(nextMapId)
          }
        }

        const loot = this.applyVictoryLoot(this.monster, player)

        // 战斗产出 ΔBP 与战后结算（含溢出/瓶颈提示）
        const now = Date.now()
        const strength = Math.max(1, (this.monster.lv ?? 1))
        const rewardDelta = this.monster.rewards?.deltaBp
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
        return true
      }

      return true
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
    applyPlayerDamage(dmg: number, source: 'attack' | 'skill' | 'ult') {
      this.monsterHp = Math.max(0, this.monsterHp - dmg)
      this.pushFloat(`-${dmg}`, 'hitE')
      this.triggerFlash(source)
    },
    monsterAttack() {
      if (!this.monster || this.concluded !== 'idle') return
      const player = usePlayerStore()
      const stats = player.finalStats
      const rng = makeRng(this.rngSeed ^ 0x517cc1b7)
      this.rngSeed = (this.rngSeed + 0x7f4a7c15) >>> 0
      const now = getNow()

      let dodged = false
      const dodgeAttempt = this.pendingDodge
      if (dodgeAttempt) {
        const elapsedMs = now - dodgeAttempt.attemptedAt
        const windowMs = DODGE_WINDOW_MS
        if (elapsedMs >= 0 && elapsedMs <= windowMs) {
          const playerAgi = stats.totals.AGI
          const enemyAgi = resolveMonsterAgi(this.monster)
          let chance = 0.1 + 0.005 * (playerAgi - enemyAgi)
          const masteryBonus = player.mastery.entries[DODGE_SKILL_ID]?.bonus?.dodge ?? 0
          chance += masteryBonus
          if (chance < 0) chance = 0
          if (chance > 1) chance = 1
          const roll = rng()
          if (roll < chance) {
            dodged = true
            this.pushFloat('闪避!', 'miss')
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
          }
        }
        this.pendingDodge = null
      }

      if (dodged) {
        this.playerQi = player.res.qi
        this.playerQiMax = player.res.qiMax
        this.qiOperation = cloneQiOperationState(player.res.operation)
        return
      }
      const monsterLevel = this.monster.lv ?? 1
      const penetration = resolveMonsterPenetration(this.monster)
      const defRef = getDefRefForRealm(player.cultivation?.realm)
      const damageResult = dmgAttack(resolveMonsterAtk(this.monster), stats.totals.DEF, randRange(rng, 0, 1), {
        penPct: penetration.pct,
        penFlat: penetration.flat,
        defRef: defRef || undefined,
        contentLevel: defRef ? 0 : monsterLevel,
        defenderTough: 1,
      })

      let incoming = Math.max(0, damageResult.damage)
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
        return
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
