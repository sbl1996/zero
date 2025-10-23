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

export type AttributeKey = 'ATK' | 'DEF' | 'AGI' | 'REC'
export type CombatAttributeKey = AttributeKey

export interface AttributeAllocation {
  ATK: number
  DEF: number
  AGI: number
  REC: number
}

export interface BodyAttributes {
  HP: number
  QiMax: number
  ATK: number
  DEF: number
  AGI: number
  REC: number
}

export interface QiAttributes {
  ATK: number
  DEF: number
  AGI: number
  recovery: number
}

export interface AttributeBreakdown {
  body: number
  qi: number
  bonus: number
  total: number
}

export type AttributeSnapshot = Record<CombatAttributeKey, AttributeBreakdown>

export interface StatCaps {
  hpMax: number
  qiMax: number
}

export interface Stats {
  body: BodyAttributes
  qi: QiAttributes
  snapshot: AttributeSnapshot
  totals: Record<CombatAttributeKey, number>
  caps: StatCaps
}

export type QiOperationMode = 'idle' | 'warming' | 'active'

export interface QiOperationState {
  mode: QiOperationMode
  startedAt: number | null
  lastTickAt: number | null
  warmupSeconds: number
  progress: number
  fValue: number
}

export type RecoveryMode = 'idle' | 'run' | 'meditate'

export interface RecoveryState {
  mode: RecoveryMode
  qiPerSecond: number
  hpPerSecond: number
  updatedAt: number | null
}

export interface Resources {
  hp: number
  hpMax: number
  qi: number
  qiMax: number
  qiReserve: number
  qiOverflow: number
  operation: QiOperationState
  recovery: RecoveryState
}

export type RealmTier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'sanctuary'

export type RealmPhase = 'none' | 'initial' | 'middle' | 'high' | 'peak' | 'limit'

export interface RealmStage {
  tier: RealmTier
  phase: RealmPhase
  progress: number
  bottleneck: boolean
  overflow: number
}

export interface BasePowerRange {
  min: number
  max: number
}

export interface BasePowerState {
  current: number
  range: BasePowerRange
  delta: number
  overflow: number
  pendingDelta: number
  lastUpdatedAt: number | null
}

export type CultivationMethodId = 'dragon_blood' | 'undying' | 'tiger_stripe' | 'purple_flame'

export interface QiFocusProfile {
  atk: number
  def: number
  agi: number
  recovery?: number
}

export interface CultivationMethodState {
  id: CultivationMethodId
  focus: QiFocusProfile
  name?: string
  modifiers?: string[]
}

export type BreakthroughMethod = 'force' | 'mentor' | 'treasure'

export interface BreakthroughAttempt {
  id: string
  method: BreakthroughMethod
  timestamp: number
  success: boolean
  chance: number
  modifiers: string[]
  overflowBefore: number
  overflowAfter: number
}

export interface BreakthroughState {
  pending: boolean
  cooldownUntil: number | null
  lastAttemptAt: number | null
  overflow: number
  attempts: BreakthroughAttempt[]
}

export interface DeltaBpState {
  accumulated: number
  pending: number
  bottlenecked: boolean
  lastGainAt: number | null
}

export interface PlayerCultivationState {
  realm: RealmStage
  bp: BasePowerState
  method: CultivationMethodState
  breakthrough: BreakthroughState
  delta: DeltaBpState
}

export interface SkillMasteryBonus {
  multiplier: number
  costReduction: number
  dodge: number
}

export interface SkillMastery {
  skillId: string
  value: number
  rank: number
  lastUsedAt: number | null
  bonus: SkillMasteryBonus
}

export interface ProficiencyState {
  entries: Record<string, SkillMastery>
}

export interface EquipSubStats {
  addHP?: number
  addQiMax?: number
  addATK?: number
  addDEF?: number
  addAGI?: number
  addREC?: number
  penFlat?: number
  penPct?: number
  toughness?: number
}

export interface Equipment {
  id: string
  name: string
  slot: EquipSlot
  level: number
  mainStat: {
    HP?: number
    QiMax?: number
    ATK?: number
    DEF?: number
    AGI?: number
    REC?: number
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
  baseMain: {
    HP?: number
    QiMax?: number
    ATK?: number
    DEF?: number
    AGI?: number
    REC?: number
  }
  baseSubs: EquipSubStats
  exclusive?: '2H' | '1H+Shield'
  requiredLevel?: number
  flatCapMultiplier?: number
}

export interface InventorySave {
  stacks: Record<string, number>
  equipment: Equipment[]
}

export interface SkillSlots {
  known: string[]
  loadout: Array<string | null>
}

export interface Player {
  id?: string
  name?: string
  gold: number
  baseBodyHp: number
  baseStats: AttributeAllocation
  equips: Partial<Record<EquipSlot, Equipment>>
  stats: Stats
  res: Resources
  cultivation: PlayerCultivationState
  mastery: ProficiencyState
  skills: SkillSlots
}

export type MonsterRank = 'normal' | 'elite' | 'boss'

export interface PenetrationProfile {
  flat: number
  pct: number
}

export interface MonsterResources {
  hp: number
  hpMax: number
  qi: number
  qiMax: number
}

export interface MonsterRewards {
  deltaBp: number
  gold: number
  lootTableId?: string
}

export interface Monster {
  id: string
  name: string
  realm?: RealmStage
  rank?: MonsterRank
  bp?: BasePowerState
  attributes?: Stats
  resources?: MonsterResources
  penetration?: PenetrationProfile
  toughness?: number
  agi?: number
  rewards?: MonsterRewards
  unlocks?: string[]
  tags?: string[]
  lv?: number
  hpMax?: number
  atk?: number
  def?: number
  rewardGold?: number
  isBoss?: boolean
  tough?: number
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
  restoreQi?: number
  gainDeltaBp?: number
  price: number
  breakthroughMethod?: BreakthroughMethod
}

export interface MaterialDefinition {
  id: string
  name: string
  price: number
  usage: string
}

export type ItemDefinition = ConsumableDefinition | MaterialDefinition

export type SkillCostType = 'none' | 'qi'

export interface SkillCost {
  type: SkillCostType
  amount?: number
  percentOfQiMax?: number
}

export interface SkillResult {
  damage?: number
  coreDamage?: number
  healSelf?: number
  gainQi?: number
  spendQi?: number
  deltaBp?: number
  masteryGain?: number
  message?: string
}

export interface SkillContext {
  stats: Stats
  monster: Monster
  rng: () => number
  resources: Resources
  cultivation: PlayerCultivationState
  mastery?: SkillMastery
}

export type FlashEffectKind = 'attack' | 'skill' | 'ult'

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

export interface FlashEffect {
  id: number
  kind: FlashEffectKind
}

export interface PendingDodgeState {
  attemptedAt: number
  refundAmount: number
  consumedQi: number
}

export type BattleResolution = 'idle' | 'victory' | 'defeat'

export interface BattleOutcome {
  monsterId: string
  monsterName: string
  result: 'victory' | 'defeat'
  drops?: LootResult[]
}

export interface BattleState {
  monster: Monster | null
  monsterHp: number
  monsterQi: number
  rngSeed: number
  floatTexts: FloatText[]
  flashEffects: FlashEffect[]
  concluded: BattleResolution
  lastOutcome: BattleOutcome | null
  rematchTimer: number | null
  lastAutoRematchAt: number | null
  loot: LootResult[]
  loopHandle: ReturnType<typeof setInterval> | null
  lastTickAt: number
  battleStartedAt: number | null
  battleEndedAt: number | null
  monsterTimer: number
  skillCooldowns: number[]
  itemCooldowns: Record<string, number>
  actionLockUntil: number | null
  pendingDodge: PendingDodgeState | null
  playerQi: number
  playerQiMax: number
  qiOperation: QiOperationState
  cultivationFrame: {
    qiSpent: number
    extraQiRestored: number
    actions: Record<string, number>
  }
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
