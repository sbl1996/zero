<script setup lang="ts">
import { computed, ref } from 'vue'
import PaperDollSlot from '@/components/equipment/PaperDollSlot.vue'
import type { PaperDollSlotState } from '@/types/paperDoll'

const props = defineProps<{
  slots: PaperDollSlotState[]
  selectedKey: PaperDollSlotState['key'] | null
}>()

const emit = defineEmits<{
  (e: 'select', key: PaperDollSlotState['key']): void
}>()

const hoveredKey = ref<PaperDollSlotState['key'] | null>(null)
const activeKey = computed(() => hoveredKey.value ?? props.selectedKey)

function handleSelect(key: PaperDollSlotState['key']) {
  emit('select', key)
}

function handleHover(key: PaperDollSlotState['key']) {
  hoveredKey.value = key
}

function clearHover() {
  hoveredKey.value = null
}
</script>

<template>
  <section class="paper-doll">
    <div class="paper-doll__silhouette" :class="{ 'paper-doll__silhouette--active': Boolean(activeKey) }">
      <div class="paper-doll__silhouette-glow" />
    </div>

    <div class="paper-doll__slots">
      <div
        v-for="slot in props.slots"
        :key="slot.key"
        class="paper-doll__slot-wrapper"
        :class="`paper-doll__slot-wrapper--${slot.key}`"
      >
        <PaperDollSlot
          :slot="slot"
          :selected="props.selectedKey === slot.key"
          @select="handleSelect"
          @hover="handleHover"
          @leave="clearHover"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.paper-doll {
  position: relative;
  height: 100%;
  min-height: 0;
  padding: 48px 24px 72px;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: radial-gradient(circle at 50% 25%, rgba(36, 42, 66, 0.4), rgba(8, 10, 18, 0.9));
  overflow: hidden;
}

.paper-doll__silhouette {
  position: absolute;
  inset: 80px 180px 110px;
  border-radius: 200px;
  background: linear-gradient(180deg, rgba(12, 16, 28, 0.4), rgba(0, 0, 0, 0.9));
  filter: drop-shadow(0 0 32px rgba(0, 0, 0, 0.6));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.paper-doll__silhouette-glow {
  position: absolute;
  width: 160px;
  height: 160px;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.18), transparent 70%);
  filter: blur(12px);
  opacity: 0.5;
  transition: opacity 0.2s ease;
}

.paper-doll__silhouette--active .paper-doll__silhouette-glow {
  opacity: 0.9;
}

.paper-doll__slots {
  position: relative;
  width: 100%;
  height: 100%;
  z-index: 3;
}

.paper-doll__slot-wrapper {
  position: absolute;
  transform: translate(-50%, -50%);
}

.paper-doll__slot-wrapper--helmet {
  top: 11%;
  left: 50%;
}

.paper-doll__slot-wrapper--shieldL {
  top: 32%;
  left: 15%;
}

.paper-doll__slot-wrapper--weaponR {
  top: 32%;
  left: 85%;
}

.paper-doll__slot-wrapper--armor {
  top: 53%;
  left: 50%;
}

.paper-doll__slot-wrapper--ring1 {
  top: 82%;
  left: 15%;
}

.paper-doll__slot-wrapper--ring2 {
  top: 82%;
  left: 85%;
}

.paper-doll__slot-wrapper--weapon2H {
  top: 94%;
  left: 50%;
}

.paper-doll__slot-wrapper--weaponR,
.paper-doll__slot-wrapper--ring2 {
  text-align: right;
}

.paper-doll__slot-wrapper--shieldL,
.paper-doll__slot-wrapper--armor,
.paper-doll__slot-wrapper--ring1 {
  text-align: left;
}

@media (max-width: 960px) {
  .paper-doll {
    min-height: 480px;
    padding: 36px 16px 64px;
  }

  .paper-doll__silhouette {
    inset: 64px 140px 100px;
  }
}

@media (max-width: 720px) {
  .paper-doll {
    padding-bottom: 320px;
  }

  .paper-doll__slot-wrapper {
    position: static;
    transform: none !important;
    margin: 12px auto;
  }

  .paper-doll__slots {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 280px;
  }
}
</style>
