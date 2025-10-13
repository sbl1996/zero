import type { Monster } from '@/types/domain'
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

export const MONSTERS: Monster[] = [
  // Fringe (LV1~10)
  { id: 'slime', name: '史莱姆', lv: 1, hpMax: 80, atk: 12, def: 2, rewardExp: 30, rewardGold: 25,  tough: 1.0 },
  { id: 'wolf', name: '野狼', lv: 4, hpMax: 130, atk: 20, def: 6, rewardExp: 45, rewardGold: 35,  tough: 1.0 },
  { id: 'goblin', name: '哥布林', lv: 6, hpMax: 180, atk: 24, def: 10, rewardExp: 65, rewardGold: 55,  tough: 1.0 },
  { id: 'boar', name: '巨型野猪', lv: 8, hpMax: 260, atk: 31, def: 13, rewardExp: 90, rewardGold: 70,  tough: 1.0 },
  { id: 'boss-golden-sheep', name: '黄金绵羊', lv: 10, hpMax: 1000, atk: 45, def: 28, rewardExp: 400, rewardGold: 300,  isBoss: true, tough: 1.5 },
  // Spine of Frostfire (LV11~20)
  { id: 'ice-boli', name: '冰玻力', lv: 12, hpMax: 460, atk: 55, def: 24, rewardExp: 160, rewardGold: 140,  tough: 1.0 },
  { id: 'pyro-fox', name: '火焰狐', lv: 14, hpMax: 520, atk: 62, def: 20, rewardExp: 190, rewardGold: 165,  tough: 1.0 },
  { id: 'froststone-colossus', name: '寒岩巨像', lv: 17, hpMax: 780, atk: 70, def: 35, rewardExp: 240, rewardGold: 210,  tough: 1.0 },
  { id: 'boss-wind-raptor', name: '风暴迅猛龙', lv: 20, hpMax: 1600, atk: 135, def: 46, rewardExp: 540, rewardGold: 600,  isBoss: true, tough: 1.5 },
  // Thunderveil Keep (LV21~30)
  { id: 'shade', name: '影子刺客', lv: 22, hpMax: 980, atk: 95, def: 38, rewardExp: 360, rewardGold: 330,  tough: 1.0 },
  { id: 'thunder-knight', name: '雷霆骑士', lv: 25, hpMax: 1200, atk: 112, def: 43, rewardExp: 480, rewardGold: 420,  tough: 1.0 },
  { id: 'abyss-witch', name: '深渊女巫', lv: 28, hpMax: 1350, atk: 128, def: 46, rewardExp: 540, rewardGold: 500,  tough: 1.0 },
  { id: 'boss-dragon-whelp', name: '幼龙', lv: 30, hpMax: 2200, atk: 170, def: 72, rewardExp: 660, rewardGold: 610,  isBoss: true, tough: 1.5 },
  // Bogroot Expanse (LV31~40)
  { id: 'm-specter', name: '沼泽魅影', lv: 31, hpMax: 1622, atk: 139, def: 49, rewardExp: 441, rewardGold: 378,  tough: 1.0 },
  { id: 'm-rockback', name: '岩背巨兽', lv: 32, hpMax: 1682, atk: 143, def: 50, rewardExp: 456, rewardGold: 391,  tough: 1.0 },
  { id: 'm-raven', name: '血鸦', lv: 34, hpMax: 1785, atk: 151, def: 53, rewardExp: 483, rewardGold: 415,  tough: 1.0 },
  { id: 'boss-treant', name: '腐沼树妖', lv: 35, hpMax: 2676, atk: 182, def: 65, rewardExp: 622, rewardGold: 535,  isBoss: true, tough: 1.5 },
  // Duskfang Rift (LV41~50)
  { id: 'm-nightstalker', name: '夜巡狼人', lv: 36, hpMax: 1906, atk: 159, def: 55, rewardExp: 513, rewardGold: 441,  tough: 1.0 },
  { id: 'm-troll', name: '寒霜巨魔', lv: 37, hpMax: 1967, atk: 163, def: 57, rewardExp: 529, rewardGold: 454,  tough: 1.0 },
  { id: 'm-hound', name: '熔岩猎犬', lv: 39, hpMax: 2070, atk: 171, def: 59, rewardExp: 556, rewardGold: 477,  tough: 1.0 },
  { id: 'boss-priest', name: '暗影祭司', lv: 40, hpMax: 3088, atk: 206, def: 74, rewardExp: 713, rewardGold: 612,  isBoss: true, tough: 1.5 },
  // Gloomlit Arcanum (LV51~60)
  { id: 'm-harvester', name: '骨响收割者', lv: 41, hpMax: 2190, atk: 179, def: 62, rewardExp: 586, rewardGold: 503,  tough: 1.0 },
  { id: 'm-sentinel', name: '符文哨兵', lv: 42, hpMax: 2233, atk: 183, def: 63, rewardExp: 598, rewardGold: 513,  tough: 1.0 },
  { id: 'm-reaver', name: '虚空撕裂者', lv: 44, hpMax: 2354, atk: 191, def: 66, rewardExp: 628, rewardGold: 540,  tough: 1.0 },
  { id: 'boss-archmage', name: '堕落大法师', lv: 45, hpMax: 3500, atk: 230, def: 81, rewardExp: 803, rewardGold: 690,  isBoss: true, tough: 1.5 },
  // Obsidian Windscar (LV61~70)
  { id: 'm-stormcaller', name: '风暴召唤者', lv: 46, hpMax: 2457, atk: 199, def: 68, rewardExp: 655, rewardGold: 563,  tough: 1.0 },
  { id: 'm-colossus', name: '黑曜巨像', lv: 47, hpMax: 2517, atk: 203, def: 70, rewardExp: 670, rewardGold: 576,  tough: 1.0 },
  { id: 'm-titan', name: '焰生泰坦', lv: 49, hpMax: 2638, atk: 211, def: 72, rewardExp: 700, rewardGold: 602,  tough: 1.0 },
  { id: 'boss-knight', name: '恐惧骑士', lv: 50, hpMax: 3887, atk: 253, def: 90, rewardExp: 891, rewardGold: 765,  isBoss: true, tough: 1.5 },
  // Frostfire Maelstrom (LV71~80)
  { id: 'm-chimera', name: '秘能奇美拉', lv: 51, hpMax: 2741, atk: 219, def: 75, rewardExp: 727, rewardGold: 625,  tough: 1.0 },
  { id: 'm-wyrm', name: '冰霜飞龙', lv: 52, hpMax: 2801, atk: 223, def: 76, rewardExp: 742, rewardGold: 638,  tough: 1.0 },
  { id: 'm-kraken', name: '深海巨妖', lv: 54, hpMax: 2922, atk: 231, def: 79, rewardExp: 773, rewardGold: 664,  tough: 1.0 },
  { id: 'boss-warlord', name: '地狱军阀', lv: 55, hpMax: 4299, atk: 277, def: 97, rewardExp: 981, rewardGold: 842,  isBoss: true, tough: 1.5 },
  // Astral Crown (LV81~90)
  { id: 'm-templar', name: '天穹圣卫', lv: 56, hpMax: 3025, atk: 239, def: 81, rewardExp: 800, rewardGold: 687,  tough: 1.0 },
  { id: 'm-banshee', name: '灰烬魅灵', lv: 57, hpMax: 3086, atk: 243, def: 82, rewardExp: 815, rewardGold: 700,  tough: 1.0 },
  { id: 'm-hunter', name: '苍穹狩魔者', lv: 59, hpMax: 3207, atk: 251, def: 85, rewardExp: 845, rewardGold: 727,  tough: 1.0 },
  { id: 'boss-dragon', name: '远古龙王', lv: 60, hpMax: 4600, atk: 300, def: 104, rewardExp: 1075, rewardGold: 923,  isBoss: true, tough: 1.5 },
  // Green Elysium (LV61~65)
  { id: 'm-faerie', name: '森灵妖精', lv: 61, hpMax: 3150, atk: 258, def: 86, rewardExp: 860, rewardGold: 735, tough: 1.0 },
  { id: 'm-bloomfiend', name: '绽灵花魔', lv: 62, hpMax: 3220, atk: 265, def: 88, rewardExp: 882, rewardGold: 750, tough: 1.0 },
  { id: 'm-dreamstag', name: '梦角鹿', lv: 63, hpMax: 3305, atk: 272, def: 90, rewardExp: 905, rewardGold: 768, tough: 1.0 },
  { id: 'm-sylvan-sentinel', name: '森域守卫', lv: 64, hpMax: 3400, atk: 280, def: 92, rewardExp: 930, rewardGold: 785, tough: 1.0 },
  { id: 'boss-queen-of-blooms', name: '绽辉女王', lv: 65, hpMax: 4950, atk: 325, def: 108, rewardExp: 1150, rewardGold: 970, isBoss: true, tough: 1.5 },
]

