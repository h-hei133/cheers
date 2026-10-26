import { PICKER_OWNER, type Picker } from '../overlay.js';

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
    let returning = false;
    const tracked = Object.create(Object.getPrototypeOf(picker), {
      ...Object.getOwnPropertyDescriptors(picker),
      [PICKER_OWNER]: { configurable: true, enumerable: true, get: () => tracked },
      previewEnd: {
        configurable: true,
        enumerable: true,
        value: () => {
          if (!returning) this.abort(controller);
          this.byPicker.delete(tracked);
          previewEnd?.call(picker);
        },
      },
      ...(picker.back ? {
        previewBack: { configurable: true, enumerable: true, value: () => {
          returning = true;
          picker.previewBack?.();
        } },
        back: { configurable: true, enumerable: true, value: () => {
          try { return this.track(picker.back!(), controller, false); }
          catch (error) { this.abort(controller); throw error; }
        } },
      } : {}),
      ...(exclusive ? { exclusive: { configurable: true, enumerable: true, value: true } } : {}),
    }) as Picker;
    this.byPicker.set(tracked, controller);
    return tracked;
  }

  controllerFor(picker: Picker): AbortController | undefined {
    return this.byPicker.get(picker[PICKER_OWNER] ?? picker);
  }

  finish(picker: Picker, continuation?: AbortController): void {
    const owner = picker[PICKER_OWNER] ?? picker;
    const controller = this.byPicker.get(owner);
    this.byPicker.delete(owner);
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
