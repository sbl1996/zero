from PIL import Image, ImageFilter
import numpy as np
from collections import deque
import os

def remove_white_border(input_path, output_path=None, feather=1.5, threshold=240, black_to_white_threshold=20):
    """
    去除图片四周的白边并转为透明，附带黑框→白边预处理。
    
    参数：
        input_path (str): 输入图片路径
        output_path (str): 输出文件路径（默认自动生成）
        feather (float): 边缘羽化半径，越大过渡越柔和
        threshold (int): 白色判断阈值，默认 240
        black_to_white_threshold (int): 判断黑框的亮度阈值，默认 50
    
    返回：
        输出文件路径
    """
    im = Image.open(input_path).convert("RGBA")
    arr = np.array(im)
    R, G, B, A = arr[...,0], arr[...,1], arr[...,2], arr[...,3]

    # --- 检查最外圈是否为黑色（平均亮度低） ---
    border_pixels = np.concatenate([
        np.stack([R[0,:], G[0,:], B[0,:]], axis=-1),
        np.stack([R[-1,:], G[-1,:], B[-1,:]], axis=-1),
        np.stack([R[:,0], G[:,0], B[:,0]], axis=-1),
        np.stack([R[:,-1], G[:,-1], B[:,-1]], axis=-1),
    ])
    border_brightness = border_pixels.mean(axis=1).mean()

    if border_brightness < black_to_white_threshold:
        print("检测到黑边，已自动转为白边处理。")
        mask_black = (R < black_to_white_threshold) & (G < black_to_white_threshold) & (B < black_to_white_threshold)
        R[mask_black] = 255
        G[mask_black] = 255
        B[mask_black] = 255
        arr[...,0], arr[...,1], arr[...,2] = R, G, B

    # --- 去除白边 ---
    near_white = (R > threshold) & (G > threshold) & (B > threshold)
    h, w = near_white.shape
    visited = np.zeros_like(near_white, dtype=bool)
    q = deque()

    for x in range(w):
        if near_white[0, x]: visited[0, x] = True; q.append((0, x))
        if near_white[h-1, x]: visited[h-1, x] = True; q.append((h-1, x))
    for y in range(h):
        if near_white[y, 0]: visited[y, 0] = True; q.append((y, 0))
        if near_white[y, w-1]: visited[y, w-1] = True; q.append((y, w-1))

    dirs = [(1,0),(-1,0),(0,1),(0,-1)]
    while q:
        y, x = q.popleft()
        for dy, dx in dirs:
            ny, nx = y+dy, x+dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and near_white[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    mask = Image.fromarray((visited * 255).astype(np.uint8), mode="L")
    if feather > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(radius=feather))

    feather_np = np.array(mask).astype(np.float32) / 255.0
    new_alpha = (A.astype(np.float32) * (1.0 - feather_np)).clip(0, 255).astype(np.uint8)
    arr[...,3] = new_alpha

    out_img = Image.fromarray(arr, mode="RGBA")

    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = base + "_transparent.png"

    out_img.save(output_path)
    print(f"✅ 已保存：{output_path}")
    return output_path



if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="去除图片白边并转为透明")
    parser.add_argument("input", help="输入图片路径（支持 PNG/JPG/WEBP）")
    parser.add_argument("-o", "--output", help="输出文件路径（默认自动生成）")
    parser.add_argument("-f", "--feather", type=float, default=1.5, help="边缘羽化半径，越大过渡越柔和（默认 1.5）")
    parser.add_argument("-t", "--threshold", type=int, default=240, help="白色判断阈值，范围 0-255（默认 240）")

    args = parser.parse_args()
    remove_white_border(args.input, args.output, args.feather, args.threshold)