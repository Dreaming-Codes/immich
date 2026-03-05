declare module 'main' {
  export function assetFileFilter(): I32;
  export function assetArchive(): I32;
  export function assetFavorite(): I32;
  export function assetLock(): I32;
  export function assetTrash(): I32;
}

declare module 'extism:host' {
  interface user {
    addAssetToAlbum(ptr: PTR): I32;
  }
}
