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

- 创建、编辑、删除怪物
- 管理怪物素材（PNG, WEBP, MP4）
- 批量转换资源
- 按境界筛选

### 2. 地图编辑器 🗺️

#### 核心功能
- ✅ 可视化编辑野外地图节点
- ✅ 可视化编辑城市地图地点
- ✅ 拖拽调整节点位置
- ✅ 点击建立节点连接
- ✅ 配置怪物生成参数
- ✅ 设置传送门目标
- ✅ 网格辅助对齐

#### 设计特点
- **所见即所得**: 完全复用游戏 `MapView.vue` 的渲染样式
- **百分比坐标**: 使用 0-100 坐标系统，与数据文件一致
- **SVG 连接线**: 矢量图形，平滑美观
- **类型安全**: TypeScript 类型定义完整

### 3. 音乐管理器 🎵 **新增**

#### 核心功能
- ✅ 查看所有音乐文件（自动扫描 `src/assets/*.mp3`）
- ✅ 在线预览音乐
- ✅ 上传新音乐文件
- ✅ 删除音乐文件
- ✅ 地图编辑器中选择背景音乐（环境/战斗）

#### 技术实现
- **后端 API**: FastAPI 提供 RESTful 接口
- **文件管理**: 直接操作 `src/assets/` 目录
- **音频流**: 支持音乐流式播放
- **集成**: PropertyPanel 中的 BGM 下拉选择器

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
- `Delete`: 删除选中的节点或连接线
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

### 地图 API ✨ 新增
- `GET /api/maps` - 获取地图列表
- `GET /api/maps/{id}` - 获取地图详情
- `POST /api/maps` - 创建地图
- `PUT /api/maps/{id}` - 更新地图
- `DELETE /api/maps/{id}` - 删除地图
- `GET /api/maps/{id}/image` - 获取地图背景图

## 数据文件

- `src/data/monster-blueprints.json` - 怪物数据
- `src/data/map-metadata.json` - 地图数据 ✨ 编辑器可修改
- `src/assets/raw/` - 怪物原始素材
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
