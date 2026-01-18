// DOM Elements
const ffmpegStatus = document.getElementById('ffmpegStatus');
const errorBanner = document.getElementById('errorBanner');
const mainContent = document.getElementById('mainContent');
const dropZone = document.getElementById('dropZone');
const fileList = document.getElementById('fileList');
const fileCount = document.getElementById('fileCount');
const clearAllBtn = document.getElementById('clearAllBtn');
const commandSelect = document.getElementById('commandSelect');
const commandError = document.getElementById('commandError');
const refreshCommandsBtn = document.getElementById('refreshCommandsBtn');
const outputFolder = document.getElementById('outputFolder');
const browseOutputBtn = document.getElementById('browseOutputBtn');

// Application state
let ffmpegAvailable = false;
let files = []; // Array of { path, name }
let commands = []; // Array of { name, command }
let outputPath = ''; // Selected output folder

// Initialize on page load
async function init() {
  await checkFfmpegStatus();
  await loadCommands();
  await loadSettings();
  setupDragAndDrop();
  setupButtons();
}

// ============================================================
// FFmpeg Detection
// ============================================================
async function checkFfmpegStatus() {
  const result = await window.api.checkFfmpeg();
  ffmpegAvailable = result.available;

  if (result.available) {
    ffmpegStatus.textContent = `FFmpeg ${result.version}`;
    ffmpegStatus.className = 'status-badge status-ok';
    errorBanner.classList.add('hidden');
    mainContent.classList.remove('disabled');
  } else {
    ffmpegStatus.textContent = 'Not Found';
    ffmpegStatus.className = 'status-badge status-error';
    errorBanner.classList.remove('hidden');
    mainContent.classList.add('disabled');
  }
}

// ============================================================
// Commands Loading
// ============================================================
async function loadCommands() {
  const result = await window.api.loadCommands();

  if (result.success) {
    commands = result.commands;
    commandError.classList.add('hidden');
    renderCommandDropdown();
  } else {
    commands = [];
    commandError.textContent = result.error;
    commandError.classList.remove('hidden');
    commandSelect.innerHTML = '<option value="">No commands available</option>';
    commandSelect.disabled = true;
  }
}

function renderCommandDropdown() {
  if (commands.length === 0) {
    commandSelect.innerHTML = '<option value="">No commands defined</option>';
    commandSelect.disabled = true;
    return;
  }

  commandSelect.innerHTML = commands.map((cmd, index) =>
    `<option value="${index}">${escapeHtml(cmd.name)}</option>`
  ).join('');
  commandSelect.disabled = false;
}

// ============================================================
// Settings & Output Folder
// ============================================================
async function loadSettings() {
  const settings = await window.api.getSettings();
  if (settings.lastOutputDirectory) {
    outputPath = settings.lastOutputDirectory;
    outputFolder.value = outputPath;
  }
}

async function selectOutputFolder() {
  const result = await window.api.selectOutputFolder();
  if (result.selected) {
    outputPath = result.path;
    outputFolder.value = outputPath;
  }
}

// ============================================================
// Drag and Drop
// ============================================================
function setupDragAndDrop() {
  // Prevent default drag behaviors on window
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  // Drop zone specific events
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove('drag-over');
    }, false);
  });

  dropZone.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function handleDrop(e) {
  const droppedFiles = e.dataTransfer.files;
  addFiles(droppedFiles);
}

// ============================================================
// File Management
// ============================================================
function addFiles(fileListObj) {
  for (const file of fileListObj) {
    // Electron 32+ requires webUtils.getPathForFile() to get the full path
    const filePath = window.api.getPathForFile(file);

    if (!filePath) {
      console.warn('File path not available for:', file.name);
      continue;
    }

    // Check if file already exists (by path)
    const exists = files.some(f => f.path === filePath);
    if (!exists) {
      files.push({
        path: filePath,
        name: file.name
      });
    }
  }
  renderFileList();
}

function removeFile(index) {
  files.splice(index, 1);
  renderFileList();
}

function clearAllFiles() {
  files = [];
  renderFileList();
}

function renderFileList() {
  // Update count
  const count = files.length;
  fileCount.textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
  clearAllBtn.disabled = count === 0;

  // Render list
  if (count === 0) {
    fileList.innerHTML = '<div class="file-list-empty">No files added yet</div>';
    return;
  }

  fileList.innerHTML = files.map((file, index) => {
    // Extract directory from path
    const filePath = file.path || '';
    const pathParts = filePath.split(/[/\\]/);
    pathParts.pop(); // Remove filename
    const directory = pathParts.join('/') || '/';

    return `
      <div class="file-item">
        <span class="file-name">${escapeHtml(file.name)}</span>
        <span class="file-path" title="${escapeHtml(file.path)}">${escapeHtml(directory)}</span>
        <button class="file-remove" data-index="${index}" title="Remove">&times;</button>
      </div>
    `;
  }).join('');

  // Add click handlers for remove buttons
  fileList.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      removeFile(index);
    });
  });
}

// ============================================================
// Buttons
// ============================================================
function setupButtons() {
  clearAllBtn.addEventListener('click', clearAllFiles);
  refreshCommandsBtn.addEventListener('click', loadCommands);
  browseOutputBtn.addEventListener('click', selectOutputFolder);
}

// ============================================================
// Utilities
// ============================================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start the app
init();
