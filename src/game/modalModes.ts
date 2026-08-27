import {createEffect, type Accessor} from "solid-js";

export type ModalModeScope = {
  /** Stable diagnostic identifier; also the default pop key. */
  id: string;
  /**
   * Handles a global Escape press. Returns true when the press was consumed
   * (for example by closing this scope); false lets lower scopes try.
   */
  onEscape?: () => boolean;
};

/**
 * Priority stack for global modal modes (pause menu, dialogs, editors,
 * arcade sessions). The most recently pushed scope handles an Escape press
 * first; presses it does not consume fall through to lower scopes and
 * finally to the application fallback. This replaces ad-hoc chains of
 * signal checks that fought over listener ordering.
 */
class ModalModeStack {
  readonly #scopes: ModalModeScope[] = [];

  push(scope: ModalModeScope) {
    const existingIndex = this.#scopes.findIndex((entry) => entry.id === scope.id);
    // Re-pushing an id moves the scope to the top instead of stacking
    // duplicates, so pop(id) always pairs with one push.
    if (existingIndex >= 0) this.#scopes.splice(existingIndex, 1);
    this.#scopes.push(scope);
  }

  pop(scopeOrId: ModalModeScope | string) {
    const id = typeof scopeOrId === "string" ? scopeOrId : scopeOrId.id;
    for (let index = this.#scopes.length - 1; index >= 0; index--) {
      if (this.#scopes[index]?.id !== id) continue;
      this.#scopes.splice(index, 1);
      return true;
    }
    return false;
  }

  has(id: string) {
    return this.#scopes.some((scope) => scope.id === id);
  }

  get depth() {
    return this.#scopes.length;
  }

  top() {
    return this.#scopes.at(-1);
  }

  /** Offers Escape to scopes from top to bottom; true when consumed. */
  consumeEscape() {
    for (let index = this.#scopes.length - 1; index >= 0; index--) {
      const scope = this.#scopes[index];
      if (!scope) continue;
      if (scope.onEscape?.()) return true;
    }
    return false;
  }
}

/** Application-wide modal mode registry. */
export const modalModes = new ModalModeStack();

/**
 * Keeps a scope pushed onto the shared stack while `active()` is truthy.
 * The scope pops automatically when it deactivates or its owner disposes,
 * so listener registration order never decides Escape priority again.
 */
export const createEscapeScope = (id: string, active: Accessor<unknown>, onEscape: () => boolean) => {
  createEffect(
    () => Boolean(active()),
    (isActive) => {
      // The initial false run no-ops, so an explicit defer is unnecessary.
      if (!isActive) return;
      modalModes.push({id, onEscape});
      return () => void modalModes.pop(id);
    },
  );
};
