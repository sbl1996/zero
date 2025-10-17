export type EquipSlot =
  | 'helmet'
  | 'shieldL'
  | 'weaponR'
  | 'weapon2H'
  | 'armor'
  | 'gloves'
  | 'belt'
  | 'ring'
  | 'boots'

export type AttributeKey = 'ATK' | 'DEF'

export interface Stats {
  ATK: number
  DEF: number
}

export interface Resources {
  hp: number
  hpMax: number
  sp: number
  spMax: number
  xp: number
  xpMax: number
}

export interface EquipSubStats {
  addATK?: number
  addDEF?: number
  addHP?: number
}

export interface Equipment {
  id: string
  name: string
  slot: EquipSlot
  level: number
  mainStat: {
    ATK?: number
    DEF?: number
    HP?: number
  }
  subs: EquipSubStats
  exclusive?: '2H' | '1H+Shield'
  requiredLevel?: number
  flatCapMultiplier?: number
}

export interface EquipmentTemplate {
  id: string
  name: string
  slot: EquipSlot
  baseMain: { ATK?: number; DEF?: number; HP?: number }
  baseSubs: EquipSubStats
  exclusive?: '2H' | '1H+Shield'
  requiredLevel?: number
  flatCapMultiplier?: number
}

export interface InventorySave {
  stacks: Record<string, number>
  equipment: Equipment[]
}

export interface Player {
  lv: number
  exp: number
  unspentPoints: number
  baseStats: Stats
  gold: number
  equips: Partial<Record<EquipSlot, Equipment>>
  res: Resources
  skills: {
    known: string[]
    loadout: Array<string | null>
  }
}

export interface Monster {
  id: string
  name: string
  lv: number
  hpMax: number
  atk: number
  def: number
  rewardExp: number
  rewardGold: number
  isBoss?: boolean
  tough?: number
  unlocks?: string[]
}

export interface ItemStack {
  id: string
  name: string
  quantity: number
}

export interface ConsumableDefinition {
  id: string
  name: string
  description?: string
  heal?: number
  restoreSp?: number
  restoreXp?: number
  price: number
}

export interface MaterialDefinition {
  id: string
  name: string
  price: number
  usage: string
}

export type ItemDefinition = ConsumableDefinition | MaterialDefinition

export type SkillCostType = 'none' | 'sp' | 'xp'

export interface SkillCost {
  type: SkillCostType
  amount?: number
}

export interface SkillResult {
  damage?: number
  coreDamage?: number
  healSelf?: number
  gainSp?: number
  gainXp?: number
  message?: string
}

export interface SkillContext {
  stats: Stats
  monster: Monster
  rng: () => number
  playerLevel: number
}

export interface SkillDefinition {
  id: string
  name: string
  description: string
  cost: SkillCost
  flash: FlashEffectKind
  cooldown?: number
  tags?: string[]
  icon?: string
  execute: (context: SkillContext) => SkillResult
}

export interface FloatText {
  id: number
  x: number
  y: number
  value: string
  kind: 'hitP' | 'hitE' | 'heal' | 'miss' | 'loot'
}

export type FlashEffectKind = 'attack' | 'skill' | 'ult'

export interface FlashEffect {
  id: number
  kind: FlashEffectKind
}

export interface BattleOutcome {
  monsterId: string
  monsterName: string
  result: 'victory' | 'defeat'
  drops?: LootResult[]
}

export interface BattleState {
  monster: Monster | null
  monsterHp: number
  rngSeed: number
  floatTexts: FloatText[]
  flashEffects: FlashEffect[]
  concluded: 'idle' | 'victory' | 'defeat'
  lastOutcome: BattleOutcome | null
  rematchTimer: number | null
  lastAutoRematchAt: number | null
  loot: LootResult[]
  loopHandle: ReturnType<typeof setInterval> | null
  lastTickAt: number
  monsterTimer: number
  skillCooldowns: number[]
  itemCooldowns: Record<string, number>
}

export interface UnlockState {
  clearedMonsters: Record<string, boolean>
  unlockedMaps: Record<string, boolean>
}

export interface LegacySaveDataV1 {
  version: 1
  player: Player
  inventory: Record<string, number>
  equipment: Equipment[]
  unlocks: UnlockState
  quickSlots?: Array<string | null>
}

export interface SaveData {
  version: number
  player: Player
  inventory: InventorySave
  unlocks: UnlockState
  quickSlots: Array<string | null>
}

export type LootKind = 'item' | 'equipment' | 'gold'

export interface ItemLootResult {
  kind: 'item'
  itemId: string
  name: string
  quantity: number
}

export interface EquipmentLootResult {
  kind: 'equipment'
  equipment: Equipment
  name: string
  quantity: number
}

export interface GoldLootResult {
  kind: 'gold'
  name: string
  amount: number
  hasBonus?: boolean
}

export type LootResult = ItemLootResult | EquipmentLootResult | GoldLootResult
