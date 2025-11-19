import type {
  EquipmentMainStat,
  EquipmentMainStatType,
  EquipmentQuality,
  EquipmentStatValueType,
  EquipmentSubStat,
  EquipmentSubStatType,
} from '@/types/domain'

const STAT_LABELS: Record<EquipmentMainStatType | EquipmentSubStatType, string> = {
  HP: '生命值',
  QiMax: '斗气上限',
  ATK: '攻击',
  DEF: '防御',
  AGI: '敏捷',
  REC: '恢复',
  HpRec: '生命恢复',
  QiRec: '斗气恢复',
  WeaknessRate: '破绽率',
  WeaknessDmgPct: '破绽伤害',
  DamageReduction: '减伤',
  SkillCooldownReduction: '技能冷却缩减',
  QiGuardAbsorb: '斗气防御吸收率',
  QiGuardEfficiency: '斗气防御效率',
  PenFlat: '穿透(固定)',
  PenPct: '穿透(%)',
  Toughness: '韧性',
}

const QUALITY_META: Record<EquipmentQuality, { label: string; color: string }> = {
  normal: { label: '普通', color: '#e0e0e0' },
  fine: { label: '优质', color: '#4caf50' },
  rare: { label: '稀有', color: '#42a5f5' },
  excellent: { label: '卓越', color: '#ab47bc' },
  epic: { label: '史诗', color: '#ff9800' },
}

const DEFAULT_QUALITY_META = { label: '普通', color: '#e0e0e0' }

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) < 1e-6) return `${rounded}`
  const fixed = value.toFixed(1)
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
}

export function getEquipmentStatLabel(type: EquipmentMainStatType | EquipmentSubStatType): string {
  return STAT_LABELS[type] ?? type
}

export function formatEquipmentStatValue(value: number, valueType?: EquipmentStatValueType): string {
  const numeric = Number.isFinite(value) ? value : 0
  const suffix = valueType === 'percent' ? '%' : ''
  return `+${formatNumber(numeric)}${suffix}`
}

export function formatEquipmentStat(stat: EquipmentMainStat | EquipmentSubStat): string {
  const label = getEquipmentStatLabel(stat.type)
  return `${label} ${formatEquipmentStatValue(stat.value, stat.valueType)}`
}

export function formatEquipmentSubstats(substats: EquipmentSubStat[]): string[] {
  return substats
    .filter((stat) => Number.isFinite(stat.value) && stat.value !== 0)
    .map((stat) => formatEquipmentStat(stat))
}

export function getEquipmentQualityMeta(quality?: EquipmentQuality) {
  if (!quality) return DEFAULT_QUALITY_META
  return QUALITY_META[quality] ?? DEFAULT_QUALITY_META
}
