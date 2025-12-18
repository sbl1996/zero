<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useBattleStore } from '@/stores/battle'
import { ITEMS, isItemConsumedOnUse, isTeleportItem, quickConsumableIds } from '@/data/items'
import { resolveItemIcon } from '@/utils/itemIcon'
import { travelToMap } from '@/utils/travel'
import { maps } from '@/data/maps'
import StatusQuickItemBar from '@/components/StatusQuickItemBar.vue'
import type { CultivationEnvironment } from '@/composables/useLeveling'

const props = withDefaults(defineProps<{
  tickEnvironment?: CultivationEnvironment
  autoTick?: boolean
}>(), {
  tickEnvironment: 'idle',
  autoTick: true,
})

const playerStore = usePlayerStore()
const inventory = useInventoryStore()
const battle = useBattleStore()

const { res, finalStats, gold, equipStats, cultivation } = storeToRefs(playerStore)

const hpRate = computed(() => (res.value.hpMax > 0 ? res.value.hp / res.value.hpMax : 0))
const qiRate = computed(() => (res.value.qiMax > 0 ? res.value.qi / res.value.qiMax : 0))
const hpRecoveryText = computed(() => formatRecoveryPerSecond(res.value.recovery?.hpPerSecond))
const qiRecoveryText = computed(() => formatRecoveryPerSecond(res.value.recovery?.qiPerSecond))
const warmupPercent = computed(() => Math.round((res.value.operation?.fValue ?? 0) * 100))
const isMeditating = computed(() => res.value.recovery.mode === 'meditate')
const bpCurrent = computed(() => Math.round(cultivation.value.bp.current))
const realmInfo = computed(() => cultivation.value.realm)
const isWarmingUp = computed(() => warmupPercent.value > 0 && warmupPercent.value < 100)

const PHASE_LABELS: Record<string, string> = {
  none: '无',
  initial: '初阶',
  middle: '中阶',
  high: '高阶',
  peak: '巅峰',
  limit: '极限',
}

const REALM_LABELS: Record<string | number, string> = {
  1: '一级',
  2: '二级',
  3: '三级',
  4: '四级',
  5: '五级',
  6: '六级',
  7: '七级',
  8: '八级',
  9: '九级',
  'sanctuary': '圣域',
}

function startQi() {
  if (isMeditating.value) return
  playerStore.setRecoveryMode('run')
  playerStore.startQiOperation()
}

function stopQi() {
  playerStore.stopQiOperation()
}

const qiProgressDisabled = computed(() => isMeditating.value || isWarmingUp.value)
const qiProgressActive = computed(() => !isMeditating.value && warmupPercent.value >= 100)
const qiProgressLabel = computed(() => {
  const percentText = `${warmupPercent.value}%`
  if (isMeditating.value) return '冥想中'
  if (warmupPercent.value === 0) return `点击运转斗气`
  if (isWarmingUp.value) return `预热中 · ${percentText}`
  return `点击停止运转`
})

function formatRecoveryPerSecond(rate: number | undefined | null) {
  const value = (rate ?? 0).toFixed(1)
  const sign = parseFloat(value) >= 0 ? '+' : ''
  return `（${sign}${value}/s）`
}

function handleQiProgressClick() {
  if (qiProgressDisabled.value) return
  if (isMeditating.value) return
  if (warmupPercent.value === 0) {
    startQi()
    return
  }
  stopQi()
}

const realmLabel = computed(() => {
  const realm = realmInfo.value
  const realmName = REALM_LABELS[realm.tier] ?? realm.tier
  const phase = realm.phase && realm.phase !== 'none' ? `${PHASE_LABELS[realm.phase] ?? realm.phase}` : ''
  return `${realmName}战士 ${phase}`
})

const bpRangeMax = computed(() => Math.round(cultivation.value.bp.range.max))
const bpProgressPercent = computed(() => {
  const bp = cultivation.value.bp
  const span = Math.max(bp.range.max - bp.range.min, 1)
  const progress = (bp.current - bp.range.min) / span
  const clamped = Math.min(Math.max(progress, 0), 1)
  return Math.round(clamped * 100)
})

let qiTickTimer: ReturnType<typeof setInterval> | null = null
let lastTickTs: number | null = null

onMounted(() => {
  lastTickTs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  if (!props.autoTick) return
  qiTickTimer = setInterval(() => {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    const delta = Math.min(Math.max(((now - (lastTickTs || now)) / 1000), 0), 0.25)
    lastTickTs = now
    if (!battle.inBattle && delta > 0) {
      const environment: CultivationEnvironment = props.tickEnvironment ?? 'idle'
      playerStore.tickCultivation(delta, { environment, inBattle: false, bossBattle: false })
    }
  }, 200)
})

onBeforeUnmount(() => {
  if (qiTickTimer) {
    clearInterval(qiTickTimer)
    qiTickTimer = null
  }
})

const attributeRows = computed(() => {
  const entries = [
    { key: 'ATK', label: '攻击', equipKey: 'addATK' },
    { key: 'DEF', label: '防御', equipKey: 'addDEF' },
    { key: 'AGI', label: '敏捷', equipKey: 'addAGI' },
    { key: 'REC', label: '恢复', equipKey: 'addREC' },
  ] as const

  return entries.map(({ key, label, equipKey }) => {
    const finalValue = Math.floor(finalStats.value.totals[key] ?? 0)
    const equipBonus = Math.floor(equipKey ? (equipStats.value[equipKey] ?? 0) : 0)
    return {
      key,
      label,
      finalValue,
      equipBonus,
    }
  })
})

// 计算可用的消耗品道具
const statusQuickBarLocked = computed(() => isMeditating.value)

const mapNameLookup = new Map(maps.map((map) => [map.id, map.name]))

const statusQuickConsumables = computed(() => {
  const { hp, hpMax, qi, qiMax } = res.value
  const needsHp = hp < hpMax
  const needsQi = qi < qiMax

  return ITEMS.filter(item => quickConsumableIds.has(item.id)).map(item => {
    const quantity = inventory.quantity(item.id)
    const consumedOnUse = isItemConsumedOnUse(item)
    const isTeleport = isTeleportItem(item)
    const healsHp = 'heal' in item && typeof item.heal === 'number' && item.heal > 0 && needsHp
    const restoresQi = 'restoreQi' in item && typeof item.restoreQi === 'number' && item.restoreQi > 0 && needsQi
    const effectApplies = isTeleport || healsHp || restoresQi
    const hasStock = quantity > 0
    const canUse = hasStock && effectApplies && !battle.inBattle && !statusQuickBarLocked.value
    const quantityLabel = consumedOnUse ? `×${quantity}` : (hasStock ? '∞' : '×0')
    const teleportTargetName = isTeleport && item.teleportToMapId
      ? (mapNameLookup.get(item.teleportToMapId) ?? item.teleportToMapId)
      : null

    return {
      ...item,
      quantity,
      quantityLabel,
      showQuantity: consumedOnUse || !hasStock,
      canUse,
      disabled: !canUse,
      locked: statusQuickBarLocked.value,
      icon: resolveItemIcon(item.id),
      consumedOnUse,
      teleportTargetName,
    }
  })
})

// 使用道具函数（仅在非战斗状态使用）
async function useItem(itemId: string) {
  if (statusQuickBarLocked.value) return
  const item = statusQuickConsumables.value.find(i => i.id === itemId)
  if (!item || item.disabled || !quickConsumableIds.has(itemId)) return

  // 非战斗状态下的道具使用逻辑
  const used = inventory.spend(itemId, 1)
  if (!used) return

  const result = await playerStore.useItem(itemId)
  if (!result.applied) {
    if (item.consumedOnUse) {
      inventory.addItem(itemId, 1)
    }
    return
  }

  if (result.teleportToMapId) {
    travelToMap(result.teleportToMapId)
  }
}

</script>

<template>
  <aside class="panel">
    <h2 class="section-title">角色状态</h2>
    <div class="flex flex-between gap-sm">
      <div>
        <div>{{ realmLabel }}</div>
      </div>
      <div class="text-right">
        <div>{{ gold }} G</div>
      </div>
    </div>
    <div style="margin-top: 16px;">
      <div class="resource-bar" style="margin-bottom: 10px;">
        <span class="resource-hp" :style="{ width: `${Math.floor(hpRate * 100)}%` }" />
      </div>
      <div class="text-small text-muted">生命 {{ Math.round(res.hp) }} / {{ Math.round(res.hpMax) }} {{ hpRecoveryText }}</div>

      <div class="resource-bar" style="margin: 14px 0 10px;">
        <span class="resource-qi" :style="{ width: `${Math.floor(qiRate * 100)}%` }" />
      </div>
      <div class="text-small text-muted">斗气 {{ Math.round(res.qi) }} / {{ Math.round(res.qiMax) }} {{ qiRecoveryText }}</div>

      <div class="resource-bar resource-bar--bp" style="margin: 14px 0 10px;">
        <span class="resource-bp" :style="{ width: `${bpProgressPercent}%` }" />
      </div>
      <div class="text-small text-muted">本源 {{ bpCurrent }} / {{ bpRangeMax }} ({{ bpProgressPercent }}%)</div>
    </div>

    <div class="attribute-section">
      <div class="qi-controls">
        <button
          class="qi-progress"
          type="button"
          :class="{
            disabled: qiProgressDisabled,
            'qi-progress--active': qiProgressActive,
            'qi-progress--meditate': isMeditating,
          }"
          :disabled="qiProgressDisabled"
          @click="handleQiProgressClick"
        >
          <span class="qi-progress__bar" :style="{ width: `${warmupPercent}%` }" />
          <span class="qi-progress__label">
            {{ qiProgressLabel }}
          </span>
        </button>
      </div>
      <table class="stat-table">
        <tbody>
          <tr v-for="stat in attributeRows" :key="stat.key">
            <td>{{ stat.label }}</td>
            <td class="stat-value">
              <span class="stat-final">{{ stat.finalValue }}</span>
              <span
                class="stat-equip"
                :class="{
                  'stat-equip--positive': stat.equipBonus > 0,
                  'stat-equip--negative': stat.equipBonus < 0,
                  'stat-equip--zero': stat.equipBonus === 0,
                }"
              >
                ({{ stat.equipBonus >= 0 ? `+${stat.equipBonus}` : stat.equipBonus }})
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel" style="margin-top: 20px; padding: 10px; background: rgba(255,255,255,0.04);">
      <!-- <h3 class="section-title" style="font-size: 16px; margin-top: 0;">快捷道具栏</h3> -->
      <StatusQuickItemBar
        :items="statusQuickConsumables"
        :locked="statusQuickBarLocked"
        @use="useItem"
      />
    </div>

    <slot />
  </aside>
</template>

<style scoped>
.stat-value {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.stat-equip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.stat-equip--positive {
  color: #5ad398;
}

.stat-equip--negative {
  color: #ff7b7b;
}

.stat-equip--zero {
  color: rgba(255, 255, 255, 0.45);
}

.qi-controls {
  display: flex;
  margin: 12px 0 16px;
}

.qi-progress {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
}

.qi-progress.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.qi-progress--active {
  border-color: rgba(90, 211, 152, 0.9);
  background: rgba(90, 211, 152, 0.12);
}

.qi-progress--meditate {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
}

.qi-progress__bar {
  position: absolute;
  inset: 0;
  width: 0;
  background: linear-gradient(135deg, rgba(90, 211, 152, 0.85), rgba(84, 149, 255, 0.85));
  transition: width 0.3s ease;
}

.qi-progress__label {
  position: relative;
  z-index: 1;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.attribute-section {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.attribute-title {
  font-size: 16px;
  margin-bottom: 12px;
}

.resource-bp {
  background: linear-gradient(90deg, rgba(80, 180, 255, 0.9), rgba(130, 90, 255, 0.85));
}

/* 响应式调整 */
@media (max-width: 768px) {
  .qi-progress {
    height: 36px;
    font-size: 13px;
  }
}
</style>
