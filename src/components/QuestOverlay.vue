<template>
  <Transition name="quest-overlay">
    <aside v-if="notice" class="quest-overlay" role="status" aria-live="polite">
      <button type="button" class="quest-overlay__close" aria-label="关闭提示" @click="overlay.clear">
        ×
      </button>
      <p class="quest-overlay__eyebrow">{{ notice.kind === 'reward' ? '任务完成' : '接受任务' }}</p>
      <h3 class="quest-overlay__title">「{{ notice.questName }}」</h3>
      <p v-if="notice.message" class="quest-overlay__message">
        {{ notice.message }}
      </p>

      <template v-if="notice.kind === 'reward' && notice.rewards">
        <ul v-if="rewardHasContent(notice.rewards)" class="quest-overlay__list">
          <li v-if="notice.rewards.gold" class="quest-overlay__item">
            GOLD {{ notice.rewards.gold }}
          </li>
          <li
            v-for="item in notice.rewards.items ?? []"
            :key="`quest-overlay-item-${notice.questId}-${item.itemId}`"
            class="quest-overlay__item"
          >
            {{ formatItemName(item.itemId) }} ×{{ item.quantity }}
          </li>
          <li
            v-for="equipment in notice.rewards.equipmentTemplates ?? []"
            :key="`quest-overlay-equipment-${notice.questId}-${equipment.templateId}`"
            class="quest-overlay__item"
          >
            {{ formatEquipmentName(equipment.templateId) }}
            {{ equipment.initialLevel ? `（初始 Lv.${equipment.initialLevel}）` : '' }}
          </li>
          <li
            v-for="skillId in notice.rewards.skillUnlocks ?? []"
            :key="`quest-overlay-skill-${notice.questId}-${skillId}`"
            class="quest-overlay__item"
          >
            解锁技能 {{ formatSkillName(skillId) }}
          </li>
        </ul>
        <p v-else class="quest-overlay__empty">本次提交未包含额外奖励。</p>
        <p v-if="notice.rewards.notes" class="quest-overlay__notes">
          {{ notice.rewards.notes }}
        </p>
      </template>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ITEMS } from '@/data/items'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { getSkillDefinition } from '@/data/skills'
import { useQuestOverlayStore } from '@/stores/questOverlay'
import type { QuestReward } from '@/types/domain'

const overlay = useQuestOverlayStore()
const notice = computed(() => overlay.notice)

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

function rewardHasContent(reward: QuestReward): boolean {
  return Boolean(
    (reward.gold && reward.gold > 0) ||
      (reward.items && reward.items.length > 0) ||
      (reward.equipmentTemplates && reward.equipmentTemplates.length > 0) ||
      (reward.skillUnlocks && reward.skillUnlocks.length > 0),
  )
}
</script>

<style scoped>
.quest-overlay {
  position: fixed;
  top: 16px;
  right: 16px;
  width: min(340px, 86vw);
  padding: 16px 18px;
  border-radius: 16px;
  background: radial-gradient(circle at 18% 18%, rgba(76, 201, 240, 0.18), rgba(16, 18, 28, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    0 22px 48px rgba(0, 0, 0, 0.55),
    inset 0 0 0 1px rgba(255, 255, 255, 0.04);
  color: #e5f0ff;
  z-index: 30;
  backdrop-filter: blur(10px);
  overflow: hidden;
}

.quest-overlay__close {
  position: absolute;
  top: 8px;
  right: 10px;
  background: transparent;
  color: rgba(229, 240, 255, 0.7);
  border: none;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.18s ease;
}

.quest-overlay__close:hover {
  color: #fff;
}

.quest-overlay__eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(229, 240, 255, 0.7);
}

.quest-overlay__title {
  margin: 0 0 6px;
  font-size: 18px;
  line-height: 1.35;
  font-weight: 800;
  color: #f8fbff;
}

.quest-overlay__message {
  margin: 0 0 6px;
  font-size: 14px;
  color: rgba(229, 240, 255, 0.9);
}

.quest-overlay__list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #d9e7ff;
}

.quest-overlay__item {
  list-style: disc;
}

.quest-overlay__empty {
  margin: 0 0 4px;
  font-size: 13px;
  color: rgba(229, 240, 255, 0.7);
}

.quest-overlay__notes {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(229, 240, 255, 0.65);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 6px;
}

.quest-overlay-enter-active,
.quest-overlay-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.quest-overlay-enter-from,
.quest-overlay-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
