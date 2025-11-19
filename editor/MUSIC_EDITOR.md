# 音乐素材管理功能

## 功能概述

编辑器新增音乐素材管理模块，支持：
- 📋 查看所有音乐文件列表（自动扫描 `src/assets/*.mp3`）
- ▶️ 在线预览音乐
- ⬆️ 上传新的音乐文件
- 🗑️ 删除音乐文件
- 🎵 在地图编辑器中选择背景音乐

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
- 显示文件名和文件大小

#### 预览音乐
- 点击"预览"列的 ▶️ 按钮开始播放
- 再次点击或播放完毕自动停止

#### 上传音乐
1. 点击顶部 **上传音乐** 按钮
2. 拖拽 MP3 文件到对话框或点击选择文件
3. 点击 **确认上传**
4. 上传成功后列表自动刷新

#### 删除音乐
1. 点击操作列的 🗑️ 按钮
2. 确认删除
3. 文件从 `src/assets/` 目录中删除

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
播放/下载音乐文件

**响应：** 音频流（audio/mpeg）

## 技术实现

### 后端
- **FastAPI 路由**: `editor/backend/app/routes/music.py`
- **文件存储**: `src/assets/` 目录
- **支持格式**: MP3

### 前端
- **组件**: `editor/frontend/src/components/MusicEditor.vue`
- **API**: `editor/frontend/src/api/music.ts`
- **集成**: `PropertyPanel.vue` 中的 BGM 选择器

### 数据流
```
前端 ─GET /api/music→ 后端扫描 src/assets/*.mp3 → 返回文件列表
前端 ─POST /api/music/upload→ 后端保存文件 → 刷新列表
PropertyPanel ─选择音乐→ 更新 map.bgm → 保存到 map-metadata.json
```

## 已有音乐

当前 `src/assets/` 目录包含 4 个音乐文件：
- Battle in the Glade.mp3 (1.5 MB)
- Feilengcui's Vigil.mp3 (7.0 MB)
- Wandering Whispers.mp3 (4.5 MB)
- Whisperfield Blessing.mp3 (7.0 MB)

## 注意事项

1. **文件格式限制**：仅支持 MP3 格式
2. **文件名冲突**：上传同名文件会提示错误
3. **删除确认**：删除操作需要二次确认，谨慎操作
4. **实时同步**：音乐文件直接操作游戏资源目录，编辑器和游戏共享资源

## 扩展建议

未来可以添加的功能：
- [ ] 音频波形可视化
- [ ] 音乐标签分类（环境/战斗/剧情等）
- [ ] 批量上传
- [ ] 音频格式转换（自动将其他格式转为 MP3）
- [ ] 音量预设和循环点标记
- [ ] 音乐试听时的音量控制
