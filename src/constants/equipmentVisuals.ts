import type { EquipmentQuality } from '@/types/domain'
import { getEquipmentQualityMeta } from '@/utils/equipmentStats'

export interface EquipmentQualityVisual {
  quality: EquipmentQuality
  label: string
  accentColor: string
  borderGradient: string
  background: string
  glowShadow: string
  iconBackground: string
  particleClass?: string
  auraClass: string
  sheenTint: string
}

type VisualConfig = Omit<EquipmentQualityVisual, 'quality' | 'label' | 'accentColor'> & {
  accentColor?: string
}

function buildVisual(quality: EquipmentQuality, config: VisualConfig): EquipmentQualityVisual {
  const { label, color } = getEquipmentQualityMeta(quality)
  const { accentColor, ...rest } = config
  return {
    quality,
    label,
    accentColor: accentColor ?? color,
    ...rest,
  }
}

const QUALITY_VISUALS: Record<EquipmentQuality, EquipmentQualityVisual> = {
  normal: buildVisual('normal', {
    accentColor: '#cfd8dc',
    borderGradient: 'linear-gradient(135deg, rgba(189,195,199,0.7), rgba(92,99,105,0.7))',
    background: 'radial-gradient(circle at 40% 30%, rgba(255,255,255,0.04), rgba(6,6,8,0.85))',
    glowShadow: '0 0 8px rgba(255,255,255,0.04), inset 0 0 12px rgba(255,255,255,0.03)',
    iconBackground: 'linear-gradient(145deg, rgba(255,255,255,0.08), rgba(14,14,20,0.9))',
    auraClass: 'quality-aura-normal',
    sheenTint: 'rgba(255,255,255,0.35)',
  }),
  fine: buildVisual('fine', {
    accentColor: '#5de17b',
    borderGradient: 'linear-gradient(135deg, rgba(93,225,123,0.9), rgba(20,120,60,0.9))',
    background: 'radial-gradient(circle at 30% 30%, rgba(93,225,123,0.12), rgba(4,28,18,0.9))',
    glowShadow: '0 0 12px rgba(93,225,123,0.35), inset 0 0 18px rgba(93,225,123,0.22)',
    iconBackground: 'linear-gradient(140deg, rgba(24,58,38,0.95), rgba(8,16,12,0.8))',
    auraClass: 'quality-aura-fine',
    sheenTint: 'rgba(93,225,123,0.7)',
    particleClass: 'quality-particles-fine',
  }),
  rare: buildVisual('rare', {
    accentColor: '#67b5ff',
    borderGradient: 'linear-gradient(135deg, rgba(58,152,255,0.95), rgba(9,48,120,0.95))',
    background: 'radial-gradient(circle at 30% 20%, rgba(58,152,255,0.18), rgba(5,12,32,0.92))',
    glowShadow: '0 0 16px rgba(58,152,255,0.45), inset 0 0 22px rgba(58,152,255,0.28)',
    iconBackground: 'linear-gradient(145deg, rgba(12,32,68,0.95), rgba(4,8,20,0.85))',
    auraClass: 'quality-aura-rare',
    sheenTint: 'rgba(58,152,255,0.8)',
    particleClass: 'quality-particles-rare',
  }),
  excellent: buildVisual('excellent', {
    accentColor: '#d177ff',
    borderGradient: 'linear-gradient(135deg, rgba(209,119,255,0.98), rgba(82,24,122,0.98))',
    background: 'radial-gradient(circle at 25% 20%, rgba(209,119,255,0.2), rgba(22,4,30,0.94))',
    glowShadow: '0 0 20px rgba(209,119,255,0.55), inset 0 0 26px rgba(209,119,255,0.32)',
    iconBackground: 'linear-gradient(135deg, rgba(44,8,62,0.96), rgba(12,2,18,0.88))',
    auraClass: 'quality-aura-excellent',
    sheenTint: 'rgba(209,119,255,0.85)',
    particleClass: 'quality-particles-excellent',
  }),
  epic: buildVisual('epic', {
    accentColor: '#ffb347',
    borderGradient: 'linear-gradient(135deg, rgba(255,179,71,1), rgba(213,77,40,0.95))',
    background: 'radial-gradient(circle at 30% 25%, rgba(255,140,66,0.25), rgba(32,10,0,0.94))',
    glowShadow: '0 0 24px rgba(255,179,71,0.65), 0 0 35px rgba(255,115,34,0.35), inset 0 0 30px rgba(255,179,71,0.35)',
    iconBackground: 'linear-gradient(135deg, rgba(52,14,0,0.98), rgba(14,4,0,0.9))',
    auraClass: 'quality-aura-epic',
    sheenTint: 'rgba(255,179,71,0.9)',
    particleClass: 'quality-particles-epic',
  }),
}

const DEFAULT_VISUAL = QUALITY_VISUALS.normal

export function getQualityVisuals(quality?: EquipmentQuality | null): EquipmentQualityVisual {
  if (!quality) return DEFAULT_VISUAL
  return QUALITY_VISUALS[quality] ?? DEFAULT_VISUAL
}

export function listQualityVisuals() {
  return (Object.values(QUALITY_VISUALS) ?? []).slice()
}
