<script setup lang="ts">
import { computed } from 'vue'
import type { QiFocusProfile, SkillCost } from '@/types/domain'
import { usePlayerStore } from '@/stores/player'
import { getSkillDefinition } from '@/data/skills'
import { getCultivationMethodDefinition } from '@/data/cultivationMethods'
import { createDefaultSkillProgress, getRealmSkillLevelCap, getSkillMaxLevel, getSkillXpCap } from '@/composables/useSkills'

const player = usePlayerStore()

const FOCUS_LABELS: Record<'atk' | 'def' | 'agi' | 'recovery', string> = {
  atk: '攻击',
  def: '防御',
  agi: '敏捷',
  recovery: '恢复',
}

const FOCUS_ORDER = ['atk', 'def', 'agi', 'recovery'] as const

function buildFocusLines(focus: QiFocusProfile): string[] {
  return FOCUS_ORDER.reduce<string[]>((lines, key) => {
    const value = focus[key] ?? 0
    if (value > 0) {
      const percent = Math.round(value * 100)
      lines.push(`${FOCUS_LABELS[key]} ${percent}%`)
    }
    return lines
  }, [])
}

function formatXpValue(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(Math.round(rounded)) : rounded.toFixed(1)
}

const cultivationMethods = computed(() => {
  const current = player.cultivation.method
  const def = getCultivationMethodDefinition(current.id)
  if (!def) return []
  const focusLines = buildFocusLines(def.focus)
  return [
    {
      id: def.id,
      name: def.name,
      description: def.description,
      isCurrent: true,
      focusLines,
      effects: def.effects,
    },
  ]
})

const loadoutSlots = computed(() =>
  player.skills.loadout.map((skillId, index) => {
    const skill = getSkillDefinition(skillId)
    return {
      index,
      skillId,
      skill,
      label: `槽位 ${index + 1}`,
      icon: skill?.icon ?? null,
    }
  }),
)

const knownSkillDefs = computed(() =>
  player.skills.known
    .map(id => getSkillDefinition(id))
    .filter((skill): skill is NonNullable<ReturnType<typeof getSkillDefinition>> => skill !== null),
)

const realmSkillCap = computed(() => getRealmSkillLevelCap(player.cultivation.realm))

const knownSkillDetails = computed(() =>
  knownSkillDefs.value.map((definition) => {
    const progress = player.skills.progress[definition.id] ?? createDefaultSkillProgress(definition.id)
    const level = Math.max(progress.level, 1)
    const xpCap = getSkillXpCap(level)
    const xp = progress.xp ?? 0
    const xpPercent = xpCap > 0 ? Math.max(0, Math.min(1, xp / xpCap)) : 0
    const skillMax = getSkillMaxLevel(definition)
    const realmCap = realmSkillCap.value
    const allowedMax = Math.min(skillMax, Math.max(realmCap, 1))
    const blockedByRealm = level >= allowedMax && skillMax > realmCap
    return {
      definition,
      progress,
      level,
      xp,
      xpCap,
      xpPercent,
      xpLabel: formatXpValue(xp),
      xpCapLabel: formatXpValue(xpCap),
      skillMax,
      allowedMax,
      blockedByRealm,
    }
  }),
)

const skillOptions = computed(() => [
  { id: '', name: '空槽' },
  ...knownSkillDetails.value.map((entry) => ({
    id: entry.definition.id,
    name: `${entry.definition.name} Lv.${entry.level}`,
  })),
])

function formatSkillCost(cost: SkillCost | undefined) {
  if (!cost || cost.type === 'none') return '无消耗'
  if (cost.type === 'qi') {
    const segments: string[] = []
    if (typeof cost.amount === 'number') {
      segments.push(`${cost.amount}`)
    }
    if (typeof cost.percentOfQiMax === 'number') {
      segments.push(`${Math.round(cost.percentOfQiMax * 100)}%上限`)
    }
    const detail = segments.length > 0 ? segments.join(' + ') : '0'
    return `斗气 ${detail}`
  }
  const amount = cost.amount ?? 0
  const typeLabel = (cost.type ?? 'none') as string
  return `${typeLabel.toUpperCase()} ${amount}`
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
      <h3 class="section-title" style="font-size: 16px;">斗气功法</h3>
      <div v-if="cultivationMethods.length === 0" class="text-small text-muted">暂未掌握任何斗气功法。</div>
      <div v-else class="method-list">
        <article
          v-for="method in cultivationMethods"
          :key="method.id"
          class="panel method-card"
          style="margin: 0; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08);"
        >
          <header class="method-card-header">
            <div class="method-card-heading">
              <h4 class="method-card-title">{{ method.name }}</h4>
              <span v-if="method.isCurrent" class="method-tag">当前运转</span>
            </div>
            <div v-if="method.focusLines.length > 0" class="method-focus">
              <span v-for="line in method.focusLines" :key="line" class="method-focus-item text-small">{{ line }}</span>
            </div>
          </header>
          <p class="text-small text-muted method-description">{{ method.description }}</p>
          <ul class="method-effects">
            <li
              v-for="effect in method.effects"
              :key="effect"
              class="text-small"
            >
              {{ effect }}
            </li>
          </ul>
        </article>
      </div>
    </div>

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
      </div>
      <div class="text-small text-muted">提示：技能槽位可重复装备相同技能，但建议尝试不同的战术组合。</div>
    </div>

    <div class="panel" style="margin-top: 16px; background: rgba(255,255,255,0.04);">
      <h3 class="section-title" style="font-size: 16px;">已掌握技能</h3>
      <div v-if="knownSkillDetails.length === 0" class="text-small text-muted">暂未掌握任何技能。</div>
      <div v-else class="skill-list">
        <article
          v-for="skill in knownSkillDetails"
          :key="skill.definition.id"
          class="panel"
          style="margin: 0; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.08);"
        >
          <header class="flex flex-between flex-center skill-card-header">
            <div class="skill-card-heading">
              <img
                v-if="skill.definition.icon"
                :src="skill.definition.icon"
                :alt="skill.definition.name"
                class="skill-card-icon"
              >
              <div class="skill-card-heading-text">
                <h4 class="skill-card-title">
                  {{ skill.definition.name }}
                  <span class="text-small text-muted">Lv.{{ skill.level }}/{{ skill.allowedMax }}</span>
                </h4>
                <span class="text-small text-muted">消耗：{{ formatSkillCost(skill.definition.cost) }}</span>
              </div>
            </div>
            <button class="btn" type="button" @click="equipToFirstEmpty(skill.definition.id)">
              装备到空槽
            </button>
          </header>
          <p class="text-small" style="margin: 0; line-height: 1.6;">{{ skill.definition.description }}</p>
          <div class="skill-progress-wrapper">
            <div class="skill-progress-bar">
              <div
                class="skill-progress-bar-value"
                :style="{ width: `${Math.round(skill.xpPercent * 100)}%` }"
              />
            </div>
            <div class="skill-progress-meta">
              <span class="text-small text-muted">熟练度 {{ skill.xpLabel }} / {{ skill.xpCapLabel }}</span>
              <span v-if="skill.blockedByRealm" class="text-small text-warning">境界不足，无法突破</span>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.skill-slot-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
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

.skill-slot-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.skill-slot-preview span {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-slot-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.skill-slot-meta {
  text-align: right;
}

.skill-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.method-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.method-card {
  padding: 16px;
}

.method-card-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.method-card-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.method-card-title {
  margin: 0;
  font-size: 16px;
}

.method-tag {
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(255, 213, 79, 0.16);
  border: 1px solid rgba(255, 213, 79, 0.35);
  color: #ffd54f;
  font-size: 12px;
  line-height: 1.2;
}

.method-focus {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.method-focus-item {
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
}

.method-description {
  margin: 0 0 8px;
}

.method-effects {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  list-style: disc;
}

.skill-card-header {
  margin-bottom: 8px;
  gap: 12px;
}

.skill-card-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.skill-card-heading-text {
  display: flex;
  flex-direction: column;
}

.skill-card-title {
  margin: 0 0 4px;
  font-size: 16px;
}

.skill-card-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.skill-progress-wrapper {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill-progress-bar {
  position: relative;
  width: 100%;
  height: 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.skill-progress-bar-value {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, rgba(148, 197, 255, 0.85), rgba(64, 124, 255, 0.95));
  transition: width 0.2s ease-out;
}

.skill-progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.text-warning {
  color: #ffb74d;
}

@media (max-width: 640px) {
  .skill-list {
    grid-template-columns: 1fr;
  }

  .skill-slot-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .skill-slot-meta {
    text-align: left;
  }

  .skill-slot-preview {
    justify-content: flex-start;
  }

  .skill-card-heading {
    align-items: flex-start;
  }
}
</style>
