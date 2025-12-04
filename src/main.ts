import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { setupPersistence } from './stores/persist'
import { usePlayerStore } from './stores/player'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
const playerStore = usePlayerStore(pinia)
setupPersistence(pinia)

router.beforeEach((to, _from, next) => {
  const hasCharacter = playerStore.hasCharacter
  if (!hasCharacter && to.name !== 'character-create') {
    next({ name: 'character-create' })
    return
  }
  if (hasCharacter && to.name === 'character-create') {
    next({ name: 'map' })
    return
  }
  if (hasCharacter && to.name === 'map') {
    const isMeditating = playerStore.res.recovery.mode === 'meditate'
    const activeCore = playerStore.res.activeCoreBoost
    const coreActive = Boolean(activeCore && activeCore.expiresAt > Date.now())
    if (isMeditating && coreActive) {
      const remainingSeconds = Math.max(1, Math.ceil((activeCore!.expiresAt - Date.now()) / 1000))
      const confirmed = typeof window === 'undefined'
        ? true
        : window.confirm(`晶核加成剩余约 ${remainingSeconds} 秒，切换到地图将中断冥想。确定要前往地图吗？`)
      if (!confirmed) {
        next(false)
        return
      }
    }
    if (isMeditating) {
      playerStore.setRecoveryModeKeepOperation('idle')
    }
  }
  next()
})

app.use(router)
app.mount('#app')
