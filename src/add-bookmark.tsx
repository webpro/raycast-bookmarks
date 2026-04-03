import { useState, useEffect } from 'react';
import {
  ActionPanel,
  Action,
  Form,
  showToast,
  Clipboard,
  launchCommand,
  LaunchType,
  popToRoot,
  closeMainWindow,
} from '@raycast/api';
import { readFile } from 'node:fs/promises';
import { EOL } from 'node:os';
import { getBookmarksPath, getBookmarkFolders, writeBookmarks } from './read-bookmarks';
import { getActiveTabUrl } from 'browser-tab-bridge';

const isValidUrl = (text: string) => /^https?:\/\//.test(text);
const cleanUrl = (url: string) => {
  const u = new URL(url);
  return u.pathname === '/' && !u.search && !u.hash ? url.replace(/\/+$/, '') : url;
};

export default function Command() {
  const [url, setUrl] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [isRestart, setIsRestart] = useState(false);
  const [tags, setTags] = useState('');
  const folders = getBookmarkFolders();
  const folderNames = folders.map(folder => folder.name);

  useEffect(() => {
    const prefillUrl = async () => {
      const clipboard = await Clipboard.readText();
      if (clipboard && isValidUrl(clipboard)) {
        setUrl(cleanUrl(clipboard));
        return;
      }
      const tabUrl = await getActiveTabUrl();
      if (tabUrl && isValidUrl(tabUrl)) setUrl(cleanUrl(tabUrl));
    };
    prefillUrl();
  }, []);

  const createBookmarkLine = (url: string, isPinned: boolean, tags: string) => {
    const suffix = [...(isPinned ? ['📌'] : []), ...(tags ? tags.split(/[\s,]+/) : [])].filter(Boolean);
    return suffix.length > 0 ? `${url} ${suffix.join(', ')}` : url;
  };

  const addBookmarkToFolder = async (lines: string[], folder: string, bookmarkLine: string) => {
    let folderIndex = lines.findIndex(line => line === `[${folder}]`);
    if (folderIndex === -1) {
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      lines.push(`[${folder}]`);
      folderIndex = lines.length - 1;
    }
    let insertIndex = folderIndex + 1;
    while (insertIndex < lines.length && lines[insertIndex] && !lines[insertIndex].startsWith('[')) {
      insertIndex++;
    }
    lines.splice(insertIndex, 0, bookmarkLine);
    return true;
  };

  const handleSubmit = async (values: { url: string; folder: string; newFolder: string }) => {
    const folder = values.newFolder?.trim() || values.folder;
    const { url } = values;
    const content = await readFile(getBookmarksPath(), 'utf8');
    const lines = content.split(EOL);

    const existingBookmarkLine = lines.find(line => {
      const spaceIndex = line.indexOf(' ');
      const lineUrl = spaceIndex === -1 ? line : line.substring(0, spaceIndex);
      return lineUrl === url;
    });

    if (existingBookmarkLine) {
      const options = {
        title: 'Duplicate URL',
        message: 'Replace existing url?',
        primaryAction: {
          title: 'Replace',
          onAction: async () => {
            const existingIndex = lines.indexOf(existingBookmarkLine);
            lines.splice(existingIndex, 1);

            const bookmarkLine = createBookmarkLine(url, isPinned, tags);
            if (await addBookmarkToFolder(lines, folder, bookmarkLine)) {
              writeBookmarks(lines);
              await showToast({ title: 'Bookmark replaced' });
              if (isRestart) launchCommand({ name: 'export-bookmarks', type: LaunchType.UserInitiated });
              popToRoot();
              closeMainWindow();
            }
          },
        },
        dismissAction: {
          title: 'Cancel',
        },
      };

      await showToast(options);
      return;
    }

    const bookmarkLine = createBookmarkLine(url, isPinned, tags);
    if (await addBookmarkToFolder(lines, folder, bookmarkLine)) {
      writeBookmarks(lines);
      await showToast({ title: 'Bookmark added' });
      if (isRestart) launchCommand({ name: 'export-bookmarks', type: LaunchType.UserInitiated });
      popToRoot();
      closeMainWindow();
    }
  };

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Bookmark" onSubmit={handleSubmit} />
          <Action.Open
            title="Edit Bookmarks File"
            target={getBookmarksPath()}
            shortcut={{ modifiers: ['cmd'], key: '.' }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="url" title="URL" placeholder="Enter the URL" value={url} onChange={setUrl} />
      <Form.Dropdown id="folder" title="Folder">
        {folderNames.map(name => (
          <Form.Dropdown.Item key={name} value={name} title={name} />
        ))}
      </Form.Dropdown>
      <Form.TextField id="newFolder" title="New Folder" placeholder="Create new folder" />
      <Form.TextField id="tags" title="Tags" placeholder="Tags" value={tags} onChange={setTags} />
      <Form.Checkbox id="pinned" label="Pin bookmark" value={isPinned} onChange={setIsPinned} />
      <Form.Checkbox id="restart" label="Restart Chrome" value={isRestart} onChange={setIsRestart} />
    </Form>
  );
}
