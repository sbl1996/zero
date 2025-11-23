import axios from "axios";
import type { AssetStatus, MonsterBlueprint } from "@/types/monster";
import type { MapMetadata } from "@/types/map";

const api = axios.create({
  baseURL: "/api",
  timeout: 10000,
});

export async function fetchMonsters() {
  const response = await api.get<MonsterBlueprint[]>("/monsters");
  return response.data;
}

export async function upsertMonster(monster: MonsterBlueprint) {
  const response = await api.post<MonsterBlueprint>("/monsters", monster);
  return response.data;
}

export async function deleteMonster(id: string) {
  await api.delete(`/monsters/${id}`);
}

export async function getAssetStatus(id: string) {
  const response = await api.get<AssetStatus>(`/monsters/${id}/assets`);
  return response.data;
}

export async function fetchAllAssetStatus() {
  const response = await api.get<Record<string, AssetStatus>>(
    "/monsters/assets/statuses",
  );
  return response.data;
}

export async function uploadMonsterPng(id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<AssetStatus>(`/monsters/${id}/assets/png`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function uploadMonsterMp4(id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<AssetStatus>(`/monsters/${id}/assets/mp4`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function convertMissingWebp() {
  const response = await api.post<{ succeeded: boolean; stdout?: string }>(
    "/monsters/assets/convert",
  );
  return response.data;
}

// Map APIs
export async function fetchMaps() {
  const response = await api.get<MapMetadata[]>("/maps");
  return response.data;
}

export async function fetchMap(id: string) {
  const response = await api.get<MapMetadata>(`/maps/${id}`);
  return response.data;
}

export async function upsertMap(map: MapMetadata) {
  const response = await api.post<MapMetadata>("/maps", map);
  return response.data;
}

export async function updateMap(id: string, map: MapMetadata) {
  const response = await api.put<MapMetadata>(`/maps/${id}`, map);
  return response.data;
}

export async function deleteMap(id: string) {
  await api.delete(`/maps/${id}`);
}

// Equipment APIs
export async function fetchEquipment(params?: {
  slot?: string;
  quality?: string;
  tier_min?: number;
  tier_max?: number;
  search?: string;
}) {
  const response = await api.get<import("@/types/equipment").EquipmentItem[]>("/equipment", { params });
  return response.data;
}

export async function getEquipment(id: string) {
  const response = await api.get<import("@/types/equipment").EquipmentItem>(`/equipment/${id}`);
  return response.data;
}

export async function upsertEquipment(equipment: import("@/types/equipment").EquipmentItem) {
  const response = await api.post<import("@/types/equipment").EquipmentItem>("/equipment", equipment);
  return response.data;
}

export async function updateEquipment(id: string, equipment: import("@/types/equipment").EquipmentItem) {
  const response = await api.put<import("@/types/equipment").EquipmentItem>(`/equipment/${id}`, equipment);
  return response.data;
}

export async function deleteEquipment(id: string) {
  await api.delete(`/equipment/${id}`);
}

export async function uploadEquipmentImage(id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<{ path: string; filename: string }>(
    `/equipment/${id}/image`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
}

export async function uploadEquipmentPng(id: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post<{ path: string; filename: string }>(
    `/equipment/${id}/image/png`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
}

export async function convertEquipmentImages() {
  const response = await api.post<{ succeeded: boolean; stdout?: string; stderr?: string }>(
    "/equipment/convert"
  );
  return response.data;
}

export async function deleteEquipmentImage(id: string) {
  await api.delete(`/equipment/${id}/image`);
}

export function getEquipmentImageUrl(id: string) {
  return `/api/equipment/${id}/image`;
}
