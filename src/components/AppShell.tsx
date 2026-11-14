import type { ReactNode } from "react";
import "./AppShell.css";

interface Props {
  header: ReactNode;
  panel: ReactNode;
  editor: ReactNode;
  /** Latest announcement; the key changes per announcement so repeats are read again. */
  announcement: { id: number; text: string } | null;
}

/** Page layout. Also owns the single role="status" announcer, mounted once and never conditionally. */
export function AppShell({ header, panel, editor, announcement }: Props) {
  return (
    <div className="app-shell">
      {header}
      <main className="app-shell__main">
        {panel}
        {editor}
      </main>
      <div role="status" className="visually-hidden">
        {announcement && <span key={announcement.id}>{announcement.text}</span>}
      </div>
    </div>
  );
}
