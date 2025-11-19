# 地图编辑器

## 概述

基于游戏真实渲染方式的地图编辑器，支持可视化编辑地图节点、连接关系和怪物生成配置。

## 功能特性

### 后端 (Python/FastAPI)

**API 端点:**
- `GET /api/maps` - 获取所有地图列表
- `GET /api/maps/{map_id}` - 获取单个地图详情
- `POST /api/maps` - 创建新地图
- `PUT /api/maps/{map_id}` - 更新地图
- `DELETE /api/maps/{map_id}` - 删除地图
- `GET /api/maps/{map_id}/image` - 获取地图背景图

**数据模型:**
- `MapMetadata` - 地图元数据
- `MapNode` - 野外地图节点（战斗/传送门）
- `MapLocation` - 城市地图地点
- `SpawnConfig` - 怪物生成配置

### 前端 (Vue 3 + TypeScript)

**核心组件:**

1. **MapEditor.vue** - 主编辑器
   - 整合所有子组件
   - 管理编辑状态
   - 处理保存/加载逻辑

2. **MapList.vue** - 地图列表
   - 按城市/野外分组显示
   - 切换当前编辑地图

3. **MapCanvas.vue** - 可视化画布 ⭐
   - 完全复用游戏渲染样式 (`MapView.vue`)
   - 百分比坐标系统（0-100）
   - SVG 连接线绘制
   - 节点拖拽编辑
   - 网格系统和吸附功能
   - 多种编辑模式：
     * 选择模式
     * 移动模式
     * 连接模式
     * 添加节点模式

4. **PropertyPanel.vue** - 属性面板
   - 战斗节点属性：
     * 基本信息（ID、标签、坐标）
     * 怪物生成配置（数量、间隔、怪物列表）
     * NPC 列表
   - 传送门属性：
     * 目标地图和节点选择
   - 城市地点属性：
     * 名称、描述
     * 路由配置

## 渲染实现细节

### CSS 样式层级

```html
<div class="editor-map-canvas">
  <!-- Layer 1: 背景图片 -->
  <img class="map-image" />
  
  <!-- Layer 2: 网格（可选） -->
  <svg class="grid-overlay" />
  
  <!-- Layer 3: SVG 连接线 -->
  <svg class="node-graph">
    <line class="graph-edge" />
  </svg>
  
  <!-- Layer 4: 节点标记 -->
  <button class="node-marker node-type-battle" />
  <button class="node-marker node-type-portal" />
</div>
```

### 节点样式（游戏一致）

```css
/* 战斗节点 - 红色 */
.node-type-battle {
  color: rgba(239, 68, 68, 0.9);
  border-color: rgba(239, 68, 68, 0.6);
}

/* 传送门 - 蓝色虚线 */
.node-type-portal {
  color: rgba(59, 130, 246, 0.9);
  border-color: rgba(59, 130, 246, 0.6);
  border-style: dashed;
}

/* 城市地点 - 青色 */
.map-location {
  border-color: rgba(34, 211, 238, 0.5);
}
```

### 坐标系统

- 使用百分比坐标 (0-100)
- 与 JSON 数据完全一致
- 支持精确输入和拖拽调整
- 可选网格吸附（5% 步进）

## 使用方法

### 启动服务

```bash
# 后端
cd editor/backend
.venv/bin/python main.py

# 前端
cd editor/frontend
npm run dev
```

### 编辑流程

1. **选择地图**
   - 从左侧列表选择要编辑的地图

2. **添加节点**
   - 点击工具栏的"战斗节点"或"传送门"按钮
   - 在画布上点击位置创建节点

3. **移动节点**
   - 切换到"移动"模式
   - 拖拽节点到新位置
   - 或在右侧属性面板手动输入坐标

4. **建立连接**
   - 切换到"连接"模式
   - 点击起始节点
   - 点击目标节点
   - 连接线自动绘制

5. **配置属性**
   - 选中节点后，在右侧面板编辑：
     * 战斗节点：设置怪物列表和生成参数
     * 传送门：选择目标地图和节点

6. **保存更改**
   - 点击"💾 保存"按钮
   - 数据写入 `src/data/map-metadata.json`

### 快捷键

- `Delete` - 删除选中的节点或连接线
- `Escape` - 取消连接模式，切换回选择模式
- 拖拽节点时开启"吸附"可自动对齐网格

## 数据格式

### 战斗节点示例

```json
{
  "id": "fringe-01",
  "label": "青苔原01",
  "type": "battle",
  "position": { "x": 26, "y": 60 },
  "connections": ["fringe-city-gate", "fringe-04"],
  "spawn": {
    "min": 2,
    "max": 3,
    "intervalSeconds": 900,
    "respawnSeconds": 60,
    "monsters": [
      { "id": "m-slime", "weight": 2 },
      { "id": "m-wolf", "weight": 1 }
    ]
  }
}
```

### 传送门节点示例

```json
{
  "id": "fringe-city-gate",
  "label": "翡冷翠",
  "type": "portal",
  "position": { "x": 6, "y": 64 },
  "connections": ["fringe-01"],
  "destination": {
    "mapId": "florence"
  }
}
```

## 技术栈

- **后端**: Python 3.12, FastAPI, Pydantic
- **前端**: Vue 3, TypeScript, Element Plus, Pinia
- **样式**: 100% 复用游戏 `MapView.vue` 的 CSS

## 设计亮点

1. ✅ **所见即所得** - 编辑器渲染效果与游戏完全一致
2. ✅ **百分比坐标** - 无需转换，直接对应 JSON 数据
3. ✅ **SVG 连接线** - 平滑的矢量图形，支持交互
4. ✅ **网格辅助** - 可视化网格帮助对齐
5. ✅ **类型安全** - TypeScript 保证数据结构正确
6. ✅ **怪物关联** - 从 `monster-blueprints.json` 读取怪物列表

## 待扩展功能

- [ ] 撤销/重做功能
- [ ] 批量操作（框选多个节点）
- [ ] 地图创建向导
- [ ] 背景图片上传
- [ ] 自动布局算法
- [ ] 路径查找可视化
- [ ] 导入/导出单个地图
