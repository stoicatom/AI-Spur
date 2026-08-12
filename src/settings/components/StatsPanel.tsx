import type { PanelProps } from './panel-props';

export function StatsPanel({ config }: PanelProps) {
  return (
    <div className="field-stack">
      <section className="field">
        <h2 className="field__label">使用统计</h2>
        <p className="field__desc">统计数据由主进程维护，此处只读。</p>

        <dl className="stat-grid">
          <div className="stat-card">
            <dt className="stat-card__label">累计催促</dt>
            <dd className="stat-card__value font-display">{config.usageCount}</dd>
          </div>
          <div className="stat-card">
            <dt className="stat-card__label">今日催促</dt>
            <dd className="stat-card__value font-display">{config.todayUsageCount}</dd>
          </div>
        </dl>

        {config.lastUsageDate && (
          <p className="field-hint font-mono">最近一次：{config.lastUsageDate}</p>
        )}
      </section>
    </div>
  );
}
