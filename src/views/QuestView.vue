<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import QuestDetailCard from '@/components/QuestDetailCard.vue'
import { ITEMS } from '@/data/items'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { getSkillDefinition } from '@/data/skills'
import { useQuestStore } from '@/stores/quests'
import type { QuestDefinition, QuestRuntimeStatus } from '@/types/domain'

const questStore = useQuestStore()

type QuestTab = 'active' | 'completed'

const currentTab = ref<QuestTab>('active')

const questItems = computed(() => questStore.questItemsView)

const activeQuestList = computed<QuestDefinition[]>(() => {
  const seen = new Set<string>()
  const result: QuestDefinition[] = []
  const groups = [questStore.readyQuests, questStore.activeQuests]
  groups.forEach(group => {
    group.forEach(quest => {
      if (seen.has(quest.id)) return
      seen.add(quest.id)
      result.push(quest)
    })
  })
  return result
})

const selectedActiveQuestId = ref<string | null>(null)

watch(
  activeQuestList,
  (list) => {
    if (!list.length) {
      selectedActiveQuestId.value = null
      return
    }
    if (selectedActiveQuestId.value && list.some(quest => quest.id === selectedActiveQuestId.value)) {
      return
    }
    selectedActiveQuestId.value = list[0]?.id ?? null
  },
  { immediate: true, deep: true },
)

const selectedActiveQuest = computed<QuestDefinition | null>(() => {
  const id = selectedActiveQuestId.value
  if (!id) return null
  return questStore.definitionMap[id] ?? null
})

const selectedActiveStatus = computed<QuestRuntimeStatus>(() => {
  const id = selectedActiveQuestId.value
  if (!id) return 'locked'
  return questStore.getStatus(id)
})

const selectedActiveProgress = computed(() => {
  const id = selectedActiveQuestId.value
  if (!id) return null
  return questStore.progressOf(id)
})

const completionLog = computed(() => questStore.completionLogView)

const selectedLogIndex = ref(0)

watch(
  completionLog,
  (log) => {
    if (!log.length) {
      selectedLogIndex.value = 0
      return
    }
    if (selectedLogIndex.value >= log.length) {
      selectedLogIndex.value = 0
    }
  },
  { immediate: true, deep: true },
)

const selectedLogEntry = computed(() => {
  if (!completionLog.value.length) return null
  return completionLog.value[selectedLogIndex.value] ?? null
})

const selectedLogQuest = computed<QuestDefinition | null>(() => {
  const entry = selectedLogEntry.value
  if (!entry) return null
  return questStore.definitionMap[entry.questId] ?? null
})

const feedback = ref<{ message: string; kind: 'success' | 'error' } | null>(null)

function setFeedback(message: string, kind: 'success' | 'error') {
  feedback.value = { message, kind }
  setTimeout(() => {
    if (feedback.value?.message === message) {
      feedback.value = null
    }
  }, 2200)
}

function selectActiveQuest(id: string) {
  selectedActiveQuestId.value = id
}

function selectLogEntry(index: number) {
  selectedLogIndex.value = index
}

function abandonQuest(id: string) {
  const ok = questStore.abandon(id)
  if (ok) {
    setFeedback('任务已放弃，相关任务物品已清理。', 'success')
  } else {
    setFeedback('无法放弃该任务。', 'error')
  }
}

function formatStatusLabel(status: QuestRuntimeStatus) {
  switch (status) {
    case 'readyToTurnIn':
      return '可交付'
    case 'active':
      return '进行中'
    default:
      return '进行中'
  }
}

function formatTimestamp(value: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未知时间'
  return date.toLocaleString()
}

function showAbandonButton(status: QuestRuntimeStatus, allowAbandon?: boolean) {
  if (allowAbandon === false) return false
  return status === 'active'
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
</script>

<template>
  <div class="quest-view">
    <section class="panel quest-view__panel">
      <header class="quest-view__header">
        <div>
          <h2 class="section-title">任务</h2>
          <p class="text-muted text-small">
            查看进行中的任务与历史记录，提交奖励请前往翡冷翠任务板。
          </p>
        </div>
        <nav class="quest-tabs">
          <button
            type="button"
            :class="{ active: currentTab === 'active' }"
            @click="currentTab = 'active'"
          >
            当前任务
          </button>
          <button
            type="button"
            :class="{ active: currentTab === 'completed' }"
            @click="currentTab = 'completed'"
          >
            已归档
          </button>
        </nav>
      </header>

      <div v-if="feedback" class="quest-view__feedback" :class="feedback.kind">
        {{ feedback.message }}
      </div>

      <div v-if="currentTab === 'active'" class="quest-active-layout">
        <aside class="quest-list">
          <button
            v-for="quest in activeQuestList"
            :key="quest.id"
            type="button"
            class="quest-list-item"
            :class="{
              active: quest.id === selectedActiveQuestId,
              ready: questStore.readyToTurnIn.includes(quest.id),
            }"
            @click="selectActiveQuest(quest.id)"
          >
            <span class="quest-list-indicator" />
            <div class="quest-list-content">
              <span class="quest-list-name">{{ quest.name }}</span>
              <span class="quest-list-meta">发布人：{{ quest.giver }}</span>
            </div>
            <span class="quest-list-tag">{{ formatStatusLabel(questStore.getStatus(quest.id)) }}</span>
          </button>
          <p v-if="!activeQuestList.length" class="quest-list-empty">
            当前没有进行中的任务。
          </p>
        </aside>

        <QuestDetailCard
          v-if="selectedActiveQuest"
          :quest="selectedActiveQuest"
          :status="selectedActiveStatus"
          :progress="selectedActiveProgress"
          :show-abandon="showAbandonButton(selectedActiveStatus, selectedActiveQuest.allowAbandon)"
          @abandon="abandonQuest(selectedActiveQuest.id)"
        />

        <div v-else class="quest-empty-detail">
          选择左侧任务查看详情。
        </div>
      </div>

      <div v-else class="quest-completed-layout">
        <aside class="quest-log-list">
          <button
            v-for="(entry, index) in completionLog"
            :key="entry.questId"
            type="button"
            class="quest-log-item"
            :class="{ active: selectedLogIndex === index }"
            @click="selectLogEntry(index)"
          >
            <p class="quest-log-name">
              {{ questStore.definitionMap[entry.questId]?.name ?? entry.questId }}
            </p>
          </button>
          <p v-if="!completionLog.length" class="quest-list-empty">
            暂无归档记录。
          </p>
        </aside>

        <article v-if="selectedLogEntry && selectedLogQuest" class="quest-detail">
          <header class="quest-detail-headline">
            <h3>{{ selectedLogQuest.name }}</h3>
            <span class="quest-status-label archived">已归档</span>
          </header>
          <p class="quest-detail-summary">
            最近完成：{{ formatTimestamp(selectedLogEntry.lastSubmittedAt) }}
          </p>
          <p class="quest-detail-summary">
            完成次数：{{ selectedLogEntry.repeatCount }}
          </p>

          <section class="quest-detail-section">
            <h4>奖励记录</h4>
            <ul class="reward-list">
              <li v-if="selectedLogEntry.lastRewards.gold">
                GOLD {{ selectedLogEntry.lastRewards.gold }}
              </li>
              <li
                v-for="item in selectedLogEntry.lastRewards.items ?? []"
                :key="`log-reward-item-${selectedLogQuest.id}-${item.itemId}`"
              >
                {{ formatItemName(item.itemId) }} ×{{ item.quantity }}
              </li>
              <li
                v-for="equipment in selectedLogEntry.lastRewards.equipmentTemplates ?? []"
                :key="`log-reward-equip-${selectedLogQuest.id}-${equipment.templateId}`"
              >
                {{ formatEquipmentName(equipment.templateId) }}
                {{ equipment.initialLevel ? `（初始 Lv.${equipment.initialLevel}）` : '' }}
              </li>
              <li
                v-for="skillId in selectedLogEntry.lastRewards.skillUnlocks ?? []"
                :key="`log-reward-skill-${selectedLogQuest.id}-${skillId}`"
              >
                解锁技能 {{ formatSkillName(skillId) }}
              </li>
              <li v-if="selectedLogEntry.lastRewards.notes">
                {{ selectedLogEntry.lastRewards.notes }}
              </li>
            </ul>
          </section>
        </article>

        <div v-else class="quest-empty-detail">
          选择右侧记录查看奖励详情。
        </div>
      </div>

      <footer v-if="questItems.length" class="quest-inventory">
        <h4 class="inventory-title">当前任务物品</h4>
        <ul class="inventory-list">
          <li v-for="entry in questItems" :key="entry.itemId">
            <span class="inventory-name">{{ entry.name }}</span>
            <span class="inventory-count">×{{ entry.quantity }}</span>
          </li>
        </ul>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.quest-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.quest-view__panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  border-radius: 18px;
  background: linear-gradient(165deg, rgba(20, 22, 32, 0.84), rgba(14, 18, 28, 0.9));
  border: 1px solid var(--quest-border-faint);
  box-shadow: 0 20px 38px rgba(0, 0, 0, 0.36), inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(12px);
}

.quest-view__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--quest-outline);
}

.quest-tabs {
  display: flex;
  gap: 8px;
}

.quest-tabs button {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid var(--quest-outline);
  background: rgba(255, 255, 255, 0.06);
  color: var(--quest-text);
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.quest-tabs button.active {
  background: linear-gradient(135deg, #2dd4bf, #4cc9f0);
  color: #071019;
  border-color: rgba(76, 201, 240, 0.5);
  box-shadow: 0 10px 22px rgba(76, 201, 240, 0.32);
}

.quest-view__feedback {
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 700;
  border: 1px solid rgba(76, 201, 240, 0.35);
  background: rgba(76, 201, 240, 0.14);
  color: var(--quest-text);
  box-shadow: 0 10px 18px rgba(0, 0, 0, 0.2);
}

.quest-view__feedback.success {
  background: rgba(99, 241, 178, 0.2);
  border-color: rgba(99, 241, 178, 0.32);
}

.quest-view__feedback.error {
  background: rgba(255, 144, 144, 0.2);
  border-color: rgba(255, 144, 144, 0.32);
}

.quest-active-layout,
.quest-completed-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
}

.quest-list,
.quest-log-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 540px;
  overflow-y: auto;
  padding-right: 6px;
}

.quest-list-item,
.quest-log-item {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--quest-outline);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
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

.quest-list-name,
.quest-log-name {
  margin: 0;
  font-weight: 700;
  font-size: 14px;
  color: var(--quest-text);
}

.quest-list-meta {
  font-size: 12px;
  color: var(--quest-text-dim);
}

.quest-list-tag {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(76, 201, 240, 0.18);
  border: 1px solid rgba(76, 201, 240, 0.4);
  color: var(--quest-text);
  font-weight: 700;
  letter-spacing: 0.06em;
}

.quest-list-item.ready .quest-list-tag {
  background: rgba(246, 211, 101, 0.18);
  border-color: rgba(246, 211, 101, 0.42);
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

.quest-list-item:hover,
.quest-log-item:hover {
  border-color: rgba(76, 201, 240, 0.35);
  background: rgba(255, 255, 255, 0.06);
}

.quest-log-item.active {
  border-color: rgba(172, 196, 255, 0.4);
  background: linear-gradient(145deg, rgba(28, 36, 62, 0.9), rgba(18, 24, 44, 0.86));
}

.quest-list-empty {
  font-size: 13px;
  color: var(--quest-text-dim);
}

.quest-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 16px;
  background: linear-gradient(165deg, rgba(18, 24, 40, 0.84), rgba(14, 18, 30, 0.88));
  border: 1px solid var(--quest-outline);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
}

.quest-detail-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quest-status-label {
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(76, 201, 240, 0.2);
  border: 1px solid rgba(76, 201, 240, 0.45);
  color: var(--quest-text);
  letter-spacing: 0.05em;
}

.quest-status-label.archived {
  background: rgba(148, 163, 184, 0.22);
  border-color: rgba(148, 163, 184, 0.35);
}

.quest-detail-summary {
  font-size: 13px;
  color: var(--quest-text-dim);
  margin: 0;
}

.quest-detail-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--quest-outline);
}

.quest-detail-section h4 {
  margin: 0;
  font-size: 14px;
}

.reward-list {
  list-style: none;
  margin: 0;
  padding-left: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--quest-text);
}

.quest-detail-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.quest-detail-actions button.danger {
  padding: 10px 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 99, 99, 0.4);
  background: transparent;
  color: #ffc6c6;
  cursor: pointer;
  transition: all 0.15s ease;
}

.quest-detail-actions button.danger:hover {
  background: rgba(255, 99, 99, 0.12);
}

.quest-empty-detail,
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

.quest-inventory {
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
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.inventory-list li {
  display: inline-flex;
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

.inventory-count {
  opacity: 0.8;
}

.info-message {
  font-size: 13px;
  color: var(--quest-text-dim);
}

@media (max-width: 900px) {
  .quest-active-layout,
  .quest-completed-layout {
    grid-template-columns: 1fr;
  }
  .quest-list,
  .quest-log-list {
    max-height: none;
  }
}
</style>
