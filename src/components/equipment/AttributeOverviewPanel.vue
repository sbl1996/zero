<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useCounterUp } from '@/composables/useCounterUp'
import type { AttributeOverviewEntry } from '@/composables/useEquipmentSelection'

const props = defineProps<{
  attributes: AttributeOverviewEntry[]
}>()

const controllers = new Map<AttributeOverviewEntry['key'], ReturnType<typeof useCounterUp>>()

function ensureController(key: AttributeOverviewEntry['key']) {
  if (!controllers.has(key)) {
    controllers.set(key, useCounterUp({ duration: 700, initialValue: 0 }))
  }
  return controllers.get(key)!
}

watch(
  () => props.attributes.map(attr => ({ key: attr.key, value: attr.value })),
  (entries) => {
    entries.forEach(({ key, value }) => {
      ensureController(key).animateTo(value ?? 0)
    })
  },
  { immediate: true, deep: true },
)

const displayAttributes = computed(() =>
  props.attributes.map((attr) => {
    const controller = ensureController(attr.key)
    return {
      ...attr,
      displayValue: controller.value.value,
    }
  }),
)

onBeforeUnmount(() => {
  controllers.forEach((controller) => controller.stop())
  controllers.clear()
})
</script>

<template>
  <section class="equipment-attribute-panel">
    <header class="equipment-attribute-panel__header">
      <h3>属性总览</h3>
      <p>数值即时更新</p>
    </header>

    <div class="equipment-attribute-panel__grid">
      <article
        v-for="attr in displayAttributes"
        :key="attr.key"
        class="attribute-card"
      >
        <div class="attribute-card__icon">{{ attr.icon }}</div>
        <div class="attribute-card__content">
          <p class="attribute-card__label">{{ attr.label }}</p>
          <p class="attribute-card__value">
            {{ attr.displayValue.toFixed(0) }}
          </p>
          <p
            class="attribute-card__delta"
            :class="{
              'attribute-card__delta--up': attr.delta > 0,
              'attribute-card__delta--down': attr.delta < 0,
            }"
          >
            <template v-if="attr.delta > 0">↑ +{{ attr.delta }}</template>
            <template v-else-if="attr.delta < 0">↓ {{ attr.delta }}</template>
            <template v-else>—</template>
          </p>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.equipment-attribute-panel {
  padding: 16px 20px;
  border-radius: 16px;
  background: linear-gradient(145deg, rgba(18, 24, 44, 0.95), rgba(6, 8, 16, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.08);
  width: 100%;
}

.equipment-attribute-panel__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.equipment-attribute-panel__header h3 {
  margin: 0;
  font-size: 16px;
  letter-spacing: 1px;
}

.equipment-attribute-panel__header p {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.equipment-attribute-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.attribute-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.attribute-card__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.attribute-card__label {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.attribute-card__value {
  margin: 2px 0;
  font-size: 20px;
  font-weight: 700;
}

.attribute-card__delta {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.attribute-card__delta--up {
  color: #7fe094;
}

.attribute-card__delta--down {
  color: #ff8a80;
}
</style>
