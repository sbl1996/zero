<template>
  <el-drawer
    :model-value="modelValue"
    :title="drawerTitle"
    size="480px"
    :destroy-on-close="false"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form :model="form" label-position="top" class="asset-form" @submit.prevent="handleSubmit">
      <el-form-item label="素材类型" required>
        <el-select
          v-model="form.asset_type"
          :disabled="mode === 'edit'"
          placeholder="请选择素材类型"
          @change="(value: AssetType) => emit('switchType', value)"
        >
          <el-option
            v-for="option in assetTypeOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="资源 ID" required>
        <el-input
          v-if="mode === 'create'"
          v-model="form.id"
          placeholder="输入新的资源ID（如：m-slime、map-forest），文件名必须与此ID一致"
          clearable
          :class="{ 'is-error': idValidation.hasError }"
          @blur="validateId"
          @input="handleIdInput"
        >
          <template #suffix v-if="idValidation.isValidating || idValidation.isAvailable || idValidation.hasError">
            <el-icon v-if="idValidation.isValidating" class="is-validating">
              <Loading />
            </el-icon>
            <el-icon v-else-if="idValidation.isAvailable" class="is-available">
              <CircleCheck />
            </el-icon>
            <el-icon v-else-if="idValidation.hasError" class="has-error">
              <CircleClose />
            </el-icon>
          </template>
        </el-input>
        <div v-if="showValidationMessage"
           :class="['id-validation-message', idValidation.hasError ? 'has-error' : 'is-success']">
          {{ idValidation.message }}
        </div>
        <el-input v-if="mode !== 'create'" v-model="form.id" disabled />
      </el-form-item>
      <el-form-item label="展示标题">
        <el-input v-model="form.title" placeholder="方便团队识别的名称" />
      </el-form-item>
      <el-form-item label="描述备注">
        <el-input v-model="form.description" type="textarea" :rows="3" placeholder="简介、命名规则说明等" />
      </el-form-item>
      <el-form-item label="标签">
        <el-select v-model="form.tags" multiple filterable allow-create default-first-option placeholder="如 boss / seasonal">
          <el-option v-for="tag in form.tags" :key="tag" :label="tag" :value="tag" />
        </el-select>
      </el-form-item>
      <el-form-item label="上传人">
        <el-input v-model="form.uploaded_by" placeholder="例如 工作室 / 管理员名称" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="2" placeholder="记录版本原因或审核说明" />
      </el-form-item>
      <el-form-item v-if="mode === 'edit' && asset?.latest_revision" label="当前版本">
        <el-descriptions border :column="1">
          <el-descriptions-item label="文件">{{ asset.latest_revision.file_name }}</el-descriptions-item>
          <el-descriptions-item label="大小">{{ prettySize(asset.latest_revision.file_size) }}</el-descriptions-item>
          <el-descriptions-item label="上传于">
            {{ formatDate(asset.latest_revision.created_at) }}
          </el-descriptions-item>
        </el-descriptions>
      </el-form-item>
      <el-form-item :label="mode === 'create' ? '上传文件' : '上传新版本'">
        <el-upload
          class="asset-form__upload"
          drag
          :auto-upload="false"
          :limit="1"
          :file-list="fileList"
          accept=".png,.jpg,.jpeg,.webp,.gif,.mp4"
          @change="onFileChange"
          @remove="onFileRemove"
          :class="{ 'is-error': filenameValidation.hasError }"
        >
          <el-icon class="el-icon--upload">
            <UploadFilled />
          </el-icon>
          <div class="el-upload__text">
            拖拽文件到此处，或 <em>点击上传</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">
              支持 PNG / WEBP / MP4 等格式，<strong>文件名（不含后缀）必须与 ID 一致</strong>。
            </div>
            <div v-if="filenameValidation.hasError" class="filename-validation-message has-error">
              {{ filenameValidation.message }}
            </div>
          </template>
        </el-upload>
      </el-form-item>
      <el-form-item>
        <el-button :loading="loading" type="primary" @click="handleSubmit">
          {{ mode === 'create' ? '创建素材' : '保存更新' }}
        </el-button>
        <el-button @click="handleClose">取消</el-button>
      </el-form-item>
    </el-form>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Asset, AssetType, CatalogItem } from '@/types/assets'
import dayjs from 'dayjs'
import { UploadFilled, Loading, CircleCheck, CircleClose } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useAssetStore } from '@/stores/assets'

const props = defineProps<{
  modelValue: boolean
  mode: 'create' | 'edit'
  asset: Asset | null
  assetTypeOptions: Array<{ label: string; value: AssetType }>
  defaultAssetType: AssetType
  catalog: CatalogItem[]
  loading: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'submit', payload: any): void
  (event: 'switchType', value: AssetType): void
}>()

const assetStore = useAssetStore()

// 简单的debounce实现
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  return ((...args: any[]) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => fn(...args), delay)
  }) as T
}

const form = reactive({
  id: '',
  asset_type: 'monster' as AssetType,
  title: '',
  description: '',
  tags: [] as string[],
  notes: '',
  uploaded_by: '',
  extra_metadata: {} as Record<string, unknown> | null,
})

const selectedFile = ref<File | null>(null)
const fileList = computed(() =>
  selectedFile.value
    ? [
        {
          name: selectedFile.value.name,
          url: '',
        },
      ]
    : [],
)

// 文件名验证状态
const filenameValidation = reactive({
  hasError: false,
  message: null as string | null,
})

// ID验证状态
const idValidation = reactive({
  isValidating: false,
  isAvailable: false,
  hasError: false,
  message: null as string | null,
})

// 计算属性控制验证信息显示
const showValidationMessage = computed(() => {
  return props.mode === 'create' &&
         form.id.trim() &&
         (idValidation.isValidating || (idValidation.message && idValidation.message.trim()))
})

watch(
  () => props.asset,
  (asset) => {
    if (asset && props.mode === 'edit') {
      form.id = asset.id
      form.asset_type = asset.asset_type
      form.title = asset.title ?? ''
      form.description = asset.description ?? ''
      form.tags = [...(asset.tags ?? [])]
      form.notes = ''
      form.uploaded_by = ''
    } else if (props.mode === 'create') {
      form.id = ''
      form.asset_type = props.defaultAssetType
      form.title = ''
      form.description = ''
      form.tags = []
      form.notes = ''
      form.uploaded_by = ''
      resetValidation()
    }
    selectedFile.value = null
  },
  { immediate: true },
)

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      selectedFile.value = null
    }
  },
)

watch(
  () => props.defaultAssetType,
  (type) => {
    if (props.mode === 'create') {
      form.asset_type = type
    }
  },
)

function onFileChange(file: { raw: File }) {
  selectedFile.value = file.raw
  validateFileName()
}

function onFileRemove() {
  selectedFile.value = null
  filenameValidation.hasError = false
  filenameValidation.message = null
}

function handleClose() {
  emit('update:modelValue', false)
}

const drawerTitle = computed(() => {
  if (props.mode === 'create') return '新建素材'
  const type = form.asset_type
  const label = props.catalog.find((item) => item.id === form.id)?.label
  if ((type === 'map' || type === 'skill') && label) {
    return `编辑 ${label}`
  }
  return `编辑 ${form.id}`
})

// ID验证方法
const debouncedValidateId = debounce(async (id: string) => {
  if (!id || props.mode !== 'create') {
    resetValidation()
    return
  }

  idValidation.isValidating = true
  idValidation.message = '验证中...'

  try {
    const isAvailable = await assetStore.validateAssetId(id, form.asset_type)

    if (isAvailable) {
      idValidation.isAvailable = true
      idValidation.hasError = false
      idValidation.message = 'ID 可用'
    } else {
      idValidation.isAvailable = false
      idValidation.hasError = true
      idValidation.message = 'ID 已存在，请使用其他 ID'
    }
  } catch (error) {
    console.error('ID验证失败:', error)
    idValidation.isAvailable = false
    idValidation.hasError = true
    idValidation.message = '验证失败，请稍后重试'
  } finally {
    idValidation.isValidating = false
  }
}, 500)

function handleIdInput() {
  if (form.id) {
    debouncedValidateId(form.id)
    validateFileName()
  } else {
    resetValidation()
  }
}

async function validateId() {
  if (form.id && props.mode === 'create') {
    await debouncedValidateId(form.id)
  }
}

function resetValidation() {
  idValidation.isValidating = false
  idValidation.isAvailable = false
  idValidation.hasError = false
  idValidation.message = null
  filenameValidation.hasError = false
  filenameValidation.message = null
}

function validateFileName() {
  if (!selectedFile.value || props.mode !== 'create') {
    filenameValidation.hasError = false
    filenameValidation.message = null
    return
  }

  const file = selectedFile.value
  const lastDotIndex = file.name.lastIndexOf('.')

  // Handle case where file has no extension
  if (lastDotIndex === -1) {
    filenameValidation.hasError = file.name !== form.id
    filenameValidation.message = file.name !== form.id
      ? `文件名必须与ID一致，应为：${form.id}`
      : null
    return
  }

  const fileNameWithoutExt = file.name.substring(0, lastDotIndex)
  const fileExtension = file.name.substring(lastDotIndex)

  if (fileNameWithoutExt !== form.id) {
    filenameValidation.hasError = true
    filenameValidation.message = `文件名（不含后缀）必须与ID一致，应为：${form.id}${fileExtension}`
  } else {
    filenameValidation.hasError = false
    filenameValidation.message = null
  }
}

function handleSubmit() {
  if (props.mode === 'create' && !form.id) {
    ElMessage.warning('请填写素材 ID')
    return
  }
  if (props.mode === 'create' && idValidation.hasError) {
    ElMessage.warning('请使用有效的 ID')
    return
  }
  if (props.mode === 'create' && filenameValidation.hasError) {
    ElMessage.warning(filenameValidation.message || '文件名不符合要求')
    return
  }
  if (props.mode === 'create' && !selectedFile.value) {
    ElMessage.warning('请选择需要上传的文件')
    return
  }
  const payload = {
    id: form.id,
    asset_type: form.asset_type,
    title: form.title || null,
    description: form.description || null,
    tags: form.tags,
    notes: form.notes || null,
    uploaded_by: form.uploaded_by || null,
    file: selectedFile.value ?? undefined,
  }
  emit('submit', payload)
}

function prettySize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}
</script>

<style scoped>
.asset-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.asset-form__upload {
  width: 100%;
}

/* ID验证状态样式 */
.is-error :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}


.is-validating {
  color: var(--el-color-primary);
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.id-validation-message {
  font-size: 12px;
  margin-top: 4px;
}

.is-success {
  color: var(--el-color-success);
}

.has-error {
  color: var(--el-color-danger);
}

.filename-validation-message {
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.4;
}
</style>
