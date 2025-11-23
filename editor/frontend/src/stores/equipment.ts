import { defineStore } from "pinia";

import type { EquipmentItem } from "@/types/equipment";
import {
  fetchEquipment,
  getEquipment,
  upsertEquipment,
  updateEquipment,
  deleteEquipment,
  uploadEquipmentImage,
  uploadEquipmentPng,
  convertEquipmentImages,
  deleteEquipmentImage,
} from "@/api";

interface EquipmentState {
  items: EquipmentItem[];
  currentItem: EquipmentItem | null;
  loading: boolean;
  saving: boolean;
  converting: boolean;
  filters: {
    slot?: string;
    quality?: string;
    tier_min?: number;
    tier_max?: number;
    search?: string;
  };
}

export const useEquipmentStore = defineStore("equipment", {
  state: (): EquipmentState => ({
    items: [],
    currentItem: null,
    loading: false,
    saving: false,
    converting: false,
    filters: {},
  }),
  
  getters: {
    filteredItems: (state) => {
      let items = [...state.items];
      
      if (state.filters.slot) {
        items = items.filter((item) => item.slot === state.filters.slot);
      }
      if (state.filters.quality) {
        items = items.filter((item) => item.base_quality === state.filters.quality);
      }
      if (state.filters.tier_min !== undefined) {
        items = items.filter(
          (item) => item.required_tier && item.required_tier >= state.filters.tier_min!
        );
      }
      if (state.filters.tier_max !== undefined) {
        items = items.filter(
          (item) => item.required_tier && item.required_tier <= state.filters.tier_max!
        );
      }
      if (state.filters.search) {
        const search = state.filters.search.toLowerCase();
        items = items.filter(
          (item) =>
            item.id.toLowerCase().includes(search) ||
            item.name.toLowerCase().includes(search)
        );
      }
      
      return items;
    },
  },
  
  actions: {
    async loadEquipment() {
      this.loading = true;
      try {
        this.items = await fetchEquipment(this.filters);
      } finally {
        this.loading = false;
      }
    },
    
    async loadEquipmentItem(id: string) {
      this.loading = true;
      try {
        this.currentItem = await getEquipment(id);
      } finally {
        this.loading = false;
      }
    },
    
    async saveEquipment(equipment: EquipmentItem) {
      this.saving = true;
      try {
        const saved = await upsertEquipment(equipment);
        await this.loadEquipment();
        this.currentItem = saved;
        return saved;
      } finally {
        this.saving = false;
      }
    },
    
    async updateEquipmentItem(id: string, equipment: EquipmentItem) {
      this.saving = true;
      try {
        const updated = await updateEquipment(id, equipment);
        await this.loadEquipment();
        this.currentItem = updated;
        return updated;
      } finally {
        this.saving = false;
      }
    },
    
    async removeEquipment(id: string) {
      await deleteEquipment(id);
      this.items = this.items.filter((item) => item.id !== id);
      if (this.currentItem?.id === id) {
        this.currentItem = null;
      }
    },
    
    async uploadImage(id: string, file: File) {
      const result = await uploadEquipmentImage(id, file);
      await this.loadEquipment();
      if (this.currentItem?.id === id) {
        await this.loadEquipmentItem(id);
      }
      return result;
    },
    
    async uploadPng(id: string, file: File) {
      const result = await uploadEquipmentPng(id, file);
      await this.loadEquipment();
      if (this.currentItem?.id === id) {
        await this.loadEquipmentItem(id);
      }
      return result;
    },
    
    async convertImages() {
      this.converting = true;
      try {
        const result = await convertEquipmentImages();
        return result;
      } finally {
        this.converting = false;
      }
    },
    
    async removeImage(id: string) {
      await deleteEquipmentImage(id);
      await this.loadEquipment();
      if (this.currentItem?.id === id) {
        await this.loadEquipmentItem(id);
      }
    },
    
    setCurrentItem(item: EquipmentItem | null) {
      this.currentItem = item ? { ...item } : null;
    },
    
    setFilters(filters: Partial<EquipmentState["filters"]>) {
      this.filters = { ...this.filters, ...filters };
    },
    
    clearFilters() {
      this.filters = {};
    },
    
    createNewItem(): EquipmentItem {
      return {
        id: "",
        name: "",
        slot: "weaponR",
        base_quality: "normal",
        base_main: {
          type: "ATK",
          value: 10,
        },
        substats: [],
        flags: [],
      };
    },
  },
});
