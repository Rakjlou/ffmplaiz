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
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const progressText = document.getElementById('progressText');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const duplicateWarning = document.getElementById('duplicateWarning');
const consoleToggle = document.getElementById('consoleToggle');
const consoleToggleIcon = document.getElementById('consoleToggleIcon');
const consoleOutput = document.getElementById('consoleOutput');
const consoleContent = document.getElementById('consoleContent');

// Application state
let ffmpegAvailable = false;
let files = []; // Array of { path, name }
let commands = []; // Array of { name, command }
let outputPath = ''; // Selected output folder
let isProcessing = false;
let processingQueue = []; // Files to process (after duplicate removal)
let currentProcessIndex = 0;
let consoleExpanded = false;
let processingResults = []; // Track success/failure for each file

// Initialize on page load
async function init() {
  await checkFfmpegStatus();
  await loadCommands();
  await loadSettings();
  setupDragAndDrop();
  setupButtons();
  setupConsole();
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
  updateStartButton();
}

async function selectOutputFolder() {
  const result = await window.api.selectOutputFolder();
  if (result.selected) {
    outputPath = result.path;
    outputFolder.value = outputPath;
    updateStartButton();
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
  updateStartButton();

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
// Processing
// ============================================================
function updateStartButton() {
  const canStart = files.length > 0 &&
                   commands.length > 0 &&
                   outputPath !== '' &&
                   !isProcessing;
  startBtn.disabled = !canStart;
}

function detectDuplicates() {
  // Group files by filename (not path)
  const nameGroups = {};
  for (const file of files) {
    if (!nameGroups[file.name]) {
      nameGroups[file.name] = [];
    }
    nameGroups[file.name].push(file);
  }

  // Find duplicates (files with same name from different paths)
  const duplicates = [];
  const unique = [];

  for (const [name, group] of Object.entries(nameGroups)) {
    if (group.length > 1) {
      duplicates.push(...group);
    } else {
      unique.push(group[0]);
    }
  }

  return { duplicates, unique };
}

function startProcessing() {
  if (isProcessing) return;

  // Detect duplicates
  const { duplicates, unique } = detectDuplicates();

  // Show warning if duplicates found
  if (duplicates.length > 0) {
    const names = [...new Set(duplicates.map(f => f.name))];
    duplicateWarning.innerHTML = `<strong>Warning:</strong> ${duplicates.length} file(s) with duplicate names excluded: ${names.map(n => escapeHtml(n)).join(', ')}`;
    duplicateWarning.classList.remove('hidden');
  } else {
    duplicateWarning.classList.add('hidden');
  }

  if (unique.length === 0) {
    progressText.textContent = 'No files to process';
    return;
  }

  // Set up processing queue
  processingQueue = unique;
  currentProcessIndex = 0;
  isProcessing = true;
  processingResults = [];

  // Clear console for new session
  clearConsole();

  // Update UI
  startBtn.disabled = true;
  stopBtn.disabled = false;
  progressContainer.classList.remove('hidden');
  updateProgress();

  // Start processing
  processNextFile();
}

function stopProcessing() {
  if (!isProcessing) return;

  window.api.stopProcessing();
  finishProcessing(true);
}

function finishProcessing(wasStopped = false) {
  isProcessing = false;
  startBtn.disabled = false;
  stopBtn.disabled = true;

  if (wasStopped) {
    progressText.textContent = 'Stopped';
    appendToConsole('\n=== Processing stopped by user ===\n', 'stderr');
  } else {
    // Show summary
    const successCount = processingResults.filter(r => r.success).length;
    const failCount = processingResults.filter(r => !r.success).length;
    const total = processingResults.length;

    progressText.textContent = `Done: ${successCount}/${total} succeeded`;

    appendToConsole(`\n=== Processing Complete ===\n`, 'stdout');
    appendToConsole(`Success: ${successCount} | Failed: ${failCount}\n`, successCount === total ? 'stdout' : 'stderr');

    if (failCount > 0) {
      const failedFiles = processingResults.filter(r => !r.success).map(r => r.file.name);
      appendToConsole(`Failed files: ${failedFiles.join(', ')}\n`, 'stderr');
    }
  }

  updateStartButton();
}

function updateProgress() {
  const total = processingQueue.length;
  const current = currentProcessIndex;
  progressText.textContent = `${current}/${total}`;
  const percent = total > 0 ? (current / total) * 100 : 0;
  progressFill.style.width = `${percent}%`;
}

async function processNextFile() {
  if (!isProcessing || currentProcessIndex >= processingQueue.length) {
    finishProcessing();
    return;
  }

  const file = processingQueue[currentProcessIndex];
  const commandIndex = parseInt(commandSelect.value, 10);
  const command = commands[commandIndex];

  // Show which file is being processed
  appendToConsole(`\n=== Processing: ${file.name} ===\n`, 'stdout');

  // Build the command with placeholders replaced
  const finalCommand = substitutePlaceholders(command.command, file);

  // Log the command for debugging
  appendToConsole(`Command: ${finalCommand}\n\n`, 'stdout');

  // Execute the command
  const result = await window.api.executeCommand(finalCommand);

  // Track result
  processingResults.push({
    file: file,
    success: result.success,
    exitCode: result.exitCode
  });

  if (!result.success) {
    appendToConsole(`\n[FAILED] Exit code: ${result.exitCode}\n`, 'stderr');
  }

  currentProcessIndex++;
  updateProgress();

  // Continue to next file (even if this one failed)
  if (isProcessing) {
    processNextFile();
  }
}

function substitutePlaceholders(commandTemplate, file) {
  // Extract file info
  const fullPath = file.path;
  const fileName = file.name;
  const lastDotIndex = fileName.lastIndexOf('.');
  const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
  const ext = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';

  // Convert Windows backslashes to forward slashes for FFmpeg compatibility
  // FFmpeg handles forward slashes fine on Windows, and this avoids escaping issues
  const inputPath = fullPath.replace(/\\/g, '/');
  const outputDir = outputPath.replace(/\\/g, '/');

  // Replace placeholders
  return commandTemplate
    .replace(/\{input\}/g, inputPath)
    .replace(/\{output_dir\}/g, outputDir)
    .replace(/\{name\}/g, nameWithoutExt)
    .replace(/\{ext\}/g, ext);
}

// ============================================================
// Console Output
// ============================================================
function setupConsole() {
  // Set up toggle
  consoleToggle.addEventListener('click', toggleConsole);

  // Set up FFmpeg output listener
  window.api.onFfmpegOutput((data) => {
    appendToConsole(data.data, data.type);
  });
}

function toggleConsole() {
  consoleExpanded = !consoleExpanded;
  if (consoleExpanded) {
    consoleOutput.classList.remove('hidden');
    consoleToggleIcon.classList.add('expanded');
  } else {
    consoleOutput.classList.add('hidden');
    consoleToggleIcon.classList.remove('expanded');
  }
}

function clearConsole() {
  consoleContent.innerHTML = '';
}

function appendToConsole(text, type = 'stdout') {
  const span = document.createElement('span');
  span.className = type;
  span.textContent = text;
  consoleContent.appendChild(span);

  // Auto-scroll to bottom
  consoleOutput.scrollTop = consoleOutput.scrollHeight;

  // Auto-expand console when output arrives
  if (!consoleExpanded) {
    toggleConsole();
  }
}

// ============================================================
// Buttons
// ============================================================
function setupButtons() {
  clearAllBtn.addEventListener('click', clearAllFiles);
  refreshCommandsBtn.addEventListener('click', loadCommands);
  browseOutputBtn.addEventListener('click', selectOutputFolder);
  startBtn.addEventListener('click', startProcessing);
  stopBtn.addEventListener('click', stopProcessing);

  // Update start button when command or output changes
  commandSelect.addEventListener('change', updateStartButton);
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
