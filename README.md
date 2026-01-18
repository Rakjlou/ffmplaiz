# ffmplaiz

A minimal Electron GUI wrapper for FFmpeg batch processing.

## Requirements

- Node.js
- FFmpeg installed and available in system PATH

## Usage

```bash
npm install
npm start
```

## Building

```bash
npm run build        # Windows portable executable
npm run build:dir    # Build without packaging
```

## Features

- Drag and drop files for batch processing
- Configurable FFmpeg commands via `commands.json`
- Real-time FFmpeg output display
- Session logging

## Commands Configuration

Edit `commands.json` to define FFmpeg commands. Available placeholders:

| Placeholder | Description |
|-------------|-------------|
| `{input}` | Full path of the source file |
| `{output_dir}` | Selected output folder |
| `{name}` | Filename without extension |
| `{ext}` | File extension (e.g., `.mkv`) |

Paths with spaces must be quoted in the command string.
