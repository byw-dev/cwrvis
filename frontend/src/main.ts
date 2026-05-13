import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useMetaStore } from './stores/meta'
import './styles/variables.css'
import './styles/global.css'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

// Kick off meta.json fetch before mount so stores are ready
const metaStore = useMetaStore()
metaStore.init()

app.mount('#app')
