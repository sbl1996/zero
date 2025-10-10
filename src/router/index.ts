import { createRouter, createWebHashHistory } from 'vue-router'

const MonsterSelectView = () => import('@/views/MonsterSelectView.vue')
const BattleView = () => import('@/views/BattleView.vue')
const EquipmentView = () => import('@/views/EquipmentView.vue')
const BackpackView = () => import('@/views/BackpackView.vue')
const EnhanceView = () => import('@/views/EnhanceView.vue')
const ShopView = () => import('@/views/ShopView.vue')
const SkillView = () => import('@/views/SkillView.vue')

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'monsters', component: MonsterSelectView },
    { path: '/battle', name: 'battle', component: BattleView },
    { path: '/skills', name: 'skills', component: SkillView },
    { path: '/equipment', name: 'equipment', component: EquipmentView },
    { path: '/backpack', name: 'backpack', component: BackpackView },
    { path: '/enhance/:entryKey?', name: 'enhance', component: EnhanceView },
    { path: '/shop', name: 'shop', component: ShopView },
  ],
})
