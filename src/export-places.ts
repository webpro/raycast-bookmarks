import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { BookmarkFolder } from './types';

const TOOLBAR_GUID = 'toolbar_____';

const generateGuid = () => randomUUID().replace(/-/g, '').substring(0, 12);

function reverseHost(url: string): string {
  try {
    const host = new URL(url).hostname;
    return host.split('').reverse().join('') + '.';
  } catch {
    return '.';
  }
}

function parseOrigin(url: string): { prefix: string; host: string } {
  try {
    const parsed = new URL(url);
    return { prefix: `${parsed.protocol}//`, host: parsed.hostname };
  } catch {
    return { prefix: 'https://', host: '' };
  }
}

function mozUrlHash(url: string): bigint {
  const GOLDEN_RATIO = 0x9e3779b9;
  const MAX_INT = 0xffffffff;

  function rotateLeft5(value: number): number {
    return ((value << 5) | (value >>> 27)) & MAX_INT;
  }

  function addToHash(hashValue: number, value: number): number {
    return (Math.imul(GOLDEN_RATIO, (rotateLeft5(hashValue) ^ value) & MAX_INT) & MAX_INT) >>> 0;
  }

  function hashSimple(str: string): number {
    const bytes = new TextEncoder().encode(str);
    let h = 0;
    for (const byte of bytes) {
      h = addToHash(h, byte);
    }
    return h;
  }

  const colonIndex = url.indexOf(':');
  const prefix = colonIndex >= 0 ? url.substring(0, colonIndex) : url;
  const prefixHash = hashSimple(prefix) & 0x0000ffff;
  const urlHash = hashSimple(url);
  return BigInt(prefixHash) * BigInt(2 ** 32) + BigInt(urlHash);
}

function escapeSql(str: string): string {
  return str.replace(/'/g, "''");
}

export function generatePlacesSql(folders: BookmarkFolder[], pinnedBookmarks: BookmarkFolder['bookmarks']): string {
  const now = Date.now() * 1000;
  const lines: string[] = [];

  lines.push('PRAGMA journal_mode=WAL;');
  lines.push('BEGIN TRANSACTION;');

  // Delete all non-root bookmarks (keep ids 1-6: root, menu, toolbar, tags, unfiled, mobile)
  lines.push('DELETE FROM moz_bookmarks WHERE id > 6;');

  // Reset foreign_count for all places that had bookmarks
  lines.push('UPDATE moz_places SET foreign_count = 0 WHERE foreign_count > 0;');

  // Collect all unique origins and URLs
  const allBookmarks = [
    ...pinnedBookmarks.map(b => ({ ...b, folder: null as string | null })),
    ...folders.flatMap(f => f.bookmarks.map(b => ({ ...b, folder: f.name }))),
  ];

  // Insert origins
  const origins = new Map<string, { prefix: string; host: string }>();
  for (const bookmark of allBookmarks) {
    const origin = parseOrigin(bookmark.url);
    const key = `${origin.prefix}${origin.host}`;
    if (!origins.has(key)) origins.set(key, origin);
  }

  for (const { prefix, host } of origins.values()) {
    lines.push(
      `INSERT OR IGNORE INTO moz_origins (prefix, host, frecency) VALUES ('${escapeSql(prefix)}', '${escapeSql(host)}', 0);`,
    );
  }

  // Insert places (URLs)
  for (const bookmark of allBookmarks) {
    const urlHash = mozUrlHash(bookmark.url);
    const revHost = reverseHost(bookmark.url);
    const origin = parseOrigin(bookmark.url);
    const guid = generateGuid();

    lines.push(
      `INSERT OR IGNORE INTO moz_places (url, title, rev_host, visit_count, hidden, typed, frecency, guid, foreign_count, url_hash, origin_id, recalc_frecency, recalc_alt_frecency)` +
        ` VALUES ('${escapeSql(bookmark.url)}', '${escapeSql(bookmark.title ?? '')}', '${escapeSql(revHost)}', 0, 0, 0, 0, '${guid}', 0, ${urlHash}, (SELECT id FROM moz_origins WHERE prefix = '${escapeSql(origin.prefix)}' AND host = '${escapeSql(origin.host)}'), 0, 0);`,
    );
  }

  // Get toolbar id
  const toolbarQuery = `(SELECT id FROM moz_bookmarks WHERE guid = '${TOOLBAR_GUID}')`;

  let position = 0;

  // Insert pinned bookmarks directly on toolbar
  for (const bookmark of pinnedBookmarks) {
    const folderGuid = generateGuid();
    lines.push(
      `INSERT INTO moz_bookmarks (type, fk, parent, position, title, dateAdded, lastModified, guid, syncStatus, syncChangeCounter)` +
        ` VALUES (1, (SELECT id FROM moz_places WHERE url = '${escapeSql(bookmark.url)}'), ${toolbarQuery}, ${position}, '', ${now}, ${now}, '${folderGuid}', 0, 1);`,
    );
    lines.push(`UPDATE moz_places SET foreign_count = foreign_count + 1 WHERE url = '${escapeSql(bookmark.url)}';`);
    position++;
  }

  // Insert folders and their bookmarks
  for (const folder of folders) {
    const folderGuid = generateGuid();

    lines.push(
      `INSERT INTO moz_bookmarks (type, parent, position, title, dateAdded, lastModified, guid, syncStatus, syncChangeCounter)` +
        ` VALUES (2, ${toolbarQuery}, ${position}, '${escapeSql(folder.name)}', ${now}, ${now}, '${folderGuid}', 0, 1);`,
    );

    let bookmarkPosition = 0;
    for (const bookmark of folder.bookmarks) {
      const bookmarkGuid = generateGuid();
      const lastInsertFolder = `(SELECT id FROM moz_bookmarks WHERE guid = '${folderGuid}')`;

      lines.push(
        `INSERT INTO moz_bookmarks (type, fk, parent, position, title, dateAdded, lastModified, guid, syncStatus, syncChangeCounter)` +
          ` VALUES (1, (SELECT id FROM moz_places WHERE url = '${escapeSql(bookmark.url)}'), ${lastInsertFolder}, ${bookmarkPosition}, '${escapeSql(bookmark.title ?? '')}', ${now}, ${now}, '${bookmarkGuid}', 0, 1);`,
      );
      lines.push(`UPDATE moz_places SET foreign_count = foreign_count + 1 WHERE url = '${escapeSql(bookmark.url)}';`);
      bookmarkPosition++;
    }

    position++;
  }

  // Update toolbar lastModified
  lines.push(`UPDATE moz_bookmarks SET lastModified = ${now} WHERE guid = '${TOOLBAR_GUID}';`);

  lines.push('COMMIT;');

  return lines.join('\n');
}

export function writePlacesBookmarks(dbPath: string, sql: string): void {
  execSync(`sqlite3 '${dbPath.replace(/'/g, "'\\''")}' <<'ENDSQL'\n${sql}\nENDSQL`, {
    shell: '/bin/bash',
    timeout: 10000,
  });
}
