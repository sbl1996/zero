<template>
  <el-card shadow="never" class="app-card">
    <template #header>
      <div class="toolbar">
        <div class="toolbar__actions">
          <el-button type="primary" @click="createNew">新增装备</el-button>
          <el-button @click="refresh">刷新数据</el-button>
          <el-button
            type="success"
            :loading="store.converting"
            @click="convertImages"
          >
            生成WebP
          </el-button>
        </div>
        <div class="toolbar__filters">
          <div class="filter filter--slot">
            <el-select
              v-model="filterSlot"
              size="small"
              placeholder="按槽位筛选"
              clearable
            >
              <el-option
                v-for="option in slotFilterOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>
          <div class="filter filter--quality">
            <el-select
              v-model="filterQuality"
              size="small"
              placeholder="按品质筛选"
              clearable
            >
              <el-option
                v-for="option in qualityFilterOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </div>
          <div class="filter filter--keyword">
            <el-input
              v-model="filterKeyword"
              size="small"
              placeholder="关键字匹配 ID 或 名称"
              clearable
            />
          </div>
        </div>
      </div>
    </template>
    
    <el-table
      :data="paginatedItems"
      :key="imageTimestamp"
      v-loading="store.loading"
      size="small"
      stripe
      class="equipment-table"
    >
      <el-table-column prop="id" label="ID" width="200" />
      <el-table-column prop="name" label="名称" width="140" />
      <el-table-column label="槽位" width="100">
        <template #default="{ row }">
          {{ getSlotLabel(row.slot) }}
        </template>
      </el-table-column>
      <el-table-column label="品质" width="80">
        <template #default="{ row }">
          <el-tag :type="getQualityType(row.base_quality) || undefined" size="small">
            {{ getQualityLabel(row.base_quality) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="境界" width="70">
        <template #default="{ row }">
          {{ row.required_tier ? numberToRealm(row.required_tier) : '-' }}
        </template>
      </el-table-column>
      <el-table-column label="主属性" width="120">
        <template #default="{ row }">
          {{ getStatLabel(row.base_main.type) }} {{ row.base_main.value }}
        </template>
      </el-table-column>
      <el-table-column label="副属性" width="100">
        <template #default="{ row }">
          {{ row.substats?.length || 0 }} 个
        </template>
      </el-table-column>
      <el-table-column label="价格" width="100">
        <template #default="{ row }">
          <span v-if="row.price?.sell">{{ row.price.sell }} G</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="图片" width="100" class-name="image-column">
        <template #default="{ row }">
          <div v-if="row.artwork" class="image-preview-cell">
            <img
              :key="`${row.id}-${imageTimestamp}`"
              :src="getImageUrl(row.id)"
              @click.stop="openImagePreview(row.id)"
              style="width: 36px; height: 36px; cursor: pointer; object-fit: cover; border-radius: 4px;"
              @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
            />
          </div>
          <el-tag v-else type="info" size="small">无图片</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-space>
            <el-tooltip content="编辑" placement="top">
              <el-button size="small" circle @click.stop="selectItem(row)">
                <el-icon><Edit /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="上传图片" placement="top">
              <el-button size="small" circle @click.stop="promptUpload(row)">
                <el-icon><Upload /></el-icon>
              </el-button>
            </el-tooltip>
            <el-tooltip content="删除" placement="top">
              <el-button size="small" circle type="danger" @click.stop="confirmDelete(row)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </el-tooltip>
          </el-space>
        </template>
      </el-table-column>
    </el-table>
    
    <div class="pagination-wrapper">
      <div class="pagination-controls">
        <el-select v-model="itemsPerPage" size="small" placeholder="每页">
          <el-option
            v-for="size in pageSizeOptions"
            :key="size"
            :label="`${size} 条`"
            :value="size"
          />
        </el-select>
        <el-pagination
          background
          :current-page="currentPage"
          :page-size="itemsPerPage"
          layout="prev, pager, next"
          :total="filteredItemCount"
          @current-change="handlePageChange"
        />
      </div>
    </div>
  </el-card>
  
  <!-- 编辑对话框 -->
  <el-dialog 
    v-model="dialogVisible" 
    :title="isEditing ? '编辑装备' : '新增装备'" 
    width="720px"
    :close-on-click-modal="false"
  >
    <el-form ref="formRef" :model="form" label-width="100px" :rules="rules">
      <el-form-item label="ID" prop="id">
        <el-input v-model="form.id" :disabled="isEditing" placeholder="iron-sword" />
      </el-form-item>
      <el-form-item label="名称" prop="name">
        <el-input v-model="form.name" placeholder="铁剑" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="form.description" type="textarea" :rows="3" />
      </el-form-item>
      
      <el-row :gutter="20">
        <el-col :span="8">
          <el-form-item label="槽位" prop="slot">
            <el-select v-model="form.slot" style="width: 100%">
              <el-option
                v-for="slot in EQUIPMENT_SLOTS"
                :key="slot.value"
                :label="slot.label"
                :value="slot.value"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="品质" prop="base_quality">
            <el-select v-model="form.base_quality" style="width: 100%">
              <el-option
                v-for="quality in QUALITIES"
                :key="quality.value"
                :label="quality.label"
                :value="quality.value"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="需求境界">
            <el-select v-model="form.required_tier" placeholder="请选择境界" style="width: 100%">
              <el-option
                v-for="option in realmOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      
      <el-divider content-position="left">主属性</el-divider>
      <el-row :gutter="20">
        <el-col :span="8">
          <el-form-item label="类型" prop="base_main.type">
            <el-select v-model="form.base_main.type" style="width: 100%">
              <el-option
                v-for="stat in MAIN_STAT_TYPES"
                :key="stat.value"
                :label="stat.label"
                :value="stat.value"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="数值" prop="base_main.value">
            <el-input-number v-model="form.base_main.value" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="数值类型">
            <el-select v-model="form.base_main.value_type" style="width: 100%">
              <el-option label="自动" value="" />
              <el-option label="固定值" value="flat" />
              <el-option label="百分比" value="percent" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      
      <el-divider content-position="left">副属性</el-divider>
      <div v-for="(substat, index) in form.substats" :key="index" style="margin-bottom: 12px;">
        <el-row :gutter="20">
          <el-col :span="7">
            <el-select v-model="substat.type" size="small" style="width: 100%">
              <el-option
                v-for="stat in SUB_STAT_TYPES"
                :key="stat.value"
                :label="stat.label"
                :value="stat.value"
              />
            </el-select>
          </el-col>
          <el-col :span="7">
            <el-input-number v-model="substat.value" size="small" style="width: 100%" />
          </el-col>
          <el-col :span="7">
            <el-select v-model="substat.value_type" size="small" style="width: 100%">
              <el-option label="自动" value="" />
              <el-option label="固定值" value="flat" />
              <el-option label="百分比" value="percent" />
            </el-select>
          </el-col>
          <el-col :span="3">
            <el-button size="small" type="danger" @click="removeSubstat(index)">删除</el-button>
          </el-col>
        </el-row>
      </div>
      <el-button size="small" @click="addSubstat">+ 添加副属性</el-button>
      
      <el-divider content-position="left">价格与标签</el-divider>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="购买价">
            <el-input-number v-model="form.price.buy" :min="0" style="width: 100%" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="出售价">
            <el-input-number v-model="form.price.sell" :min="0" style="width: 100%" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="标签">
        <el-input v-model="flagsText" placeholder="starter, unique (逗号分隔)" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="store.saving" @click="saveItem">保存</el-button>
    </template>
  </el-dialog>
  
  <!-- 上传对话框 -->
  <el-dialog
    v-model="uploadDialogVisible"
    title="上传装备图片"
    width="500px"
    :destroy-on-close="true"
  >
    <div class="upload-container">
      <div class="upload-section">
        <h4 class="upload-section__title">PNG 图片</h4>
        <el-upload
          drag
          :auto-upload="false"
          :show-file-list="false"
          accept=".png"
          :on-change="(file) => handleFileUpload(file, 'png')"
        >
          <el-icon class="el-icon--upload"><upload-filled /></el-icon>
          <div class="el-upload__text">
            拖拽文件到此处或 <em>点击上传</em>
          </div>
          <template #tip>
            <div class="el-upload__tip">支持 .png 格式</div>
          </template>
        </el-upload>
      </div>
    </div>
    <template #footer>
      <el-button @click="uploadDialogVisible = false">关闭</el-button>
    </template>
  </el-dialog>

  <!-- 图片预览对话框 -->
  <el-dialog
    v-model="previewVisible"
    :title="previewEquipmentName"
    width="640px"
    :destroy-on-close="true"
    center
  >
    <div class="asset-preview">
      <img v-if="previewImageUrl" :src="previewImageUrl" alt="装备图片" style="max-width: 100%; height: auto;" />
      <p v-else>图片加载失败</p>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { Delete, Edit, Upload, UploadFilled } from "@element-plus/icons-vue";
import { useEquipmentStore } from "@/stores/equipment";
import { EQUIPMENT_SLOTS, QUALITIES, MAIN_STAT_TYPES, SUB_STAT_TYPES } from "@/types/equipment";
import type { EquipmentItem } from "@/types/equipment";
import { numberToRealm, getRealmOptions } from "@/utils/realmMapping";

const store = useEquipmentStore();
const dialogVisible = ref(false);
const uploadDialogVisible = ref(false);
const previewVisible = ref(false);
const previewImageUrl = ref<string>("");
const previewEquipmentId = ref<string>("");
const isEditing = ref(false);
const formRef = ref<FormInstance>();
const uploadTargetId = ref<string | null>(null);
const realmOptions = getRealmOptions();
const imageTimestamp = ref(Date.now());

const filterSlot = ref<string>("");
const filterQuality = ref<string>("");
const filterKeyword = ref("");

const pageSizeOptions = [10, 14, 24, 48];
const itemsPerPage = ref(14);
const currentPage = ref(1);

const slotFilterOptions = [
  { label: "按槽位筛选", value: "" },
  ...EQUIPMENT_SLOTS
];

const qualityFilterOptions = [
  { label: "按品质筛选", value: "" },
  ...QUALITIES
];

const emptyEquipment = (): EquipmentItem => ({
  id: "",
  name: "",
  slot: "weaponR",
  base_quality: "normal",
  base_main: {
    type: "ATK",
    value: 10,
  },
  substats: [],
  price: {},
  flags: [],
});

const form = ref<EquipmentItem>(emptyEquipment());

const flagsText = computed({
  get: () => (form.value.flags || []).join(", "),
  set: (value: string) => {
    form.value.flags = value
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
  },
});

const rules: FormRules = {
  id: [
    { required: true, message: "ID不能为空", trigger: "blur" },
    {
      validator: (rule, value, callback) => {
        if (!value) {
          callback();
          return;
        }
        const pattern = /^[a-z]+(-[a-z]+)*$/;
        if (!pattern.test(value)) {
          callback(new Error("ID格式不正确，只能使用小写英文字母和'-'，格式如：xxx-yyy-zzz"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ],
  name: [{ required: true, message: "名称不能为空", trigger: "blur" }],
  slot: [{ required: true, message: "槽位不能为空", trigger: "blur" }],
  base_quality: [{ required: true, message: "品质不能为空", trigger: "blur" }],
  "base_main.type": [{ required: true, message: "主属性类型不能为空", trigger: "blur" }],
  "base_main.value": [{ required: true, message: "主属性数值不能为空", trigger: "blur" }],
};

const currentItem = ref<EquipmentItem | null>(null);

const filteredItems = computed(() => {
  const keyword = filterKeyword.value.trim().toLowerCase();
  const filtered = store.items.filter((item) => {
    if (filterSlot.value && item.slot !== filterSlot.value) {
      return false;
    }
    if (filterQuality.value && item.base_quality !== filterQuality.value) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    const searchable = `${item.id} ${item.name}`.toLowerCase();
    return searchable.includes(keyword);
  });
  
  // 排序：先按境界要求（从低到高），然后按价格（从低到高）
  return filtered.sort((a, b) => {
    const tierA = a.required_tier ?? 0;
    const tierB = b.required_tier ?? 0;
    if (tierA !== tierB) {
      return tierA - tierB;
    }
    const priceA = a.price?.sell ?? 0;
    const priceB = b.price?.sell ?? 0;
    return priceA - priceB;
  });
});

const filteredItemCount = computed(() => filteredItems.value.length);

const paginatedItems = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredItems.value.slice(start, start + itemsPerPage.value);
});

const previewEquipmentName = computed(() => {
  const equipment = store.items.find(item => item.id === previewEquipmentId.value);
  return equipment?.name || "装备图片预览";
});

watch(
  [filteredItemCount, itemsPerPage],
  ([length]) => {
    const totalPages = Math.max(1, Math.ceil(length / itemsPerPage.value));
    if (currentPage.value > totalPages) {
      currentPage.value = totalPages;
    }
  }
);

watch([filterSlot, filterQuality, filterKeyword], () => {
  currentPage.value = 1;
});

onMounted(async () => {
  await refresh();
});

function handlePageChange(page: number) {
  currentPage.value = page;
}

function getSlotLabel(slot: string) {
  const s = EQUIPMENT_SLOTS.find((s) => s.value === slot);
  return s?.label || slot;
}

function getQualityLabel(quality: string) {
  const q = QUALITIES.find((q) => q.value === quality);
  return q?.label || quality;
}

function getQualityType(quality: string): string {
  const types: Record<string, string> = {
    normal: "info",
    fine: "success",
    rare: "primary",
    excellent: "warning",
    epic: "danger",
  };
  return types[quality] || "";
}

function getStatLabel(type: string) {
  const stat = [...MAIN_STAT_TYPES, ...SUB_STAT_TYPES].find((s) => s.value === type);
  return stat?.label || type;
}

function getImageUrl(equipmentId: string) {
  return `/api/equipment/${equipmentId}/image?t=${imageTimestamp.value}`;
}

function createNew() {
  resetForm();
  isEditing.value = false;
  dialogVisible.value = true;
}

function selectItem(item: EquipmentItem) {
  resetForm();
  Object.assign(form.value, JSON.parse(JSON.stringify(item)));
  if (!form.value.price) {
    form.value.price = {};
  }
  if (!form.value.substats) {
    form.value.substats = [];
  }
  currentItem.value = item;
  isEditing.value = true;
  dialogVisible.value = true;
}

function resetForm() {
  form.value = emptyEquipment();
  currentItem.value = null;
}

async function saveItem() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    try {
      await store.saveEquipment(form.value);
      dialogVisible.value = false;
      currentItem.value = null;
      ElMessage.success("保存成功");
      await refresh();
    } catch (error) {
      console.error(error);
      ElMessage.error("保存失败");
    }
  });
}

async function confirmDelete(item: EquipmentItem) {
  try {
    await ElMessageBox.confirm(`确认删除 ${item.name}?`, "提示", {
      type: "warning",
    });
    await store.removeEquipment(item.id);
    currentItem.value = null;
    ElMessage.success("删除成功");
    await refresh();
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error("删除失败");
    }
  }
}

async function refresh() {
  try {
    await store.loadEquipment();
  } catch (error) {
    console.error(error);
    ElMessage.error("加载失败");
  }
}

function addSubstat() {
  if (!form.value.substats) {
    form.value.substats = [];
  }
  form.value.substats.push({
    type: "HP",
    value: 10,
  });
}

function removeSubstat(index: number) {
  form.value.substats?.splice(index, 1);
}

function promptUpload(item: EquipmentItem) {
  uploadTargetId.value = item.id;
  uploadDialogVisible.value = true;
}

function openImagePreview(equipmentId: string) {
  previewEquipmentId.value = equipmentId;
  previewImageUrl.value = `/api/equipment/${equipmentId}/image?t=${imageTimestamp.value}`;
  previewVisible.value = true;
}

async function handleFileUpload(uploadFile: any, type: 'png') {
  const file = uploadFile.raw;
  if (!file || !uploadTargetId.value) return;
  
  if (!file.name.toLowerCase().endsWith('.png')) {
    ElMessage.error('只能上传 PNG 格式的图片！');
    return;
  }
  
  try {
    await store.uploadPng(uploadTargetId.value, file);
    ElMessage.success("上传成功");
    imageTimestamp.value = Date.now(); // 更新时间戳以刷新图片
    uploadDialogVisible.value = false;
  } catch (error) {
    console.error(error);
    ElMessage.error("上传失败");
  }
}

async function convertImages() {
  try {
    await store.convertImages();
    ElMessage.success("转换完成");
    // 等待更长时间确保文件系统已经写入完成
    await new Promise(resolve => setTimeout(resolve, 100));
    imageTimestamp.value = Date.now(); // 更新时间戳以刷新图片
    await refresh();
  } catch (error) {
    console.error(error);
    ElMessage.error("转换失败");
  }
}
</script>

<style scoped>
.app-card {
  width: 100%;
  margin: 0;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.toolbar__actions {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.toolbar__filters {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.filter--slot {
  min-width: 140px;
  max-width: 180px;
}

.filter--quality {
  min-width: 140px;
  max-width: 180px;
}

.filter--keyword {
  flex: 1;
  min-width: 220px;
}

.equipment-table {
  width: 100%;
  font-size: 16px;
}

.equipment-table :deep(.el-table__header) th {
  font-size: 16px;
  font-weight: 600;
  padding: 12px 8px;
}

.equipment-table :deep(.el-table__body) td {
  font-size: 15px;
  padding: 12px 8px;
}

.pagination-wrapper {
  padding: 12px 0;
  display: flex;
  justify-content: flex-end;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.image-preview-cell {
  display: flex;
  justify-content: left;
}

/* 减少图片列的单元格padding */
:deep(.el-table .image-column) {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

.image-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #f5f7fa;
  color: #909399;
}

.image-error .el-icon {
  font-size: 24px;
}

.form-image-preview {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.asset-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.asset-preview img {
  max-width: 100%;
  height: auto;
}

.upload-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.upload-section__title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.upload-section :deep(.el-upload) {
  width: 100%;
}

.upload-section :deep(.el-upload-dragger) {
  width: 100%;
  padding: 40px 20px;
}
</style>
