import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'zero_admin_portal_api_key'

export const useAuthStore = defineStore('auth', () => {
  const apiKey = ref<string>(localStorage.getItem(STORAGE_KEY) ?? '')
  const apiError = ref<string | null>(null)

  const isAuthenticated = computed(() => apiKey.value.trim().length > 0)

  function setApiKey(value: string) {
    apiKey.value = value.trim()
    if (apiKey.value) {
      localStorage.setItem(STORAGE_KEY, apiKey.value)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  function signOut() {
    apiKey.value = ''
    apiError.value = null
    localStorage.removeItem(STORAGE_KEY)
  }

  function setError(message: string | null) {
    apiError.value = message
  }

  return {
    apiKey,
    apiError,
    isAuthenticated,
    setApiKey,
    signOut,
    setError,
  }
})
