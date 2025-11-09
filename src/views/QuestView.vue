<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ITEMS } from '@/data/items'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { getSkillDefinition } from '@/data/skills'
import { useQuestStore } from '@/stores/quests'
import type { QuestDefinition, QuestObjective, QuestRuntimeStatus } from '@/types/domain'

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

interface ObjectiveEntry {
  title: string
  current: number
  target: number
  completed: boolean
}

const activeObjectiveEntries = computed<ObjectiveEntry[]>(() => {
  const quest = selectedActiveQuest.value
  if (!quest) return []
  const progress = selectedActiveProgress.value
  return quest.objectives.map((objective) => {
    const entry = progress?.objectives[objective.id]
    return {
      title: objective.description ?? formatObjectiveDescription(objective),
      current: entry?.current ?? 0,
      target: objective.amount,
      completed: !!entry?.completed,
    }
  })
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

function formatObjectiveDescription(objective: QuestObjective) {
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
            <span class="quest-list-name">{{ quest.name }}</span>
            <span class="quest-list-tag">{{ formatStatusLabel(questStore.getStatus(quest.id)) }}</span>
          </button>
          <p v-if="!activeQuestList.length" class="quest-list-empty">
            当前没有进行中的任务。
          </p>
        </aside>

        <article v-if="selectedActiveQuest" class="quest-detail">
          <header class="quest-detail-headline">
            <h3>{{ selectedActiveQuest.name }}</h3>
            <span
              class="quest-status-label"
              :class="{ ready: selectedActiveStatus === 'readyToTurnIn' }"
            >
              {{ formatStatusLabel(selectedActiveStatus) }}
            </span>
          </header>

          <p class="quest-detail-summary">
            {{ selectedActiveQuest.summary ?? selectedActiveQuest.description }}
          </p>

          <section class="quest-detail-section">
            <h4>任务目标</h4>
            <ul class="objective-list">
              <li v-for="objective in activeObjectiveEntries" :key="objective.title" :class="{ completed: objective.completed }">
                <p class="objective-title">{{ objective.title }}</p>
                <p class="objective-progress">{{ objective.current }} / {{ objective.target }}</p>
              </li>
            </ul>
          </section>

          <section class="quest-detail-section info">
            <p v-if="selectedActiveStatus === 'readyToTurnIn'" class="info-message">
              已达成任务目标，请返回翡冷翠的任务板提交。
            </p>
            <p v-else class="info-message">
              可在此查看进度，如需提交请前往任务板。
            </p>
          </section>

          <footer class="quest-detail-actions">
            <button
              v-if="showAbandonButton(selectedActiveStatus, selectedActiveQuest.allowAbandon)"
              type="button"
              class="danger"
              @click="abandonQuest(selectedActiveQuest.id)"
            >
              放弃任务
            </button>
            <span v-if="selectedActiveQuest.repeatable" class="text-small text-muted">此任务可重复接取。</span>
            <span v-if="selectedActiveQuest.allowAbandon === false" class="text-small text-muted">此任务不可放弃。</span>
          </footer>
        </article>

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
  --qv-surface: rgba(255, 255, 255, 0.04);
  --qv-surface-strong: rgba(255, 255, 255, 0.06);
  --qv-surface-hover: rgba(255, 255, 255, 0.08);
  --qv-outline-subtle: rgba(158, 216, 255, 0.16);
  --qv-outline: rgba(180, 232, 255, 0.32);
  --qv-outline-strong: rgba(216, 244, 255, 0.48);
  --qv-glow: rgba(120, 200, 255, 0.24);
  --qv-muted: rgba(210, 228, 255, 0.75);
  --qv-muted-strong: rgba(234, 244, 255, 0.9);
  --qv-bright: #f8fbff;
  --qv-tag-bg: rgba(138, 188, 255, 0.28);
  --qv-tag-text: #f0f6ff;
  --qv-ready-bg: rgba(62, 201, 144, 0.3);
  --qv-ready-text: #dafbef;
  --qv-ready-border: rgba(62, 201, 144, 0.45);
  --qv-primary-bg: rgba(118, 186, 255, 0.32);
  --qv-primary-text: #ecf4ff;
  --qv-archived-bg: rgba(176, 196, 216, 0.3);
  --qv-archived-text: #f2f4f8;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.quest-view__panel {
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

.quest-view__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(138, 192, 255, 0.18);
}

.quest-tabs {
  display: flex;
  gap: 8px;
}

.quest-tabs button {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid var(--qv-outline-subtle);
  background: rgba(17, 29, 54, 0.6);
  color: var(--qv-muted-strong);
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.quest-tabs button:hover {
  border-color: var(--qv-outline);
  background: rgba(29, 47, 80, 0.78);
  box-shadow: 0 10px 22px var(--qv-glow);
}

.quest-tabs button.active {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.55), rgba(37, 99, 235, 0.75));
  border-color: var(--qv-outline-strong);
  color: var(--qv-bright);
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.45);
  transform: translateY(-1px);
}

.quest-view__feedback {
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid rgba(59, 130, 246, 0.45);
  background: rgba(59, 130, 246, 0.18);
  color: #dbeafe;
  box-shadow: 0 6px 12px rgba(31, 84, 180, 0.28);
}

.quest-view__feedback.success {
  background: rgba(16, 185, 129, 0.24);
  color: #bbf7d0;
  border-color: rgba(16, 185, 129, 0.4);
  box-shadow: 0 6px 12px rgba(16, 137, 62, 0.25);
}

.quest-view__feedback.error {
  background: rgba(248, 113, 113, 0.2);
  color: #fecaca;
  border-color: rgba(248, 113, 113, 0.38);
  box-shadow: 0 6px 12px rgba(248, 113, 113, 0.24);
}

.quest-active-layout,
.quest-completed-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 16px;
}

.quest-list,
.quest-log-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 520px;
  overflow-y: auto;
  padding-right: 6px;
}

.quest-list-item,
.quest-log-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid var(--qv-outline-subtle);
  background: linear-gradient(140deg, var(--qv-surface), rgba(15, 26, 48, 0.88));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.quest-list-item:hover,
.quest-log-item:hover {
  border-color: var(--qv-outline);
  background: linear-gradient(140deg, var(--qv-surface-hover), rgba(26, 42, 74, 0.96));
  box-shadow: 0 14px 28px var(--qv-glow);
  transform: translateY(-1px);
}

.quest-list-item.active,
.quest-log-item.active {
  border-color: var(--qv-outline-strong);
  background: linear-gradient(148deg, rgba(46, 72, 116, 0.96), rgba(30, 54, 96, 0.94));
  box-shadow: 0 0 0 1px rgba(176, 214, 255, 0.45), 0 18px 40px rgba(16, 35, 70, 0.6);
}

.quest-list-item.ready .quest-list-tag {
  background: var(--qv-ready-bg);
  color: var(--qv-ready-text);
  border-color: var(--qv-ready-border);
}

.quest-list-name,
.quest-log-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--qv-bright);
  flex: 1 1 auto;
  margin: 0;
}

.quest-list-tag {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--qv-tag-bg);
  color: var(--qv-tag-text);
  font-weight: 600;
  border: 1px solid rgba(96, 152, 226, 0.35);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.quest-log-time {
  font-size: 11px;
  color: var(--qv-muted);
  white-space: nowrap;
  text-align: right;
}

.quest-log-count {
  font-size: 11px;
  color: var(--qv-muted-strong);
  white-space: nowrap;
  text-align: right;
}

.quest-list-empty {
  font-size: 13px;
  color: var(--qv-muted);
}

.quest-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(160deg, rgba(26, 48, 84, 0.62), rgba(14, 28, 52, 0.7));
  border: 1px solid rgba(200, 236, 255, 0.16);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 24px 40px rgba(10, 18, 38, 0.5);
}

.quest-detail-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quest-status-label {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--qv-primary-bg);
  color: var(--qv-primary-text);
  border: 1px solid rgba(96, 165, 250, 0.45);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.quest-status-label.ready {
  background: var(--qv-ready-bg);
  color: var(--qv-ready-text);
  border-color: var(--qv-ready-border);
}

.quest-status-label.archived {
  background: var(--qv-archived-bg);
  color: var(--qv-archived-text);
  border-color: rgba(148, 163, 184, 0.45);
}

.quest-detail-summary {
  font-size: 13px;
  color: var(--qv-muted-strong);
  line-height: 1.5;
}

.quest-detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 12px;
  background: rgba(22, 40, 72, 0.62);
  border: 1px solid rgba(180, 224, 255, 0.22);
}

.quest-detail-section.info {
  background: rgba(28, 50, 88, 0.66);
  border-color: rgba(144, 202, 255, 0.34);
}

.quest-detail-section h4 {
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  color: var(--qv-muted-strong);
}

.objective-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.objective-list li {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(186, 226, 255, 0.24);
  background: linear-gradient(145deg, rgba(24, 42, 72, 0.72), rgba(34, 56, 92, 0.72));
}

.objective-list li.completed {
  border-color: rgba(96, 165, 250, 0.55);
  background: linear-gradient(145deg, rgba(37, 99, 235, 0.35), rgba(59, 130, 246, 0.35));
  box-shadow: 0 12px 26px rgba(22, 78, 179, 0.35);
}

.objective-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--qv-bright);
}

.objective-progress {
  font-size: 13px;
  color: var(--qv-muted);
}

.reward-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--qv-muted-strong);
}

.quest-detail-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.quest-detail-actions button.danger {
  padding: 12px 18px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(135deg, #dc2626, #f87171);
  color: #fee2e2;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 14px 32px rgba(220, 38, 38, 0.4);
  transition: transform 0.15s ease, filter 0.15s ease;
}

.quest-detail-actions button.danger:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.quest-empty-detail {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(138, 192, 255, 0.35);
  border-radius: 14px;
  color: var(--qv-muted-strong);
  font-size: 14px;
  background: rgba(13, 23, 43, 0.6);
  padding: 24px;
}

.quest-inventory {
  border-top: 1px solid rgba(132, 188, 255, 0.18);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inventory-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--qv-muted-strong);
}

.inventory-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  list-style: none;
  margin: 0;
  padding: 0;
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

.inventory-count {
  opacity: 0.8;
}

.info-message {
  font-size: 13px;
  color: var(--qv-muted-strong);
}
</style>
