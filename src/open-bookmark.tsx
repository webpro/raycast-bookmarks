import { useState, useCallback, useEffect } from 'react';
import { ActionPanel, Action, Alert, Form, Icon, List, Toast, confirmAlert, getPreferenceValues, popToRoot, closeMainWindow, open, showToast, useNavigation } from '@raycast/api';
import { getFavicon } from '@raycast/utils';
import { readFile } from 'node:fs/promises';
import { EOL } from 'node:os';
import { getBookmarksPath, getBookmarkFolders, readBookmarks, removeBookmark, writeBookmarks } from './read-bookmarks';
import { type BrowserApp, openInBrowserTab, getInstalledBrowsers } from 'browser-tab-bridge';

const BROWSER_SHORTCUTS: Record<string, { modifiers: string[]; key: string }> = {
  'com.apple.Safari': { modifiers: ['cmd'], key: 's' },
  'com.google.Chrome': { modifiers: ['cmd'], key: 'c' },
  'com.google.Chrome.canary': { modifiers: ['shift', 'cmd'], key: 'c' },
  'com.brave.Browser': { modifiers: ['cmd'], key: 'b' },
  'com.microsoft.edgemac': { modifiers: ['cmd'], key: 'g' },
  'com.vivaldi.Vivaldi': { modifiers: ['cmd'], key: 'v' },
  'company.thebrowser.Browser': { modifiers: ['cmd'], key: 'r' },
  'com.operasoftware.Opera': { modifiers: ['cmd'], key: 'o' },
  'org.chromium.Chromium': { modifiers: ['cmd'], key: 'h' },
  'org.mozilla.firefox': { modifiers: ['cmd'], key: 'f' },
  'org.mozilla.pale moon': { modifiers: ['cmd'], key: 'm' },
  'app.zen-browser.zen': { modifiers: ['cmd'], key: 'z' },
  'com.duckduckgo.macos.browser': { modifiers: ['cmd'], key: 'd' },
};

function EditBookmarkForm({ url, tags, onEdit }: { url: string; tags: string[]; onEdit: () => void }) {
  const { pop } = useNavigation();
  const folders = getBookmarkFolders();
  const folderNames = folders.map(f => f.name);
  const currentFolder = folders.find(f => f.bookmarks.some(b => b.url === url))?.name ?? folderNames[0];
  const isPinnedInitially = tags.includes('📌');
  const tagsWithoutPin = tags.filter(t => t !== '📌').join(', ');

  const handleSubmit = async (values: { url: string; folder: string; tags: string; pinned: boolean }) => {
    const content = await readFile(getBookmarksPath(), 'utf8');
    const lines = content.split(EOL);

    const filtered = lines.filter(line => {
      const spaceIndex = line.indexOf(' ');
      const lineUrl = spaceIndex === -1 ? line : line.substring(0, spaceIndex);
      return lineUrl !== url;
    });

    const suffix = [...(values.pinned ? ['📌'] : []), ...(values.tags ? values.tags.split(/[\s,]+/) : [])].filter(Boolean);
    const newLine = suffix.length > 0 ? `${values.url} ${suffix.join(', ')}` : values.url;

    const folderIndex = filtered.findIndex(line => line === `[${values.folder}]`);
    if (folderIndex === -1) {
      await showToast(Toast.Style.Failure, 'Folder not found');
      return;
    }
    let insertIndex = folderIndex + 1;
    while (insertIndex < filtered.length && filtered[insertIndex] && !filtered[insertIndex].startsWith('[')) {
      insertIndex++;
    }
    filtered.splice(insertIndex, 0, newLine);

    writeBookmarks(filtered);
    await showToast({ title: 'Bookmark updated' });
    onEdit();
    pop();
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Bookmark" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="url" title="URL" defaultValue={url} />
      <Form.Dropdown id="folder" title="Folder" defaultValue={currentFolder}>
        {folderNames.map(name => (
          <Form.Dropdown.Item key={name} value={name} title={name} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="tags" title="Tags" defaultValue={tagsWithoutPin} />
      <Form.Checkbox id="pinned" label="Pin bookmark" defaultValue={isPinnedInitially} />
    </Form>
  );
}

export default function Command() {
  const { reuseTab } = getPreferenceValues<{ reuseTab: boolean }>();
  const [bookmarks, setBookmarks] = useState(() => readBookmarks());
  const [installedBrowsers, setInstalledBrowsers] = useState<BrowserApp[]>([]);

  useEffect(() => {
    getInstalledBrowsers()
      .then(setInstalledBrowsers)
      .catch(() => setInstalledBrowsers([]));
  }, []);

  const handleDelete = useCallback(async (url: string) => {
    if (
      await confirmAlert({
        title: 'Delete Bookmark?',
        message: url,
        primaryAction: { title: 'Delete', style: Alert.ActionStyle.Destructive },
      })
    ) {
      removeBookmark(url);
      setBookmarks(prev => prev.filter(b => b.url !== url));
    }
  }, []);

  return (
    <List searchBarPlaceholder="Search bookmarks">
      {bookmarks.map(({ url, tags, title }) => (
        <List.Item
          key={url}
          title={title ?? ''}
          icon={getFavicon(url)}
          keywords={tags}
          accessories={[{ text: tags.filter(tag => tag !== '📌').join(', ') }]}
          actions={
            <ActionPanel>
              <Action
                title="Open URL"
                onAction={async () => {
                  await (reuseTab ? openInBrowserTab(url) : open(url));
                  popToRoot();
                  closeMainWindow();
                }}
              />
              {installedBrowsers.map((browser, index) => (
                <Action
                  key={browser.bundleId}
                  title={`Open in ${browser.name}`}
                  shortcut={BROWSER_SHORTCUTS[browser.bundleId]}
                  onAction={async () => {
                    await open(url, browser.bundleId);
                    popToRoot();
                    closeMainWindow();
                  }}
                />
              ))}
              <Action.Push
                title="Edit Bookmark"
                icon={Icon.Pencil}
                shortcut={{ modifiers: ['cmd'], key: 'e' }}
                target={<EditBookmarkForm url={url} tags={tags} onEdit={() => setBookmarks(readBookmarks())} />}
              />
              <Action
                title="Delete Bookmark"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ['ctrl'], key: 'x' }}
                onAction={() => handleDelete(url)}
              />
              <Action.Open
                title="Edit Bookmarks File"
                target={getBookmarksPath()}
                shortcut={{ modifiers: ['cmd'], key: '.' }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
