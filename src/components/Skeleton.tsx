/** Shimmering placeholders shown while first data loads, so the screen has
 *  shape instead of popping in from blank. */

export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="row skeleton-row" key={i}>
          <div className="sk sk-id" />
          <div className="sk sk-num" />
          <div className="sk sk-num" />
        </div>
      ))}
    </div>
  );
}

export function PageFallback() {
  return (
    <div className="page">
      <div className="sk sk-bar" aria-hidden="true" />
      <SkeletonRows count={5} />
    </div>
  );
}
