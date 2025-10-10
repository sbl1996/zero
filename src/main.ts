import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { setupPersistence } from './stores/persist'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
setupPersistence(pinia)
app.use(router)
app.mount('#app')
