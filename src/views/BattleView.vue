<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useBattleStore } from '@/stores/battle'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'
import { useInventoryStore } from '@/stores/inventory'
import { getSkillDefinition } from '@/data/skills'
import { resolveSkillChargeTime, resolveSkillCooldown } from '@/composables/useSkills'
import { quickConsumableIds } from '@/data/items'
import { resolveDodgeSuccessChance } from '@/composables/useDodge'
import { getMonsterMap } from '@/data/monsters'
import { getAutoMonsterPortraits } from '@/utils/monsterPortraits'
import { resolveAssetUrl } from '@/utils/assetUrls'
import { formatRealmTierLabel } from '@/utils/realm'
import type {
  FloatText,
  LootResult,
  Monster,
  MonsterFollowupState,
  MonsterComboPreviewInfo,
  MonsterSpecialization,
} from '@/types/domain'
import PlayerStatusPanel from '@/components/PlayerStatusPanel.vue'
import QuickItemBar from '@/components/QuickItemBar.vue'
import MonsterAttackTimeline from '@/components/MonsterAttackTimeline.vue'
import { formatMonsterRewards } from '@/utils/monsterUtils'

const router = useRouter()
const battle = useBattleStore()
const playerStore = usePlayerStore()
const uiStore = useUiStore()
const inventory = useInventoryStore()

const { res } = storeToRefs(playerStore)
const { enableHoldAutoCast, autoRematchAfterVictory, showSkillCooldownGrayscale } = storeToRefs(uiStore)

const monster = computed(() => battle.monster)
const lastOutcome = computed(() => battle.lastOutcome)
const lootList = computed(() => battle.loot)
const hpRate = computed(() => {
  const current = monster.value
  if (!current) return 0
  const maxHp = current.hp
  if (maxHp <= 0) return 0
  return Math.max(0, battle.monsterHp) / maxHp
})
const isMonsterAttackActive = computed(() => Boolean(battle.inBattle) && battle.concluded === 'idle')
const canClickRematch = computed(() => {
  return battle.concluded === 'victory' && monster.value &&
    (!autoRematchAfterVictory.value || monster.value.isBoss)
})
const monsterAttackProgress = computed(() => {
  if (!isMonsterAttackActive.value) return 0
  const total = battle.monsterNextSkillTotal
  if (!Number.isFinite(total) || total <= 0) return 0
  const remaining = Math.max(0, battle.monsterNextSkillTimer)
  return Math.max(0, Math.min(1, remaining / total))
})

const buffTickTrigger = computed(() => battle.lastTickAt)

type BuffDisplayInfo = {
  text: string
  ratio: number
}

// 使用与battle store相同的时间函数
function getNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

const playerBuffInfo = computed<BuffDisplayInfo | null>(() => {
  const state = battle.playerSuperArmor
  void buffTickTrigger.value
  if (!state) return null
  const remainingMs = state.expiresAt - getNow()
  if (remainingMs <= 0) return null
  const ratio = state.durationMs > 0
    ? Math.max(0, Math.min(1, remainingMs / state.durationMs))
    : 0
  return {
    text: '霸体',
    ratio,
  }
})

const enemyBuffInfo = computed<BuffDisplayInfo[]>(() => {
  void buffTickTrigger.value
  const buffs: BuffDisplayInfo[] = []
  
  const vulnerability = battle.monsterVulnerability
  if (vulnerability) {
    const remainingMs = vulnerability.expiresAt - getNow()
    if (remainingMs > 0) {
      const ratio = vulnerability.durationMs > 0
        ? Math.max(0, Math.min(1, remainingMs / vulnerability.durationMs))
        : 0
      const percentLabel = `${Math.round(vulnerability.percent * 100)}%`
      buffs.push({
        text: `易伤 +${percentLabel}`,
        ratio,
      })
    }
  }
  
  const charging = battle.monsterChargingDebuff
  if (charging) {
    const remainingMs = charging.expiresAt - getNow()
    if (remainingMs > 0) {
      const ratio = charging.durationMs > 0
        ? Math.max(0, Math.min(1, remainingMs / charging.durationMs))
        : 0
      buffs.push({
        text: '蓄力',
        ratio,
      })
    }
  }
  
  return buffs
})

// 计算破绽率
const breakChance = computed(() => {
  const playerAgi = playerStore.finalStats.totals.AGI ?? 0
  const monsterAgi = monster.value?.stats.AGI ?? 0

  if (playerAgi <= 0) return 0

  // 使用破绽伤害计算函数中的破绽率计算逻辑
  const ratio = monsterAgi / playerAgi
  const gap = Math.max(0, Math.min(1, 1 - ratio))
  const chance = Math.max(0, Math.min(1, 0.05 + 0.75 * Math.pow(gap, 1.3)))

  return chance
})

// 格式化破绽率显示
const breakChanceText = computed(() => {
  const chance = breakChance.value
  return `${Math.round(chance * 100)}%`
})

// 根据破绽率获取颜色
function getBreakChanceColor(chance: number): string {
  if (chance >= 0.5) return '#ff6b7a' // 高破绽率：红色
  if (chance >= 0.3) return '#ffd166' // 中等破绽率：黄色
  if (chance >= 0.1) return '#4ecdc4' // 低破绽率：青色
  return '#94a3b8' // 极低破绽率：灰色
}
const dodgeSuccessChance = computed(() => {
  if (!monster.value) return 0
  const playerAgi = playerStore.finalStats.totals.AGI ?? 0
  const monsterAgi = monster.value.stats.AGI ?? 0
  return resolveDodgeSuccessChance(monsterAgi, playerAgi)
})
const dodgeSuccessChanceText = computed(() => `${Math.round(dodgeSuccessChance.value * 100)}%`)

function getDodgeChanceColor(chance: number): string {
  if (chance >= 0.7) return '#4ade80'
  if (chance >= 0.4) return '#fcd34d'
  if (chance >= 0.2) return '#fb923c'
  return '#94a3b8'
}
function computeFollowupTimers(followup: MonsterFollowupState): number[] {
  if (!followup || followup.hits.length === 0) return []
  const remainingHits = followup.hits.slice(followup.nextHitIndex)
  if (remainingHits.length === 0) return []
  const timers: number[] = []
  let timeUntil = Math.max(0, followup.timer)
  let prevDelay = followup.lastHitDelay ?? 0
  for (let index = 0; index < remainingHits.length; index += 1) {
    const hit = remainingHits[index]
    if (!hit) continue
    if (index === 0) {
      timers.push(timeUntil)
    } else {
      const deltaDelay = Math.max(hit.delay - prevDelay, 0)
      timeUntil += deltaDelay
      timers.push(timeUntil)
    }
    prevDelay = hit.delay
  }
  return timers
}

function computeComboPreviewTimers(
  preview: MonsterComboPreviewInfo | null | undefined,
  timeToSkill: number,
): number[] {
  if (!preview || preview.hits.length === 0) return []
  const hits: number[] = []
  const baseDelay = preview.baseDelay ?? 0
  const firstHit = preview.hits[0]
  if (!firstHit) return hits
  let timeUntil = Math.max(0, timeToSkill + Math.max(firstHit.delay - baseDelay, 0))
  hits.push(timeUntil)
  let prevDelay = firstHit.delay
  for (let index = 1; index < preview.hits.length; index += 1) {
    const hit = preview.hits[index]
    if (!hit) continue
    const deltaDelay = Math.max(hit.delay - prevDelay, 0)
    timeUntil += deltaDelay
    hits.push(timeUntil)
    prevDelay = hit.delay
  }
  return hits
}

const timelineAttackTimes = computed(() => {
  type TimelineAttackTime = { key: string, seconds: number, label?: string, special?: string }
  const markers: TimelineAttackTime[] = []
  const seenTime = new Map<number, string>()

  const pushMarker = (key: string, seconds: number, label?: string, special?: string) => {
    if (!Number.isFinite(seconds)) return
    const rounded = Math.round(seconds * 1000)
    const existingKey = seenTime.get(rounded)
    if (existingKey === key) return
    if (existingKey) {
      // 如果时间冲突，优先保留 charging-attack 标记
      if (existingKey === 'charging-attack') return
      if (key === 'charging-attack') {
        // 移除旧标记
        const idx = markers.findIndex(m => m.key === existingKey)
        if (idx >= 0) markers.splice(idx, 1)
      } else {
        return
      }
    }
    seenTime.set(rounded, key)
    markers.push({ key, seconds, label, special })
  }

  const followup = battle.monsterFollowup
  const preview = battle.monsterFollowupPreview
  const activeFollowup = followup ?? preview ?? null
  if (activeFollowup) {
    const hits = computeFollowupTimers(activeFollowup)
    const label = activeFollowup.label ?? '追击'
    hits.forEach((seconds, index) => {
      pushMarker(
        `followup-${activeFollowup.stage}-${index}`,
        seconds,
        index === 0 ? label : undefined,
      )
    })
  }

  // 如果正在蓄力，显示蓄力完成时的攻击标记
  const chargingSkill = battle.monsterChargingSkill
  if (chargingSkill) {
    const remainingSeconds = Math.max(0, battle.monsterNextSkillTimer)
    pushMarker(
      'charging-attack',
      remainingSeconds,
      '攻击！',
    )
  }

  const plan = battle.monsterSkillPlan ?? []
  if (plan.length === 0) return markers
  const referenceMs = battle.lastTickAt ?? getNowMs()
  const maxEntries = 3
  let processedEntries = 0

  for (let index = 0; index < plan.length && processedEntries < maxEntries; index += 1) {
    const entry = plan[index]
    if (!entry) continue
    const timeToSkill = Math.max(0, (entry.scheduledAt - referenceMs) / 1000)
    if (!Number.isFinite(timeToSkill)) continue

    const chargeTime = entry.skill?.chargeSeconds
    if (chargeTime && chargeTime > 0) {
      // 显示蓄力开始标记
      pushMarker(
        `plan-${index}-charge-start`,
        timeToSkill,
        '蓄力',
        'charge',
      )
      // 显示实际攻击时间（蓄力结束）
      pushMarker(
        `plan-${index}-attack`,
        timeToSkill + chargeTime,
        '攻击！',
      )
    }

    // 当正在蓄力时，plan[0]是蓄力后的下一个攻击，需要显示
    // 当没有蓄力时，plan[0]是当前即将执行的攻击，只显示combo不显示主标记
    const shouldShowMainMarker = index > 0 || (index === 0 && chargingSkill !== null)
    
    if (shouldShowMainMarker && !chargeTime) {
      pushMarker(
        `plan-${index}`,
        timeToSkill,
        entry.skill?.name,
      )
    }
    
    const comboHits = computeComboPreviewTimers(entry.comboPreview ?? null, timeToSkill)
    if (comboHits.length > 0) {
      comboHits.forEach((hitTime, hitIndex) => {
        pushMarker(
          `plan-${index}-combo-${hitIndex}`,
          hitTime,
          hitIndex === 0 ? entry.comboPreview?.label : undefined,
        )
      })
    }

    processedEntries += 1
  }

  return markers
})

const showBattleDuration = computed(() => {
  return battle.concluded !== 'idle' &&
    battle.battleStartedAt !== null &&
    battle.battleEndedAt !== null &&
    Boolean(monster.value)
})

const battleDurationText = computed(() => {
  if (!showBattleDuration.value || !battle.battleStartedAt || !battle.battleEndedAt) return ''
  const duration = Math.max(0, battle.battleEndedAt - battle.battleStartedAt)
  return formatBattleDuration(duration)
})

// Auto-cast state
const autoCastTimers = ref<Map<number, ReturnType<typeof setInterval>>>(new Map())
const autoCastHoldStart = ref<Map<number, number>>(new Map())
const isLongPress = ref<Map<number, boolean>>(new Map())
const activePressSlots = ref<Set<number>>(new Set())
const AUTO_CAST_DELAY = 1000 // 1 second hold to start auto-casting
const AUTO_CAST_INTERVAL = 200 // 200ms interval between casts

// Skill hotkey mapping
const SKILL_HOTKEYS = ['z', 'x', 'c', 'v'] as const
const hotkeyLabels = ['Z', 'X', 'C', 'V']
// Quick item hotkey mapping
const ITEM_HOTKEYS = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'] as const
const itemHotkeyLabels = ['NUM1', 'NUM2', 'NUM3', 'NUM4']
const itemHotkeyMap = new Map<string, number>(ITEM_HOTKEYS.map((code, index) => [code, index]))
const activeItemHotkeys = new Set<string>()

function describeMonsterRealm(monster: Monster | null | undefined): string {
  if (!monster?.realmTier) return '未知'
  return formatRealmTierLabel(monster.realmTier)
}

function getSpecializationLabel(specialization: MonsterSpecialization): string {
  const labels: Record<MonsterSpecialization, string> = {
    balanced: '均衡',
    attacker: '攻击',
    defender: '防御',
    agile: '敏捷',
    bruiser: '重装',
    skirmisher: '游击',
    mystic: '奥术',
    crazy: '疯狂'
  }
  return labels[specialization] || '未知'
}

function getSpecializationColor(specialization: MonsterSpecialization): { bg: string; text: string; border: string } {
  const colors: Record<MonsterSpecialization, { bg: string; text: string; border: string }> = {
    balanced: { bg: 'rgba(156, 163, 175, 0.7)', text: '#f3f4f6', border: 'rgba(156, 163, 175, 0.9)' },    // 灰色 - 平衡
    attacker: { bg: 'rgba(239, 68, 68, 0.7)', text: '#fef2f2', border: 'rgba(239, 68, 68, 0.9)' },        // 红色 - 攻击
    defender: { bg: 'rgba(59, 130, 246, 0.7)', text: '#eff6ff', border: 'rgba(59, 130, 246, 0.9)' },       // 蓝色 - 防御
    agile: { bg: 'rgba(34, 197, 94, 0.7)', text: '#f0fdf4', border: 'rgba(34, 197, 94, 0.9)' },          // 绿色 - 敏捷
    bruiser: { bg: 'rgba(168, 85, 247, 0.7)', text: '#faf5ff', border: 'rgba(168, 85, 247, 0.9)' },        // 紫色 - 重装
    skirmisher: { bg: 'rgba(251, 146, 60, 0.7)', text: '#fff7ed', border: 'rgba(251, 146, 60, 0.9)' },     // 橙色 - 游击
    mystic: { bg: 'rgba(139, 92, 246, 0.7)', text: '#f5f3ff', border: 'rgba(139, 92, 246, 0.9)' },        // 深紫色 - 奥术
    crazy: { bg: 'rgba(217, 70, 239, 0.7)', text: '#fdf4ff', border: 'rgba(217, 70, 239, 0.9)' }          // 粉色 - 疯狂
  }
  return colors[specialization] || { bg: 'rgba(107, 114, 128, 0.7)', text: '#f9fafb', border: 'rgba(107, 114, 128, 0.9)' }
}

function formatBattleDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '00:01'
  const totalSeconds = Math.max(1, Math.ceil(durationMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => value.toString().padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
}

const getNowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

const SKILL_COOLDOWN_DISPLAY_FALLBACK = 2
const skillSlots = computed(() => {
  const inBattle = battle.inBattle
  const concluded = battle.concluded
  const { qi } = res.value
  const operationMode = res.value.operation?.mode ?? 'idle'
  const actionLockUntil = battle.actionLockUntil
  const activeChargeSlot = battle.activeSkillChargeSlot
  const nowMs = getNowMs()
  const isActionLocked = actionLockUntil !== null && actionLockUntil > nowMs

  return playerStore.skills.loadout.map((skillId, index) => {
    const skill = getSkillDefinition(skillId)
    const cost = skill?.cost
    const label = skill?.name ?? '空槽'
    const iconSrc = skill?.icon ?? null

    const progressState = skillId ? playerStore.ensureSkillProgress(skillId) : null
    const level = progressState ? Math.max(progressState.level, 1) : 1
    const requiredChargeTime = skill && progressState ? resolveSkillChargeTime(skill, level) : 0
    const requiresCharge = requiredChargeTime > 0

    const chargeState = battle.skillCharges[index] ?? null
    const chargeProgress = chargeState ? Math.max(0, Math.min(chargeState.progress, 1)) : 0
    const isCharging = Boolean(chargeState && chargeState.status === 'charging')
    const isChargeReady = Boolean(chargeState && chargeState.status === 'charged')
    const isRewinding = Boolean(chargeState && chargeState.status === 'rewinding')
    const chargeAngle = Math.round(chargeProgress * 360 * 100) / 100
    const chargeStyle = chargeProgress > 0 ? {
      '--charge-angle': `${chargeAngle}deg`,
      '--charge-progress': `${chargeProgress}`,
    } : undefined

    const { label: costLabel, badge: costBadge, type: costType } = (() => {
      if (!skill) {
        return { label: '未装备', badge: null, type: null }
      }
      if (!cost || cost.type === 'none') {
        return { label: '无消耗', badge: null, type: null }
      }
      if (cost.type === 'qi') {
        const amount = cost.amount ?? 0
        const percent = cost.percentOfQiMax ?? 0
        const parts: string[] = []
        if (amount > 0) parts.push(`${amount}`)
        if (percent > 0) parts.push(`${Math.round(percent * 100)}%`)
        const value = parts.length ? parts.join(' + ') : '0'
        return { label: value, badge: value, type: cost.type }
      }
      return { label: '斗气', badge: '斗气', type: cost.type }
    })()

    const cooldown = skill ? (battle.skillCooldowns[index] ?? 0) : 0
    const cooldownDuration = skill
      ? resolveSkillCooldown(skill, level, SKILL_COOLDOWN_DISPLAY_FALLBACK)
      : 0
    const cooldownPercent = cooldownDuration > 0 ? Math.min(Math.max(cooldown / cooldownDuration, 0), 1) : 0
    const cooldownAngle = Math.round(cooldownPercent * 360 * 100) / 100
    const cooldownStyle = cooldownPercent > 0 ? {
      '--cooldown-angle': `${cooldownAngle}deg`,
      '--cooldown-progress': `${cooldownPercent}`,
    } : undefined

    let disabled = false
    let reason = ''
    if (!inBattle || concluded !== 'idle') {
      disabled = true
      reason = '未在战斗'
    } else if (!skill) {
      disabled = true
      reason = '未装备技能'
    } else if (isActionLocked) {
      disabled = true
      reason = '动作硬直中'
    } else if (operationMode === 'idle') {
      disabled = true
      reason = '需运转斗气'
    } else if (activeChargeSlot !== null && activeChargeSlot !== index) {
      disabled = true
      reason = '蓄力中'
    } else if (cooldown > 0) {
      disabled = true
      reason = `冷却中 ${cooldown.toFixed(1)}s`
    } else if (cost?.type === 'qi') {
      const percent = cost.percentOfQiMax ?? 0
      const baseAmount = cost.amount ?? 0
      const required = baseAmount + percent * res.value.qiMax
      if (required > qi) {
        disabled = true
        reason = '斗气不足'
      }
    }

    // Check if auto-casting is active for this slot
    const isAutoCasting = autoCastTimers.value.has(index)
    const isHoldingAuto = autoCastHoldStart.value.has(index) && !isLongPress.value.has(index)

    // Get hotkey info for this slot
    const hotkey = index < SKILL_HOTKEYS.length ? SKILL_HOTKEYS[index] : null
    const hotkeyLabel = index < hotkeyLabels.length ? hotkeyLabels[index] : null

    return {
      index,
      id: skillId,
      label,
      costLabel,
      costBadge,
      costType,
      cooldown,
      cooldownLabel: cooldown > 0 ? `冷却：${cooldown.toFixed(1)}s` : '',
      cooldownStyle,
      cooldownPercent,
      isOnCooldown: cooldown > 0,
      disabled,
      reason,
      isEmpty: !skill,
      isAutoCasting,
      isHolding: isHoldingAuto,
      hasImage: Boolean(iconSrc),
      imageSrc: iconSrc,
      hotkey,
      hotkeyLabel,
      requiresCharge,
      chargeProgress,
      chargeStyle,
      isCharging,
      isChargeReady,
      isRewinding,
      chargeActive: chargeProgress > 0,
    }
  })
})
const defaultPlayerPortrait = resolveAssetUrl('main_normal.webp')
const attackPlayerPortrait = resolveAssetUrl('main_attack.webp')
const playerPortraitSrc = ref(defaultPlayerPortrait)
let portraitTimer: ReturnType<typeof setTimeout> | null = null

function showAttackPortrait(duration = 800) {
  if (portraitTimer) {
    clearTimeout(portraitTimer)
    portraitTimer = null
  }
  playerPortraitSrc.value = attackPlayerPortrait
  portraitTimer = setTimeout(() => {
    playerPortraitSrc.value = defaultPlayerPortrait
    portraitTimer = null
  }, duration)
}
const monsterPortraitSrc = ref('')
const monsterPortraitError = ref(false)
const monsterPortraitCandidates = ref<string[]>([])

const normalizePortraitPath = (path: string) => resolveAssetUrl(path)

const updateMonsterPortrait = (monster: Monster | null | undefined) => {
  if (!monster) {
    monsterPortraitSrc.value = ''
    monsterPortraitError.value = false
    monsterPortraitCandidates.value = []
    return
  }

  const explicitPortraits = (monster.portraits ?? [])
    .map((portrait) => (typeof portrait === 'string' ? portrait.trim() : ''))
    .filter((portrait) => portrait.length > 0)
    .map(normalizePortraitPath)

  const autoPortraits = getAutoMonsterPortraits(monster.id)
    .map(normalizePortraitPath)

  const allPortraitsSet = new Set<string>()
  for (const portrait of explicitPortraits) {
    if (portrait) {
      allPortraitsSet.add(portrait)
    }
  }
  for (const portrait of autoPortraits) {
    if (portrait) {
      allPortraitsSet.add(portrait)
    }
  }
  const allPortraits = Array.from(allPortraitsSet)

  if (allPortraits.length > 0) {
    const randomIndex = Math.floor(Math.random() * allPortraits.length)
    const selectedPortrait = allPortraits[randomIndex]
    if (selectedPortrait) {
      monsterPortraitCandidates.value = [
        selectedPortrait,
        ...allPortraits.filter((_, index) => index !== randomIndex),
      ]
    } else {
      monsterPortraitCandidates.value = allPortraits
    }
  } else {
    const gifCandidate = normalizePortraitPath(`${monster.id}.gif`)
    const webpCandidate = normalizePortraitPath(`${monster.id}.webp`)
    monsterPortraitCandidates.value = [gifCandidate, webpCandidate]
  }

  monsterPortraitSrc.value = monsterPortraitCandidates.value[0] ?? ''
  monsterPortraitError.value = false
}

const onMonsterPortraitError = () => {
  if (!monster.value || monsterPortraitError.value) return

  const candidates = monsterPortraitCandidates.value
  const currentIndex = candidates.indexOf(monsterPortraitSrc.value)
  const nextIndex = currentIndex >= 0 ? currentIndex + 1 : 0

  if (nextIndex < candidates.length) {
    const nextPortrait = candidates[nextIndex]
    if (nextPortrait !== undefined) {
      monsterPortraitSrc.value = nextPortrait
      return
    }
  }

  monsterPortraitError.value = true
}

// Watch for monster changes
watch(() => monster.value, (newMonster) => {
  updateMonsterPortrait(newMonster)
}, { immediate: true })

type StyleMap = Record<string, string>

const missFloatStyle: StyleMap = {
  left: '50%',
  top: '50%',
  animation: 'none',
  transform: 'translate(-50%, -50%)',
  fontSize: '26px',
}

function floatTextStyle(text: FloatText): StyleMap {
  if (text.kind === 'miss') {
    // 对于状态效果类提示（霸体、易伤等），使用自定义位置
    const statusEffects = ['霸体', '易伤', '目标易伤', '闪避', '格挡', '反击', '吸血']
    const isStatusEffect = statusEffects.some(effect => text.value.includes(effect))

    if (isStatusEffect) {
      // 状态效果使用自定义位置，但保持miss样式
      return {
        left: `${text.x * 100}%`,
        top: `${text.y * 100}%`,
        animation: 'none',
        transform: 'translate(-50%, -50%)',
        fontSize: '26px',
      }
    } else {
      // 其他miss类型提示（比如未命中等）使用中央位置
      return missFloatStyle
    }
  }
  return {
    left: `${text.x * 100}%`,
    top: `${text.y * 100}%`,
  }
}

function lootEntryKey(entry: LootResult, index: number) {
  if (entry.kind === 'equipment') return `equip-${entry.equipment.id}`
  if (entry.kind === 'item') return `item-${entry.itemId}`
  return `gold-${index}-${entry.amount}`
}

function formatLootEntry(entry: LootResult) {
  if (entry.kind === 'item') {
    return `${entry.name} x${entry.quantity}`
  }
  if (entry.kind === 'equipment') {
    const level = entry.equipment.level
    return level > 0 ? `${entry.name} +${level}` : entry.name
  }
  return `${entry.name} +${entry.amount}`
}

function getGoldBonus(lootList: LootResult[]): boolean {
  return lootList.some(entry => entry.kind === 'gold' && entry.hasBonus)
}

function getTotalGold(lootList: LootResult[]): number | null {
  const goldEntry = lootList.find(entry => entry.kind === 'gold')
  return goldEntry ? goldEntry.amount : null
}

function getFilteredLootList(lootList: LootResult[]): LootResult[] {
  return lootList.filter(entry => entry.kind !== 'gold')
}

watch(
  () => battle.flashEffects[battle.flashEffects.length - 1]?.kind,
  (kind) => {
    if (kind === 'attack' || kind === 'skill' || kind === 'ult') {
      showAttackPortrait()
    }
  },
)

// Stop auto-casting when battle ends
watch(
  () => battle.concluded,
  (concluded) => {
    if (concluded !== 'idle') {
      stopAllAutoCast()
      activeItemHotkeys.clear()
      battle.cancelItemUse('cancelled')
    }
  },
)

watch(enableHoldAutoCast, (enabled) => {
  if (!enabled) {
    stopAllAutoCast()
  }
})

function handleSkillPress(slotIndex: number, event?: MouseEvent | TouchEvent) {
  if (event instanceof MouseEvent && event.button !== 0) {
    return
  }

  const slot = skillSlots.value[slotIndex]
  if (!slot) return

  activePressSlots.value.add(slotIndex)

  if (slot.requiresCharge) {
    const started = battle.playerUseSkill(slotIndex)
    if (!started) {
      activePressSlots.value.delete(slotIndex)
    }
    if (event && 'preventDefault' in event) {
      event.preventDefault()
    }
    return
  }

  if (event && 'preventDefault' in event && event.type.startsWith('touch')) {
    event.preventDefault()
  }

  if (slot.isEmpty || slot.disabled) return

  startSkillHold(slotIndex, event)
}

function handleSkillRelease(slotIndex: number) {
  if (!activePressSlots.value.has(slotIndex)) {
    stopAutoCast(slotIndex)
    return
  }

  const wasLongPress = isLongPress.value.has(slotIndex)
  activePressSlots.value.delete(slotIndex)
  stopAutoCast(slotIndex)

  const slot = skillSlots.value[slotIndex]
  if (!slot) return

  if (slot.requiresCharge) {
    battle.releaseSkillCharge(slotIndex)
    return
  }

  if (wasLongPress) {
    setTimeout(() => {
      isLongPress.value.delete(slotIndex)
    }, 100)
    return
  }

  battle.playerUseSkill(slotIndex)
}

function handleSkillCancel(slotIndex: number) {
  if (!activePressSlots.value.has(slotIndex)) {
    stopAutoCast(slotIndex)
    return
  }
  activePressSlots.value.delete(slotIndex)
  stopAutoCast(slotIndex)

  const slot = skillSlots.value[slotIndex]
  if (slot?.requiresCharge) {
    battle.cancelSkillCharge(slotIndex)
  }
}

async function useQuickItem(slotIndex: number): Promise<boolean> {
  if (!battle.inBattle || battle.concluded !== 'idle') return false
  if (slotIndex < 0 || slotIndex >= inventory.quickSlots.length) return false
  const itemId = inventory.quickSlots[slotIndex]
  if (typeof itemId !== 'string' || !quickConsumableIds.has(itemId)) return false
  try {
    const started = await battle.useItem(itemId)
    return Boolean(started)
  } catch {
    return false
  }
}

// Auto-cast functions
function startSkillHold(slotIndex: number, event?: MouseEvent | TouchEvent) {
  const slot = skillSlots.value[slotIndex]
  if (!slot || slot.disabled || slot.isEmpty) return
  if (slot.requiresCharge) return

  if (!enableHoldAutoCast.value) return

  // Record when the hold started
  autoCastHoldStart.value.set(slotIndex, getNowMs())

  // Set up timer to start auto-casting after delay and prevent default only for long holds
  setTimeout(() => {
    // Check if we're still holding this skill
    if (autoCastHoldStart.value.has(slotIndex)) {
      // Mark this as a long press
      isLongPress.value.set(slotIndex, true)

      // Only prevent default behavior when we're actually starting auto-cast (long hold)
      if (event) {
        event.preventDefault()
      }
      startAutoCast(slotIndex)
    }
  }, AUTO_CAST_DELAY)
}

function startAutoCast(slotIndex: number) {
  if (!enableHoldAutoCast.value) return

  const attempt = (silent = true) => {
    const slot = skillSlots.value[slotIndex]
    if (!slot || slot.isEmpty) {
      stopAutoCast(slotIndex)
      return
    }
    if (slot.requiresCharge) {
      stopAutoCast(slotIndex)
      return
    }
    if (battle.concluded !== 'idle') {
      stopAutoCast(slotIndex)
      return
    }
    if (slot.isOnCooldown) {
      return
    }
    if (slot.disabled) {
      stopAutoCast(slotIndex)
      return
    }
    battle.playerUseSkill(slotIndex, { silent })
  }

  // Don't start if there's already an auto-cast timer for this slot
  if (autoCastTimers.value.has(slotIndex)) return

  // Cast the skill immediately (silent to avoid浮动提示)
  attempt(true)

  // Set up interval for repeated casting
  const timer = setInterval(() => {
    attempt(true)
  }, AUTO_CAST_INTERVAL)

  autoCastTimers.value.set(slotIndex, timer)
}

function stopAutoCast(slotIndex: number) {
  // Clear the hold start time
  autoCastHoldStart.value.delete(slotIndex)

  // Clear the long press flag
  isLongPress.value.delete(slotIndex)

  // Clear the auto-cast timer if it exists
  const timer = autoCastTimers.value.get(slotIndex)
  if (timer) {
    clearInterval(timer)
    autoCastTimers.value.delete(slotIndex)
  }
}

function stopAllAutoCast() {
  // Clear all hold start times
  autoCastHoldStart.value.clear()

  // Clear all long press flags
  isLongPress.value.clear()

  // Clear active presses
  activePressSlots.value.clear()

  // Clear all auto-cast timers
  autoCastTimers.value.forEach((timer) => {
    clearInterval(timer)
  })
  autoCastTimers.value.clear()
}

function backToSelect() {
  stopAllAutoCast()

  // 获取当前战斗的怪物所属的地图
  let targetRoute = '/'
  if (monster.value) {
    const mapId = getMonsterMap(monster.value.id)
    if (mapId) {
      targetRoute = `/map/${mapId}`
    }
  }

  battle.exitBattle()
  router.push(targetRoute)
}

function handleBossPortraitClick() {
  if (!monster.value) return
  if (battle.concluded !== 'victory') return

  // Get the current monster before resetting
  const currentMonster = monster.value

  // Reset battle state without restoring resources
  battle.clearRematchTimer()
  battle.start(currentMonster)
}

// Keyboard event handler for skill hotkeys
async function handleKeyDown(event: KeyboardEvent) {
  // Only handle keydown events during active battle
  if (!battle.inBattle || battle.concluded !== 'idle') return

  const key = event.key.toLowerCase()
  const hotkeyIndex = SKILL_HOTKEYS.indexOf(key as typeof SKILL_HOTKEYS[number])

  if (hotkeyIndex !== -1) {
    event.preventDefault()
    const slot = skillSlots.value[hotkeyIndex]
    if (slot?.requiresCharge && event.repeat) return
    const started = battle.playerUseSkill(hotkeyIndex)
    if (slot?.requiresCharge && started) {
      activePressSlots.value.add(hotkeyIndex)
    }
    return
  }

  const itemSlotIndex = itemHotkeyMap.get(event.code)
  if (itemSlotIndex !== undefined) {
    event.preventDefault()
    if (activeItemHotkeys.has(event.code)) return
    const started = await useQuickItem(itemSlotIndex)
    if (started) {
      activeItemHotkeys.add(event.code)
    }
  }
}

function handleKeyUp(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const hotkeyIndex = SKILL_HOTKEYS.indexOf(key as typeof SKILL_HOTKEYS[number])
  if (hotkeyIndex !== -1) {
    if (activePressSlots.value.has(hotkeyIndex)) {
      battle.releaseSkillCharge(hotkeyIndex)
      activePressSlots.value.delete(hotkeyIndex)
    }
    stopAutoCast(hotkeyIndex)
  }

  if (!activeItemHotkeys.has(event.code)) return
  activeItemHotkeys.delete(event.code)
  battle.cancelItemUse('cancelled')
}

onMounted(() => {
  // Add global keyboard event listener
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
})

onBeforeUnmount(() => {
  // Remove keyboard event listener
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)

  activeItemHotkeys.clear()
  battle.exitBattle()
  stopAllAutoCast()
  if (portraitTimer) {
    clearTimeout(portraitTimer)
    portraitTimer = null
  }
  playerPortraitSrc.value = defaultPlayerPortrait
})
</script>

<style scoped>
.auto-casting {
  background: linear-gradient(45deg, #ff6b7a, #ff8e53) !important;
  animation: pulse 0.5s infinite alternate;
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255, 107, 122, 0.6);
}

.holding {
  background: linear-gradient(45deg, #4ecdc4, #44a3aa) !important;
  animation: pulse 0.3s infinite alternate;
}

.auto-cast-indicator {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 14px;
  animation: spin 1s linear infinite;
}

.hold-indicator {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 14px;
}

@keyframes pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.8;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.battle-actions button {
  position: relative;
  overflow: hidden;
}

.battle-actions button::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: conic-gradient(
    from -90deg,
    rgba(10, 16, 30, 0.78) 0deg,
    rgba(10, 16, 30, 0.78) calc(var(--cooldown-progress, 0) * 360deg),
    rgba(245, 213, 124, 0) calc(var(--cooldown-progress, 0) * 360deg),
    rgba(245, 213, 124, 0) 360deg
  );
  opacity: 0;
  transition: opacity 160ms ease, background 120ms linear;
  z-index: 1;
  transform: rotate(90deg) scaleY(-1);
  transform-origin: 50% 50%;
}

.battle-actions button.on-cooldown::before {
  opacity: 1;
}

.battle-actions button.requires-charge {
  border-color: rgba(164, 180, 198, 0.55);
}

.battle-actions button.is-charging {
  border-color: rgba(180, 196, 214, 0.78);
  box-shadow: 0 0 12px rgba(112, 164, 208, 0.25);
}

.battle-actions button.is-charge-ready {
  border-color: rgba(213, 220, 226, 0.95);
  box-shadow: 0 0 16px rgba(210, 220, 230, 0.35);
}

.battle-actions button.is-charge-rewinding {
  border-color: rgba(128, 138, 152, 0.6);
}

.battle-actions button > * {
  position: relative;
  z-index: 2;
}

.battle-actions button > .skill-charge-progress {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.battle-actions button > .skill-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 3;
}

.skill-charge-progress {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: conic-gradient(
    from -90deg,
    rgba(18, 24, 36, 0.92) 0deg,
    rgba(18, 24, 36, 0.92) var(--charge-angle, 0deg),
    rgba(210, 215, 225, 0) var(--charge-angle, 0deg),
    rgba(210, 215, 225, 0) 360deg
  );
  mix-blend-mode: multiply;
  transition: background 120ms linear, opacity 160ms ease, filter 160ms ease;
  opacity: 0.95;
  z-index: 1;
  transform: rotate(90deg) scaleY(-1);
  transform-origin: 50% 50%;
  filter: grayscale(0.9) brightness(0.9);
}

.skill-charge-progress--rewinding {
  opacity: 0.65;
  filter: grayscale(1) brightness(0.75);
}

.skill-charge-progress--ready {
  opacity: 0.35;
  box-shadow: inset 0 0 18px rgba(224, 228, 234, 0.36);
  filter: grayscale(0.4) brightness(1.08);
}

.battle-action-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.skill-slot-label {
  width: 100%;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-align: center;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.2;
  min-height: 1.4em;
  overflow-wrap: anywhere;
}

.skill-slot-label--empty {
  color: rgba(255, 255, 255, 0.5);
}

.skill-hotkey {
  position: absolute;
  bottom: 6px;
  left: 6px;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  padding: 2px 4px;
  text-transform: uppercase;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 2;
}

.skill-cost-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: rgba(255, 255, 255, 0.94);
  text-transform: uppercase;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(3px);
  pointer-events: none;
  z-index: 2;
}

.skill-cost-badge--sp {
  color: #7ee1ff;
}

.skill-cost-badge--xp {
  color: #ffd166;
}

.boss-portrait {
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease;
  z-index: 10;
  position: relative;
}

.battle-portraits--interactive .battle-portrait.enemy {
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease;
  z-index: 10;
  position: relative;
}

.battle-portraits--interactive .battle-portrait.enemy:hover {
  transform: scale(1.05);
  filter: brightness(1.1) drop-shadow(0 0 8px rgba(255, 215, 0, 0.6));
}

.battle-portraits--interactive .battle-portrait.enemy:active {
  transform: scale(0.98);
}

.boss-portrait:hover {
  transform: scale(1.05);
  filter: brightness(1.1) drop-shadow(0 0 8px rgba(255, 215, 0, 0.6));
}

.boss-portrait:active {
  transform: scale(0.98);
}

.boss-portrait.victory-state {
  animation: victory-pulse 2s infinite alternate;
  filter: brightness(1.2) drop-shadow(0 0 12px rgba(255, 215, 0, 0.8));
}

@keyframes victory-pulse {
  from {
    filter: brightness(1.2) drop-shadow(0 0 12px rgba(255, 215, 0, 0.8));
  }
  to {
    filter: brightness(1.4) drop-shadow(0 0 20px rgba(255, 215, 0, 1));
  }
}

.loot-equipment {
  color: #ff6b35 !important;
  font-weight: 700 !important;
  text-shadow: 0 0 8px rgba(255, 107, 53, 0.8) !important;
  animation: equipment-glow 1.5s ease-in-out infinite alternate !important;
}

.loot-normal {
  color: #ffd166;
}

.loot-gold-bonus {
  color: #ff6b35 !important;
  font-weight: 700 !important;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.9) !important;
  animation: gold-bonus-glow 1.2s ease-in-out infinite alternate !important;
}

@keyframes equipment-glow {
  from {
    text-shadow: 0 0 8px rgba(255, 107, 53, 0.8);
    transform: scale(1);
  }
  to {
    text-shadow: 0 0 16px rgba(255, 107, 53, 1);
    transform: scale(1.05);
  }
}

@keyframes gold-bonus-glow {
  from {
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.9);
    transform: scale(1);
  }
  to {
    text-shadow: 0 0 20px rgba(255, 215, 0, 1);
    transform: scale(1.08);
  }
}

/* 敌方头像视觉效果 */
.enemy-portrait-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transform-origin: center bottom;
  --enemy-portrait-width: var(--battle-portrait-width);
  width: var(--enemy-portrait-width);
  max-width: var(--battle-portrait-max-width);
  padding: 0;
  align-self: center;
}

.enemy-portrait-container--boss {
  --enemy-portrait-width: var(--battle-portrait-boss-width);
}

.enemy-portrait-container--warning {
  animation: portrait-warning-shake 2s infinite;
}

.enemy-portrait-container--danger {
  animation: portrait-danger-shake 1s infinite;
}

.enemy-portrait-container .battle-portrait.enemy {
  width: 100%;
  max-width: 100%;
  max-height: 100%;
}

.battle-duration-banner {
  position: absolute;
  left: 50%;
  bottom: 0px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.65);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #e2e8f0;
  font-size: 14px;
  letter-spacing: 0.4px;
  backdrop-filter: blur(6px);
  pointer-events: none;
  z-index: 12;
}

.battle-duration-value {
  font-size: 18px;
  font-weight: 700;
  color: #ffd166;
  letter-spacing: 0.6px;
}

.attack-warning-aura {
  position: absolute;
  left: 50%;
  bottom: clamp(6px, 1.5vw, 18px);
  width: calc(var(--enemy-portrait-width) + clamp(18px, 4vw, 40px));
  aspect-ratio: 1 / 1;
  transform: translate(-50%, 12%);
  transform-origin: center;
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(74, 222, 128, 0.35) 0%, transparent 70%);
  box-shadow: 0 0 20px rgba(74, 222, 128, 0.25);
  z-index: -1;
  transition: all 0.3s ease;
}

.attack-warning-aura.aura-warning {
  background: radial-gradient(circle at center, rgba(251, 191, 36, 0.45) 0%, transparent 70%);
  box-shadow: 0 0 22px rgba(251, 191, 36, 0.35);
  animation: aura-warning-pulse 1s infinite alternate;
}

.attack-warning-aura.aura-danger {
  background: radial-gradient(circle at center, rgba(239, 68, 68, 0.55) 0%, transparent 70%);
  box-shadow: 0 0 22px rgba(239, 68, 68, 0.38);
  animation: aura-danger-pulse 0.5s infinite alternate;
}

@media (max-width: 640px) {
  .attack-warning-aura {
    bottom: clamp(4px, 1.8vw, 12px);
    width: calc(var(--enemy-portrait-width) + clamp(14px, 8vw, 28px));
    transform: translate(-50%, 10%);
  }
}

.battle-portrait.enemy.portrait-warning {
  filter: brightness(1.1) drop-shadow(0 0 8px rgba(251, 191, 36, 0.6));
}

.battle-portrait.enemy.portrait-danger {
  filter: brightness(1.2) drop-shadow(0 0 12px rgba(239, 68, 68, 0.8));
}

@keyframes aura-warning-pulse {
  from {
    transform: translate(-50%, 12%) scale(1);
    opacity: 0.7;
  }
  to {
    transform: translate(-50%, 12%) scale(1.1);
    opacity: 1;
  }
}

@keyframes aura-danger-pulse {
  from {
    transform: translate(-50%, 12%) scale(1);
    opacity: 0.8;
  }
  to {
    transform: translate(-50%, 12%) scale(1.15);
    opacity: 1;
  }
}

@keyframes portrait-warning-shake {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(-1px) rotate(-0.5deg); }
  75% { transform: translateX(1px) rotate(0.5deg); }
}

@keyframes portrait-danger-shake {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  25% { transform: translateX(-2px) rotate(-1deg); }
  75% { transform: translateX(2px) rotate(1deg); }
}

/* 破绽率与闪避率 */
.break-dodge-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  margin-top: 6px;
}

.break-chance-display {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.break-chance-label {
  color: rgba(255, 255, 255, 0.7);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.break-chance-value {
  font-weight: 700;
  text-shadow: 0 0 8px currentColor, 0 1px 2px rgba(0, 0, 0, 0.5);
  transition: color 0.3s ease, text-shadow 0.3s ease;
}

.dodge-rate-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}

.dodge-rate-label {
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.dodge-rate-value {
  font-weight: 700;
  text-shadow: 0 0 6px rgba(126, 225, 255, 0.8);
}

.float-area {
  position: relative;
}

.buff-overlay {
  position: absolute;
  top: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #f4f6fb;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  --buff-progress: 1;
  z-index: 15;
  pointer-events: none;
}

.buff-overlay--player {
  left: 12px;
  text-align: left;
}

.buff-overlay--enemy {
  right: 12px;
  text-align: right;
  top: calc(8px + var(--buff-index, 0) * 38px);
}

.buff-overlay::after {
  content: '';
  position: absolute;
  bottom: 4px;
  left: 10px;
  right: 10px;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  transform-origin: left;
  transform: scaleX(var(--buff-progress, 1));
  transition: transform 0.1s linear;
}

.buff-overlay--enemy::after {
  transform-origin: right;
}

.monster-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 0.35rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: #ffe1e6;
  background: rgba(255, 80, 120, 0.6);
  margin-left: 8px;
  vertical-align: middle;
}

.monster-badge.specialization-badge {
  border: 1px solid;
}
</style>

<template>
  <section v-if="!monster" class="panel" style="text-align: center;">
    <p v-if="battle.concluded === 'victory'">
      战斗胜利！成功击败 {{ lastOutcome?.monsterName ?? '敌人' }}。
    </p>
      <p v-else-if="battle.concluded === 'defeat'">
      战斗失败……未能击败 {{ lastOutcome?.monsterName ?? '敌人' }}。<br>
      <span style="color: #ff6b7a;">死亡惩罚：失去全部经验值和1/3金币，已满状态复活</span>
    </p>
    <p v-else>请选择一名怪物开始战斗。</p>
    <button class="btn" @click="backToSelect">返回怪物列表</button>
  </section>
  <div v-else class="battle-layout">
    <PlayerStatusPanel />

    <section class="panel" style="display: flex; flex-direction: column; gap: 20px;">
      <header class="flex flex-between" style="align-items: flex-start;">
        <div>
          <h2 class="section-title" style="margin: 0 0 4px;">
            {{ monster.name }}
            <span v-if="monster.isBoss" class="monster-badge">BOSS</span>
            <span v-else
              class="monster-badge specialization-badge"
              :style="{
                background: getSpecializationColor(monster.specialization).bg,
                color: getSpecializationColor(monster.specialization).text,
                borderColor: getSpecializationColor(monster.specialization).border
              }">
              {{ getSpecializationLabel(monster.specialization) }}
            </span>
          </h2>
          <div class="text-muted text-small">境界 {{ describeMonsterRealm(monster) }} ｜ 攻击 {{ monster.stats.ATK }} ｜ 防御 {{ monster.stats.DEF }} ｜ 敏捷 {{ monster.stats.AGI }}</div>
          <div class="text-small text-muted" style="margin-top: 6px;">奖励：{{ formatMonsterRewards(monster) }}</div>
        </div>
        <div class="text-right" style="margin-top: 10px;">
          <div class="resource-bar" style="width: 200px;">
            <span class="resource-hp" :style="{ width: `${Math.floor(hpRate * 100)}%` }" />
          </div>
          <div class="text-small text-muted" style="margin-top: 4px;">HP {{ battle.monsterHp }} / {{ monster.hp ?? '—' }}</div>
          <div class="break-dodge-row">
            <div class="break-chance-display">
              <span class="break-chance-label">破绽率</span>
              <span class="break-chance-value" :style="{ color: getBreakChanceColor(breakChance) }">{{ breakChanceText }}</span>
            </div>
            <div class="dodge-rate-banner">
              <span class="dodge-rate-label">闪避成功率</span>
              <span class="dodge-rate-value" :style="{ color: getDodgeChanceColor(dodgeSuccessChance) }">
                {{ dodgeSuccessChanceText }}
              </span>
            </div>
          </div>
        </div>
      </header>
      <div class="float-area">
        <div
          v-if="playerBuffInfo"
          class="buff-overlay buff-overlay--player"
          :style="{ '--buff-progress': playerBuffInfo.ratio }"
        >
          {{ playerBuffInfo.text }}
        </div>
        <div
          v-for="(buff, index) in enemyBuffInfo"
          :key="index"
          class="buff-overlay buff-overlay--enemy"
          :style="{ '--buff-progress': buff.ratio, '--buff-index': index }"
        >
          {{ buff.text }}
        </div>
        <div
          class="battle-portraits"
          :class="{
            'battle-portraits--interactive': canClickRematch
          }"
        >
          <img class="battle-portrait player" :src="playerPortraitSrc" alt="主角立绘" />
        <div
          class="enemy-portrait-container"
          :class="{
            'enemy-portrait-container--boss': monster.isBoss,
            'enemy-portrait-container--warning': battle.inBattle && battle.concluded === 'idle' && monsterAttackProgress <= 0.6 && monsterAttackProgress > 0.3,
            'enemy-portrait-container--danger': battle.inBattle && battle.concluded === 'idle' && monsterAttackProgress <= 0.3
          }"
        >
            <!-- 攻击预警光环效果 -->
            <div
              v-if="battle.inBattle && battle.concluded === 'idle'"
              class="attack-warning-aura"
              :class="{
                'aura-warning': monsterAttackProgress <= 0.6 && monsterAttackProgress > 0.3,
                'aura-danger': monsterAttackProgress <= 0.3
              }"
            />
            <img
              class="battle-portrait enemy"
              :class="{
                'boss-portrait': monster.isBoss,
                'victory-state': canClickRematch,
                'portrait-warning': monsterAttackProgress <= 0.6 && monsterAttackProgress > 0.3,
                'portrait-danger': monsterAttackProgress <= 0.3
              }"
              :src="monsterPortraitSrc"
              :alt="monster.name"
              @error="onMonsterPortraitError"
              @click="handleBossPortraitClick"
            />
          </div>
        </div>
        <div
          v-for="flash in battle.flashEffects"
          :key="flash.id"
          class="flash-effect"
          :class="`flash-${flash.kind}`"
        >
          <span class="flash-layer flash-layer--core" />
          <span class="flash-layer flash-layer--ring" />
          <span class="flash-layer flash-layer--burst" />
        </div>
        <div
          v-for="text in battle.floatTexts"
          :key="text.id"
          class="float-text"
          :class="[text.kind, text.variant]"
          :style="floatTextStyle(text)"
        >
          {{ text.value }}
        </div>
        <div
          v-if="battle.concluded === 'victory'"
          class="float-text"
          style="left: 50%; top: 50%; animation: none; transform: translate(-50%, -50%); font-size: 26px; text-align: center; pointer-events: none;"
        >
          <div>胜利</div>
          <div class="text-small" style="margin-top: 6px;">奖励：</div>
          <div
            class="text-small"
            :class="getGoldBonus(lootList) ? 'loot-gold-bonus' : ''"
            style="margin-top: 6px;"
          >
            + GOLD {{ getTotalGold(lootList) ?? monster?.rewards.gold ?? 0 }}
          </div>
          <div v-if="getFilteredLootList(lootList).length" class="text-small" style="margin-top: 8px;">
            <div style="font-weight: 600;">掉落</div>
            <div
              v-for="(entry, index) in getFilteredLootList(lootList)"
              :key="`loot-${lootEntryKey(entry, index)}`"
              :class="entry.kind === 'equipment' ? 'loot-equipment' : 'loot-normal'"
              style="margin-top: 2px;"
            >
              {{ formatLootEntry(entry) }}
            </div>
          </div>
        </div>
        <div v-else-if="battle.concluded === 'defeat'" class="float-text" style="left: 50%; top: 50%; animation: none; transform: translate(-50%, -50%); font-size: 26px; color: #ff6b7a;">
          战败
        </div>
        <div
          v-if="showBattleDuration"
          class="battle-duration-banner"
        >
          本次战斗用时：
          <span class="battle-duration-value">{{ battleDurationText }}</span>
        </div>
      </div>

      <MonsterAttackTimeline
        :active="isMonsterAttackActive"
        :time-to-attack="isMonsterAttackActive ? battle.monsterNextSkillTimer : null"
        :pending-dodge="battle.pendingDodge"
        :action-lock-until="battle.actionLockUntil"
        :attack-times="timelineAttackTimes"
      />

      <div class="battle-action-row" :class="{ 'cooldown-mask-only': !showSkillCooldownGrayscale }">
        <div class="battle-actions">
          <div
            v-for="slot in skillSlots"
            :key="slot.index"
            class="battle-action-slot"
          >
            <button
              :disabled="slot.disabled"
              :class="{
                empty: slot.isEmpty,
                'auto-casting': slot.isAutoCasting,
                'holding': slot.isHolding,
                'on-cooldown': slot.isOnCooldown,
                'has-image': slot.hasImage,
                'requires-charge': slot.requiresCharge,
                'is-charging': slot.isCharging,
                'is-charge-ready': slot.isChargeReady,
                'is-charge-rewinding': slot.isRewinding
              }"
              :title="slot.reason || undefined"
              :style="slot.cooldownStyle"
              @mousedown="handleSkillPress(slot.index, $event)"
              @mouseup="handleSkillRelease(slot.index)"
              @mouseleave="handleSkillCancel(slot.index)"
              @touchstart.prevent="handleSkillPress(slot.index, $event)"
              @touchend="handleSkillRelease(slot.index)"
              @touchcancel="handleSkillCancel(slot.index)"
            >
              <template v-if="slot.hasImage">
                <div class="skill-image-container">
                  <img
                    v-if="slot.imageSrc"
                    :src="slot.imageSrc"
                    :alt="slot.label"
                    class="skill-image"
                  >
                </div>
              </template>
              <template v-else>
                <span class="skill-name">{{ slot.label }}</span>
                <span class="skill-cost">{{ slot.costLabel }}</span>
              </template>
              <div
                v-if="slot.chargeProgress > 0"
                class="skill-charge-progress"
                :class="{
                  'skill-charge-progress--ready': slot.isChargeReady,
                  'skill-charge-progress--rewinding': slot.isRewinding
                }"
                :style="slot.chargeStyle"
              />
              <div class="skill-overlay">
                <span
                  v-if="slot.hasImage && slot.costBadge"
                  class="skill-cost-badge"
                  :class="slot.costType ? `skill-cost-badge--${slot.costType}` : ''"
                >
                  {{ slot.costBadge }}
                </span>
                <span
                  v-if="slot.hotkeyLabel && !slot.isEmpty"
                  class="skill-hotkey"
                >
                  {{ slot.hotkeyLabel }}
                </span>
              </div>
              <span v-if="slot.isAutoCasting" class="auto-cast-indicator">🔄</span>
              <span v-else-if="slot.isHolding" class="hold-indicator">⏱️</span>
            </button>
            <div
              class="skill-slot-label"
              :class="{ 'skill-slot-label--empty': slot.isEmpty }"
            >
              {{ slot.label }}
            </div>
          </div>
        </div>

        <QuickItemBar
          class="battle-quick-items"
          :hotkeys="ITEM_HOTKEYS"
          :hotkey-labels="itemHotkeyLabels"
        />
      </div>

      <footer class="flex flex-between flex-center">
        <button class="btn" @click="backToSelect">退出战斗</button>
      </footer>
    </section>

    </div>
</template>
