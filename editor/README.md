# 游戏编辑器

## 项目结构

```
editor/
├── backend/              # Python/FastAPI 后端
│   ├── app/
│   │   ├── routes/
│   │   │   ├── monsters.py   # 怪物 API
│   │   │   ├── maps.py       # 地图 API
│   │   │   └── music.py      # 音乐 API ✨ 新增
│   │   ├── models.py          # 数据模型
│   │   ├── repository.py      # 数据持久化
│   │   └── config.py          # 配置
│   └── main.py
├── frontend/             # Vue 3 前端
│   ├── src/
│   │   ├── components/
│   │   │   ├── MapEditor.vue      # 地图编辑器主组件
│   │   │   ├── MapList.vue        # 地图列表
│   │   │   ├── MapCanvas.vue      # 可视化画布
│   │   │   ├── PropertyPanel.vue  # 属性面板（已更新 BGM 选择器）
│   │   │   └── MusicEditor.vue    # 音乐管理器 ✨ 新增
│   │   ├── stores/
│   │   │   ├── monsters.ts
│   │   │   └── maps.ts            # 地图状态管理
│   │   ├── types/
│   │   │   ├── monster.ts
│   │   │   └── map.ts             # 地图类型定义
│   │   ├── api/
│   │   │   ├── index.ts           # API 客户端
│   │   │   └── music.ts           # 音乐 API ✨ 新增
│   │   └── App.vue                # 主应用（已更新）
│   └── package.json
├── start-map-editor.sh   # 快速启动脚本
├── test_music.py         # 音乐功能测试 ✨ 新增
├── MAP_EDITOR.md         # 地图编辑器文档
└── MUSIC_EDITOR.md       # 音乐管理器文档 ✨ 新增
```

## 功能模块

### 1. 怪物编辑器 👾

#### 核心功能
- ✅ 创建、编辑、删除怪物
- ✅ 管理怪物素材（PNG, WEBP, MP4）
- ✅ 批量转换 PNG 为 WebP
- ✅ 按境界筛选怪物
- ✅ 关键字搜索（ID/名称）
- ✅ 在线预览素材（图片/视频）
- ✅ 素材上传与下载

#### 怪物属性
- **基本信息**: ID、名称、境界
- **战斗属性**: HP、BP（战斗力）
- **特化方向**: 攻击型、防御型、敏捷型、均衡型等（影响 ATK/DEF/AGI 系数）
- **奖励**: 击败后获得的金币

#### 素材管理
- **PNG**: 原始图片素材
- **WebP**: 自动转换的优化格式（用于游戏）
- **MP4**: 动画素材（可选）
- 点击素材标签可预览/下载
- 支持拖拽上传

### 2. 地图编辑器 🗺️

#### 核心功能
- ✅ 可视化编辑野外地图节点（战斗/传送门）
- ✅ 可视化编辑城市地图地点
- ✅ 拖拽调整节点位置（支持网格吸附）
- ✅ 点击建立节点连接关系
- ✅ 配置怪物生成参数（数量、间隔、权重）
- ✅ 设置传送门目标（跨地图传送）
- ✅ 配置地图背景音乐（环境/战斗）
- ✅ 撤销/重做功能（Ctrl+Z / Ctrl+Y）
- ✅ 保存状态追踪（未保存提醒）
- ✅ 网格辅助对齐（可切换）

#### 编辑模式
- **选择模式**: 点击选中节点/地点查看属性
- **移动模式**: 拖拽移动节点位置
- **连接模式**: 点击两个节点建立连接
- **添加模式**: 
  - 野外地图: 添加战斗节点/传送门
  - 城市地图: 添加地点标记

#### 设计特点
- **所见即所得**: 完全复用游戏 `MapView.vue` 的渲染样式
- **百分比坐标**: 使用 0-100 坐标系统，与数据文件一致
- **SVG 连接线**: 矢量图形，平滑美观，可交互
- **类型安全**: TypeScript 类型定义完整
- **历史追踪**: 完整的撤销/重做栈，保存点标记

### 3. 音乐管理器 🎵

#### 核心功能
- ✅ 查看所有音乐文件（自动扫描 `src/assets/*.mp3`）
- ✅ 在线预览音乐（带播放控制）
- ✅ 上传新音乐文件（拖拽/点击）
- ✅ 删除音乐文件（二次确认）
- ✅ 地图编辑器中选择背景音乐（环境/战斗）

#### 播放器功能
- **播放控制**: 播放/暂停、进度条拖动
- **音量控制**: 音量调节（记住上次设置）
- **缓冲显示**: 可视化缓冲进度
- **时间显示**: 当前时间/总时长
- **Range 请求**: 支持音频流式加载和跳转

#### 技术实现
- **后端 API**: FastAPI 提供 RESTful 接口
- **文件管理**: 直接操作 `src/assets/` 目录
- **音频流**: 支持 HTTP Range 请求的流式播放
- **集成**: PropertyPanel 中的 BGM 下拉选择器
- **持久化**: 音量设置保存到 localStorage

详见 [MUSIC_EDITOR.md](./MUSIC_EDITOR.md)

## 快速开始

### 环境要求
- Python 3.12+
- Node.js 18+
- pnpm 或 npm

### 安装依赖

```bash
# 后端
cd editor/backend
python -m venv .venv
.venv/bin/pip install -e .

# 前端
cd editor/frontend
npm install  # 或 pnpm install
```

### 启动服务

**方式 1: 使用启动脚本（推荐）**
```bash
cd editor
./start-map-editor.sh
```

**方式 2: 手动启动**
```bash
# 终端 1 - 后端
cd editor/backend
.venv/bin/python main.py

# 终端 2 - 前端  
cd editor/frontend
npm run dev
```

### 访问编辑器

1. 打开浏览器访问前端地址（通常是 http://localhost:5173）
2. 左侧导航选择模块:
   - **👾 怪物**: 怪物编辑器
   - **🗺️ 地图**: 地图编辑器
   - **🎵 音乐**: 音乐管理器

## 地图编辑器使用

### 编辑流程

1. **选择地图**
   - 从左侧列表选择要编辑的地图
   - 城市地图和野外地图分组显示

2. **编辑模式**
   - **选择**: 点击选中节点查看/编辑属性
   - **移动**: 拖拽节点改变位置
   - **连接**: 点击两个节点建立连接
   - **添加**: 点击画布创建新节点

3. **节点操作**
   - 拖拽移动节点位置
   - 右侧面板编辑属性
   - 配置怪物生成列表
   - 设置传送门目标

4. **保存更改**
   - 点击工具栏的"💾 保存"按钮
   - 数据自动写入 `../../src/data/map-metadata.json`

### 快捷键
- `Ctrl+Z`: 撤销上一步操作
- `Ctrl+Y` / `Ctrl+Shift+Z`: 重做
- `Delete`: 删除选中的节点或地点
- `Escape`: 取消当前操作，返回选择模式

## API 文档

### 怪物 API
- `GET /api/monsters` - 获取怪物列表
- `POST /api/monsters` - 创建/更新怪物
- `DELETE /api/monsters/{id}` - 删除怪物
- `GET /api/monsters/{id}/assets` - 获取素材状态
- `POST /api/monsters/{id}/assets/png` - 上传 PNG
- `POST /api/monsters/{id}/assets/mp4` - 上传 MP4
- `POST /api/monsters/assets/convert` - 转换 WebP

### 地图 API
- `GET /api/maps` - 获取地图列表
- `GET /api/maps/{id}` - 获取地图详情
- `POST /api/maps` - 创建地图
- `PUT /api/maps/{id}` - 更新地图
- `DELETE /api/maps/{id}` - 删除地图
- `GET /api/maps/{id}/image` - 获取地图背景图

### 音乐 API
- `GET /api/music` - 获取音乐列表
- `POST /api/music/upload` - 上传音乐文件
- `DELETE /api/music/{filename}` - 删除音乐文件
- `GET /api/music/{filename}/stream` - 流式播放音乐（支持 Range 请求）

## 数据文件

- `src/data/monster-blueprints.json` - 怪物数据（编辑器可修改）
- `src/data/map-metadata.json` - 地图数据（编辑器可修改）
- `src/assets/raw/` - 怪物原始素材（PNG/MP4）
- `src/assets/webp/` - 怪物 WebP 素材（自动生成）
- `src/assets/*.mp3` - 背景音乐文件（编辑器可管理）
- `public/images/maps/` - 地图背景图

## 技术栈

### 后端
- **FastAPI** - 现代化 Web 框架
- **Pydantic** - 数据验证和序列化
- **Python 3.12** - 最新语言特性

### 前端
- **Vue 3** - 组合式 API
- **TypeScript** - 类型安全
- **Element Plus** - UI 组件库
- **Pinia** - 状态管理
- **Vite** - 构建工具

## 开发规范

### 代码风格
- 后端: Black + Ruff
- 前端: ESLint + Prettier

### 提交规范
- `feat:` 新功能
- `fix:` 修复
- `docs:` 文档
- `style:` 样式
- `refactor:` 重构

## 故障排除

### 后端启动失败
- 检查端口 8000 是否被占用
- 确认虚拟环境已激活
- 检查日志: `tail -f /tmp/editor-backend.log`

### 前端启动失败
- 检查 node_modules 是否安装
- 清除缓存: `rm -rf node_modules .vite && npm install`
- 检查日志: `tail -f /tmp/editor-frontend.log`

### 地图编辑器无法保存
- 确认后端服务正在运行
- 检查 `src/data/map-metadata.json` 文件权限
- 查看浏览器控制台错误信息

## 许可证

MIT
