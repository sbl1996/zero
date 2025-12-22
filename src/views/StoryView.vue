<template>
  <div class="story-container" @click="advance">
    <!-- Cinematic Stage -->
    <div class="stage-wrapper">
      <div 
        class="stage-content" 
        :class="{ 'blur-effect': isBlurred, 'ken-burns': kenBurnsActive, 'shimmy-shake': isShaking }"
        :style="{ backgroundImage: `url(${currentBg})` }"
      >
        <!-- Location Toast -->
        <transition name="fade-slow">
          <div v-if="showLocationParams" class="location-toast">
            {{ locationName }}
          </div>
        </transition>

        <!-- System Toasts -->
        <div class="system-toasts">
             <transition-group name="toast-slide">
                <div v-for="toast in activeToasts" :key="toast.id" class="sys-toast">
                  {{ toast.message }}
                </div>
             </transition-group>
        </div>
      </div>

       <!-- Dialogue Interface (Inside Stage Wrapper) -->
       <transition name="slide-up">
        <div v-if="showDialogue" class="dialogue-box">
          <div class="portrait-container">
              <img :src="currentPortrait" alt="Portrait" class="portrait" />
          </div>
          <div class="text-content">
              <div v-if="currentSpeaker !== '旁白'" class="name-tag">{{ currentSpeaker }}</div>
              <div class="dialogue-text">{{ displayedText }}</div>
          </div>
           <div class="continue-indicator">
              <span class="blink">▼</span>
          </div>
          <!-- Placeholder Buttons -->
          <div class="dialogue-controls">
              <button class="control-btn">LOG</button>
          </div>
        </div>
      </transition>

      <div v-if="showOptions" class="options-panel">
        <button 
          v-for="opt in currentOptions" 
          :key="opt.id"
          class="option-btn"
          :class="{ disabled: opt.disabled }"
          @click="selectOption(opt)"
        >
          {{ opt.text }}
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'

// Assets
import bgTailings from '@/assets/cg-1.webp'
import bgRing from '@/assets/cg-2.webp'
import bgMonster from '@/assets/cg-3.webp'
import portraitMain from '@/assets/main-portrait.webp'

const router = useRouter()
const route = useRoute()

// --- Types ---
type SceneId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6'

interface DialogueLine {
  speaker: string
  text: string
  portrait?: string
}

// --- State ---
const activeScene = ref<SceneId>('S1')
const lineIndex = ref(0)
const showDialogue = ref(false)
const isBlurred = ref(false)
const kenBurnsActive = ref(false)
const isShaking = ref(false)
const locationName = ref('')
const showLocationParams = ref(false)
const showOptions = ref(false)

interface StoryOption {
    id: string
    text: string
    disabled?: boolean
    action: () => void
}
const currentOptions = ref<StoryOption[]>([])

// Toast System
interface Toast {
    id: number;
    message: string;
}
const activeToasts = ref<Toast[]>([])
let toastCounter = 0

// --- Data Content ---

const S1_LINES: DialogueLine[] = [
    { speaker: '旁白', text: '黎明前的矿坑像一口没熄的炉。' },
    { speaker: '旁白', text: '尾渣场堆满矿工丢弃的碎石与铁屑，风里全是硫与铁的味道。' },
    { speaker: '旁白', text: '他每天在这里翻找——只为了换一口面包，撑过今天。' }
]

const S2_LINES: DialogueLine[] = [
    { speaker: '旁白', text: '碎石里，有一样东西与矿渣不同。' },
    { speaker: '旁白', text: '一枚破损的戒指，冷得像骨头，却在掌心微微发烫。' },
    { speaker: '旁白', text: '戒指上的刻痕像残缺的符文，淡淡的蓝白光在尘埃中呼吸。' }
]

const S3_LINES: DialogueLine[] = [
    { speaker: '旁白', text: '他不该懂这种感觉。可胸口却本能地一紧——像有人在血里点了一盏灯。' }
]

const S4_LINES: DialogueLine[] = [
    { speaker: '旁白', text: '尾渣堆深处传来窸窣声。不是风。' },
    { speaker: '旁白', text: '有什么东西在靠近，嗅着那点微光。' }
]

const S5_LINES: DialogueLine[] = [
    { speaker: '守卫', text: '“谁在那里？”' },
    { speaker: '守卫', text: '“尾渣场不准靠近——最近有东西失踪。”' },
    { speaker: '旁白', text: '火把的光在雾里扫过来，像一只巨眼。' }
]

const S6_LINES: DialogueLine[] = [
    { speaker: '旁白', text: '他把戒指塞进衣襟，掌心仍然发烫。' },
    { speaker: '旁白', text: '前方是尾渣的黑路，身后是守卫的火光。' }
]

// --- Computed ---

const currentBg = computed(() => {
    if (activeScene.value === 'S1') return bgTailings
    if (activeScene.value === 'S2' || activeScene.value === 'S3') return bgRing
    if (activeScene.value === 'S4') return bgMonster
    if (activeScene.value === 'S5' || activeScene.value === 'S6') return bgTailings
    return ''
})

const currentSectionLines = computed(() => {
    switch (activeScene.value) {
        case 'S1': return S1_LINES
        case 'S2': return S2_LINES
        case 'S3': return S3_LINES
        case 'S4': return S4_LINES
        case 'S5': return S5_LINES
        case 'S6': return S6_LINES
        default: return []
    }
})

const currentLine = computed(() => {
    return currentSectionLines.value[lineIndex.value]
})

const displayedText = computed(() => currentLine.value?.text || '')
const currentSpeaker = computed(() => currentLine.value?.speaker || '???')
// 1x1 black pixel data URI
const blankPortrait = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

const currentPortrait = computed(() => {
    // If specific portrait is defined in line data (not currently used but good for future)
    if (currentLine.value?.portrait) return currentLine.value.portrait
    
    // Logic: If speaker is '旁白' (Narrator) OR '???' (Unknown MC?) -> Use Main Portrait?
    // Actually Narrator lines usually accompany scene description or MC inner monologue.
    // User request: "Other NPCs (e.g. Guard) ... use black background"
    // So '守卫' should be black.
    
    // We can default to mainPortrait for Narrator/MC, and blank for others.
    const s = currentSpeaker.value
    if (s === '旁白' || s === '???' || s === '我') {
        return portraitMain
    }
    
    return blankPortrait
})

// --- Actions ---

function advance() {
    if (showOptions.value) return
    if (lineIndex.value < currentSectionLines.value.length - 1) {
        lineIndex.value++
    } else {
        nextScene()
    }
}

function nextScene() {
    if (activeScene.value === 'S1') {
        transitionToS2()
    } else if (activeScene.value === 'S2') {
        transitionToS3()
    } else if (activeScene.value === 'S3') {
        goToCreation()
    } else if (activeScene.value === 'S4') {
        transitionToS5()
    } else if (activeScene.value === 'S5') {
        transitionToS6()
    } else if (activeScene.value === 'S6') {
        presentOptions()
    }
}

// --- Scene Sequences ---

// S1: Atmosphere
function startS1() {
   activeScene.value = 'S1'
   lineIndex.value = 0
   showDialogue.value = false
   
   setTimeout(() => {
       showLocationParams.value = true
       locationName.value = '【魔晶矿坑 · 尾渣场】'
       
       setTimeout(() => { showLocationParams.value = false }, 1700) 
       
       setTimeout(() => { showDialogue.value = true }, 550) 
   }, 200)
}

// S2: The Ring
function transitionToS2() {
   kenBurnsActive.value = true 
   
   setTimeout(() => {
       activeScene.value = 'S2' 
       lineIndex.value = 0
       kenBurnsActive.value = false 
   }, 1000)
}

// S3: Awakening
function transitionToS3() {
    activeScene.value = 'S3'
    lineIndex.value = 0
    
    scheduleToast('你获得：破损的戒指 ×1', 0)
    scheduleToast('一种陌生的“气”在体内流动（未稳定）。', 400)
    scheduleToast('解锁：斗气', 800)
}

function scheduleToast(msg: string, delay: number) {
    setTimeout(() => {
        activeToasts.value.push({ id: toastCounter++, message: msg })
        setTimeout(() => {
            activeToasts.value.shift()
        }, 3000) 
    }, delay)
}


// S4: Threat
function startS4() {
    activeScene.value = 'S4'
    lineIndex.value = 0
    showDialogue.value = true
    
    // Slight shake twice
    triggerShake()
    setTimeout(() => {
         triggerShake()
    }, 800)
}

function triggerShake() {
    isShaking.value = true
    setTimeout(() => { isShaking.value = false }, 160) // 2 * 80ms approx
}

// S5: Guard
function transitionToS5() {
    // Crossfade implies changing scene activeScene which changes BG
    activeScene.value = 'S5'
    lineIndex.value = 0
}

// S6: Goal & Options
function transitionToS6() {
    activeScene.value = 'S6'
    lineIndex.value = 0
    
    // Wait for last line to finish (handled by advance logic). 
    // Wait! nextScene() calls this when S5 is done.
    // So we just start S6.
    // However, options should show AFTER S6 lines are done.
    // So we need to modify advance() or nextScene() logic for S6?
    // Actually, checking advance() logic:
    // It calls nextScene() when lines are done. 
    // So if S6 lines are done, advance() calls nextScene().
    // We can handle S6 end in nextScene?
}

// Override nextScene for S6 handling manually here or add case
// Let's modify nextScene to handle S6 end -> Show Options
// But wait, the switch/case in nextScene handles transitions between scenes.
// S6 end means "End of Lines", so show options.

// Actually, I'll modify nextScene to handle S6.
// But wait, I can just watch lineIndex or check in advance()
// Let's stick to modifying nextScene.

// --- 
function goToCreation() {
    router.push({ name: 'character-create', query: { fromStory: 'true' } })
}

function presentOptions() {
    showOptions.value = true
    currentOptions.value = [
        { 
            id: 'c1', 
            text: '迎上去（进入战斗）', 
            disabled: true, 
            action: () => console.log('Fight not impl') 
        },
        { 
            id: 'c2', 
            text: '逃跑', 
            disabled: false, 
            action: () => finishStory() 
        }
    ]
}

function selectOption(opt: StoryOption) {
    if (opt.disabled) return
    opt.action()
}

function finishStory() {
    router.push({ name: 'map' })
}

onMounted(() => {
    if (route.query.phase === 'post-creation') {
         startS4()
    } else {
        startS1()
    }
})

</script>

<style scoped>
.story-container {
    width: 100%;
    height: 100%;
    background-color: #000;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    overflow: hidden;
    color: #fff;
    font-family: 'Inter', sans-serif;
}

/* Stage Area */
.stage-wrapper {
    position: relative; /* Relative for absolute children */
    
    width: 100%;
    aspect-ratio: 16/9;
    
    display: flex;
    justify-content: center;
    align-items: center;
    
    overflow: hidden;
    box-shadow: 0 0 30px rgba(0,0,0,0.8);
    z-index: 10;
    border: 1px solid #333;
}

.stage-content {
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    transition: background-image 0.25s linear, transform 1s ease-in-out; 
}

.ken-burns {
    transform: scale(1.1);
}

.blur-effect {
    filter: blur(2px);
}

/* Location Toast */
.location-toast {
    position: absolute;
    top: 40px;
    left: 40px;
    font-size: 1.2rem;
    font-weight: bold;
    color: rgba(255, 255, 255, 0.9);
    text-shadow: 0 2px 4px rgba(0,0,0,0.8);
    background: linear-gradient(90deg, rgba(0,0,0,0.4) 0%, transparent 100%);
    padding: 8px 16px;
    border-left: 3px solid #ffd700;
}

/* System Toasts */
.system-toasts {
    position: absolute;
    right: 40px;
    top: 40px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-end;
}

.sys-toast {
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 0.9rem;
    color: #4a9eff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

/* Dialogue Box */
.dialogue-box {
    position: absolute;
    bottom: 0px; 
    left: 0;
    right: 0;
    z-index: 20;
    
    /* 25% of the stage height */
    height: 25%;
    
    background: linear-gradient(to top, rgba(0, 10, 20, 0.95) 0%, rgba(0, 10, 20, 0.6) 100%);
    backdrop-filter: blur(2px);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    
    display: flex;
    align-items: center;
    padding: 0 24px; 
    gap: 24px;
}

.portrait-container {
    height: 80%; /* responsive to box height */
    aspect-ratio: 1;
    border-radius: 5px;
    overflow: hidden;
    flex-shrink: 0;
    border: 2px solid rgba(255,255,255,0.1);
    background: #111;
}

.portrait {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.text-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center; 
    height: 100%;
    padding-top: 5px;
}

.name-tag {
    font-size: 1.0rem;
    font-weight: 700;
    color: #aaa;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.dialogue-text {
    font-size: 1.15rem;
    line-height: 1.5;
    color: #eee;
    white-space: pre-wrap;
}

.continue-indicator {
    padding: 0 10px;
    font-size: 1.5rem;
    color: #4a9eff;
}

.blink {
    animation: blink 1s infinite;
}

@keyframes blink {
    0%, 100% { opacity: 0; transform: translateY(0); }
    50% { opacity: 1; transform: translateY(4px); }
}

.dialogue-controls {
    position: absolute;
    top: 10px;
    right: 16px;
    opacity: 0.5;
}

.control-btn {
    background: transparent;
    border: 1px solid #555;
    color: #888;
    font-size: 0.65rem;
    padding: 2px 6px;
    cursor: pointer;
}

/* Transitions */
.fade-slow-enter-active, .fade-slow-leave-active {
  transition: opacity 1.5s ease;
}
.fade-slow-enter-from, .fade-slow-leave-to {
  opacity: 0;
}

.toast-slide-enter-active {
  transition: all 0.4s ease-out;
}
.toast-slide-leave-active {
  transition: all 0.4s ease-in;
}
.toast-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-slide-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}

.slide-up-enter-active, .slide-up-leave-active {
    transition: transform 0.5s ease, opacity 0.5s ease;
}
.slide-up-enter-from, .slide-up-leave-to {
    transform: translateY(100%);
    transform: translateY(100%);
    opacity: 0;
}

.options-panel {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(400px, 80%);
}

.option-btn {
    background: rgba(0, 20, 40, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 16px 24px;
    color: #fff;
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 4px;
    text-align: center;
}

.option-btn:hover:not(.disabled) {
    background: rgba(0, 40, 80, 0.95);
    border-color: #4a9eff;
    transform: scale(1.02);
}

.option-btn.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: #222;
    color: #777;
}

/* Shake Animation */
@keyframes shake {
  0% { transform: translate(0, 0); }
  25% { transform: translate(-3px, 3px); }
  50% { transform: translate(3px, -3px); }
  75% { transform: translate(-3px, -3px); }
  100% { transform: translate(0, 0); }
}

.shimmy-shake {
    animation: shake 0.08s 2;
}
</style>
