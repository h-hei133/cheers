/**
 * The exported page: a shell, a stylesheet, and the script that fills it.
 *
 * Held as string constants rather than as files beside the module. The export
 * runs from a build directory, a test directory, and an installed package, and
 * an asset path that works in one of those does not work in the others — the
 * failure would be an export that writes a file with no stylesheet in it. A
 * string has no path to get wrong.
 *
 * The script is deliberately plain: no framework, no bundler, no fetch. It runs
 * from a `file://` URL with no network, which is what an exported page has to do
 * to be worth sending to anyone.
 */

/** Where the payload goes. Read by the client, written by the generator. */
export const DATA_ELEMENT_ID = "session-data";

export const PAGE_STYLES = `
:root {
  --bg: #12141a; --panel: #181b23; --panel-2: #1f232c; --border: #2c313c;
  --text: #d7dae1; --muted: #8a91a0; --accent: #f0b429; --user: #7fb3ff;
  --tool: #9d8cff; --error: #ff6b6b; --ok: #6bd68b; --code-bg: #10131a;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #f7f8fa; --panel: #ffffff; --panel-2: #eef0f4; --border: #d9dde4;
    --text: #1c1f26; --muted: #5c6370; --accent: #b06f00; --user: #1d5fbf;
    --tool: #6a4fd0; --error: #c0392b; --ok: #1e7f47; --code-bg: #f2f4f8;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  background: var(--bg); color: var(--text);
  font: 14px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  display: grid; grid-template-columns: 320px 1fr; grid-template-rows: auto 1fr;
}
body.no-sidebar { grid-template-columns: 1fr; }
body.no-sidebar #sidebar { display: none; }
header {
  grid-column: 1 / -1; display: flex; gap: 12px; align-items: baseline;
  padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--panel);
  position: sticky; top: 0; z-index: 2;
}
header h1 { font-size: 14px; margin: 0; font-weight: 600; }
header .meta { color: var(--muted); font-size: 12px; }
header .spacer { flex: 1; }
header button {
  background: var(--panel-2); color: var(--text); border: 1px solid var(--border);
  border-radius: 6px; padding: 4px 10px; font: inherit; font-size: 12px; cursor: pointer;
}
header button:hover { border-color: var(--accent); }
#sidebar {
  border-right: 1px solid var(--border); background: var(--panel);
  overflow: auto; padding: 10px 8px;
}
#sidebar .filter {
  width: 100%; padding: 6px 8px; margin-bottom: 8px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit;
}
#sidebar ul { list-style: none; margin: 0; padding: 0; }
#sidebar li { margin: 0; }
.tree-row {
  display: flex; gap: 6px; align-items: baseline; width: 100%; text-align: left;
  background: none; border: 0; color: var(--text); font: inherit; font-size: 12.5px;
  padding: 3px 6px; border-radius: 5px; cursor: pointer; overflow: hidden;
}
.tree-row:hover { background: var(--panel-2); }
.tree-row[aria-current="true"] { background: var(--panel-2); outline: 1px solid var(--accent); }
.tree-row .role { color: var(--muted); flex: none; }
.tree-row .role.user { color: var(--user); }
.tree-row .role.assistant { color: var(--accent); }
.tree-row .role.tool { color: var(--tool); }
.tree-row .preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#conversation { overflow: auto; padding: 16px 20px 60vh; }
.turn { margin: 0 0 18px; border-left: 3px solid var(--border); padding-left: 12px; }
.turn.user { border-color: var(--user); }
.turn.assistant { border-color: var(--accent); }
.turn.tool { border-color: var(--tool); }
.turn .who { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.turn .body > :first-child { margin-top: 4px; }
.turn .body > :last-child { margin-bottom: 0; }
.turn.highlight { background: color-mix(in srgb, var(--accent) 12%, transparent); }
pre.fence {
  background: var(--code-bg); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px; overflow: auto; position: relative;
}
pre.fence code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
.fence-lang {
  position: absolute; top: 4px; right: 8px; font-size: 10px; color: var(--muted);
  text-transform: uppercase; letter-spacing: .06em;
}
code { background: var(--panel-2); padding: 1px 4px; border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; margin: 8px 0; }
th, td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; }
th { background: var(--panel-2); }
blockquote { margin: 8px 0; padding: 2px 12px; border-left: 3px solid var(--border); color: var(--muted); }
.math {
  margin: 8px 0; white-space: pre-wrap; word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
a { color: var(--user); }
.call { margin: 8px 0; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); }
.call > summary { cursor: pointer; padding: 6px 10px; font-size: 12.5px; color: var(--tool); }
.call .args, .call .result {
  margin: 0; padding: 8px 10px; border-top: 1px solid var(--border);
  white-space: pre-wrap; word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
}
.call .result { color: var(--muted); }
.call .result.is-error { color: var(--error); }
.collapsed { position: relative; max-height: 12em; overflow: hidden; }
.collapsed::after {
  content: ""; position: absolute; inset: auto 0 0 0; height: 3em;
  background: linear-gradient(transparent, var(--panel));
}
.expand {
  display: block; width: 100%; text-align: center; font-size: 11px; cursor: pointer;
  background: var(--panel-2); border: 0; border-top: 1px solid var(--border);
  color: var(--muted); padding: 3px; font: inherit;
}
.empty { color: var(--muted); font-style: italic; }
`;

/**
 * The client.
 *
 * Plain functions over flat display edges, normalized by the session reader.
 */
export const PAGE_SCRIPT = String.raw`
(function () {
  'use strict';

  var raw = document.getElementById('DATA');
  if (!raw) return;
  var bytes = Uint8Array.from(atob(raw.textContent || ''), function (c) { return c.charCodeAt(0); });
  var data = JSON.parse(new TextDecoder('utf-8').decode(bytes));

  var byId = new Map();
  (data.entries || []).forEach(function (e) { byId.set(e.id, e); });

  // Flat rows in display order, each carrying its depth, so the sidebar is a
  // list rather than a nested DOM that has to be walked to filter.
  var flat = (data.tree || []).map(function (node) { return { node: node, depth: node.depth || 0 }; });
  var nodesById = new Map();
  flat.forEach(function (row) { nodesById.set(row.node.id, row.node); });

  var selected = data.leafId || (flat.length ? flat[flat.length - 1].node.id : null);
  var query = '';
  var usersOnly = false;
  var outputChecks = new WeakMap();
  var outputResize = typeof ResizeObserver === 'function' ? new ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      var check = outputChecks.get(entry.target);
      if (check) check();
    });
  }) : null;

  function matches(row) {
    if (usersOnly && row.node.role !== 'user') return false;
    if (query === '') return true;
    var hay = (row.node.preview || '') + ' ' + (row.node.role || '');
    return hay.toLowerCase().indexOf(query) !== -1;
  }

  function renderSidebar() {
    var list = document.getElementById('tree');
    list.textContent = '';
    var shown = flat.filter(matches);
    if (shown.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Nothing matches.';
      list.appendChild(empty);
      return;
    }
    shown.forEach(function (row) {
      var li = document.createElement('li');
      var button = document.createElement('button');
      button.className = 'tree-row';
      button.type = 'button';
      button.style.paddingLeft = (6 + Math.min(row.depth, 24) * 12) + 'px';
      if (row.node.id === selected) button.setAttribute('aria-current', 'true');
      var role = document.createElement('span');
      role.className = 'role ' + (row.node.role || '');
      role.textContent = row.node.role || row.node.kind;
      var preview = document.createElement('span');
      preview.className = 'preview';
      preview.textContent = row.node.preview || '';
      button.appendChild(role);
      button.appendChild(preview);
      button.addEventListener('click', function () { select(row.node.id); });
      li.appendChild(button);
      list.appendChild(li);
    });
  }

  // The conversation for a node is its ancestor chain, oldest first: the sidebar
  // shows the whole session, and selecting a row shows the branch that leads to
  // it rather than only that one message.
  function pathTo(id) {
    var chain = [];
    var current = nodesById.get(id);
    var seen = new Set();
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.push(current);
      current = current.parentId ? nodesById.get(current.parentId) : undefined;
    }
    var result = [];
    var reportsBySource = new Map();
    (data.entries || []).forEach(function (entry) {
      if (entry.sourceEntryId === undefined) return;
      var reports = reportsBySource.get(entry.sourceEntryId) || [];
      reports.push(entry); reportsBySource.set(entry.sourceEntryId, reports);
    });
    chain.reverse().forEach(function (node) {
      if (node.kind === 'command-output') {
        if (!seen.has(node.parentId) && byId.has(node.id)) result.push(byId.get(node.id));
        return;
      }
      var message = byId.get(node.id);
      if (message) result.push(message);
      else if (node.kind === 'turn-message') result.push(null);
      (reportsBySource.get(node.id) || []).forEach(function (report) { result.push(report); });
    });
    return result;
  }

  function resultsOnPath(chain) {
    var pending = new Map();
    var results = new Map();
    chain.forEach(function (entry) {
      if (!entry) { pending.clear(); return; }
      if (entry.role === 'command') return;
      if (entry.role !== 'tool') pending.clear();
      (entry.toolCalls || []).forEach(function (call) {
        pending.set(call.id, pending.has(call.id) ? null : call);
      });
      if (entry.role === 'tool' && pending.has(entry.toolCallId)) {
        var call = pending.get(entry.toolCallId);
        if (call) results.set(call, entry.content);
        pending.delete(entry.toolCallId);
      }
    });
    return results;
  }

  function collapse(container, label) {
    container.classList.add('collapsed');
    if (container.scrollHeight <= container.clientHeight + 4) {
      container.classList.remove('collapsed');
      return false;
    }
    var button = document.createElement('button');
    button.className = 'expand';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', function () {
      var collapsed = container.classList.toggle('collapsed');
      button.textContent = collapsed ? label : 'Show less';
    });
    container.parentNode.insertBefore(button, container.nextSibling);
    return true;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderTurn(entry, results) {
    var turn = el('div', 'turn ' + (entry.role || ''));
    turn.id = 'entry-' + entry.id;
    turn.appendChild(el('div', 'who', entry.role + (entry.timestamp ? ' · ' + entry.timestamp : '')));
    var body = el('div', 'body');
    body.innerHTML = entry.html || '';
    turn.appendChild(body);
    (entry.toolCalls || []).forEach(function (call) {
      var details = el('details', 'call');
      var summary = el('summary', null, 'called ' + call.name);
      details.appendChild(summary);
      details.appendChild(el('div', 'args', call.arguments));
      var result = results.get(call);
      if (result !== undefined) {
        var output = el('div', 'result', result);
        details.appendChild(output);
        var measured = false;
        var checkOutput = function () {
          // Layout is available only after this card is mounted and opened.
          if (!details.isConnected || !details.open || measured) return;
          measured = collapse(output, 'Show more');
        };
        details.addEventListener('toggle', checkOutput);
        outputChecks.set(output, checkOutput);
        if (outputResize) outputResize.observe(output);
      }
      turn.appendChild(details);
    });
    return turn;
  }

  function renderConversation() {
    if (outputResize) outputResize.disconnect();
    outputChecks = new WeakMap();
    var pane = document.getElementById('conversation');
    pane.textContent = '';
    var chain = pathTo(selected);
    var messages = chain.filter(Boolean);
    if (messages.length === 0) {
      pane.appendChild(el('p', 'empty', 'This entry has no messages.'));
      return;
    }
    // A degraded source may hide the call that owns a reused ID. Results remain
    // visible as recorded tool messages; no inline ownership is inferred.
    var results = (data.warnings || []).length ? new Map() : resultsOnPath(chain);
    messages.forEach(function (entry) { pane.appendChild(renderTurn(entry, results)); });
    var target = document.getElementById('entry-' + selected);
    if (target) {
      target.scrollIntoView({ block: 'start' });
      target.classList.add('highlight');
      setTimeout(function () { target.classList.remove('highlight'); }, 1200);
    }
  }

  function select(id) {
    selected = id;
    // Kept in the URL so a specific entry can be linked to. Read back on load,
    // which is what makes the address bar useful for pointing someone at a spot.
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
    renderSidebar();
    renderConversation();
  }

  document.getElementById('filter').addEventListener('input', function (event) {
    query = (event.target.value || '').trim().toLowerCase();
    renderSidebar();
  });
  document.getElementById('users-only').addEventListener('change', function (event) {
    usersOnly = !!event.target.checked;
    renderSidebar();
  });
  document.getElementById('toggle-sidebar').addEventListener('click', function () {
    document.body.classList.toggle('no-sidebar');
  });

  var fromHash = (location.hash || '').replace(/^#/, '');
  if (fromHash && nodesById.has(fromHash)) selected = fromHash;
  renderSidebar();
  renderConversation();
})();
`;

/** The document, with the payload filled in and the script wired to it. */
export function renderPage(input: {
  readonly title: string;
  readonly subtitle: string;
  readonly payloadBase64: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeForTitle(input.title)}</title>
<style>${PAGE_STYLES}</style>
</head>
<body>
<header>
  <h1>${escapeForTitle(input.title)}</h1>
  <span class="meta">${escapeForTitle(input.subtitle)}</span>
  <span class="spacer"></span>
  <button id="toggle-sidebar" type="button">Sidebar</button>
</header>
<aside id="sidebar">
  <input id="filter" class="filter" type="search" placeholder="Filter entries" aria-label="Filter entries">
  <label class="meta"><input id="users-only" type="checkbox"> Only my messages</label>
  <ul id="tree"></ul>
</aside>
<main id="conversation"><noscript>This page needs JavaScript to show the conversation.</noscript></main>
<script id="${DATA_ELEMENT_ID}" type="text/plain">${input.payloadBase64}</script>
<script>${PAGE_SCRIPT.replace("document.getElementById('DATA')", `document.getElementById('${DATA_ELEMENT_ID}')`)}</script>
</body>
</html>
`;
}

/** Text placed in the document title, escaped for the same reason as the body. */
function escapeForTitle(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}
