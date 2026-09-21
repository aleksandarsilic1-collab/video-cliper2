# Video Clipper

A self-hosted web app for clipping videos. Upload a video file or paste any link (including YouTube) — then set your cut points and export a clip. Runs entirely on your machine with a small Node.js server; ffmpeg is bundled, so no external installs are needed.

## Features

- **Two input methods** — drag & drop a video file, or paste a URL
- **YouTube support** — paste any watch / shorts / youtu.be link and it downloads the video (uses yt-dlp, up to 720p)
- **Frame selection** — Start/End sliders plus "Set Start"/"Set End" buttons that capture the current playback position
- **Near-instant clipping** — uses fast stream copy (`-c copy`) and only re-encodes when the format requires it
- **Clip list** — hover-to-preview thumbnails with a one-click download
- **Clean dark UI** on a deep navy theme

## Requirements

- [Node.js](https://nodejs.org) 18+
- No system ffmpeg required — `ffmpeg-static` and `ffprobe-static` are installed as npm dependencies.

## Getting started

```bash
npm install
npm start
```

Then open http://localhost:3000.

On first start the server copies the bundled ffmpeg/ffprobe binaries into `bin/` (this folder is git-ignored).

## Usage

1. **Drag & drop** a video into the upload zone, **or** paste a link (YouTube, or a direct video URL) into the link box and click **Download Video**.
2. Move the **Start** and **End** sliders (or use **Play**, **Set Start**, **Set End** while the clip plays).
3. Click **Create Clip**.
4. Your clip appears in the list — hover it to preview, click **Download clip** to save it.

## Project structure

```
server.js            Express server + API
public/              Frontend (HTML/CSS/JS)
scripts/setup-bin.js Copies bundled ffmpeg/ffprobe into bin/
uploads/             Downloaded/uploaded source videos (git-ignored)
clips/               Generated clips (git-ignored)
bin/                 Bundled ffmpeg/ffprobe (auto-generated, git-ignored)
```

## API

| Method | Endpoint            | Description                                            |
| ------ | ------------------- | ------------------------------------------------------ |
| POST   | `/api/upload`       | Upload a video file (`multipart/form-data`, field `video`) |
| POST   | `/api/download-url` | Download a video from a link or YouTube URL (`{ url }`) |
| POST   | `/api/clip`         | Create a clip (`{ source, start, end }` in seconds)    |
| GET    | `/api/files`        | List uploaded sources and clips                        |

## Notes

- All files are stored locally under `uploads/` and `clips/`. Nothing is sent to a third party.
- Downloaded videos may be subject to the source site's terms of service — download only content you're allowed to use.
- Default port is `3000` (`PORT=3001 npm start` to change it).