<template>
  <el-card shadow="never" class="music-editor">
    <template #header>
      <div class="toolbar">
        <div class="toolbar__actions">
          <el-button type="primary" @click="uploadDialogVisible = true">
            <el-icon><Upload /></el-icon>
            上传音乐
          </el-button>
          <el-button @click="loadMusicList">
            <el-icon><Refresh /></el-icon>
            刷新列表
          </el-button>
        </div>
        <div class="toolbar__info">共 {{ musicList.length }} 个音乐文件</div>
      </div>
    </template>

    <el-table
      :data="musicList"
      v-loading="loading"
      stripe
      class="music-table"
    >
      <el-table-column prop="filename" label="文件名" min-width="300">
        <template #default="{ row }">
          <div class="filename-cell">
            <el-icon class="file-icon"><Headset /></el-icon>
            {{ row.filename }}
          </div>
        </template>
      </el-table-column>

      <el-table-column label="大小" width="120">
        <template #default="{ row }">
          {{ formatSize(row.size) }}
        </template>
      </el-table-column>

      <el-table-column label="预览" width="100">
        <template #default="{ row }">
          <el-button
            size="small"
            circle
            @click="previewMusic(row.filename)"
            :type="currentPlaying === row.filename ? 'primary' : 'default'"
          >
            <el-icon>
              <Headset />
            </el-icon>
          </el-button>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-popconfirm
            title="确定要删除这个音乐文件吗？"
            @confirm="deleteMusic(row.filename)"
          >
            <template #reference>
              <el-button size="small" type="danger" circle>
                <el-icon><Delete /></el-icon>
              </el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 音频播放器控制面板 -->
    <div v-if="currentPlaying" class="music-player">
      <div class="player-header">
        <div class="player-title">
          <el-icon><Headset /></el-icon>
          <span>{{ currentPlaying }}</span>
        </div>
        <el-button size="small" circle @click="closePlayer">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
      
      <div class="player-controls">
        <el-button circle @click="togglePlayPause">
          <el-icon>
            <VideoPlay v-if="isPaused" />
            <VideoPause v-else />
          </el-icon>
        </el-button>
        
        <div class="progress-section">
          <span class="time-label">{{ formatTime(currentTime) }}</span>
          <div class="slider-wrapper">
            <div 
              v-for="(range, index) in bufferedRanges" 
              :key="index"
              class="buffer-bar" 
              :style="{ 
                left: (range.start / duration * 100) + '%',
                width: ((range.end - range.start) / duration * 100) + '%' 
              }"
            ></div>
            <el-slider
              v-model="currentTime"
              :max="duration"
              :show-tooltip="false"
              @change="onSeekEnd"
              @input="onSeeking"
              class="progress-slider"
            />
          </div>
          <span class="time-label">{{ formatTime(duration) }}</span>
        </div>
        
        <div class="volume-section">
          <el-icon class="volume-icon"><Microphone /></el-icon>
          <el-slider
            v-model="volume"
            :max="100"
            :show-tooltip="false"
            @input="updateVolume"
            class="volume-slider"
          />
          <span class="volume-label">{{ volume }}%</span>
        </div>
      </div>
    </div>

    <!-- 音频播放器（隐藏） -->
    <audio 
      ref="audioPlayer"
      preload="auto"
      @ended="onPlayEnded"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @play="isPaused = false"
      @pause="isPaused = true"
      @progress="onProgress"
    ></audio>

    <!-- 上传对话框 -->
    <el-dialog
      v-model="uploadDialogVisible"
      title="上传音乐文件"
      width="500px"
    >
      <el-upload
        drag
        :auto-upload="false"
        :on-change="handleFileSelect"
        :limit="1"
        accept=".mp3"
        :file-list="fileList"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          拖拽文件到此处或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">仅支持 MP3 格式音频文件</div>
        </template>
      </el-upload>

      <template #footer>
        <el-button @click="uploadDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          @click="confirmUpload"
          :loading="uploading"
          :disabled="!selectedFile"
        >
          确认上传
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Upload,
  Refresh,
  Delete,
  Headset,
  VideoPlay,
  VideoPause,
  UploadFilled,
  Close,
  Microphone,
} from '@element-plus/icons-vue'
import { musicApi } from '../api/music'

interface MusicFile {
  filename: string
  size: number
  path: string
}

const loading = ref(false)
const musicList = ref<MusicFile[]>([])
const uploadDialogVisible = ref(false)
const uploading = ref(false)
const selectedFile = ref<File | null>(null)
const fileList = ref([])
const currentPlaying = ref<string | null>(null)
const audioPlayer = ref<HTMLAudioElement>()
const isPaused = ref(true)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(80)
const isSeeking = ref(false)
const bufferProgress = ref(0)
const bufferedRanges = ref<Array<{ start: number; end: number }>>([])

const VOLUME_STORAGE_KEY = 'music-editor-volume'

const loadSavedVolume = () => {
  const saved = localStorage.getItem(VOLUME_STORAGE_KEY)
  if (saved !== null) {
    const savedVolume = parseInt(saved, 10)
    if (!isNaN(savedVolume) && savedVolume >= 0 && savedVolume <= 100) {
      volume.value = savedVolume
    }
  }
}

const saveVolume = (value: number) => {
  localStorage.setItem(VOLUME_STORAGE_KEY, value.toString())
}

const loadMusicList = async () => {
  loading.value = true
  try {
    musicList.value = await musicApi.list()
  } catch (error) {
    ElMessage.error('加载音乐列表失败')
    console.error(error)
  } finally {
    loading.value = false
  }
}

const handleFileSelect = (file: any) => {
  selectedFile.value = file.raw
}

const confirmUpload = async () => {
  if (!selectedFile.value) return

  uploading.value = true
  try {
    await musicApi.upload(selectedFile.value)
    ElMessage.success('上传成功')
    uploadDialogVisible.value = false
    selectedFile.value = null
    fileList.value = []
    await loadMusicList()
  } catch (error: any) {
    ElMessage.error(error.response?.data?.detail || '上传失败')
  } finally {
    uploading.value = false
  }
}

const deleteMusic = async (filename: string) => {
  try {
    await musicApi.delete(filename)
    ElMessage.success('删除成功')
    await loadMusicList()
  } catch (error) {
    ElMessage.error('删除失败')
    console.error(error)
  }
}

const togglePlay = (filename: string) => {
  if (!audioPlayer.value) return

  if (currentPlaying.value === filename) {
    audioPlayer.value.pause()
    currentPlaying.value = null
  } else {
    audioPlayer.value.src = musicApi.getStreamUrl(filename)
    audioPlayer.value.play()
    currentPlaying.value = filename
  }
}

const previewMusic = (filename: string) => {
  if (!audioPlayer.value) return
  
  if (currentPlaying.value === filename) {
    return
  }
  
  // 重置播放状态
  currentTime.value = 0
  duration.value = 0
  bufferedRanges.value = []
  bufferProgress.value = 0
  
  currentPlaying.value = filename
  audioPlayer.value.src = musicApi.getStreamUrl(filename)
  audioPlayer.value.volume = volume.value / 100
  audioPlayer.value.load() // 确保触发 loadedmetadata 事件
  audioPlayer.value.play().catch(e => {
    console.error('Play failed:', e)
  })
}

const togglePlayPause = () => {
  if (!audioPlayer.value) return
  
  if (audioPlayer.value.paused) {
    audioPlayer.value.play()
  } else {
    audioPlayer.value.pause()
  }
}

const closePlayer = () => {
  if (audioPlayer.value) {
    audioPlayer.value.pause()
  }
  currentPlaying.value = null
  currentTime.value = 0
  duration.value = 0
  bufferProgress.value = 0
  bufferedRanges.value = []
}

const onPlayEnded = () => {
  currentPlaying.value = null
  currentTime.value = 0
}

const onTimeUpdate = () => {
  if (audioPlayer.value && !isSeeking.value) {
    currentTime.value = audioPlayer.value.currentTime
    updateBufferProgress()
  }
}

const onLoadedMetadata = () => {
  if (audioPlayer.value) {
    duration.value = audioPlayer.value.duration
    updateBufferProgress()
  }
}

const onProgress = () => {
  updateBufferProgress()
}

const updateBufferProgress = () => {
  if (!audioPlayer.value || !duration.value) return
  
  try {
    const buffered = audioPlayer.value.buffered
    const ranges: Array<{ start: number; end: number }> = []
    
    for (let i = 0; i < buffered.length; i++) {
      ranges.push({
        start: buffered.start(i),
        end: buffered.end(i)
      })
    }
    
    bufferedRanges.value = ranges
    
    // 计算总缓冲进度（最远点）
    if (ranges.length > 0) {
      const maxEnd = Math.max(...ranges.map(r => r.end))
      bufferProgress.value = (maxEnd / duration.value) * 100
    }
  } catch (e) {
    // 忽略 buffered 访问错误
  }
}

const isTimeBuffered = (time: number): boolean => {
  if (!audioPlayer.value) return false
  
  try {
    const buffered = audioPlayer.value.buffered
    for (let i = 0; i < buffered.length; i++) {
      if (time >= buffered.start(i) && time <= buffered.end(i)) {
        return true
      }
    }
  } catch (e) {
    // 忽略错误
  }
  return false
}

const onSeeking = () => {
  isSeeking.value = true
}

const onSeekEnd = (value: number) => {
  if (!audioPlayer.value) {
    isSeeking.value = false
    return
  }
  
  // 检查目标位置是否已缓冲
  if (!isTimeBuffered(value)) {
    // 未缓冲，尝试 seek 但可能会触发重新加载
    console.warn(`Seeking to unbuffered position: ${value}s`)
  }
  
  try {
    audioPlayer.value.currentTime = value
  } catch (e) {
    console.error('Seek failed:', e)
  }
  
  isSeeking.value = false
}

const updateVolume = (value: number) => {
  if (audioPlayer.value) {
    audioPlayer.value.volume = value / 100
  }
  saveVolume(value)
}

const formatTime = (seconds: number) => {
  if (!isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

onMounted(() => {
  loadSavedVolume()
  loadMusicList()
})

onUnmounted(() => {
  if (audioPlayer.value) {
    audioPlayer.value.pause()
  }
})
</script>

<style scoped>
.music-editor {
  width: 100%;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar__actions {
  display: flex;
  gap: 12px;
}

.toolbar__info {
  color: #606266;
  font-size: 14px;
}

.filename-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-icon {
  color: #409eff;
  font-size: 18px;
}

.music-table :deep(.el-table__header) th {
  font-size: 16px;
  font-weight: 600;
}

.music-table :deep(.el-table__body) td {
  font-size: 15px;
}

.music-player {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 500px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  padding: 20px;
  z-index: 1000;
  border: 1px solid #e4e7ed;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.player-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #303133;
  font-size: 14px;
}

.player-title .el-icon {
  color: #409eff;
  font-size: 18px;
}

.player-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-wrapper {
  position: relative;
  flex: 1;
}

.buffer-bar {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  height: 6px;
  background: rgba(64, 158, 255, 0.2);
  border-radius: 3px;
  pointer-events: none;
  z-index: 0;
  transition: width 0.3s ease;
}

.progress-slider {
  position: relative;
  z-index: 1;
}

.progress-slider :deep(.el-slider__runway) {
  background: transparent;
}

.time-label {
  font-size: 12px;
  color: #606266;
  min-width: 40px;
  text-align: center;
}

.progress-slider {
  flex: 1;
}

.volume-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px;
}

.volume-icon {
  color: #606266;
  font-size: 18px;
}

.volume-slider {
  width: 120px;
}

.volume-label {
  font-size: 12px;
  color: #606266;
  min-width: 35px;
}

</style>
