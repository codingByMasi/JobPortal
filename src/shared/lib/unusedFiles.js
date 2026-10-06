// Which stored picture files are no longer used by any ad (left behind when an ad was deleted and the browser could not remove the file).

const DAY = 86400000;

/**
 * `files` are { path, size, createdAt } from the storage list; `jobs` are the rows with `file_path` and `thumb_path`.
 * A file is unused when no ad names it AND it is at least `minAgeDays` old (a picture uploaded a moment ago may belong to an ad being saved right now).
 */
export function pickUnused(files, jobs, now = Date.now(), minAgeDays = 1) {
  const used = new Set();
  for (const j of jobs) {
    if (j.file_path) used.add(j.file_path);
    if (j.thumb_path) used.add(j.thumb_path);
  }
  return files.filter((f) => !used.has(f.path) && f.createdAt != null && now - f.createdAt >= minAgeDays * DAY);
}

/** "3.2 MB" / "840 KB". */
export function formatSize(bytes = 0) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
