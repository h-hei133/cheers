import type { Picker } from '../overlay.js';

/** Owns cancellation for picker loads and staged continuations. */
export class PickerLifecycles {
  private readonly controllers = new Set<AbortController>();
  private readonly byPicker = new WeakMap<Picker, AbortController>();

  begin(): AbortController {
    const controller = new AbortController();
    this.controllers.add(controller);
    return controller;
  }

  track(picker: Picker, controller: AbortController, exclusive: boolean): Picker {
    const previewEnd = picker.previewEnd;
    const tracked = Object.create(Object.getPrototypeOf(picker), {
      ...Object.getOwnPropertyDescriptors(picker),
      previewEnd: {
        configurable: true,
        enumerable: true,
        value: () => {
          this.abort(controller);
          previewEnd?.call(picker);
        },
      },
      ...(exclusive ? { exclusive: { configurable: true, enumerable: true, value: true } } : {}),
    }) as Picker;
    this.byPicker.set(tracked, controller);
    return tracked;
  }

  controllerFor(picker: Picker): AbortController | undefined {
    return this.byPicker.get(picker);
  }

  finish(picker: Picker, continuation?: AbortController): void {
    const controller = this.byPicker.get(picker);
    this.byPicker.delete(picker);
    if (controller && controller !== continuation) this.abort(controller);
  }

  abort(controller: AbortController): void {
    this.controllers.delete(controller);
    if (!controller.signal.aborted) controller.abort();
  }

  abortAll(): void {
    for (const controller of this.controllers) this.abort(controller);
  }
}
