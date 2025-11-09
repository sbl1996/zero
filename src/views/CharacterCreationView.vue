<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { CULTIVATION_METHODS } from '@/data/cultivationMethods'
import type { CultivationMethodId, QiFocusProfile } from '@/types/domain'
import { usePlayerStore } from '@/stores/player'

const router = useRouter()
const player = usePlayerStore()
const { hasCharacter } = storeToRefs(player)

const name = ref(player.name || '阿斯塔')
const selectedMethod = ref<CultivationMethodId>(player.cultivation.method.id)

if (hasCharacter.value) {
  router.replace({ name: 'map' })
}

const NAME_MAX_LENGTH = 12

function formatFocusLines(focus: QiFocusProfile): string {
  const entries: string[] = []
  if (focus.atk) entries.push(`攻击 ${Math.round(focus.atk * 100)}%`)
  if (focus.def) entries.push(`防御 ${Math.round(focus.def * 100)}%`)
  if (focus.agi) entries.push(`敏捷 ${Math.round(focus.agi * 100)}%`)
  if (focus.recovery) entries.push(`恢复 ${Math.round((focus.recovery ?? 0) * 100)}%`)
  return entries.join(' · ')
}

const methodOptions = computed(() =>
  CULTIVATION_METHODS.map(method => ({
    ...method,
    focusLabel: formatFocusLines(method.focus),
    selected: selectedMethod.value === method.id,
  })),
)

const trimmedName = computed(() => name.value.trim())
const nameTooLong = computed(() => name.value.length > NAME_MAX_LENGTH)
const nameError = computed(() => {
  if (!trimmedName.value) return '请先输入角色姓名'
  if (nameTooLong.value) return `姓名长度需在 ${NAME_MAX_LENGTH} 字以内`
  return ''
})

const canSubmit = computed(() => trimmedName.value.length > 0 && !nameTooLong.value && Boolean(selectedMethod.value))

// 监听 name 的变化，确保不超过最大长度
function enforceMaxLength() {
  if (name.value.length > NAME_MAX_LENGTH) {
    name.value = name.value.slice(0, NAME_MAX_LENGTH)
  }
}

// 初始时也要检查
enforceMaxLength()

// 监听 name 的变化
watch(name, enforceMaxLength)

function handleSubmit() {
  if (!canSubmit.value) return
  player.initializeCharacter({
    name: trimmedName.value,
    methodId: selectedMethod.value,
  })
  router.replace({ name: 'map' })
}

function handleMethodChange(methodId: CultivationMethodId) {
  selectedMethod.value = methodId
}
</script>

<template>
  <section class="creation-wrapper">
    <div class="panel creation-panel">
      <header>
        <p class="lead">纪元 0 · 新的旅程即将开始</p>
        <h2>创建角色</h2>
        <p class="text-muted">先写下你的名讳，再从星魂大陆流传的斗气功法中选择一脉。</p>
      </header>

      <form class="creation-form" @submit.prevent="handleSubmit">
        <label class="field">
          <span class="field-label">姓名</span>
          <input
            class="field-input"
            type="text"
            v-model="name"
            :maxlength="NAME_MAX_LENGTH"
            placeholder="如：阿斯塔"
          >
          <small class="field-hint">{{ trimmedName.length }} / {{ NAME_MAX_LENGTH }}</small>
          <p v-if="nameError" class="field-error">{{ nameError }}</p>
        </label>

        <div class="field">
          <span class="field-label">斗气功法</span>
          <div class="method-grid">
            <label
              v-for="method in methodOptions"
              :key="method.id"
              class="method-card"
              :class="{ selected: method.selected }"
            >
              <input
                class="sr-only"
                type="radio"
                name="method"
                :value="method.id"
                :checked="method.selected"
                @change="handleMethodChange(method.id)"
              >
              <div class="method-header">
                <h3>{{ method.name }}</h3>
                <span class="method-focus">{{ method.focusLabel }}</span>
              </div>
              <p class="method-description">{{ method.description }}</p>
              <ul class="method-effects">
                <li v-for="effect in method.effects" :key="effect">{{ effect }}</li>
              </ul>
            </label>
          </div>
        </div>

        <button class="btn create-btn" type="submit" :disabled="!canSubmit">踏上旅程</button>
      </form>
    </div>
  </section>
</template>

<style scoped>
.creation-wrapper {
  min-height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.creation-panel {
  width: min(720px, 100%);
  padding: 32px;
}

.lead {
  margin: 0;
  color: rgba(255, 255, 255, 0.65);
  font-size: 14px;
}

.creation-panel h2 {
  margin: 6px 0 12px;
  font-size: 28px;
  letter-spacing: 2px;
}

.creation-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.field-label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
  color: #f5d06f;
}

.field-input {
  width: 100%;
  padding: 12px 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 16px;
}

.field-input:focus {
  outline: none;
  border-color: rgba(245, 208, 111, 0.6);
  box-shadow: 0 0 0 3px rgba(245, 208, 111, 0.2);
}

.field-hint {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.field-error {
  margin: 4px 0 0;
  color: #ff9393;
  font-size: 13px;
}

.method-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.method-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px;
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease, background 120ms ease;
}

.method-card:hover {
  border-color: rgba(245, 208, 111, 0.5);
  transform: translateY(-1px);
}

.method-card.selected {
  border-color: rgba(245, 208, 111, 0.9);
  background: rgba(245, 208, 111, 0.08);
}

.method-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.method-header h3 {
  margin: 0;
  font-size: 18px;
}

.method-focus {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
}

.method-description {
  margin: 12px 0;
  color: rgba(255, 255, 255, 0.75);
  font-size: 14px;
  min-height: 40px;
}

.method-effects {
  margin: 0;
  padding-left: 18px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
}

.method-effects li + li {
  margin-top: 4px;
}

.create-btn {
  align-self: flex-end;
  padding-inline: 32px;
}

.sr-only {
  position: absolute;
  opacity: 0;
  pointer-events: none;
  width: 0;
  height: 0;
}

@media (max-width: 640px) {
  .creation-panel {
    padding: 20px;
  }

  .creation-panel h2 {
    font-size: 22px;
  }

  .method-grid {
    grid-template-columns: 1fr;
  }

  .create-btn {
    width: 100%;
    align-self: stretch;
  }
}
</style>
