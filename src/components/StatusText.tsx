import "./StatusText.css";

/** Visible status line. Not a live region: announcements go through the Announcer. */
export function StatusText({ text }: { text: string }) {
  return (
    <p className="status-text">
      <span className="visually-hidden">Status: </span>
      {text}
    </p>
  );
}
