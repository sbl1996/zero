import { router } from '@/router'
import { defaultMapId } from '@/data/maps'
import { useProgressStore } from '@/stores/progress'

export async function travelToMap(mapId: string) {
  const progress = useProgressStore()
  progress.setCurrentMap(mapId)
  try {
    await router.push({ name: 'map', params: { mapId } })
  } catch (error: any) {
    if (error?.name === 'NavigationDuplicated') {
      // Ignore navigation duplicated errors
      return
    }
    console.error('Failed to travel to map:', mapId, error)
  }
}

export function returnToFlorence() {
  travelToMap(defaultMapId)
}
