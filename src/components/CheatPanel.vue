<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useProgressStore } from '@/stores/progress'
import { useUiStore } from '@/stores/ui'
import { useInventoryStore } from '@/stores/inventory'

const playerStore = usePlayerStore()
const progressStore = useProgressStore()
const inventory = useInventoryStore()
const ui = useUiStore()
const { showCheatPanel } = storeToRefs(ui)

const goldAmount = ref(1000)
const upgradingRealm = ref(false)
const shopEquipmentUnlocked = computed(() => ui.showShopEquipment)

const sanitizedGold = computed(() => {
  const value = Math.floor(goldAmount.value)
  return Number.isFinite(value) && value > 0 ? value : 0
})

const isRealmMaxed = computed(() => {
  const realm = playerStore.cultivation.realm
  return realm.tier === 'sanctuary' && realm.phase === 'limit'
})

function close() {
  ui.toggleCheatPanel(false)
}

function restoreFull() {
  playerStore.restoreFull()
}

function grantGold() {
  if (sanitizedGold.value <= 0) return
  playerStore.gainGold(sanitizedGold.value)
}

function unlockAllMonsters() {
  progressStore.clearAllMonsters()
}

function deleteSave() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.clear()
  } catch (error) {
    console.warn('[cheat] failed to clear localStorage', error)
  }
  window.location.reload()
}

async function advanceRealmDirectly() {
  if (upgradingRealm.value || isRealmMaxed.value) return
  upgradingRealm.value = true
  try {
    await playerStore.cheatAdvanceRealm()
  } finally {
    upgradingRealm.value = false
  }
}

function fillBasePower() {
  playerStore.cheatFillBasePower()
}

function grantEnhanceGems() {
  const amount = 999
  ;['blessGem', 'soulGem', 'miracleGem'].forEach((id) => inventory.addItem(id, amount))
}

function toggleShopEquipmentSale() {
  ui.toggleShopEquipment()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="showCheatPanel" class="cheat-overlay" @click.self="close">
      <div class="cheat-panel">
        <header class="cheat-header">
          <h2 class="section-title" style="margin-bottom: 0;">金手指</h2>
          <button class="cheat-close" type="button" @click="close">×</button>
        </header>

        <p class="cheat-subtitle">调试用：快速调整玩家状态</p>

        <div class="cheat-body">
          <div class="cheat-column">
            <section class="cheat-card">
              <div class="cheat-card__header">
                <h3>快速操作</h3>
                <span v-if="isRealmMaxed" class="cheat-chip">已达最高境界</span>
              </div>
              <div class="cheat-actions">
                <button class="btn" type="button" @click="restoreFull">回复全满</button>
                <button class="btn" type="button" @click="unlockAllMonsters">解锁全部地图</button>
                <button class="btn" type="button" @click="fillBasePower">斗气本源拉满</button>
                <button class="btn" type="button" @click="toggleShopEquipmentSale">
                  {{ shopEquipmentUnlocked ? '隐藏高品质装备售卖' : '解锁高品质装备售卖' }}
                </button>
                <button
                  class="btn"
                  type="button"
                  :disabled="upgradingRealm || isRealmMaxed"
                  @click="advanceRealmDirectly"
                >
                  直接突破下一境界
                </button>
              </div>
            </section>

            <section class="cheat-card">
              <div class="cheat-card__header">
                <h3>强化/资源</h3>
              </div>
              <div class="cheat-resource-grid">
                <div class="cheat-gold">
                  <label for="cheat-gold-input">获得 GOLD</label>
                  <div class="cheat-gold-controls">
                    <input
                      id="cheat-gold-input"
                      v-model.number="goldAmount"
                      class="cheat-input"
                      type="number"
                      min="1"
                      step="100"
                    >
                    <button class="btn" type="button" :disabled="sanitizedGold <= 0" @click="grantGold">增加</button>
                  </div>
                  <div class="text-small text-muted">当前 GOLD：{{ playerStore.gold }}</div>
                </div>

                <div class="cheat-gems">
                  <p class="cheat-gems__title">强化材料</p>
                  <p class="text-small text-muted">一次获取祝福/灵魂/奇迹宝石各 999</p>
                  <button class="btn" type="button" @click="grantEnhanceGems">领取强化宝石</button>
                </div>
              </div>
            </section>
          </div>

          <div class="cheat-column cheat-column--narrow">
            <section class="cheat-card cheat-card--danger">
              <div class="cheat-card__header">
                <h3>危险操作</h3>
              </div>
              <div class="cheat-danger">
                <button class="btn btn-danger" type="button" @click="deleteSave">删除存档</button>
                <p class="text-small text-muted" style="margin: 6px 0 0;">清空本地存档并刷新页面</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cheat-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  z-index: 999;
  padding: 24px;
}

.cheat-panel {
  width: min(880px, 100%);
  background: linear-gradient(145deg, rgba(12, 16, 28, 0.95), rgba(6, 8, 14, 0.92));
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
  padding: 18px 20px;
  color: #fff;
}

.cheat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cheat-close {
  background: transparent;
  color: #fff;
  border: none;
  font-size: 20px;
  cursor: pointer;
}

.cheat-subtitle {
  margin: 6px 0 12px;
  color: rgba(255, 255, 255, 0.7);
}

.cheat-body {
  display: grid;
  grid-template-columns: minmax(380px, 1.6fr) minmax(280px, 1fr);
  gap: 14px;
}

.cheat-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cheat-column--narrow {
  align-self: start;
}

.cheat-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cheat-card--danger {
  border-color: rgba(255, 138, 128, 0.4);
  background: rgba(255, 138, 128, 0.08);
}

.cheat-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.cheat-card__header h3 {
  margin: 0;
}

.cheat-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(127, 224, 148, 0.16);
  color: #7fe094;
  font-size: 12px;
  border: 1px solid rgba(127, 224, 148, 0.4);
}

.cheat-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
}

.cheat-resource-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}

.cheat-gold,
.cheat-gems {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cheat-gold label,
.cheat-gems__title {
  font-weight: 700;
  margin: 0;
}

.cheat-gold-controls {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.cheat-input {
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

.cheat-gems .btn {
  width: fit-content;
}

.cheat-danger {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn {
  border-radius: 10px;
}

.btn-danger {
  background: linear-gradient(135deg, #ff8a80, #e53935);
  border: none;
}

@media (max-width: 540px) {
  .cheat-panel {
    padding: 16px;
  }

  .cheat-body {
    grid-template-columns: 1fr;
  }
}
</style>
