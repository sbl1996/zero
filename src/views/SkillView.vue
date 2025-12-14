<script setup lang="ts">
import { computed } from 'vue'
import type { SkillCost, SkillDefinition } from '@/types/domain'
import SkillCard from '@/components/SkillCard.vue'
import CultivationMethodCard from '@/components/CultivationMethodCard.vue'
import { usePlayerStore } from '@/stores/player'
import { getSkillDefinition, getSkillDescription } from '@/data/skills'
import { getCultivationMethodDefinition } from '@/data/cultivationMethods'
import { createDefaultSkillProgress, getRealmSkillLevelCap, getSkillMaxLevel, getSkillXpCap } from '@/composables/useSkills'

const player = usePlayerStore()

function formatXpValue(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 10) / 10
  // return Number.isInteger(rounded) ? String(Math.round(rounded)) : String(Math.floor(value))
  return Number.isInteger(rounded) ? String(Math.round(rounded)) : value.toFixed(1)
}

type SkillStatBlock = { label: string; value: string; tone: 'cost' | 'cooldown' | 'multiplier' }
type SkillTag = { id: string; label: string; kind: 'timing' | 'defense' | 'debuff' | 'resource' | 'utility'; value?: string }

const cultivationMethods = computed(() => {
  const current = player.cultivation.method
  const def = getCultivationMethodDefinition(current.id)
  if (!def) return []
  return [
    {
      id: def.id,
      name: def.name,
      icon: def.icon ?? undefined,
      description: def.description,
      focus: def.focus,
      effects: def.effects,
      isCurrent: true,
    },
  ]
})

const knownSkillDefs = computed(() =>
  player.skills.known
    .map(id => getSkillDefinition(id))
    .filter((skill): skill is NonNullable<ReturnType<typeof getSkillDefinition>> => skill !== null),
)

const realmSkillCap = computed(() => getRealmSkillLevelCap(player.cultivation.realm))

const equippedSlotsBySkill = computed<Record<string, number[]>>(() => {
  const map: Record<string, number[]> = {}
  player.skills.loadout.forEach((id, index) => {
    if (!id) return
    if (!map[id]) {
      map[id] = []
    }
    map[id].push(index)
  })
  return map
})

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
    const description = getSkillDescription(definition, level)
    const isDodgeSkill = Boolean(definition.dodgeConfig)
    const dodgeWindow = definition.dodgeConfig?.windowMs
    const statBlocks: SkillStatBlock[] = [
      isDodgeSkill
        ? {
            label: '无敌窗口',
            value: Number.isFinite(dodgeWindow) ? `${formatCooldownValue((dodgeWindow ?? 0) / 1000)}s` : '无',
            tone: 'multiplier',
          }
        : { label: '伤害倍率', value: formatMultiplierValue(definition.getDamageMultiplier(level)), tone: 'multiplier' },
      { label: '冷却', value: formatSkillCooldown(definition, level), tone: 'cooldown' },
      { label: '消耗', value: formatSkillCost(definition.cost), tone: 'cost' },
    ]
    const tags = buildSkillTags(definition, level)
    const equippedSlots = equippedSlotsBySkill.value[definition.id] ?? []
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
      description,
      statBlocks,
      tags,
      equippedSlots,
    }
  }),
)

function formatSkillCost(cost: SkillCost | undefined) {
  if (!cost || cost.type === 'none') return '无消耗'
  if (cost.type === 'qi') {
    const segments: string[] = []
    if (typeof cost.amount === 'number') {
      segments.push(`${cost.amount}`)
    }
    if (typeof cost.percentOfQiMax === 'number') {
      segments.push(`${Math.round(cost.percentOfQiMax * 100)}%`)
    }
    const detail = segments.length > 0 ? segments.join(' + ') : '0'
    return `${detail}斗气`
  }
  const amount = cost.amount ?? 0
  const typeLabel = (cost.type ?? 'none') as string
  return `${typeLabel.toUpperCase()} ${amount}`
}

function resolveSkillCooldown(definition: SkillDefinition, level: number): number | null {
  return definition.getCooldown(level)
}

function formatCooldownValue(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(Math.round(rounded)) : rounded.toFixed(1)
}

function formatSkillCooldown(definition: SkillDefinition, level: number): string {
  const cooldown = resolveSkillCooldown(definition, level)
  if (cooldown == null) {
    return '无冷却'
  }
  if (!Number.isFinite(cooldown) || cooldown <= 0) {
    return '无冷却'
  }
  return `${formatCooldownValue(cooldown)}s`
}

function formatMultiplierValue(value: number | undefined | null): string {
  if (!Number.isFinite(value ?? 0)) return '0%'
  const percent = Math.max(0, (value ?? 0) * 100)
  const rounded = Math.round(percent * 10) / 10
  return Number.isInteger(rounded) ? `${Math.round(rounded)}%` : `${rounded.toFixed(1)}%`
}

function resolveChargeTime(definition: SkillDefinition, level: number): number | undefined {
  if (typeof definition.getChargeTime === 'function') return definition.getChargeTime(level)
  return definition.chargeTime
}

function resolveAftercastTime(definition: SkillDefinition, level: number): number | undefined {
  if (typeof definition.getAftercastTime === 'function') return definition.getAftercastTime(level)
  return definition.aftercastTime
}

function buildSkillTags(definition: SkillDefinition, level: number): SkillTag[] {
  const tags: SkillTag[] = []
  const added = new Set<string>()
  const pushTag = (tag: SkillTag) => {
    if (added.has(tag.id)) return
    tags.push(tag)
    added.add(tag.id)
  }

  // Structured mechanics first
  definition.mechanics?.forEach((mechanic) => {
    pushTag({
      id: mechanic.id,
      label: mechanic.label,
      kind: mechanic.kind,
      value: mechanic.value,
    })
  })

  // Derive timing if missing in mechanics
  const charge = resolveChargeTime(definition, level)
  if (!added.has('charge') && Number.isFinite(charge) && (charge ?? 0) > 0) {
    pushTag({ id: 'charge', label: '蓄力', kind: 'timing', value: `${formatCooldownValue(charge ?? 0)}s` })
  }
  const aftercast = resolveAftercastTime(definition, level)
  if (!added.has('aftercast') && Number.isFinite(aftercast) && (aftercast ?? 0) > 0) {
    pushTag({ id: 'aftercast', label: '后摇', kind: 'timing', value: `${formatCooldownValue(aftercast ?? 0)}s` })
  }

  // Derive dodge if flagged via config and not already present
  if (!added.has('dodge') && definition.dodgeConfig) {
    const windowLabel = Number.isFinite(definition.dodgeConfig.windowMs)
      ? `${formatCooldownValue((definition.dodgeConfig.windowMs ?? 0) / 1000)}s`
      : undefined
    pushTag({ id: 'dodge', label: '闪避', kind: 'defense', value: windowLabel })
  }

  return tags
}

function equipSkillToSlot(skillId: string, slotIndex: number) {
  if (slotIndex < 0 || slotIndex >= player.skills.loadout.length) return
  player.equipSkill(slotIndex, skillId)
}

function unequipSkill(skillId: string) {
  player.skills.loadout.forEach((id, index) => {
    if (id === skillId) {
      player.equipSkill(index, null)
    }
  })
}
</script>

<template>
  <section class="panel">
    <h1 class="section-title">功法</h1>
    <div class="panel method-section">
      <h3 class="section-title method-heading">斗气功法</h3>
      <div v-if="cultivationMethods.length === 0" class="text-small text-muted">暂未掌握任何斗气功法。</div>
      <div v-else class="method-list">
        <CultivationMethodCard
          v-for="method in cultivationMethods"
          :key="method.id"
          :method="method"
        />
      </div>
    </div>

    <div class="panel" style="margin-top: 16px; background: rgba(255,255,255,0.04);">
      <h3 class="section-title" style="font-size: 16px;">技能列表</h3>
      <div v-if="knownSkillDetails.length === 0" class="text-small text-muted">暂未掌握任何技能。</div>
      <div v-else class="skill-list">
        <SkillCard
          v-for="skill in knownSkillDetails"
          :key="skill.definition.id"
          :id="skill.definition.id"
          :name="skill.definition.name"
          :icon="skill.definition.icon ?? null"
          :level="skill.level"
          :allowed-max="skill.allowedMax"
          :description="skill.description"
          :stats="skill.statBlocks"
          :tags="skill.tags"
          :xp-percent="skill.xpPercent"
          :xp-label="skill.xpLabel"
          :xp-cap-label="skill.xpCapLabel"
          :blocked-by-realm="skill.blockedByRealm"
          :equipped-slots="skill.equippedSlots"
          :slot-occupancy="player.skills.loadout"
          @equip="slotIndex => equipSkillToSlot(skill.definition.id, slotIndex)"
          @unequip="unequipSkill(skill.definition.id)"
        />
      </div>
    </div>
</section>
</template>

<style scoped>
.method-section {
  margin-top: 16px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.04);
}

.method-heading {
  font-size: 16px;
  margin-bottom: 12px;
}

.method-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(720px, 1fr));
  gap: 16px;
}

.skill-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 640px) {
  .skill-list {
    grid-template-columns: 1fr;
  }
}
</style>
