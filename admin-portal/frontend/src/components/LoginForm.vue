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
      <el-alert
        v-if="auth.apiError"
        :closable="false"
        type="error"
        show-icon
        title="认证失败"
        class="login-card__error"
      >
        {{ auth.apiError }}
      </el-alert>
    </el-form>
  </el-card>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { fetchAssets } from '@/services/api'
import { ElMessage } from 'element-plus'

const router = useRouter()
const auth = useAuthStore()
const loading = ref(false)

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
    // 临时设置API Key用于验证
    auth.setApiKey(form.apiKey)

    // 尝试一个PATCH请求来验证API Key是否有效
    // 使用一个不存在的资产ID，这样应该返回404（认证成功）或401（认证失败）
    const testResponse = await fetch('/api/assets/non-existent-asset-for-auth-test', {
      method: 'PATCH',
      headers: {
        'X-API-Key': form.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'test' }),
    })

    if (testResponse.status === 401) {
      throw new Error('API Key无效')
    }

    // 如果返回404或其他4xx错误（除了401），说明认证成功了
    if (testResponse.status >= 400 && testResponse.status !== 401) {
      // 认证成功，继续登录
    }

    const redirect = router.currentRoute.value.query.redirect as string | undefined
    router.push(redirect ?? { name: 'assets' })
  } catch (error: any) {
    // 验证失败，清除API Key并显示错误
    auth.setApiKey('')
    const message = error?.response?.data?.detail ?? error?.message ?? 'API Key 验证失败'
    auth.setError(message)
    ElMessage.error('API Key 无效，请检查后端配置')
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
