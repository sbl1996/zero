import { defineStore } from 'pinia'
import { resolveMainStatBreakdown } from '@/composables/useEnhance'
import {
  CULTIVATION_ACTION_WEIGHTS,
  DEFAULT_WARMUP_SECONDS,
  attemptBreakthrough,
  advanceBodyFoundation,
  advanceQiOperation,
  applyDeltaBp,
  computeQiAttributes,
  computeEnvironmentMultiplier,
  computeRecoveryRates,
  createDefaultPlayer,
  forceAdvanceRealm,
  PASSIVE_MEDITATION_BP_PER_SECOND,
  resetQiOperation,
} from '@/composables/useLeveling'
import type { RealmBodyFoundation } from '@/composables/useLeveling'
import type { CultivationEnvironment } from '@/composables/useLeveling'
import { getStartingEquipment } from '@/data/equipment'
import { applySkillUsage, createDefaultSkillProgress } from '@/composables/useSkills'
import type { SkillUsageResult } from '@/composables/useSkills'
import { ITEMS } from '@/data/items'
import type {
  AttributeBreakdown,
  BreakthroughMethod,
  Equipment,
  EquipSlotKey,
  Player,
  RealmStage,
  RecoveryMode,
  Stats,
  SkillDefinition,
  SkillProgress,
} from '@/types/domain'
import { clamp } from '@/utils/math'

interface EquipSummary {
  addHP: number
  addQiMax: number
  addATK: number
  addDEF: number
  addAGI: number
  addREC: number
}

function withStartingEquipment(player: Player): Player {
  const equips = { ...player.equips, ...getStartingEquipment() }
  return { ...player, equips }
}

function emptyEquipSummary(): EquipSummary {
  return {
    addHP: 0,
    addQiMax: 0,
    addATK: 0,
    addDEF: 0,
    addAGI: 0,
    addREC: 0,
  }
}

function sumEquipStats(equips: Partial<Record<EquipSlotKey, Equipment>>): EquipSummary {
  const summary = emptyEquipSummary()

  Object.values(equips).forEach((eq) => {
    if (!eq) return
    const breakdown = resolveMainStatBreakdown(eq)
    breakdown.forEach((entry) => {
      if (entry.key === 'HP') summary.addHP += entry.total
      if (entry.key === 'ATK') summary.addATK += entry.total
      if (entry.key === 'DEF') summary.addDEF += entry.total
    })

    summary.addHP += eq.subs.addHP ?? 0
    summary.addQiMax += eq.subs.addQiMax ?? 0
    summary.addATK += eq.subs.addATK ?? 0
    summary.addDEF += eq.subs.addDEF ?? 0
    summary.addAGI += eq.subs.addAGI ?? 0
    summary.addREC += eq.subs.addREC ?? 0
  })

  return summary
}

type CultivationActionKey = keyof typeof CULTIVATION_ACTION_WEIGHTS

const REALM_SKILL_UNLOCKS: Array<{ tier: number; skillId: string }> = [
  { tier: 2, skillId: 'fallen_dragon_smash' },
  { tier: 3, skillId: 'star_realm_star_soul_break' },
]

type AttributeSummaryKey = 'HP' | 'QiMax' | 'ATK' | 'DEF' | 'AGI' | 'REC'
type AttributeSnapshot = Record<AttributeSummaryKey, number>

export interface AttributeChange {
  key: AttributeSummaryKey
  before: number
  after: number
  delta: number
}

export interface LevelUpRewards {
  previousRealm: RealmStage
  currentRealm: RealmStage
  attributeChanges: AttributeChange[]
  unlockedSkills: string[]
}

const ATTRIBUTE_KEYS: AttributeSummaryKey[] = ['HP', 'QiMax', 'ATK', 'DEF', 'AGI', 'REC']

function captureAttributeSnapshot(player: Player): AttributeSnapshot {
  return {
    HP: Math.round(player.res.hpMax),
    QiMax: Math.round(player.res.qiMax),
    ATK: Math.round(player.stats.totals.ATK ?? 0),
    DEF: Math.round(player.stats.totals.DEF ?? 0),
    AGI: Math.round(player.stats.totals.AGI ?? 0),
    REC: Math.round(player.stats.totals.REC ?? 0),
  }
}

function computeAttributeChanges(before: AttributeSnapshot, after: AttributeSnapshot): AttributeChange[] {
  return ATTRIBUTE_KEYS
    .map(key => ({
      key,
      before: before[key],
      after: after[key],
      delta: after[key] - before[key],
    }))
    .filter(entry => entry.delta !== 0)
}

function buildLevelUpRewards(
  previousRealm: RealmStage,
  currentRealm: RealmStage,
  before: AttributeSnapshot,
  after: AttributeSnapshot,
  unlockedSkills: string[],
): LevelUpRewards {
  return {
    previousRealm: { ...previousRealm },
    currentRealm: { ...currentRealm },
    attributeChanges: computeAttributeChanges(before, after),
    unlockedSkills,
  }
}

function getBodyFoundationSnapshot(player: Player): RealmBodyFoundation {
  return {
    hp: player.baseBodyHp,
    atk: player.baseStats.ATK,
    def: player.baseStats.DEF,
    agi: player.baseStats.AGI,
    rec: player.baseStats.REC,
  }
}

function applyBodyFoundationSnapshot(player: Player, foundation: RealmBodyFoundation) {
  player.baseBodyHp = foundation.hp
  player.baseStats = {
    ...player.baseStats,
    ATK: foundation.atk,
    DEF: foundation.def,
    AGI: foundation.agi,
    REC: foundation.rec,
  }
}

interface CultivationTickOptions {
  environment?: CultivationEnvironment
  hasMomentum?: boolean
  qiSpent?: number
  extraQiRestored?: number
  actions?: Partial<Record<CultivationActionKey, number>>
  inBattle?: boolean
  bossBattle?: boolean
}

const CULTIVATION_ACTIVITY_FACTOR = 1e-5
const CULTIVATION_ALPHA = 1.0
const CULTIVATION_BETA_DEFAULT = 0.5
const CULTIVATION_BETA_PURPLE = 0.6

function createAttributeBreakdown(bodyValue: number, qiValue = 0, bonus = 0, fValue = 0): AttributeBreakdown {
  const body = Number.isFinite(bodyValue) ? bodyValue : 0
  const qiBase = Number.isFinite(qiValue) ? qiValue : 0
  const extra = Number.isFinite(bonus) ? bonus : 0
  const qi = qiBase * clamp(fValue, 0, 1)
  return {
    body,
    qi,
    bonus: extra,
    total: body + qi + extra,
  }
}

function buildStats(state: Player, equip: EquipSummary, fValue: number): Stats {
  const method = state.cultivation.method
  const qiBase = computeQiAttributes(state.cultivation.bp.current, method)

  const bodyRecBonus = method.id === 'purple_flame' ? 20 : 0

  const body: Stats['body'] = {
    HP: state.baseBodyHp + equip.addHP,
    QiMax: Math.round(0.5 * state.cultivation.bp.current) + equip.addQiMax,
    ATK: state.baseStats.ATK + equip.addATK,
    DEF: state.baseStats.DEF + equip.addDEF,
    AGI: state.baseStats.AGI + equip.addAGI,
    REC: state.baseStats.REC + equip.addREC + bodyRecBonus,
  }

  const qi: Stats['qi'] = {
    ATK: qiBase.ATK,
    DEF: qiBase.DEF,
    AGI: qiBase.AGI,
    recovery: qiBase.recovery,
  }

  const snapshot = {
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

function recalcDerivedState(state: Player, options: { maintainRatios?: boolean } = {}) {
  const { maintainRatios = true } = options
  const equip = sumEquipStats(state.equips)
  const fValue = clamp(state.res.operation.fValue, 0, 1)
  const hpRatio = state.res.hpMax > 0 ? state.res.hp / state.res.hpMax : 1
  const qiRatio = state.res.qiMax > 0 ? state.res.qi / state.res.qiMax : 1

  state.stats = buildStats(state, equip, fValue)

  state.res.hpMax = state.stats.caps.hpMax
  state.res.qiMax = state.stats.caps.qiMax

  if (maintainRatios) {
    state.res.hp = clamp(Math.round(state.res.hpMax * hpRatio), 0, state.res.hpMax)
    state.res.qi = clamp(Math.round(state.res.qiMax * qiRatio), 0, state.res.qiMax)
  } else {
    state.res.hp = state.res.hpMax
    state.res.qi = state.res.qiMax
  }

  state.res.qiReserve = clamp(state.res.qiReserve, 0, state.res.qiMax)
  state.res.qiOverflow = clamp(state.res.qiOverflow, 0, state.res.qiMax)

  state.res.operation.warmupSeconds = state.res.operation.warmupSeconds || DEFAULT_WARMUP_SECONDS
  state.res.operation.progress = clamp(state.res.operation.progress, 0, 1)
  state.res.operation.fValue = clamp(fValue, 0, 1)
}

function makeInitialPlayer() {
  const player = withStartingEquipment({
    ...createDefaultPlayer(),
    gold: 500,
  })
  player.res.operation = resetQiOperation(player.res.operation)
  recalcDerivedState(player, { maintainRatios: false })
  player.res.hp = player.res.hpMax
  player.res.qi = player.res.qiMax
  player.res.qiReserve = 0
  player.res.qiOverflow = 0
  return player
}

type PlayerState = Player

export const usePlayerStore = defineStore('player', {
  state: (): PlayerState => makeInitialPlayer(),
  getters: {
    equipStats: (state) => sumEquipStats(state.equips),
    finalStats: (state): Stats => state.stats,
    finalCaps: (state) => ({
      hpMax: state.stats.caps.hpMax,
      qiMax: state.stats.caps.qiMax,
    }),
  },
  actions: {
    ensureSkillProgress(skillId: string): SkillProgress {
      if (!skillId) {
        throw new Error('skillId is required')
      }
      const existing = this.skills.progress[skillId]
      if (existing) return existing
      const entry = createDefaultSkillProgress(skillId)
      this.skills.progress[skillId] = entry
      return entry
    },
    ensureAllSkillProgress() {
      this.skills.known.forEach(skillId => {
        this.ensureSkillProgress(skillId)
      })
    },
    hydrate(save: Partial<Player>) {
      const basePlayer = makeInitialPlayer()
      const merged: Player = {
        ...basePlayer,
        ...save,
        baseBodyHp: typeof save?.baseBodyHp === 'number' ? save.baseBodyHp : basePlayer.baseBodyHp,
        baseStats: { ...basePlayer.baseStats, ...(save?.baseStats ?? {}) },
        equips: { ...basePlayer.equips, ...(save?.equips ?? {}) },
        stats: basePlayer.stats,
        res: {
          ...basePlayer.res,
          ...(save?.res ?? {}),
          operation: {
            ...basePlayer.res.operation,
            ...(save?.res?.operation ?? {}),
          },
          recovery: {
            ...basePlayer.res.recovery,
            ...(save?.res?.recovery ?? {}),
          },
        },
        cultivation: {
          realm: { ...basePlayer.cultivation.realm, ...(save?.cultivation?.realm ?? {}) },
          bp: { ...basePlayer.cultivation.bp, ...(save?.cultivation?.bp ?? {}) },
          method: { ...basePlayer.cultivation.method, ...(save?.cultivation?.method ?? {}) },
          breakthrough: {
            ...basePlayer.cultivation.breakthrough,
            ...(save?.cultivation?.breakthrough ?? {}),
            attempts: save?.cultivation?.breakthrough?.attempts ?? basePlayer.cultivation.breakthrough.attempts,
          },
          delta: { ...basePlayer.cultivation.delta, ...(save?.cultivation?.delta ?? {}) },
        },
        skills: {
          known: save?.skills?.known ?? basePlayer.skills.known,
          loadout: save?.skills?.loadout ?? basePlayer.skills.loadout,
          progress: {
            ...basePlayer.skills.progress,
            ...(save?.skills?.progress ?? {}),
          },
        },
      }

      const hasEquipment = Object.keys(merged.equips || {}).length > 0
      const finalPlayer = hasEquipment ? merged : withStartingEquipment(merged)

      Object.assign(this, finalPlayer)
      this.ensureAllSkillProgress()
      this.refreshDerived({ maintainRatios: false })
      this.ensureTierRewards()

      const savedHp = save?.res?.hp
      if (typeof savedHp === 'number') {
        this.res.hp = clamp(savedHp, 0, this.res.hpMax)
      }
      const savedQi = save?.res?.qi
      if (typeof savedQi === 'number') {
        this.res.qi = clamp(savedQi, 0, this.res.qiMax)
      }
    },
    reset() {
      Object.assign(this, makeInitialPlayer())
    },
    refreshDerived(options: { maintainRatios?: boolean } = {}) {
      recalcDerivedState(this, options)
    },
    recalcCaps() {
      this.refreshDerived()
    },
    recalcWithHpRatio(hpRatio: number) {
      const qiRatio = this.res.qiMax > 0 ? this.res.qi / this.res.qiMax : 1
      this.refreshDerived()
      this.res.hp = clamp(Math.round(this.res.hpMax * hpRatio), 0, this.res.hpMax)
      this.res.qi = clamp(Math.round(this.res.qiMax * qiRatio), 0, this.res.qiMax)
    },
    restoreFull() {
      const now = Date.now()
      const warmupSeconds = this.res.operation.warmupSeconds || DEFAULT_WARMUP_SECONDS
      // Keep cheat from cancelling qi operation; treat it as fully completed
      this.res.operation = {
        ...this.res.operation,
        mode: 'active',
        startedAt: this.res.operation.startedAt ?? now,
        lastTickAt: now,
        warmupSeconds,
        progress: 1,
        fValue: 1,
      }
      this.refreshDerived({ maintainRatios: false })
      this.res.hp = this.res.hpMax
      this.res.qi = this.res.qiMax
      this.res.qiReserve = 0
      this.res.qiOverflow = 0
      this.res.recovery.mode = 'idle'
    },
    gainGold(amount: number) {
      this.gold += amount
    },
    spendGold(amount: number) {
      if (this.gold < amount) return false
      this.gold -= amount
      return true
    },
    receiveDamage(amount: number) {
      this.res.hp = clamp(this.res.hp - amount, 0, this.res.hpMax)
    },
    heal(amount: number) {
      this.res.hp = clamp(this.res.hp + amount, 0, this.res.hpMax)
    },
    restoreQi(amount: number) {
      this.res.qi = clamp(this.res.qi + amount, 0, this.res.qiMax)
    },
    spendQi(amount: number) {
      if (this.res.qi < amount) return false
      this.res.qi -= amount
      if (this.res.operation.mode !== 'idle' && this.res.qi < 0.05 * this.res.qiMax) {
        this.res.operation = resetQiOperation(this.res.operation)
        this.res.recovery.mode = 'idle'
      }
      return true
    },
    startQiOperation() {
      if (this.res.operation.mode !== 'idle') return
      if (this.res.recovery.mode === 'meditate') return
      const now = Date.now()
      this.res.operation = {
        ...this.res.operation,
        mode: 'warming',
        startedAt: now,
        lastTickAt: now,
        progress: 0,
        fValue: 0,
      }
      this.stats = buildStats(this, sumEquipStats(this.equips), 0)
      this.res.hpMax = this.stats.caps.hpMax
      this.res.qiMax = this.stats.caps.qiMax
      this.res.hp = clamp(this.res.hp, 0, this.res.hpMax)
      this.res.qi = clamp(this.res.qi, 0, this.res.qiMax)
    },
    stopQiOperation() {
      this.res.operation = resetQiOperation(this.res.operation)
      this.stats = buildStats(this, sumEquipStats(this.equips), 0)
      this.res.hpMax = this.stats.caps.hpMax
      this.res.qiMax = this.stats.caps.qiMax
      this.res.hp = clamp(this.res.hp, 0, this.res.hpMax)
      this.res.qi = clamp(this.res.qi, 0, this.res.qiMax)
      this.res.recovery.mode = 'idle'
      this.res.activeCoreBoost = null
    },
    setRecoveryMode(mode: RecoveryMode, options: { preserveOperation?: boolean } = {}) {
      if (mode === 'meditate' && !options.preserveOperation) {
        this.res.operation = resetQiOperation(this.res.operation)
      }
      this.res.recovery.mode = mode
      if (mode !== 'meditate') {
        this.res.activeCoreBoost = null
      }
    },
    setRecoveryModeKeepOperation(mode: RecoveryMode) {
      // 设置恢复模式但不重置斗气运转状态
      this.res.recovery.mode = mode
      if (mode !== 'meditate') {
        this.res.activeCoreBoost = null
      }
    },
    async attemptBreakthrough(method: BreakthroughMethod) {
      const now = Date.now()
      const previousRealm = { ...this.cultivation.realm }
      const statsBefore = captureAttributeSnapshot(this)
      const foundationBefore = getBodyFoundationSnapshot(this)
      const result = attemptBreakthrough(this.cultivation, method, now)
      let rewards: LevelUpRewards | undefined
      if (result.success) {
        const foundationAfter = advanceBodyFoundation(foundationBefore, previousRealm, this.cultivation.realm)
        applyBodyFoundationSnapshot(this, foundationAfter)
      }
      this.refreshDerived({ maintainRatios: true })
      if (result.success) {
        const unlockedSkills = this.ensureTierRewards({ autoEquipNew: true })
        const statsAfter = captureAttributeSnapshot(this)
        rewards = buildLevelUpRewards(previousRealm, this.cultivation.realm, statsBefore, statsAfter, unlockedSkills)
      }
      return { ...result, rewards }
    },
    async cheatAdvanceRealm() {
      const previousRealm = { ...this.cultivation.realm }
      const statsBefore = captureAttributeSnapshot(this)
      const foundationBefore = getBodyFoundationSnapshot(this)
      const result = forceAdvanceRealm(this.cultivation)
      let rewards: LevelUpRewards | undefined
      if (result.advanced) {
        const foundationAfter = advanceBodyFoundation(foundationBefore, previousRealm, result.realm)
        applyBodyFoundationSnapshot(this, foundationAfter)
      }
      this.refreshDerived({ maintainRatios: false })
      if (result.advanced) {
        const unlockedSkills = this.ensureTierRewards({ autoEquipNew: true })
        const statsAfter = captureAttributeSnapshot(this)
        rewards = buildLevelUpRewards(previousRealm, this.cultivation.realm, statsBefore, statsAfter, unlockedSkills)
      }
      return { ...result, rewards }
    },
    cheatFillBasePower() {
      const bpState = this.cultivation.bp
      const realm = this.cultivation.realm
      const deltaState = this.cultivation.delta
      const now = Date.now()
      const span = Math.max(bpState.range.max - bpState.range.min, 0)

      bpState.current = bpState.range.max
      bpState.delta = Math.max(bpState.delta, span)
      bpState.overflow = 0
      bpState.pendingDelta = 0
      bpState.lastUpdatedAt = now

      realm.progress = 1
      realm.bottleneck = true
      realm.overflow = 0

      deltaState.accumulated = Math.max(deltaState.accumulated, span)
      deltaState.pending = 0
      deltaState.bottlenecked = true
      deltaState.lastGainAt = now

      this.refreshDerived({ maintainRatios: true })
    },
    tickCultivation(deltaSeconds: number, options: CultivationTickOptions = {}) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
        return { qiRestored: 0, hpRestored: 0, deltaApplied: 0, deltaOverflow: 0 }
      }

      const environment: CultivationEnvironment = options.environment ?? 'idle'
      const now = Date.now()
      const envMultiplier = computeEnvironmentMultiplier(environment, { hasMomentum: options.hasMomentum })
      const extraQiRestoredOption = Math.max(options.extraQiRestored ?? 0, 0)
      const qiSpent = Math.max(options.qiSpent ?? 0, 0)

      let deltaApplied = 0
      let deltaOverflow = 0
      let deltaBpGain = 0
      const tickStartMs = now - deltaSeconds * 1000
      const isMeditationEnvironment = environment === 'meditation' && this.res.recovery.mode === 'meditate'

      if (isMeditationEnvironment) {
        deltaBpGain += deltaSeconds * PASSIVE_MEDITATION_BP_PER_SECOND * envMultiplier
        const activeBoost = this.res.activeCoreBoost
        if (activeBoost) {
          if (activeBoost.expiresAt <= tickStartMs) {
            this.res.activeCoreBoost = null
          } else {
            const overlapEnd = Math.min(activeBoost.expiresAt, now)
            const overlapMs = Math.max(0, overlapEnd - tickStartMs)
            if (overlapMs > 0) {
              const overlapSeconds = Math.min(deltaSeconds, overlapMs / 1000)
              deltaBpGain += overlapSeconds * activeBoost.bonusPerSecond
            }
            if (activeBoost.expiresAt <= now) {
              this.res.activeCoreBoost = null
            }
          }
        }
      } else if (this.res.activeCoreBoost) {
        this.res.activeCoreBoost = null
      }

      const actions = options.actions ?? {}
      let actionScore = 0
      const actionEntries = Object.entries(actions)
      if (actionEntries.length > 0) {
        for (let i = 0; i < actionEntries.length; i += 1) {
          const [key, value] = actionEntries[i]!
          const weight = CULTIVATION_ACTION_WEIGHTS[key as CultivationActionKey]
          if (weight && Number.isFinite(value) && value > 0) {
            actionScore += weight * value
          }
        }
      }

      if (qiSpent > 0 || extraQiRestoredOption > 0 || actionScore > 0) {
        const beta = this.cultivation.method.id === 'purple_flame' ? CULTIVATION_BETA_PURPLE : CULTIVATION_BETA_DEFAULT
        const activeBase = envMultiplier * (CULTIVATION_ALPHA * qiSpent + beta * extraQiRestoredOption) + actionScore
        if (activeBase > 0) {
          deltaBpGain += CULTIVATION_ACTIVITY_FACTOR * activeBase
        }
      }

      if (deltaBpGain > 0) {
        const result = applyDeltaBp(this.cultivation, deltaBpGain, now)
        deltaApplied = result.applied
        deltaOverflow = result.overflow
      }

      this.res.operation = advanceQiOperation(this.res.operation, deltaSeconds, now)

      const equip = sumEquipStats(this.equips)
      this.stats = buildStats(this, equip, this.res.operation.fValue)
      const previousHp = this.res.hp
      const previousQi = this.res.qi

      this.res.hpMax = this.stats.caps.hpMax
      this.res.qiMax = this.stats.caps.qiMax
      this.res.hp = clamp(this.res.hp, 0, this.res.hpMax)
      this.res.qi = clamp(this.res.qi, 0, this.res.qiMax)

      const { qiPerSecond, hpPerSecond } = computeRecoveryRates({
        stats: this.stats,
        method: this.cultivation.method,
        operation: this.res.operation,
        recoveryMode: this.res.recovery.mode,
        inBattle: options.inBattle,
        bossBattle: options.bossBattle,
      })

      const qiGain = qiPerSecond * deltaSeconds
      const hpGain = hpPerSecond * deltaSeconds

      if (qiGain !== 0) {
        const nextQi = clamp(this.res.qi + qiGain, 0, this.res.qiMax)
        this.res.qi = nextQi
      }

      if (hpGain !== 0) {
        const nextHp = clamp(this.res.hp + hpGain, 0, this.res.hpMax)
        this.res.hp = nextHp
      }

      const actualQiRestored = Math.max(this.res.qi - previousQi, 0)
      const actualHpRestored = Math.max(this.res.hp - previousHp, 0)

      this.res.recovery.qiPerSecond = qiPerSecond
      this.res.recovery.hpPerSecond = hpPerSecond
      this.res.recovery.updatedAt = now

      const totalQiRestored = actualQiRestored + extraQiRestoredOption

      this.res.qiReserve = clamp(this.res.qiReserve, 0, this.res.qiMax)
      this.res.qiOverflow = clamp(this.res.qiOverflow, 0, this.res.qiMax)

      return {
        qiRestored: totalQiRestored,
        hpRestored: actualHpRestored,
        deltaApplied,
        deltaOverflow,
      }
    },
    getEquipmentById(id: string) {
      const entry = Object.entries(this.equips).find(([, eq]) => eq?.id === id)
      if (!entry) return null
      const [slot, equip] = entry as [EquipSlotKey, Equipment]
      return { slot, equip }
    },
    updateEquippedEquipment(id: string, changes: Partial<Equipment>) {
      const found = this.getEquipmentById(id)
      if (!found) return false
      const { slot, equip } = found
      this.equips[slot] = { ...equip, ...changes }
      this.refreshDerived()
      return true
    },
    equip(slot: EquipSlotKey, equipment: Equipment) {
      const hpRatio = this.res.hpMax > 0 ? this.res.hp / this.res.hpMax : 1
      const qiRatio = this.res.qiMax > 0 ? this.res.qi / this.res.qiMax : 1
      this.equips[slot] = { ...equipment }
      this.refreshDerived()
      this.res.hp = clamp(Math.round(this.res.hpMax * hpRatio), 0, this.res.hpMax)
      this.res.qi = clamp(Math.round(this.res.qiMax * qiRatio), 0, this.res.qiMax)
      this.res.qiReserve = clamp(this.res.qiReserve, 0, this.res.qiMax)
    },
    unequip(slot: EquipSlotKey) {
      const current = this.equips[slot]
      if (!current) return null
      const hpRatio = this.res.hpMax > 0 ? this.res.hp / this.res.hpMax : 1
      const qiRatio = this.res.qiMax > 0 ? this.res.qi / this.res.qiMax : 1
      this.equips[slot] = undefined
      this.refreshDerived()
      this.res.hp = clamp(Math.round(this.res.hpMax * hpRatio), 0, this.res.hpMax)
      this.res.qi = clamp(Math.round(this.res.qiMax * qiRatio), 0, this.res.qiMax)
      this.res.qiReserve = clamp(this.res.qiReserve, 0, this.res.qiMax)
      return current
    },
    ensureTierRewards(options: { autoEquipNew?: boolean } = {}): string[] {
      this.ensureAllSkillProgress()
      const tier = this.cultivation.realm.tier
      if (typeof tier !== 'number') return []
      const unlocked: string[] = []
      REALM_SKILL_UNLOCKS.forEach(({ tier: requiredTier, skillId }) => {
        if (tier >= requiredTier && !this.skills.known.includes(skillId)) {
          this.skills.known.push(skillId)
          this.ensureSkillProgress(skillId)
          unlocked.push(skillId)
        }
      })
      if (options.autoEquipNew) {
        unlocked.forEach((skillId) => {
          if (this.skills.loadout.includes(skillId)) return
          const emptyIndex = this.skills.loadout.findIndex(slot => slot === null)
          if (emptyIndex !== -1) {
            this.skills.loadout[emptyIndex] = skillId
          }
        })
      }
      return unlocked
    },
    unlockSkill(skillId: string) {
      if (!this.skills.known.includes(skillId)) {
        this.skills.known.push(skillId)
        this.ensureSkillProgress(skillId)
      }
    },
    equipSkill(slotIndex: number, skillId: string | null) {
      if (slotIndex < 0 || slotIndex >= this.skills.loadout.length) return false
      if (skillId && !this.skills.known.includes(skillId)) return false
      this.skills.loadout[slotIndex] = skillId
      return true
    },
    unequipSkill(slotIndex: number) {
      if (slotIndex < 0 || slotIndex >= this.skills.loadout.length) return false
      this.skills.loadout[slotIndex] = null
      return true
    },
    recordSkillUsage(
      skill: SkillDefinition,
      options: { rng: () => number; baseCooldown: number; hit: boolean; streak: number; timestamp?: number },
    ): (SkillUsageResult & { progress: SkillProgress }) | null {
      if (!skill) return null
      const progress = this.ensureSkillProgress(skill.id)
      const result = applySkillUsage({
        progress,
        definition: skill,
        realm: this.cultivation.realm,
        rng: options.rng,
        baseCooldown: options.baseCooldown,
        hit: options.hit,
        streak: options.streak,
        timestamp: options.timestamp,
      })
      return {
        ...result,
        progress,
      }
    },
    async useItem(itemId: string) {
      const def = ITEMS.find(item => item.id === itemId)
      if (!def) return false

      const isHeal = 'heal' in def && typeof def.heal === 'number'
      const isQi = 'restoreQi' in def && typeof def.restoreQi === 'number'
      const hasBreak = 'breakthroughMethod' in def && def.breakthroughMethod
      const meditationBoost = 'meditationBoost' in def ? def.meditationBoost : undefined
      const hasMeditationBoost =
        meditationBoost &&
        typeof meditationBoost.bonusPerSecond === 'number' &&
        meditationBoost.bonusPerSecond > 0 &&
        typeof meditationBoost.durationMs === 'number' &&
        meditationBoost.durationMs > 0

      if (!isHeal && !isQi && !hasMeditationBoost && !hasBreak) {
        return false
      }

      let effectApplied = false

      if (isHeal && def.heal! > 0 && this.res.hp < this.res.hpMax) {
        this.heal(def.heal!)
        effectApplied = true
      }

      if (isQi && def.restoreQi! > 0 && this.res.qi < this.res.qiMax) {
        this.restoreQi(def.restoreQi!)
        effectApplied = true
      }

      if (hasMeditationBoost) {
        if (this.res.recovery.mode !== 'meditate') {
          return false
        }
        const now = Date.now()
        const tier = 'coreShardTier' in def && typeof def.coreShardTier === 'number' ? def.coreShardTier : 0
        const current = this.res.activeCoreBoost
        if (current && current.tier === tier) {
          // Same tier: extend duration instead of overriding
          const base = Math.max(current.expiresAt, now)
          this.res.activeCoreBoost = {
            tier: current.tier,
            bonusPerSecond: current.bonusPerSecond,
            expiresAt: base + meditationBoost.durationMs,
          }
        } else {
          // Different tier or no active boost: replace and reset duration
          this.res.activeCoreBoost = {
            tier,
            bonusPerSecond: meditationBoost.bonusPerSecond,
            expiresAt: now + meditationBoost.durationMs,
          }
        }
        effectApplied = true
      }

      if (hasBreak) {
        const now = Date.now()
        const method = def.breakthroughMethod!
        attemptBreakthrough(this.cultivation, method, now)
        this.refreshDerived({ maintainRatios: true })
        effectApplied = true
      }

      return effectApplied
    },
  },

})
