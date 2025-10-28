<script setup lang="ts">
import { computed } from 'vue'
import type { LevelUpRewards, AttributeChange } from '@/stores/player'
import { getSkillDefinition } from '@/data/skills'

const props = defineProps<{
  rewards: LevelUpRewards | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const TIER_LABELS: Record<string | number, string> = {
  1: '一级',
  2: '二级',
  3: '三级',
  4: '四级',
  5: '五级',
  6: '六级',
  7: '七级',
  8: '八级',
  9: '九级',
  sanctuary: '圣域',
}

const PHASE_LABELS: Record<string, string> = {
  none: '',
  initial: '初阶',
  middle: '中阶',
  high: '高阶',
  peak: '巅峰',
  limit: '极限',
}

const ATTR_LABELS: Record<AttributeChange['key'], string> = {
  HP: '生命上限',
  QiMax: '斗气上限',
  ATK: '攻击',
  DEF: '防御',
  AGI: '敏捷',
  REC: '恢复',
}

function formatRealmLabel(stage: LevelUpRewards['previousRealm']) {
  const tierLabel = TIER_LABELS[stage.tier] ?? stage.tier
  const phase = PHASE_LABELS[stage.phase] ?? ''
  return phase ? `${tierLabel}战士 · ${phase}` : `${tierLabel}战士`
}

const realmChangeText = computed(() => {
  if (!props.rewards) return ''
  return `${formatRealmLabel(props.rewards.previousRealm)} → ${formatRealmLabel(props.rewards.currentRealm)}`
})

const attributeChanges = computed(() => props.rewards?.attributeChanges ?? [])

const unlockedSkills = computed(() => {
  if (!props.rewards) return []
  return props.rewards.unlockedSkills
    .map(id => getSkillDefinition(id))
    .filter((skill): skill is NonNullable<ReturnType<typeof getSkillDefinition>> => skill !== null)
})

const hasUnlockedSkills = computed(() => unlockedSkills.value.length > 0)

function close() {
  emit('close')
}
</script>

<template>
  <div v-if="rewards" class="levelup-overlay">
    <div class="levelup-modal panel">
      <header class="levelup-header">
        <div>
          <p class="levelup-subtitle">境界突破成功</p>
          <h3 class="levelup-title">{{ realmChangeText }}</h3>
        </div>
        <button class="btn btn-secondary" type="button" @click="close">
          继续前进
        </button>
      </header>

      <section class="levelup-section">
        <h4>属性变化</h4>
        <ul v-if="attributeChanges.length > 0" class="levelup-attributes">
          <li v-for="attr in attributeChanges" :key="attr.key">
            <span>{{ ATTR_LABELS[attr.key] }}</span>
            <span>
              {{ attr.before }} → {{ attr.after }}
              <strong v-if="attr.delta !== 0">(+{{ attr.delta }})</strong>
            </span>
          </li>
        </ul>
        <p v-else class="text-small text-muted">本次突破未带来可见的属性变化。</p>
      </section>

      <section class="levelup-section">
        <h4>新习得技能</h4>
        <div v-if="hasUnlockedSkills" class="levelup-skills">
          <article v-for="skill in unlockedSkills" :key="skill.id" class="levelup-skill-card">
            <img v-if="skill.icon" :src="skill.icon" :alt="skill.name">
            <div>
              <h5>{{ skill.name }}</h5>
              <p class="text-small text-muted">{{ skill.description }}</p>
            </div>
          </article>
        </div>
        <p v-else class="text-small text-muted">本次未习得新的技能，但境界提升将增强基础属性。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.levelup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 10, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 40;
  padding: 16px;
}

.levelup-modal {
  max-width: 640px;
  width: 100%;
  background: rgba(8, 12, 20, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.levelup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}

.levelup-title {
  margin: 4px 0 0;
  font-size: 20px;
}

.levelup-subtitle {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.1em;
  color: #8de6d5;
}

.levelup-section {
  margin-top: 16px;
}

.levelup-section h4 {
  margin: 0 0 8px;
  font-size: 15px;
  letter-spacing: 0.05em;
}

.levelup-attributes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.levelup-attributes li {
  display: flex;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
}

.levelup-attributes strong {
  color: #ffd166;
  margin-left: 4px;
  font-size: 13px;
}

.levelup-skills {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.levelup-skill-card {
  display: flex;
  gap: 12px;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
}

.levelup-skill-card img {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
}

.levelup-skill-card h5 {
  margin: 0;
  font-size: 15px;
}

.levelup-skill-card p {
  margin: 4px 0 0;
  line-height: 1.4;
}

@media (max-width: 600px) {
  .levelup-modal {
    max-height: 90vh;
    overflow-y: auto;
  }
}
</style>
