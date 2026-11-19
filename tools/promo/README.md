# 宣傳短片製作工具

這個資料夾只存在 `promo-video` 分支，不會上線。

1. `node server.js`（port 3100）
2. `node rec-audio.js`（音效）與 `node rec-audio.js long`（整支片的連續配樂 day，64 秒）：錄成 `audio/*.webm`，再用 ffmpeg 轉成 wav
3. `node ui-shots.js`：截取真實手機介面到 `ui/`
4. `./render-all.sh`：用導演模式（網址加 `?cine=1`）逐格算出每個鏡頭，橫式 1280×720、直式 720×1280，每秒 24 格
5. `python3 edit.py`：接鏡頭、上字幕、混音，輸出 `promo_16x9.mp4` 與 `promo_9x16.mp4`

鏡頭、走位與鏡頭路徑都在 `shots.js`；字幕與配樂時間軸在 `edit.py` 的 `TL` 與 `audio()`。
