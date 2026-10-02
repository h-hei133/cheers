import { renderPage } from "./template.js";
import type { ExportPayload } from "./model.js";

/**
 * A session as one self-contained HTML file.
 *
 * Self-contained means what it says: no stylesheet to fetch, no script to
 * download, no image to resolve. A page that needs the network is a page that
 * shows nothing when someone opens it from a mail attachment on a plane, and the
 * point of exporting is to be able to hand the file to someone.
 *
 * The payload is embedded base64 rather than as JSON in a script tag. Not to
 * save space — it costs a third more — but because it removes the escaping
 * question entirely: a transcript containing `</script>` cannot end the tag it
 * sits in when it is not text in the first place.
 *
 * The conversation is rendered by the page's script and not also written into the
 * markup. Writing both would put every message in the file twice, and the static
 * copy is invisible to anyone with scripting on — which is everyone who opens an
 * exported page in a browser. One copy, one place it can be wrong.
 */

export function renderExportHtml(payload: ExportPayload): string {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return renderPage({
    title: `Session ${payload.header.sessionId}`,
    subtitle: [
      `${payload.entries.length} messages`,
      payload.header.workspace,
      payload.header.exportedAt,
      ...payload.warnings,
    ].join(" · "),
    payloadBase64,
  });
}
