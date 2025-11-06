<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PlayerStatusPanel from '@/components/PlayerStatusPanel.vue'
import { ITEMS } from '@/data/items'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { getSkillDefinition } from '@/data/skills'
import { useQuestStore } from '@/stores/quests'
import type { QuestDefinition, QuestObjective, QuestReward, QuestRuntimeStatus } from '@/types/domain'
import { REALM_TIER_LABELS } from '@/utils/realm'

const questStore = useQuestStore()

const readyQuests = computed(() => questStore.readyQuests)
const activeQuests = computed(() => questStore.activeQuests)
const availableQuests = computed(() => questStore.availableQuests)
const questItems = computed(() => questStore.questItemsView)

const orderedQuests = computed(() => {
  const seen = new Set<string>()
  const result: QuestDefinition[] = []
  const groups = [readyQuests.value, activeQuests.value, availableQuests.value]
  groups.forEach(group => {
    group.forEach((definition) => {
      if (seen.has(definition.id)) return
      seen.add(definition.id)
      result.push(definition)
    })
  })
  return result
})

const selectedQuestId = ref<string | null>(null)

watch(
  orderedQuests,
  (list) => {
    if (!list.length) {
      selectedQuestId.value = null
      return
    }
    if (selectedQuestId.value && list.some(quest => quest.id === selectedQuestId.value)) {
      return
    }
    selectedQuestId.value = list[0]?.id ?? null
  },
  { immediate: true, deep: true },
)

const selectedQuest = computed<QuestDefinition | null>(() => {
  const id = selectedQuestId.value
  if (!id) return null
  return questStore.definitionMap[id] ?? null
})

const selectedStatus = computed<QuestRuntimeStatus>(() => {
  const id = selectedQuestId.value
  if (!id) return 'locked'
  return questStore.getStatus(id)
})

const selectedProgress = computed(() => {
  const id = selectedQuestId.value
  if (!id) return null
  return questStore.progressOf(id)
})

interface ObjectiveEntry {
  objective: QuestObjective
  current: number
  target: number
  description: string
  completed: boolean
}

const objectiveEntries = computed<ObjectiveEntry[]>(() => {
  const quest = selectedQuest.value
  if (!quest) return []
  const progress = selectedProgress.value
  return quest.objectives.map(objective => {
    const progressEntry = progress?.objectives[objective.id]
    const current = progressEntry ? progressEntry.current : 0
    const target = objective.amount
    const description = objective.description ?? formatObjectiveDescription(objective)
    const completed = !!progressEntry?.completed
    return {
      objective,
      current,
      target,
      description,
      completed,
    }
  })
})

const statusTextMap: Record<QuestRuntimeStatus, string> = {
  locked: '未解锁',
  available: '可接受',
  active: '进行中',
  readyToTurnIn: '可交付',
  completed: '已完成',
}

const feedback = ref<{ message: string; kind: 'success' | 'error' } | null>(null)

function setFeedback(message: string, kind: 'success' | 'error') {
  feedback.value = { message, kind }
  setTimeout(() => {
    if (feedback.value?.message === message) {
      feedback.value = null
    }
  }, 2400)
}

function selectQuest(id: string) {
  selectedQuestId.value = id
}

function acceptQuest(id: string) {
  const ok = questStore.accept(id)
  if (ok) {
    setFeedback('已接受任务。', 'success')
  } else {
    setFeedback('无法接受任务。', 'error')
  }
}

function submitQuest(id: string) {
  const rewards = questStore.submit(id)
  if (rewards) {
    setFeedback('任务提交完成。', 'success')
    const questName = questStore.definitionMap[id]?.name ?? '任务'
    showRewardNotice(id, questName, rewards)
  } else {
    setFeedback('尚未满足提交条件。', 'error')
  }
}

function formatObjectiveDescription(objective: QuestObjective): string {
  const fallback = objective.description ?? '完成任务目标'
  if (objective.type === 'kill') {
    return objective.description ?? `击杀指定敌人 ${objective.amount} 次`
  }
  if (objective.type === 'killCollect') {
    return objective.description ?? `收集 ${objective.amount} 个指定任务物品`
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

function showAcceptButton(status: QuestRuntimeStatus) {
  return status === 'available'
}

function showSubmitButton(status: QuestRuntimeStatus) {
  return status === 'readyToTurnIn'
}

const itemNameMap = new Map(ITEMS.map(item => [item.id, item.name]))
const equipmentNameMap = new Map(BASE_EQUIPMENT_TEMPLATES.map(template => [template.id, template.name]))

function formatItemName(itemId: string) {
  return itemNameMap.get(itemId) ?? itemId
}

function formatEquipmentName(templateId: string) {
  return equipmentNameMap.get(templateId) ?? templateId
}

function formatSkillName(skillId: string) {
  return getSkillDefinition(skillId)?.name ?? skillId
}

interface RewardNotice {
  questId: string
  questName: string
  rewards: QuestReward
}

const rewardNotice = ref<RewardNotice | null>(null)
let rewardNoticeTimeout: ReturnType<typeof setTimeout> | null = null

function clearRewardNoticeTimeout() {
  if (rewardNoticeTimeout) {
    clearTimeout(rewardNoticeTimeout)
    rewardNoticeTimeout = null
  }
}

function showRewardNotice(questId: string, questName: string, rewards: QuestReward) {
  rewardNotice.value = { questId, questName, rewards }
  clearRewardNoticeTimeout()
  rewardNoticeTimeout = setTimeout(() => {
    rewardNotice.value = null
    rewardNoticeTimeout = null
  }, 6000)
}

function dismissRewardNotice() {
  clearRewardNoticeTimeout()
  rewardNotice.value = null
}

function rewardHasContent(reward: QuestReward): boolean {
  return Boolean(
    (reward.gold && reward.gold > 0) ||
      (reward.items && reward.items.length > 0) ||
      (reward.equipmentTemplates && reward.equipmentTemplates.length > 0) ||
      (reward.skillUnlocks && reward.skillUnlocks.length > 0),
  )
}

onBeforeUnmount(() => {
  clearRewardNoticeTimeout()
})
</script>

<template>
  <div class="quest-board">
    <PlayerStatusPanel class="quest-board__status" />
    <section class="panel quest-board__panel">
      <transition name="reward-toast">
        <div v-if="rewardNotice" class="quest-board__reward-card" role="status" aria-live="polite">
          <button type="button" class="reward-card__close" aria-label="关闭奖励提示" @click="dismissRewardNotice">
            ×
          </button>
          <h3 class="reward-card__title">奖励结算</h3>
          <p class="reward-card__subtitle">完成「{{ rewardNotice.questName }}」获得：</p>
          <ul v-if="rewardHasContent(rewardNotice.rewards)" class="reward-card__list">
            <li v-if="rewardNotice.rewards.gold" class="reward-card__item">
              GOLD {{ rewardNotice.rewards.gold }}
            </li>
            <li
              v-for="item in rewardNotice.rewards.items ?? []"
              :key="`${rewardNotice.questId}-reward-card-item-${item.itemId}`"
              class="reward-card__item"
            >
              {{ formatItemName(item.itemId) }} ×{{ item.quantity }}
            </li>
            <li
              v-for="equipment in rewardNotice.rewards.equipmentTemplates ?? []"
              :key="`${rewardNotice.questId}-reward-card-equipment-${equipment.templateId}`"
              class="reward-card__item"
            >
              {{ formatEquipmentName(equipment.templateId) }}
              {{ equipment.initialLevel ? `（初始 Lv.${equipment.initialLevel}）` : '' }}
            </li>
            <li
              v-for="skillId in rewardNotice.rewards.skillUnlocks ?? []"
              :key="`${rewardNotice.questId}-reward-card-skill-${skillId}`"
              class="reward-card__item"
            >
              解锁技能 {{ formatSkillName(skillId) }}
            </li>
          </ul>
          <p v-else class="reward-card__empty">本次提交未包含额外奖励。</p>
          <p v-if="rewardNotice.rewards.notes" class="reward-card__notes">
            {{ rewardNotice.rewards.notes }}
          </p>
        </div>
      </transition>

      <header class="quest-board__header">
        <div>
          <h2 class="section-title">任务板</h2>
          <p class="text-muted text-small">
            审阅最新通告，接受或提交冒险成果。部分任务可能随境界与地图推进开放。
          </p>
        </div>
        <div v-if="feedback" class="quest-board__feedback" :class="feedback.kind">
          {{ feedback.message }}
        </div>
      </header>

      <div class="quest-board__layout">
        <aside class="quest-board__list">
          <section v-if="readyQuests.length" class="quest-list-group">
            <h3 class="quest-list-title">可交付</h3>
            <button
              v-for="quest in readyQuests"
              :key="quest.id"
              type="button"
              class="quest-list-item ready"
              :class="{ active: quest.id === selectedQuestId }"
              @click="selectQuest(quest.id)"
            >
              <span class="quest-list-name">{{ quest.name }}</span>
              <span class="quest-list-tag">可交付</span>
            </button>
          </section>

          <section v-if="activeQuests.length" class="quest-list-group">
            <h3 class="quest-list-title">进行中</h3>
            <button
              v-for="quest in activeQuests"
              :key="quest.id"
              type="button"
              class="quest-list-item active-state"
              :class="{ active: quest.id === selectedQuestId }"
              @click="selectQuest(quest.id)"
            >
              <span class="quest-list-name">{{ quest.name }}</span>
              <span class="quest-list-tag">进行中</span>
            </button>
          </section>

          <section v-if="availableQuests.length" class="quest-list-group">
            <h3 class="quest-list-title">可接受</h3>
            <button
              v-for="quest in availableQuests"
              :key="quest.id"
              type="button"
              class="quest-list-item available"
              :class="{ active: quest.id === selectedQuestId }"
              @click="selectQuest(quest.id)"
            >
              <span class="quest-list-name">{{ quest.name }}</span>
              <span class="quest-list-tag">可接受</span>
            </button>
          </section>

          <p v-if="!readyQuests.length && !activeQuests.length && !availableQuests.length" class="quest-list-empty">
            当前没有可交互的任务，请稍后再来。
          </p>
        </aside>

        <article v-if="selectedQuest" class="quest-board__detail">
          <header class="quest-detail-header">
            <div>
              <h3 class="quest-detail-title">{{ selectedQuest.name }}</h3>
              <p class="quest-detail-subtitle">
                {{ selectedQuest.summary ?? selectedQuest.description }}
              </p>
            </div>
            <ul class="quest-detail-meta">
              <li>
                <span class="meta-label">难度</span>
                <span class="meta-value">{{ difficultyLabel(selectedQuest) }}</span>
              </li>
              <li>
                <span class="meta-label">推荐</span>
                <span class="meta-value">{{ recommendedRealmLabel(selectedQuest) }}</span>
              </li>
              <li>
                <span class="meta-label">状态</span>
                <span class="meta-value">{{ statusTextMap[selectedStatus] }}</span>
              </li>
            </ul>
          </header>

          <section class="quest-detail-section">
            <p class="text-muted">发布人：{{ selectedQuest.giver }}</p>
            <p class="quest-detail-description">{{ selectedQuest.description }}</p>
          </section>

          <section class="quest-detail-section">
            <h4>任务目标</h4>
            <ul class="objective-list">
              <li v-for="entry in objectiveEntries" :key="entry.objective.id" :class="{ completed: entry.completed }">
                <div>
                  <p class="objective-title">{{ entry.description }}</p>
                  <p class="objective-progress">
                    {{ entry.current }} / {{ entry.target }}
                  </p>
                </div>
              </li>
            </ul>
          </section>

          <section class="quest-detail-section">
            <h4>任务奖励</h4>
            <ul class="reward-list">
              <li v-if="selectedQuest.rewards.gold">
                GOLD {{ selectedQuest.rewards.gold }}
              </li>
              <li v-for="item in selectedQuest.rewards.items ?? []" :key="`${selectedQuest.id}-reward-item-${item.itemId}`">
                {{ formatItemName(item.itemId) }} ×{{ item.quantity }}
              </li>
              <li
                v-for="equipment in selectedQuest.rewards.equipmentTemplates ?? []"
                :key="`${selectedQuest.id}-reward-equipment-${equipment.templateId}`"
              >
                {{ formatEquipmentName(equipment.templateId) }}
                {{ equipment.initialLevel ? `（初始 Lv.${equipment.initialLevel}）` : '' }}
              </li>
              <li
                v-for="skillId in selectedQuest.rewards.skillUnlocks ?? []"
                :key="`${selectedQuest.id}-reward-skill-${skillId}`"
              >
                解锁技能 {{ formatSkillName(skillId) }}
              </li>
              <li v-if="selectedQuest.rewards.notes">
                {{ selectedQuest.rewards.notes }}
              </li>
            </ul>
          </section>

          <footer class="quest-detail-actions">
            <button
              v-if="showAcceptButton(selectedStatus)"
              type="button"
              class="action-button primary"
              @click="acceptQuest(selectedQuest.id)"
            >
              接受任务
            </button>
            <button
              v-if="showSubmitButton(selectedStatus)"
              type="button"
              class="action-button success"
              @click="submitQuest(selectedQuest.id)"
            >
              提交任务
            </button>
            <span v-if="selectedQuest.repeatable" class="text-small text-muted">
              此任务可重复接取
            </span>
            <span v-if="selectedQuest.allowAbandon === false" class="text-small text-muted">
              此任务不可放弃
            </span>
          </footer>
        </article>

        <div v-else class="quest-board__empty">
          选择左侧任务以查看详情。
        </div>
      </div>

      <footer v-if="questItems.length" class="quest-board__inventory">
        <h4 class="inventory-title">任务物品</h4>
        <ul class="inventory-list">
          <li v-for="entry in questItems" :key="entry.itemId">
            <span class="inventory-name">{{ entry.name }}</span>
            <span class="inventory-quantity">×{{ entry.quantity }}</span>
          </li>
        </ul>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.quest-board {
  --qb-surface: rgba(255, 255, 255, 0.04);
  --qb-surface-strong: rgba(255, 255, 255, 0.06);
  --qb-surface-hover: rgba(255, 255, 255, 0.08);
  --qb-surface-soft: rgba(255, 255, 255, 0.03);
  --qb-outline-subtle: rgba(148, 208, 255, 0.14);
  --qb-outline: rgba(168, 224, 255, 0.3);
  --qb-outline-strong: rgba(208, 240, 255, 0.45);
  --qb-glow: rgba(118, 198, 255, 0.22);
  --qb-muted: rgba(212, 228, 255, 0.75);
  --qb-muted-strong: rgba(236, 246, 255, 0.92);
  --qb-bright: #f9fbff;
  --qb-tag-bg: rgba(128, 176, 255, 0.28);
  --qb-tag-text: #f1f6ff;
  --qb-ready-bg: rgba(62, 201, 144, 0.3);
  --qb-ready-text: #dafbef;
  --qb-active-bg: rgba(118, 186, 255, 0.28);
  --qb-active-text: #ecf4ff;
  --qb-available-bg: rgba(255, 210, 120, 0.32);
  --qb-available-text: #fff4d0;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  align-items: start;
}

.quest-board__panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.32), inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  margin: 0;
}

.quest-board__status {
  align-self: start;
  margin: 0;
  padding: 24px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.32), inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

.quest-board__panel {
  position: relative;
}

.quest-board__reward-card {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 280px;
  padding: 16px 20px;
  background: var(--qb-surface-strong);
  border: 1px solid var(--qb-outline);
  border-radius: 16px;
  box-shadow: 0 18px 42px rgba(4, 12, 34, 0.52), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  color: var(--qb-bright);
  display: flex;
  flex-direction: column;
  gap: 8px;
  backdrop-filter: blur(12px);
  z-index: 2;
}

.reward-card__close {
  position: absolute;
  top: 8px;
  right: 12px;
  background: transparent;
  color: var(--qb-muted-strong);
  border: none;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.2s ease;
}

.reward-card__close:hover {
  color: var(--qb-bright);
}

.reward-card__title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.reward-card__subtitle {
  font-size: 14px;
  color: var(--qb-muted);
}

.reward-card__list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}

.reward-card__item {
  list-style: disc;
  color: var(--qb-muted-strong);
}

.reward-card__empty {
  font-size: 14px;
  color: var(--qb-muted);
}

.reward-card__notes {
  font-size: 13px;
  color: var(--qb-muted-strong);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 8px;
}

.reward-toast-enter-active,
.reward-toast-leave-active {
  transition: opacity 0.28s ease, transform 0.28s ease;
}

.reward-toast-enter-from,
.reward-toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.quest-board__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(148, 198, 255, 0.16);
}

.quest-board__feedback {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid rgba(59, 130, 246, 0.45);
  background: rgba(59, 130, 246, 0.18);
  color: #dbeafe;
  box-shadow: 0 6px 12px rgba(31, 84, 180, 0.28);
}

.quest-board__feedback.success {
  background: rgba(16, 185, 129, 0.24);
  color: #bbf7d0;
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 6px 12px rgba(16, 137, 62, 0.25);
}

.quest-board__feedback.error {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.38);
  box-shadow: 0 6px 12px rgba(248, 113, 113, 0.24);
}

.quest-board__layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
}

.quest-board__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 520px;
  overflow-y: auto;
  padding-right: 8px;
}

.quest-list-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quest-list-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--qb-muted);
  letter-spacing: 0.02em;
}

.quest-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--qb-outline-subtle);
  background: linear-gradient(140deg, var(--qb-surface), rgba(14, 22, 40, 0.88));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.quest-list-item:hover {
  border-color: var(--qb-outline);
  background: linear-gradient(140deg, var(--qb-surface-hover), rgba(24, 38, 64, 0.96));
  box-shadow: 0 14px 28px var(--qb-glow);
  transform: translateY(-1px);
}

.quest-list-item.active {
  border-color: var(--qb-outline-strong);
  background: linear-gradient(145deg, rgba(45, 67, 108, 0.96), rgba(24, 49, 92, 0.94));
  box-shadow: 0 0 0 1px rgba(164, 207, 255, 0.45), 0 18px 40px rgba(14, 32, 68, 0.65);
}

.quest-list-item.ready .quest-list-tag {
  background: var(--qb-ready-bg);
  color: var(--qb-ready-text);
}

.quest-list-item.active-state .quest-list-tag {
  background: var(--qb-active-bg);
  color: var(--qb-active-text);
}

.quest-list-item.available .quest-list-tag {
  background: var(--qb-available-bg);
  color: var(--qb-available-text);
}

.quest-list-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--qb-bright);
}

.quest-list-tag {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--qb-tag-bg);
  color: var(--qb-tag-text);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.quest-list-empty {
  font-size: 13px;
  color: var(--qb-muted);
}

.quest-board__detail {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(28, 46, 80, 0.64), rgba(14, 26, 48, 0.72));
  border: 1px solid rgba(196, 232, 255, 0.16);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 26px 48px rgba(12, 20, 40, 0.5);
}

.quest-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(118, 174, 255, 0.2);
}

.quest-detail-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--qb-bright);
  margin: 0;
}

.quest-detail-subtitle {
  font-size: 13px;
  color: var(--qb-muted-strong);
  margin: 8px 0 0;
  line-height: 1.5;
}

.quest-detail-meta {
  list-style: none;
  margin: 0;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  border-radius: 12px;
  background: rgba(13, 25, 44, 0.78);
  border: 1px solid rgba(118, 174, 255, 0.2);
}

.meta-label {
  color: var(--qb-muted);
  margin-right: 4px;
}

.meta-value {
  font-weight: 600;
  color: var(--qb-bright);
}

.quest-detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(18, 34, 62, 0.58);
  border: 1px solid rgba(168, 216, 255, 0.18);
}

.quest-detail-section h4 {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  color: var(--qb-muted-strong);
}

.quest-detail-description {
  color: var(--qb-muted-strong);
  line-height: 1.6;
  margin: 0;
}

.objective-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.objective-list li {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(168, 216, 255, 0.26);
  background: linear-gradient(145deg, rgba(24, 40, 70, 0.72), rgba(32, 54, 92, 0.72));
}

.objective-list li.completed {
  border-color: rgba(96, 165, 250, 0.55);
  background: linear-gradient(145deg, rgba(30, 64, 175, 0.5), rgba(37, 99, 235, 0.35));
  box-shadow: 0 12px 26px rgba(22, 78, 179, 0.35);
}

.objective-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--qb-bright);
}

.objective-progress {
  font-size: 13px;
  color: var(--qb-muted);
}

.reward-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--qb-muted-strong);
}

.quest-detail-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-button {
  padding: 12px 18px;
  border-radius: 10px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
}

.action-button.primary {
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  color: #f8fafc;
  box-shadow: 0 14px 32px rgba(37, 99, 235, 0.45);
}

.action-button.success {
  background: linear-gradient(135deg, #059669, #10b981);
  color: #ecfdf5;
  box-shadow: 0 14px 32px rgba(5, 150, 105, 0.45);
}

.action-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.quest-board__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(148, 198, 255, 0.35);
  border-radius: 14px;
  color: var(--qb-muted-strong);
  font-size: 14px;
  background: rgba(13, 23, 43, 0.6);
  padding: 24px;
}

.quest-board__inventory {
  border-top: 1px solid rgba(118, 174, 255, 0.16);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inventory-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--qb-muted-strong);
}

.inventory-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.inventory-list li {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.18);
  color: #dbeafe;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid rgba(96, 165, 250, 0.35);
}

.inventory-name {
  white-space: nowrap;
}

.inventory-quantity {
  opacity: 0.8;
}
</style>
