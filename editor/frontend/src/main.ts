import { createApp } from "vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import { createPinia } from "pinia";

import App from "./App.vue";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(ElementPlus);

app.mount("#app");
