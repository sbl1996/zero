import type { Monster, MonsterRank, MonsterSpecialization } from '@/types/domain'
import { monsterPositions } from '@/data/maps'

// 怪物到地图的映射
export function getMonsterMap(monsterId: string): string | null {
  for (const [mapId, positions] of Object.entries(monsterPositions)) {
    if (positions[monsterId]) {
      return mapId
    }
  }
  return null
}

// BOSS击败后的地图解锁顺序
export const bossUnlockMap: Record<string, string> = {
  'boss-golden-sheep': 'spine-of-frostfire',
  'boss-wind-raptor': 'thunderveil-keep',
  'boss-dragon-whelp': 'bogroot-expanse',
  'boss-treant': 'duskfang-rift',
  'boss-priest': 'gloomlit-arcanum',
  'boss-archmage': 'obsidian-windscar',
  'boss-knight': 'frostfire-maelstrom',
  'boss-warlord': 'astral-crown',
  'boss-dragon': 'green-elysium',
}

const K_MONSTER_BP_TO_UNIT = 5

const STAT_SCALE = {
  ATK: 1.2,
  DEF: 1.0,
  AGI: 1.0,
} as const

const SPECIALIZATION_COEFFICIENTS: Record<MonsterSpecialization, { ATK: number; DEF: number; AGI: number }> = {
  balanced: { ATK: 0.4, DEF: 0.4, AGI: 0.2 },
  attacker: { ATK: 0.55, DEF: 0.25, AGI: 0.2 },
  defender: { ATK: 0.3, DEF: 0.55, AGI: 0.15 },
  agile: { ATK: 0.35, DEF: 0.2, AGI: 0.45 },
  bruiser: { ATK: 0.5, DEF: 0.4, AGI: 0.1 },
  skirmisher: { ATK: 0.4, DEF: 0.2, AGI: 0.4 },
  mystic: { ATK: 0.35, DEF: 0.4, AGI: 0.25 },
  crazy: { ATK: 0.65, DEF: 0.1, AGI: 0.25 },
}

interface MonsterBlueprint {
  id: Monster['id']
  name: Monster['name']
  realmTier: Monster['realmTier']
  hp: number
  bp: number
  specialization: MonsterSpecialization
  rewards: {
    exp: number
    gold: number
  }
  rank?: MonsterRank
  toughness?: number
  attackInterval?: number
  portraits?: Monster['portraits']
}

const MONSTER_BLUEPRINTS: MonsterBlueprint[] = [
  // Fringe（一级）
  { id: 'm-slime', name: '史莱姆', realmTier: 1, hp: 80, bp: 100, specialization: 'balanced', rewards: { exp: 30, gold: 25 } },
  { id: 'm-wolf', name: '野狼', realmTier: 1, hp: 130, bp: 120, specialization: 'skirmisher', rewards: { exp: 45, gold: 35 } },
  { id: 'm-goblin', name: '哥布林', realmTier: 1, hp: 180, bp: 140, specialization: 'attacker', rewards: { exp: 65, gold: 55 } },
  { id: 'm-boar', name: '巨型野猪', realmTier: 1, hp: 260, bp: 160, specialization: 'bruiser', rewards: { exp: 90, gold: 70 } },
  { id: 'boss-golden-sheep', name: '黄金绵羊', realmTier: 1, hp: 800, bp: 200, specialization: 'defender', rewards: { exp: 400, gold: 300 }, rank: 'boss' },
  // Spine of Frostfire（二级）
  { id: 'm-ice-boli', name: '冰玻力', realmTier: 2, hp: 460, bp: 240, specialization: 'defender', rewards: { exp: 160, gold: 140 } },
  { id: 'm-pyro-fox', name: '火焰狐', realmTier: 2, hp: 520, bp: 300, specialization: 'skirmisher', rewards: { exp: 190, gold: 165 } },
  { id: 'm-froststone-colossus', name: '寒岩巨像', realmTier: 2, hp: 780, bp: 340, specialization: 'defender', rewards: { exp: 240, gold: 210 } },
  { id: 'boss-wind-raptor', name: '风暴迅猛龙', realmTier: 2, hp: 1600, bp: 400, specialization: 'agile', rewards: { exp: 540, gold: 600 }, rank: 'boss' },
  // Thunderveil Keep（三级）
  { id: 'm-shade', name: '影子刺客', realmTier: 3, hp: 980, bp: 480, specialization: 'agile', rewards: { exp: 360, gold: 330 } },
  { id: 'm-thunder-knight', name: '雷霆骑士', realmTier: 3, hp: 1200, bp: 600, specialization: 'defender', rewards: { exp: 480, gold: 420 } },
  { id: 'm-abyss-witch', name: '深渊女巫', realmTier: 3, hp: 1350, bp: 680, specialization: 'mystic', rewards: { exp: 540, gold: 500 } },
  { id: 'boss-dragon-whelp', name: '幼龙', realmTier: 3, hp: 2200, bp: 800, specialization: 'balanced', rewards: { exp: 660, gold: 610 }, rank: 'boss' },
  // Bogroot Expanse（四级）
  { id: 'm-specter', name: '沼泽魅影', realmTier: 4, hp: 1622, bp: 880, specialization: 'crazy', rewards: { exp: 441, gold: 378 } },
  { id: 'm-rockback', name: '岩背巨兽', realmTier: 4, hp: 1682, bp: 1000, specialization: 'bruiser', rewards: { exp: 456, gold: 391 } },
  { id: 'm-raven', name: '血鸦', realmTier: 4, hp: 1785, bp: 1080, specialization: 'skirmisher', rewards: { exp: 483, gold: 415 } },
  { id: 'boss-treant', name: '腐沼树妖', realmTier: 4, hp: 2676, bp: 1200, specialization: 'defender', rewards: { exp: 622, gold: 535 }, rank: 'boss', toughness: 1.6, attackInterval: 1.8 },
  // Duskfang Rift（四级后段）
  { id: 'm-nightstalker', name: '夜巡狼人', realmTier: 4, hp: 1906, bp: 1220, specialization: 'agile', rewards: { exp: 513, gold: 441 } },
  { id: 'm-troll', name: '寒霜巨魔', realmTier: 4, hp: 1967, bp: 1360, specialization: 'bruiser', rewards: { exp: 529, gold: 454 } },
  { id: 'm-hound', name: '熔岩猎犬', realmTier: 4, hp: 2070, bp: 1480, specialization: 'attacker', rewards: { exp: 556, gold: 477 } },
  { id: 'boss-priest', name: '暗影祭司', realmTier: 4, hp: 3088, bp: 1600, specialization: 'mystic', rewards: { exp: 713, gold: 612 }, rank: 'boss' },
  // Gloomlit Arcanum（五级前段）
  { id: 'm-harvester', name: '骨响收割者', realmTier: 5, hp: 2190, bp: 1760, specialization: 'attacker', rewards: { exp: 586, gold: 503 } },
  { id: 'm-sentinel', name: '符文哨兵', realmTier: 5, hp: 2233, bp: 2000, specialization: 'defender', rewards: { exp: 598, gold: 513 } },
  { id: 'm-reaver', name: '虚空撕裂者', realmTier: 5, hp: 2354, bp: 2180, specialization: 'crazy', rewards: { exp: 628, gold: 540 } },
  { id: 'boss-archmage', name: '堕落大法师', realmTier: 5, hp: 3500, bp: 2400, specialization: 'mystic', rewards: { exp: 803, gold: 690 }, rank: 'boss' },
  // Obsidian Windscar（五级后段）
  { id: 'm-stormcaller', name: '风暴召唤者', realmTier: 5, hp: 2457, bp: 2580, specialization: 'mystic', rewards: { exp: 655, gold: 563 } },
  { id: 'm-colossus', name: '黑曜巨像', realmTier: 5, hp: 2517, bp: 2800, specialization: 'defender', rewards: { exp: 670, gold: 576 } },
  { id: 'm-titan', name: '焰生泰坦', realmTier: 5, hp: 2638, bp: 2980, specialization: 'bruiser', rewards: { exp: 700, gold: 602 } },
  { id: 'boss-knight', name: '恐惧骑士', realmTier: 5, hp: 3887, bp: 3200, specialization: 'bruiser', rewards: { exp: 891, gold: 765 }, rank: 'boss', toughness: 1.6, attackInterval: 1.5 },
  // Frostfire Maelstrom（六级前段）
  { id: 'm-chimera', name: '秘能奇美拉', realmTier: 6, hp: 2741, bp: 3600, specialization: 'balanced', rewards: { exp: 727, gold: 625 } },
  { id: 'm-wyrm', name: '冰霜飞龙', realmTier: 6, hp: 2801, bp: 4000, specialization: 'attacker', rewards: { exp: 742, gold: 638 } },
  { id: 'm-kraken', name: '深海巨妖', realmTier: 6, hp: 2922, bp: 4360, specialization: 'bruiser', rewards: { exp: 773, gold: 664 } },
  { id: 'boss-warlord', name: '地狱军阀', realmTier: 6, hp: 4299, bp: 4800, specialization: 'bruiser', rewards: { exp: 981, gold: 842 }, rank: 'boss', toughness: 1.6 },
  // Astral Crown（六级后段）
  { id: 'm-templar', name: '天穹圣卫', realmTier: 6, hp: 3025, bp: 5140, specialization: 'defender', rewards: { exp: 800, gold: 687 } },
  { id: 'm-banshee', name: '灰烬魅灵', realmTier: 6, hp: 3086, bp: 5480, specialization: 'mystic', rewards: { exp: 815, gold: 700 } },
  { id: 'm-hunter', name: '苍穹狩魔者', realmTier: 6, hp: 3207, bp: 6000, specialization: 'agile', rewards: { exp: 845, gold: 727 } },
  { id: 'boss-dragon', name: '远古龙王', realmTier: 6, hp: 4600, bp: 6400, specialization: 'balanced', rewards: { exp: 1075, gold: 923 }, rank: 'boss', toughness: 1.8, attackInterval: 1.8 },
  // Green Elysium（七级）
  { id: 'm-faerie', name: '森灵妖精', realmTier: 7, hp: 3150, bp: 6640, specialization: 'agile', rewards: { exp: 860, gold: 735 } },
  { id: 'm-bloomfiend', name: '绽灵花魔', realmTier: 7, hp: 3220, bp: 7200, specialization: 'mystic', rewards: { exp: 882, gold: 750 } },
  { id: 'm-dreamstag', name: '梦角鹿', realmTier: 7, hp: 3305, bp: 7920, specialization: 'balanced', rewards: { exp: 905, gold: 768 } },
  { id: 'm-sylvan-sentinel', name: '森域守卫', realmTier: 7, hp: 3400, bp: 8760, specialization: 'agile', rewards: { exp: 930, gold: 785 } },
  { id: 'boss-queen-of-blooms', name: '绽辉女王', realmTier: 7, hp: 4950, bp: 9600, specialization: 'defender', rewards: { exp: 1150, gold: 970 }, rank: 'boss', toughness: 1.6, attackInterval: 1.7 },
]

function computeDerivedStats(bp: number, specialization: MonsterSpecialization) {
  const unit = bp / K_MONSTER_BP_TO_UNIT
  const coefficients = SPECIALIZATION_COEFFICIENTS[specialization]
  const ATK = Math.round(unit * coefficients.ATK * STAT_SCALE.ATK)
  const DEF = Math.round(unit * coefficients.DEF * STAT_SCALE.DEF)
  const AGI = Math.round(unit * coefficients.AGI * STAT_SCALE.AGI)
  return { ATK, DEF, AGI }
}

function deriveDeltaBp(exp: number): number {
  return Math.round((exp / 50) * 10) / 10
}

function buildMonster(blueprint: MonsterBlueprint): Monster {
  const rank: MonsterRank = blueprint.rank ?? 'normal'
  const isBoss = rank === 'boss'
  const stats = computeDerivedStats(blueprint.bp, blueprint.specialization)
  const attackInterval = blueprint.attackInterval ?? 1.6
  const toughness = blueprint.toughness ?? (isBoss ? 1.2 : 1.0)
  const rewards = {
    gold: blueprint.rewards.gold,
    exp: blueprint.rewards.exp,
    deltaBp: deriveDeltaBp(blueprint.rewards.exp),
  }
  return {
    id: blueprint.id,
    name: blueprint.name,
    realmTier: blueprint.realmTier,
    rank,
    bp: blueprint.bp,
    specialization: blueprint.specialization,
    hp: blueprint.hp,
    stats,
    rewards,
    toughness,
    attackInterval,
    isBoss,
    penetration: undefined,
    portraits: blueprint.portraits,
  }
}

export const MONSTERS: Monster[] = MONSTER_BLUEPRINTS.map(buildMonster)

