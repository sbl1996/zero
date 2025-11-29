<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import QuestDetailCard from '@/components/QuestDetailCard.vue'
import { ITEMS } from '@/data/items'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { getSkillDefinition } from '@/data/skills'
import { useQuestStore } from '@/stores/quests'
import type { QuestDefinition, QuestReward, QuestRuntimeStatus } from '@/types/domain'

const questStore = useQuestStore()

const readyQuests = computed(() => questStore.readyQuests)
const activeQuests = computed(() => questStore.activeQuests)
const availableQuests = computed(() => questStore.availableQuests)
const questItems = computed(() => questStore.questItemsView)

type QuestTone = 'hunt' | 'collect' | 'explore'

function resolveQuestTone(quest: QuestDefinition): QuestTone {
  const primary = quest.objectives[0]
  if (!primary) return 'explore'
  if (primary.type === 'kill') return 'hunt'
  if (primary.type === 'collect' || primary.type === 'killCollect') return 'collect'
  return 'explore'
}

function resolveQuestGlyph(quest: QuestDefinition) {
  const tone = resolveQuestTone(quest)
  if (tone === 'hunt') return '✦'
  if (tone === 'collect') return '⬡'
  return '◇'
}

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
              <span class="quest-list-indicator" />
              <div class="quest-list-icon" :data-tone="resolveQuestTone(quest)">
                <span class="quest-list-glyph">{{ resolveQuestGlyph(quest) }}</span>
              </div>
              <div class="quest-list-content">
                <span class="quest-list-name">{{ quest.name }}</span>
              </div>
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
              <span class="quest-list-indicator" />
              <div class="quest-list-icon" :data-tone="resolveQuestTone(quest)">
                <span class="quest-list-glyph">{{ resolveQuestGlyph(quest) }}</span>
              </div>
              <div class="quest-list-content">
                <span class="quest-list-name">{{ quest.name }}</span>
              </div>
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
              <span class="quest-list-indicator" />
              <div class="quest-list-icon" :data-tone="resolveQuestTone(quest)">
                <span class="quest-list-glyph">{{ resolveQuestGlyph(quest) }}</span>
              </div>
              <div class="quest-list-content">
                <span class="quest-list-name">{{ quest.name }}</span>
              </div>
              <span class="quest-list-tag">可接受</span>
            </button>
          </section>

          <p v-if="!readyQuests.length && !activeQuests.length && !availableQuests.length" class="quest-list-empty">
            当前没有可交互的任务，请稍后再来。
          </p>
        </aside>

        <QuestDetailCard
          v-if="selectedQuest"
          :quest="selectedQuest"
          :status="selectedStatus"
          :progress="selectedProgress"
          :show-accept="selectedStatus === 'available'"
          :show-submit="selectedStatus === 'readyToTurnIn'"
          @accept="acceptQuest(selectedQuest.id)"
          @submit="submitQuest(selectedQuest.id)"
          @track="setFeedback('已锁定任务，前往/导航功能稍后接入。', 'success')"
        />

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
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.quest-board__panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  border-radius: 18px;
  background: linear-gradient(155deg, rgba(16, 18, 28, 0.82), rgba(10, 12, 22, 0.82));
  border: 1px solid rgba(255, 255, 255, 0.04);
  box-shadow:
    0 22px 40px rgba(0, 0, 0, 0.38),
    0 0 42px rgba(76, 201, 240, 0.08);
  backdrop-filter: blur(14px);
}

.quest-board__reward-card {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 280px;
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--quest-outline);
  border-radius: 16px;
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.48), inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  color: var(--quest-text);
  display: flex;
  flex-direction: column;
  gap: 8px;
  backdrop-filter: blur(12px);
  z-index: 2;
}

.reward-card__close {
  position: absolute;
  top: 8px;
  right: 10px;
  background: transparent;
  color: var(--quest-text-dim);
  border: none;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.18s ease;
}

.reward-card__close:hover {
  color: var(--quest-text);
}

.reward-card__title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.reward-card__subtitle {
  font-size: 13px;
  color: var(--quest-text-dim);
  margin: 0;
}

.reward-card__list {
  margin: 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.reward-card__item {
  list-style: disc;
}

.reward-card__empty {
  font-size: 13px;
  color: var(--quest-text-dim);
}

.reward-card__notes {
  font-size: 12px;
  color: var(--quest-text-dim);
  border-top: 1px solid var(--quest-outline);
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
  padding-bottom: 4px;
}

.quest-board__feedback {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid rgba(76, 201, 240, 0.35);
  background: rgba(76, 201, 240, 0.14);
  color: var(--quest-text);
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.2);
}

.quest-board__feedback.success {
  background: rgba(99, 241, 178, 0.2);
  border-color: rgba(99, 241, 178, 0.32);
}

.quest-board__feedback.error {
  background: rgba(255, 144, 144, 0.2);
  border-color: rgba(255, 144, 144, 0.32);
}

.quest-board__layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
}

.quest-board__list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 540px;
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
  font-weight: 700;
  color: var(--quest-text-dim);
  letter-spacing: 0.02em;
}

.quest-list-item {
  position: relative;
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.04);
  background: linear-gradient(145deg, rgba(18, 24, 40, 0.8), rgba(12, 16, 26, 0.76));
  box-shadow:
    0 16px 28px rgba(0, 0, 0, 0.35),
    inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.quest-list-indicator {
  width: 6px;
  height: 36px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
}

.quest-list-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.quest-list-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(76, 201, 240, 0.16), rgba(28, 38, 58, 0.9));
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 10px 22px rgba(0, 0, 0, 0.3);
}

.quest-list-icon[data-tone='collect'] {
  background: linear-gradient(135deg, rgba(236, 179, 101, 0.22), rgba(42, 28, 12, 0.9));
}

.quest-list-icon[data-tone='explore'] {
  background: linear-gradient(135deg, rgba(180, 142, 251, 0.2), rgba(30, 20, 44, 0.9));
}

.quest-list-glyph {
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #fdf6e3;
}

.quest-list-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--quest-text);
}

.quest-list-meta {
  font-size: 12px;
  color: var(--quest-text-dim);
}

.quest-list-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(76, 201, 240, 0.18);
  border: 1px solid rgba(76, 201, 240, 0.4);
  color: var(--quest-text);
  letter-spacing: 0.06em;
}

.quest-list-item.ready .quest-list-tag {
  background: rgba(246, 211, 101, 0.18);
  border-color: rgba(246, 211, 101, 0.42);
}

.quest-list-item.active-state .quest-list-tag {
  background: rgba(99, 241, 178, 0.18);
  border-color: rgba(99, 241, 178, 0.42);
}

.quest-list-item.available .quest-list-tag {
  background: rgba(236, 179, 101, 0.18);
  border-color: rgba(236, 179, 101, 0.42);
}

.quest-list-item.active {
  border-color: rgba(76, 201, 240, 0.5);
  background: linear-gradient(145deg, rgba(28, 38, 58, 0.9), rgba(22, 30, 46, 0.86));
  box-shadow: 0 14px 32px rgba(76, 201, 240, 0.18);
}

.quest-list-item.active .quest-list-indicator {
  background: linear-gradient(180deg, #2dd4bf, #4cc9f0);
  box-shadow: 0 0 18px rgba(76, 201, 240, 0.5);
}

.quest-list-item:hover {
  border-color: rgba(76, 201, 240, 0.35);
  background: rgba(255, 255, 255, 0.06);
}

.quest-list-empty {
  font-size: 13px;
  color: var(--quest-text-dim);
}

.quest-board__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--quest-outline);
  border-radius: 14px;
  color: var(--quest-text-dim);
  font-size: 14px;
  background: rgba(255, 255, 255, 0.04);
  padding: 24px;
}

.quest-board__inventory {
  border-top: 1px solid var(--quest-outline);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inventory-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--quest-text);
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
  background: rgba(76, 201, 240, 0.16);
  color: var(--quest-text);
  font-size: 12px;
  font-weight: 700;
  border: 1px solid rgba(76, 201, 240, 0.4);
}

.inventory-name {
  white-space: nowrap;
}

.inventory-quantity {
  opacity: 0.8;
}

@media (max-width: 900px) {
  .quest-board__layout {
    grid-template-columns: 1fr;
  }
  .quest-board__reward-card {
    position: static;
    width: auto;
  }
  .quest-board__list {
    max-height: none;
  }
}
</style>
