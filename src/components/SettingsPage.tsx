import { ArrowLeft, Settings2 } from "lucide-react";

interface SettingsPageProps {
  onBack: () => void;
}

export function SettingsPage({ onBack }: SettingsPageProps) {
  return (
    <div className="settings-app">
      <header className="settings-topbar">
        <button className="settings-back-button" type="button" onClick={onBack}>
          <ArrowLeft aria-hidden="true" size={16} />
          返回主页
        </button>
        <div className="settings-heading">
          <Settings2 aria-hidden="true" size={17} />
          <h1>设置</h1>
        </div>
      </header>
      <main className="settings-canvas" aria-label="设置内容" />
    </div>
  );
}
