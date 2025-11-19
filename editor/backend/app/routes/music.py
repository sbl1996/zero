from __future__ import annotations

from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status, Request
from fastapi.responses import FileResponse, StreamingResponse

from ..config import Settings, get_settings

router = APIRouter(prefix="/api/music", tags=["music"])


class MusicRepository:
    """音乐文件管理"""

    def __init__(self, assets_dir: Path):
        self.assets_dir = assets_dir

    def list_music(self) -> List[dict]:
        """获取所有音乐文件"""
        mp3_files = list(self.assets_dir.glob("*.mp3"))
        return [
            {
                "filename": f.name,
                "size": f.stat().st_size,
                "path": str(f.relative_to(self.assets_dir.parent.parent)),
            }
            for f in sorted(mp3_files, key=lambda x: x.name)
        ]

    def upload_music(self, file: UploadFile) -> dict:
        """上传新音乐文件"""
        if not file.filename or not file.filename.endswith(".mp3"):
            raise ValueError("只支持 MP3 格式")

        file_path = self.assets_dir / file.filename
        if file_path.exists():
            raise FileExistsError(f"文件 {file.filename} 已存在")

        content = file.file.read()
        with file_path.open("wb") as f:
            f.write(content)

        return {"filename": file.filename, "size": file_path.stat().st_size}

    def delete_music(self, filename: str) -> None:
        """删除音乐文件"""
        file_path = self.assets_dir / filename
        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {filename}")
        file_path.unlink()

    def serve_music(self, filename: str) -> Path:
        """提供音乐文件"""
        file_path = self.assets_dir / filename
        if not file_path.exists():
            raise FileNotFoundError(f"文件不存在: {filename}")
        return file_path


@router.get("", response_model=List[dict])
def list_music(settings: Settings = Depends(get_settings)):
    """获取音乐列表"""
    repo = MusicRepository(settings.assets_dir)
    return repo.list_music()


@router.post("/upload")
async def upload_music(
    file: UploadFile = File(...), settings: Settings = Depends(get_settings)
):
    """上传音乐文件"""
    repo = MusicRepository(settings.assets_dir)
    try:
        result = repo.upload_music(file)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    except FileExistsError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))


@router.delete("/{filename}")
def delete_music(filename: str, settings: Settings = Depends(get_settings)):
    """删除音乐文件"""
    repo = MusicRepository(settings.assets_dir)
    try:
        repo.delete_music(filename)
        return {"success": True}
    except FileNotFoundError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))


@router.get("/{filename}/stream")
def stream_music(filename: str, request: Request, settings: Settings = Depends(get_settings)):
    """播放音乐（支持 Range 请求）"""
    repo = MusicRepository(settings.assets_dir)
    try:
        file_path = repo.serve_music(filename)
        
        # 获取文件大小
        file_size = file_path.stat().st_size
        
        # 检查是否有 Range 请求头
        range_header = request.headers.get("range")
        
        if not range_header:
            # 没有 Range 请求，返回整个文件
            return FileResponse(
                file_path, 
                media_type="audio/mpeg",
                headers={
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(file_size)
                }
            )
        
        # 解析 Range 请求
        range_match = range_header.replace("bytes=", "").split("-")
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1
        
        # 确保范围有效
        start = max(0, min(start, file_size - 1))
        end = max(start, min(end, file_size - 1))
        content_length = end - start + 1
        
        # 读取文件片段
        def iter_file():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                chunk_size = 8192
                while remaining > 0:
                    chunk = f.read(min(chunk_size, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk
        
        # 返回部分内容
        return StreamingResponse(
            iter_file(),
            media_type="audio/mpeg",
            status_code=206,  # Partial Content
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            }
        )
    except FileNotFoundError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(e))
