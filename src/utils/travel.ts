import { router } from '@/router'
import { defaultMapId } from '@/data/maps'
import { useProgressStore } from '@/stores/progress'

export function travelToMap(mapId: string) {
  const progress = useProgressStore()
  progress.setCurrentMap(mapId)
  router.push({ name: 'map', params: { mapId } })
}

export function returnToFlorence() {
  travelToMap(defaultMapId)
}
