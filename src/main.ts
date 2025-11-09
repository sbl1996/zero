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
  next()
})

app.use(router)
app.mount('#app')
