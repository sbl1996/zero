<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import PlayerStatusPanel from '@/components/PlayerStatusPanel.vue'
import LevelUpSuccessModal from '@/components/LevelUpSuccessModal.vue'
import { usePlayerStore } from '@/stores/player'
import type { LevelUpRewards } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { computeBreakthroughChance, computeEnvironmentMultiplier, PASSIVE_MEDITATION_BP_PER_SECOND } from '@/composables/useLeveling'
import type { BreakthroughMethod } from '@/types/domain'
import { clamp } from '@/utils/math'
import { CORE_SHARD_CONFIGS } from '@/data/cultivationCores'

const player = usePlayerStore()
const inventory = useInventoryStore()
const { cultivation, res } = storeToRefs(player)

const isMeditating = ref(res.value?.recovery?.mode === 'meditate')
const meditationStartAt = ref<number | null>(isMeditating.value ? Date.now() : null)
const elapsedSeconds = ref(0)
const nowTick = ref(Date.now())
const breakthroughFeedback = ref<string | null>(null)
const breakthroughFeedbackPositive = ref<boolean | null>(null)
const levelUpRewards = ref<LevelUpRewards | null>(null)
const coreFeedback = ref<string | null>(null)
const coreFeedbackPositive = ref<boolean | null>(null)

let elapsedTimer: ReturnType<typeof setInterval> | null = null
let nowTimer: ReturnType<typeof setInterval> | null = null

function updateElapsed() {
  if (!meditationStartAt.value) {
    elapsedSeconds.value = 0
    return
  }
  const now = Date.now()
  elapsedSeconds.value = Math.max(0, Math.floor((now - meditationStartAt.value) / 1000))
}

function startElapsedTimer() {
  stopElapsedTimer()
  updateElapsed()
  elapsedTimer = setInterval(updateElapsed, 1000)
}

function stopElapsedTimer(reset = false) {
  if (elapsedTimer) {
    clearInterval(elapsedTimer)
    elapsedTimer = null
  }
  if (reset) {
    elapsedSeconds.value = 0
  }
}

function startMeditation() {
  if (isMeditating.value) return

  // 只有在斗气运转完成后才能开始冥想
  if (res.value?.operation?.fValue < 1) {
    breakthroughFeedback.value = '斗气尚未运转完成，无法开始冥想。'
    breakthroughFeedbackPositive.value = false
    return
  }

  // 保留斗气运转状态
  player.setRecoveryMode('meditate', { preserveOperation: true })
  isMeditating.value = true
  meditationStartAt.value = Date.now()
  startElapsedTimer()
}

// 计算斗气运转是否完成
const isQiOperationComplete = computed(() => res.value?.operation?.fValue >= 1)

// 开始冥想按钮的禁用状态和提示
const canStartMeditation = computed(() => {
  return !isMeditating.value && isQiOperationComplete.value
})


function stopMeditation() {
  if (!isMeditating.value) return
  // 结束冥想但保留斗气运转状态
  player.setRecoveryModeKeepOperation('idle')
  isMeditating.value = false
  meditationStartAt.value = null
  stopElapsedTimer(true)
}

const tickEnvironment = computed(() => (isMeditating.value ? 'meditation' : 'idle'))

watch(
  () => res.value?.recovery?.mode,
  (mode) => {
    if (mode === 'meditate' && !isMeditating.value) {
      isMeditating.value = true
      meditationStartAt.value = Date.now()
      startElapsedTimer()
    } else if (mode !== 'meditate' && isMeditating.value) {
      isMeditating.value = false
      meditationStartAt.value = null
      stopElapsedTimer(true)
    }
  },
)

const bpProgress = computed(() => {
  const range = cultivation.value.bp.range
  const current = cultivation.value.bp.current
  const span = Math.max(range.max - range.min, 1)
  return clamp((current - range.min) / span, 0, 1)
})

const bpProgressPercent = computed(() => Math.round(bpProgress.value * 100))
const bpCurrent = computed(() => Math.round(cultivation.value.bp.current))
const bpRangeMin = computed(() => Math.round(cultivation.value.bp.range.min))
const bpRangeMax = computed(() => Math.round(cultivation.value.bp.range.max))

const hpPerSecond = computed(() => res.value.recovery.hpPerSecond)
const qiPerSecond = computed(() => res.value.recovery.qiPerSecond)
const activeCoreBoost = computed(() => res.value.activeCoreBoost ?? null)

const meditationBpRate = computed(() => {
  const multiplier = computeEnvironmentMultiplier('meditation')
  const base = PASSIVE_MEDITATION_BP_PER_SECOND * multiplier
  if (!isMeditating.value) return 0
  const boost = activeCoreBoost.value?.bonusPerSecond ?? 0
  return base + boost
})

const coreBoostRemainingMs = computed(() => {
  const boost = activeCoreBoost.value
  if (!boost) return 0
  return Math.max(0, boost.expiresAt - nowTick.value)
})

const coreBoostRemainingText = computed(() => {
  const remainingMs = coreBoostRemainingMs.value
  if (remainingMs <= 0) return '即将消散'
  const totalSeconds = Math.ceil(remainingMs / 1000)
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}分${seconds.toString().padStart(2, '0')}秒`
})

const coreShardOptions = computed(() => {
  return CORE_SHARD_CONFIGS.map((config) => {
    const quantity = inventory.quantity(config.id)
    return {
      id: config.id,
      tier: config.tier,
      name: config.name,
      bonusPerSecond: config.bonusPerSecond,
      durationMs: config.durationMs,
      quantity,
      disabled: quantity <= 0 || !isMeditating.value,
    }
  }).filter(option => option.quantity > 0)
})

const realm = computed(() => cultivation.value.realm)
const breakthroughState = computed(() => cultivation.value.breakthrough)
const isBottlenecked = computed(() => realm.value.bottleneck)
const overflowBp = computed(() => Math.round(cultivation.value.realm.overflow ?? 0))

const formattedElapsed = computed(() => {
  const seconds = elapsedSeconds.value
  if (seconds <= 0) return '0秒'
  const minutes = Math.floor(seconds / 60)
  const remain = seconds % 60
  if (minutes <= 0) return `${remain}秒`
  return `${minutes}分${remain.toString().padStart(2, '0')}秒`
})

const cooldownRemainingMs = computed(() => {
  const until = breakthroughState.value.cooldownUntil
  if (!until) return 0
  return Math.max(0, until - nowTick.value)
})

const cooldownSeconds = computed(() => (cooldownRemainingMs.value > 0 ? Math.ceil(cooldownRemainingMs.value / 1000) : 0))
const isOnBreakthroughCooldown = computed(() => cooldownRemainingMs.value > 0)

const chanceForce = computed(() => {
  if (!isBottlenecked.value) return 0
  return computeBreakthroughChance(cultivation.value, 'force')
})

const chanceTreasure = computed(() => {
  if (!isBottlenecked.value) return 0
  return computeBreakthroughChance(cultivation.value, 'treasure')
})

const treasureScrollQty = computed(() => inventory.quantity('breakScrollTreasure'))

watch(isBottlenecked, (value) => {
  if (!value) {
    clearBreakthroughFeedback()
  }
})

watch(isMeditating, (value) => {
  if (!value) {
    clearCoreFeedback()
  }
})

watch(activeCoreBoost, (boost) => {
  if (!boost) {
    clearCoreFeedback()
  }
})

function toggleMeditation() {
  if (isMeditating.value) {
    stopMeditation()
  } else {
    startMeditation()
  }
}

function startNowTimer() {
  if (nowTimer) return
  nowTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
}

startNowTimer()

function setBreakthroughFeedback(message: string, positive: boolean | null = null) {
  breakthroughFeedback.value = message
  breakthroughFeedbackPositive.value = positive
}

function clearBreakthroughFeedback() {
  breakthroughFeedback.value = null
  breakthroughFeedbackPositive.value = null
}

function setCoreFeedback(message: string, positive: boolean | null = null) {
  coreFeedback.value = message
  coreFeedbackPositive.value = positive
}

function clearCoreFeedback() {
  coreFeedback.value = null
  coreFeedbackPositive.value = null
}

async function useCoreShard(tier: number) {
  const option = CORE_SHARD_CONFIGS.find(config => config.tier === tier)
  if (!option) return
  if (!isMeditating.value) {
    setCoreFeedback('需在冥想状态下才能引导晶核之力。', false)
    return
  }
  const available = inventory.quantity(option.id)
  if (available <= 0) {
    setCoreFeedback('晶核库存不足。', false)
    return
  }
  const spent = inventory.spend(option.id, 1)
  if (!spent) {
    setCoreFeedback('晶核库存不足。', false)
    return
  }
  const applied = await player.useItem(option.id)
  if (!applied) {
    inventory.addItem(option.id, 1)
    setCoreFeedback('未能引导晶核之力。', false)
    return
  }
}

function closeLevelUpModal() {
  levelUpRewards.value = null
}

function handleLevelUpRewardDisplay(rewards?: LevelUpRewards) {
  if (rewards) {
    levelUpRewards.value = rewards
  }
}

function formatChance(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatCooldown(seconds: number) {
  if (seconds <= 0) return '无冷却'
  const minutes = Math.floor(seconds / 60)
  const remain = seconds % 60
  if (minutes <= 0) {
    return `${remain}秒`
  }
  return `${minutes}分${remain.toString().padStart(2, '0')}秒`
}

async function performBreakthrough(method: BreakthroughMethod, options: { consumeItemId?: string } = {}) {
  if (!isBottlenecked.value) {
    setBreakthroughFeedback('尚未触及瓶颈，无需突破。', false)
    return
  }

  if (isOnBreakthroughCooldown.value) {
    setBreakthroughFeedback(`突破冷却中（剩余 ${formatCooldown(cooldownSeconds.value)}）。`, false)
    return
  }

  const { consumeItemId } = options

  if (consumeItemId) {
    const spent = inventory.spend(consumeItemId, 1)
    if (!spent) {
      setBreakthroughFeedback('相关宝物库存不足。', false)
      return
    }

    const result = await player.attemptBreakthrough(method)
    if (result.chance <= 0) {
      inventory.add(consumeItemId, 1)
      setBreakthroughFeedback('当前无法使用该宝物，请稍后再试。', false)
      return
    }

    const chanceText = formatChance(result.chance)
    if (result.success) {
      handleLevelUpRewardDisplay(result.rewards)
      setBreakthroughFeedback(`突破成功！借助宝物冲破瓶颈（成功率 ${chanceText}）。`, true)
    } else {
      setBreakthroughFeedback(`突破失败，成功率 ${chanceText}。所有溢出本源被冲散。`, false)
    }
    return
  }

  const result = await player.attemptBreakthrough(method)
  if (result.chance <= 0) {
    setBreakthroughFeedback('当前无法尝试突破，请确认状态是否满足条件。', false)
    return
  }
  const chanceText = formatChance(result.chance)
  if (result.success) {
    handleLevelUpRewardDisplay(result.rewards)
    setBreakthroughFeedback(`突破成功！强行冲破瓶颈（成功率 ${chanceText}）。`, true)
  } else {
    setBreakthroughFeedback(`突破失败，成功率 ${chanceText}。所有溢出本源被冲散。`, false)
  }
}

async function handleForceBreakthrough() {
  await performBreakthrough('force')
}

async function handleTreasureBreakthrough() {
  await performBreakthrough('treasure', { consumeItemId: 'breakScrollTreasure' })
}


if (isMeditating.value) {
  startElapsedTimer()
}

onBeforeUnmount(() => {
  stopElapsedTimer()
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
  if (isMeditating.value) {
    player.setRecoveryModeKeepOperation('idle')
  }
})
</script>

<template>
  <div class="meditation-page">
    <LevelUpSuccessModal
      :rewards="levelUpRewards"
      @close="closeLevelUpModal"
    />
    <section class="meditation-content">
      <header class="meditation-header">
        <h2>冥想修炼</h2>
        <p>闭目调息，循序稳固，BP 将随时间增长，并显著提升生命与斗气的恢复效率。</p>
      </header>
      <div class="meditation-stage">
        <div class="meditation-visual" :class="{ active: isMeditating }">
          <div class="meditation-ring ring-1" />
          <div class="meditation-ring ring-2" />
          <div class="meditation-ring ring-3" />
          <div v-for="index in 6" :key="index" class="meditation-particle" :class="`particle-${index}`" />
          <div class="meditation-core">
            <span class="core-glyph">斗</span>
            <span class="core-glow" />
          </div>
        </div>
        <div class="meditation-info">
          <button
            type="button"
            class="btn meditation-toggle"
            :class="{ active: isMeditating }"
            :disabled="!canStartMeditation && !isMeditating"
            @click="toggleMeditation"
          >
            {{ isMeditating ? '结束冥想' : (isQiOperationComplete ? '开始冥想' : '请先运转斗气') }}
          </button>
          <div class="meditation-stat-grid">
            <div class="stat-item">
              <span class="stat-label">冥想时长</span>
              <span class="stat-value">{{ formattedElapsed }}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">本源增长</span>
              <span class="stat-value">
                {{ isMeditating ? meditationBpRate.toFixed(2) : '0.00' }}/s
              </span>
            </div>
            <div class="stat-item">
              <span class="stat-label">生命恢复</span>
              <span class="stat-value">
                {{ hpPerSecond.toFixed(1) }}/s
              </span>
            </div>
            <div class="stat-item">
              <span class="stat-label">斗气恢复</span>
              <span class="stat-value">
                {{ qiPerSecond.toFixed(1) }}/s
              </span>
            </div>
          </div>
          <p v-if="isBottlenecked" class="meditation-tip">
            已触及境界瓶颈，持续冥想将把新增斗气存入溢出池（当前 {{ overflowBp }}）。
          </p>
        </div>
      </div>
      <div class="meditation-progress">
        <div class="progress-header">
          <span>斗气本源 {{ bpCurrent }} / {{ bpRangeMax }} ({{ bpProgressPercent }}%)</span>
          <span>区间 {{ bpRangeMin }} ~ {{ bpRangeMax }}</span>
        </div>
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: `${bpProgressPercent}%` }" />
      </div>
    </div>
      <div class="core-panel">
        <header class="core-header">
          <h3>晶核导引</h3>
          <p>冥想时可消耗晶核，在短时间内加快修炼速度。</p>
        </header>
        <div class="core-status">
          <template v-if="activeCoreBoost">
            <span class="core-status-label">当前加成</span>
            <span class="core-status-value">+{{ activeCoreBoost.bonusPerSecond.toFixed(1) }}/s</span>
            <span class="core-status-aux">剩余 {{ coreBoostRemainingText }}</span>
          </template>
          <span v-else class="core-status-empty">当前无晶核增益。</span>
        </div>
        <div
          v-if="coreFeedback"
          class="core-feedback"
          :class="{
            positive: coreFeedbackPositive === true,
            negative: coreFeedbackPositive === false
          }"
        >
          {{ coreFeedback }}
        </div>
        <div v-if="coreShardOptions.length > 0" class="core-grid">
          <button
            v-for="option in coreShardOptions"
            :key="option.id"
            type="button"
            class="btn core-btn"
            :disabled="option.disabled"
            @click="useCoreShard(option.tier)"
          >
            <div class="core-btn-head">
              <div class="core-btn-left">
                <span class="btn-title">{{ option.name }}</span>
                <span class="btn-subtitle">+{{ option.bonusPerSecond.toFixed(1) }}/s ｜ {{ option.durationMs / 1000 }}秒</span>
              </div>
              <span class="btn-meta btn-qty">X {{ option.quantity }}</span>
            </div>
          </button>
        </div>
        <p v-else class="core-empty">尚无晶核库存。</p>
      </div>
    <div class="breakthrough-panel">
        <header class="breakthrough-header">
          <h3>境界突破</h3>
          <p>瓶颈期可尝试强行冲击，或借助宝物提升成功率。突破会重置区间并清空溢出。</p>
        </header>
        <div class="breakthrough-status">
          <div class="status-item">
            <span class="status-label">瓶颈状态</span>
            <span class="status-value">{{ isBottlenecked ? '已触及瓶颈' : '尚未触及' }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">溢出本源</span>
            <span class="status-value">{{ overflowBp }}</span>
          </div>
          <div class="status-item">
            <span class="status-label">冷却</span>
            <span class="status-value">{{ formatCooldown(cooldownSeconds) }}</span>
          </div>
        </div>
        <div
          v-if="breakthroughFeedback"
          class="breakthrough-feedback"
          :class="{
            positive: breakthroughFeedbackPositive === true,
            negative: breakthroughFeedbackPositive === false
          }"
        >
          {{ breakthroughFeedback }}
        </div>
        <div class="breakthrough-actions">
          <button
            type="button"
            class="btn breakthrough-btn"
            :disabled="!isBottlenecked || isOnBreakthroughCooldown"
            @click="handleForceBreakthrough"
          >
            <span class="btn-title">冲击瓶颈</span>
            <span class="btn-subtitle">成功率 {{ formatChance(chanceForce) }}</span>
          </button>
          <button
            type="button"
            class="btn breakthrough-btn"
            :disabled="treasureScrollQty <= 0 || !isBottlenecked || isOnBreakthroughCooldown"
            @click="handleTreasureBreakthrough"
          >
            <span class="btn-title">破境符（至宝）</span>
            <span class="btn-subtitle">持有 {{ treasureScrollQty }} ｜ 成功率 {{ formatChance(chanceTreasure) }}</span>
          </button>
        </div>
      </div>
    </section>
    <PlayerStatusPanel class="meditation-sidebar" :tick-environment="tickEnvironment" />
  </div>
</template>

<style scoped>
.meditation-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  align-items: flex-start;
  padding: 20px;
  box-sizing: border-box;
}

.meditation-content {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 18px;
  padding: 24px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
}

.meditation-header h2 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 1px;
}

.meditation-header p {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.65);
}

.meditation-stage {
  margin-top: 24px;
  display: flex;
  gap: 28px;
  align-items: center;
  flex-wrap: wrap;
}

.meditation-visual {
  position: relative;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 42%, rgba(90, 160, 255, 0.25), rgba(18, 42, 84, 0.55));
  border: 1px solid rgba(120, 200, 255, 0.3);
  overflow: hidden;
  transition: transform 0.6s ease, box-shadow 0.6s ease, border-color 0.6s ease;
  box-shadow: inset 0 0 30px rgba(12, 28, 60, 0.5);
}

.meditation-visual::before,
.meditation-visual::after {
  content: '';
  position: absolute;
  inset: 18%;
  border-radius: 50%;
  border: 2px solid rgba(140, 220, 255, 0.35);
  opacity: 0;
  transform: scale(0.75);
  transition: opacity 0.6s ease, transform 0.6s ease;
}

.meditation-visual::after {
  inset: 28%;
  border-color: rgba(80, 200, 255, 0.25);
}

.meditation-visual.active {
  box-shadow: 0 0 40px rgba(80, 180, 255, 0.35), 0 0 90px rgba(60, 120, 255, 0.2);
  border-color: rgba(160, 220, 255, 0.6);
  transform: scale(1.02);
}

.meditation-visual.active::before {
  opacity: 0.7;
  animation: meditation-pulse 2.8s infinite;
}

.meditation-visual.active::after {
  opacity: 0.4;
  animation: meditation-pulse 2.8s infinite 1.4s;
}

.meditation-ring {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  border: 1px dashed rgba(200, 240, 255, 0.2);
  opacity: 0;
  transform: rotate(0deg);
}

.meditation-visual.active .meditation-ring {
  opacity: 0.5;
  animation: meditation-spin 14s linear infinite;
}

.meditation-ring.ring-2 {
  inset: 22%;
  animation-duration: 18s;
  border-style: dotted;
}

.meditation-ring.ring-3 {
  inset: 32%;
  animation-duration: 22s;
  border-style: solid;
}

.meditation-core {
  position: absolute;
  inset: 32%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.4), rgba(50, 120, 255, 0.45));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #fff;
  font-weight: 600;
  letter-spacing: 4px;
  text-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
}

.core-glyph {
  font-size: 32px;
  z-index: 2;
}

.core-glow {
  position: absolute;
  width: 120%;
  height: 120%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(120, 210, 255, 0.35), transparent 70%);
  opacity: 0;
  transition: opacity 0.6s ease;
}

.meditation-visual.active .core-glow {
  opacity: 1;
  animation: core-breathe 5s ease-in-out infinite;
}

.meditation-particle {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(140, 220, 255, 0.85);
  opacity: 0;
  transform: translateY(0) scale(0.6);
}

.meditation-visual.active .meditation-particle {
  opacity: 1;
}

.meditation-particle.particle-1 {
  top: 20%;
  left: 18%;
  animation: meditation-particle 6s linear infinite;
}

.meditation-particle.particle-2 {
  top: 28%;
  right: 16%;
  animation: meditation-particle 7s linear infinite 1.2s;
}

.meditation-particle.particle-3 {
  bottom: 18%;
  left: 22%;
  animation: meditation-particle 6.5s linear infinite 2s;
}

.meditation-particle.particle-4 {
  bottom: 24%;
  right: 20%;
  animation: meditation-particle 7.5s linear infinite 0.6s;
}

.meditation-particle.particle-5 {
  top: 46%;
  left: 8%;
  animation: meditation-particle 8s linear infinite 2.4s;
}

.meditation-particle.particle-6 {
  top: 44%;
  right: 10%;
  animation: meditation-particle 8.5s linear infinite 1.8s;
}

.meditation-info {
  flex: 1;
  min-width: 240px;
  background: rgba(10, 24, 48, 0.55);
  border-radius: 16px;
  padding: 20px;
  border: 1px solid rgba(120, 200, 255, 0.12);
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.3);
}

.meditation-toggle {
  width: 100%;
  padding: 12px 18px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 12px;
  color: #fff;
  background: linear-gradient(135deg, rgba(60, 120, 255, 0.8), rgba(30, 66, 155, 0.9));
  border: 1px solid rgba(132, 196, 255, 0.45);
  transition: transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease;
}

.meditation-toggle.active {
  background: linear-gradient(135deg, rgba(180, 88, 255, 0.85), rgba(90, 50, 200, 0.95));
  box-shadow: 0 0 18px rgba(150, 110, 255, 0.45);
}

.meditation-toggle:hover {
  transform: translateY(-2px);
}

.meditation-toggle:disabled:not(.active) {
  background: linear-gradient(135deg, rgba(60, 120, 255, 0.4), rgba(30, 66, 155, 0.5));
  border-color: rgba(132, 196, 255, 0.25);
  opacity: 0.6;
  cursor: not-allowed;
}

.meditation-toggle:disabled:not(.active):hover {
  transform: none;
}

.text-success {
  color: #4ade80 !important;
}

.text-warning {
  color: #fbbf24 !important;
}

.meditation-stat-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 14px;
}

.stat-item {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-label {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 1px;
}

.stat-value {
  margin-top: 6px;
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.meditation-tip {
  margin-top: 16px;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(180, 215, 255, 0.85);
}

.meditation-progress {
  margin-top: 32px;
  background: rgba(255, 255, 255, 0.035);
  border-radius: 14px;
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.core-panel {
  margin-top: 28px;
  padding: 20px;
  border-radius: 16px;
  background: rgba(24, 56, 100, 0.35);
  border: 1px solid rgba(120, 200, 255, 0.18);
  box-shadow: inset 0 0 20px rgba(16, 38, 70, 0.4);
}

.core-header h3 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.5px;
}

.core-header p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(200, 225, 255, 0.75);
}

.core-status {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: baseline;
  background: rgba(14, 32, 60, 0.55);
  border: 1px solid rgba(120, 200, 255, 0.18);
  border-radius: 12px;
  padding: 12px 16px;
}

.core-status-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: rgba(180, 215, 255, 0.7);
}

.core-status-value {
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.core-status-aux {
  font-size: 13px;
  color: rgba(200, 225, 255, 0.8);
}

.core-status-empty {
  font-size: 13px;
  color: rgba(200, 220, 255, 0.7);
}

.core-feedback {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  background: rgba(30, 54, 90, 0.6);
  border: 1px solid rgba(120, 200, 255, 0.2);
}

.core-feedback.positive {
  border-color: rgba(120, 230, 180, 0.55);
  background: rgba(30, 80, 60, 0.55);
  color: rgba(210, 255, 230, 0.92);
}

.core-feedback.negative {
  border-color: rgba(255, 140, 120, 0.4);
  background: rgba(80, 30, 30, 0.55);
  color: rgba(255, 210, 200, 0.9);
}

.core-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.core-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border-radius: 12px;
  padding: 14px 16px;
  background: linear-gradient(145deg, rgba(40, 90, 150, 0.6), rgba(28, 58, 110, 0.6));
  border: 1px solid rgba(110, 190, 255, 0.3);
  color: #fff;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.core-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: rgba(160, 220, 255, 0.5);
  background: linear-gradient(145deg, rgba(70, 140, 210, 0.65), rgba(40, 80, 150, 0.65));
}

.core-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.core-empty {
  margin-top: 12px;
  font-size: 13px;
  color: rgba(200, 220, 255, 0.7);
}

.breakthrough-panel {
  margin-top: 28px;
  padding: 22px;
  border-radius: 16px;
  background: rgba(20, 40, 80, 0.35);
  border: 1px solid rgba(120, 180, 255, 0.18);
  box-shadow: inset 0 0 24px rgba(10, 22, 44, 0.45);
}

.breakthrough-header h3 {
  margin: 0;
  font-size: 18px;
  letter-spacing: 0.5px;
}

.breakthrough-header p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(200, 220, 255, 0.75);
}

.breakthrough-status {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.status-item {
  background: rgba(15, 32, 60, 0.55);
  border: 1px solid rgba(120, 180, 255, 0.12);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
}

.status-label {
  font-size: 12px;
  letter-spacing: 0.3px;
  color: rgba(180, 210, 255, 0.7);
  text-transform: uppercase;
}

.status-value {
  margin-top: 4px;
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.breakthrough-feedback {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  background: rgba(30, 52, 90, 0.6);
  border: 1px solid rgba(120, 180, 255, 0.18);
}

.breakthrough-feedback.positive {
  border-color: rgba(120, 230, 180, 0.55);
  background: rgba(30, 80, 60, 0.55);
  color: rgba(210, 255, 230, 0.92);
}

.breakthrough-feedback.negative {
  border-color: rgba(255, 140, 120, 0.4);
  background: rgba(80, 30, 30, 0.55);
  color: rgba(255, 210, 200, 0.9);
}

.breakthrough-actions {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.breakthrough-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border-radius: 12px;
  padding: 14px 16px;
  background: linear-gradient(145deg, rgba(40, 70, 120, 0.6), rgba(30, 50, 90, 0.6));
  border: 1px solid rgba(110, 160, 255, 0.3);
  color: #fff;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.breakthrough-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: rgba(160, 210, 255, 0.5);
  background: linear-gradient(145deg, rgba(70, 120, 200, 0.65), rgba(40, 70, 130, 0.65));
}

.breakthrough-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.btn-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(220, 235, 255, 0.75);
}

.btn-meta {
  margin-top: 6px;
  font-size: 12px;
  color: rgba(220, 235, 255, 0.7);
}

.btn-qty {
  align-self: flex-end;
  font-size: 16px;
  font-weight: 700;
}

.core-btn-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.core-btn-left {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(200, 220, 255, 0.7);
  margin-bottom: 8px;
}

.progress-bar {
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(80, 180, 255, 0.9), rgba(130, 90, 255, 0.85));
  border-radius: inherit;
  transition: width 0.25s ease;
}

.meditation-sidebar {
  align-self: stretch;
}

@keyframes meditation-pulse {
  0% {
    opacity: 0.2;
    transform: scale(0.7);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.05);
  }
  100% {
    opacity: 0;
    transform: scale(1.35);
  }
}

@keyframes meditation-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes core-breathe {
  0%,
  100% {
    transform: scale(0.9);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.05);
    opacity: 1;
  }
}

@keyframes meditation-particle {
  0% {
    transform: translateY(0) scale(0.6);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  80% {
    opacity: 0.3;
  }
  100% {
    transform: translateY(-40px) scale(1.2);
    opacity: 0;
  }
}

@media (max-width: 1100px) {
  .meditation-page {
    grid-template-columns: 1fr;
  }

  .meditation-sidebar {
    order: -1;
  }

  .meditation-content {
    padding: 20px;
  }
}
</style>
