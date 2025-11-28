import { computed, ref, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { EQUIPMENT_TEMPLATE_MAP } from '@/data/equipment'
import { resolveMainStatBreakdown, type MainStatBreakdownEntry } from '@/composables/useEnhance'
import { formatRealmTierLabel, realmTierIndex } from '@/utils/realm'
import { formatEquipmentSubstats, getEquipmentStatLabel } from '@/utils/equipmentStats'
import type {
  Equipment,
  EquipSlot,
  EquipSlotKey,
  EquipmentSubStat,
  RealmTier,
} from '@/types/domain'

const SLOT_CATEGORY_LABELS: Record<EquipSlot, string> = {
  helmet: '头盔',
  shieldL: '盾牌',
  weaponR: '武器',
  weapon2H: '武器',
  armor: '铠甲',
  boots: '靴子',
  ring: '戒指',
}

const SLOT_KEY_LABELS: Record<EquipSlotKey, string> = {
  helmet: '头盔',
  shieldL: '盾牌',
  weaponR: '武器',
  weapon2H: '武器',
  armor: '铠甲',
  boots: '靴子',
  ring1: '戒指 1',
  ring2: '戒指 2',
}

const RING_SLOT_KEYS: EquipSlotKey[] = ['ring1', 'ring2']

function createDeltaRecord(): Record<AttributeOverviewKey, number> {
  return ATTRIBUTE_OVERVIEW_CONFIG.reduce<Record<AttributeOverviewKey, number>>((acc, entry) => {
    acc[entry.key] = 0
    return acc
  }, {} as Record<AttributeOverviewKey, number>)
}

export type AttributeOverviewKey = 'ATK' | 'DEF' | 'AGI' | 'REC' | 'HP' | 'QiMax'

interface AttributeOverviewConfigEntry {
  key: AttributeOverviewKey
  label: string
  icon: string
}

const ATTRIBUTE_OVERVIEW_CONFIG: AttributeOverviewConfigEntry[] = [
  { key: 'ATK', label: '攻击', icon: '⚔️' },
  { key: 'DEF', label: '防御', icon: '🛡️' },
  { key: 'AGI', label: '敏捷', icon: '💨' },
  { key: 'REC', label: '恢复', icon: '♻️' },
  { key: 'HP', label: '生命', icon: '❤️' },
  { key: 'QiMax', label: '斗气', icon: '✨' },
]

export interface AttributeOverviewEntry extends AttributeOverviewConfigEntry {
  value: number
  delta: number
}

export interface EquipmentDiffEntry {
  slotKey: EquipSlotKey
  slotLabel: string
  equipped: Equipment | null
  equippedMain: MainStatBreakdownEntry | null
  candidateMain: MainStatBreakdownEntry | null
  delta: number | null
}

type EquipSummaryRecord = Record<AttributeOverviewKey, number>

function lookupTemplate(templateId?: string) {
  if (!templateId) return undefined
  return EQUIPMENT_TEMPLATE_MAP.get(templateId)
}

function resolveRequiredRealmTier(equipment: Equipment): RealmTier | undefined {
  if (equipment.requiredRealmTier !== undefined) {
    return equipment.requiredRealmTier
  }

  const direct = lookupTemplate(equipment.templateId)
  if (direct?.requiredRealmTier !== undefined) {
    return direct.requiredRealmTier
  }

  const candidates = [equipment.id]
  const parts = equipment.id.split('-')
  const dropIndex = parts.indexOf('drop')
  if (dropIndex !== -1 && parts.length >= dropIndex + 3) {
    candidates.push(parts.slice(0, dropIndex).join('-'))
  } else if (parts.length >= 3) {
    candidates.push(parts.slice(0, -2).join('-'))
  }

  for (const candidate of candidates) {
    const template = lookupTemplate(candidate)
    if (template?.requiredRealmTier !== undefined) {
      return template.requiredRealmTier
    }
  }

  return undefined
}

function slotKeysForEquipment(equipment: Equipment): EquipSlotKey[] {
  if (equipment.slot === 'ring') return RING_SLOT_KEYS
  return [equipment.slot as EquipSlotKey]
}

function describeEquippedSlot(equipped: Equipment | null | undefined, label: string): string {
  if (!equipped) return `${label}：未装备`
  return `${label}：${equipped.name}（+${equipped.level}）`
}

function createEquipSummary(): EquipSummaryRecord {
  return {
    ATK: 0,
    DEF: 0,
    AGI: 0,
    REC: 0,
    HP: 0,
    QiMax: 0,
  }
}

function summarizeEquipment(equips: Partial<Record<EquipSlotKey, Equipment | undefined>>): EquipSummaryRecord {
  const summary = createEquipSummary()

  Object.values(equips).forEach((eq) => {
    if (!eq) return
    const breakdown = resolveMainStatBreakdown(eq)
    breakdown.forEach((entry) => {
      if (entry.key === 'HP') summary.HP += entry.total
      if (entry.key === 'ATK') summary.ATK += entry.total
      if (entry.key === 'DEF') summary.DEF += entry.total
      if (entry.key === 'AGI') summary.AGI += entry.total
      if (entry.key === 'REC') summary.REC += entry.total
    })

    const substats = Array.isArray(eq.substats) ? eq.substats : []
    substats.forEach((stat) => {
      const value = Number(stat.value)
      if (!Number.isFinite(value) || value === 0) return
      if (stat.valueType === 'percent') return
      switch (stat.type) {
        case 'HP':
          summary.HP += value
          break
        case 'QiMax':
          summary.QiMax += value
          break
        case 'ATK':
          summary.ATK += value
          break
        case 'DEF':
          summary.DEF += value
          break
        case 'AGI':
          summary.AGI += value
          break
        case 'REC':
          summary.REC += value
          break
        default:
          break
      }
    })
  })

  return summary
}

export function useEquipmentSelection() {
  const player = usePlayerStore()

  const currentRealmIndex = computed(() => realmTierIndex(player.cultivation.realm.tier))
  const attributeTotals = computed<Record<AttributeOverviewKey, number>>(() => ({
    ATK: Math.round(player.stats.totals.ATK ?? 0),
    DEF: Math.round(player.stats.totals.DEF ?? 0),
    AGI: Math.round(player.stats.totals.AGI ?? 0),
    REC: Math.round(player.stats.totals.REC ?? 0),
    HP: Math.round(player.res.hpMax ?? 0),
    QiMax: Math.round(player.res.qiMax ?? 0),
  }))
  const recentDeltas = ref<Record<AttributeOverviewKey, number>>(createDeltaRecord())

  watch(
    attributeTotals,
    (next, prev) => {
      if (!prev) {
        recentDeltas.value = createDeltaRecord()
        return
      }
      const deltaRecord = createDeltaRecord()
      let changed = false
      ATTRIBUTE_OVERVIEW_CONFIG.forEach((entry) => {
        const diff = (next[entry.key] ?? 0) - (prev[entry.key] ?? 0)
        deltaRecord[entry.key] = diff
        if (diff !== 0) {
          changed = true
        }
      })
      if (changed) {
        recentDeltas.value = deltaRecord
      }
    },
    { immediate: true },
  )

  const attributeOverview = computed<AttributeOverviewEntry[]>(() =>
    ATTRIBUTE_OVERVIEW_CONFIG.map((entry) => ({
      ...entry,
      value: attributeTotals.value[entry.key],
      delta: recentDeltas.value[entry.key] ?? 0,
    })),
  )

  const equippedSummary = computed(() => summarizeEquipment(player.equips))

  function resolveTargetSlot(candidate: Equipment, preferredSlot?: EquipSlotKey): EquipSlotKey | null {
    if (preferredSlot) return preferredSlot
    if (candidate.slot === 'ring') {
      if (!player.equips.ring1) return 'ring1'
      if (!player.equips.ring2) return 'ring2'
      return 'ring1'
    }
    return candidate.slot
  }

  function slotsToClear(target: EquipSlotKey, candidate: Equipment): EquipSlotKey[] {
    const slots = new Set<EquipSlotKey>([target])
    if (target === 'weapon2H' || candidate.exclusive === '2H') {
      slots.add('weaponR')
      slots.add('shieldL')
    }
    if (target === 'weaponR' || target === 'shieldL') {
      slots.add('weapon2H')
    }
    return [...slots]
  }

  function applyCandidateEquipment(candidate: Equipment, preferredSlot?: EquipSlotKey) {
    const targetSlot = resolveTargetSlot(candidate, preferredSlot)
    if (!targetSlot) return null

    const nextEquips: Partial<Record<EquipSlotKey, Equipment | undefined>> = { ...player.equips }
    slotsToClear(targetSlot, candidate).forEach((slot) => {
      if (slot !== targetSlot) {
        nextEquips[slot] = undefined
      }
    })
    nextEquips[targetSlot] = candidate
    return summarizeEquipment(nextEquips)
  }

  function attributeOverviewForEquipment(candidate?: Equipment | null, options?: { slotKey?: EquipSlotKey }) {
    const baseTotals = attributeTotals.value
    const baseSummary = equippedSummary.value

    if (!candidate) {
      return ATTRIBUTE_OVERVIEW_CONFIG.map((entry) => ({
        ...entry,
        value: baseTotals[entry.key],
        delta: 0,
      }))
    }

    const nextSummary = applyCandidateEquipment(candidate, options?.slotKey)
    if (!nextSummary) {
      return ATTRIBUTE_OVERVIEW_CONFIG.map((entry) => ({
        ...entry,
        value: baseTotals[entry.key],
        delta: 0,
      }))
    }

    return ATTRIBUTE_OVERVIEW_CONFIG.map((entry) => {
      const delta = nextSummary[entry.key] - baseSummary[entry.key]
      return {
        ...entry,
        value: baseTotals[entry.key] + delta,
        delta,
      }
    })
  }

  function getSlotLabel(slot: EquipSlot, slotKey?: EquipSlotKey): string {
    if (slotKey) {
      return SLOT_KEY_LABELS[slotKey] ?? SLOT_CATEGORY_LABELS[slot] ?? slotKey
    }
    return SLOT_CATEGORY_LABELS[slot] ?? slot
  }

  function getSlotKeyLabel(slotKey: EquipSlotKey) {
    return SLOT_KEY_LABELS[slotKey] ?? slotKey
  }

  function formatMainStatLine(equipment: Equipment): string {
    const breakdowns = resolveMainStatBreakdown(equipment)
    if (breakdowns.length === 0) return '主要属性 —'

    const breakdown = breakdowns[0]!
    const statLabel = getEquipmentStatLabel(breakdown.key)
    const increase = breakdown.total - breakdown.base

    return `${statLabel} ${breakdown.total}${increase > 0 ? ` (+${increase})` : ''}`
  }

  function getMainStatTooltip(equipment: Equipment): string {
    const breakdowns = resolveMainStatBreakdown(equipment)
    if (breakdowns.length === 0) return ''

    const breakdown = breakdowns[0]!
    const increase = breakdown.total - breakdown.base
    const percentIncrease = breakdown.base > 0 ? Math.round((increase / breakdown.base) * 100) : 0

    return `基础: ${breakdown.base}, 强化加成: +${increase} (+${percentIncrease}%)`
  }

  function formatSubstatsList(source: EquipmentSubStat[] | Equipment | undefined | null): string[] {
    if (!source) return ['无']
    const stats = Array.isArray(source) ? source : source.substats ?? []
    const entries = formatEquipmentSubstats(stats)
    return entries.length > 0 ? entries : ['无']
  }

  function getEquipmentRequiredRealmTier(equipment: Equipment): RealmTier | undefined {
    return resolveRequiredRealmTier(equipment)
  }

  function isRealmRequirementMet(required?: RealmTier): boolean {
    if (!required) return true
    return realmTierIndex(required) <= currentRealmIndex.value
  }

  function requirementLabel(required?: RealmTier): string {
    if (!required) return '无境界需求'
    return `境界需求：${formatRealmTierLabel(required)}`
  }

  function describeSlot(slot: EquipSlot): string {
    if (slot === 'ring') {
      return RING_SLOT_KEYS.map((slotKey) =>
        describeEquippedSlot(player.equips[slotKey], getSlotKeyLabel(slotKey)),
      ).join(' / ')
    }
    const slotKey = slot as EquipSlotKey
    return describeEquippedSlot(player.equips[slotKey], getSlotLabel(slot, slotKey))
  }

  function diffAgainstEquipped(equipment: Equipment): EquipmentDiffEntry[] {
    const candidateMain = resolveMainStatBreakdown(equipment)[0] ?? null
    const targetSlot = resolveTargetSlot(equipment)
    const slotsCleared = targetSlot ? slotsToClear(targetSlot, equipment) : slotKeysForEquipment(equipment)
    return slotKeysForEquipment(equipment).map((slotKey) => {
      const comparisonSlots = targetSlot && slotKey === targetSlot ? slotsCleared : [slotKey]
      const equipped =
        comparisonSlots.map((slot) => player.equips[slot]).find((item): item is Equipment => Boolean(item)) ?? null
      const equippedMain = equipped ? resolveMainStatBreakdown(equipped)[0] ?? null : null
      const removedMainTotal =
        candidateMain?.key && comparisonSlots.length
          ? comparisonSlots.reduce((total, slot) => {
              const eq = player.equips[slot]
              if (!eq) return total
              const main = resolveMainStatBreakdown(eq)[0]
              if (main?.key === candidateMain.key) {
                return total + main.total
              }
              return total
            }, 0)
          : null
      const delta =
        candidateMain && removedMainTotal !== null
          ? candidateMain.total - removedMainTotal
          : candidateMain && equippedMain
            ? candidateMain.total - equippedMain.total
            : candidateMain?.total ?? null
      return {
        slotKey,
        slotLabel: getSlotKeyLabel(slotKey),
        equipped,
        equippedMain,
        candidateMain,
        delta,
      }
    })
  }

  return {
    currentRealmIndex,
    attributeOverview,
    attributeOverviewForEquipment,
    getSlotLabel,
    getSlotKeyLabel,
    describeSlot,
    formatMainStatLine,
    getMainStatTooltip,
    formatSubstatsList,
    getEquipmentRequiredRealmTier,
    isRealmRequirementMet,
    requirementLabel,
    diffAgainstEquipped,
  }
}
