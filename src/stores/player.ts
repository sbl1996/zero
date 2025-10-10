import { defineStore } from 'pinia'
import { resolveMainStatBreakdown } from '@/composables/useEnhance'
import { baseHpMax, baseSpMax, baseXpMax, createDefaultPlayer, needExp } from '@/composables/useLeveling'
import { getStartingEquipment } from '@/data/equipment'
import { ITEMS } from '@/data/items'
import type { AttributeKey, Equipment, EquipSlot, Player, Stats } from '@/types/domain'
import { clamp } from '@/utils/math'

function withStartingEquipment(player: Player): Player {
  const equips = { ...player.equips, ...getStartingEquipment() }
  return { ...player, equips }
}

function sumEquipStats(equips: Partial<Record<EquipSlot, Equipment>>) {
  let addATK = 0
  let addDEF = 0
  let addHP = 0

  Object.values(equips).forEach((eq) => {
    if (!eq) return
    const breakdown = resolveMainStatBreakdown(eq)
    breakdown.forEach((entry) => {
      if (entry.key === 'ATK') addATK += entry.total
      if (entry.key === 'DEF') addDEF += entry.total
      if (entry.key === 'HP') addHP += entry.total
    })

    addATK += eq.subs.addATK ?? 0
    addDEF += eq.subs.addDEF ?? 0
    addHP += eq.subs.addHP ?? 0
  })

  return { addATK, addDEF, addHP }
}

function makeInitialPlayer() {
  return withStartingEquipment({
    ...createDefaultPlayer(),
    gold: 500,
  })
}

type PlayerState = Player

type EquipSummary = ReturnType<typeof sumEquipStats>

function resolveFinalStats(state: PlayerState, equip: EquipSummary): Stats {
  return {
    ATK: state.baseStats.ATK + equip.addATK,
    DEF: state.baseStats.DEF + equip.addDEF,
  }
}

export const usePlayerStore = defineStore('player', {
  state: (): PlayerState => makeInitialPlayer(),
  getters: {
    equipStats: (state) => sumEquipStats(state.equips),
    finalStats: (state): Stats => {
      const equip = sumEquipStats(state.equips)
      return resolveFinalStats(state, equip)
    },
    finalCaps: (state) => {
      const equip = sumEquipStats(state.equips)
      const hpMax = baseHpMax(state.lv) + equip.addHP
      const spMax = baseSpMax(state.lv)
      const xpMax = baseXpMax(state.lv)
      return { hpMax, spMax, xpMax }
    },
    expRequired: (state) => needExp(state.lv),
  },
  actions: {
    hydrate(save: Partial<Player>) {
      const basePlayer = { ...makeInitialPlayer(), ...save }
      // Only apply starting equipment if player has no equipment (new game)
      const hasEquipment = Object.keys(basePlayer.equips || {}).length > 0
      const finalPlayer = hasEquipment ? basePlayer : withStartingEquipment(basePlayer)
      Object.assign(this, finalPlayer)
      this.recalcCaps()
    },
    reset() {
      Object.assign(this, makeInitialPlayer())
    },
    recalcCaps() {
      const caps = this.finalCaps
      this.res.hpMax = caps.hpMax
      this.res.spMax = caps.spMax
      this.res.xpMax = caps.xpMax
      this.res.hp = clamp(this.res.hp, 0, this.res.hpMax)
      this.res.sp = clamp(this.res.sp, 0, this.res.spMax)
      this.res.xp = clamp(this.res.xp, 0, this.res.xpMax)
    },
    restoreFull() {
      this.recalcCaps()
      this.res.hp = this.res.hpMax
      this.res.sp = this.res.spMax
      this.res.xp = this.res.xpMax
    },
    gainExp(amount: number) {
      this.exp += amount
      while (this.exp >= needExp(this.lv)) {
        this.exp -= needExp(this.lv)
        this.lv += 1
        this.unspentPoints += 5
        this.restoreFull()
      }
    },
    gainGold(amount: number) {
      this.gold += amount
    },
    spendGold(amount: number) {
      if (this.gold < amount) return false
      this.gold -= amount
      return true
    },
    addAttributePoints(payload: Partial<Record<AttributeKey, number>>) {
      const total = Object.values(payload).reduce((acc, value) => acc + (value ?? 0), 0)
      if (total > this.unspentPoints) return false
      Object.entries(payload).forEach(([key, value]) => {
        if (!value) return
        this.baseStats[key as AttributeKey] += value
      })
      this.unspentPoints -= total
      this.recalcCaps()
      return true
    },
    receiveDamage(amount: number) {
      this.res.hp = clamp(this.res.hp - amount, 0, this.res.hpMax)
    },
    heal(amount: number) {
      this.res.hp = clamp(this.res.hp + amount, 0, this.res.hpMax)
    },
    restoreSp(amount: number) {
      this.res.sp = clamp(this.res.sp + amount, 0, this.res.spMax)
    },
    restoreXp(amount: number) {
      this.res.xp = clamp(this.res.xp + amount, 0, this.res.xpMax)
    },
    spendSp(amount: number) {
      if (this.res.sp < amount) return false
      this.res.sp -= amount
      return true
    },
    spendXp(amount: number) {
      if (this.res.xp < amount) return false
      this.res.xp -= amount
      return true
    },
    gainXp(amount: number) {
      this.res.xp = clamp(this.res.xp + amount, 0, this.res.xpMax)
    },
    getEquipmentById(id: string) {
      const entry = Object.entries(this.equips).find(([, eq]) => eq?.id === id)
      if (!entry) return null
      const [slot, equip] = entry as [EquipSlot, Equipment]
      return { slot, equip }
    },
    updateEquippedEquipment(id: string, changes: Partial<Equipment>) {
      const found = this.getEquipmentById(id)
      if (!found) return false
      const { slot, equip } = found
      this.equips[slot] = { ...equip, ...changes }
      this.recalcCaps()
      return true
    },
    equip(slot: EquipSlot, equipment: Equipment) {
      this.equips[slot] = { ...equipment }
      this.recalcCaps()
    },
    unequip(slot: EquipSlot) {
      const current = this.equips[slot]
      if (!current) return null
      this.equips[slot] = undefined
      this.recalcCaps()
      return current
    },
    unlockSkill(skillId: string) {
      if (!this.skills.known.includes(skillId)) {
        this.skills.known.push(skillId)
      }
    },
    equipSkill(slotIndex: number, skillId: string | null) {
      if (slotIndex < 0 || slotIndex >= this.skills.loadout.length) return false
      if (skillId && !this.skills.known.includes(skillId)) return false
      this.skills.loadout[slotIndex] = skillId
      return true
    },
    unequipSkill(slotIndex: number) {
      if (slotIndex < 0 || slotIndex >= this.skills.loadout.length) return false
      this.skills.loadout[slotIndex] = null
      return true
    },
    useItem(itemId: string) {
      const def = ITEMS.find(item => item.id === itemId)
      if (!def) return false

      // Check if item is a consumable that can be used outside of battle
      if (!('heal' in def) && !('restoreSp' in def) && !('restoreXp' in def)) {
        return false
      }

      let effectApplied = false

      if ('heal' in def && def.heal && def.heal > 0) {
        // Only heal if not at full health
        if (this.res.hp < this.res.hpMax) {
          this.heal(def.heal)
          effectApplied = true
        }
      }

      if ('restoreSp' in def && def.restoreSp && def.restoreSp > 0) {
        // Only restore SP if not at full
        if (this.res.sp < this.res.spMax) {
          this.restoreSp(def.restoreSp)
          effectApplied = true
        }
      }

      if ('restoreXp' in def && def.restoreXp && def.restoreXp > 0) {
        // Only restore XP if not at full
        if (this.res.xp < this.res.xpMax) {
          this.restoreXp(def.restoreXp)
          effectApplied = true
        }
      }

      return effectApplied
    },
  },
})
