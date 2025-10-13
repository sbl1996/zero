import type { GameMap } from '@/types/map'

export const monsterPositions: Record<string, Record<string, { x: number; y: number }>> = {
  'fringe': {
    'slime': { x: 30, y: 40 },
    'wolf': { x: 60, y: 23 },
    'goblin': { x: 50, y: 50 },
    'boar': { x: 90, y: 50 },
    'boss-golden-sheep': { x: 65, y: 70 },
  },
  'spine-of-frostfire': {
    'ice-boli': { x: 25, y: 43 },
    'pyro-fox': { x: 60, y: 52 },
    'froststone-colossus': { x: 26, y: 70 },
    'boss-wind-raptor': { x: 70, y: 82 },
  },
  'thunderveil-keep': {
    'shade': { x: 52, y: 45 },
    'thunder-knight': { x: 73, y: 82 },
    'abyss-witch': { x: 22, y: 80 },
    'boss-dragon-whelp': { x: 42, y: 16 },
  },
  'bogroot-expanse': {
    'm-specter': { x: 35, y: 30 },
    'm-rockback': { x: 15, y: 45 },
    'm-raven': { x: 80, y: 40 },
    'boss-treant': { x: 50, y: 70 },
  },
  'duskfang-rift': {
    'm-nightstalker': { x: 20, y: 26 },
    'm-troll': { x: 75, y: 35 },
    'm-hound': { x: 25, y: 75 },
    'boss-priest': { x: 50, y: 50 },
  },
  'gloomlit-arcanum': {
    'm-harvester': { x: 80, y: 20 },
    'm-sentinel': { x: 30, y: 28 },
    'm-reaver': { x: 76, y: 62 },
    'boss-archmage': { x: 50, y: 45 },
  },
  'obsidian-windscar': {
    'm-stormcaller': { x: 35, y: 33 },
    'm-colossus': { x: 25, y: 60 },
    'm-titan': { x: 85, y: 50 },
    'boss-knight': { x: 70, y: 25 },
  },
  'frostfire-maelstrom': {
    'm-chimera': { x: 40, y: 50 },
    'm-wyrm': { x: 76, y: 21 },
    'm-kraken': { x: 75, y: 80 },
    'boss-warlord': { x: 25, y: 25 },
  },
  'astral-crown': {
    'm-templar': { x: 50, y: 75 },
    'm-banshee': { x: 20, y: 53 },
    'm-hunter': { x: 73, y: 15 },
    'boss-dragon': { x: 50, y: 45 },
  },
  'green-elysium': {
    'm-faerie': { x: 25, y: 35 },
    'm-bloomfiend': { x: 65, y: 25 },
    'm-dreamstag': { x: 45, y: 60 },
    'm-sylvan-sentinel': { x: 75, y: 70 },
    'boss-queen-of-blooms': { x: 50, y: 45 },
  },
}

export function getMonsterPosition(mapId: string, monsterId: string): { x: number; y: number } {
  return monsterPositions[mapId]?.[monsterId] || { x: 50, y: 50 }
}

export const defaultMapId = 'florence'

export const maps: GameMap[] = [
  {
    id: defaultMapId,
    name: '翡冷翠',
    image: '/map-florence.webp',
    description: '帝国北方重镇。',
    category: 'city',
    locations: [
      {
        id: 'shop',
        name: '商店',
        description: '整备补给与售卖战利品的最佳去处。',
        position: { x: 74, y: 62 },
        routeName: 'shop',
      },
      {
        id: 'to-fringe',
        name: '青苔原',
        description: '前往青苔遍布的初级狩猎地。',
        position: { x: 6, y: 26 },
        routeName: 'map',
        routeParams: { mapId: 'fringe' },
        destinationMapId: 'fringe',
      },
      {
        id: 'to-astral-crown',
        name: '星界王座',
        description: '面对星界终局试炼。',
        position: { x: 48, y: 8 },
        routeName: 'map',
        routeParams: { mapId: 'astral-crown' },
        destinationMapId: 'astral-crown',
      },
      {
        id: 'to-green-elysium',
        name: '绿野仙境',
        description: '前往永恒晨光照耀的神秘花园。',
        position: { x: 85, y: 15 },
        routeName: 'map',
        routeParams: { mapId: 'green-elysium' },
        destinationMapId: 'green-elysium',
      },
    ],
  },
  {
    id: 'fringe',
    name: '青苔原',
    image: '/map-fringe.webp',
    description: '连绵低丘覆盖湿润苔藓，旧风车在晚风里悠悠转动。野猪与商队混杂的足迹遍布泥地，破旧营火还冒着淡淡炊烟。',
    category: 'wild',
        locations: [
    ],
  },
  {
    id: 'spine-of-frostfire',
    name: '熔冰之脊',
    image: '/map-spine-of-frostfire.webp',
    description: '凛冽海风拍击晶蓝悬崖，碎裂矿石悬浮在气流中反射寒光。破损风帆挂在桅杆上，几名驭风者在峭壁边布置滑索。',
    category: 'wild',
        locations: [
    ],
  },
  {
    id: 'thunderveil-keep',
    name: '雷隐堡垒',
    image: '/map-thunderveil-keep.webp',
    description: '乌黑城墙被闪电劈出耀眼裂痕，暴雨在护城河上溅起高高水柱。堡垒高塔传来沉重军鼓，风暴骑士在城门外巡逻。',
    category: 'wild',
        locations: [
    ],
  },
  {
    id: 'bogroot-expanse',
    name: '腐沼根海',
    image: '/map-bogroot-expanse.webp',
    description: '巨树根系在浑浊沼水下缠成迷宫，磷火沿水面晃动成幽绿光带。半截沉船陷在泥里，腐朽旗帜随毒雾轻轻摆动。',
    category: 'wild',
        locations: [
    ],
  },
  {
    id: 'duskfang-rift',
    name: '暮影裂谷',
    image: '/map-duskfang-rift.webp',
    description: '狭长裂谷只剩斜射的余晖，岩壁间不时掠过狼影。前方营地竖起猩红旗帜，暗夜佣兵围着火堆低声交谈。',
    category: 'wild',
        locations: [
    ],
  },
  {
    id: 'gloomlit-arcanum',
    name: '暗辉法枢',
    image: '/map-gloomlit-arcanum.webp',
    description: '浮空符文沿中央星盘运转，冷色光线在黑曜石地面上游走。封存的法典漂浮在半空，符文哨兵静立守卫传送门。',
    category: 'wild',
        locations: [
    ],
  },
  {
    id: 'obsidian-windscar',
    name: '黑曜风痕',
    image: '/map-obsidian-windscar.webp',
    description: '黑曜石沙丘被狂风削成锋利脊线，夜空里极光与雷云交织闪烁。废弃风车残叶仍被风驱动，摩擦出零碎火花。',
    category: 'wild',
        locations: [
    ],
  },
  {
    id: 'frostfire-maelstrom',
    name: '霜焰裂潮',
    image: '/map-frostfire-maelstrom.webp',
    description: '寒霜与炽焰的海潮在海沟上空撞击，蒸汽翻腾成厚重雾墙。漂浮的战舰残骸被冰封，龙骨映出幽蓝火光。',
    category: 'wild',
        locations: [
    ],
  },
  {
    id: 'astral-crown',
    name: '星界王座',
    image: '/map-astral-crown.webp',
    description: '失重的殿堂悬挂着缓慢旋转的星辰，阶梯铺满银色砂砾直通中央王座。裂开的星核漂在穹顶下，星界守卫持矛监视来客。',
    category: 'wild',
        locations: [
    ],
  },
  {
    id: 'green-elysium',
    name: '绿野仙境',
    image: '/map-green-elysium.webp',
    description: '永恒晨光照耀的神秘花园，奇异植物散发着柔和的光芒。古老的树木间流淌着发光的溪流，空气中弥漫着花香与魔法的气息。',
    category: 'wild',
        locations: [
    ],
  },
]
