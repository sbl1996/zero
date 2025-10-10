<script setup lang="ts">
import { computed } from 'vue'
import type { SkillCost } from '@/types/domain'
import { usePlayerStore } from '@/stores/player'
import { getSkillDefinition } from '@/data/skills'

const player = usePlayerStore()

const loadoutSlots = computed(() =>
  player.skills.loadout.map((skillId, index) => {
    const skill = getSkillDefinition(skillId)
    return {
      index,
      skillId,
      skill,
      label: `槽位 ${index + 1}`,
    }
  }),
)

const knownSkills = computed(() =>
  player.skills.known
    .map(id => getSkillDefinition(id))
    .filter((skill): skill is NonNullable<ReturnType<typeof getSkillDefinition>> => skill !== null),
)

const skillOptions = computed(() => [{ id: '', name: '空槽' }, ...knownSkills.value.map(skill => ({ id: skill.id, name: skill.name }))])

function formatCostDisplay(skillId: string | null) {
  const skill = getSkillDefinition(skillId)
  if (!skill) return '未装备'
  const cost = skill.cost
  if (!cost || cost.type === 'none') return '无消耗'
  const amount = cost.amount ?? 0
  return `${cost.type.toUpperCase()} ${amount}`
}

function formatSkillCost(cost: SkillCost | undefined) {
  if (!cost || cost.type === 'none') return '无消耗'
  const amount = cost.amount ?? 0
  return `${cost.type.toUpperCase()} ${amount}`
}

function handleSlotChange(index: number, value: string) {
  const target = value.length > 0 ? value : null
  player.equipSkill(index, target)
}

function equipToFirstEmpty(skillId: string) {
  const slots = player.skills.loadout
  if (slots.includes(skillId)) return
  const emptyIndex = slots.findIndex(id => id === null)
  const targetIndex = emptyIndex === -1 ? slots.length - 1 : emptyIndex
  player.equipSkill(targetIndex, skillId)
}
</script>

<template>
  <section class="panel">
    <h2 class="section-title">技能配置</h2>
    <p class="text-muted text-small">在此管理角色掌握的技能，并为战斗界面四个技能槽位进行装备。</p>

    <div class="panel" style="margin-top: 16px; background: rgba(255,255,255,0.04);">
      <h3 class="section-title" style="font-size: 16px;">技能栏</h3>
      <div
        v-for="slot in loadoutSlots"
        :key="slot.index"
        class="skill-slot-row"
      >
        <span class="text-small skill-slot-label">{{ slot.label }}</span>
        <select
          :value="slot.skillId ?? ''"
          class="skill-slot-select"
          @change="handleSlotChange(slot.index, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in skillOptions" :key="option.id || 'empty'" :value="option.id">{{ option.name }}</option>
        </select>
        <span class="text-small text-muted skill-slot-meta">{{ formatCostDisplay(slot.skillId ?? null) }}</span>
      </div>
      <div class="text-small text-muted">提示：技能槽位可重复装备相同技能，但建议尝试不同的战术组合。</div>
    </div>

    <div class="panel" style="margin-top: 16px; background: rgba(255,255,255,0.04);">
      <h3 class="section-title" style="font-size: 16px;">已掌握技能</h3>
      <div v-if="knownSkills.length === 0" class="text-small text-muted">暂未掌握任何技能。</div>
      <div v-else class="skill-list">
        <article
          v-for="skill in knownSkills"
          :key="skill.id"
          class="panel"
          style="margin: 0; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08);"
        >
          <header class="flex flex-between flex-center skill-card-header">
            <div>
              <h4 style="margin: 0; font-size: 16px;">{{ skill.name }}</h4>
              <span class="text-small text-muted">消耗：{{ formatSkillCost(skill.cost) }}</span>
            </div>
            <button class="btn" type="button" @click="equipToFirstEmpty(skill.id)">
              装备到空槽
            </button>
          </header>
          <p class="text-small" style="margin: 0; line-height: 1.6;">{{ skill.description }}</p>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.skill-slot-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 120px;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.skill-slot-label {
  font-weight: 600;
}

.skill-slot-select {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
}

.skill-slot-meta {
  text-align: right;
}

.skill-list {
  display: grid;
  gap: 12px;
}

.skill-card-header {
  margin-bottom: 8px;
  gap: 12px;
}

@media (max-width: 640px) {
  .skill-slot-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .skill-slot-meta {
    text-align: left;
  }
}
</style>
