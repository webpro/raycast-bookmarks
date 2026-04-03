/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Bookmarks File - Path to your bookmarks.txt file */
  "bookmarksFile"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `open-bookmark` command */
  export type OpenBookmark = ExtensionPreferences & {
  /** Browser - Focus an existing tab if the URL is already open, instead of opening a new tab */
  "reuseTab": boolean
}
  /** Preferences accessible in the `export-bookmarks` command */
  export type ExportBookmarks = ExtensionPreferences & {}
  /** Preferences accessible in the `add-bookmark` command */
  export type AddBookmark = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `open-bookmark` command */
  export type OpenBookmark = {}
  /** Arguments passed to the `export-bookmarks` command */
  export type ExportBookmarks = {}
  /** Arguments passed to the `add-bookmark` command */
  export type AddBookmark = {}
}

