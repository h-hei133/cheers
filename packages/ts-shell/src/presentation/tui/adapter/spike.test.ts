import { describe, expect, it } from "vitest";
import { RecordingTerminal } from "../../../test-utils/terminalDouble.js";
import { Transcript } from "../transcript/container.js";
import { Editor } from "../editor.js";
import { Container } from "./contract.js";
import { Surface } from "./surface.js";
import { ScrollView } from "./scroll.js";
import { Message } from "./messages.js";
import { ToolCard } from "./card.js";
import { StatusBar, Composer } from "./chrome.js";
import { PromptEditor } from "./editor.js";
import { PermissionDialog } from "./dialog.js";
import { Loader } from "./loader.js";
import type { ViewComponent } from "./contract.js";

class TranscriptView implements ViewComponent {
  constructor(private readonly transcript: Transcript) {}
  invalidate(): void {}
  render(width: number): string[] {
    return [...this.transcript.render(Math.max(1, width)).rows];
  }
}

function sessionFacts() {
  return {
    facts: { model: "spike-model", provider: "spike-provider" },
    items: ["model"] as const,
    activity: undefined,
    busy: false,
  };
}

describe("phase 3 adapter spike", () => {
  it("composes transcript, composer, and status bar into one frame", () => {
    const terminal = new RecordingTerminal();
    const surface = new Surface({ terminal });
    const transcript = new Transcript();
    transcript.append({ kind: "user", text: "what is the plan?", finalized: true });
    transcript.append({ kind: "assistant", text: "# Plan\n\nShip it.", finalized: true });
    const editor = new Editor();
    editor.insert("follow-up");
    const root = new Container();
    const scroll = new ScrollView(new TranscriptView(transcript), { follow: "end" });
    root.addChild(scroll);
    root.addChild(new StatusBar(sessionFacts()));
    root.addChild(
      new Composer(editor, {
        busy: false,
        suggesting: false,
        cancelArmed: false,
        queued: 0,
        newlineKey: "ctrl+j",
        ambient: { openTodos: 0, peerSessions: 0 },
      }),
    );
    surface.addChild(root);
    surface.setFrameProvider({ renderFrame: (dimensions) => ({ rows: root.render(dimensions.columns) }) });
    surface.start();
    surface.renderNow();
    const output = terminal.drain();
    expect(output).toContain("what is the plan?");
    expect(output).toContain("follow-up");
    expect(output).toContain("spike-model");
    surface.stop();
  });

  it("shows a permission overlay above the transcript", () => {
    const terminal = new RecordingTerminal();
    const surface = new Surface({ terminal });
    const transcript = new Transcript();
    transcript.append({ kind: "user", text: "delete the file", finalized: true });
    const root = new Container();
    root.addChild(new TranscriptView(transcript));
    surface.addChild(root);
    surface.setFrameProvider({ renderFrame: (dimensions) => ({ rows: root.render(dimensions.columns) }) });
    const answers: string[] = [];
    const dialog = new PermissionDialog({ onAnswer: (decision) => answers.push(decision) });
    dialog.open({ title: "Write file", detail: "a.ts", scope: "ask" });
    const handle = surface.showOverlay(dialog, { width: 40 });
    expect(surface.overlayCount).toBe(1);
    surface.start();
    surface.renderNow();
    expect(terminal.drain()).toContain("Write file");
    dialog.handleInput("\r");
    expect(answers).toEqual(["allow-once"]);
    handle.hide();
    expect(surface.overlayCount).toBe(0);
    surface.stop();
  });

  it("streams assistant, thinking, tool, and loader rows through product components", () => {
    const transcript = new Transcript();
    const assistant = new Message({ kind: "assistant", text: "working...", finalized: false });
    const thinking = new Message({ kind: "thinking", text: "considering", collapsed: false, finalized: false });
    const card = new ToolCard({ title: "read", detail: "a.ts", text: "partial", finalized: false });
    const loader = new Loader();
    loader.setMessage("reading");
    transcript.append({ kind: "user", text: "go", finalized: true });
    const rows = [
      ...transcript.render(60).rows,
      ...thinking.render(60),
      ...assistant.render(60),
      ...card.render(60),
      ...loader.render(60),
    ].join("\n");
    expect(rows).toContain("considering");
    expect(rows).toContain("partial");
    expect(rows).toContain("reading");
    assistant.setMessage({ kind: "assistant", text: "# Done\n\nShipped.", finalized: false });
    const rerendered = [...transcript.render(60).rows, ...assistant.render(60)].join("\n");
    expect(rerendered).toContain("Done");
  });

  it("edits through the prompt editor component", () => {
    const editor = new PromptEditor(new Editor());
    editor.insert("hello");
    expect(editor.render(20).join("\n")).toContain("hello");
    let submitted = "";
    const submitting = new PromptEditor(new Editor(), { onSubmit: (text) => (submitted = text) });
    submitting.insert("ship it");
    submitting.handleInput("\r");
    expect(submitted).toBe("ship it");
  });

  it("restores the terminal on stop", () => {
    const terminal = new RecordingTerminal();
    const surface = new Surface({ terminal });
    surface.start();
    surface.stop();
    expect(terminal.stopped).toBe(true);
  });
});
