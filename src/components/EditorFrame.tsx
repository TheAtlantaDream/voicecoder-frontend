import { useEffect, useState } from "react";
import { EDITOR_LOAD_TIMEOUT_MS } from "../domain/config";
import "./EditorFrame.css";

export const EDITOR_SRC = "/editor/?folder=/home/coder/project";

interface Props {
  /** Fake mode: no bridge, so render a placeholder instead of the iframe. */
  fake: boolean;
  onFocusPanel: () => void;
  src?: string;
  timeoutMs?: number;
}

type LoadState = "loading" | "loaded" | "slow";

export function EditorFrame({ fake, onFocusPanel, src = EDITOR_SRC, timeoutMs = EDITOR_LOAD_TIMEOUT_MS }: Props) {
  const [load, setLoad] = useState<LoadState>("loading");

  useEffect(() => {
    if (fake) return;
    const timer = setTimeout(() => setLoad((s) => (s === "loading" ? "slow" : s)), timeoutMs);
    return () => clearTimeout(timer);
  }, [fake, timeoutMs]);

  return (
    <section className="editor" aria-labelledby="editor-heading">
      <div className="editor__bar">
        <h2 id="editor-heading" className="editor__heading">
          Code editor
        </h2>
        <button type="button" className="button" onClick={onFocusPanel}>
          Focus voice panel
        </button>
      </div>
      {fake ? (
        <div className="editor__placeholder">
          <p>VS Code Web</p>
        </div>
      ) : (
        <div className="editor__body">
          {load === "loading" && <p className="editor__notice">Loading editor…</p>}
          {load === "slow" && (
            <p className="editor__notice">
              The editor is taking a while to load.{" "}
              <a href={src} target="_blank" rel="noopener noreferrer">
                Open the editor in a new tab
              </a>
            </p>
          )}
          <iframe className="editor__frame" src={src} title="Code editor" onLoad={() => setLoad("loaded")} />
        </div>
      )}
    </section>
  );
}
