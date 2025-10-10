import { defineStore } from 'pinia'
import { dmgAttack } from '@/composables/useDamage'
import { makeRng, randRange } from '@/composables/useRng'
import { PAGES } from '@/data/monsters'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { ITEMS } from '@/data/items'
import { getDropEntries, rollDropCount, weightedPick } from '@/data/drops'
import type { EquipmentTier } from '@/data/drops'
import { getSkillDefinition } from '@/data/skills'
import { useInventoryStore } from './inventory'
import { usePlayerStore } from './player'
import { useProgressStore } from './progress'
import type { BattleState, Monster, FlashEffectKind, Equipment, EquipSlot, LootResult, ItemLootResult } from '@/types/domain'

const ITEM_MAP = new Map(ITEMS.map((item) => [item.id, item]))

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

function createEquipmentFromTemplate(template: (typeof BASE_EQUIPMENT_TEMPLATES)[number]): Equipment {
  return {
    id: makeEquipmentId(template.id),
    name: template.name,
    slot: template.slot,
    level: 0,
    mainStat: { ...template.baseMain },
    subs: { ...template.baseSubs },
    exclusive: template.exclusive,
    flatCapMultiplier: template.flatCapMultiplier,
    requiredLevel: template.requiredLevel,
  }
}

function drawEquipmentFromTier(tier: EquipmentTier, rng: () => number): Equipment | null {
  const grouped = EQUIPMENT_TEMPLATES_BY_TIER[tier]
  if (!grouped) return null
  const slots = Object.keys(grouped) as EquipSlot[]
  if (!slots.length) return null
  const slot = slots[Math.floor(rng() * slots.length)]
  const templates = grouped[slot]
  if (!templates || !templates.length) return null
  const template = templates[Math.floor(rng() * templates.length)]
  if (!template) return null
  return createEquipmentFromTemplate(template)
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
    turn: 'player',
    rngSeed: Date.now() >>> 0,
    floatTexts: [],
    flashEffects: [],
    concluded: 'idle',
    lastOutcome: null,
    rematchTimer: null,
    loot: [],
  }
}

let floatId = 1
let flashId = 1

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min
}

export const useBattleStore = defineStore('battle', {
  state: () => initialState(),
  getters: {
    inBattle(state) {
      // When victory is achieved and a rematch is scheduled, we are technically still "in battle"
      // This prevents UI elements from flashing between battles
      return !!state.monster && (state.concluded === 'idle' || (state.concluded === 'victory' && state.rematchTimer !== null))
    },
  },
  actions: {
    reset() {
      this.clearRematchTimer()
      Object.assign(this, initialState())
    },
    exitBattle() {
      this.clearRematchTimer()
      this.monster = null
      this.monsterHp = 0
      this.turn = 'player'
      this.concluded = 'idle'
      this.floatTexts = []
      this.flashEffects = []
      this.lastOutcome = null
      this.rematchTimer = null
      this.loot = []
    },
    start(monster: Monster, seed?: number) {
      this.clearRematchTimer()
      this.monster = monster
      this.monsterHp = monster.hpMax
      this.turn = 'player'
      this.concluded = 'idle'
      this.floatTexts = []
      this.flashEffects = []
      this.rngSeed = (seed ?? Date.now()) >>> 0
      this.lastOutcome = null
      this.loot = []
    },
    clearRematchTimer() {
      if (this.rematchTimer !== null) {
        clearTimeout(this.rematchTimer)
        this.rematchTimer = null
      }
    },
    pushFloat(value: string, kind: 'hitP' | 'hitE' | 'heal' | 'miss') {
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
      this.rematchTimer = setTimeout(() => {
        this.rematchTimer = null
        this.start(monster)
      }, 800)
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

      for (let index = 0; index < dropCount; index += 1) {
        const choice = weightedPick(entries, lootRng)
        if (!choice) continue

        if (choice.kind === 'item') {
          const quantity = choice.quantity ?? 1
          if (quantity <= 0) continue
          inventory.addItem(choice.itemId, quantity)
          aggregateItemDrop(itemDrops, choice.itemId, quantity)
        } else if (choice.kind === 'equipment') {
          const equipment = drawEquipmentFromTier(choice.tier, lootRng)
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
            if (bonus > 0) extraGold += bonus
          }
        }
      }

      if (extraGold > 0) {
        player.gainGold(extraGold)
      }

      const lootResults: LootResult[] = []
      if (equipmentDrops.length > 0) {
        lootResults.push(...equipmentDrops)
      }
      if (itemDrops.size > 0) {
        lootResults.push(...itemDrops.values())
      }
      if (extraGold > 0) {
        lootResults.push({
          kind: 'gold',
          name: '额外金币',
          amount: extraGold,
        })
      }

      return lootResults
    },
    conclude(result: 'victory' | 'defeat', loot: LootResult[] = []) {
      const currentMonster = this.monster
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
      this.turn = 'player'
      this.monsterHp = 0
      if (result === 'victory') {
        if (currentMonster) {
          this.scheduleRematch(currentMonster)
        }
      } else {
        this.clearRematchTimer()
        this.monster = null
        this.monsterHp = 0
      }
    },
    playerUseSkill(slotIndex: number) {
      if (!this.monster || this.concluded !== 'idle' || this.turn !== 'player') return

      const player = usePlayerStore()
      const skillId = player.skills.loadout[slotIndex] ?? null
      if (!skillId) {
        this.pushFloat('未装备技能', 'miss')
        return
      }
      const skill = getSkillDefinition(skillId)
      if (!skill) {
        this.pushFloat('技能不存在', 'miss')
        return
      }

      const cost = skill.cost
      if (cost.type === 'sp') {
        const amount = cost.amount ?? 0
        if (!player.spendSp(amount)) {
          this.pushFloat('SP不足', 'miss')
          return
        }
      } else if (cost.type === 'xp') {
        const amount = cost.amount ?? 0
        if (!player.spendXp(amount)) {
          this.pushFloat('XP不足', 'miss')
          return
        }
      }

      const stats = player.finalStats
      const rng = makeRng(this.rngSeed)
      this.rngSeed = (this.rngSeed + 0x9e3779b9) >>> 0
      const rewardOnHit = (dmg: number) => {
        if (!this.monster || dmg <= 0) return
        player.gainXp(1)
      }

      const result = skill.execute({ stats, monster: this.monster, rng })
      const dmg = Math.max(0, Math.round(result.damage ?? 0))
      if (dmg > 0) {
        this.applyPlayerDamage(dmg, skill.flash)
        rewardOnHit(dmg)
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

      if (this.concluded !== 'idle') return

      if (this.monsterHp <= 0 && this.monster) {
        player.gainExp(this.monster.rewardExp)
        player.gainGold(this.monster.rewardGold)

        const progress = useProgressStore()
        progress.markMonsterCleared(this.monster.id)
        const pageIndex = PAGES.indexOf(this.monster.page)
        const nextPage = PAGES[pageIndex + 1]
        if (typeof nextPage === 'number') {
          progress.unlockPage(nextPage)
        }

        const loot = this.applyVictoryLoot(this.monster, player)
        if (loot.length > 0) {
          loot.forEach((entry) => {
            if (entry.kind === 'item') {
              this.pushFloat(`掉落：${entry.name} x${entry.quantity}`, 'heal')
            } else if (entry.kind === 'equipment') {
              this.pushFloat(`掉落：${entry.name}`, 'heal')
            } else if (entry.kind === 'gold') {
              this.pushFloat(`额外金币 +${entry.amount}`, 'heal')
            }
          })
        }

        this.conclude('victory', loot)
        return
      }

      this.turn = 'enemy'
      this.enemyTurn()
    },
    useItem(itemId: string) {
      if (!this.monster || this.concluded !== 'idle' || this.turn !== 'player') return

      const inventory = useInventoryStore()
      const player = usePlayerStore()
      const def = ITEMS.find(item => item.id === itemId)

      if (!def || (!('heal' in def && def.heal) && !('restoreSp' in def && def.restoreSp) && !('restoreXp' in def && def.restoreXp))) {
        this.pushFloat('无法使用', 'miss')
        return
      }

      const used = inventory.spend(itemId, 1)
      if (!used) {
        this.pushFloat('无库存', 'miss')
        return
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

      this.turn = 'enemy'
      this.enemyTurn()
    },
    applyPlayerDamage(dmg: number, source: 'attack' | 'skill' | 'ult') {
      this.monsterHp = Math.max(0, this.monsterHp - dmg)
      this.pushFloat(`-${dmg}`, 'hitE')
      this.triggerFlash(source)
    },
    enemyTurn() {
      if (!this.monster || this.concluded !== 'idle') return
      const player = usePlayerStore()
      const stats = player.finalStats
      const rng = makeRng(this.rngSeed ^ 0x517cc1b7)
      this.rngSeed = (this.rngSeed + 0x7f4a7c15) >>> 0
      const penPct = Math.min(Math.max(0.1 + 0.012 * this.monster.lv, 0), 0.6)
      const dmg = dmgAttack(this.monster.atk, stats.DEF, randRange(rng, 0, 1), { penPct })
      player.receiveDamage(dmg)
      this.pushFloat(`-${dmg}`, 'hitP')

      if (player.res.hp <= 0) {
        this.applyDeathPenalty()
        this.conclude('defeat')
        return
      }

      this.turn = 'player'
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
