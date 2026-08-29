export function SummaryCard(props: {
  label: string;
  value: string;
  note?: string;
  title?: string;
  accent?: boolean;
  active?: boolean;
  onClick?: () => void;
}): JSX.Element {
  const className = [
    "summary-card",
    props.accent ? "accent" : "",
    props.onClick ? "summary-card-clickable" : "",
    props.active ? "summary-card-active" : "",
  ].filter(Boolean).join(" ");
  const content = (
    <>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.note ? <small>{props.note}</small> : null}
    </>
  );

  if (props.onClick) {
    return (
      <button
        type="button"
        className={className}
        title={props.title}
        aria-label={`${props.label} ${props.value}`}
        aria-pressed={props.active}
        onClick={props.onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={className} title={props.title}>
      {content}
    </div>
  );
}
