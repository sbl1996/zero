# 音乐素材管理功能

## 功能概述

编辑器新增音乐素材管理模块，支持：
- 📋 查看所有音乐文件列表（自动扫描 `src/assets/*.mp3`）
- ▶️ 在线预览音乐（带完整播放器控制）
- ⬆️ 上传新的音乐文件（拖拽/点击）
- 🗑️ 删除音乐文件（二次确认）
- 🎵 在地图编辑器中选择背景音乐（环境/战斗）

## 播放器功能

### 播放控制
- **播放/暂停**: 点击播放按钮切换状态
- **进度条**: 拖动进度条跳转到指定位置
- **缓冲显示**: 实时显示已缓冲的音频片段
- **时间显示**: 当前播放时间 / 总时长

### 音量控制
- **音量调节**: 0-100% 滑块调节
- **音量记忆**: 设置自动保存到 localStorage
- **音量显示**: 实时显示当前音量百分比

### 技术特性
- **Range 请求**: 支持 HTTP Range 请求，实现音频流式加载
- **Seek 优化**: 检测目标位置是否已缓冲，避免重新加载
- **多段缓冲**: 可视化显示所有已缓冲的音频段
- **自动播放**: 选择音乐后自动开始播放

## 使用方法

### 1. 启动编辑器

```bash
# 启动后端服务
cd editor/backend
.venv/bin/python main.py

# 启动前端（新终端）
cd editor/frontend
npm run dev
```

访问 http://localhost:5173，在左侧导航栏点击 **🎵 音乐** 进入音乐管理界面。

### 2. 音乐管理

#### 查看音乐列表
- 界面自动显示 `src/assets/*.mp3` 中的所有音乐文件
- 显示文件名和文件大小（自动格式化为 KB/MB）
- 共 X 个音乐文件提示

#### 预览音乐
1. 点击"预览"列的 🎧 按钮开始播放
2. 底部弹出播放器控制面板
3. 支持的操作：
   - **播放/暂停**: 切换播放状态
   - **进度条拖动**: 跳转到任意位置
   - **音量调节**: 0-100% 滑块控制
   - **关闭播放器**: 停止播放并关闭面板
4. 播放器显示：
   - 当前播放文件名
   - 播放时间和总时长
   - 缓冲进度（灰色条）
   - 播放进度（蓝色条）

#### 上传音乐
1. 点击顶部 **上传音乐** 按钮
2. 拖拽 MP3 文件到对话框或点击选择文件
3. 点击 **确认上传**
4. 上传成功后列表自动刷新

**限制:**
- 仅支持 MP3 格式
- 文件名不能重复（会提示错误）

#### 删除音乐
1. 点击操作列的 🗑️ 按钮
2. 弹出确认对话框
3. 确认后文件从 `src/assets/` 目录中删除
4. 列表自动刷新

### 3. 在地图中使用音乐

1. 进入 **🗺️ 地图** 编辑器
2. 从左侧地图列表选择要编辑的地图
3. 在右侧属性面板中找到"背景音乐"部分
4. 从下拉菜单中选择：
   - **环境音乐**：地图探索时播放
   - **战斗音乐**：进入战斗时播放
5. 点击 **💾 保存** 保存地图配置

音乐配置将保存到 `src/data/map-metadata.json` 中：

```json
{
  "id": "florence",
  "name": "翡冷翠",
  "bgm": {
    "ambient": "Feilengcui's Vigil.mp3",
    "battle": "Battle in the Glade.mp3"
  }
}
```

## API 接口

### GET /api/music
获取所有音乐文件列表

**响应示例：**
```json
[
  {
    "filename": "Battle in the Glade.mp3",
    "size": 1502297,
    "path": "src/assets/Battle in the Glade.mp3"
  }
]
```

### POST /api/music/upload
上传音乐文件

**请求：** `multipart/form-data` with `file` field
**响应：**
```json
{
  "success": true,
  "data": {
    "filename": "new-music.mp3",
    "size": 3145728
  }
}
```

### DELETE /api/music/{filename}
删除音乐文件

**响应：**
```json
{
  "success": true
}
```

### GET /api/music/{filename}/stream
播放/下载音乐文件（支持 Range 请求）

**请求头示例:**
```
Range: bytes=0-1048575
```

**响应:**
- 状态码: `206 Partial Content` (Range 请求) 或 `200 OK` (完整文件)
- Content-Type: `audio/mpeg`
- Content-Range: `bytes 0-1048575/3145728` (Range 请求)
- Accept-Ranges: `bytes`

**特性:**
- 支持断点续传
- 支持拖动进度条时的精确跳转
- 优化流式加载，减少带宽消耗

## 技术实现

### 后端 (Python/FastAPI)
- **路由文件**: `editor/backend/app/routes/music.py`
- **存储目录**: `src/assets/` (游戏资源目录)
- **支持格式**: MP3 (audio/mpeg)
- **Range 请求**: 支持分段传输，优化大文件播放
- **文件操作**: 
  - `list_music()`: 扫描目录，返回文件信息
  - `upload_music()`: 保存上传的文件
  - `delete_music()`: 删除指定文件
  - `serve_music()`: 流式传输音频（支持 Range）

### 前端 (Vue 3 + TypeScript)
- **主组件**: `editor/frontend/src/components/MusicEditor.vue`
- **API 封装**: `editor/frontend/src/api/music.ts`
- **状态管理**: 
  - `musicList`: 音乐文件列表
  - `currentPlaying`: 当前播放的文件
  - `volume`: 音量（持久化到 localStorage）
  - `bufferedRanges`: 已缓冲的音频片段
- **播放器实现**:
  - HTML5 `<audio>` 元素
  - 缓冲进度可视化（多段显示）
  - Seek 优化（检测缓冲状态）
  - 音量记忆（localStorage）

### 集成到地图编辑器
- **组件**: `editor/frontend/src/components/PropertyPanel.vue`
- **BGM 选择器**: 
  - 环境音乐下拉菜单
  - 战斗音乐下拉菜单
  - 自动加载音乐列表
  - 实时更新地图配置

### 数据流
```
前端 MusicEditor ─GET /api/music→ 后端扫描 src/assets/*.mp3 → 返回列表
前端 ─POST /api/music/upload→ 后端保存文件 → 刷新列表
前端 ─播放音乐→ GET /api/music/{filename}/stream (Range 请求) → 流式返回
PropertyPanel ─选择音乐→ 更新 map.bgm → 保存到 map-metadata.json
```

## 已有音乐

当前 `src/assets/` 目录包含 4 个音乐文件：
- Battle in the Glade.mp3 (1.5 MB)
- Feilengcui's Vigil.mp3 (7.0 MB)
- Wandering Whispers.mp3 (4.5 MB)
- Whisperfield Blessing.mp3 (7.0 MB)

## 注意事项

1. **文件格式限制**：仅支持 MP3 格式（audio/mpeg）
2. **文件名冲突**：上传同名文件会返回 409 Conflict 错误
3. **删除确认**：删除操作需要二次确认，谨慎操作
4. **实时同步**：音乐文件直接操作游戏资源目录，编辑器和游戏共享资源
5. **音量记忆**：播放器音量设置自动保存，下次打开保持
6. **缓冲优化**：支持 Range 请求，拖动进度条时仅加载必要片段
7. **浏览器兼容性**：使用标准 HTML5 Audio API，主流浏览器均支持

## 扩展建议

未来可以添加的功能：
- [ ] 音频波形可视化（使用 Web Audio API）
- [ ] 音乐标签分类（环境/战斗/剧情等）
- [ ] 批量上传多个文件
- [ ] 音频格式转换（自动将其他格式转为 MP3）
- [ ] 音量预设和循环点标记
- [ ] 播放列表功能
- [ ] 音乐淡入淡出效果预览
- [ ] 音频剪辑功能（在线裁剪音乐片段）
- [ ] BPM 检测和节奏分析
- [ ] 音乐元数据编辑（标题、作者、版权信息）
