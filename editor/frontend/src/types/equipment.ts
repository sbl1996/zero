export type EquipmentSlot = 
  | 'helmet'
  | 'shieldL'
  | 'weaponR'
  | 'weapon2H'
  | 'armor'
  | 'ring'
  | 'boots';

export type Quality = 
  | 'normal'
  | 'fine'
  | 'rare'
  | 'excellent'
  | 'epic';

export type MainStatType = 
  | 'HP'
  | 'QiMax'
  | 'ATK'
  | 'DEF'
  | 'AGI'
  | 'REC';

export type SubStatType = 
  | MainStatType
  | 'HpRec'
  | 'QiRec'
  | 'WeaknessRate'
  | 'WeaknessDmgPct'
  | 'DamageReduction'
  | 'SkillCooldownReduction'
  | 'QiGuardAbsorb'
  | 'QiGuardEfficiency'
  | 'PenFlat'
  | 'PenPct'
  | 'Toughness';

export interface EquipmentStat {
  type: MainStatType | SubStatType;
  value: number;
  value_type?: 'flat' | 'percent';
}

export interface EquipmentPrice {
  buy?: number;
  sell?: number;
}

export interface EnhanceMaterial {
  id: string;
  quantity?: number;
}

export interface EnhanceMaterialRequirement {
  target_level?: number;
  materials?: EnhanceMaterial[];
}

export interface EquipmentItem {
  id: string;
  name: string;
  description?: string;
  artwork?: string;
  slot: EquipmentSlot;
  base_quality: Quality;
  required_tier?: number;
  base_main: EquipmentStat;
  substats?: EquipmentStat[];
  price?: EquipmentPrice;
  flags?: string[];
  exclusive?: '2H' | '1H+Shield';
  flatCapMultiplier?: number;
  enhance_materials?: EnhanceMaterialRequirement[];
}

export const EQUIPMENT_SLOTS: { value: EquipmentSlot; label: string }[] = [
  { value: 'helmet', label: '头盔' },
  { value: 'shieldL', label: '盾牌' },
  { value: 'weaponR', label: '单手武器' },
  { value: 'weapon2H', label: '双手武器' },
  { value: 'armor', label: '护甲' },
  { value: 'ring', label: '戒指' },
  { value: 'boots', label: '靴子' },
];

export const QUALITIES: { value: Quality; label: string; color: string }[] = [
  { value: 'normal', label: '普通', color: '#cfd8dc' },
  { value: 'fine', label: '优质', color: '#5de17b' },
  { value: 'rare', label: '稀有', color: '#67b5ff' },
  { value: 'excellent', label: '卓越', color: '#d177ff' },
  { value: 'epic', label: '史诗', color: '#ffb347' },
];

export const MAIN_STAT_TYPES: { value: MainStatType; label: string }[] = [
  { value: 'HP', label: '生命值' },
  { value: 'QiMax', label: '斗气上限' },
  { value: 'ATK', label: '攻击力' },
  { value: 'DEF', label: '防御力' },
  { value: 'AGI', label: '敏捷' },
  { value: 'REC', label: '回复' },
];

export const SUB_STAT_TYPES: { value: SubStatType; label: string }[] = [
  { value: 'HP', label: '生命值' },
  { value: 'QiMax', label: '斗气上限' },
  { value: 'ATK', label: '攻击力' },
  { value: 'DEF', label: '防御力' },
  { value: 'AGI', label: '敏捷' },
  { value: 'REC', label: '回复' },
  { value: 'HpRec', label: '生命回复' },
  { value: 'QiRec', label: '斗气回复' },
  { value: 'WeaknessRate', label: '破绽率' },
  { value: 'WeaknessDmgPct', label: '破绽伤害' },
  { value: 'DamageReduction', label: '伤害减免' },
  { value: 'SkillCooldownReduction', label: '技能冷却缩减' },
  { value: 'QiGuardAbsorb', label: '斗气护盾吸收' },
  { value: 'QiGuardEfficiency', label: '斗气护盾效率' },
  { value: 'PenFlat', label: '固定穿透' },
  { value: 'PenPct', label: '百分比穿透' },
  { value: 'Toughness', label: '韧性' },
];
