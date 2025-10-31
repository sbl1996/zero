<template>
  <el-card class="login-card">
    <template #header>
      <div class="login-card__header">
        <h2>管理员登录</h2>
        <p>输入 API Key 即可开始管理素材库。</p>
      </div>
    </template>
    <el-form :model="form" label-position="top" @submit.prevent="handleSubmit">
      <el-form-item label="API Key" required>
        <el-input
          v-model="form.apiKey"
          placeholder="请输入后端配置的 ADMIN_PORTAL_API_KEY"
          type="password"
          show-password
        />
      </el-form-item>
      <el-form-item>
        <el-button :loading="loading" type="primary" class="login-card__submit" @click="handleSubmit">
          登录
        </el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

const form = reactive({
  apiKey: auth.apiKey ?? '',
})

async function handleSubmit() {
  if (!form.apiKey) {
    auth.setError('请输入可用的 API Key')
    return
  }
  loading.value = true
  auth.setError(null)

  try {
    // 创建临时的API客户端实例进行验证，不保存到store中
    const tempClient = axios.create({
      baseURL: apiBaseUrl && apiBaseUrl.length > 0 ? apiBaseUrl : undefined,
      timeout: 20000,
      headers: {
        'X-API-Key': form.apiKey
      }
    })

    // 使用临时客户端尝试一个简单的请求来验证API Key是否有效
    // 我们尝试获取资产列表，如果API key无效，后端会返回401
    const response = await tempClient.get('/api/assets?page=1&page_size=1')

    // 如果能成功获取响应，说明API Key有效
    if (response.status === 200) {
      // 验证成功，现在才设置API Key到store中
      auth.setApiKey(form.apiKey)

      // 认证成功，继续登录
      const redirect = router.currentRoute.value.query.redirect as string | undefined
      router.push(redirect ?? { name: 'assets' })
    } else {
      throw new Error('API Key 验证失败')
    }
  } catch (error: any) {
    // 验证失败，不保存API Key并显示错误

    // 根据不同的错误类型显示不同的消息
    let errorMessage = 'API Key 验证失败'
    if (error?.response?.status === 401) {
      errorMessage = 'API Key 无效或已过期'
    } else if (error?.response?.status === 403) {
      errorMessage = '访问被拒绝，权限不足'
    } else if (error?.response?.data?.detail) {
      errorMessage = error.response.data.detail
    } else if (error?.message) {
      errorMessage = error.message
    }

    auth.setError(errorMessage)
    ElMessage.error(errorMessage)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-card {
  width: min(420px, 90vw);
  margin: 4rem auto;
  backdrop-filter: blur(6px);
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.login-card__header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.login-card__submit {
  width: 100%;
}

.login-card__error {
  margin-top: 1rem;
}
</style>
