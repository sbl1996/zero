<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    level?: number
  }>(),
  {
    level: 0,
  },
)

const badgeTierClass = computed(() => `enhance-level__badge--tier${Math.floor(props.level / 5)}`)
const isMaxLevel = computed(() => props.level >= 15)
const starCount = computed(() => Math.max(0, props.level))
</script>

<template>
  <span class="enhance-level">
    <span
      class="enhance-level__badge"
      :class="[badgeTierClass, { 'enhance-level__badge--max': isMaxLevel }]"
    >
      <span class="enhance-level__number">+{{ level }}</span>
      <span class="enhance-level__stars">
        <span
          v-for="star in starCount"
          :key="star"
          class="enhance-level__star"
          :style="{ animationDelay: `${star * 0.1}s` }"
        >
          ★
        </span>
      </span>
    </span>
  </span>
</template>

<style scoped>
.enhance-level {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.enhance-level__label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.enhance-level__badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.15), rgba(100, 150, 255, 0.1));
  border: 1px solid rgba(100, 200, 255, 0.3);
  box-shadow: 0 2px 8px rgba(100, 200, 255, 0.2);
  transition: all 0.3s ease;
}

.enhance-level__badge--tier1 {
  background: linear-gradient(135deg, rgba(100, 255, 150, 0.2), rgba(50, 200, 100, 0.15));
  border-color: rgba(100, 255, 150, 0.4);
  box-shadow: 0 2px 12px rgba(100, 255, 150, 0.3);
}

.enhance-level__badge--tier2 {
  background: linear-gradient(135deg, rgba(200, 100, 255, 0.25), rgba(150, 50, 255, 0.2));
  border-color: rgba(200, 100, 255, 0.5);
  box-shadow: 0 3px 16px rgba(200, 100, 255, 0.4);
}

.enhance-level__badge--tier3 {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 165, 0, 0.25));
  border-color: rgba(255, 215, 0, 0.6);
  box-shadow: 0 4px 20px rgba(255, 215, 0, 0.5);
}

.enhance-level__badge--max {
  background: linear-gradient(135deg, rgba(255, 100, 255, 0.35), rgba(255, 50, 150, 0.3));
  border-color: rgba(255, 100, 255, 0.7);
  box-shadow: 0 4px 24px rgba(255, 100, 255, 0.6);
  animation: enhance-pulse 2s ease-in-out infinite;
}

@keyframes enhance-pulse {
  0%,
  100% {
    box-shadow: 0 4px 24px rgba(255, 100, 255, 0.6);
  }
  50% {
    box-shadow: 0 4px 32px rgba(255, 100, 255, 0.9);
  }
}

.enhance-level__number {
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.enhance-level__stars {
  display: inline-flex;
  gap: 1px;
}

.enhance-level__star {
  font-size: 10px;
  color: rgba(255, 215, 0, 0.9);
  text-shadow:
    0 0 2px rgba(255, 215, 0, 0.8),
    0 0 4px rgba(255, 215, 0, 0.5);
  animation: star-twinkle 1.5s ease-in-out infinite;
  display: inline-block;
}

@keyframes star-twinkle {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}
</style>
