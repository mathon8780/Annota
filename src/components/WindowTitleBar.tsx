import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";

interface WindowTitleBarProps {
  pageTitle?: string;
}

export function WindowTitleBar({ pageTitle }: WindowTitleBarProps) {
  const [maximized, setMaximized] = useState(false);
  const desktop = isTauri();

  useEffect(() => {
    if (!desktop) return;

    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const syncMaximized = async () => {
      const next = await appWindow.isMaximized();
      if (!disposed) setMaximized(next);
    };

    void syncMaximized();
    void appWindow.onResized(() => void syncMaximized()).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  const run = (action: "minimize" | "maximize" | "close") => {
    if (!desktop) return;
    const appWindow = getCurrentWindow();
    if (action === "minimize") void appWindow.minimize();
    if (action === "maximize") void appWindow.toggleMaximize();
    if (action === "close") void appWindow.close();
  };

  const toggleFromTitleBar = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    run("maximize");
  };

  return (
    <div
      className="window-titlebar"
      data-tauri-drag-region
      onDoubleClick={toggleFromTitleBar}
      role="banner"
      aria-label="Annota 窗口标题栏"
    >
      <div className="window-title" data-tauri-drag-region>
        <span className="window-title-mark" aria-hidden="true">
          A
        </span>
        <strong data-tauri-drag-region>Annota</strong>
        {pageTitle && (
          <>
            <span className="window-title-divider" aria-hidden="true">
              /
            </span>
            <span className="window-page-title" data-tauri-drag-region>
              {pageTitle}
            </span>
          </>
        )}
      </div>

      <div className="window-controls" aria-label="窗口控制">
        <button
          type="button"
          onClick={() => run("minimize")}
          aria-label="最小化窗口"
          title={desktop ? "最小化" : "桌面应用中可用"}
        >
          <Minus aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => run("maximize")}
          aria-label={maximized ? "还原窗口" : "最大化窗口"}
          title={desktop ? (maximized ? "还原" : "最大化") : "桌面应用中可用"}
        >
          {maximized ? (
            <Copy aria-hidden="true" size={13} strokeWidth={1.35} />
          ) : (
            <Square aria-hidden="true" size={12} strokeWidth={1.35} />
          )}
        </button>
        <button
          className="window-close-button"
          type="button"
          onClick={() => run("close")}
          aria-label="关闭窗口"
          title={desktop ? "关闭" : "桌面应用中可用"}
        >
          <X aria-hidden="true" size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
