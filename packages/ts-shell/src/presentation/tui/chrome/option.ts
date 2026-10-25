/** Activation and browsing eligibility are independent for unavailable models. */
export function isFocusable(option: { readonly disabled?: boolean; readonly focusable?: boolean } | undefined): boolean {
  return Boolean(option && (!option.disabled || option.focusable));
}
