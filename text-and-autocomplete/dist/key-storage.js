// Keeps the prototype's original name, Smart Writer, so keys saved by earlier builds still load.
const STORAGE_KEY = 'smart-writer.openai-api-key';

export function readSavedKey() {
  try {
    return globalThis.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}
// Writes deliberately throw so the UI can report when browser storage is blocked.
export function saveKey(key) {
  globalThis.localStorage.setItem(STORAGE_KEY, key);
}
export function forgetKey() {
  globalThis.localStorage.removeItem(STORAGE_KEY);
}
