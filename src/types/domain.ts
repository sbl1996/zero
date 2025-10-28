export type EquipSlot = 'helmet' | 'shieldL' | 'weaponR' | 'weapon2H' | 'armor' | 'ring'

export type EquipSlotKey =
  | 'helmet'
  | 'shieldL'
  | 'weaponR'
  | 'weapon2H'
  | 'armor'
  | 'ring1'
  | 'ring2'

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

export interface SkillProgress {
  skillId: string
  level: number
  xp: number
  atCap: boolean
  btStack: number
  lastUsedAt: number | null
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
  requiredRealmTier?: RealmTier
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
  flatCapMultiplier?: number
}

export interface EquipmentTemplate {
  id: string
  name: string
  slot: EquipSlot
  requiredRealmTier?: RealmTier
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
  flatCapMultiplier?: number
}

export interface InventorySave {
  stacks: Record<string, number>
  equipment: Equipment[]
}

export interface SkillSlots {
  known: string[]
  loadout: Array<string | null>
  progress: Record<string, SkillProgress>
}

export interface Player {
  id?: string
  name?: string
  gold: number
  baseBodyHp: number
  baseStats: AttributeAllocation
  equips: Partial<Record<EquipSlotKey, Equipment>>
  stats: Stats
  res: Resources
  cultivation: PlayerCultivationState
  skills: SkillSlots
}

export type MonsterRank = 'normal' | 'elite' | 'boss'

export type MonsterSpecialization =
  | 'balanced'   // 均衡
  | 'attacker'   // 攻击
  | 'defender'   // 防御
  | 'agile'      // 敏捷
  | 'bruiser'    // 重装
  | 'skirmisher' // 游击
  | 'mystic'     // 奥术
  | 'crazy'      // 疯狂

export interface MonsterBattleStats {
  ATK: number
  DEF: number
  AGI: number
}

export interface PenetrationProfile {
  flat: number
  pct: number
}

export interface MonsterRewards {
  deltaBp?: number
  gold: number
  exp?: number
  lootTableId?: string
}

export interface Monster {
  id: string
  name: string
  realmTier: RealmTier
  rank: MonsterRank
  bp: number
  specialization: MonsterSpecialization
  hp: number
  stats: MonsterBattleStats
  rewards: MonsterRewards
  toughness: number
  attackInterval: number
  isBoss: boolean
  penetration?: PenetrationProfile
  portraits?: string[]
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
  message?: string
  weaknessTriggered?: boolean
  hit?: boolean
  cooldownBonus?: {
    targetSkillId: string
    reductionPercent: number
    durationMs: number
  }
  applyVulnerability?: {
    percent: number
    durationMs: number
  }
  superArmorMs?: number
}

export interface SkillContext {
  stats: Stats
  monster: Monster
  rng: () => number
  resources: Resources
  cultivation: PlayerCultivationState
  progress?: SkillProgress
}

export type FlashEffectKind = 'attack' | 'skill' | 'ult'

export interface SkillDefinition {
  id: string
  name: string
  description: string
  cost: SkillCost
  flash: FlashEffectKind
  cooldown?: number
  chargeTime?: number
  aftercastTime?: number
  tags?: string[]
  icon?: string
  maxLevel?: number
  getCooldown?: (level: number) => number
  getChargeTime?: (level: number) => number
  getAftercastTime?: (level: number) => number
  getCostMultiplier?: (level: number) => number
  execute: (context: SkillContext) => SkillResult
}

export interface FloatText {
  id: number
  x: number
  y: number
  value: string
  kind: 'hitP' | 'hitE' | 'heal' | 'miss' | 'loot'
  variant?: 'weakness'
}

export interface FlashEffect {
  id: number
  kind: FlashEffectKind
}

export interface PendingDodgeState {
  attemptedAt: number
  invincibleUntil: number
  refundAmount: number
  consumedQi: number
  refundGranted: boolean
}

export interface PendingSkillCastState {
  skillId: string
  resolveAt: number
  qiCost: number
  silent: boolean
}

export type MonsterFollowupSource = 'golden_sheep_double_strike'

export type MonsterFollowupStage = 'telegraph' | 'active'

export interface MonsterFollowupState {
  source: MonsterFollowupSource
  stage: MonsterFollowupStage
  timer: number
  delay: number
  damageMultiplier: number
  label: string
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
  pendingSkillCast: PendingSkillCastState | null
  monsterFollowup: MonsterFollowupState | null
  playerQi: number
  playerQiMax: number
  qiOperation: QiOperationState
  cultivationFrame: {
    qiSpent: number
    extraQiRestored: number
    actions: Record<string, number>
  }
  skillChain: {
    lastSkillId: string | null
    targetId: string | null
    streak: number
  }
  skillRealmNotified: Record<string, boolean>
  skillCooldownBonuses: Record<string, { expiresAt: number; reductionPercent: number }>
  monsterVulnerability: { percent: number; expiresAt: number } | null
}

export interface UnlockState {
  clearedMonsters: Record<string, boolean>
  unlockedMaps: Record<string, boolean>
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
