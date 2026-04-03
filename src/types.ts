export interface Bookmark {
  url: string;
  tags: string[];
  title?: string;
}

export interface BookmarkFolder {
  name: string;
  bookmarks: Bookmark[];
}
