import { createRouter, createWebHashHistory } from 'vue-router'

const BattleView = () => import('@/views/BattleView.vue')
const EquipmentView = () => import('@/views/EquipmentView.vue')
const BackpackView = () => import('@/views/BackpackView.vue')
const EnhanceView = () => import('@/views/EnhanceView.vue')
const ShopView = () => import('@/views/ShopView.vue')
const SkillView = () => import('@/views/SkillView.vue')
const MapView = () => import('@/views/MapView.vue')
const MeditationView = () => import('@/views/MeditationView.vue')
const WarriorGuildView = () => import('@/views/WarriorGuildView.vue')

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/map/florence' },
    { path: '/map/:mapId?', name: 'map', component: MapView },
    { path: '/battle', name: 'battle', component: BattleView },
    { path: '/skills', name: 'skills', component: SkillView },
    { path: '/equipment', name: 'equipment', component: EquipmentView },
    { path: '/backpack', name: 'backpack', component: BackpackView },
    { path: '/enhance/:entryKey?', name: 'enhance', component: EnhanceView },
    { path: '/shop', name: 'shop', component: ShopView },
    { path: '/meditation', name: 'meditation', component: MeditationView },
    { path: '/warrior-guild', name: 'warrior-guild', component: WarriorGuildView },
  ],
})
