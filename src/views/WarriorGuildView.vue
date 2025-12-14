<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import PlayerStatusPanel from '@/components/PlayerStatusPanel.vue'
import { usePlayerStore } from '@/stores/player'
import { getSkillDefinition, getSkillDescription } from '@/data/skills'
import { getPurchaseCourses } from '@/data/skillUnlocks'
import type { SkillCost, SkillDefinition } from '@/types/domain'
import type { PurchaseCourseDefinition } from '@/data/skillUnlocks'

interface GuildCourseViewModel extends PurchaseCourseDefinition {
  skillDefinition: SkillDefinition | null
  cooldownText: string
  alreadyKnown: boolean
  meetsRequirement: boolean
  canAfford: boolean
  purchaseDisabled: boolean
  requiredTierLabel: string
  description: string | null
}

const playerStore = usePlayerStore()
const { gold, cultivation, skills } = storeToRefs(playerStore)

const knownSkills = computed(() => skills.value.known)

const realmTier = computed(() => {
  const tier = cultivation.value.realm.tier
  return typeof tier === 'number' ? tier : null
})

const tierLabels: Record<number, string> = {
  1: '一级',
  2: '二级',
  3: '三级',
  4: '四级',
  5: '五级',
  6: '六级',
  7: '七级',
  8: '八级',
  9: '九级',
}

const currentTierLabel = computed(() => {
  const tier = cultivation.value.realm.tier
  if (typeof tier === 'number') {
    return tierLabels[tier] ?? `${tier}级`
  }
  if (tier === 'sanctuary') return '圣域'
  return '未知'
})

const guildCourses = computed<GuildCourseViewModel[]>(() => {
  const methodId = cultivation.value.method.id
  const currentTier = realmTier.value ?? 0
  const courses = getPurchaseCourses(methodId)
  return courses.map((course) => {
    const skillId = course.skillId
    const skillDefinition = getSkillDefinition(skillId)
    const cooldown = skillDefinition?.getCooldown(1)
    const cooldownText = typeof cooldown === 'number' ? `${cooldown.toFixed(1)} s` : '无冷却'
    const description = skillDefinition ? getSkillDescription(skillDefinition, 1) : null
    const alreadyKnown = knownSkills.value.includes(skillId)
    const meetsRequirement = currentTier >= course.requiredTier
    const canAfford = gold.value >= course.price
    const requiredTierLabel = tierLabels[course.requiredTier] ?? `${course.requiredTier}级`
    return {
      ...course,
      skillId,
      skillDefinition,
      cooldownText,
      alreadyKnown,
      meetsRequirement,
      canAfford,
      purchaseDisabled: alreadyKnown || !meetsRequirement || !canAfford,
      requiredTierLabel,
      description,
    }
  })
})

const feedback = ref<{ skillId: string; message: string; kind: 'info' | 'success' | 'error' } | null>(null)

function setFeedback(skillId: string, message: string, kind: 'info' | 'success' | 'error') {
  feedback.value = { skillId, message, kind }
}

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

function attemptPurchase(course: GuildCourseViewModel) {
  const tierLabel = course.requiredTierLabel
  if (course.alreadyKnown) {
    setFeedback(course.skillId, '你已经掌握了这项技能。', 'info')
    return
  }
  if (!course.meetsRequirement) {
    setFeedback(course.skillId, `需要达到${tierLabel}战士才能学习。`, 'error')
    return
  }
  if (!course.canAfford) {
    setFeedback(course.skillId, `资金不足，需要 ${course.price} G。`, 'error')
    return
  }
  const spent = playerStore.spendGold(course.price)
  if (!spent) {
    setFeedback(course.skillId, '支付失败，请检查资金。', 'error')
    return
  }
  playerStore.unlockSkill(course.skillId)
  const emptyIndex = playerStore.skills.loadout.findIndex((slot) => slot === null)
  if (emptyIndex !== -1) {
    playerStore.equipSkill(emptyIndex, course.skillId)
  }
}
</script>

<template>
  <div class="guild-scene">
    <div class="guild-overlay" />
    <div class="guild-content">
      <PlayerStatusPanel class="guild-status" :auto-tick="false" />
      <section class="panel guild-panel">
        <header class="guild-header">
          <div>
            <h2 class="section-title">战士公会</h2>
            <p class="text-muted text-small">
              帝国骑士团在此传授正统战技。满足境界要求并花费金币，便可习得新的战斗技巧。
            </p>
          </div>
          <div class="guild-balance">
            <span class="text-small text-muted">当前持有</span>
            <span class="guild-balance__value">{{ gold }} G</span>
          </div>
        </header>

        <article
          v-for="course in guildCourses"
          :key="course.skillId"
          class="panel guild-course"
        >
          <header class="guild-course__header">
            <div class="guild-course__icon">
              <img
                v-if="course.skillDefinition?.icon"
                :src="course.skillDefinition.icon"
                :alt="course.skillDefinition.name"
              >
              <span v-else>⚔️</span>
            </div>
            <div>
              <h3 class="guild-course__title">{{ course.skillDefinition?.name ?? '未知战技' }}</h3>
              <p class="guild-course__subtitle text-small text-muted">
                {{ course.description ?? '战士公会提供的进阶战技课程。' }}
              </p>
            </div>
          </header>

          <dl class="guild-course__stats">
            <div>
              <dt>消耗</dt>
              <dd>{{ formatSkillCost(course.skillDefinition?.cost) }}</dd>
            </div>
            <div>
              <dt>冷却</dt>
              <dd>{{ course.cooldownText }}</dd>
            </div>
            <div>
              <dt>学费</dt>
              <dd>{{ course.price }} G</dd>
            </div>
          </dl>

          <ul class="guild-course__requirements">
            <li :class="{ met: course.meetsRequirement, unmet: !course.meetsRequirement }">
              战士等级 ≥ {{ course.requiredTierLabel }}（当前：{{ currentTierLabel }}）
            </li>
            <li :class="{ met: course.canAfford, unmet: !course.canAfford }">
              支付 {{ course.price }} G
            </li>
          </ul>

          <button
            class="btn"
            :class="{ disabled: course.purchaseDisabled }"
            :disabled="course.purchaseDisabled"
            type="button"
            @click="attemptPurchase(course)"
          >
            {{ course.alreadyKnown ? '已掌握' : '学习技能' }}
          </button>

          <p
            v-if="feedback?.skillId === course.skillId"
            class="guild-feedback"
            :class="{
              success: feedback.kind === 'success',
              error: feedback.kind === 'error',
              info: feedback.kind === 'info'
            }"
          >
            {{ feedback.message }}
          </p>
        </article>
        <p class="text-small text-muted">
          公会公告：后续将逐步开放更高等的战技课程，敬请期待。
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.guild-scene {
  position: relative;
  min-height: 100%;
  padding: 24px;
  box-sizing: border-box;
  background: url('@/assets/scene-warrior-guild.webp') center / cover no-repeat;
}

.guild-overlay {
  position: absolute;
  inset: 0;
  background: rgba(6, 10, 18, 0.62);
}

.guild-content {
  position: relative;
  display: grid;
  grid-template-columns: minmax(320px, 360px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.guild-status {
  background: rgba(12, 18, 28, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(4px);
}

.guild-panel {
  background: rgba(12, 18, 28, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(4px);
}

.guild-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.guild-balance {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.guild-balance__value {
  font-size: 18px;
  font-weight: 600;
  color: #ffd166;
}

.guild-course {
  margin: 0 0 16px 0;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.guild-course__header {
  display: flex;
  gap: 16px;
  align-items: center;
  margin-bottom: 16px;
}

.guild-course__icon {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #f0f0f0;
  overflow: hidden;
}

.guild-course__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.guild-course__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.guild-course__subtitle {
  margin: 4px 0 0 0;
  line-height: 1.5;
}

.guild-course__stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  margin: 0 0 16px 0;
}

.guild-course__stats div {
  background: rgba(0, 0, 0, 0.3);
  padding: 8px 12px;
  border-radius: 8px;
}

.guild-course__stats dt {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.guild-course__stats dd {
  margin: 4px 0 0 0;
  font-weight: 600;
  font-size: 14px;
  color: #f0f0f0;
}

.guild-course__requirements {
  list-style: none;
  padding: 0;
  margin: 0 0 16px 0;
  display: grid;
  gap: 8px;
}

.guild-course__requirements li {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.3);
}

.guild-course__requirements li.met {
  border: 1px solid rgba(76, 201, 191, 0.7);
  color: #8de6d5;
}

.guild-course__requirements li.unmet {
  border: 1px solid rgba(244, 114, 182, 0.4);
  color: #f7b2d9;
}

.btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.guild-feedback {
  margin: 12px 0 0 0;
  font-size: 13px;
}

.guild-feedback.success {
  color: #8de6d5;
}

.guild-feedback.error {
  color: #f56c6c;
}

.guild-feedback.info {
  color: #f0f0f0;
}

@media (max-width: 960px) {
  .guild-content {
    grid-template-columns: 1fr;
  }

  .guild-status {
    order: 2;
  }
}
</style>
