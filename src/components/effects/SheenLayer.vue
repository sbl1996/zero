<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    active?: boolean
    duration?: number
    delay?: number
    color?: string
    blur?: number
  }>(),
  {
    active: true,
    duration: 1800,
    delay: 0,
    color: 'rgba(255, 255, 255, 0.55)',
    blur: 0,
  },
)

const styleVars = computed(() => ({
  '--sheen-duration': `${Math.max(400, props.duration)}ms`,
  '--sheen-delay': `${props.delay}ms`,
  '--sheen-color': props.color,
  '--sheen-blur': `${props.blur}px`,
}))
</script>

<template>
  <span
    v-if="props.active"
    class="sheen-layer"
    aria-hidden="true"
    :style="styleVars"
  />
</template>

<style scoped>
.sheen-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    120deg,
    transparent 10%,
    var(--sheen-color, rgba(255, 255, 255, 0.6)) 45%,
    transparent 70%
  );
  mask-image: linear-gradient(120deg, transparent 25%, rgba(0, 0, 0, 0.95) 50%, transparent 75%);
  mix-blend-mode: screen;
  filter: blur(var(--sheen-blur, 0));
  animation: sheen-slide var(--sheen-duration, 1800ms) linear infinite;
  animation-delay: var(--sheen-delay, 0ms);
  opacity: 0.85;
}

@keyframes sheen-slide {
  0% {
    transform: translateX(-55%) rotate(0.001deg);
  }
  100% {
    transform: translateX(55%) rotate(0.001deg);
  }
}
</style>
