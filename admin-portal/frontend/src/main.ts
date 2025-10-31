import { createApp } from 'vue'
import { createPinia } from 'pinia'

// Element Plus components we actually use
import {
  ElAlert,
  ElButton,
  ElCard,
  ElCol,
  ElContainer,
  ElDescriptions,
  ElDescriptionsItem,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElHeader,
  ElIcon,
  ElImage,
  ElInput,
  ElLink,
  ElMain,
  ElOption,
  ElPagination,
  ElRow,
  ElSelect,
  ElSpace,
  ElTag,
  ElTimeline,
  ElTimelineItem,
  ElUpload
} from 'element-plus'

import App from './App.vue'
import router from './router'
import '@/styles/global.css'
import 'element-plus/dist/index.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

// Register Element Plus components individually
app
  .use(ElAlert)
  .use(ElButton)
  .use(ElCard)
  .use(ElCol)
  .use(ElContainer)
  .use(ElDescriptions)
  .use(ElDescriptionsItem)
  .use(ElDrawer)
  .use(ElEmpty)
  .use(ElForm)
  .use(ElFormItem)
  .use(ElHeader)
  .use(ElIcon)
  .use(ElImage)
  .use(ElInput)
  .use(ElLink)
  .use(ElMain)
  .use(ElOption)
  .use(ElPagination)
  .use(ElRow)
  .use(ElSelect)
  .use(ElSpace)
  .use(ElTag)
  .use(ElTimeline)
  .use(ElTimelineItem)
  .use(ElUpload)

app.mount('#app')
