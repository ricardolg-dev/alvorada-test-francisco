import type {
  SyncStore,
  SyncTransaction,
} from "../../application/sync-store.js";
import type { Note, Receipt } from "../../domain/types.js";

/**
 * Reference adapter with no dependencies (ADR 0002, 0009).
 *
 * - Transactions for the same note are serialized by a promise-chain mutex.
 *   Transactions for different notes can progress independently.
 * - Writes are staged and only copied to the committed maps if the work resolves,
 *   so a thrown error rolls everything back.
 * - Every value crossing the boundary is cloned, so callers can't mutate stored state.
 */
export class InMemorySyncStore implements SyncStore {
  readonly #notes = new Map<string, Note>();
  readonly #receipts = new Map<string, Receipt>();
  readonly #tails = new Map<string | undefined, Promise<unknown>>();

  transaction<T>(work: (tx: SyncTransaction) => Promise<T>, noteId?: string): Promise<T> {
    const previous = this.#tails.get(noteId) ?? Promise.resolve();
    const run = previous.then(() => this.#runIsolated(work));
    const settled = run.catch(() => undefined);
    this.#tails.set(noteId, settled);
    void settled.then(() => {
      if (this.#tails.get(noteId) === settled) this.#tails.delete(noteId);
    });
    return run;
  }

  async getNote(noteId: string): Promise<Note | null> {
    return clone(this.#notes.get(noteId) ?? null);
  }

  async getReceipt(opId: string): Promise<Receipt | null> {
    return clone(this.#receipts.get(opId) ?? null);
  }

  async #runIsolated<T>(work: (tx: SyncTransaction) => Promise<T>): Promise<T> {
    const stagedNotes = new Map<string, Note>();
    const stagedReceipts = new Map<string, Receipt>();
    let open = true;

    const ensureOpen = (): void => {
      if (!open) throw new Error("Transaction already finished");
    };
    const currentNote = (id: string): Note | undefined =>
      stagedNotes.get(id) ?? this.#notes.get(id);
    const currentReceipt = (opId: string): Receipt | undefined =>
      stagedReceipts.get(opId) ?? this.#receipts.get(opId);

    const tx: SyncTransaction = {
      findReceipt: async (opId) => {
        ensureOpen();
        return clone(currentReceipt(opId) ?? null);
      },
      findNote: async (noteId) => {
        ensureOpen();
        return clone(currentNote(noteId) ?? null);
      },
      insertNote: async (note) => {
        ensureOpen();
        if (currentNote(note.id) !== undefined) return false;
        stagedNotes.set(note.id, clone(note));
        return true;
      },
      updateNote: async (note, expectedRevision) => {
        ensureOpen();
        if (currentNote(note.id)?.revision !== expectedRevision) return false;
        stagedNotes.set(note.id, clone(note));
        return true;
      },
      insertReceipt: async (receipt) => {
        ensureOpen();
        if (currentReceipt(receipt.operation.opId) !== undefined) return false;
        stagedReceipts.set(receipt.operation.opId, clone(receipt));
        return true;
      },
    };

    try {
      const result = await work(tx);
      // Commit: synchronous, so no reader can observe a half-applied transaction.
      for (const [id, note] of stagedNotes) this.#notes.set(id, note);
      for (const [opId, receipt] of stagedReceipts)
        this.#receipts.set(opId, receipt);
      return result;
    } finally {
      open = false;
    }
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
