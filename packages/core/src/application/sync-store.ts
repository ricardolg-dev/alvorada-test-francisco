import type { Note, Receipt } from '../domain/types.js';

/**
 * Output port for persistence (ADR 0002). Shaped around the unit of work,
 * because the guarantee that matters is "note change + receipt" committing together.
 */
export interface SyncStore {
  /**
   * Runs `work` atomically: commits if it resolves, rolls back every write
   * if it throws, and rethrows the error.
   */
  transaction<T>(work: (tx: SyncTransaction) => Promise<T>, noteId?: string): Promise<T>;

  /** Current committed state of a note (R10). */
  getNote(noteId: string): Promise<Note | null>;

  /** Stored receipt of an operation, exactly as recorded. */
  getReceipt(opId: string): Promise<Receipt | null>;
}

/**
 * Conditional writes return `false` instead of throwing when another transaction
 * won the race, so the retry stays explicit in the application (ADR 0006).
 */
export interface SyncTransaction {
  findReceipt(opId: string): Promise<Receipt | null>;
  findNote(noteId: string): Promise<Note | null>;

  /** `false` when the note already exists. */
  insertNote(note: Note): Promise<boolean>;

  /** Compare-and-set: `false` when the stored revision is not `expectedRevision`. */
  updateNote(note: Note, expectedRevision: number): Promise<boolean>;

  /** `false` when the opId is already taken (ADR 0007). */
  insertReceipt(receipt: Receipt): Promise<boolean>;
}
