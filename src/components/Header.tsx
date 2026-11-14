import { MicButton } from "./MicButton";
import { StatusText } from "./StatusText";
import "./Header.css";

interface Props {
  micOn: boolean;
  onToggleMic: () => void;
  status: string;
  workspace: string;
}

export function Header({ micOn, onToggleMic, status, workspace }: Props) {
  return (
    <header className="header">
      <h1 className="header__brand">VoiceCoder</h1>
      <MicButton on={micOn} onToggle={onToggleMic} />
      <StatusText text={status} />
      <p className="header__workspace">
        <span className="visually-hidden">Workspace: </span>
        {workspace}
      </p>
    </header>
  );
}
