// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

const LIMIT = 50;

export class EditorHistory<T> {
  private past: T[] = [];
  private future: T[] = [];
  private last: T | null = null;

  reset(state: T): void {
    this.past = [];
    this.future = [];
    this.last = clone(state);
  }

  record(state: T): void {
    if (this.last === null) {
      this.last = clone(state);
      return;
    }
    if (same(this.last, state)) return;
    this.past.push(this.last);
    if (this.past.length > LIMIT) this.past.shift();
    this.last = clone(state);
    this.future = [];
  }

  undo(): T | null {
    if (!this.past.length || this.last === null) return null;
    this.future.push(this.last);
    this.last = this.past.pop()!;
    return clone(this.last);
  }

  redo(): T | null {
    if (!this.future.length || this.last === null) return null;
    this.past.push(this.last);
    this.last = this.future.pop()!;
    return clone(this.last);
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }
}

function clone<T>(state: T): T {
  return structuredClone(state);
}

function same<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
