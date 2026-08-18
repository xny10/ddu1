// ==========================================
// TTGODMODE — Frontend App
// ==========================================

const DOM = {
  // TikTok Mode
  urlInput: document.getElementById('urlInput'),
  urlCount: document.getElementById('urlCount'),
  downloadBtn: document.getElementById('downloadBtn'),
  clearBtn: document.getElementById('clearBtn'),
  summaryBar: document.getElementById('summaryBar'),
  queueSection: document.getElementById('queueSection'),
  queueList: document.getElementById('queueList'),
  downloadAllZipBtn: document.getElementById('downloadAllZipBtn'),
  toastContainer: document.getElementById('toastContainer'),
  statTotal: document.getElementById('statTotal'),
  statComplete: document.getElementById('statComplete'),
  statDownloading: document.getElementById('statDownloading'),
  statFailed: document.getElementById('statFailed'),
  metaToggle: document.getElementById('metaToggle'),
  metaToggleSection: document.getElementById('metaToggleSection'),
  metaTechniques: document.getElementById('metaTechniques'),
  metaBadge: document.getElementById('metaBadge'),
  ffmpegWarning: document.getElementById('ffmpegWarning'),
  
  // Mode Tabs
  modeTabs: document.querySelectorAll('.mode-tab'),
  tiktokMode: document.getElementById('tiktokMode'),
  uploadMode: document.getElementById('uploadMode'),
  
  // Upload Mode
  uploadDropzone: document.getElementById('uploadDropzone'),
  fileInput: document.getElementById('fileInput'),
  selectedFilesSection: document.getElementById('selectedFilesSection'),
  selectedFilesList: document.getElementById('selectedFilesList'),
  fileCount: document.getElementById('fileCount'),
  clearFilesBtn: document.getElementById('clearFilesBtn'),
  uploadBtn: document.getElementById('uploadBtn'),
  uploadSummaryBar: document.getElementById('uploadSummaryBar'),
  uploadQueueSection: document.getElementById('uploadQueueSection'),
  uploadQueueList: document.getElementById('uploadQueueList'),
  uploadDownloadAllZipBtn: document.getElementById('uploadDownloadAllZipBtn'),
  uploadStatTotal: document.getElementById('uploadStatTotal'),
  uploadStatComplete: document.getElementById('uploadStatComplete'),
  uploadStatProcessing: document.getElementById('uploadStatProcessing'),
  uploadStatFailed: document.getElementById('uploadStatFailed'),
  ffmpegWarningUpload: document.getElementById('ffmpegWarningUpload'),
};

let currentSessionId = null;
let eventSource = null;
let downloadItems = {};
let ffmpegAvailable = true;

// Upload mode state
let uploadSessionId = null;
let uploadEventSource = null;
let uploadItems = {};
let selectedFiles = [];

// ==========================================
// Mode Tabs
// ==========================================
DOM.modeTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const mode = tab.dataset.mode;
    const metadataMode = document.getElementById('metadataMode');
    const deviceSpoofMode = document.getElementById('deviceSpoofMode');

    DOM.modeTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    DOM.tiktokMode.classList.add('hidden');
    DOM.uploadMode.classList.add('hidden');
    if (metadataMode) metadataMode.classList.add('hidden');
    if (deviceSpoofMode) deviceSpoofMode.classList.add('hidden');

    if (mode === 'tiktok') {
      DOM.tiktokMode.classList.remove('hidden');
    } else if (mode === 'upload') {
      DOM.uploadMode.classList.remove('hidden');
    } else if (mode === 'metadata' && metadataMode) {
      metadataMode.classList.remove('hidden');
    } else if (mode === 'devicespoof' && deviceSpoofMode) {
      deviceSpoofMode.classList.remove('hidden');
    }
  });
});

// ==========================================
// FFmpeg Check
// ==========================================
async function checkFFmpeg() {
  try {
    const res = await fetch('/api/check-ffmpeg');
    const data = await res.json();
    ffmpegAvailable = data.available;
    if (!ffmpegAvailable) {
      DOM.ffmpegWarning.style.display = 'flex';
      if (DOM.ffmpegWarningUpload) DOM.ffmpegWarningUpload.style.display = 'flex';
    }
  } catch (e) {}
}
checkFFmpeg();

// ==========================================
// Metadata Toggle (TikTok Mode)
// ==========================================
DOM.metaToggle.addEventListener('change', () => {
  const isOn = DOM.metaToggle.checked;
  if (isOn) {
    DOM.metaToggleSection.classList.add('active');
    DOM.metaTechniques.classList.remove('hidden');
    DOM.metaBadge.textContent = 'ON';
    DOM.metaBadge.classList.add('active');
    DOM.downloadBtn.innerHTML = '<span>⚡</span> GOD MODE Download + Randomize';
  } else {
    DOM.metaToggleSection.classList.remove('active');
    DOM.metaTechniques.classList.add('hidden');
    DOM.metaBadge.textContent = 'OFF';
    DOM.metaBadge.classList.remove('active');
    DOM.downloadBtn.innerHTML = '<span>⚡</span> GOD MODE Download';
  }
});

// ==========================================
// URL Parsing (TikTok Mode)
// ==========================================
function parseUrls(text) {
  return text.split('\n').map(line => line.trim()).filter(line => {
    return line.length > 0 && (line.includes('tiktok.com') || line.includes('vt.tiktok.com') || line.includes('vm.tiktok.com'));
  }).map(line => {
    const parts = line.split('|').map(p => p.trim());
    const url = parts[0];
    const saveName = parts.length > 1 ? parts[1].replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() : '';
    return { url, saveName };
  });
}

function updateUrlCount() {
  const urls = parseUrls(DOM.urlInput.value);
  DOM.urlCount.textContent = urls.length;
  DOM.downloadBtn.disabled = urls.length === 0;
  const tagHint = document.getElementById('tagHint');
  if (tagHint) {
    const hasTags = urls.some(u => u.saveName.length > 0);
    tagHint.style.opacity = (urls.length > 0 && !hasTags) ? '1' : '0.5';
  }
}

DOM.urlInput.addEventListener('input', updateUrlCount);
DOM.clearBtn.addEventListener('click', () => { DOM.urlInput.value = ''; updateUrlCount(); });

// ==========================================
// Toast Notifications
// ==========================================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: '⚡', meta: '🎲' };
  toast.innerHTML = `<span>${icons[type] || '⚡'}</span> ${message}`;
  DOM.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ==========================================
// TikTok Download Queue UI
// ==========================================
function createQueueItem(url, index, saveName = '') {
  const item = document.createElement('div');
  item.className = 'queue-item';
  item.id = `queue-item-${index}`;
  const saveTagHTML = saveName ? `<div class="queue-item-savetag"><span class="save-tag-badge"><span class="tag-label-icon">🏷️</span> ${escapeHtml(saveName)}</span></div>` : '';
  item.innerHTML = `
    <div class="queue-item-number">${index + 1}</div>
    <div class="queue-item-info">
      <div class="queue-item-url" title="${escapeHtml(url)}">${escapeHtml(url)}</div>
      ${saveTagHTML}
      <div class="queue-item-title" id="title-${index}"></div>
      <div class="queue-item-status" id="status-${index}"><span class="status-badge status-waiting">⏳ Waiting</span></div>
      <div class="progress-container" id="progress-container-${index}" style="display:none;"><div class="progress-bar" id="progress-bar-${index}" style="width: 0%"></div></div>
      <div class="queue-item-meta-info" id="meta-info-${index}" style="display:none;"></div>
    </div>
    <div class="queue-item-actions" id="actions-${index}"></div>`;
  return item;
}

function updateQueueItemStatus(index, status, detail = '') {
  const statusEl = document.getElementById(`status-${index}`);
  const progressContainer = document.getElementById(`progress-container-${index}`);
  const progressBar = document.getElementById(`progress-bar-${index}`);
  const queueItem = document.getElementById(`queue-item-${index}`);
  if (!statusEl) return;

  const statusMap = {
    waiting: '<span class="status-badge status-waiting">⏳ Waiting</span>',
    downloading: `<div class="spinner"></div> <span class="status-badge status-downloading">⬇ Downloading</span> <span>${detail}</span>`,
    meta_processing: `<div class="spinner meta"></div> <span class="status-badge status-meta">🎲 Randomizing</span> <span>${detail}</span>`,
    complete: '<span class="status-badge status-complete">✅ Complete</span>',
    error: `<span class="status-badge status-error">❌ Failed</span> <span style="color:#ef4444;font-size:12px">${detail}</span>`,
  };
  statusEl.innerHTML = statusMap[status] || '';

  if (status === 'downloading') {
    progressContainer.style.display = 'block';
    progressBar.className = 'progress-bar downloading';
    if (queueItem) queueItem.classList.remove('meta-processing');
  } else if (status === 'meta_processing') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar meta-processing';
    if (queueItem) queueItem.classList.add('meta-processing');
  } else if (status === 'complete') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar complete';
    if (queueItem) queueItem.classList.remove('meta-processing');
  } else if (status === 'error') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar error';
    if (queueItem) queueItem.classList.remove('meta-processing');
  }
}

function updateProgress(index, percent) {
  const progressBar = document.getElementById(`progress-bar-${index}`);
  if (progressBar) progressBar.style.width = `${percent}%`;
}

function addDownloadButton(index, filename) {
  const actionsEl = document.getElementById(`actions-${index}`);
  if (actionsEl) {
    actionsEl.innerHTML = `<button class="btn-download-single" onclick="downloadFile('${encodeURIComponent(filename)}')">💾 Save</button>`;
  }
}

function updateTitle(index, title) {
  const titleEl = document.getElementById(`title-${index}`);
  if (titleEl && title) titleEl.textContent = title;
}

function showMetaInfo(index, metaInfo) {
  const metaInfoEl = document.getElementById(`meta-info-${index}`);
  if (metaInfoEl && metaInfo) {
    metaInfoEl.style.display = 'flex';
    metaInfoEl.innerHTML = `🎲 Meta: ${metaInfo.artist} · ${metaInfo.title} · ${metaInfo.encoder}`;
  }
}

function updateSummaryStats() {
  const items = Object.values(downloadItems);
  const total = items.length;
  const complete = items.filter(i => i.status === 'complete').length;
  const downloading = items.filter(i => i.status === 'downloading' || i.status === 'meta_processing').length;
  const failed = items.filter(i => i.status === 'error').length;

  DOM.statTotal.textContent = total;
  DOM.statComplete.textContent = complete;
  DOM.statDownloading.textContent = downloading;
  DOM.statFailed.textContent = failed;

  if (complete > 0 && downloading === 0 && (complete + failed === total)) {
    DOM.downloadAllZipBtn.classList.remove('hidden');
  }
}

// ==========================================
// TikTok Download Actions
// ==========================================
function downloadFile(filename) {
  const a = document.createElement('a');
  a.href = `/api/download-file/${filename}?sessionId=${currentSessionId}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

DOM.downloadAllZipBtn.addEventListener('click', () => {
  if (!currentSessionId) return;
  const a = document.createElement('a');
  a.href = `/api/download-all?sessionId=${currentSessionId}`;
  a.download = 'ttgodmode-videos.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Preparing ZIP file...', 'info');
});

// ==========================================
// TikTok SSE Progress
// ==========================================
function connectSSE(sessionId) {
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/progress?sessionId=${sessionId}`);
  eventSource.onmessage = (event) => {
    try { handleProgressEvent(JSON.parse(event.data)); } catch (e) {}
  };
  eventSource.onerror = () => { eventSource.close(); eventSource = null; };
}

function handleProgressEvent(data) {
  const { index, type, percent, detail, filename, title, metaApplied, metaInfo, metaError } = data;
  switch (type) {
    case 'start':
      downloadItems[index] = { status: 'downloading' };
      updateQueueItemStatus(index, 'downloading', 'Starting...');
      break;
    case 'progress':
      downloadItems[index] = { status: 'downloading' };
      updateQueueItemStatus(index, 'downloading', detail || `${percent || 0}%`);
      if (percent) updateProgress(index, percent);
      break;
    case 'title':
      if (title) updateTitle(index, title);
      break;
    case 'meta_start':
      downloadItems[index] = { status: 'meta_processing' };
      updateQueueItemStatus(index, 'meta_processing', detail || 'Randomizing metadata...');
      showToast(`Video #${index + 1}: Randomizing metadata...`, 'meta');
      break;
    case 'complete':
      downloadItems[index] = { status: 'complete', filename };
      updateQueueItemStatus(index, 'complete');
      if (filename) addDownloadButton(index, filename);
      if (metaApplied && metaInfo) {
        showMetaInfo(index, metaInfo);
        showToast(`Video #${index + 1} — GOD MODE ✅`, 'success');
      } else if (metaApplied === false && metaError) {
        showToast(`Video #${index + 1} downloaded (meta failed)`, 'info');
      } else {
        showToast(`Video #${index + 1} downloaded!`, 'success');
      }
      break;
    case 'error':
      downloadItems[index] = { status: 'error' };
      updateQueueItemStatus(index, 'error', detail || 'Unknown error');
      showToast(`Video #${index + 1} failed`, 'error');
      break;
    case 'all_done':
      showToast('All processing finished! ⚡', 'success');
      DOM.downloadBtn.disabled = false;
      DOM.downloadBtn.innerHTML = DOM.metaToggle.checked ? '<span>⚡</span> GOD MODE Download + Randomize' : '<span>⚡</span> GOD MODE Download';
      if (eventSource) { eventSource.close(); eventSource = null; }
      break;
  }
  updateSummaryStats();
}

// ==========================================
// TikTok Start Download
// ==========================================
DOM.downloadBtn.addEventListener('click', async () => {
  const urlEntries = parseUrls(DOM.urlInput.value);
  if (urlEntries.length === 0) return;

  const urls = urlEntries.map(e => e.url);
  const saveNames = urlEntries.map(e => e.saveName);
  const randomizeMeta = DOM.metaToggle.checked;

  if (randomizeMeta && !ffmpegAvailable) {
    showToast('FFmpeg not detected!', 'error');
  }

  downloadItems = {};
  DOM.queueList.innerHTML = '';
  DOM.queueSection.classList.remove('hidden');
  DOM.summaryBar.classList.remove('hidden');
  DOM.downloadAllZipBtn.classList.add('hidden');
  DOM.downloadBtn.disabled = true;
  DOM.downloadBtn.innerHTML = '<div class="spinner"></div> Processing...';

  urlEntries.forEach((entry, index) => {
    downloadItems[index] = { status: 'waiting' };
    DOM.queueList.appendChild(createQueueItem(entry.url, index, entry.saveName));
  });
  updateSummaryStats();

  try {
    const response = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, saveNames, randomizeMeta }),
    });
    const result = await response.json();
    if (result.success) {
      currentSessionId = result.sessionId;
      connectSSE(result.sessionId);
      showToast(`Started for ${urls.length} videos`, 'info');
    } else {
      showToast(result.error || 'Failed', 'error');
      DOM.downloadBtn.disabled = false;
      DOM.downloadBtn.innerHTML = '<span>⚡</span> GOD MODE Download';
    }
  } catch (err) {
    showToast('Connection error', 'error');
    DOM.downloadBtn.disabled = false;
    DOM.downloadBtn.innerHTML = '<span>⚡</span> GOD MODE Download';
  }
});

updateUrlCount();


// ==========================================
// UPLOAD MODE
// ==========================================

// File Selection
DOM.uploadDropzone.addEventListener('click', () => DOM.fileInput.click());
DOM.fileInput.addEventListener('change', handleFileSelect);

// Drag & Drop
DOM.uploadDropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  DOM.uploadDropzone.classList.add('dragover');
});
DOM.uploadDropzone.addEventListener('dragleave', () => {
  DOM.uploadDropzone.classList.remove('dragover');
});
DOM.uploadDropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  DOM.uploadDropzone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i));
  if (files.length > 0) {
    selectedFiles = files.slice(0, 20);
    updateSelectedFiles();
  }
});

function handleFileSelect(e) {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i));
  if (files.length > 0) {
    selectedFiles = files.slice(0, 20);
    updateSelectedFiles();
  }
}

function updateSelectedFiles() {
  DOM.fileCount.textContent = selectedFiles.length;
  DOM.uploadBtn.disabled = selectedFiles.length === 0;
  
  if (selectedFiles.length > 0) {
    DOM.selectedFilesSection.classList.remove('hidden');
    DOM.selectedFilesList.innerHTML = selectedFiles.map((file, i) => `
      <div class="selected-file-item">
        <span class="file-icon">🎬</span>
        <span class="file-name">${escapeHtml(file.name)}</span>
        <span class="file-size">${formatFileSize(file.size)}</span>
      </div>
    `).join('');
  } else {
    DOM.selectedFilesSection.classList.add('hidden');
    DOM.selectedFilesList.innerHTML = '';
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

DOM.clearFilesBtn.addEventListener('click', () => {
  selectedFiles = [];
  DOM.fileInput.value = '';
  updateSelectedFiles();
});

// ==========================================
// Upload Queue UI
// ==========================================
function createUploadQueueItem(filename, index) {
  const item = document.createElement('div');
  item.className = 'queue-item';
  item.id = `upload-queue-item-${index}`;
  item.innerHTML = `
    <div class="queue-item-number">${index + 1}</div>
    <div class="queue-item-info">
      <div class="queue-item-url" title="${escapeHtml(filename)}">🎬 ${escapeHtml(filename)}</div>
      <div class="queue-item-status" id="upload-status-${index}"><span class="status-badge status-waiting">⏳ Waiting</span></div>
      <div class="progress-container" id="upload-progress-container-${index}" style="display:none;"><div class="progress-bar" id="upload-progress-bar-${index}" style="width: 0%"></div></div>
      <div class="queue-item-meta-info" id="upload-meta-info-${index}" style="display:none;"></div>
    </div>
    <div class="queue-item-actions" id="upload-actions-${index}"></div>`;
  return item;
}

function updateUploadQueueItemStatus(index, status, detail = '') {
  const statusEl = document.getElementById(`upload-status-${index}`);
  const progressContainer = document.getElementById(`upload-progress-container-${index}`);
  const progressBar = document.getElementById(`upload-progress-bar-${index}`);
  const queueItem = document.getElementById(`upload-queue-item-${index}`);
  if (!statusEl) return;

  const statusMap = {
    waiting: '<span class="status-badge status-waiting">⏳ Waiting</span>',
    uploading: `<div class="spinner"></div> <span class="status-badge status-downloading">📤 Uploading</span>`,
    processing: `<div class="spinner meta"></div> <span class="status-badge status-meta">🎲 Randomizing</span> <span>${detail}</span>`,
    complete: '<span class="status-badge status-complete">✅ Complete</span>',
    error: `<span class="status-badge status-error">❌ Failed</span> <span style="color:#ef4444;font-size:12px">${detail}</span>`,
  };
  statusEl.innerHTML = statusMap[status] || '';

  if (status === 'uploading' || status === 'processing') {
    progressContainer.style.display = 'block';
    progressBar.className = status === 'processing' ? 'progress-bar meta-processing' : 'progress-bar downloading';
    if (status === 'processing') progressBar.style.width = '100%';
    if (queueItem) queueItem.classList.toggle('meta-processing', status === 'processing');
  } else if (status === 'complete') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar complete';
    if (queueItem) queueItem.classList.remove('meta-processing');
  } else if (status === 'error') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar error';
    if (queueItem) queueItem.classList.remove('meta-processing');
  }
}

function addUploadDownloadButton(index, filename) {
  const actionsEl = document.getElementById(`upload-actions-${index}`);
  if (actionsEl) {
    actionsEl.innerHTML = `<button class="btn-download-single" onclick="downloadUploadFile('${encodeURIComponent(filename)}')">💾 Save</button>`;
  }
}

function showUploadMetaInfo(index, metaInfo) {
  const metaInfoEl = document.getElementById(`upload-meta-info-${index}`);
  if (metaInfoEl && metaInfo) {
    metaInfoEl.style.display = 'flex';
    metaInfoEl.innerHTML = `🎲 Meta: ${metaInfo.artist} · ${metaInfo.title} · ${metaInfo.encoder}`;
  }
}

function updateUploadSummaryStats() {
  const items = Object.values(uploadItems);
  const total = items.length;
  const complete = items.filter(i => i.status === 'complete').length;
  const processing = items.filter(i => i.status === 'processing' || i.status === 'uploading').length;
  const failed = items.filter(i => i.status === 'error').length;

  DOM.uploadStatTotal.textContent = total;
  DOM.uploadStatComplete.textContent = complete;
  DOM.uploadStatProcessing.textContent = processing;
  DOM.uploadStatFailed.textContent = failed;

  if (complete > 0 && processing === 0 && (complete + failed === total)) {
    DOM.uploadDownloadAllZipBtn.classList.remove('hidden');
  }
}

// ==========================================
// Upload Download Actions
// ==========================================
function downloadUploadFile(filename) {
  const a = document.createElement('a');
  a.href = `/api/upload-download-file/${filename}?sessionId=${uploadSessionId}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

DOM.uploadDownloadAllZipBtn.addEventListener('click', () => {
  if (!uploadSessionId) return;
  const a = document.createElement('a');
  a.href = `/api/upload-download-all?sessionId=${uploadSessionId}`;
  a.download = 'ttgodmode-randomized.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Preparing ZIP file...', 'info');
});

// ==========================================
// Upload SSE Progress
// ==========================================
function connectUploadSSE(sessionId) {
  if (uploadEventSource) uploadEventSource.close();
  uploadEventSource = new EventSource(`/api/upload-progress?sessionId=${sessionId}`);
  uploadEventSource.onmessage = (event) => {
    try { handleUploadProgressEvent(JSON.parse(event.data)); } catch (e) {}
  };
  uploadEventSource.onerror = () => { uploadEventSource.close(); uploadEventSource = null; };
}

function handleUploadProgressEvent(data) {
  const { index, type, percent, detail, filename, metaInfo } = data;
  switch (type) {
    case 'start':
      uploadItems[index] = { status: 'processing' };
      updateUploadQueueItemStatus(index, 'processing', 'Starting...');
      break;
    case 'progress':
      uploadItems[index] = { status: 'processing' };
      updateUploadQueueItemStatus(index, 'processing', detail || `${percent || 0}%`);
      break;
    case 'complete':
      uploadItems[index] = { status: 'complete', filename };
      updateUploadQueueItemStatus(index, 'complete');
      if (filename) addUploadDownloadButton(index, filename);
      if (metaInfo) showUploadMetaInfo(index, metaInfo);
      showToast(`Video #${index + 1} — GOD MODE ✅`, 'success');
      break;
    case 'error':
      uploadItems[index] = { status: 'error' };
      updateUploadQueueItemStatus(index, 'error', detail || 'Unknown error');
      showToast(`Video #${index + 1} failed`, 'error');
      break;
    case 'all_done':
      showToast('All processing finished! 🎲', 'success');
      DOM.uploadBtn.disabled = false;
      DOM.uploadBtn.innerHTML = '<span>🎲</span> Randomize Metadata';
      if (uploadEventSource) { uploadEventSource.close(); uploadEventSource = null; }
      break;
  }
  updateUploadSummaryStats();
}

// ==========================================
// Start Upload & Process
// ==========================================
DOM.uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;
  if (!ffmpegAvailable) {
    showToast('FFmpeg not detected! Cannot process videos.', 'error');
    return;
  }

  uploadItems = {};
  DOM.uploadQueueList.innerHTML = '';
  DOM.uploadQueueSection.classList.remove('hidden');
  DOM.uploadSummaryBar.classList.remove('hidden');
  DOM.uploadDownloadAllZipBtn.classList.add('hidden');
  DOM.uploadBtn.disabled = true;
  DOM.uploadBtn.innerHTML = '<div class="spinner"></div> Uploading...';

  selectedFiles.forEach((file, index) => {
    uploadItems[index] = { status: 'uploading' };
    DOM.uploadQueueList.appendChild(createUploadQueueItem(file.name, index));
    updateUploadQueueItemStatus(index, 'uploading');
  });
  updateUploadSummaryStats();

  const formData = new FormData();
  selectedFiles.forEach(file => formData.append('videos', file));

  try {
    const response = await fetch('/api/upload', { method: 'POST', body: formData });
    const result = await response.json();
    if (result.success) {
      uploadSessionId = result.sessionId;
      connectUploadSSE(result.sessionId);
      showToast(`Uploaded ${result.fileCount} videos, processing...`, 'info');
    } else {
      showToast(result.error || 'Upload failed', 'error');
      DOM.uploadBtn.disabled = false;
      DOM.uploadBtn.innerHTML = '<span>🎲</span> Randomize Metadata';
    }
  } catch (err) {
    showToast('Connection error', 'error');
    DOM.uploadBtn.disabled = false;
    DOM.uploadBtn.innerHTML = '<span>🎲</span> Randomize Metadata';
  }
});


// ==========================================
// METADATA CHECK MODE
// ==========================================

const metadataDOM = {
  dropzone: document.getElementById('metadataDropzone'),
  fileInput: document.getElementById('metadataFileInput'),
  selectedFile: document.getElementById('metadataSelectedFile'),
  fileInfo: document.getElementById('metadataFileInfo'),
  clearBtn: document.getElementById('clearMetadataFileBtn'),
  checkBtn: document.getElementById('checkMetadataBtn'),
  loading: document.getElementById('metadataLoading'),
  results: document.getElementById('metadataResults'),
  fileInfoGrid: document.getElementById('fileInfoGrid'),
  videoInfoGrid: document.getElementById('videoInfoGrid'),
  audioInfoGrid: document.getElementById('audioInfoGrid'),
  tagsInfoGrid: document.getElementById('tagsInfoGrid'),
  toggleRawTags: document.getElementById('toggleRawTags'),
  rawTagsContent: document.getElementById('rawTagsContent'),
  metadataMode: document.getElementById('metadataMode'),
};

let metadataFile = null;

// Dropzone click
metadataDOM.dropzone.addEventListener('click', () => metadataDOM.fileInput.click());
metadataDOM.fileInput.addEventListener('change', handleMetadataFileSelect);

// Drag & Drop
metadataDOM.dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  metadataDOM.dropzone.classList.add('dragover');
});
metadataDOM.dropzone.addEventListener('dragleave', () => {
  metadataDOM.dropzone.classList.remove('dragover');
});
metadataDOM.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  metadataDOM.dropzone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i));
  if (files.length > 0) {
    metadataFile = files[0];
    updateMetadataFileDisplay();
  }
});

function handleMetadataFileSelect(e) {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i));
  if (files.length > 0) {
    metadataFile = files[0];
    updateMetadataFileDisplay();
  }
}

function updateMetadataFileDisplay() {
  metadataDOM.checkBtn.disabled = !metadataFile;
  
  if (metadataFile) {
    metadataDOM.selectedFile.classList.remove('hidden');
    metadataDOM.fileInfo.innerHTML = `
      <div class="selected-file-item">
        <span class="file-icon">🎬</span>
        <span class="file-name">${escapeHtml(metadataFile.name)}</span>
        <span class="file-size">${formatFileSize(metadataFile.size)}</span>
      </div>
    `;
    // Hide previous results
    metadataDOM.results.classList.add('hidden');
  } else {
    metadataDOM.selectedFile.classList.add('hidden');
    metadataDOM.fileInfo.innerHTML = '';
  }
}

metadataDOM.clearBtn.addEventListener('click', () => {
  metadataFile = null;
  metadataDOM.fileInput.value = '';
  updateMetadataFileDisplay();
  metadataDOM.results.classList.add('hidden');
});

// Check Metadata
metadataDOM.checkBtn.addEventListener('click', async () => {
  if (!metadataFile) return;

  metadataDOM.checkBtn.disabled = true;
  metadataDOM.checkBtn.innerHTML = '<div class="spinner"></div> Reading...';
  metadataDOM.loading.classList.remove('hidden');
  metadataDOM.results.classList.add('hidden');

  const formData = new FormData();
  formData.append('video', metadataFile);

  try {
    const response = await fetch('/api/check-metadata', { method: 'POST', body: formData });
    const result = await response.json();

    if (result.success) {
      displayMetadata(result.metadata);
      showToast('Metadata loaded!', 'success');
    } else {
      showToast(result.error || 'Failed to read metadata', 'error');
    }
  } catch (err) {
    showToast('Connection error', 'error');
  }

  metadataDOM.checkBtn.disabled = false;
  metadataDOM.checkBtn.innerHTML = '<span>🔍</span> Check Metadata';
  metadataDOM.loading.classList.add('hidden');
});

function displayMetadata(meta) {
  // File Info
  metadataDOM.fileInfoGrid.innerHTML = `
    ${createMetadataRow('Filename', meta.filename)}
    ${createMetadataRow('File Size', meta.fileSize)}
    ${createMetadataRow('Duration', meta.duration)}
    ${createMetadataRow('Bitrate', meta.bitrate)}
    ${createMetadataRow('Format', meta.format)}
  `;

  // Video Info
  metadataDOM.videoInfoGrid.innerHTML = `
    ${createMetadataRow('Codec', meta.video.codec)}
    ${createMetadataRow('Resolution', meta.video.resolution)}
    ${createMetadataRow('Frame Rate', meta.video.fps)}
    ${createMetadataRow('Aspect Ratio', meta.video.aspectRatio)}
    ${createMetadataRow('Color Space', meta.video.colorSpace)}
  `;

  // Audio Info
  metadataDOM.audioInfoGrid.innerHTML = `
    ${createMetadataRow('Codec', meta.audio.codec)}
    ${createMetadataRow('Sample Rate', meta.audio.sampleRate)}
    ${createMetadataRow('Channels', meta.audio.channels)}
    ${createMetadataRow('Bitrate', meta.audio.bitrate)}
  `;

  // Tags
  metadataDOM.tagsInfoGrid.innerHTML = `
    ${createMetadataRow('Title', meta.tags.title, true)}
    ${createMetadataRow('Artist/Author', meta.tags.artist, true)}
    ${createMetadataRow('Comment', meta.tags.comment, true)}
    ${createMetadataRow('Description', meta.tags.description, true)}
    ${createMetadataRow('Encoder', meta.tags.encoder, true)}
    ${createMetadataRow('Creation Time', meta.tags.creationTime, true)}
    ${createMetadataRow('Video Handler', meta.tags.handler, true)}
    ${createMetadataRow('Audio Handler', meta.tags.audioHandler, true)}
  `;

  // Raw tags
  metadataDOM.rawTagsContent.textContent = JSON.stringify(meta.rawTags, null, 2);
  metadataDOM.rawTagsContent.classList.add('hidden');
  metadataDOM.toggleRawTags.innerHTML = '<span>📜</span> Show Raw Tags';

  metadataDOM.results.classList.remove('hidden');
}

function createMetadataRow(label, value, isTag = false) {
  const displayValue = value || '-';
  const tagClass = isTag && value && value !== '-' ? 'tag-highlight' : '';
  return `
    <div class="metadata-row">
      <span class="metadata-label">${label}</span>
      <span class="metadata-value ${tagClass}">${escapeHtml(displayValue)}</span>
    </div>
  `;
}

// Toggle Raw Tags
metadataDOM.toggleRawTags.addEventListener('click', () => {
  const isHidden = metadataDOM.rawTagsContent.classList.toggle('hidden');
  metadataDOM.toggleRawTags.innerHTML = isHidden 
    ? '<span>📜</span> Show Raw Tags' 
    : '<span>📜</span> Hide Raw Tags';
});

// ==========================================
// DEVICE SPOOF MODE
// ==========================================

const spoofDOM = {
  mode: document.getElementById('deviceSpoofMode'),
  dropzone: document.getElementById('spoofDropzone'),
  fileInput: document.getElementById('spoofFileInput'),
  selectedFilesSection: document.getElementById('spoofSelectedFilesSection'),
  selectedFilesList: document.getElementById('spoofSelectedFilesList'),
  fileCount: document.getElementById('spoofFileCount'),
  clearFilesBtn: document.getElementById('spoofClearFilesBtn'),
  deviceGrid: document.getElementById('deviceGrid'),
  randomDate: document.getElementById('spoofRandomDate'),
  randomLocation: document.getElementById('spoofRandomLocation'),
  spoofBtn: document.getElementById('spoofBtn'),
  summaryBar: document.getElementById('spoofSummaryBar'),
  queueSection: document.getElementById('spoofQueueSection'),
  queueList: document.getElementById('spoofQueueList'),
  downloadAllZipBtn: document.getElementById('spoofDownloadAllZipBtn'),
  statTotal: document.getElementById('spoofStatTotal'),
  statComplete: document.getElementById('spoofStatComplete'),
  statProcessing: document.getElementById('spoofStatProcessing'),
  statFailed: document.getElementById('spoofStatFailed'),
};

let spoofSessionId = null;
let spoofEventSource = null;
let spoofItems = {};
let spoofSelectedFiles = [];
let spoofPresets = { iphone: [], pixel: [] };
let spoofSelectedDevice = 'random-all'; // 'random-all' | 'random-iphone' | 'random-pixel' | device key
let spoofActiveBrand = 'iphone';

// Load device presets from server
async function loadDevicePresets() {
  try {
    const res = await fetch('/api/device-presets');
    const data = await res.json();
    if (data.success) {
      spoofPresets = data.presets;
      renderDeviceGrid();
    }
  } catch (e) {}
}
loadDevicePresets();

// Brand tabs
document.querySelectorAll('.device-brand-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.device-brand-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    spoofActiveBrand = btn.dataset.brand;
    renderDeviceGrid();
  });
});

function renderDeviceGrid() {
  const devices = spoofPresets[spoofActiveBrand] || [];
  spoofDOM.deviceGrid.innerHTML = devices.map(d => `
    <button class="device-card ${spoofSelectedDevice === d.key ? 'selected' : ''}" data-device="${d.key}">
      <span class="device-card-icon">${spoofActiveBrand === 'iphone' ? '🍎' : '🤖'}</span>
      <span class="device-card-name">${escapeHtml(d.name)}</span>
    </button>
  `).join('');

  spoofDOM.deviceGrid.querySelectorAll('.device-card').forEach(card => {
    card.addEventListener('click', () => {
      spoofSelectedDevice = card.dataset.device;
      // Uncheck random radios
      document.querySelectorAll('input[name="deviceChoice"]').forEach(r => r.checked = false);
      renderDeviceGrid();
    });
  });
}

// Random device radio options
document.querySelectorAll('input[name="deviceChoice"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (radio.checked) {
      spoofSelectedDevice = radio.value;
      renderDeviceGrid();
    }
  });
});

// File selection
spoofDOM.dropzone.addEventListener('click', () => spoofDOM.fileInput.click());
spoofDOM.fileInput.addEventListener('change', handleSpoofFileSelect);

spoofDOM.dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  spoofDOM.dropzone.classList.add('dragover');
});
spoofDOM.dropzone.addEventListener('dragleave', () => {
  spoofDOM.dropzone.classList.remove('dragover');
});
spoofDOM.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  spoofDOM.dropzone.classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i));
  if (files.length > 0) {
    spoofSelectedFiles = files.slice(0, 20);
    updateSpoofSelectedFiles();
  }
});

function handleSpoofFileSelect(e) {
  const files = Array.from(e.target.files).filter(f => f.type.startsWith('video/') || f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i));
  if (files.length > 0) {
    spoofSelectedFiles = files.slice(0, 20);
    updateSpoofSelectedFiles();
  }
}

function updateSpoofSelectedFiles() {
  spoofDOM.fileCount.textContent = spoofSelectedFiles.length;
  spoofDOM.spoofBtn.disabled = spoofSelectedFiles.length === 0;

  if (spoofSelectedFiles.length > 0) {
    spoofDOM.selectedFilesSection.classList.remove('hidden');
    spoofDOM.selectedFilesList.innerHTML = spoofSelectedFiles.map(file => `
      <div class="selected-file-item">
        <span class="file-icon">🎬</span>
        <span class="file-name">${escapeHtml(file.name)}</span>
        <span class="file-size">${formatFileSize(file.size)}</span>
      </div>
    `).join('');
  } else {
    spoofDOM.selectedFilesSection.classList.add('hidden');
    spoofDOM.selectedFilesList.innerHTML = '';
  }
}

spoofDOM.clearFilesBtn.addEventListener('click', () => {
  spoofSelectedFiles = [];
  spoofDOM.fileInput.value = '';
  updateSpoofSelectedFiles();
});

// ==========================================
// Spoof Queue UI
// ==========================================
function createSpoofQueueItem(filename, index) {
  const item = document.createElement('div');
  item.className = 'queue-item';
  item.id = `spoof-queue-item-${index}`;
  item.innerHTML = `
    <div class="queue-item-number">${index + 1}</div>
    <div class="queue-item-info">
      <div class="queue-item-url" title="${escapeHtml(filename)}">🎬 ${escapeHtml(filename)}</div>
      <div class="queue-item-status" id="spoof-status-${index}"><span class="status-badge status-waiting">⏳ Waiting</span></div>
      <div class="progress-container" id="spoof-progress-container-${index}" style="display:none;"><div class="progress-bar" id="spoof-progress-bar-${index}" style="width: 0%"></div></div>
      <div class="queue-item-meta-info" id="spoof-meta-info-${index}" style="display:none;"></div>
    </div>
    <div class="queue-item-actions" id="spoof-actions-${index}"></div>`;
  return item;
}

function updateSpoofQueueItemStatus(index, status, detail = '') {
  const statusEl = document.getElementById(`spoof-status-${index}`);
  const progressContainer = document.getElementById(`spoof-progress-container-${index}`);
  const progressBar = document.getElementById(`spoof-progress-bar-${index}`);
  const queueItem = document.getElementById(`spoof-queue-item-${index}`);
  if (!statusEl) return;

  const statusMap = {
    waiting: '<span class="status-badge status-waiting">⏳ Waiting</span>',
    uploading: `<div class="spinner"></div> <span class="status-badge status-downloading">📤 Uploading</span>`,
    processing: `<div class="spinner meta"></div> <span class="status-badge status-meta">📱 Spoofing</span> <span>${detail}</span>`,
    complete: '<span class="status-badge status-complete">✅ Complete</span>',
    error: `<span class="status-badge status-error">❌ Failed</span> <span style="color:#ef4444;font-size:12px">${detail}</span>`,
  };
  statusEl.innerHTML = statusMap[status] || '';

  if (status === 'uploading' || status === 'processing') {
    progressContainer.style.display = 'block';
    progressBar.className = status === 'processing' ? 'progress-bar meta-processing' : 'progress-bar downloading';
    if (status === 'processing') progressBar.style.width = '100%';
    if (queueItem) queueItem.classList.toggle('meta-processing', status === 'processing');
  } else if (status === 'complete') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar complete';
    if (queueItem) queueItem.classList.remove('meta-processing');
  } else if (status === 'error') {
    progressContainer.style.display = 'block';
    progressBar.style.width = '100%';
    progressBar.className = 'progress-bar error';
    if (queueItem) queueItem.classList.remove('meta-processing');
  }
}

function addSpoofDownloadButton(index, filename) {
  const actionsEl = document.getElementById(`spoof-actions-${index}`);
  if (actionsEl) {
    actionsEl.innerHTML = `<button class="btn-download-single" onclick="downloadSpoofFile('${encodeURIComponent(filename)}')">💾 Save</button>`;
  }
}

function showSpoofDeviceInfo(index, deviceInfo) {
  const metaInfoEl = document.getElementById(`spoof-meta-info-${index}`);
  if (metaInfoEl && deviceInfo) {
    metaInfoEl.style.display = 'flex';
    const parts = [deviceInfo.deviceName, deviceInfo.software];
    if (deviceInfo.locationName) parts.push(`📍 ${deviceInfo.locationName}`);
    metaInfoEl.innerHTML = `📱 ${parts.join(' · ')}`;
  }
}

function updateSpoofSummaryStats() {
  const items = Object.values(spoofItems);
  const total = items.length;
  const complete = items.filter(i => i.status === 'complete').length;
  const processing = items.filter(i => i.status === 'processing' || i.status === 'uploading').length;
  const failed = items.filter(i => i.status === 'error').length;

  spoofDOM.statTotal.textContent = total;
  spoofDOM.statComplete.textContent = complete;
  spoofDOM.statProcessing.textContent = processing;
  spoofDOM.statFailed.textContent = failed;

  if (complete > 0 && processing === 0 && (complete + failed === total)) {
    spoofDOM.downloadAllZipBtn.classList.remove('hidden');
  }
}

// ==========================================
// Spoof Download Actions
// ==========================================
function downloadSpoofFile(filename) {
  const a = document.createElement('a');
  a.href = `/api/device-spoof-file/${filename}?sessionId=${spoofSessionId}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

spoofDOM.downloadAllZipBtn.addEventListener('click', () => {
  if (!spoofSessionId) return;
  const a = document.createElement('a');
  a.href = `/api/device-spoof-all?sessionId=${spoofSessionId}`;
  a.download = 'ttgodmode-device-spoof.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Preparing ZIP file...', 'info');
});

// ==========================================
// Spoof SSE Progress
// ==========================================
function connectSpoofSSE(sessionId) {
  if (spoofEventSource) spoofEventSource.close();
  spoofEventSource = new EventSource(`/api/device-spoof-progress?sessionId=${sessionId}`);
  spoofEventSource.onmessage = (event) => {
    try { handleSpoofProgressEvent(JSON.parse(event.data)); } catch (e) {}
  };
  spoofEventSource.onerror = () => { spoofEventSource.close(); spoofEventSource = null; };
}

function handleSpoofProgressEvent(data) {
  const { index, type, percent, detail, filename, deviceInfo } = data;
  switch (type) {
    case 'start':
      spoofItems[index] = { status: 'processing' };
      updateSpoofQueueItemStatus(index, 'processing', 'Starting...');
      break;
    case 'progress':
      spoofItems[index] = { status: 'processing' };
      updateSpoofQueueItemStatus(index, 'processing', detail || `${percent || 0}%`);
      break;
    case 'complete':
      spoofItems[index] = { status: 'complete', filename };
      updateSpoofQueueItemStatus(index, 'complete');
      if (filename) addSpoofDownloadButton(index, filename);
      if (deviceInfo) {
        showSpoofDeviceInfo(index, deviceInfo);
        showToast(`Video #${index + 1} spoofed as ${deviceInfo.deviceName} ✅`, 'success');
      } else {
        showToast(`Video #${index + 1} — Complete ✅`, 'success');
      }
      break;
    case 'error':
      spoofItems[index] = { status: 'error' };
      updateSpoofQueueItemStatus(index, 'error', detail || 'Unknown error');
      showToast(`Video #${index + 1} failed`, 'error');
      break;
    case 'all_done':
      showToast('All device spoofing finished! 📱', 'success');
      spoofDOM.spoofBtn.disabled = false;
      spoofDOM.spoofBtn.innerHTML = '<span>📱</span> Spoof Device Metadata';
      if (spoofEventSource) { spoofEventSource.close(); spoofEventSource = null; }
      break;
  }
  updateSpoofSummaryStats();
}

// ==========================================
// Start Device Spoof
// ==========================================
spoofDOM.spoofBtn.addEventListener('click', async () => {
  if (spoofSelectedFiles.length === 0) return;
  if (!ffmpegAvailable) {
    showToast('FFmpeg not detected! Cannot process videos.', 'error');
    return;
  }

  spoofItems = {};
  spoofDOM.queueList.innerHTML = '';
  spoofDOM.queueSection.classList.remove('hidden');
  spoofDOM.summaryBar.classList.remove('hidden');
  spoofDOM.downloadAllZipBtn.classList.add('hidden');
  spoofDOM.spoofBtn.disabled = true;
  spoofDOM.spoofBtn.innerHTML = '<div class="spinner"></div> Uploading...';

  spoofSelectedFiles.forEach((file, index) => {
    spoofItems[index] = { status: 'uploading' };
    spoofDOM.queueList.appendChild(createSpoofQueueItem(file.name, index));
    updateSpoofQueueItemStatus(index, 'uploading');
  });
  updateSpoofSummaryStats();

  const formData = new FormData();
  spoofSelectedFiles.forEach(file => formData.append('videos', file));
  formData.append('device', spoofSelectedDevice);
  formData.append('randomDate', spoofDOM.randomDate.checked ? 'true' : 'false');
  formData.append('randomLocation', spoofDOM.randomLocation.checked ? 'true' : 'false');

  try {
    const response = await fetch('/api/device-spoof', { method: 'POST', body: formData });
    const result = await response.json();
    if (result.success) {
      spoofSessionId = result.sessionId;
      connectSpoofSSE(result.sessionId);
      showToast(`Uploaded ${result.fileCount} videos, spoofing device metadata...`, 'info');
    } else {
      showToast(result.error || 'Upload failed', 'error');
      spoofDOM.spoofBtn.disabled = false;
      spoofDOM.spoofBtn.innerHTML = '<span>📱</span> Spoof Device Metadata';
    }
  } catch (err) {
    showToast('Connection error', 'error');
    spoofDOM.spoofBtn.disabled = false;
    spoofDOM.spoofBtn.innerHTML = '<span>📱</span> Spoof Device Metadata';
  }
});
