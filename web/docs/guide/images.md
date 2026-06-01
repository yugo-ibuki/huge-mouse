# Image Attachment

## Overview

Send images to the selected AI pane directly from unitmux.

## Attaching Images

**Button**: Click the "+" button in the footer to open a file picker. Select one or more image files.
On Linux, the button uses `zenity`.

**Drag & Drop**: Drag image files from Finder directly onto the unitmux window.

Supported formats: PNG, JPG, JPEG, GIF, WebP, SVG, BMP

## Preview

Attached images appear as thumbnails above the input area. Hover to reveal the remove (×) button.

## Sending

Images are pasted into the pane before your text message so the CLI can detect the file paths.

- With text: images are sent first, then the text message
- Without text: images alone can be sent by pressing Send
