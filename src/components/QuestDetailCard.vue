<script setup lang="ts">
import { computed } from 'vue'
import { ITEMS } from '@/data/items'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { getSkillDefinition } from '@/data/skills'
import { REALM_TIER_LABELS } from '@/utils/realm'
import { resolveItemIcon } from '@/utils/itemIcon'
import { iconForEquipSlot } from '@/utils/equipmentIcons'
import { resolveAssetUrl } from '@/utils/assetUrls'
import type { QuestDefinition, QuestObjective, QuestProgressEntry, QuestRuntimeStatus } from '@/types/domain'
import type { ItemIcon } from '@/utils/itemIcon'

const props = defineProps<{
  quest: QuestDefinition
  status: QuestRuntimeStatus
  progress: QuestProgressEntry | null
  showAccept?: boolean
  showSubmit?: boolean
  showAbandon?: boolean
  isTracked?: boolean
}>()

const emit = defineEmits<{
  (e: 'accept'): void
  (e: 'submit'): void
  (e: 'abandon'): void
  (e: 'track', track: boolean): void
}>()

const statusTextMap: Record<QuestRuntimeStatus, string> = {
  locked: '未解锁',
  available: '可接受',
  active: '进行中',
  readyToTurnIn: '可交付',
  completed: '已完成',
}

type QuestVisualTone = 'hunt' | 'collect' | 'explore'

interface ObjectiveEntry {
  objectiveId: string
  description: string
  current: number
  target: number
  completed: boolean
  progress: number
  icon: string
  tone: QuestVisualTone
}

interface QuestVisual {
  icon: string
  label: string
  tone: QuestVisualTone
}

function resolveQuestVisual(quest: QuestDefinition): QuestVisual {
  const primary = quest.objectives[0]
  if (!primary) return { icon: '◈', label: '探索', tone: 'explore' }
  switch (primary.type) {
    case 'kill':
      return { icon: '✦', label: '讨伐', tone: 'hunt' }
    case 'killCollect':
    case 'collect':
      return { icon: '⬡', label: '收集', tone: 'collect' }
    default:
      return { icon: '◈', label: '探索', tone: 'explore' }
  }
}

function objectiveTone(objective: QuestObjective): QuestVisualTone {
  if (objective.type === 'kill') return 'hunt'
  if (objective.type === 'collect' || objective.type === 'killCollect') return 'collect'
  return 'explore'
}


const objectiveEntries = computed<ObjectiveEntry[]>(() => {
  const quest = props.quest
  const progress = props.progress
  return quest.objectives.map((objective) => {
    const progressEntry = progress?.objectives[objective.id]
    const current = progressEntry ? progressEntry.current : 0
    const target = objective.amount
    const description = objective.description ?? formatObjectiveDescription(objective)
    const completed = !!progressEntry?.completed
    const progressValue = target > 0 ? Math.min(1, Math.max(0, current / target)) : 0
    const tone = objectiveTone(objective)
    return {
      objectiveId: objective.id,
      description,
      current,
      target,
      completed,
      progress: progressValue,
      tone,
      icon: tone === 'hunt' ? '⚔' : tone === 'collect' ? '☍' : '◎',
    }
  })
})

const itemNameMap = new Map(ITEMS.map(item => [item.id, item.name]))
const equipmentNameMap = new Map(BASE_EQUIPMENT_TEMPLATES.map(template => [template.id, template.name]))
const equipmentTemplateMap = new Map(BASE_EQUIPMENT_TEMPLATES.map(template => [template.id, template]))

function formatObjectiveDescription(objective: QuestObjective): string {
  const fallback = objective.description ?? '完成任务目标'
  if (objective.type === 'kill') {
    return objective.description ?? `击杀指定敌人 ${objective.amount} 次`
  }
  if (objective.type === 'killCollect') {
    return objective.description ?? `收集 ${objective.amount} 个任务物品`
  }
  if (objective.type === 'collect') {
    return objective.description ?? `收集 ${objective.amount} 个 ${objective.itemId}`
  }
  return fallback
}

function difficultyLabel(quest: QuestDefinition) {
  return quest.difficultyLabel ?? '—'
}

function recommendedRealmLabel(quest: QuestDefinition) {
  if (!quest.recommendedRealmTier) return '无'
  return `${REALM_TIER_LABELS[quest.recommendedRealmTier]}`
}

function formatItemName(itemId: string) {
  return itemNameMap.get(itemId) ?? itemId
}

function formatEquipmentName(templateId: string) {
  return equipmentNameMap.get(templateId) ?? templateId
}

function formatSkillName(skillId: string) {
  return getSkillDefinition(skillId)?.name ?? skillId
}

const allowAbandon = computed(() => props.quest.allowAbandon !== false)

const difficultyStars = computed(() => {
  const label = difficultyLabel(props.quest)
  const stars = label.match(/[★☆]/g)
  return stars && stars.length ? stars : ['—']
})

const questVisual = computed(() => resolveQuestVisual(props.quest))
const showTrackButton = computed(() => props.status === 'active' || props.status === 'readyToTurnIn')
const isTracked = computed(() => !!props.isTracked)
const trackButtonLabel = computed(() => (isTracked.value ? '取消追踪' : '追踪任务'))

type RewardKind = 'gold' | 'item' | 'equipment' | 'skill' | 'note'
interface RewardEntry {
  id: string
  name: string
  detail?: string
  amount?: number
  kind: RewardKind
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  icon?: ItemIcon
}

const rewardEntries = computed<RewardEntry[]>(() => {
  const rewards = props.quest.rewards
  const result: RewardEntry[] = []
  if (rewards.gold) {
    result.push({
      id: 'gold',
      name: '金币',
      amount: rewards.gold,
      kind: 'gold',
      rarity: 'common',
    })
  }
  rewards.items?.forEach((item) => {
    const icon = resolveItemIcon(item.itemId)
    result.push({
      id: `item-${item.itemId}`,
      name: formatItemName(item.itemId),
      amount: item.quantity,
      kind: 'item',
      rarity: 'uncommon',
      icon,
    })
  })
  rewards.equipmentTemplates?.forEach((equipment) => {
    const template = equipmentTemplateMap.get(equipment.templateId)
    const icon: ItemIcon | undefined = template
      ? template.artwork
        ? { type: 'image', src: resolveAssetUrl(template.artwork), alt: template.name }
        : iconForEquipSlot(template.slot)
      : undefined
    result.push({
      id: `equipment-${equipment.templateId}`,
      name: formatEquipmentName(equipment.templateId),
      detail: equipment.initialLevel ? `初始 Lv.${equipment.initialLevel}` : undefined,
      kind: 'equipment',
      rarity: 'rare',
      icon,
    })
  })
  rewards.skillUnlocks?.forEach((skillId) => {
    result.push({
      id: `skill-${skillId}`,
      name: `解锁 ${formatSkillName(skillId)}`,
      kind: 'skill',
      rarity: 'epic',
    })
  })
  if (rewards.notes) {
    result.push({
      id: 'notes',
      name: rewards.notes,
      kind: 'note',
      rarity: 'common',
    })
  }
  return result
})
</script>

<template>
  <article class="quest-detail-card">
    <header class="quest-hero">
      <div class="quest-hero__titles">
        <div class="quest-hero__status-row">
          <span class="status-dot" :data-state="status" />
          <span class="status-label">{{ statusTextMap[status] }}</span>
          <span class="quest-type-chip" :data-tone="questVisual.tone">
            <span class="quest-type-icon">{{ questVisual.icon }}</span>
            {{ questVisual.label }}
          </span>
          <span v-if="quest.location" class="eyebrow">地点 · {{ quest.location }}</span>
        </div>
        <h3 class="quest-title">{{ quest.name }}</h3>
        <p class="quest-subtitle">
          发布人：{{ quest.giver }}
          <span v-if="quest.repeatable" class="quest-chip subtle">可重复</span>
          <span v-if="quest.allowAbandon === false" class="quest-chip danger-ghost">不可放弃</span>
        </p>
      </div>
      <div class="quest-meta">
        <div class="meta-chip">
          <span class="meta-label">难度</span>
          <span class="meta-stars">
            <span v-for="(star, index) in difficultyStars" :key="`star-${index}`" class="star">{{ star }}</span>
          </span>
        </div>
        <div class="meta-chip">
          <span class="meta-label">推荐境界</span>
          <span class="meta-value">{{ recommendedRealmLabel(quest) }}</span>
        </div>
        <div class="meta-chip accent">
          <span class="meta-label">状态</span>
          <span class="meta-value">{{ statusTextMap[status] }}</span>
        </div>
      </div>
    </header>

    <section class="quest-section description">
      <div class="section-head">
        <h4>情报摘要</h4>
      </div>
      <p class="quest-detail-description">{{ quest.description }}</p>
    </section>

    <section class="quest-section objectives">
      <div class="section-head">
        <h4>任务目标</h4>
        <span class="hint">进度实时更新</span>
      </div>
      <ul class="objective-list">
        <li
          v-for="entry in objectiveEntries"
            :key="entry.objectiveId"
            class="objective-card"
            :class="{ completed: entry.completed }"
          >
            <div class="objective-row">
              <div class="objective-title">
                <span class="objective-icon">{{ entry.icon }}</span>
                {{ entry.description }}
              </div>
              <div class="objective-count">{{ entry.current }} / {{ entry.target }}</div>
            </div>
            <div class="objective-progress-bar">
            <span class="objective-progress-fill" :style="{ width: `${entry.progress * 100}%` }" />
          </div>
        </li>
      </ul>
    </section>

    <section class="quest-section rewards">
      <div class="section-head">
        <h4>任务奖励</h4>
      </div>
      <div class="reward-grid">
        <div
          v-for="reward in rewardEntries"
          :key="reward.id"
          class="reward-slot"
          :data-rarity="reward.rarity"
          :data-kind="reward.kind"
          :title="reward.detail ?? reward.name"
        >
          <div class="reward-icon" :data-kind="reward.kind">
            <img
              v-if="reward.icon?.type === 'image'"
              :src="reward.icon.src"
              :alt="reward.icon.alt || reward.name"
              loading="lazy"
            />
            <span v-else-if="reward.icon?.type === 'text'" class="reward-icon__text">{{ reward.icon.text }}</span>
            <svg v-else-if="reward.kind === 'gold'" viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id="coin" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#ffe7a0" />
                  <stop offset="100%" stop-color="#f4b54a" />
                </linearGradient>
              </defs>
              <circle cx="12" cy="12" r="8" fill="url(#coin)" />
              <circle cx="12" cy="12" r="5" fill="rgba(0,0,0,0.2)" />
            </svg>
            <svg v-else-if="reward.kind === 'item'" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 3.5h8l1 5.5-5 12h-0.8L7 9z"
                opacity="0.9"
              />
              <path fill="currentColor" d="M9 8.5h6l-0.6 3H9.6z" opacity="0.65" />
            </svg>
            <svg v-else-if="reward.kind === 'equipment'" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M5 19l6.2-6.2 1.8 1.8L6.8 20.8z"
                opacity="0.8"
              />
              <path
                fill="currentColor"
                d="M14.5 11.5l2.8-2.8c0.6-0.6 0.6-1.6 0-2.2l-1.8-1.8c-0.6-0.6-1.6-0.6-2.2 0l-2.8 2.8z"
              />
            </svg>
            <svg v-else-if="reward.kind === 'skill'" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M6 5h12v14H6z"
                opacity="0.2"
              />
              <path
                fill="currentColor"
                d="M8 7h8v2H8zm0 4h8v2H8zm0 4h5v2H8z"
              />
            </svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="4" width="14" height="16" rx="2" fill="currentColor" opacity="0.18" />
              <path fill="currentColor" d="M8 8h8v2H8zm0 4h8v2H8z" />
            </svg>
          </div>
          <div class="reward-info">
            <p class="reward-name">{{ reward.name }}</p>
            <p v-if="reward.amount" class="reward-amount">×{{ reward.amount }}</p>
            <p v-else-if="reward.detail" class="reward-amount">{{ reward.detail }}</p>
          </div>
        </div>
        <p v-if="!rewardEntries.length" class="reward-empty">本任务未设置奖励。</p>
      </div>
    </section>

    <footer class="quest-actions">
      <div class="action-main">
        <button
          v-if="showAccept"
          type="button"
          class="action-button primary"
          @click="emit('accept')"
        >
          接受任务
        </button>
        <button
          v-if="showSubmit"
          type="button"
          class="action-button success"
          @click="emit('submit')"
        >
          提交任务
        </button>
        <button
          v-if="showAbandon && allowAbandon"
          type="button"
          class="action-button ghost"
          @click="emit('abandon')"
        >
          放弃
        </button>
        <button
          v-if="showTrackButton"
          type="button"
          class="action-button outline"
          :class="{ active: isTracked }"
          @click="emit('track', !isTracked)"
        >
          {{ trackButtonLabel }}
        </button>
      </div>
      <div class="action-hints">
        <span v-if="quest.repeatable" class="action-hint">此任务可重复接取</span>
        <span v-if="quest.allowAbandon === false" class="action-hint">此任务不可放弃</span>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.quest-detail-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  border-radius: 18px;
  background: linear-gradient(155deg, rgba(18, 20, 30, 0.85), rgba(8, 14, 26, 0.86));
  box-shadow:
    0 28px 48px rgba(0, 0, 0, 0.48),
    0 0 48px rgba(76, 201, 240, 0.1);
  backdrop-filter: blur(16px);
  color: var(--quest-text);
  overflow: hidden;
}

.quest-detail-card > * {
  position: relative;
  z-index: 1;
}

.quest-detail-card::before {
  content: '';
  position: absolute;
  inset: -30% -40%;
  background: radial-gradient(circle at 20% 30%, rgba(76, 201, 240, 0.12), transparent 45%);
  filter: blur(12px);
  z-index: 0;
}

.quest-hero {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px 18px;
  align-items: flex-start;
  padding-bottom: 12px;
  isolation: isolate;
}

.quest-hero::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, rgba(76, 201, 240, 0.18), rgba(255, 255, 255, 0.02));
}

.quest-hero__titles {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quest-hero__status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--quest-text-dim);
  font-size: 12px;
  letter-spacing: 0.02em;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 0 8px rgba(76, 201, 240, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.12);
  background: var(--quest-primary);
  animation: statusPulse 1.8s ease-in-out infinite;
}

.status-dot[data-state='available'] {
  background: var(--quest-primary);
  box-shadow: 0 0 0 6px rgba(76, 201, 240, 0.12), 0 0 12px rgba(76, 201, 240, 0.6);
}

.status-dot[data-state='active'] {
  background: #8be28b;
  box-shadow: 0 0 0 6px rgba(139, 226, 139, 0.12), 0 0 12px rgba(139, 226, 139, 0.55);
}

.status-dot[data-state='readyToTurnIn'] {
  background: #f6d365;
  box-shadow: 0 0 0 6px rgba(246, 211, 101, 0.12), 0 0 12px rgba(246, 211, 101, 0.55);
}

.status-dot[data-state='completed'] {
  background: #93c5fd;
  box-shadow: 0 0 0 6px rgba(147, 197, 253, 0.12), 0 0 12px rgba(147, 197, 253, 0.55);
}

.status-label {
  font-weight: 700;
  color: var(--quest-text);
}

.quest-type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.06em;
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 10px 26px rgba(0, 0, 0, 0.32);
}

.quest-type-chip[data-tone='hunt'] {
  background: linear-gradient(135deg, rgba(76, 201, 240, 0.2), rgba(36, 189, 164, 0.22));
}

.quest-type-chip[data-tone='collect'] {
  background: linear-gradient(135deg, rgba(236, 179, 101, 0.2), rgba(236, 179, 101, 0.28));
}

.quest-type-icon {
  width: 18px;
  height: 18px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.24);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.eyebrow {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.quest-title {
  margin: 0;
  font-size: clamp(24px, 3vw, 30px);
  font-weight: 800;
  letter-spacing: 0.06em;
  font-family: 'Cinzel', 'Times New Roman', serif;
  text-shadow:
    0 0 24px rgba(236, 179, 101, 0.35),
    0 12px 28px rgba(0, 0, 0, 0.5);
}

.quest-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--quest-text-dim);
  display: flex;
  align-items: center;
  gap: 8px;
}

.quest-chip {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  color: var(--quest-text);
  background: rgba(255, 255, 255, 0.06);
}

.quest-chip.danger-ghost {
  border-color: rgba(255, 99, 99, 0.4);
  color: #ffc6c6;
  background: rgba(255, 99, 99, 0.1);
}

.quest-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, auto));
  gap: 8px;
  align-self: flex-start;
  filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.35));
}

.meta-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--quest-text);
  min-width: 120px;
}

.meta-chip.accent {
  border-color: rgba(76, 201, 240, 0.35);
  box-shadow: 0 8px 20px rgba(76, 201, 240, 0.18);
}

.meta-label {
  font-size: 12px;
  color: var(--quest-text-dim);
}

.meta-value {
  font-weight: 700;
}

.meta-stars {
  display: flex;
  gap: 2px;
}

.star {
  color: var(--quest-accent);
  font-size: 14px;
}

.quest-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: linear-gradient(155deg, rgba(17, 22, 35, 0.7), rgba(12, 16, 26, 0.78));
  box-shadow:
    0 20px 30px rgba(0, 0, 0, 0.3),
    inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  position: relative;
  overflow: hidden;
}

.quest-section.description {
  background: linear-gradient(160deg, rgba(17, 22, 35, 0.8), rgba(14, 18, 30, 0.86));
}

.quest-section.description::before {
  position: absolute;
  inset: 12px;
  z-index: 0;
  color: rgba(255, 255, 255, 0.04);
  font-size: 28px;
  letter-spacing: 0.3em;
  font-weight: 700;
  transform: rotate(-8deg);
  pointer-events: none;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.section-head h4 {
  margin: 0;
  font-size: 14px;
  letter-spacing: 0.04em;
  color: var(--quest-text);
}

.hint {
  font-size: 12px;
  color: var(--quest-text-dim);
}

.quest-detail-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--quest-text);
  white-space: pre-line;
  text-shadow: 0 10px 36px rgba(0, 0, 0, 0.4);
  position: relative;
  z-index: 1;
  animation: typeGlow 12s ease-in-out infinite alternate;
}

.objective-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}

.objective-card {
  padding: 12px 12px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: linear-gradient(145deg, rgba(24, 32, 48, 0.75), rgba(18, 28, 48, 0.76));
  box-shadow:
    0 16px 32px rgba(0, 0, 0, 0.35),
    inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

.objective-card.completed {
  border-color: rgba(147, 197, 253, 0.5);
  background: linear-gradient(145deg, rgba(37, 82, 130, 0.75), rgba(24, 54, 92, 0.72));
  box-shadow: 0 12px 28px rgba(58, 125, 210, 0.35);
}

.objective-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.objective-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}

.objective-avatar {
  width: 26px;
  height: 26px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, rgba(76, 201, 240, 0.22), rgba(28, 38, 58, 0.9));
  color: #e9fbff;
  font-weight: 800;
  letter-spacing: 0.06em;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 10px 20px rgba(0, 0, 0, 0.4);
}

.objective-avatar[data-tone='collect'] {
  background: linear-gradient(145deg, rgba(236, 179, 101, 0.32), rgba(40, 28, 10, 0.9));
  color: #fff3dc;
}

.objective-avatar[data-tone='explore'] {
  background: linear-gradient(145deg, rgba(180, 142, 251, 0.24), rgba(32, 20, 44, 0.85));
  color: #f6e8ff;
}

.objective-icon {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  color: var(--quest-primary);
  font-size: 12px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
}

.objective-count {
  font-size: 12px;
  color: var(--quest-text-dim);
}

.objective-progress-bar {
  margin-top: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.objective-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--quest-primary), var(--quest-primary-strong));
  transition: width 0.3s ease;
}

.reward-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.reward-slot {
  display: flex;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: linear-gradient(145deg, rgba(20, 26, 42, 0.9), rgba(12, 16, 26, 0.9));
  box-shadow:
    0 16px 32px rgba(0, 0, 0, 0.35),
    inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  align-items: center;
  min-height: 72px;
}

.reward-slot[data-rarity='uncommon'] {
  border-color: rgba(154, 214, 133, 0.5);
  background: radial-gradient(circle at 20% 20%, rgba(154, 214, 133, 0.18), rgba(255, 255, 255, 0.03));
}

.reward-slot[data-rarity='rare'] {
  border-color: rgba(111, 182, 255, 0.6);
  background: radial-gradient(circle at 22% 16%, rgba(111, 182, 255, 0.18), rgba(255, 255, 255, 0.03));
  box-shadow: 0 10px 24px rgba(76, 201, 240, 0.15);
}

.reward-slot[data-rarity='epic'] {
  border-color: rgba(180, 142, 251, 0.65);
  background: radial-gradient(circle at 22% 16%, rgba(180, 142, 251, 0.2), rgba(255, 255, 255, 0.03));
  box-shadow: 0 10px 24px rgba(180, 142, 251, 0.2);
}

.reward-slot[data-rarity='legendary'] {
  border-color: rgba(244, 181, 74, 0.7);
  background: radial-gradient(circle at 22% 16%, rgba(244, 181, 74, 0.24), rgba(255, 255, 255, 0.05));
  box-shadow: 0 12px 28px rgba(236, 179, 101, 0.32);
}

.reward-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  color: #d5eaff;
  overflow: hidden;
}

.reward-icon[data-kind='item'] {
  color: #8ddcff;
}

.reward-icon[data-kind='equipment'] {
  color: #fbc02d;
}

.reward-icon[data-kind='skill'] {
  color: #c8b5ff;
}

.reward-icon img {
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.4));
}

.reward-icon__text {
  font-size: 18px;
}

.reward-icon svg {
  width: 26px;
  height: 26px;
}

.reward-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reward-name {
  margin: 0;
  font-weight: 700;
  font-size: 14px;
}

.reward-amount {
  margin: 0;
  font-size: 12px;
  color: var(--quest-text-dim);
}

.reward-empty {
  grid-column: 1 / -1;
  color: var(--quest-text-dim);
  margin: 0;
}

.quest-actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.action-main {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.action-button {
  padding: 12px 18px;
  border-radius: 12px;
  border: 1px solid var(--quest-outline);
  background: rgba(255, 255, 255, 0.05);
  color: var(--quest-text);
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
}

.action-button.primary {
  background: linear-gradient(135deg, #2dd4bf, #4cc9f0);
  border-color: rgba(76, 201, 240, 0.6);
  box-shadow: 0 14px 32px rgba(76, 201, 240, 0.3);
  color: #0b1220;
}

.action-button.success {
  background: linear-gradient(135deg, #6de38c, #36c899);
  border-color: rgba(99, 241, 178, 0.45);
  box-shadow: 0 14px 32px rgba(99, 241, 178, 0.25);
  color: #04150f;
}

.action-button.ghost {
  background: transparent;
  border-color: rgba(255, 255, 255, 0.22);
  color: var(--quest-text);
}

.action-button.outline {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02));
  border-color: rgba(255, 255, 255, 0.2);
  color: var(--quest-text);
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.24);
}

.action-button.outline.active {
  border-color: rgba(99, 241, 178, 0.65);
  color: #b6f7d7;
  box-shadow: 0 10px 18px rgba(99, 241, 178, 0.22);
}

.action-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.action-hints {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--quest-text-dim);
  font-size: 12px;
}

@keyframes statusPulse {
  0% {
    transform: scale(0.98);
    box-shadow: 0 0 0 8px rgba(76, 201, 240, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
  50% {
    transform: scale(1.05);
    box-shadow: 0 0 0 10px rgba(76, 201, 240, 0.12), 0 0 12px rgba(76, 201, 240, 0.65);
  }
  100% {
    transform: scale(0.98);
    box-shadow: 0 0 0 8px rgba(76, 201, 240, 0.08), 0 0 0 1px rgba(255, 255, 255, 0.12);
  }
}

@keyframes typeGlow {
  0% {
    text-shadow: 0 0 18px rgba(76, 201, 240, 0.28), 0 8px 28px rgba(0, 0, 0, 0.4);
  }
  100% {
    text-shadow: 0 0 24px rgba(236, 179, 101, 0.36), 0 10px 32px rgba(0, 0, 0, 0.5);
  }
}

@media (max-width: 840px) {
  .quest-hero {
    grid-template-columns: 1fr;
  }
  .quest-meta {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  }
}
</style>
