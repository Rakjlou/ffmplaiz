# Technical Specification - FFmpeg Wrapper GUI

## Overview

A simple Windows desktop application serving as a graphical wrapper for FFmpeg. This is an internal tool, not intended for public distribution.

## Technical Stack

* **Framework:** Electron (minimal, strictly limited dependencies).
* **Prerequisite:** FFmpeg must be installed on the host system (accessible via PATH).
* **Persistence:** Simple local storage (e.g., `electron-store` or local JSON) for user preferences.

## Features

### 1. Main Interface (Single Window)

#### Input Zone

* Drag & drop area to add files.
* List of selected files (Full CRUD):
* Add via drag & drop.
* Remove individual files.
* "Clear" button to empty the entire list.



#### Output Selection

* Input field/Button to select the destination folder.
* **Persistence:** The application must remember and auto-load the last used output folder upon startup.

#### Command Selection

* Dropdown listing available commands.
* "Refresh" button to reload commands from the JSON file without restarting the app.

#### Processing Zone

* "Start" button to launch processing.
* "Stop" button to halt current processing.
* Progress bar (increments based on file count, e.g., 2/10).
* Collapsible/Expandable section displaying raw FFmpeg output.
* **Note:** Must display both `stdout` and `stderr` streams in real-time.



#### Result Zone (Post-processing)

* Final status message:
* Count of successfully processed files.
* Count of failed files (listing filenames).


* **Buttons:**
* "Open Output Folder"
* "Open Session Log" (Opens a text file containing the execution log/errors).



### 2. Command Configuration (External JSON)

**File:** `commands.json` (located alongside the executable).

**Placeholders:**
The application will replace these strings within the command before execution:

* `{input}`: Full path of the source file.
* `{output_dir}`: Full path of the selected output folder.
* `{name}`: Source filename **without** extension.
* `{ext}`: Source filename extension (e.g., `.mkv`).

**Handling Spaces:**

* **Important:** The JSON maintainer is responsible for adding quotes around paths to handle spaces. The application will not auto-quote.
* *Example:* `ffmpeg -i "{input}" ...` is correct. `ffmpeg -i {input} ...` is incorrect.

**Behavior:**

* Commands are fully defined (must include the `ffmpeg` binary call).
* "Refresh" button re-reads this file.
* If JSON is invalid/missing, display a blocking error message in the UI.

### 3. Processing Logic

#### Startup Checks

* Verify `ffmpeg` is available in PATH.
* If missing: Show error, disable application features.
* Load the last used output directory (if available).

#### Pre-process Validation

* **Duplicate Detection:** If multiple source files share the exact same filename (even from different folders), display a warning and **exclude** them from the queue to prevent overwriting conflicts.

#### Execution Loop

* **Mode:** Sequential (one file at a time).
* For each file:
1. Parse placeholders in the selected command string.
2. Execute the command via Node.js child process.
3. Capture `stdout` and `stderr` for the UI console and session log.
4. Check exit code (0 = success, anything else = failure).
* *Note:* Success is determined solely by exit code, not by file presence.


5. Update progress bar.


* **Failure:** If a file fails, log the error and proceed to the next file.
* **Stop:** Interrups the current process and stops the queue.

#### File Conflicts

* If the output file already exists: **Overwrite silently** (no user prompt).

#### Logging

* During processing, append all console output and error messages to a temporary `session_log.txt`.
* This file is opened when the user clicks "Open Session Log".

### 4. Technical Constraints

* **Strict Minimalism:** Avoid unnecessary npm packages.
* **No Embedded FFmpeg:** Rely entirely on the system's FFmpeg.
* **No "Smart" Logic:** The app is a dumb executor. It does not guess extensions or parameters.
* **Single Window:** No popups or modals (except native OS file/folder pickers).

## Bootstrapping Commands (JSON Example)

```json
{
  "commands": [
    {
      "name": "Sanity Check (No output)",
      "command": "ffmpeg -v error -i \"{input}\" -f null -"
    },
    {
      "name": "Convert to 720p MP4",
      "command": "ffmpeg -i \"{input}\" -vf scale=-1:720 \"{output_dir}\\{name}.mp4\""
    },
    {
      "name": "Extract Frames (PNG)",
      "command": "ffmpeg -i \"{input}\" \"{output_dir}\\{name}_%04d.png\""
    },
    {
      "name": "Remux to MKV (Copy stream)",
      "command": "ffmpeg -i \"{input}\" -c copy \"{output_dir}\\{name}.mkv\""
    }
  ]
}

```

## Implementation Notes

* **Native APIs:** Use Electron `dialog` for file picking and `shell` for opening folders/files.
* **Execution:** Use Node.js `child_process.exec` (or `spawn`).
* **Streams:** FFmpeg often outputs progress info to `stderr`. Ensure the UI console captures and displays both `stdout` and `stderr` to avoid empty logs during processing.
* **Settings:** Use a simple method to persist the `lastOutputDirectory` (e.g., `electron-store` or writing a small JSON config file in `app.getPath('userData')`).
* **UI:** Plain HTML/CSS (no heavy frameworks like React/Vue unless absolutely necessary for state management).
