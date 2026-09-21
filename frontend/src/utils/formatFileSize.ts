export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);

  return `${value.toFixed(i === 0 ? 0 : value < 10 ? 2 : 1)} ${units[i]}`;
}

export const MAX_DEMO_SIZE_BYTES = 600 * 1024 * 1024;
export const LARGE_DEMO_WARNING_BYTES = 300 * 1024 * 1024;
