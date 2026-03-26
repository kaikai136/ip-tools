import { AppConfig, ScanMode } from '../types';

interface NetworkSegmentInputProps {
  config: AppConfig;
  scanMode: ScanMode;
  disabled: boolean;
  errors: {
    networkSegment?: string;
    hostRange?: string;
    portsInput?: string;
  };
  onChange: (field: keyof AppConfig, value: string) => void;
}

export function NetworkSegmentInput({
  config,
  scanMode,
  disabled,
  errors,
  onChange,
}: NetworkSegmentInputProps) {
  return (
    <section className="panel config-panel">
      <div className="section-head">
        <div>
          <p className="section-kicker">Scanner Setup</p>
          <h2>扫描参数</h2>
        </div>
        <p className="section-copy">
          网段已移动到右侧主机分布上方，这里只保留主机范围和端口列表设置。
        </p>
      </div>

      <div className="settings-grid">
        <div className="field field-wide">
          <label htmlFor="host-start">主机范围</label>
          <div className="host-range">
            <input
              id="host-start"
              type="number"
              min={1}
              max={254}
              value={config.hostStart}
              onChange={(event) => onChange('hostStart', event.target.value)}
              disabled={disabled}
              className={errors.hostRange ? 'error' : ''}
            />
            <span>到</span>
            <input
              type="number"
              min={1}
              max={254}
              value={config.hostEnd}
              onChange={(event) => onChange('hostEnd', event.target.value)}
              disabled={disabled}
              className={errors.hostRange ? 'error' : ''}
            />
          </div>
          <p className={`field-note ${errors.hostRange ? 'is-error' : ''}`}>
            {errors.hostRange ?? '建议先从较小范围开始，例如 1 到 64。'}
          </p>
        </div>

        <div className="field field-wide">
          <label htmlFor="ports-input">端口列表</label>
          <textarea
            id="ports-input"
            value={config.portsInput}
            onChange={(event) => onChange('portsInput', event.target.value)}
            disabled={disabled}
            placeholder="例如 22,80,443,445,3389,8000-8080"
            className={errors.portsInput ? 'error' : ''}
            rows={3}
          />
          <p className={`field-note ${errors.portsInput ? 'is-error' : ''}`}>
            {errors.portsInput ??
              (scanMode === 'port'
                ? '支持单个端口和区间写法，例如 80,443,3389、8000-8080 或 1-65535。'
                : '当前是 IP 探活模式，端口列表会在执行 IP 扫描时被忽略。')}
          </p>
        </div>
      </div>
    </section>
  );
}
