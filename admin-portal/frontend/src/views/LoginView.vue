<template>
  <div class="login-view">
    <div class="login-view__hero">
      <h1>素材管理控制台</h1>
      <p>统一管理怪物、地图、技能等资源，支持版本追踪与快速检索。</p>
    </div>
    <LoginForm />
  </div>
</template>

<script setup lang="ts">
import LoginForm from '@/components/LoginForm.vue'
</script>

<style scoped>
.login-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  background: radial-gradient(circle at top, rgba(30, 64, 175, 0.35), rgba(15, 23, 42, 0.95));
  padding: 2rem 1rem 4rem;
  text-align: center;
}

.login-view__hero h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3rem);
}

.login-view__hero p {
  margin: 0.5rem 0 0;
  color: rgba(226, 232, 240, 0.75);
  max-width: 540px;
}
</style>
