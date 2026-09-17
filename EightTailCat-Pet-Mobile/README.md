# 八条猫桌宠 · SillyTavern 移动触屏版

与 PC 版 `EightTailCat-Pet` **独立共存**：专为手机端酒馆优化（Touch 拖拽、缩小贴靠右下角、底部抽屉设置面板）。

## 安装

1. 将整个 `EightTailCat-Pet-Mobile` 文件夹复制到酒馆扩展目录之一：
   - 当前用户：`SillyTavern/data/<user>/extensions/EightTailCat-Pet-Mobile`
   - 所有用户：`SillyTavern/public/scripts/extensions/third-party/EightTailCat-Pet-Mobile`
2. 重启 SillyTavern，在 **扩展** 里启用 **八条猫桌宠 (移动触屏版)**。
3. 扩展设置抽屉中会出现「八条猫设置 (移动触屏版)」。

也可在酒馆「安装扩展」里填本文件夹路径（需含 `manifest.json`）。**不要覆盖安装到 PC 版同名目录。**

## 目录

```
EightTailCat-Pet-Mobile/
  manifest.json
  index.js          # 宿主浮层 + 设置抽屉
  style.css         # 移动端缩小浮层
  settings.html
  pet.html          # 桌宠本体（iframe）
  assets/
  data/
```

## 移动端差异

- 猫咪约原尺寸 70%，默认右下角，减少挡键盘。
- 支持 `touchstart` / `touchmove` / `touchend` 拖拽，并 `preventDefault` 避免页面下拉冲突。
- 设置面板为约 `90vw` × `80vh` 底部抽屉，可纵向滚动。
