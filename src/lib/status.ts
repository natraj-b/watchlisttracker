// Tiny global data-health signal so the UI can show a banner instead of a
// blank screen when the price API is failing.

type Listener = (msg: string | null) => void;
const listeners = new Set<Listener>();
let current: string | null = null;

export function setDataError(msg: string | null) {
  current = msg;
  listeners.forEach((l) => l(current));
}

export function getDataError() {
  return current;
}

export function onDataError(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
