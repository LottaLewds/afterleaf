export type KeyboardLayout = ReadonlyMap<string, string>;

type KeyboardLayoutApi = {
  getLayoutMap?: () => Promise<KeyboardLayout>;
};

/** Reads the browser's keyboard layout when the experimental API is available. */
export const readKeyboardLayout = async (): Promise<KeyboardLayout | undefined> => {
  if (typeof navigator === "undefined") return;
  const keyboard = (navigator as Navigator & {keyboard?: KeyboardLayoutApi}).keyboard;
  if (!keyboard?.getLayoutMap) return;
  try {
    return await keyboard.getLayoutMap();
  } catch {
    return;
  }
};

/** Gets a layout entry from a key event, for browsers without getLayoutMap(). */
export const keyboardLayoutEntry = (
  event: Pick<KeyboardEvent, "code" | "key">,
): readonly [string, string] | undefined => {
  if (!/^Key[A-Z]$/.test(event.code) || event.key.length !== 1) return;
  const key = event.key.toLowerCase();
  if (key === key.toUpperCase()) return;
  return [event.code, key];
};

const INTERACTION_KEY_TOKEN = /\b([A-Z])\b/g;

/** Replaces QWERTY letter labels in an interaction with the physical key's label. */
export const formatInteractionKey = (interactionKey: string, layout: KeyboardLayout) =>
  interactionKey.replace(INTERACTION_KEY_TOKEN, (match, letter: string) => {
    const label = layout.get(`Key${letter}`);
    return label ? label.toUpperCase() : match;
  });
