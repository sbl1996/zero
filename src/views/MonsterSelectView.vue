<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { MONSTERS, PAGES, monstersByPage, getPageLevelRange } from '@/data/monsters'
import { useBattleStore } from '@/stores/battle'
import { usePlayerStore } from '@/stores/player'
import { useProgressStore } from '@/stores/progress'
import { useUiStore } from '@/stores/ui'
import PlayerStatusPanel from '@/components/PlayerStatusPanel.vue'
import type { AttributeKey } from '@/types/domain'

const router = useRouter()
const playerStore = usePlayerStore()
const ui = useUiStore()
const battle = useBattleStore()
const progress = useProgressStore()

const { unspentPoints, baseStats } = storeToRefs(playerStore)

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  ATK: '攻击力',
  DEF: '防御力',
}

// 属性分配相关状态
const showAttributePanel = ref(false)
const attributeAllocation = ref<Record<AttributeKey, number>>({
  ATK: 0,
  DEF: 0,
})

const attributeEntries = computed(() => Object.entries(attributeAllocation.value) as [AttributeKey, number][])

// 计算当前分配的总点数
const allocatedPoints = computed(() => {
  return Object.values(attributeAllocation.value).reduce((sum, val) => sum + val, 0)
})

// 计算分配后的预览属性
const previewStats = computed(() => {
  return {
    ATK: baseStats.value.ATK + attributeAllocation.value.ATK,
    DEF: baseStats.value.DEF + attributeAllocation.value.DEF,
  }
})

const selectedPage = computed(() => ui.monsterPage)
const visibleMonsters = computed(() => monstersByPage(selectedPage.value))

function pageLocked(page: number) {
  return !progress.isPageUnlocked(page)
}

// 属性分配相关函数
function openAttributePanel() {
  showAttributePanel.value = true
  // 重置分配
  attributeAllocation.value = {
    ATK: 0,
    DEF: 0,
  }
}

function closeAttributePanel() {
  showAttributePanel.value = false
  attributeAllocation.value = {
    ATK: 0,
    DEF: 0,
  }
}

function adjustAttribute(attr: AttributeKey, delta: number) {
  const newValue = attributeAllocation.value[attr] + delta
  if (newValue >= 0 && allocatedPoints.value + delta <= unspentPoints.value) {
    attributeAllocation.value[attr] = newValue
  }
}

function confirmAttributeAllocation() {
  if (playerStore.addAttributePoints(attributeAllocation.value)) {
    closeAttributePanel()
  }
}

function maximizeAttribute(attr: AttributeKey) {
  const remainingPoints = unspentPoints.value - allocatedPoints.value
  if (remainingPoints > 0) {
    attributeAllocation.value[attr] += remainingPoints
  }
}

function selectMonster(monsterId: string) {
  const monster = MONSTERS.find((m) => m.id === monsterId)
  if (!monster) return
  if (pageLocked(monster.page)) return
  battle.start(monster)
  router.push('/battle')
}
</script>

<template>
  <div class="monster-layout">
    <PlayerStatusPanel allow-allocation @open-allocate="openAttributePanel" />

    <section>
      <div class="panel">
        <div class="flex flex-between flex-center" style="margin-bottom: 16px;">
          <h2 class="section-title" style="margin-bottom: 0;">挑战怪物</h2>
          <div class="text-muted text-small">选择合适的怪物开始战斗</div>
        </div>
        <div class="tab-strip">
          <button
            v-for="page in PAGES"
            :key="page"
            class="tab-button"
            :class="{ active: selectedPage === page, locked: pageLocked(page) }"
            :disabled="pageLocked(page)"
            @click="ui.setMonsterPage(page)"
          >
            <span class="text-lv" :class="{ 'locked-text': pageLocked(page) }">
              {{ getPageLevelRange(page).min }}~{{ getPageLevelRange(page).max }}
            </span>
          </button>
        </div>
        <div class="card-grid">
          <article
            v-for="monster in visibleMonsters"
            :key="monster.id"
            class="monster-card"
            @click="selectMonster(monster.id)"
          >
            <h3>
              {{ monster.name }}
              <span v-if="monster.isBoss" class="badge" style="margin-left: 6px; background: rgba(255,80,120,0.4);">BOSS</span>
            </h3>
            <div class="text-small text-lv">LV {{ monster.lv }}</div>
            <div class="stats">
              <div>HP {{ monster.hpMax }}</div>
              <div>攻击力 {{ monster.atk }} / 防御力 {{ monster.def }}</div>
              <div>{{ monster.rewardExp }} EXP ・ {{ monster.rewardGold }} GOLD</div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 属性分配面板 -->
    <div v-if="showAttributePanel" class="attribute-panel-overlay" @click.self="closeAttributePanel">
      <div class="attribute-panel">
        <h2 class="panel-title">属性分配</h2>
        <div class="points-info">
          <div>可用点数: {{ unspentPoints }}</div>
          <div>已分配点数: {{ allocatedPoints }}</div>
          <div>剩余点数: {{ unspentPoints - allocatedPoints }}</div>
        </div>

        <div class="attribute-list">
          <div v-for="[attr, value] in attributeEntries" :key="attr" class="attribute-item">
            <div class="attribute-name">{{ ATTRIBUTE_LABELS[attr] }}</div>
            <div class="attribute-controls">
              <button @click="adjustAttribute(attr, -1)" :disabled="value <= 0">-</button>
              <span class="attribute-value">{{ value }}</span>
              <button @click="adjustAttribute(attr, 1)" :disabled="allocatedPoints >= unspentPoints">+</button>
              <button class="max-btn" @click="maximizeAttribute(attr)" :disabled="allocatedPoints >= unspentPoints">MAX</button>
            </div>
            <div class="attribute-preview">
              {{ ATTRIBUTE_LABELS[attr] }}：{{ baseStats[attr] }} + {{ value }} = {{ previewStats[attr] }}
            </div>
          </div>
        </div>

        <div class="panel-actions">
          <button class="btn btn-secondary" @click="closeAttributePanel">取消</button>
          <button class="btn btn-primary" @click="confirmAttributeAllocation" :disabled="allocatedPoints === 0">确认分配</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.locked-text {
  opacity: 0.4;
}
</style>
