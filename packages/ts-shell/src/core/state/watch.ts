import fs from "node:fs";
import path from "node:path";

/** Watch entries and directory replacement, including a not-yet-created target. */
export function observeDirectory(directory: string, changed: () => void): () => void {
  let stopped = false;
  let generation = 0;
  let watchers: fs.FSWatcher[] = [];
  const close = () => { generation++; for (const watcher of watchers) watcher.close(); watchers = []; };
  const notify = () => {
    if (stopped) return;
    close();
    attach();
    changed();
  };
  const watch = (target: string, child?: string) => {
    const revision = generation;
    try {
      const watcher = fs.watch(target, { persistent: false }, (_event, name) => {
        if (revision === generation && (!child || !name || name.toString() === child)) notify();
      });
      watcher.on("error", () => { if (revision === generation) close(); });
      watchers.push(watcher);
    } catch { /* Unsupported or inaccessible watches retain the normal TTL fallback. */ }
  };
  const attach = () => {
    let ancestor = directory;
    while (true) {
      try { if (fs.statSync(ancestor).isDirectory()) break; } catch { /* Find the nearest existing directory. */ }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) return;
      ancestor = parent;
    }
    if (ancestor === directory) {
      watch(directory);
      if (path.dirname(directory) !== directory) watch(path.dirname(directory), path.basename(directory));
    } else {
      watch(ancestor, path.relative(ancestor, directory).split(path.sep)[0]);
    }
  };
  attach();
  return () => { stopped = true; close(); };
}
