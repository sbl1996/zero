import { defineStore } from "pinia";

import type { AssetStatus, MonsterBlueprint } from "@/types/monster";
import {
  convertMissingWebp,
  deleteMonster,
  fetchAllAssetStatus,
  fetchMonsters,
  getAssetStatus,
  upsertMonster,
  uploadMonsterPng,
  uploadMonsterMp4,
} from "@/api";

interface MonsterState {
  monsters: MonsterBlueprint[];
  loading: boolean;
  saving: boolean;
  converting: boolean;
  assetStatus: Record<string, AssetStatus>;
}

export const useMonsterStore = defineStore("monsters", {
  state: (): MonsterState => ({
    monsters: [],
    loading: false,
    saving: false,
    converting: false,
    assetStatus: {},
  }),
  actions: {
    async loadMonsters() {
      this.loading = true;
      try {
        this.monsters = await fetchMonsters();
        await this.refreshAssetStatus();
      } finally {
        this.loading = false;
      }
    },
    async refreshAssetStatus(ids?: string[]) {
      if (!ids) {
        try {
          this.assetStatus = await fetchAllAssetStatus();
        } catch {
          this.assetStatus = {};
        }
        return;
      }
      const targets = ids ?? this.monsters.map((monster) => monster.id);
      for (const id of targets) {
        try {
          this.assetStatus[id] = await getAssetStatus(id);
        } catch {
          this.assetStatus[id] = { png: false, webp: false, mp4: false };
        }
      }
    },
    async saveMonster(monster: MonsterBlueprint) {
      this.saving = true;
      try {
        await upsertMonster(monster);
        await this.loadMonsters();
      } finally {
        this.saving = false;
      }
    },
    async removeMonster(id: string) {
      await deleteMonster(id);
      this.monsters = this.monsters.filter((monster) => monster.id !== id);
      delete this.assetStatus[id];
    },
    async uploadPng(id: string, file: File) {
      const status = await uploadMonsterPng(id, file);
      this.assetStatus[id] = status;
      return status;
    },
    async uploadMp4(id: string, file: File) {
      const status = await uploadMonsterMp4(id, file);
      this.assetStatus[id] = status;
      return status;
    },
    async convertAssets() {
      this.converting = true;
      try {
        await convertMissingWebp();
        await this.refreshAssetStatus();
      } finally {
        this.converting = false;
      }
    },
  },
});
