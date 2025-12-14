<script setup lang="ts">
import { computed } from 'vue'
import type { CultivationMethodDefinition, CultivationMethodEffectDefinition } from '@/data/cultivationMethods'
import type { QiFocusProfile } from '@/types/domain'

const props = defineProps<{
  method: Pick<CultivationMethodDefinition, 'id' | 'name' | 'icon' | 'description' | 'focus' | 'effects'> & {
    isCurrent?: boolean
  }
}>()

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

const focusLines = computed(() => buildFocusLines(props.method.focus))

type MethodEffectCard = CultivationMethodEffectDefinition & { locked?: boolean }

const effectCards = computed<MethodEffectCard[]>(() => {
  const base = (props.method.effects ?? []) as MethodEffectCard[]
  const locked: MethodEffectCard[] = [
    { id: 'locked-slot-1', title: '未解锁', body: '', locked: true },
    { id: 'locked-slot-2', title: '未解锁', body: '', locked: true },
  ]
  return [...base, ...locked]
})

function effectInitial(effect: CultivationMethodEffectDefinition): string {
  const char = effect.title?.trim()?.[0]
  if (!char) return '·'
  return char
}

</script>

<template>
  <article class="panel cultivation-card">
    <div class="watermark" />
    <div class="cultivation-card-inner">
      <div class="cultivation-left">
        <div class="cultivation-figure">
          <img
            v-if="method.icon"
            :src="method.icon"
            :alt="`${method.name} 图标`"
            class="cultivation-figure-img"
          >
          <div v-else class="cultivation-figure-placeholder">{{ method.name[0] }}</div>
        </div>
        <div class="focus-stack" :class="{ 'focus-stack--compact': focusLines.length >= 4 }">
          <span
            v-for="line in focusLines"
            :key="line"
            class="focus-chip"
            :class="{ 'focus-chip--compact': focusLines.length >= 4 }"
          >
            {{ line }}
          </span>
        </div>
      </div>

      <div class="cultivation-body">
        <header class="cultivation-header">
          <div class="title-wrap">
            <h4 class="cultivation-title">{{ method.name }}</h4>
            <span v-if="method.isCurrent" class="tag-current">当前运转</span>
          </div>
        </header>

        <p class="cultivation-description">
          {{ method.description }}
        </p>

        <div class="effect-list">
          <article
            v-for="effect in effectCards"
            :key="effect.id"
            class="effect-card"
            :class="{ locked: effect.locked }"
          >
            <div class="effect-top">
              <div class="effect-icon">
                <img
                  v-if="effect.icon && !effect.locked"
                  :src="effect.icon"
                  :alt="`${effect.title} 图标`"
                >
                <span v-else>{{ effect.locked ? '锁' : effectInitial(effect) }}</span>
              </div>
              <div class="effect-meta">
                <h5 class="effect-title">{{ effect.title }}</h5>
              </div>
            </div>
            <p class="effect-body">{{ effect.body }}</p>
          </article>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.cultivation-card {
  padding: 16px;
  position: relative;
  overflow: hidden;
}

.watermark {
  content: '';
  position: absolute;
  width: 420px;
  height: 260px;
  right: 24px;
  top: 24px;
  background: radial-gradient(circle at 60% 40%, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
  filter: blur(1px);
  opacity: 0.35;
  pointer-events: none;
  z-index: 0;
}

.cultivation-card-inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(260px, 20%) 1fr;
  gap: 24px;
  align-items: stretch;
}

.cultivation-left {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.cultivation-figure {
  position: relative;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  overflow: hidden;
  min-height: 260px;
  padding: 0px;
}

.cultivation-figure-img,
.cultivation-figure-placeholder {
  position: relative;
  z-index: 1;
  border-radius: 10px;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.cultivation-figure-placeholder {
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, rgba(90, 122, 255, 0.28), rgba(100, 255, 218, 0.2));
  color: #e8f3ff;
  font-size: 32px;
  font-weight: 700;
}

.focus-stack {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.focus-stack.focus-stack--compact {
  grid-template-columns: repeat(4, 1fr);
}

.focus-chip {
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  font-size: 13px;
  letter-spacing: 0.5px;
  text-align: center;
}

.focus-chip.focus-chip--compact {
  padding: 6px 8px;
  font-size: 12px;
  text-align: center;
}

.cultivation-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.cultivation-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cultivation-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.2;
}

.tag-current {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(255, 213, 79, 0.14);
  border: 1px solid rgba(255, 213, 79, 0.4);
  border-radius: 8px;
  color: #ffd54f;
  font-size: 13px;
  letter-spacing: 0.5px;
}

.cultivation-description {
  margin: 0;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.7;
  font-size: 16px;
}

.effect-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.effect-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 6px solid #d4af37;
  border-radius: 12px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
}

.effect-card.locked {
  opacity: 0.6;
  border-style: dashed;
  border-left-color: rgba(255, 255, 255, 0.3);
}

.effect-top {
  display: grid;
  grid-template-columns: 80px 1fr;
  align-items: center;
  gap: 12px;
}

.effect-icon {
  width: 80px;
  height: 80px;
  border-radius: 10px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(212, 175, 55, 0.18), rgba(255, 255, 255, 0.05));
  display: grid;
  place-items: center;
  color: #f4e5c3;
  font-weight: 800;
  font-size: 26px;
}

.effect-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.effect-meta {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 6px;
}

.effect-title {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
}

.effect-pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(212, 175, 55, 0.18);
  border: 1px solid rgba(212, 175, 55, 0.4);
  color: #f4e5c3;
  font-size: 11px;
  letter-spacing: 0.5px;
}

.effect-body {
  margin: 0;
  color: rgba(255, 255, 255, 0.82);
  line-height: 1.6;
  font-size: 15px;
}

@media (max-width: 880px) {
  .cultivation-card-inner {
    grid-template-columns: 1fr;
  }

  .cultivation-card {
    padding: 12px;
  }

  .watermark {
    width: 260px;
    height: 180px;
  }

  .cultivation-description {
    max-width: 100%;
  }

  .effect-list {
    grid-template-columns: 1fr;
  }

  .effect-card {
    grid-template-columns: 64px 1fr;
  }

  .effect-icon {
    width: 64px;
    height: 64px;
  }
}
</style>
