const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobeStatic.path);
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const CLIPS_DIR = path.join(__dirname, 'clips');
const FFMPEG_BIN_DIR = path.join(__dirname, 'bin');

for (const dir of [UPLOADS_DIR, CLIPS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

require('./scripts/setup-bin')();

const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'youtube-nocookie.com'];

function isYouTubeUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return YT_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, crypto.randomUUID() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const videoExts = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.wmv', '.flv', '.mpg', '.mpeg', '.ts', '.mts', '.3gp'];
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = /video\//.test(file.mimetype) || videoExts.includes(ext);
    if (!ok) cb(new Error('Only video files are allowed'));
    else cb(null, true);
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/clips', express.static(CLIPS_DIR));

app.post('/api/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  ffmpeg.ffprobe(req.file.path, (err, data) => {
    if (err) return res.status(500).json({ error: 'Could not read video metadata' });
    res.json({
      id: req.file.filename,
      name: req.file.originalname,
      url: '/uploads/' + req.file.filename,
      duration: data.format.duration,
      size: req.file.size
    });
  });
});

const EXT_BY_TYPE = {
  'video/mp4': '.mp4', 'video/x-m4v': '.m4v', 'video/quicktime': '.mov',
  'video/x-msvideo': '.avi', 'video/x-matroska': '.mkv', 'video/webm': '.webm',
  'video/x-ms-wmv': '.wmv', 'video/x-flv': '.flv', 'video/mpeg': '.mpg',
  'video/3gpp': '.3gp', 'video/mp2t': '.ts', 'application/octet-stream': '.mp4'
};

app.post('/api/download-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'No URL provided' });
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'URL must start with http:// or https://' });
  }

  if (isYouTubeUrl(url)) {
    return downloadYouTube(url, res);
  }

  let response;
  try {
    response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach URL: ' + err.message });
  }
  if (!response.ok) {
    return res.status(502).json({ error: 'Download failed with HTTP ' + response.status });
  }

  const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
  const urlPath = new URL(url).pathname;
  const urlExt = path.extname(urlPath).toLowerCase();
  const ext = urlExt && /^\.[a-z0-9]{1,5}$/.test(urlExt) ? urlExt : (EXT_BY_TYPE[contentType] || '.mp4');
  const outName = crypto.randomUUID() + ext;
  const outPath = path.join(UPLOADS_DIR, outName);

  try {
    if (!response.body) throw new Error('Remote server returned no data');
    await pipeline(response.body, fs.createWriteStream(outPath));
  } catch (err) {
    fs.unlinkSync(outPath);
    return res.status(502).json({ error: 'Download failed: ' + err.message });
  }

  const size = fs.statSync(outPath).size;
  ffmpeg.ffprobe(outPath, (err, data) => {
    if (err) {
      fs.unlinkSync(outPath);
      return res.status(400).json({ error: 'Downloaded file is not a valid video' });
    }
    res.json({
      id: outName,
      name: baseName(urlPath) + ext,
      url: '/uploads/' + outName,
      duration: data.format.duration,
      size
    });
  });
});

function downloadYouTube(url, res) {
  const outName = crypto.randomUUID() + '.mp4';
  const outPath = path.join(UPLOADS_DIR, outName);

  // Best video+audio up to 720p, merged into a single mp4 (fast, browser-friendly).
  youtubedl(url, {
    output: outPath,
    format: 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b',
    mergeOutputFormat: 'mp4',
    ffmpegLocation: FFMPEG_BIN_DIR,
    noPlaylist: true,
    retries: 3,
    socketTimeout: 30
  })
    .then(() => {
      if (!fs.existsSync(outPath)) throw new Error('yt-dlp finished without producing a file');
      const size = fs.statSync(outPath).size;
      return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(outPath, (err, data) => {
          if (err || !data || !data.format) {
            fs.unlinkSync(outPath);
            return reject(new Error('Downloaded file could not be read as a video'));
          }
          resolve({ size, data });
        });
      });
    })
    .then(({ size, data }) => {
      res.json({
        id: outName,
        name: baseName(new URL(url).pathname) + '.mp4',
        url: '/uploads/' + outName,
        duration: data.format.duration,
        size
      });
    })
    .catch((err) => {
      try { fs.unlinkSync(outPath); } catch {}
      res.status(502).json({ error: 'YouTube download failed: ' + (err.stderr ? err.stderr : err.message) });
    });
}

function baseName(p) {
  const b = path.posix.basename(p).replace(/\.[^.]+$/, '');
  return b || 'video';
}

app.post('/api/clip', (req, res) => {
  const { source, start, end } = req.body;
  if (!source) return res.status(400).json({ error: 'No source video specified' });
  if (start === undefined || end === undefined) {
    return res.status(400).json({ error: 'Provide start and end times (seconds)' });
  }

  const srcPath = path.join(UPLOADS_DIR, path.basename(source));
  if (!fs.existsSync(srcPath)) return res.status(400).json({ error: 'Source video not found' });

  const startSec = parseFloat(start);
  let endSec = parseFloat(end);
  if (isNaN(startSec) || isNaN(endSec)) {
    return res.status(400).json({ error: 'Invalid time values' });
  }

  ffmpeg.ffprobe(srcPath, (probeErr, data) => {
    if (probeErr) return res.status(500).json({ error: 'Could not read video metadata' });

    const total = data.format.duration;
    if (startSec < 0 || endSec <= startSec) {
      return res.status(400).json({ error: 'Invalid clip range' });
    }
    if (endSec > total) endSec = total;

    const duration = endSec - startSec;
    const outBase = 'clip-' + crypto.randomUUID();

    // Try fast stream copy first (near-instant), fall back to re-encode only if needed.
    const srcExt = path.extname(srcPath).toLowerCase();
    const native = ['.webm', '.mkv', '.mov', '.avi', '.wmv', '.flv', '.ts', '.mts', '.3gp'];
    const nativeExt = native.includes(srcExt) ? srcExt : '.mp4';
    const attempts = [
      { ext: nativeExt, options: nativeExt === '.mp4' ? ['-c', 'copy', '-movflags', '+faststart'] : ['-c', 'copy'] },
      { ext: '.mp4', options: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-movflags', '+faststart'] }
    ];

    let index = 0;
    const tryNext = () => {
      const attempt = attempts[index++];
      if (!attempt) {
        return res.status(500).json({ error: 'Clipping failed' });
      }

      const outName = outBase + attempt.ext;
      const outPath = path.join(CLIPS_DIR, outName);
      const timeLimit = String(Math.max(120, Math.ceil(duration) * 2));

      ffmpeg(srcPath)
        .setStartTime(startSec)
        .setDuration(duration)
        .inputOptions(['-timelimit', timeLimit])
        .outputOptions(attempt.options)
        .on('end', () => {
          res.json({
            url: '/clips/' + outName,
            name: source.replace(/\.\w+$/, '') + '-clip' + attempt.ext,
            start: startSec,
            end: endSec,
            duration
          });
        })
        .on('error', (err) => {
          fs.unlinkSync(outPath);
          if (index === 2) {
            res.status(500).json({ error: 'Clipping failed: ' + err.message });
          } else {
            tryNext();
          }
        })
        .save(outPath);
    };

    tryNext();
  });
});

app.get('/api/files', (req, res) => {
  try {
    const uploads = fs.readdirSync(UPLOADS_DIR).map(f => ({
      id: f,
      name: f,
      url: '/uploads/' + f
    }));
    const clips = fs.readdirSync(CLIPS_DIR).map(f => ({
      id: f,
      name: f,
      url: '/clips/' + f
    }));
    res.json({ uploads, clips });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Video Clipper running at http://localhost:${PORT}`);
});