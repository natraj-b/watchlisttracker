import { SyncSection } from "./SyncSection";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SyncSheet({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3>Sync across devices</h3>
        <SyncSection />
      </div>
    </div>
  );
}
