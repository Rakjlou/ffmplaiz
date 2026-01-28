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

### Single-File Commands

| Placeholder | Description |
|-------------|-------------|
| `{input}` | Full path of the source file |
| `{output_dir}` | Selected output folder |
| `{name}` | Filename without extension |
| `{ext}` | File extension (e.g., `.mkv`) |

### Multi-File Commands

Commands using these placeholders automatically process ALL selected files as a single batch operation (requires 2+ files):

| Placeholder | Description |
|-------------|-------------|
| `{concat_file}` | Path to generated file listing all input files |
| `{all_output}` | Automatically generated output filename with timestamp |
| `{output_dir}` | Selected output folder |

**Examples:**
- Video merging: `ffmpeg -f concat -safe 0 -i "{concat_file}" -c copy "{output_dir}/{all_output}"`
- Image montage: `ffmpeg -f concat -safe 0 -i "{concat_file}" -filter_complex hstack "{output_dir}/{all_output}"`

Paths with spaces must be quoted in the command string.
