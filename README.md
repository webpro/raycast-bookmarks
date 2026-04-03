# Bookmarks

Raycast extension to manage bookmarks from a plain text file — search, open, add, and export for browser import.

## Features

- Plain text bookmarks file (tip: works with iCloud, Dropbox, Proton Drive, or any synced folder)
- Search and open bookmarks in any browser
- Reuse existing browser tab instead of opening a new one (configurable)
- Add bookmarks with URL pre-filled from clipboard or active browser tab
- Pin bookmarks to the browser bookmark bar (favicon-only, no title)
- Export bookmarks to Chrome, Firefox, and Zen

## Install

Requires [Raycast][1] and [Node.js][2] 20+.

```sh
git clone https://github.com/webpro/raycast-bookmarks.git
cd raycast-bookmarks
pnpm install
pnpm run dev
```

This registers the extension in Raycast. After the initial setup, the extension
persists — you don't need to keep the dev server running.

To update later:

```sh
git pull
pnpm install
pnpm run build
```

## File format

On first launch, Raycast asks you to select a bookmarks file. Example:

```text
[main]
https://mail.proton.me 📌
https://bsky.app 📌,bluesky,social

[dev]
https://developers.raycast.com
https://developer.mozilla.org mdn
```

- `[title]` starts a bookmark folder
- URLs are one per line
- Comma or space-separated tags after the URL are additional search keywords
- The pin emoji (📌) marks a bookmark as pinned

## Commands

| Command          | Description                                               |
| ---------------- | --------------------------------------------------------- |
| Open Bookmark    | Search and open bookmarks in the browser                  |
| Add Bookmark     | Add a new bookmark (pre-fills URL from clipboard or tab)  |
| Export Bookmarks | Export bookmarks to Chrome, Firefox, and Zen              |

## Configuration

| Setting           | Description                                | Default |
| ----------------- | ------------------------------------------ | ------- |
| Bookmarks File    | Path to your bookmarks file                | —       |
| Reuse browser tab | Focus existing tab instead of opening new  | Off     |

## Firefox / Zen

The "Reuse existing browser tab" feature and the "Add Bookmark" URL pre-fill
from the active tab work out of the box for Chrome and Safari (via AppleScript).

For Firefox and Zen, a companion browser extension and native messaging host are
required — see [browser-tab-bridge][3] to set this up.

## Tip: Hotkey

Assign a global hotkey to open a command directly:
Raycast Settings → Extensions → Bookmarks → Open Bookmark → Hotkey.

[1]: https://raycast.com
[2]: https://nodejs.org
[3]: https://github.com/webpro/browser-tab-bridge
