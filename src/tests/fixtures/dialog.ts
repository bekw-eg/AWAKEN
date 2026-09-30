// jsdom does not implement the native dialog top layer. Model its visibility
// lifecycle so the existing battle tests exercise the real modal effects.
export function mockDialogs() {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.open = false; } },
  });
}
