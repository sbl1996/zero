<template>
  <div class="app-shell">
    <div class="layout-shell" :class="{ 'is-collapsed': isSidebarCollapsed }">
      <aside class="side-nav">
        <div class="side-nav__brand">
          <div class="side-nav__brand-icon">零</div>
          <div class="side-nav__brand-text">
            编辑器
          </div>
        </div>
        <nav class="side-nav__menu">
          <button
            v-for="item in navItems"
            :key="item.id"
            type="button"
            class="side-nav__item"
            :class="{ 'is-active': activeSection === item.id }"
            @click="handleNavClick(item.id)"
          >
            <span class="side-nav__icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </button>
        </nav>
        <div class="side-nav__foot">其他模块正在规划中</div>
      </aside>

      <button class="sidebar-toggle" @click="toggleSidebar" :title="isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'">
        <span class="sidebar-toggle-icon">{{ isSidebarCollapsed ? '→' : '←' }}</span>
      </button>

      <section class="content-area">
        <!-- Monster Editor -->
        <el-card v-if="activeSection === 'monsters'" shadow="never" class="app-card">
      <template #header>
        <div class="toolbar">
          <div class="toolbar__actions">
            <el-button type="primary" @click="openCreate">新增怪物</el-button>
            <el-button @click="refresh">刷新数据</el-button>
            <el-button
              type="success"
              :loading="store.converting"
              @click="convertAssets"
            >
              生成WebP
            </el-button>
            <el-button text @click="refreshAssets">检查全部素材</el-button>
          </div>
        <div class="toolbar__filters">
          <div class="filter filter--realm">
            <el-select
              v-model="filterRealm"
              size="small"
              placeholder="按境界筛选"
              clearable
            >
              <el-option
                v-for="option in realmFilterOptions"
                :key="option.label"
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
        :data="paginatedMonsters"
        v-loading="store.loading"
        size="small"
        stripe
        class="monster-table"
      >
        <el-table-column prop="id" label="ID" width="240" />
        <el-table-column prop="name" label="名称" width="140" />
        <el-table-column label="境界" width="80">
          <template #default="{ row }">
            {{ numberToRealm(row.realmTier) }}
          </template>
        </el-table-column>
        <el-table-column prop="hp" label="HP" width="90" />
        <el-table-column prop="bp" label="BP" width="90" />
        <el-table-column label="特化" width="120">
          <template #default="{ row }">
            <el-tooltip :content="getSpecializationTooltip(row.specialization)" placement="top">
              <span>{{ getSpecializationLabel(row.specialization) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="奖励" width="120">
          <template #default="{ row }">
            <span>{{ row.rewards?.gold ?? "-" }} GOLD</span>
          </template>
        </el-table-column>
        <el-table-column label="素材" width="200">
          <template #default="{ row }">
            <el-space>
              <el-tag
                size="small"
                :type="statusFor(row.id).png ? 'success' : 'info'"
                :class="[
                  'asset-tag',
                  { 'asset-tag--inactive': !statusFor(row.id).png },
                ]"
                @click="() => openAssetPreview(row.id, 'png')"
              >
                PNG
              </el-tag>
              <el-tag
                size="small"
                :type="statusFor(row.id).webp ? 'success' : 'info'"
                :class="[
                  'asset-tag',
                  { 'asset-tag--inactive': !statusFor(row.id).webp },
                ]"
                @click="() => openAssetPreview(row.id, 'webp')"
              >
                WEBP
              </el-tag>
              <el-tag
                size="small"
                :type="statusFor(row.id).mp4 ? 'success' : 'info'"
                :class="[
                  'asset-tag',
                  { 'asset-tag--inactive': !statusFor(row.id).mp4 },
                ]"
                @click="() => openAssetPreview(row.id, 'mp4')"
              >
                MP4
              </el-tag>
            </el-space>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-space>
              <el-tooltip content="编辑" placement="top">
                <el-button size="small" circle @click="openEdit(row)">
                  <el-icon><Edit /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button size="small" circle type="danger" @click="confirmDelete(row)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="检查" placement="top">
                <el-button size="small" circle @click="() => checkAssets(row.id)">
                  <el-icon><Search /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="上传" placement="top">
                <el-button size="small" circle @click="() => promptUpload(row.id)">
                  <el-icon><Upload /></el-icon>
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
              :total="filteredMonsterCount"
              @current-change="handlePageChange"
            />
          </div>
        </div>
      </el-card>

      <!-- Map Editor -->
      <MapEditor v-else-if="activeSection === 'maps'" />

      <!-- Music Editor -->
      <MusicEditor v-else-if="activeSection === 'music'" />
      
      <!-- Equipment Editor -->
      <EquipmentEditor v-else-if="activeSection === 'equipment'" />
      </section>
    </div>

    <el-dialog v-model="dialogVisible" :title="isEditing ? '编辑怪物' : '新增怪物'" width="480px">
      <el-form ref="formRef" :model="form" label-width="100px" :rules="rules">
        <el-form-item label="ID" prop="id">
          <el-input v-model="form.id" :disabled="isEditing" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="境界" prop="realmTier">
          <el-select v-model="form.realmTier" placeholder="请选择境界" style="width: 100%">
            <el-option
              v-for="option in realmOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="HP" prop="hp">
          <el-input-number v-model="form.hp" :min="1" />
        </el-form-item>
        <el-form-item label="BP" prop="bp">
          <el-input-number v-model="form.bp" :min="1" />
        </el-form-item>
        <el-form-item label="特化" prop="specialization">
          <el-select v-model="form.specialization" placeholder="请选择特化" style="width: 100%">
            <el-option
              v-for="option in specializationOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            >
              <div class="spec-option">
                <div class="spec-option__top">
                  <span>{{ option.label }}</span>
                  <span class="spec-option__coeff">
                    {{ formatSpecializationCoefficients(option.value) }}
                  </span>
                </div>
                <span class="spec-option__description">
                  {{ getSpecializationDescription(option.value) }}
                </span>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="奖励金币">
          <el-input-number v-model="form.rewards.gold" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="store.saving" @click="saveMonster">保存</el-button>
      </template>
    </el-dialog>

    <input
      ref="uploadInput"
      type="file"
      accept=".png"
      class="hidden-input"
      @change="handleFileChange"
    />

    <el-dialog
      v-model="uploadDialogVisible"
      title="上传素材"
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
            :on-change="(file) => handleFileUpload(file.raw, 'png')"
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
        
        <div class="upload-section">
          <h4 class="upload-section__title">MP4 视频</h4>
          <el-upload
            drag
            :auto-upload="false"
            :show-file-list="false"
            accept=".mp4"
            :on-change="(file) => handleFileUpload(file.raw, 'mp4')"
          >
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              拖拽文件到此处或 <em>点击上传</em>
            </div>
            <template #tip>
              <div class="el-upload__tip">支持 .mp4 格式</div>
            </template>
          </el-upload>
        </div>
      </div>
      <template #footer>
        <el-button @click="uploadDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="previewVisible"
      :title="previewTitle"
      width="640px"
      :destroy-on-close="true"
      center
    >
      <div class="asset-preview">
        <img v-if="previewImageUrl && previewTarget?.format !== 'mp4'" :src="previewImageUrl" :alt="previewTitle" />
        <video v-else-if="previewImageUrl && previewTarget?.format === 'mp4'" :src="previewImageUrl" controls autoplay loop />
        <p v-else>素材加载失败，请稍后重试</p>
      </div>
      <template #footer>
        <el-button @click="downloadAsset" type="primary">下载</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import type { FormInstance, FormRules } from "element-plus";
import { Delete, Edit, Search, Upload, UploadFilled } from "@element-plus/icons-vue";

import { useMonsterStore } from "@/stores/monsters";
import type { MonsterBlueprint } from "@/types/monster";
import {
  numberToRealm,
  getRealmOptions,
  getSpecializationLabel,
  getSpecializationTooltip,
  getSpecializationDescription,
  getSpecializationOptions,
  getSpecializationCoefficients,
} from "@/utils/realmMapping";
import MapEditor from "@/components/MapEditor.vue";
import MusicEditor from "@/components/MusicEditor.vue";
import EquipmentEditor from "@/components/EquipmentEditor.vue";

const store = useMonsterStore();
const dialogVisible = ref(false);
const isEditing = ref(false);
const uploadDialogVisible = ref(false);
const uploadTargetId = ref<string | null>(null);
const uploadInput = ref<HTMLInputElement>();
const formRef = ref<FormInstance>();
const realmOptions = getRealmOptions();
const realmFilterOptions = [{ label: "按境界筛选", value: "" }, ...realmOptions];
const specializationOptions = getSpecializationOptions();
type AssetFormat = "png" | "webp" | "mp4";

type AssetPreview = {
  id: string;
  format: AssetFormat;
};

const isSidebarCollapsed = ref(false);

function toggleSidebar() {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
}

function handleNavClick(itemId: string) {
  activeSection.value = itemId;
  // 如果点击的是"地图"，自动收起导航栏
  if (itemId === 'maps') {
    isSidebarCollapsed.value = true;
  }
}

const navItems = [
  { id: "monsters", label: "怪物", icon: "👾" },
  { id: "maps", label: "地图", icon: "🗺️" },
  { id: "music", label: "音乐", icon: "🎵" },
  { id: "equipment", label: "装备", icon: "⚔️" },
];
const activeSection = ref(navItems[0].id);
const filterRealm = ref<number | "">("");
const filterKeyword = ref("");
const previewVisible = ref(false);
const previewTarget = ref<AssetPreview | null>(null);
const previewImageUrl = computed(() =>
  previewTarget.value
    ? `/api/monsters/${previewTarget.value.id}/assets/${previewTarget.value.format}`
    : "",
);
const previewTitle = computed(() =>
  previewTarget.value
    ? `${previewTarget.value.id} ${previewTarget.value.format.toUpperCase()}`
    : "",
);

const formatSpecializationCoefficients = (spec: string): string => {
  const { atk, def, agi } = getSpecializationCoefficients(spec);
  const toPercent = (value: number) => `${Math.round(value * 100)}%`;
  return `ATK ${toPercent(atk)} DEF ${toPercent(def)} AGI ${toPercent(agi)}`;
};

const emptyMonster = (): MonsterBlueprint => ({
  id: "",
  name: "",
  realmTier: 1,
  hp: 1,
  bp: 1,
  specialization: "",
  rewards: { gold: 0 },
});

const form = reactive<MonsterBlueprint>(emptyMonster());

const pageSizeOptions = [10, 14, 24, 48];
const itemsPerPage = ref(14);
const currentPage = ref(1);
const filteredMonsters = computed(() => {
  const keyword = filterKeyword.value.trim().toLowerCase();
  return store.monsters.filter((monster) => {
    if (filterRealm.value !== "" && monster.realmTier !== filterRealm.value) {
      return false;
    }
    if (!keyword) {
      return true;
    }
    const searchable = `${monster.id} ${monster.name}`.toLowerCase();
    return searchable.includes(keyword);
  });
});
const filteredMonsterCount = computed(() => filteredMonsters.value.length);
const paginatedMonsters = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value;
  return filteredMonsters.value.slice(start, start + itemsPerPage.value);
});

watch(
  [filteredMonsterCount, itemsPerPage],
  ([length]) => {
    const totalPages = Math.max(1, Math.ceil(length / itemsPerPage.value));
    if (currentPage.value > totalPages) {
      currentPage.value = totalPages;
    }
  },
);

watch([filterRealm, filterKeyword], () => {
  currentPage.value = 1;
});

watch(previewVisible, (visible) => {
  if (!visible) {
    previewTarget.value = null;
  }
});

function handlePageChange(page: number) {
  currentPage.value = page;
}

const rules: FormRules = {
  id: [{ required: true, message: "ID不能为空", trigger: "blur" }],
  name: [{ required: true, message: "名称不能为空", trigger: "blur" }],
  realmTier: [{ required: true, message: "境界不能为空", trigger: "blur" }],
  hp: [{ required: true, message: "HP不能为空", trigger: "blur" }],
  bp: [{ required: true, message: "BP不能为空", trigger: "blur" }],
  specialization: [{ required: true, message: "特化不能为空", trigger: "blur" }],
};

onMounted(() => {
  refresh();
});

function resetForm() {
  Object.assign(form, emptyMonster());
}

function openCreate() {
  resetForm();
  isEditing.value = false;
  dialogVisible.value = true;
}

function openEdit(monster: MonsterBlueprint) {
  resetForm();
  Object.assign(form, JSON.parse(JSON.stringify(monster)));
  if (!form.rewards) {
    form.rewards = { gold: 0 };
  }
  isEditing.value = true;
  dialogVisible.value = true;
}

async function saveMonster() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    try {
      await store.saveMonster(form);
      dialogVisible.value = false;
      ElMessage.success("保存成功");
    } catch (error) {
      console.error(error);
      ElMessage.error("保存失败");
    }
  });
}

async function confirmDelete(monster: MonsterBlueprint) {
  try {
    await ElMessageBox.confirm(`确认删除 ${monster.name}?`, "提示", {
      type: "warning",
    });
    await store.removeMonster(monster.id);
    ElMessage.success("删除成功");
  } catch (error) {
    if (error !== "cancel") {
      ElMessage.error("删除失败");
    }
  }
}

function statusFor(id: string) {
  return store.assetStatus[id] ?? { png: false, webp: false, mp4: false };
}

function openAssetPreview(id: string, format: AssetFormat) {
  const status = statusFor(id);
  if (!status[format]) {
    ElMessage.warning(`${format.toUpperCase()} 素材尚未生成`);
    return;
  }

  previewTarget.value = { id, format };
  previewVisible.value = true;
}

async function checkAssets(id: string) {
  try {
    await store.refreshAssetStatus([id]);
    const status = statusFor(id);
    ElMessage.success(`PNG: ${status.png ? "✓" : "✗"}, WEBP: ${status.webp ? "✓" : "✗"}, MP4: ${status.mp4 ? "✓" : "✗"}`);
  } catch {
    ElMessage.error("检查失败");
  }
}

function promptUpload(id: string) {
  uploadTargetId.value = id;
  uploadDialogVisible.value = true;
}

async function handleFileUpload(file: File, type: 'png' | 'mp4') {
  if (!uploadTargetId.value) return;
  
  try {
    if (type === 'png') {
      await store.uploadPng(uploadTargetId.value, file);
    } else {
      await store.uploadMp4(uploadTargetId.value, file);
    }
    ElMessage.success(`${type.toUpperCase()} 上传成功`);
  } catch {
    ElMessage.error(`${type.toUpperCase()} 上传失败`);
  }
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !uploadTargetId.value) return;
  try {
    await store.uploadPng(uploadTargetId.value, file);
    ElMessage.success("上传成功");
  } catch {
    ElMessage.error("上传失败");
  } finally {
    input.value = "";
  }
}

async function convertAssets() {
  try {
    await store.convertAssets();
    ElMessage.success("转换脚本执行完成");
  } catch {
    ElMessage.error("转换失败");
  }
}

async function refreshAssets() {
  await store.refreshAssetStatus();
  ElMessage.success("已刷新素材状态");
}

async function refresh() {
  try {
    await store.loadMonsters();
  } catch (error) {
    console.error(error);
    ElMessage.error("加载失败");
  }
}

function downloadAsset() {
  if (!previewTarget.value) return;
  
  const { id, format } = previewTarget.value;
  const url = `/api/monsters/${id}/assets/${format}`;
  const filename = `${id}.${format}`;
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
</script>

<style scoped>
.app-shell {
  padding: 24px;
  min-height: 100vh;
  background-color: #f5f6fa;
  box-sizing: border-box;
}

.layout-shell {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  position: relative;
  transition: gap 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.side-nav {
  width: 220px;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  border: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: calc(100vh - 48px);
  box-sizing: border-box;
  flex-shrink: 0;
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              padding 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.layout-shell.is-collapsed {
  gap: 0;
}

.layout-shell.is-collapsed .side-nav {
  width: 0;
  padding-left: 0;
  padding-right: 0;
  opacity: 0;
  transform: translateX(-20px);
  overflow: hidden;
}

.sidebar-toggle {
  position: absolute;
  left: 220px;
  top: 24px;
  transform: translateX(-50%);
  z-index: 100;
  border: 1px solid #ebeef5;
  background: #fff;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: left 0.35s cubic-bezier(0.4, 0, 0.2, 1),
              transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  color: #606266;
}

.sidebar-toggle:hover {
  background-color: #f5f7fa;
  border-color: #dcdfe6;
}

.sidebar-toggle-icon {
  font-weight: bold;
}

.layout-shell.is-collapsed .sidebar-toggle {
  left: 14px;
  transform: translateX(0);
}

.side-nav__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 600;
  font-size: 18px;
  white-space: nowrap;
}

.side-nav__brand-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.side-nav__subtitle {
  font-size: 14px;
  color: #909399;
  white-space: nowrap;
}

.side-nav__menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.side-nav__item {
  border: none;
  background: transparent;
  padding: 12px 16px;
  text-align: left;
  font-size: 15px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  color: #2c3e50;
  transition: background 0.2s ease;
  white-space: nowrap;
}

.side-nav__item:hover {
  background: #f5f7ff;
}

.side-nav__item.is-active {
  background: #f0f1ff;
  color: #409eff;
  font-weight: 600;
}

.side-nav__icon {
  font-size: 16px;
}

.side-nav__foot {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
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

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0; /* Prevents flex item from overflowing */
}

/* 响应式布局 */
@media (max-width: 1400px) {
  .app-card {
    max-width: 1400px;
    width: 98%;
  }
}

@media (max-width: 1200px) {
  .app-card {
    max-width: 1200px;
    width: 98%;
  }

  .monster-table :deep(.el-table__header) th {
    font-size: 14px;
    padding: 10px 6px;
  }

  .monster-table :deep(.el-table__body) td {
    font-size: 13px;
    padding: 10px 6px;
  }
}

@media (max-width: 1100px) {
  .layout-shell {
    flex-direction: column;
  }

  .side-nav {
    width: 100%;
    height: auto;
    flex-direction: row;
    align-items: center;
    overflow-x: auto;
  }

  .layout-shell.is-collapsed .side-nav {
    display: none;
  }

  .sidebar-toggle {
    display: none; /* Hide toggle on this layout */
  }
}

@media (max-width: 768px) {
  .app-shell {
    padding: 16px;
  }

  .app-card {
    width: 100%;
  }

  .toolbar {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }

  .toolbar__filters {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar__filters .filter {
    width: 100%;
    min-width: 0;
  }

  .monster-table :deep(.el-table__header) th,
  .monster-table :deep(.el-table__body) td {
    font-size: 12px;
    padding: 8px 4px;
  }

  .side-nav {
    padding: 16px;
  }
}

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
.filter--realm {
  min-width: 140px;
  max-width: 180px;
}

.filter--keyword {
  flex: 1;
  min-width: 220px;
}
.toolbar__filters .el-input__inner,
.toolbar__filters .el-select .el-input__inner {
  font-size: 15px;
}
.spec-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.spec-option__top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.spec-option__coeff,
.spec-option__description {
  font-size: 12px;
  color: #8492a6;
}

.monster-table {
  width: 100%;
  font-size: 16px;
}

.monster-table :deep(.el-table__header) th {
  font-size: 16px;
  font-weight: 600;
  padding: 12px 8px;
}

.monster-table :deep(.el-table__body) td {
  font-size: 15px;
  padding: 12px 8px;
}

.monster-table :deep(.el-tag) {
  font-size: 13px;
}

.hidden-input {
  display: none;
}

.asset-tag {
  cursor: pointer;
  user-select: none;
}

.asset-tag--inactive {
  opacity: 0.65;
  cursor: not-allowed;
}

.asset-preview {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-preview img,
.asset-preview video {
  max-width: 100%;
  max-height: 60vh;
  width: auto;
  height: auto;
  display: block;
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
