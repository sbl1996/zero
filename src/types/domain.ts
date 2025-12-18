export type EquipSlot = 'helmet' | 'shieldL' | 'weaponR' | 'weapon2H' | 'armor' | 'boots' | 'ring'

export type EquipSlotKey =
  | 'helmet'
  | 'shieldL'
  | 'weaponR'
  | 'weapon2H'
  | 'armor'
  | 'boots'
  | 'ring1'
  | 'ring2'

export type EquipmentQuality = 'normal' | 'fine' | 'rare' | 'excellent' | 'epic'

export type EquipmentStatValueType = 'flat' | 'percent'

export type EquipmentMainStatType = 'HP' | 'QiMax' | 'ATK' | 'DEF' | 'AGI' | 'REC'

export type EquipmentSubStatType =
  | 'HP'
  | 'QiMax'
  | 'ATK'
  | 'DEF'
  | 'AGI'
  | 'REC'
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
  | 'Toughness'

export interface EquipmentStatValue<TType extends EquipmentMainStatType | EquipmentSubStatType> {
  type: TType
  value: number
  valueType?: EquipmentStatValueType
}

export type EquipmentMainStat = EquipmentStatValue<EquipmentMainStatType>
export type EquipmentSubStat = EquipmentStatValue<EquipmentSubStatType>

export interface EquipmentPrice {
  buy?: number
  sell?: number
}

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
  meditationStartedAt: number | null
}

export interface CoreBoost {
  tier: number
  bonusPerSecond: number
  expiresAt: number
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
  activeCoreBoost: CoreBoost | null
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

export type CultivationMethodId = 'dragon_blood' | 'vajra' | 'tiger_stripe' | 'purple_flame'

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
  lastUsedAt: number | null
}

export interface Equipment {
  id: string
  templateId?: string
  name: string
  description?: string
  artwork?: string
  slot: EquipSlot
  level: number
  quality: EquipmentQuality
  requiredRealmTier?: RealmTier
  mainStat: EquipmentMainStat
  substats: EquipmentSubStat[]
  exclusive?: '2H' | '1H+Shield'
  flatCapMultiplier?: number
  price?: EquipmentPrice
  flags?: string[]
}

export interface EnhanceMaterialCost {
  id: string
  quantity: number
}

export interface EquipmentEnhanceRequirement {
  targetLevel: number
  materials: EnhanceMaterialCost[]
}

export interface EquipmentTemplate {
  id: string
  name: string
  description?: string
  artwork?: string
  slot: EquipSlot
  requiredRealmTier?: RealmTier
  quality: EquipmentQuality
  baseMain: EquipmentMainStat
  baseSubstats: EquipmentSubStat[]
  exclusive?: '2H' | '1H+Shield'
  flatCapMultiplier?: number
  price?: EquipmentPrice
  flags?: string[]
  enhanceMaterials?: EquipmentEnhanceRequirement[]
}

export interface EquipmentInventoryMetaEntry {
  acquiredAt: number
  seenAt: number | null
  isNew: boolean
}

export interface InventorySave {
  stacks: Record<string, number>
  equipment: Equipment[]
  equipmentMeta?: Record<string, EquipmentInventoryMetaEntry>
  lastEquipmentAcquiredAt?: number | null
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

export type MonsterRank = 'normal' | 'strong' | 'elite' | 'calamity' | 'boss'

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
  gold: number
  exp?: number
  lootTableId?: string
  coreDrop?: { tier: number; chance: number }
}

export interface MonsterSkillHit {
  delay: number
  multiplier: number
}

export interface MonsterSkillDefinition {
  id: string
  name: string
  cooldown: number
  aftercast: number
  chargeSeconds?: number
  hits: MonsterSkillHit[]
  comboLabel?: string
}

export interface MonsterSkillChargeState {
  skill: MonsterSkillDefinition
  chargeSeconds: number
  startedAt: number
  endsAt: number
}

export interface MonsterSkillProfile {
  basic: MonsterSkillDefinition
  extras: MonsterSkillDefinition[]
}

export interface MonsterAIContext {
  monster: Monster
  skillStates: Record<string, number>
  rng: () => number
}

export type MonsterAISelector = (context: MonsterAIContext) => string | null

export type MonsterAttackInterval = [number] | [number, number]

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
  attackInterval: MonsterAttackInterval
  isBoss: boolean
  baseBp: number
  baseHp: number
  flux: number
  rankHpMultiplier: number
  rewardMultiplier: number
  penetration?: PenetrationProfile
  portraits?: string[]
  skillProfile?: MonsterSkillProfile
  skillSelector?: MonsterAISelector
  skillPlanDepth?: number
}

export interface ItemStack {
  id: string
  name: string
  quantity: number
}

export interface MeditationBoost {
  bonusPerSecond: number
  durationMs: number
}

export type ItemIconDefinition =
  | { type: 'image'; src: string; alt?: string }
  | { type: 'text'; text: string }

export interface ConsumableDefinition {
  id: string
  name: string
  description?: string
  heal?: number
  restoreQi?: number
  gainDeltaBp?: number
  price: number
  breakthroughMethod?: BreakthroughMethod
  consumedOnUse?: boolean
  teleportToMapId?: string
  // Optional fields for meditation core shard items
  coreShardTier?: number
  meditationBoost?: MeditationBoost
  useDurationMs?: number
  icon?: ItemIconDefinition
}

export interface MaterialDefinition {
  id: string
  name: string
  price: number
  usage: string
  // Allow materials to opt out of being consumed when used (e.g. teleport stone)
  consumedOnUse?: boolean
  icon?: ItemIconDefinition
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
  superArmorLabel?: string
  monsterStunMs?: number
  applyPlayerAgiBuff?: {
    percent: number
    durationMs: number
  }
  applyCalamityAshStacks?: number
  triggerCalamityExplosion?: {
    multiplier: number
  }
  toggleVioletShroud?: boolean
  delayedDamage?: {
    delayMs: number
    damage: number
    coreDamage?: number
    weaknessTriggered?: boolean
    flash?: FlashEffectKind
  }
  setTigerFuryStacks?: number
}

export interface SkillContext {
  stats: Stats
  monster: Monster
  rng: () => number
  resources: Resources
  cultivation: PlayerCultivationState
  progress?: SkillProgress
  battle?: {
    tigerFuryStacks?: number
    calamityAshStacks?: number
    violetShroudActive?: boolean
  }
}

export type FlashEffectKind = 'attack' | 'skill' | 'ult'

export interface DodgeSkillConfig {
  windowMs?: number
  refundPercentOfQiMax?: number
  successText?: string
}

export type MechanicKind = 'timing' | 'defense' | 'debuff' | 'resource' | 'utility'

export interface MechanicTag {
  id: string
  label: string
  kind: MechanicKind
  value?: string
  tooltip?: string
}

export interface SkillDefinition {
  id: string
  name: string
  cost: SkillCost
  flash: FlashEffectKind
  chargeTime?: number
  aftercastTime?: number
  mechanics?: MechanicTag[]
  icon?: string
  maxLevel?: number
  dodgeConfig?: DodgeSkillConfig
  getCooldown: (level: number) => number
  getChargeTime?: (level: number) => number
  getAftercastTime?: (level: number) => number
  getCostMultiplier?: (level: number) => number
  getDamageMultiplier: (level: number) => number
  getDescription: (level: number) => string
  execute: (context: SkillContext) => SkillResult
}

export interface FloatText {
  id: number
  x: number
  y: number
  value: string
  kind: 'hitP' | 'hitE' | 'heal' | 'miss' | 'loot'
  variant?: 'weakness' | 'playerBuff' | 'enemyBuff'
}

export interface FlashEffect {
  id: number
  kind: FlashEffectKind
}

export interface SkillEffect {
  id: number
  skillId: string
  expiresAt: number
}

export interface PendingDodgeState {
  skillId?: string
  attemptedAt: number
  invincibleUntil: number
  refundAmount: number
  consumedQi: number
  refundGranted: boolean
  successText?: string
}

export interface PendingItemUseState {
  itemId: string
  startedAt: number
  resolveAt: number
  durationMs: number
  progress: number
  silent: boolean
}

export type MonsterFollowupSource = string

export type MonsterFollowupStage = 'telegraph' | 'active'

export interface MonsterFollowupState {
  source: MonsterFollowupSource
  skillId?: string
  stage: MonsterFollowupStage
  timer: number
  delay: number
  baseMultiplier: number
  hits: MonsterSkillHit[]
  nextHitIndex: number
  lastHitDelay: number
  label: string
  lastUpdatedAt: number
}

export interface MonsterComboPreviewInfo {
  skillId?: string
  label: string
  baseDelay: number
  hits: MonsterSkillHit[]
}

export type BattleResolution = 'idle' | 'victory' | 'defeat'

export interface BattleOutcome {
  monsterId: string
  monsterName: string
  result: 'victory' | 'defeat'
  drops?: LootResult[]
  questsPrepared?: string[]
}

export interface MonsterSkillPlanEntry {
  skill: MonsterSkillDefinition | null
  scheduledAt: number
  prepDuration: number
  comboPreview?: MonsterComboPreviewInfo | null
}

export interface BattleState {
  monster: Monster | null
  monsterHp: number
  monsterQi: number
  monsterRngSeed: number
  rngSeed: number
  floatTexts: FloatText[]
  flashEffects: FlashEffect[]
  skillEffects: SkillEffect[]
  concluded: BattleResolution
  lastOutcome: BattleOutcome | null
  rematchTimer: ReturnType<typeof setTimeout> | null
  lastAutoRematchAt: number | null
  loot: LootResult[]
  loopHandle: ReturnType<typeof setInterval> | null
  lastTickAt: number
  battleStartedAt: number | null
  battleEndedAt: number | null
  monsterNextSkill: MonsterSkillDefinition | null
  monsterNextSkillTimer: number
  monsterNextSkillTotal: number
  monsterCurrentSkill: MonsterSkillDefinition | null
  monsterSkillCooldowns: Record<string, number>
  monsterSkillPlan: MonsterSkillPlanEntry[]
  monsterChargingSkill: MonsterSkillChargeState | null
  monsterActionOffsetMs?: number
  monsterStunUntil: number | null
  skillCooldowns: number[]
  itemCooldowns: Record<string, number>
  monsterFollowupPreview: MonsterFollowupState | null
  actionLockUntil: number | null
  pendingDodge: PendingDodgeState | null
  dodgeAttempts: number
  dodgeSuccesses: number
  pendingItemUse: PendingItemUseState | null
  monsterFollowup: MonsterFollowupState | null
  skillCharges: Array<SkillChargeState | null>
  activeSkillChargeSlot: number | null
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
  playerSuperArmor: { expiresAt: number; durationMs: number; label?: string } | null
  playerBloodRage: { stacks: number; progressQi: number } | null
  playerTigerFury: { stacks: number; expiresAt: number; durationMs: number } | null
  playerVioletShroud: { active: boolean; lastDrainAt: number; drainCarryMs: number } | null
  playerAgiBuff: { percent: number; expiresAt: number; durationMs: number } | null
  monsterVulnerability: { percent: number; expiresAt: number; durationMs: number } | null
  monsterChargingDebuff: { expiresAt: number; durationMs: number } | null
  monsterCalamityAsh: { layers: Array<{ id: number; appliedAt: number; expiresAt: number; nextTickAt: number; perSecondDamage: number }> }
  originNodeId?: string | null
  originNodeInstanceId?: string | null
  pendingQuestCompletions: string[]
}

export type SkillChargeStatus = 'charging' | 'charged' | 'rewinding'

export interface SkillChargeState {
  slotIndex: number
  skillId: string
  level: number
  chargeTime: number
  aftercastTime: number
  qiCost: number
  status: SkillChargeStatus
  progress: number
  startedAt: number
  lastUpdatedAt: number
  silent: boolean
}

export interface UnlockState {
  clearedMonsters: Record<string, boolean>
  unlockedMaps: Record<string, boolean>
  currentNodes: Record<string, string | null>
}

export interface SaveData {
  version: number
  player: Player
  inventory: InventorySave
  unlocks: UnlockState
  quickSlots: Array<string | null>
  quests: QuestSaveState
}

export type LootKind = 'item' | 'equipment' | 'gold' | 'questItem'

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

export interface QuestLootResult {
  kind: 'questItem'
  itemId: string
  name: string
  quantity: number
  questId?: string
}

export type LootResult = ItemLootResult | EquipmentLootResult | GoldLootResult | QuestLootResult

// Quest system types
export type QuestObjectiveType = 'kill' | 'killCollect' | 'collect'

export interface QuestObjectiveBase {
  id: string
  type: QuestObjectiveType
  description?: string
  amount: number
  mapIds?: string[]
}

export interface QuestObjectiveKill extends QuestObjectiveBase {
  type: 'kill'
  monsterIds: string[]
}

export interface QuestObjectiveKillCollect extends QuestObjectiveBase {
  type: 'killCollect'
  monsterIds: string[]
  itemId: string
  dropRate: number
  maxPerKill?: number
}

export interface QuestObjectiveCollect extends QuestObjectiveBase {
  type: 'collect'
  itemId: string
}

export type QuestObjective = QuestObjectiveKill | QuestObjectiveKillCollect | QuestObjectiveCollect

export interface QuestRewardItem {
  itemId: string
  quantity: number
}

export interface QuestRewardEquipmentTemplate {
  templateId: string
  initialLevel?: number
}

export interface QuestReward {
  gold?: number
  items?: QuestRewardItem[]
  equipmentTemplates?: QuestRewardEquipmentTemplate[]
  skillUnlocks?: string[]
  notes?: string
}

export interface QuestPrerequisites {
  minRealmTier?: number
  requiredQuestIds?: string[]
  requiredMonsterIds?: string[]
  requiredFlags?: string[]
}

export type QuestRuntimeStatus = 'locked' | 'available' | 'active' | 'readyToTurnIn' | 'completed'

export interface QuestDefinition {
  id: string
  name: string
  giver: string
  location: string
  description: string
  recommendedRealmTier?: RealmTier
  difficultyLabel?: string
  prerequisites?: QuestPrerequisites
  objectives: QuestObjective[]
  rewards: QuestReward
  allowAbandon?: boolean
  repeatable?: boolean
  tags?: string[]
}

export interface QuestObjectiveProgress {
  objectiveId: string
  current: number
  completed: boolean
}

export interface QuestProgressEntry {
  questId: string
  status: Exclude<QuestRuntimeStatus, 'locked' | 'available'>
  acceptedAt: number
  completedAt: number | null
  objectives: Record<string, QuestObjectiveProgress>
}

export interface QuestCompletionLogEntry {
  questId: string
  lastSubmittedAt: number
  repeatCount: number
  lastRewards: QuestReward
}

export interface QuestSaveState {
  active: string[]
  readyToTurnIn: string[]
  completed: string[]
  questItems: Record<string, number>
  completionLog: QuestCompletionLogEntry[]
  progress: Record<string, QuestProgressEntry>
  tracked: string[]
}

export interface QuestItemDefinition {
  id: string
  name: string
  description?: string
}
