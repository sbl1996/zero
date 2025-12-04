<template>
  <section class="panel">
    <h2 class="section-title">商店</h2>

    <div class="flex flex-between flex-center" style="margin-top: 16px;">
      <p class="text-muted text-small" style="margin: 0;">当前持有</p>
      <div class="text-gold" style="font-size: 16px;">{{ player.gold }} G</div>
    </div>

    <div class="tab-strip" style="margin-top: 16px;">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="tab-button"
        :class="{ active: activeTab === tab }"
        style="color: #fff; font-weight: 600;"
        @click="activeTab = tab"
      >
        {{ tab }}
      </button>
    </div>

    <div class="shop-items-grid" style="margin-top: 16px;">
      <article
        v-for="item in currentItems"
        :key="item.id"
        class="panel item-card"
        style="background: rgba(255,255,255,0.04); grid-column: auto; grid-row: auto;"
      >
        <div class="flex gap-md">
          <div class="item-icon">
            <template v-for="icon in [getItemIcon(item)]" :key="icon.type">
              <template v-if="icon.type === 'image'">
                <img
                  class="item-icon__img"
                  :src="icon.src"
                  :alt="icon.alt || item.name"
                >
              </template>
              <template v-else>
                {{ icon.text }}
              </template>
            </template>
          </div>
          <div class="flex-1">
            <h3 style="margin: 0 0 8px 0; font-size: 16px;">
              <template v-if="'slot' in item">
                <span class="shop-item-name" :style="{ color: getItemQualityColor(item) }">{{ item.name }}</span>
                <span
                  v-if="getItemQualityLabel(item)"
                  class="shop-quality-tag"
                  :style="{ borderColor: getItemQualityColor(item), color: getItemQualityColor(item) }"
                >
                  {{ getItemQualityLabel(item) }}
                </span>
              </template>
              <template v-else>
                {{ item.name }}
              </template>
            </h3>
            <div class="text-small text-muted" style="margin-bottom: 8px;">{{ getItemDescription(item) }}</div>
            <div
              v-if="getItemRequiredRealmLabel(item)"
              class="text-small"
              style="color: #ffc107; margin-bottom: 8px;"
            >
              需求境界：{{ getItemRequiredRealmLabel(item) }}
            </div>
            <div class="text-small" style="color: #ffc107; margin-bottom: 8px;">单价：{{ getItemPrice(item) }} G</div>
            <div class="quantity-row">
              <label class="quantity-label" :for="`quantity-${item.id}`">数量</label>
              <input
                :id="`quantity-${item.id}`"
                class="quantity-input"
                type="number"
                min="1"
                step="1"
                v-model.number="purchaseQuantities[item.id]"
                @blur="normalizeQuantity(item.id)"
              />
              <span class="total-price">总价：{{ getTotalPrice(item) }} G</span>
            </div>
            <button
              class="btn"
              :class="{ disabled: !canAfford(item) }"
              :disabled="!canAfford(item)"
              @click="buyItem(item)"
            >
              购买
            </button>
          </div>
        </div>
      </article>
    </div>

    <div
      v-if="purchaseMessage"
      class="purchase-message"
      :class="{ success: purchaseSuccess, error: !purchaseSuccess }"
    >
      {{ purchaseMessage }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useProgressStore } from '@/stores/progress'
import { useUiStore } from '@/stores/ui'
import { ITEMS, consumableIds } from '@/data/items'
import { BASE_EQUIPMENT_TEMPLATES, instantiateEquipment } from '@/data/equipment'
import { MONSTER_BLUEPRINTS } from '@/data/monsters'
import { formatRealmTierLabel, realmTierIndex } from '@/utils/realm'
import { formatEquipmentStat, formatEquipmentSubstats, getEquipmentQualityMeta } from '@/utils/equipmentStats'
import { resolveEquipmentIcon } from '@/utils/equipmentIcons'
import { resolveItemIcon } from '@/utils/itemIcon'
import type { ItemDefinition, EquipmentTemplate, EquipSlot } from '@/types/domain'
import type { ItemIcon } from '@/utils/itemIcon'

const playerStore = usePlayerStore()
const inventoryStore = useInventoryStore()
const progressStore = useProgressStore()
const uiStore = useUiStore()

const equipmentTabs = ['武器', '防具', '饰品', '盾牌']
const baseTabs = ['消耗品', '宝石']
const showShopEquipment = computed(() => uiStore.showShopEquipment)
const tabs = computed(() => [...equipmentTabs, ...baseTabs])
const activeTab = ref(tabs.value[0] ?? '消耗品')
const purchaseMessage = ref('')
const purchaseSuccess = ref(false)
const purchaseQuantities = reactive<Record<string, number | string>>({})

const player = computed(() => playerStore.$state)

function getEquipmentSubType(slot: EquipSlot): 'weapon' | 'armor' | 'accessory' | 'shield' {
  switch (slot) {
    case 'weaponR':
    case 'weapon2H':
      return 'weapon'
    case 'helmet':
    case 'armor':
      return 'armor'
    case 'ring':
      return 'accessory'
    case 'shieldL':
      return 'shield'
    default:
      return 'armor'
  }
}

const allowedEquipmentTemplates = computed(() =>
  BASE_EQUIPMENT_TEMPLATES.filter((template) => {
    const requiredTier = realmTierIndex(template.requiredRealmTier)
    if (requiredTier > 2) return false
    if (template.quality === 'normal') return true
    return showShopEquipment.value
  }),
)

const bossMonsters = MONSTER_BLUEPRINTS.filter((monster) => monster.rank === 'boss')

function hasClearedBossAtOrAboveTier(tier: number) {
  return bossMonsters.some((monster) => {
    const monsterTier = realmTierIndex(monster.realmTier)
    return monsterTier >= tier && progressStore.isMonsterCleared(monster.id)
  })
}

const gemItems = computed(() => {
  const itemsById = new Map(ITEMS.map((item) => [item.id, item]))
  const result: ItemDefinition[] = []
  const bless = itemsById.get('blessGem')
  if (bless) result.push(bless)

  if (hasClearedBossAtOrAboveTier(3)) {
    const soul = itemsById.get('soulGem')
    if (soul) result.push(soul)
  }

  if (hasClearedBossAtOrAboveTier(6)) {
    const miracle = itemsById.get('miracleGem')
    if (miracle) result.push(miracle)
  }

  return result
})

const currentItems = computed(() => {
  const equipmentTemplates = allowedEquipmentTemplates.value
  switch (activeTab.value) {
    case '消耗品':
      return ITEMS.filter((item) => consumableIds.has(item.id))
    case '宝石':
      return gemItems.value
    case '武器':
      return equipmentTemplates.filter((template) => getEquipmentSubType(template.slot) === 'weapon')
    case '防具':
      return equipmentTemplates.filter((template) => getEquipmentSubType(template.slot) === 'armor')
    case '饰品':
      return equipmentTemplates.filter((template) => getEquipmentSubType(template.slot) === 'accessory')
    case '盾牌':
      return equipmentTemplates.filter((template) => getEquipmentSubType(template.slot) === 'shield')
    default:
      return []
  }
})

watch(tabs, (list) => {
  if (!list.includes(activeTab.value)) {
    activeTab.value = list[0] ?? ''
  }
}, { immediate: true })

watch(currentItems, (items) => {
  items.forEach((item) => {
    const current = purchaseQuantities[item.id]
    if (typeof current !== 'number' || !Number.isFinite(current) || current < 1) {
      purchaseQuantities[item.id] = 1
    }
  })
}, { immediate: true })

const iconCache = new Map<string, ItemIcon>()

const getItemIcon = (item: ItemDefinition | EquipmentTemplate): ItemIcon => {
  const cached = iconCache.get(item.id)
  if (cached) return cached

  let resolved: ItemIcon
  if ('slot' in item) {
    const equipment = instantiateEquipment(item, { id: item.id, level: 0 })
    resolved = resolveEquipmentIcon(equipment)
  } else {
    resolved = resolveItemIcon(item.id)
  }

  iconCache.set(item.id, resolved)
  return resolved
}

const getItemQualityMeta = (item: ItemDefinition | EquipmentTemplate) => {
  if ('slot' in item) {
    return getEquipmentQualityMeta(item.quality)
  }
  return null
}

const getItemQualityLabel = (item: ItemDefinition | EquipmentTemplate) => {
  return getItemQualityMeta(item)?.label ?? ''
}

const getItemQualityColor = (item: ItemDefinition | EquipmentTemplate) => {
  return getItemQualityMeta(item)?.color ?? ''
}

const getItemDescription = (item: ItemDefinition | EquipmentTemplate) => {
  if ('slot' in item) {
    const statEntries = [
      formatEquipmentStat(item.baseMain),
      ...formatEquipmentSubstats(item.baseSubstats ?? []),
    ].filter(Boolean)
    const statsText = statEntries.join('，')
    if (item.description) {
      return statsText ? `${item.description}｜${statsText}` : item.description
    }
    return statsText
  }
  if ('description' in item && item.description) return item.description
  if ('usage' in item) return item.usage
  return ''
}

const getItemPrice = (item: ItemDefinition | EquipmentTemplate) => {
  if ('slot' in item) {
    return item.price?.buy ?? item.price?.sell ?? 0
  }
  return item.price ?? 0
}

const getItemRequiredRealmLabel = (item: ItemDefinition | EquipmentTemplate) => {
  if ('slot' in item && item.requiredRealmTier !== undefined) {
    return formatRealmTierLabel(item.requiredRealmTier)
  }
  return ''
}

const resolveQuantity = (id: string) => {
  const current = purchaseQuantities[id]
  if (typeof current !== 'number' || !Number.isFinite(current)) {
    return 1
  }
  const floored = Math.floor(current)
  return floored > 0 ? floored : 1
}

const normalizeQuantity = (id: string) => {
  purchaseQuantities[id] = resolveQuantity(id)
  return purchaseQuantities[id]
}

const getTotalPrice = (item: ItemDefinition | EquipmentTemplate) => {
  return getItemPrice(item) * resolveQuantity(item.id)
}

const canAfford = (item: ItemDefinition | EquipmentTemplate) => {
  return player.value.gold >= getTotalPrice(item)
}

const buyItem = (item: ItemDefinition | EquipmentTemplate, rawQuantity?: number) => {
  const price = getItemPrice(item)
  const quantity = typeof rawQuantity === 'number' ? Math.max(1, Math.floor(rawQuantity)) : normalizeQuantity(item.id)
  const totalPrice = price * quantity

  if (player.value.gold < totalPrice) {
    showPurchaseMessage('金币不足', false)
    return
  }

  if (!playerStore.spendGold(totalPrice)) {
    showPurchaseMessage('金币不足', false)
    return
  }

  if ('slot' in item) {
    const timestamp = Date.now()
    for (let index = 0; index < quantity; index += 1) {
      const equipment = instantiateEquipment(item, {
        level: 0,
        id: `${item.id}-shop-${timestamp}-${index}`,
      })
      inventoryStore.addEquipment(equipment, { markNew: true })
    }
  } else {
    // 所有非装备类物品（药水、传送石、晶核等）都作为堆叠物品加入背包
    inventoryStore.addItem(item.id, quantity)
  }

  purchaseQuantities[item.id] = quantity

  const successMessage = quantity > 1 ? `购买成功 x${quantity}` : '购买成功'
  showPurchaseMessage(successMessage, true)
}

const showPurchaseMessage = (message: string, success: boolean) => {
  purchaseMessage.value = message
  purchaseSuccess.value = success
  setTimeout(() => {
    purchaseMessage.value = ''
  }, 2000)
}

</script>

<style scoped>
.shop-items-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.shop-items-grid .item-card {
  margin: 0;
}

.item-card {
  transition: all 0.3s ease;
}

.shop-item-name {
  font-weight: 600;
}

.shop-quality-tag {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  margin-left: 8px;
}

.item-card:hover {
  transform: translateY(-2px);
  background: rgba(255,255,255,0.08) !important;
}

.item-icon {
  font-size: 32px;
  width: 50px;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.25);
  border-radius: 8px;
  flex-shrink: 0;
}

.item-icon__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
}

.btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn:not(.disabled):hover {
  transform: scale(1.05);
}

.quantity-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.quantity-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.quantity-input {
  width: 72px;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  -moz-appearance: textfield;
}

.quantity-input::-webkit-outer-spin-button,
.quantity-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.total-price {
  margin-left: auto;
  font-size: 12px;
  color: #ffc107;
}

.purchase-message {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 16px 32px;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  z-index: 1000;
  animation: fadeInOut 2s ease;
}

.purchase-message.success {
  background: rgba(40, 167, 69, 0.9);
  color: white;
}

.purchase-message.error {
  background: rgba(220, 53, 69, 0.9);
  color: white;
}

@keyframes fadeInOut {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
  20% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
}
</style>
