const fs = require('fs');
const path = require('path');

const root = __dirname;

function ensureBin() {
  const binDir = path.join(root, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const ffmpegStatic = require('ffmpeg-static');
  const ffprobeStatic = require('ffprobe-static');

  const copyIfMissing = (src, dest) => {
    if (!src) return;
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      console.log('Created ' + path.relative(root, dest));
    }
  };

  copyIfMissing(ffmpegStatic, path.join(binDir, 'ffmpeg.exe'));
  copyIfMissing(ffprobeStatic.path, path.join(binDir, 'ffprobe.exe'));
}

module.exports = ensureBin;

if (require.main === module) {
  try {
    ensureBin();
    console.log('bin/ ready.');
  } catch (err) {
    console.error('Could not set up bin/:', err.message);
    process.exit(1);
  }
}
