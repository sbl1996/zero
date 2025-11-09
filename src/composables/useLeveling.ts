import { getCultivationMethodDefinition } from '@/data/cultivationMethods'
import { createDefaultSkillProgress } from '@/composables/useSkills'
import { clamp } from '@/utils/math'
import type {
  AttributeAllocation,
  AttributeBreakdown,
  AttributeSnapshot,
  BasePowerRange,
  BasePowerState,
  BodyAttributes,
  CultivationMethodState,
  Player,
  PlayerCultivationState,
  BreakthroughMethod,
  BreakthroughAttempt,
  QiAttributes,
  QiOperationMode,
  QiOperationState,
  RealmPhase,
  RealmStage,
  RealmTier,
  RecoveryMode,
  Resources,
  Stats,
} from '@/types/domain'

export const DEFAULT_WARMUP_SECONDS = 5

export const DEFAULT_ATTRIBUTE_ALLOCATION: AttributeAllocation = {
  ATK: 10,
  DEF: 10,
  AGI: 5,
  REC: 5,
}

export const BASE_BODY_HP = 100
const BP_TO_UNIT_FACTOR = 5
const QI_CAP_FACTOR = 0.5
const BASE_RECOVERY_OFFSET = 1
const BASE_RECOVERY_SLOPE = 0.06
const HP_RECOVERY_PER_REC = 0.1
export const PASSIVE_MEDITATION_BP_PER_SECOND = 0.1
const HP_RECOVERY_MEDITATION_MULTIPLIER = 3
const HP_RECOVERY_BATTLE_MULTIPLIER = 0.5
const HP_RECOVERY_BOSS_MULTIPLIER = 0.25
const PURPLE_RECOVERY_FLAT = 20
const PURPLE_RECOVERY_BONUS_SCALE = 0.2

const REALM_PHASE_SEQUENCE: RealmPhase[] = ['initial', 'middle', 'high', 'peak', 'limit']
const REALM_OVERFLOW_CAP_RATIO = 0.2
const REALM_TIER_SEQUENCE: RealmTier[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'sanctuary']

const REALM_BODY_HP_MULTIPLIER = 1.2
const REALM_BODY_HP_ADDITIVES = [30, 70, 100, 120, 130, 230, 300, 340, 1000]
const REALM_BODY_ATK_DEF_MULTIPLIER = 1.15
const REALM_BODY_ATK_DEF_ADDITIVE = 4
const REALM_BODY_AGI_MULTIPLIER = 1.15
const REALM_BODY_AGI_ADDITIVE = 2
const REALM_BODY_REC_MULTIPLIER = 1.2
const REALM_BODY_REC_ADDITIVE = 5

export interface RealmBodyFoundation {
  hp: number
  atk: number
  def: number
  agi: number
  rec: number
}

type NumericRealmTier = Exclude<RealmTier, 'sanctuary'>

type LowerRealmTier = Exclude<NumericRealmTier, 7 | 8 | 9>

const SINGLE_SEGMENT_BP_RANGES: Record<LowerRealmTier, BasePowerRange> = {
  1: { min: 100, max: 200 },
  2: { min: 200, max: 400 },
  3: { min: 400, max: 800 },
  4: { min: 800, max: 1600 },
  5: { min: 1600, max: 3200 },
  6: { min: 3200, max: 6400 },
}

type HigherRealmTier = Extract<NumericRealmTier, 7 | 8 | 9>

const MULTI_PHASE_BP_RANGES: Record<HigherRealmTier, BasePowerRange> = {
  7: { min: 6400, max: 12800 },
  8: { min: 12800, max: 25600 },
  9: { min: 25600, max: 51200 },
}

const MULTI_PHASE_INCREMENT: Record<HigherRealmTier, number> = {
  7: 1600,
  8: 3200,
  9: 6400,
}

const SANCTUARY_RANGE: BasePowerRange = { min: 51200, max: 102400 }
const SANCTUARY_SEGMENT = 12800
const SANCTUARY_LIMIT_MULTIPLIER = 1.2

export type CultivationEnvironment =
  | 'battle'
  | 'boss_battle'
  | 'training'
  | 'wild'
  | 'town'
  | 'meditation'
  | 'idle'

const ENVIRONMENT_MULTIPLIER: Record<CultivationEnvironment, number> = {
  battle: 1.0,
  boss_battle: 1.2,
  training: 0.8,
  wild: 0.4,
  town: 0.3,
  meditation: 20,
  idle: 0.2,
}

export const CULTIVATION_ACTION_WEIGHTS = {
  attackHit: 150,
  damageTaken: 300,
  perfectDodge: 800,
  finisherHit: 1200,
  lowHpPersistence: 200,
} as const

function realmPhaseIndex(phase: RealmPhase): number {
  if (phase === 'none') return 0
  const idx = REALM_PHASE_SEQUENCE.indexOf(phase)
  return idx >= 0 ? idx : 0
}

export function getRealmBpRange(realm: RealmStage): BasePowerRange {
  const { tier, phase } = realm
  if (tier === 'sanctuary') {
    const index = realmPhaseIndex(phase)
    if (index <= 3) {
      const min = SANCTUARY_RANGE.min + index * SANCTUARY_SEGMENT
      const max = SANCTUARY_RANGE.min + (index + 1) * SANCTUARY_SEGMENT
      return { min, max: Math.min(max, SANCTUARY_RANGE.max) }
    }
    const limitMax = Math.round(SANCTUARY_RANGE.max * SANCTUARY_LIMIT_MULTIPLIER)
    return { min: SANCTUARY_RANGE.max, max: limitMax }
  }

  if (typeof tier === 'number') {
    if (tier >= 7 && tier <= 9) {
      const key = tier as HigherRealmTier
      const base = MULTI_PHASE_BP_RANGES[key]
      const increment = MULTI_PHASE_INCREMENT[key]
      const index = realmPhaseIndex(phase)
      const min = base.min + index * increment
      const rawMax = base.min + (index + 1) * increment
      const max = Math.min(rawMax, base.max)
      return {
        min: Math.max(min, base.min),
        max,
      }
    }

    if (tier >= 1 && tier <= 6) {
      const key = tier as LowerRealmTier
      const single = SINGLE_SEGMENT_BP_RANGES[key]
      if (single) {
        return { ...single }
      }
    }
  }

  return { ...SINGLE_SEGMENT_BP_RANGES[1] }
}

function createAttributeBreakdown(body: number, qi: number, bonus = 0, fValue = 0): AttributeBreakdown {
  const bodyValue = Number.isFinite(body) ? body : 0
  const qiBase = Number.isFinite(qi) ? qi : 0
  const bonusValue = Number.isFinite(bonus) ? bonus : 0
  const qiEffective = qiBase * clamp(fValue, 0, 1)
  return {
    body: bodyValue,
    qi: qiEffective,
    bonus: bonusValue,
    total: bodyValue + qiEffective + bonusValue,
  }
}

export function computeQiAttributes(bpCurrent: number, method: CultivationMethodState): QiAttributes {
  const unit = Math.max(bpCurrent, 0) / BP_TO_UNIT_FACTOR
  const focus = method.focus
  return {
    ATK: unit * (focus.atk ?? 0),
    DEF: unit * (focus.def ?? 0),
    AGI: unit * (focus.agi ?? 0),
    recovery: unit * (focus.recovery ?? 0),
  }
}

export function composeStats(
  allocation: AttributeAllocation,
  bpCurrent: number,
  method: CultivationMethodState,
  fValue: number,
  overrides?: Partial<BodyAttributes>,
): Stats {
  const qi = computeQiAttributes(bpCurrent, method)

  const body: BodyAttributes = {
    HP: overrides?.HP ?? BASE_BODY_HP,
    QiMax: overrides?.QiMax ?? Math.round(QI_CAP_FACTOR * bpCurrent),
    ATK: overrides?.ATK ?? allocation.ATK,
    DEF: overrides?.DEF ?? allocation.DEF,
    AGI: overrides?.AGI ?? allocation.AGI,
    REC: overrides?.REC ?? allocation.REC,
  }

  const snapshot: AttributeSnapshot = {
    ATK: createAttributeBreakdown(body.ATK, qi.ATK, 0, fValue),
    DEF: createAttributeBreakdown(body.DEF, qi.DEF, 0, fValue),
    AGI: createAttributeBreakdown(body.AGI, qi.AGI, 0, fValue),
    REC: createAttributeBreakdown(body.REC, qi.recovery, 0, fValue),
  }

  const totals: Stats['totals'] = {
    ATK: snapshot.ATK.total,
    DEF: snapshot.DEF.total,
    AGI: snapshot.AGI.total,
    REC: snapshot.REC.total,
  }

  return {
    body,
    qi,
    snapshot,
    totals,
    caps: {
      hpMax: body.HP,
      qiMax: body.QiMax,
    },
  }
}

function createDefaultBasePowerState(range: BasePowerRange): BasePowerState {
  const minValue = range.min
  return {
    current: minValue,
    range: { ...range },
    delta: 0,
    overflow: 0,
    pendingDelta: 0,
    lastUpdatedAt: null,
  }
}

function createDefaultResources(hpMax: number, qiMax: number): Resources {
  return {
    hp: hpMax,
    hpMax,
    qi: qiMax,
    qiMax,
    qiReserve: 0,
    qiOverflow: 0,
    operation: {
      mode: 'idle',
      startedAt: null,
      lastTickAt: null,
      warmupSeconds: DEFAULT_WARMUP_SECONDS,
      progress: 0,
      fValue: 0,
    },
    recovery: {
      mode: 'idle',
      qiPerSecond: 0,
      hpPerSecond: 0,
      updatedAt: null,
    },
    activeCoreBoost: null,
  }
}

function createDefaultCultivationState(): PlayerCultivationState {
  const realm: RealmStage = {
    tier: 1,
    phase: 'none',
    progress: 0,
    bottleneck: false,
    overflow: 0,
  }
  const range = getRealmBpRange(realm)
  const defaultMethod = getCultivationMethodDefinition('star_soul')

  return {
    realm,
    bp: createDefaultBasePowerState(range),
    method: defaultMethod
      ? {
          id: defaultMethod.id,
          focus: { ...defaultMethod.focus },
          name: defaultMethod.name,
        }
      : {
          id: 'star_soul',
          focus: {
            atk: 0.4,
            def: 0.4,
            agi: 0.2,
          },
          name: '星魂斗气',
        },
    breakthrough: {
      pending: false,
      cooldownUntil: null,
      lastAttemptAt: null,
      overflow: 0,
      attempts: [],
    },
    delta: {
      accumulated: 0,
      pending: 0,
      bottlenecked: false,
      lastGainAt: null,
    },
  }
}

export function computeEnvironmentMultiplier(
  env: CultivationEnvironment,
  options: { hasMomentum?: boolean } = {},
): number {
  const base = ENVIRONMENT_MULTIPLIER[env] ?? 1
  return options.hasMomentum ? base * 1.5 : base
}

export function computeRecoveryMultipliers(
  operationMode: QiOperationMode,
  recoveryMode: RecoveryMode,
  fValue: number,
): { qiStateMultiplier: number; qiFMultiplier: number } {
  let qiStateMultiplier = 1
  if (recoveryMode === 'meditate') {
    qiStateMultiplier = 3
  } else if (operationMode === 'idle') {
    qiStateMultiplier = 1.5
  } else {
    qiStateMultiplier = 1
  }

  const qiFMultiplier = operationMode === 'idle' ? 1 : clamp(fValue, 0, 1)

  return {
    qiStateMultiplier,
    qiFMultiplier,
  }
}

export function getRealmTierIndex(realm: RealmStage): number {
  const idx = REALM_TIER_SEQUENCE.indexOf(realm.tier)
  return idx >= 0 ? idx : 0
}

export function advanceBodyFoundation(
  foundation: RealmBodyFoundation,
  fromRealm: RealmStage,
  toRealm: RealmStage,
): RealmBodyFoundation {
  const fromIndex = getRealmTierIndex(fromRealm)
  const toIndex = getRealmTierIndex(toRealm)
  if (toIndex <= fromIndex) {
    return { ...foundation }
  }

  let result: RealmBodyFoundation = { ...foundation }

  for (let step = fromIndex; step < toIndex; step += 1) {
    const hpIndex = Math.min(step, Math.max(REALM_BODY_HP_ADDITIVES.length - 1, 0))
    const hpAdd = REALM_BODY_HP_ADDITIVES[hpIndex] ?? 0
    result = {
      hp: Math.round(result.hp * REALM_BODY_HP_MULTIPLIER + hpAdd),
      atk: Math.round(result.atk * REALM_BODY_ATK_DEF_MULTIPLIER + REALM_BODY_ATK_DEF_ADDITIVE),
      def: Math.round(result.def * REALM_BODY_ATK_DEF_MULTIPLIER + REALM_BODY_ATK_DEF_ADDITIVE),
      agi: Math.round(result.agi * REALM_BODY_AGI_MULTIPLIER + REALM_BODY_AGI_ADDITIVE),
      rec: Math.round(result.rec * REALM_BODY_REC_MULTIPLIER + REALM_BODY_REC_ADDITIVE),
    }
  }

  return result
}

export function computeRecoveryRates(params: {
  stats: Stats
  method: CultivationMethodState
  operation: QiOperationState
  recoveryMode: RecoveryMode
  inBattle?: boolean
  bossBattle?: boolean
}): { qiPerSecond: number; hpPerSecond: number } {
  const { stats, method, operation, recoveryMode, inBattle = false, bossBattle = false } = params
  const { qiStateMultiplier, qiFMultiplier } = computeRecoveryMultipliers(operation.mode, recoveryMode, operation.fValue)

  const isPurple = method.id === 'purple_flame'
  const baseRec = stats.totals.REC
  const recForRecovery = isPurple ? baseRec + PURPLE_RECOVERY_FLAT : baseRec
  const baseQiRate = (BASE_RECOVERY_OFFSET + BASE_RECOVERY_SLOPE * recForRecovery) * qiStateMultiplier * qiFMultiplier
  const qiBonus = isPurple ? 1 + PURPLE_RECOVERY_BONUS_SCALE * clamp(operation.fValue, 0, 1) : 1
  const qiPerSecond = baseQiRate * qiBonus

  let hpPerSecond = HP_RECOVERY_PER_REC * recForRecovery
  if (recoveryMode === 'meditate') {
    hpPerSecond *= HP_RECOVERY_MEDITATION_MULTIPLIER
  }
  if (inBattle) {
    hpPerSecond *= bossBattle ? HP_RECOVERY_BOSS_MULTIPLIER : HP_RECOVERY_BATTLE_MULTIPLIER
  }

  return {
    qiPerSecond,
    hpPerSecond,
  }
}

export function applyDeltaBp(
  cultivation: PlayerCultivationState,
  delta: number,
  timestamp: number,
): { applied: number; overflow: number } {
  if (!Number.isFinite(delta) || delta <= 0) {
    return { applied: 0, overflow: 0 }
  }

  const bpState = cultivation.bp
  const realm = cultivation.realm
  const deltaState = cultivation.delta
  const range = bpState.range
  const span = Math.max(range.max - range.min, 1)
  const overflowCap = Math.max(range.max * REALM_OVERFLOW_CAP_RATIO, 0)

  deltaState.accumulated += delta
  deltaState.lastGainAt = timestamp

  let applied = 0
  let overflow = delta

  if (realm.overflow > overflowCap + 1e-6) {
    const reduction = Math.max(realm.overflow - overflowCap, 0)
    realm.overflow = overflowCap
    bpState.overflow = Math.max(0, Math.min(bpState.overflow - reduction, overflowCap))
    bpState.pendingDelta = Math.max(0, Math.min(bpState.pendingDelta - reduction, overflowCap))
    deltaState.pending = Math.max(0, deltaState.pending - reduction)
  }

  if (!realm.bottleneck) {
    const capacity = Math.max(range.max - bpState.current, 0)
    applied = Math.min(delta, capacity)
    overflow = delta - applied

    if (applied > 0) {
      bpState.current += applied
      bpState.delta += applied
      bpState.lastUpdatedAt = timestamp
    }

    const progress = clamp((bpState.current - range.min) / span, 0, 1)
    realm.progress = progress
    if (progress >= 1 - 1e-6) {
      realm.progress = 1
      realm.bottleneck = true
    }
  }

  if (overflow > 0) {
    const remainingCapacity = Math.max(overflowCap - realm.overflow, 0)
    const appliedOverflow = Math.min(overflow, remainingCapacity)
    if (appliedOverflow > 0) {
      bpState.overflow += appliedOverflow
      bpState.pendingDelta += appliedOverflow
      deltaState.pending += appliedOverflow
      deltaState.bottlenecked = true
      realm.overflow += appliedOverflow
      realm.overflow = Math.min(realm.overflow, overflowCap)
      bpState.overflow = Math.min(bpState.overflow, overflowCap)
      bpState.pendingDelta = Math.min(bpState.pendingDelta, overflowCap)
      overflow = appliedOverflow
    } else {
      overflow = 0
      deltaState.bottlenecked = realm.bottleneck
    }
  } else {
    bpState.pendingDelta = Math.max(bpState.pendingDelta - applied, 0)
    deltaState.pending = Math.max(deltaState.pending - applied, 0)
    deltaState.bottlenecked = realm.bottleneck
  }

  return { applied, overflow }
}

export function advanceQiOperation(
  operation: QiOperationState,
  deltaSeconds: number,
  timestamp: number,
): QiOperationState {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return {
      ...operation,
      lastTickAt: timestamp,
    }
  }

  if (operation.mode === 'idle') {
    return {
      ...operation,
      progress: 0,
      fValue: 0,
      startedAt: null,
      lastTickAt: timestamp,
    }
  }

  const warmupSeconds = Math.max(operation.warmupSeconds || DEFAULT_WARMUP_SECONDS, 0.001)
  const progress = clamp(operation.progress + deltaSeconds / warmupSeconds, 0, 1)
  const mode: QiOperationMode = progress >= 1 ? 'active' : operation.mode

  return {
    ...operation,
    mode,
    progress,
    fValue: progress,
    lastTickAt: timestamp,
  }
}

export function resetQiOperation(operation: QiOperationState): QiOperationState {
  return {
    ...operation,
    mode: 'idle',
    startedAt: null,
    lastTickAt: null,
    progress: 0,
    fValue: 0,
  }
}

export function createDefaultPlayer(): Player {
  const cultivation = createDefaultCultivationState()
  const bpCurrent = cultivation.bp.current
  const stats = composeStats(DEFAULT_ATTRIBUTE_ALLOCATION, bpCurrent, cultivation.method, 0)
  const res = createDefaultResources(stats.caps.hpMax, stats.caps.qiMax)
  const starterSkill = 'dragon_breath_slash'

  return {
    gold: 0,
    baseBodyHp: BASE_BODY_HP,
    baseStats: { ...DEFAULT_ATTRIBUTE_ALLOCATION },
    equips: {},
    stats,
    res,
    cultivation,
    skills: {
      known: [starterSkill],
      loadout: [starterSkill, null, null, null],
      progress: {
        [starterSkill]: createDefaultSkillProgress(starterSkill),
      },
    },
  }
}

// -------- Breakthrough System --------

function nextRealmStage(realm: RealmStage): RealmStage {
  // For lower tiers (1-6), advance tier directly. For 7-9, keep phases via getRealmBpRange.
  if (realm.tier === 'sanctuary') {
    const phases: RealmPhase[] = ['initial', 'middle', 'high', 'peak', 'limit']
    const idx = phases.indexOf(realm.phase)
    if (idx < phases.length - 1) {
      return { tier: 'sanctuary', phase: phases[idx + 1]!, progress: 0, bottleneck: false, overflow: 0 }
    }
    // Already at limit, stay but reset bottleneck/overflow
    return { tier: 'sanctuary', phase: 'limit', progress: 0, bottleneck: false, overflow: 0 }
  }
  if (typeof realm.tier === 'number') {
    const t = realm.tier
    if (t < 9) {
      return { tier: (t + 1) as RealmTier, phase: t + 1 >= 7 ? 'initial' : 'none', progress: 0, bottleneck: false, overflow: 0 }
    }
    return { tier: 'sanctuary', phase: 'initial', progress: 0, bottleneck: false, overflow: 0 }
  }
  return { tier: 1, phase: 'none', progress: 0, bottleneck: false, overflow: 0 }
}

export function computeBreakthroughChance(
  cultivation: PlayerCultivationState,
  method: BreakthroughMethod,
): number {
  const span = Math.max(cultivation.bp.range.max - cultivation.bp.range.min, 1)
  const overflowRatio = Math.max(cultivation.realm.overflow, 0) / span
  // Base chance scales with overflow; small base even without overflow
  let base = 0.08 + 0.6 * Math.min(1, overflowRatio)
  const multipliers: Record<BreakthroughMethod, number> = {
    force: 1.0,
    mentor: 1.15,
    treasure: 1.5,
  }
  base *= multipliers[method]
  // Diminishing returns on repeated failures: +2% each up to +10%
  const failCount = cultivation.breakthrough.attempts.filter(a => !a.success).length
  base += Math.min(failCount * 0.02, 0.1)
  return clamp(base, 0.01, 0.95)
}

function recordAttempt(
  cultivation: PlayerCultivationState,
  attempt: Omit<BreakthroughAttempt, 'id'>,
) {
  const id = `${attempt.method}-${attempt.timestamp}-${(cultivation.breakthrough.attempts.length + 1).toString(36)}`
  cultivation.breakthrough.attempts.push({ id, ...attempt })
  cultivation.breakthrough.lastAttemptAt = attempt.timestamp
}

function resetAfterBreakthrough(cultivation: PlayerCultivationState) {
  const range = getRealmBpRange(cultivation.realm)
  cultivation.bp.range = { ...range }
  cultivation.bp.current = range.min
  cultivation.bp.delta = 0
  cultivation.bp.overflow = 0
  cultivation.bp.pendingDelta = 0
  cultivation.bp.lastUpdatedAt = Date.now()
  cultivation.realm.progress = 0
  cultivation.realm.bottleneck = false
  cultivation.realm.overflow = 0
  cultivation.delta.accumulated = 0
  cultivation.delta.pending = 0
  cultivation.delta.bottlenecked = false
}

export function attemptBreakthrough(
  cultivation: PlayerCultivationState,
  method: BreakthroughMethod,
  now: number,
): { success: boolean; chance: number } {
  // Cooldown gate
  const cd = cultivation.breakthrough.cooldownUntil
  if (cd && now < cd) {
    return { success: false, chance: 0 }
  }
  if (!cultivation.realm.bottleneck) {
    return { success: false, chance: 0 }
  }
  const chance = computeBreakthroughChance(cultivation, method)
  const roll = Math.random()
  const success = roll < chance

  const beforeOverflow = cultivation.realm.overflow

  if (success) {
    cultivation.realm = nextRealmStage(cultivation.realm)
    resetAfterBreakthrough(cultivation)
  } else {
    // Failure consumes all accumulated overflow
    cultivation.realm.overflow = 0
    cultivation.bp.overflow = 0
    cultivation.bp.pendingDelta = 0
    cultivation.delta.pending = 0
  }

  // Cooldowns by method
  const cooldowns: Record<BreakthroughMethod, number> = {
    force: 1 * 1000,
    mentor: 90 * 1000,
    treasure: 300 * 1000,
  }
  cultivation.breakthrough.cooldownUntil = now + cooldowns[method]

  recordAttempt(cultivation, {
    method,
    timestamp: now,
    success,
    chance,
    modifiers: [],
    overflowBefore: beforeOverflow,
    overflowAfter: cultivation.realm.overflow,
  })

  return { success, chance }
}

export function forceAdvanceRealm(
  cultivation: PlayerCultivationState,
): { advanced: boolean; realm: RealmStage } {
  const previous = cultivation.realm
  const next = nextRealmStage(previous)
  const advanced = next.tier !== previous.tier || next.phase !== previous.phase

  cultivation.realm = next
  resetAfterBreakthrough(cultivation)

  cultivation.breakthrough.pending = false
  cultivation.breakthrough.cooldownUntil = null
  cultivation.breakthrough.overflow = 0

  if (!advanced) {
    cultivation.realm.progress = 0
    cultivation.realm.bottleneck = false
    cultivation.realm.overflow = 0
  }

  return { advanced, realm: cultivation.realm }
}
