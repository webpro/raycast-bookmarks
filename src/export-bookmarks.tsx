import { Action, ActionPanel, Form, showToast, open } from '@raycast/api';
import { useState, useEffect } from 'react';
import { homedir, EOL } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { readdir, stat, writeFile, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { getBookmarkFolders, getPinnedBookmarks, removePinnedBookmarks } from './read-bookmarks';
import { generatePlacesSql, writePlacesBookmarks } from './export-places';
import type { BookmarkFolder } from './types';

type Profile = {
  id: string;
  name: string;
  path: string;
  lastModified?: Date;
};

type Browser = {
  name: string;
  path: string;
  profiles: Profile[];
};

const BROWSER_PATHS: Record<string, string> = {
  Chrome: 'Google/Chrome',
  Firefox: 'Firefox',
  Zen: 'zen',
};

async function getInstalledBrowsers(): Promise<Browser[]> {
  const appSupportPath = join(homedir(), 'Library/Application Support');
  const installedBrowsers: Browser[] = [];

  for (const [name, relativePath] of Object.entries(BROWSER_PATHS)) {
    const browserPath = join(appSupportPath, relativePath);
    try {
      await stat(browserPath);
      const profiles = await getBrowserProfiles(browserPath, name);
      if (profiles.length > 0) {
        installedBrowsers.push({ name, path: browserPath, profiles });
      }
    } catch {
      // Browser not found
    }
  }

  return installedBrowsers;
}

async function getChromeActiveProfile(browserPath: string): Promise<string | null> {
  try {
    const localState = JSON.parse(await readFile(join(browserPath, 'Local State'), 'utf-8'));
    return localState?.profile?.last_used ?? null;
  } catch {
    return null;
  }
}

async function getBrowserProfiles(browserPath: string, browserName: string): Promise<Profile[]> {
  if (browserName === 'Chrome' || browserName === 'Chromium') {
    const activeProfileId = await getChromeActiveProfile(browserPath);
    const profiles: Profile[] = [];
    const files = await readdir(browserPath, { withFileTypes: true });
    for (const file of files) {
      if (file.isDirectory() && (file.name.startsWith('Profile ') || file.name === 'Default')) {
        const profilePath = join(browserPath, file.name);
        const bookmarksPath = join(profilePath, 'Bookmarks');
        try {
          const stats = await stat(bookmarksPath);
          const preferencesPath = join(profilePath, 'Preferences');
          const preferences = JSON.parse(await readFile(preferencesPath, 'utf-8'));
          profiles.push({
            id: file.name,
            name: preferences.profile.name,
            path: profilePath,
            lastModified: stats.mtime,
          });
        } catch {
          // Not a valid profile directory
        }
      }
    }
    // Put active profile first, then sort rest by last modified
    return profiles.sort((a, b) => {
      if (a.id === activeProfileId) return -1;
      if (b.id === activeProfileId) return 1;
      return (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0);
    });
  }
  if (browserName === 'Firefox' || browserName === 'Zen') {
    const profilesIniPath = join(browserPath, 'profiles.ini');
    try {
      const profilesIni = await readFile(profilesIniPath, 'utf-8');
      const profiles: Profile[] = [];
      const lines = profilesIni.split(EOL);
      let currentProfile: Partial<Profile> = {};

      for (const line of lines) {
        if (line.startsWith('[Profile')) {
          if (currentProfile.id) {
            profiles.push(currentProfile as Profile);
          }
          currentProfile = {};
        } else if (line.startsWith('Name=')) {
          currentProfile.name = line.substring(5);
        } else if (line.startsWith('Path=')) {
          const profilePath = join(browserPath, line.substring(5));
          currentProfile.id = profilePath;
          currentProfile.path = profilePath;
          try {
            const bookmarksPath = join(profilePath, 'places.sqlite');
            const stats = await stat(bookmarksPath);
            currentProfile.lastModified = stats.mtime;
          } catch {
            // no places.sqlite
          }
        }
      }
      if (currentProfile.id) {
        profiles.push(currentProfile as Profile);
      }

      return profiles.filter(p => p.lastModified).sort((a, b) => b.lastModified!.getTime() - a.lastModified!.getTime());
    } catch {
      return [];
    }
  }
  return [];
}

const createBaseBookmarkData = (timestamp: number) => ({
  date_added: timestamp.toString(),
  date_last_used: '0',
  guid: randomUUID(),
  id: Math.floor(Math.random() * 10000).toString(),
});

const createBookmarkNode = (url: string, name: string, timestamp: number) => ({
  ...createBaseBookmarkData(timestamp),
  type: 'url',
  url,
  name,
});

const createFolderNode = (name: string, children: Record<string, unknown>[], timestamp: number) => ({
  ...createBaseBookmarkData(timestamp),
  children,
  date_modified: '0',
  type: 'folder',
  name,
});

function generateChromeBookmarks(folders: BookmarkFolder[]) {
  const timestamp = Math.floor(Date.now() / 1000);
  const pinnedBookmarks = getPinnedBookmarks(folders);
  const foldersWithoutPinned = removePinnedBookmarks(folders);

  const pinnedChildren = pinnedBookmarks.map(bookmark => createBookmarkNode(bookmark.url, '', timestamp));

  const bookmarkBar = foldersWithoutPinned.map(folder =>
    createFolderNode(
      folder.name,
      folder.bookmarks.map(bookmark => createBookmarkNode(bookmark.url, bookmark.title ?? '', timestamp)),
      timestamp,
    ),
  );

  return {
    checksum: '',
    roots: {
      bookmark_bar: createFolderNode('Bookmarks Bar', [...pinnedChildren, ...bookmarkBar], timestamp),
      other: createFolderNode('Other Bookmarks', [], timestamp),
      synced: createFolderNode('Mobile Bookmarks', [], timestamp),
    },
    version: 1,
  };
}

export default function Command() {
  const [browsers, setBrowsers] = useState<Browser[]>([]);
  const [selectedBrowsers, setSelectedBrowsers] = useState<Record<string, boolean>>({});
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    async function fetchBrowsers() {
      const installed = await getInstalledBrowsers();
      setBrowsers(installed);
      const initialSelection: Record<string, boolean> = {};
      for (const browser of installed) initialSelection[browser.name] = true;
      setSelectedBrowsers(initialSelection);
      const initialProfiles: Record<string, string> = {};
      for (const browser of installed) {
        if (browser.profiles.length > 0) {
          initialProfiles[browser.name] = browser.profiles[0].id;
        }
      }
      setSelectedProfiles(initialProfiles);
    }
    fetchBrowsers();
  }, []);

  const handleBrowserSelectionChange = (browserName: string, value: boolean) => {
    setSelectedBrowsers(prev => ({ ...prev, [browserName]: value }));
  };

  const handleProfileChange = (browserName: string, profile: string) => {
    setSelectedProfiles(prev => ({ ...prev, [browserName]: profile }));
  };

  const handleSubmit = async () => {
    const folders = getBookmarkFolders();
    const restartBrowsers: string[] = [];

    for (const browserName of Object.keys(selectedBrowsers).filter(b => selectedBrowsers[b])) {
      const browser = browsers.find(b => b.name === browserName);
      if (!browser) continue;

      const profile = selectedProfiles[browserName];
      if (!profile) continue;

      try {
        if (browser.name === 'Chrome') {
          const chromeBookmarks = generateChromeBookmarks(folders);
          const exportPath = join(browser.path, profile, 'Bookmarks');
          await writeFile(exportPath, JSON.stringify(chromeBookmarks, null, 2));
          restartBrowsers.push('Chrome');
        } else if (browser.name === 'Zen' || browser.name === 'Firefox') {
          const pinnedBookmarks = getPinnedBookmarks(folders);
          const foldersWithoutPinned = removePinnedBookmarks(folders);
          const sql = generatePlacesSql(foldersWithoutPinned, pinnedBookmarks);
          const dbPath = join(profile, 'places.sqlite');
          const appName = browser.name === 'Zen' ? 'Zen' : 'Firefox';
          execSync(`osascript -e 'quit app "${appName}"'`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          writePlacesBookmarks(dbPath, sql);
          restartBrowsers.push(browser.name);
        }
      } catch (error) {
        await showToast({
          title: `Failed to export bookmarks for ${browser.name}`,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (restartBrowsers.length > 0) {
      await showToast({ title: `Bookmarks exported, restarting ${restartBrowsers.join(' & ')}...` });
      setTimeout(() => {
        if (restartBrowsers.includes('Chrome')) open('chrome://restart', 'com.google.Chrome');
        if (restartBrowsers.includes('Zen')) open('about:blank', 'app.zen-browser.zen');
        if (restartBrowsers.includes('Firefox')) open('about:blank', 'org.mozilla.firefox');
      }, 1500);
    } else {
      await showToast({ title: 'Bookmarks exported' });
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Export Bookmarks" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Select the browsers to export bookmarks to." />
      {browsers.map(browser => (
        <Form.Checkbox
          key={browser.name}
          id={browser.name}
          label={browser.name}
          value={selectedBrowsers[browser.name]}
          onChange={value => handleBrowserSelectionChange(browser.name, value)}
        />
      ))}
      <Form.Separator />
      <Form.Description text="Select the profiles for the selected browsers." />
      {Object.keys(selectedBrowsers)
        .filter(b => selectedBrowsers[b])
        .map(browserName => {
          const browser = browsers.find(b => b.name === browserName);
          if (!browser) return null;
          return (
            <Form.Dropdown
              key={browserName}
              id={`${browserName}-profile`}
              title={`${browserName} Profile`}
              value={selectedProfiles[browserName]}
              onChange={profileId => handleProfileChange(browserName, profileId)}
            >
              {browser.profiles.map((profile, i) => (
                <Form.Dropdown.Item
                  key={profile.id}
                  value={profile.id}
                  title={`${profile.name}${i === 0 ? ' (active)' : ''}`}
                />
              ))}
            </Form.Dropdown>
          );
        })}
    </Form>
  );
}
