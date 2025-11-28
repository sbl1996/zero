import rawEquipmentData from './equipment_items.json'
import type {
  Equipment,
  EquipSlot,
  EquipSlotKey,
  EquipmentMainStat,
  EquipmentMainStatType,
  EquipmentPrice,
  EquipmentQuality,
  EquipmentSubStat,
  EquipmentSubStatType,
  EquipmentTemplate,
  EquipmentStatValueType,
  RealmTier,
  EquipmentEnhanceRequirement,
  EnhanceMaterialCost,
} from '@/types/domain'

interface RawEquipmentStat {
  type: string
  value: number
  value_type?: EquipmentStatValueType
}

interface RawEquipmentPrice {
  buy?: number
  sell?: number
}

interface RawEquipmentItem {
  id: string
  name: string
  description?: string
  artwork?: string
  slot: string
  required_tier?: number
  base_quality: EquipmentQuality
  base_main: RawEquipmentStat
  substats?: RawEquipmentStat[]
  exclusive?: '2H' | '1H+Shield'
  flatCapMultiplier?: number
  price?: RawEquipmentPrice
  flags?: string[]
  enhance_materials?: RawEnhanceMaterialRequirement[]
}

const EQUIP_SLOTS: EquipSlot[] = ['helmet', 'shieldL', 'weaponR', 'weapon2H', 'armor', 'boots', 'ring']
const MAIN_STAT_TYPES: EquipmentMainStatType[] = ['HP', 'QiMax', 'ATK', 'DEF', 'AGI', 'REC']
const SUB_STAT_TYPES: EquipmentSubStatType[] = [
  'HP',
  'QiMax',
  'ATK',
  'DEF',
  'AGI',
  'REC',
  'HpRec',
  'QiRec',
  'WeaknessRate',
  'WeaknessDmgPct',
  'DamageReduction',
  'SkillCooldownReduction',
  'QiGuardAbsorb',
  'QiGuardEfficiency',
  'PenFlat',
  'PenPct',
  'Toughness',
]

interface RawEnhanceMaterial {
  id: string
  quantity?: number
}

interface RawEnhanceMaterialRequirement {
  target_level?: number
  materials?: RawEnhanceMaterial[]
}

const DEFAULT_PERCENT_SUB_STATS = new Set<EquipmentSubStatType>([
  'WeaknessRate',
  'WeaknessDmgPct',
  'DamageReduction',
  'SkillCooldownReduction',
  'QiGuardAbsorb',
  'QiGuardEfficiency',
  'PenPct',
])

const QUALITY_MAIN_MULTIPLIER: Record<EquipmentQuality, number> = {
  normal: 1.0,
  fine: 1.2,
  rare: 1.45,
  excellent: 1.8,
  epic: 2.2,
}

function isEquipSlot(value: string): value is EquipSlot {
  return EQUIP_SLOTS.includes(value as EquipSlot)
}

function isMainStatType(value: string): value is EquipmentMainStatType {
  return MAIN_STAT_TYPES.includes(value as EquipmentMainStatType)
}

function isSubStatType(value: string): value is EquipmentSubStatType {
  return SUB_STAT_TYPES.includes(value as EquipmentSubStatType)
}

function toValueType(
  value?: EquipmentStatValueType,
  fallback?: EquipmentStatValueType,
): EquipmentStatValueType | undefined {
  if (value === 'percent') return 'percent'
  if (value === 'flat') return 'flat'
  if (fallback === 'percent' || fallback === 'flat') return fallback
  return undefined
}

function toEquipmentMainStat(stat: RawEquipmentStat): EquipmentMainStat {
  const type = stat.type
  if (!isMainStatType(type)) {
    throw new Error(`Unknown main stat type "${type}" in equipment data`)
  }
  const numericValue = Number(stat.value)
  return {
    type,
    value: Number.isFinite(numericValue) ? numericValue : 0,
    valueType: toValueType(stat.value_type),
  }
}

function scaleMainStat(stat: EquipmentMainStat, multiplier: number): EquipmentMainStat {
  const scaled = Math.round((Number.isFinite(stat.value) ? stat.value : 0) * multiplier)
  return { ...stat, value: scaled }
}

function toEquipmentSubStat(stat: RawEquipmentStat): EquipmentSubStat {
  const type = stat.type
  if (!isSubStatType(type)) {
    throw new Error(`Unknown substat type "${type}" in equipment data`)
  }
  const numericValue = Number(stat.value)
  return {
    type,
    value: Number.isFinite(numericValue) ? numericValue : 0,
    valueType: toValueType(stat.value_type, DEFAULT_PERCENT_SUB_STATS.has(type) ? 'percent' : undefined),
  }
}

function toRealmTier(value: number | undefined): RealmTier | undefined {
  if (typeof value !== 'number') return undefined
  if (value >= 1 && value <= 9) return value as RealmTier
  return undefined
}

function clonePrice(price?: RawEquipmentPrice | null): EquipmentPrice | undefined {
  if (!price) return undefined
  const next: EquipmentPrice = {}
  if (typeof price.buy === 'number') next.buy = price.buy
  if (typeof price.sell === 'number') next.sell = price.sell
  return Object.keys(next).length > 0 ? next : undefined
}

function sanitizeMaterialCost(raw?: RawEnhanceMaterial): EnhanceMaterialCost | null {
  if (!raw?.id) return null
  const qty = Number(raw.quantity ?? 1)
  if (!Number.isFinite(qty)) return null
  const quantity = Math.max(1, Math.round(qty))
  return { id: raw.id, quantity }
}

function toEnhanceRequirements(raw?: RawEnhanceMaterialRequirement[]): EquipmentEnhanceRequirement[] | undefined {
  if (!raw) return undefined
  const requirements: EquipmentEnhanceRequirement[] = []
  raw.forEach((entry) => {
    const targetLevel = Number(entry.target_level)
    if (!Number.isFinite(targetLevel) || targetLevel <= 0) return
    const materials = (entry.materials ?? [])
      .map((material) => sanitizeMaterialCost(material))
      .filter((material): material is EnhanceMaterialCost => Boolean(material))
    if (!materials.length) return
    requirements.push({ targetLevel, materials })
  })
  return requirements.length ? requirements : undefined
}

const rawItems = rawEquipmentData as RawEquipmentItem[]

export const BASE_EQUIPMENT_TEMPLATES: EquipmentTemplate[] = rawItems.map((item) => {
  if (!isEquipSlot(item.slot)) {
    throw new Error(`Invalid equip slot "${item.slot}" for equipment ${item.id}`)
  }

  const qualityMultiplier = QUALITY_MAIN_MULTIPLIER[item.base_quality] ?? 1
  const baseMain = scaleMainStat(toEquipmentMainStat(item.base_main), qualityMultiplier)

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    artwork: item.artwork,
    slot: item.slot,
    requiredRealmTier: toRealmTier(item.required_tier),
    quality: item.base_quality,
    baseMain,
    baseSubstats: (item.substats ?? []).map(toEquipmentSubStat),
    exclusive: item.exclusive,
    flatCapMultiplier: item.flatCapMultiplier,
    price: clonePrice(item.price),
    flags: item.flags?.slice(),
    enhanceMaterials: toEnhanceRequirements(item.enhance_materials),
  }
})

export const EQUIPMENT_TEMPLATE_MAP = new Map(BASE_EQUIPMENT_TEMPLATES.map((template) => [template.id, template]))

export const STARTING_EQUIPMENT_IDS: Partial<Record<EquipSlotKey, string>> = {}

export interface InstantiateEquipmentOptions {
  level?: number
  id?: string
}

export function instantiateEquipment(template: EquipmentTemplate, options: InstantiateEquipmentOptions = {}): Equipment {
  return {
    id: options.id ?? template.id,
    templateId: template.id,
    name: template.name,
    description: template.description,
    artwork: template.artwork,
    slot: template.slot,
    level: options.level ?? 0,
    quality: template.quality,
    requiredRealmTier: template.requiredRealmTier,
    mainStat: { ...template.baseMain },
    substats: template.baseSubstats.map((stat) => ({ ...stat })),
    exclusive: template.exclusive,
    flatCapMultiplier: template.flatCapMultiplier,
    price: template.price ? { ...template.price } : undefined,
    flags: template.flags?.slice(),
  }
}

export function applyEquipmentTemplateMetadata(equipment: Equipment): Equipment {
  const templateKey = equipment.templateId ?? equipment.id
  const template = templateKey ? EQUIPMENT_TEMPLATE_MAP.get(templateKey) : undefined
  if (!template) return equipment
  return {
    ...equipment,
    templateId: template.id,
    name: template.name,
    description: template.description,
    artwork: template.artwork,
  }
}

export function getStartingEquipment(): Partial<Record<EquipSlotKey, Equipment>> {
  const result: Partial<Record<EquipSlotKey, Equipment>> = {}
  Object.entries(STARTING_EQUIPMENT_IDS).forEach(([slotKey, templateId]) => {
    if (!templateId) return
    const template = EQUIPMENT_TEMPLATE_MAP.get(templateId)
    if (!template) return
    const equipment = instantiateEquipment(template, { id: template.id })
    result[slotKey as EquipSlotKey] = equipment
  })
  return result
}
