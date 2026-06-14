// One virtual gimbal box with a dot at the current stick position. Essential
// feedback on keyboard, since there are no physical sticks to look at.
// nx / ny are normalized 0..1 (0,0 = bottom-left, 1,1 = top-right).
export function StickIndicator({
  side,
  label,
  nx,
  ny,
}: {
  side: "left" | "right";
  label: string;
  nx: number;
  ny: number;
}) {
  return (
    <div className={`stick ${side}`}>
      <div className="stick-box">
        <div className="stick-cross-h" />
        <div className="stick-cross-v" />
        <div
          className="stick-dot"
          style={{ left: `${nx * 100}%`, top: `${(1 - ny) * 100}%` }}
        />
      </div>
      <div className="stick-label">{label}</div>
    </div>
  );
}
