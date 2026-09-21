(() => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const chooseBtn = document.getElementById('choose-btn');
  const statusEl = document.getElementById('status');
  const editor = document.getElementById('editor-section');
  const player = document.getElementById('player');
  const videoBadge = document.getElementById('video-badge');
  const startSlider = document.getElementById('start-slider');
  const endSlider = document.getElementById('end-slider');
  const startDisplay = document.getElementById('start-display');
  const endDisplay = document.getElementById('end-display');
  const playBtn = document.getElementById('play-btn');
  const setStartBtn = document.getElementById('set-start-btn');
  const setEndBtn = document.getElementById('set-end-btn');
  const clipBtn = document.getElementById('clip-btn');
  const clipsList = document.getElementById('clips-list');
  const clipCount = document.getElementById('clip-count');
  const linkInput = document.getElementById('link-input');
  const linkBtn = document.getElementById('link-btn');
  const linkStatus = document.getElementById('link-status');

  let currentVideo = null; // { id, url, duration, name }
  let clipTotal = 0;

  loadExistingClips();

  function loadExistingClips() {
    fetch('/api/files')
      .then((r) => r.json())
      .then((data) => {
        (data.clips || []).forEach((c) => {
          addClip({ url: c.url, name: c.name, duration: 0 });
        });
      })
      .catch(() => {});
  }

  chooseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) uploadFile(fileInput.files[0]);
  });

  linkBtn.addEventListener('click', () => downloadFromLink());
  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') downloadFromLink();
  });

  function downloadFromLink() {
    const url = linkInput.value.trim();
    if (!url) {
      linkStatus.textContent = 'Paste a link first.';
      return;
    }
    linkBtn.disabled = true;
    linkBtn.textContent = 'Downloading...';
    linkStatus.textContent = 'This can take a while for longer videos.';
    statusEl.textContent = '';

    fetch('/api/download-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        currentVideo = data;
        linkStatus.textContent = '';
        statusEl.textContent = `Downloaded "${data.name}" — ${fmtTime(data.duration)}`;
        openEditor();
      })
      .catch((err) => {
        linkStatus.textContent = 'Download failed: ' + err.message;
      })
      .finally(() => {
        linkBtn.textContent = 'Download Video';
        linkBtn.disabled = false;
      });
  }

  function uploadFile(file) {
    if (!file.type.startsWith('video/')) {
      statusEl.textContent = 'Please choose a video file.';
      return;
    }
    statusEl.textContent = `Uploading "${file.name}"...`;
    const fd = new FormData();
    fd.append('video', file);

    fetch('/api/upload', { method: 'POST', body: fd })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        currentVideo = data;
        statusEl.textContent = `Uploaded "${data.name}" — ${fmtTime(data.duration)}`;
        openEditor();
      })
      .catch((err) => {
        statusEl.textContent = 'Upload failed: ' + err.message;
      });
  }

  function openEditor() {
    editor.hidden = false;
    videoBadge.textContent = currentVideo.name || 'Video ready';
    player.src = currentVideo.url;
    player.currentTime = 0;

    startSlider.max = currentVideo.duration;
    endSlider.max = currentVideo.duration;
    startSlider.value = 0;
    endSlider.value = currentVideo.duration;
    startDisplay.textContent = fmtTime(0);
    endDisplay.textContent = fmtTime(currentVideo.duration);
    paintSlider(startSlider);
    paintSlider(endSlider);
    clipBtn.disabled = false;
  }

  function paintSlider(slider) {
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 0;
    const val = parseFloat(slider.value);
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    slider.style.setProperty('--fill', Math.min(100, Math.max(0, pct)) + '%');
  }

  function updateClamp() {
    const s = parseFloat(startSlider.value);
    let e = parseFloat(endSlider.value);
    if (e <= s) e = s + 0.1;
    if (e > currentVideo.duration) e = currentVideo.duration;
    endSlider.value = e;
    startDisplay.textContent = fmtTime(s);
    endDisplay.textContent = fmtTime(e);
    paintSlider(startSlider);
    paintSlider(endSlider);
  }

  startSlider.addEventListener('input', () => {
    if (parseFloat(startSlider.value) >= parseFloat(endSlider.value)) {
      startSlider.value = Math.max(0, parseFloat(endSlider.value) - 0.1);
    }
    startDisplay.textContent = fmtTime(parseFloat(startSlider.value));
    paintSlider(startSlider);
  });

  endSlider.addEventListener('input', () => {
    if (parseFloat(endSlider.value) <= parseFloat(startSlider.value)) {
      endSlider.value = Math.min(currentVideo.duration, parseFloat(startSlider.value) + 0.1);
    }
    endDisplay.textContent = fmtTime(parseFloat(endSlider.value));
    paintSlider(endSlider);
  });

  playBtn.addEventListener('click', () => {
    player.currentTime = parseFloat(startSlider.value);
    player.play();
  });

  setStartBtn.addEventListener('click', () => {
    startSlider.value = player.currentTime;
    startDisplay.textContent = fmtTime(player.currentTime);
    updateClamp();
  });

  setEndBtn.addEventListener('click', () => {
    endSlider.value = player.currentTime;
    endDisplay.textContent = fmtTime(player.currentTime);
    updateClamp();
  });

  clipBtn.addEventListener('click', () => {
    if (!currentVideo) return;
    clipBtn.disabled = true;
    clipBtn.textContent = 'Clipping...';
    statusEl.textContent = '';
    updateClamp();

    fetch('/api/clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: currentVideo.id,
        start: parseFloat(startSlider.value),
        end: parseFloat(endSlider.value)
      })
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        addClip(data);
        statusEl.textContent = `Clip created — ${fmtTime(data.duration)}`;
      })
      .catch((err) => {
        statusEl.textContent = 'Clip failed: ' + err.message;
        alert('Clip failed: ' + err.message);
      })
      .finally(() => {
        clipBtn.textContent = 'Create Clip';
        clipBtn.disabled = false;
      });
  });

  function addClip(clip) {
    const empty = clipsList.querySelector('.empty');
    if (empty) empty.remove();

    const li = document.createElement('li');
    li.className = 'clip-item';

    const video = document.createElement('video');
    video.className = 'clip-preview';
    video.src = clip.url;
    video.muted = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.loop = true;

    video.addEventListener('mouseenter', () => {
      video.play().catch(() => {});
    });
    video.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = 0;
    });

    const durSpan = document.createElement('span');
    durSpan.className = 'clip-duration';
    durSpan.textContent = clip.duration ? fmtTime(clip.duration) : '...';
    if (!clip.duration) {
      video.addEventListener('loadedmetadata', () => {
        if (video.duration && isFinite(video.duration)) {
          durSpan.textContent = fmtTime(video.duration);
        }
      });
    }

    const meta = document.createElement('div');
    meta.className = 'clip-meta';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'clip-name';
    nameSpan.textContent = clip.name;
    meta.append(nameSpan, durSpan);

    const link = document.createElement('a');
    link.className = 'clip-download';
    link.href = clip.url;
    link.download = clip.name;
    link.textContent = 'Download clip';

    li.append(video, meta, link);
    clipsList.prepend(li);
    clipTotal += 1;
    clipCount.textContent = clipTotal;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec * 10) / 10);
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1).padStart(4, '0');
    return `${m}:${s}`;
  }
})();
