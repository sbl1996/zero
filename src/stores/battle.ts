import { defineStore } from 'pinia'
import { dmgAttack } from '@/composables/useDamage'
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
import type { BattleState, Monster, FlashEffectKind, Equipment, EquipSlot, LootResult, ItemLootResult } from '@/types/domain'

const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]))

const TICK_INTERVAL_MS = 1000 / 15
const MAX_FRAME_TIME = 0.25
const MONSTER_ATTACK_INTERVAL = 1.6
const FALLBACK_SKILL_COOLDOWN = 2
export const ITEM_COOLDOWN = 10
const SKILL_SLOT_COUNT = 4
const AUTO_REMATCH_BASE_DELAY = 800
const AUTO_REMATCH_MIN_INTERVAL = 5000

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

function initialState(): BattleState {
  return {
    monster: null,
    monsterHp: 0,
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
    monsterTimer: MONSTER_ATTACK_INTERVAL,
    skillCooldowns: Array(SKILL_SLOT_COUNT).fill(0),
    itemCooldowns: {},
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
    },
    exitBattle() {
      this.stopLoop()
      this.clearRematchTimer()
      this.monster = null
      this.monsterHp = 0
      this.concluded = 'idle'
      this.floatTexts = []
      this.flashEffects = []
      this.rematchTimer = null
      this.skillCooldowns = Array(this.skillCooldowns.length || SKILL_SLOT_COUNT).fill(0)
      this.itemCooldowns = {}
      this.monsterTimer = MONSTER_ATTACK_INTERVAL
      this.lastTickAt = 0
      // 保留lastOutcome和loot以便在结算页面显示
      // this.lastOutcome = null
      // this.loot = []
    },
    start(monster: Monster, seed?: number) {
      this.clearRematchTimer()
      this.stopLoop()
      this.monster = monster
      this.monsterHp = monster.hpMax
      this.concluded = 'idle'
      this.floatTexts = []
      this.flashEffects = []
      this.rngSeed = (seed ?? Date.now()) >>> 0
      this.lastOutcome = null
      this.loot = []
      const player = usePlayerStore()
      const slotCount = player.skills.loadout.length || SKILL_SLOT_COUNT
      this.skillCooldowns = Array(slotCount).fill(0)
      this.itemCooldowns = {}
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
    tick() {
      if (!this.monster || this.concluded !== 'idle') {
        this.stopLoop()
        return
      }

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
            const bonus = Math.round(monster.rewardGold * (multiplier - 1))
            if (bonus > 0) {
              extraGold += bonus
              hasExtraGold = true
            }
          }
        }
      }

      let totalGold = monster.rewardGold
      if (hasExtraGold) {
        totalGold += extraGold
      }

      if (totalGold > monster.rewardGold) {
        player.gainGold(totalGold)
      }

      const lootResults: LootResult[] = []
      if (equipmentDrops.length > 0) {
        lootResults.push(...equipmentDrops)
      }
      if (itemDrops.size > 0) {
        lootResults.push(...itemDrops.values())
      }
      if (totalGold > monster.rewardGold) {
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
      this.concluded = result
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

      const cooldownRemaining = this.getSkillCooldown(slotIndex)
      if (cooldownRemaining > 0) {
        if (!silent) this.pushFloat(`冷却中 ${cooldownRemaining.toFixed(1)}s`, 'miss')
        return false
      }

      const cost = skill.cost
      if (cost.type === 'sp') {
        const amount = cost.amount ?? 0
        if (!player.spendSp(amount)) {
          if (!silent) this.pushFloat('SP不足', 'miss')
          return false
        }
      } else if (cost.type === 'xp') {
        const amount = cost.amount ?? 0
        if (!player.spendXp(amount)) {
          if (!silent) this.pushFloat('XP不足', 'miss')
          return false
        }
      }

      const stats = player.finalStats
      const rng = makeRng(this.rngSeed)
      this.rngSeed = (this.rngSeed + 0x9e3779b9) >>> 0
      const rewardOnHit = (coreDamage: number) => {
        if (!this.monster || coreDamage <= 0) return
        player.gainXp(1)
      }

      const result = skill.execute({ stats, monster: this.monster, rng, playerLevel: player.lv })
      const dmg = Math.max(0, Math.round(result.damage ?? 0))
      const coreDamage = Math.max(0, Math.round(result.coreDamage ?? 0))
      if (dmg > 0) {
        this.applyPlayerDamage(dmg, skill.flash)
        rewardOnHit(coreDamage)
      } else {
        this.triggerFlash(skill.flash)
      }

      if (result.healSelf && result.healSelf > 0) {
        player.heal(result.healSelf)
        this.pushFloat(`+${result.healSelf}`, 'heal')
      }
      if (result.gainSp && result.gainSp > 0) {
        player.restoreSp(result.gainSp)
        this.pushFloat(`SP+${result.gainSp}`, 'heal')
      }
      if (result.gainXp && result.gainXp > 0) {
        player.restoreXp(result.gainXp)
        this.pushFloat(`XP+${result.gainXp}`, 'heal')
      }
      if (result.message) {
        this.pushFloat(result.message, 'miss')
      }

      const skillCooldown = skill.cooldown ?? FALLBACK_SKILL_COOLDOWN
      for (let index = 0; index < loadout.length; index += 1) {
        if (loadout[index] === skillId) {
          this.skillCooldowns[index] = skillCooldown
        }
      }

      if (this.concluded !== 'idle') return true

      if (this.monsterHp <= 0 && this.monster) {
        player.gainExp(this.monster.rewardExp)
        player.gainGold(this.monster.rewardGold)

        const progress = useProgressStore()
        progress.markMonsterCleared(this.monster.id)

        // 只有击败BOSS才会解锁下一个地图
        if (this.monster.isBoss) {
          const nextMapId = bossUnlockMap[this.monster.id]
          if (nextMapId) {
            progress.unlockMap(nextMapId)
          }
        }

        const loot = this.applyVictoryLoot(this.monster, player)

        this.conclude('victory', loot)
        return true
      }

      return true
    },
    useItem(itemId: string, options?: { silent?: boolean }): boolean {
      if (!this.monster || this.concluded !== 'idle') return false

      const silent = options?.silent ?? false
      const cooldownRemaining = this.getItemCooldown(itemId)
      if (cooldownRemaining > 0) {
        if (!silent) this.pushFloat(`冷却中 ${cooldownRemaining.toFixed(1)}s`, 'miss')
        return false
      }

      const inventory = useInventoryStore()
      const player = usePlayerStore()
      const def = ITEMS.find(item => item.id === itemId)

      if (!def || (!('heal' in def && def.heal) && !('restoreSp' in def && def.restoreSp) && !('restoreXp' in def && def.restoreXp))) {
        if (!silent) this.pushFloat('无法使用', 'miss')
        return false
      }

      const used = inventory.spend(itemId, 1)
      if (!used) {
        if (!silent) this.pushFloat('无库存', 'miss')
        return false
      }

      if ('heal' in def && def.heal) {
        player.heal(def.heal)
        this.pushFloat(`+${def.heal}`, 'heal')
      }
      if ('restoreSp' in def && def.restoreSp) {
        player.restoreSp(def.restoreSp)
        this.pushFloat(`SP+${def.restoreSp}`, 'heal')
      }
      if ('restoreXp' in def && def.restoreXp) {
        player.restoreXp(def.restoreXp)
        this.pushFloat(`XP+${def.restoreXp}`, 'heal')
      }

      this.itemCooldowns[itemId] = ITEM_COOLDOWN
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
      const penPct = Math.min(Math.max(0.1 + 0.012 * this.monster.lv, 0), 0.6)
      const damageResult = dmgAttack(this.monster.atk, stats.DEF, randRange(rng, 0, 1), {
        penPct,
        contentLevel: this.monster.lv,
        defenderTough: 1,
        attackerLevel: this.monster.lv,
      })
      player.receiveDamage(damageResult.damage)
      this.pushFloat(`-${damageResult.damage}`, 'hitP')

      if (player.res.hp <= 0) {
        this.applyDeathPenalty()
        this.conclude('defeat')
        return
      }
    },
    applyDeathPenalty() {
      const player = usePlayerStore()

      // Lose all current level experience (player.exp)
      player.exp = 0

      // Lose 1/3 of gold (round down)
      const goldLoss = Math.floor(player.gold / 3)
      player.gold -= goldLoss

      // Show death penalty floating text
      this.pushFloat(`复活! 损失经验值和${goldLoss}G`, 'heal')

      // Show additional penalty details
      this.pushFloat(`失去全部经验值`, 'miss')

      // Full health resurrection
      player.res.hp = player.res.hpMax
      player.res.sp = player.res.spMax
      player.res.xp = player.res.xpMax
    },
  },
})
