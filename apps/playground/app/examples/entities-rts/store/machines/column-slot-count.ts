// Read-view columns hide capacity; the backing TypedArray length is the slot count.
export const slotCount = (column: { readonly length?: number }) => column.length ?? 0;
