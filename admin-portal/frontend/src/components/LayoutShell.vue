<template>
  <el-container class="layout-shell">
    <el-header class="layout-shell__header">
      <div class="layout-shell__brand">
        <el-icon size="20">
          <Compass />
        </el-icon>
        <strong>Zero 管理后台</strong>
      </div>
      <div class="layout-shell__actions">
        <slot name="actions" />
        <el-button link type="danger" @click="handleSignOut">
          退出登录
        </el-button>
      </div>
    </el-header>
    <el-main>
      <slot />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { Compass } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

function handleSignOut() {
  auth.signOut()
  router.push({ name: 'login' })
}
</script>

<style scoped>
.layout-shell {
  min-height: 100vh;
}

.layout-shell__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 1.5rem;
  background: rgba(15, 23, 42, 0.85);
  border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  backdrop-filter: blur(12px);
}

.layout-shell__brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1rem;
  letter-spacing: 0.5px;
}

.layout-shell__actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}
</style>
