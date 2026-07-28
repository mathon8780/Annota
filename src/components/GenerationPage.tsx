import { Info, WandSparkles } from "lucide-react";

export function GenerationPage() {
  return (
    <section
      className="home-main settings-home-main generation-home-main"
      aria-label="生成与提示词内容"
    >
      <section
        className="settings-workspace"
        aria-labelledby="generation-page-title"
      >
        <div className="settings-workspace-inner">
          <header className="settings-section-hero">
            <div className="settings-section-icon">
              <WandSparkles aria-hidden="true" size={21} />
            </div>
            <div>
              <span>生成动作</span>
              <h2 id="generation-page-title">生成与提示词</h2>
              <p>组织解释、翻译与自定义动作的外观、语义和提示词。</p>
            </div>
            <div className="settings-display-badge">
              <Info aria-hidden="true" size={14} />
              页面展示
            </div>
          </header>
        </div>
      </section>
    </section>
  );
}
