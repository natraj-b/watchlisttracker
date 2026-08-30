interface Item {
  label: string;
  value: string;
  hint?: string;
}

export function MetricGrid({ items }: { items: Item[] }) {
  return (
    <div className="mgrid">
      {items.map((it) => (
        <div className="mgrid-cell" key={it.label} title={it.hint}>
          <span className="mgrid-l">{it.label}</span>
          <span className="mgrid-v">{it.value}</span>
        </div>
      ))}
    </div>
  );
}
