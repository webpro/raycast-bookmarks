import { getPreferenceValues } from '@raycast/api';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { EOL, homedir } from 'node:os';
import { dirname } from 'node:path';
import type { Bookmark, BookmarkFolder } from './types';

const DEFAULT_CONTENT = `[main]${EOL}`;

export function getBookmarksPath() {
  const raw = getPreferenceValues<{ bookmarksFile: string }>().bookmarksFile || '~/bookmarks.txt';
  return raw.startsWith('~/') ? raw.replace('~', homedir()) : raw;
}

export function ensureBookmarksFile() {
  const path = getBookmarksPath();
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, DEFAULT_CONTENT, 'utf8');
  }
}

const PINNED_TAG = '📌';

const getTitle = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

function parseBookmarkLine(line: string): Bookmark {
  const spaceIndex = line.indexOf(' ');
  if (spaceIndex === -1) {
    const url = line;
    return { url, tags: [], title: getTitle(url) };
  }
  const url = line.substring(0, spaceIndex);
  const rest = line.substring(spaceIndex + 1);
  const tags = rest
    .split(/,\s*/)
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
  return { url, tags, title: getTitle(url) };
}

export function readBookmarks() {
  ensureBookmarksFile();
  const content = readFileSync(getBookmarksPath(), 'utf8');
  return content
    .split(EOL)
    .filter(line => line.startsWith('http'))
    .map(parseBookmarkLine);
}

export function getBookmarkFolders(): BookmarkFolder[] {
  ensureBookmarksFile();
  const content = readFileSync(getBookmarksPath(), 'utf8');
  const lines = content.split(EOL);
  const folders: BookmarkFolder[] = [];
  let currentFolder: BookmarkFolder | null = null;

  for (const line of lines) {
    if (!line.trim()) {
      currentFolder = null;
      continue;
    }

    if (line.startsWith('[') && line.endsWith(']')) {
      currentFolder = {
        name: line.slice(1, -1),
        bookmarks: [],
      };
      folders.push(currentFolder);
      continue;
    }

    if (line.startsWith('http') && currentFolder) {
      currentFolder.bookmarks.push(parseBookmarkLine(line));
    }
  }

  return folders;
}

export function removePinnedBookmarks(folders: BookmarkFolder[]): BookmarkFolder[] {
  return folders.map(folder => ({
    ...folder,
    bookmarks: folder.bookmarks.filter(bookmark => !bookmark.tags.includes(PINNED_TAG)),
  }));
}

export function getPinnedBookmarks(folders: BookmarkFolder[]): Bookmark[] {
  return folders
    .flatMap(folder => folder.bookmarks.filter(bookmark => bookmark.tags.includes(PINNED_TAG)))
    .map(bookmark => ({
      ...bookmark,
      tags: bookmark.tags.filter(tag => tag !== PINNED_TAG),
    }));
}

export function removeBookmark(url: string): void {
  const content = readFileSync(getBookmarksPath(), 'utf8');
  const lines = content.split(EOL);
  const filtered = lines.filter(line => {
    const spaceIndex = line.indexOf(' ');
    const lineUrl = spaceIndex === -1 ? line : line.substring(0, spaceIndex);
    return lineUrl !== url;
  });
  writeBookmarks(filtered);
}

export function writeBookmarks(lines: string[]) {
  const content = lines.join(EOL);
  writeFileSync(getBookmarksPath(), content.endsWith(EOL) ? content : content + EOL, 'utf8');
}
