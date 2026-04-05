import { useEffect, useState } from 'react';

interface IPv4SubnettingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SplitMode = 'subnets' | 'hosts';

interface CalculationResult {
  ipValue: number;
  prefix: number;
  maskValue: number;
  networkValue: number;
  broadcastValue: number;
  firstHostValue: number;
  lastHostValue: number;
  addressCount: number;
  usableHostCount: number;
  ipClass: string;
  addressType: string;
}

interface SplitOption {
  prefix: number;
  label: string;
}

interface SplitPreview {
  targetPrefix: number;
  targetMask: number;
  totalSubnets: number;
  addressCount: number;
  usableHostCount: number;
  displayCount: number;
  note: string;
  subnets: Array<{
    index: number;
    networkValue: number;
    broadcastValue: number;
    firstHostValue: number;
    lastHostValue: number;
  }>;
}

interface CalculationSuccess {
  normalizedInput: string;
  result: CalculationResult;
}

const MAX_SUBNET_RESULTS = 64;
const QUICK_EXAMPLES = [
  '192.168.1.0/24',
  '10.0.0.0/8',
  '172.16.0.0/16',
  '192.168.0.0/16',
  '10.10.10.0/24',
];
const INITIAL_INPUT = QUICK_EXAMPLES[0];
const INITIAL_PREFIX = 24;

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

function clampPrefix(value: number) {
  return Math.min(32, Math.max(0, value));
}

function parseIpv4(value: string) {
  const parts = value.trim().split('.');
  if (parts.length !== 4) {
    throw new Error('请输入完整的 IPv4 地址，例如 192.168.1.0/24。');
  }

  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      throw new Error('IPv4 地址每一段都必须是 0-255 的整数。');
    }

    const octet = Number.parseInt(part, 10);
    if (octet < 0 || octet > 255 || String(octet) !== part) {
      throw new Error('IPv4 地址每一段都必须是 0-255 的整数。');
    }

    return octet;
  });

  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]);
}

function formatIpv4(value: number) {
  const octet1 = Math.floor(value / 16777216) % 256;
  const octet2 = Math.floor(value / 65536) % 256;
  const octet3 = Math.floor(value / 256) % 256;
  const octet4 = value % 256;
  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}

function getOctets(value: number) {
  return formatIpv4(value).split('.').map((octet) => Number.parseInt(octet, 10));
}

function maskFromPrefix(prefix: number) {
  if (prefix === 0) {
    return 0;
  }

  return (2 ** prefix - 1) * 2 ** (32 - prefix);
}

function getAddressCount(prefix: number) {
  return 2 ** (32 - prefix);
}

function getUsableHostCount(prefix: number) {
  const addressCount = getAddressCount(prefix);

  if (prefix === 32) {
    return 1;
  }

  if (prefix === 31) {
    return 2;
  }

  return Math.max(addressCount - 2, 0);
}

function getHostRange(prefix: number, networkValue: number, broadcastValue: number) {
  if (prefix === 32) {
    return {
      firstHostValue: networkValue,
      lastHostValue: networkValue,
    };
  }

  if (prefix === 31) {
    return {
      firstHostValue: networkValue,
      lastHostValue: broadcastValue,
    };
  }

  return {
    firstHostValue: networkValue + 1,
    lastHostValue: broadcastValue - 1,
  };
}

function getIpClass(ipValue: number) {
  const firstOctet = getOctets(ipValue)[0];

  if (firstOctet <= 126) {
    return 'A 类';
  }

  if (firstOctet === 127) {
    return '特殊地址';
  }

  if (firstOctet <= 191) {
    return 'B 类';
  }

  if (firstOctet <= 223) {
    return 'C 类';
  }

  if (firstOctet <= 239) {
    return 'D 类';
  }

  return 'E 类';
}

function isInRange(value: number, start: number, end: number) {
  return value >= start && value <= end;
}

function getAddressType(ipValue: number) {
  if (ipValue === 0) {
    return '未指定地址';
  }

  if (ipValue === 0xffffffff) {
    return '受限广播';
  }

  if (isInRange(ipValue, parseIpv4('10.0.0.0'), parseIpv4('10.255.255.255'))) {
    return '私有地址';
  }

  if (isInRange(ipValue, parseIpv4('172.16.0.0'), parseIpv4('172.31.255.255'))) {
    return '私有地址';
  }

  if (isInRange(ipValue, parseIpv4('192.168.0.0'), parseIpv4('192.168.255.255'))) {
    return '私有地址';
  }

  if (isInRange(ipValue, parseIpv4('127.0.0.0'), parseIpv4('127.255.255.255'))) {
    return '环回地址';
  }

  if (isInRange(ipValue, parseIpv4('169.254.0.0'), parseIpv4('169.254.255.255'))) {
    return '链路本地地址';
  }

  if (isInRange(ipValue, parseIpv4('100.64.0.0'), parseIpv4('100.127.255.255'))) {
    return '运营商 NAT';
  }

  if (isInRange(ipValue, parseIpv4('224.0.0.0'), parseIpv4('239.255.255.255'))) {
    return '组播地址';
  }

  if (isInRange(ipValue, parseIpv4('240.0.0.0'), parseIpv4('255.255.255.254'))) {
    return '保留地址';
  }

  return '公网地址';
}

function parseInput(input: string, fallbackPrefix: number) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('请输入要计算的 IPv4 地址或 CIDR。');
  }

  const [ipPart, prefixPart, extraPart] = trimmed.split('/');

  if (extraPart !== undefined) {
    throw new Error('CIDR 只支持一个前缀长度，例如 /24。');
  }

  const ipValue = parseIpv4(ipPart);
  let prefix = fallbackPrefix;

  if (prefixPart !== undefined && prefixPart.trim() !== '') {
    if (!/^\d+$/.test(prefixPart.trim())) {
      throw new Error('前缀长度必须是 0-32 的整数。');
    }

    prefix = clampPrefix(Number.parseInt(prefixPart.trim(), 10));
    if (String(prefix) !== prefixPart.trim()) {
      throw new Error('前缀长度必须是 0-32 的整数。');
    }
  }

  return {
    ipValue,
    prefix,
  };
}

function calculateSubnet(input: string, fallbackPrefix: number): CalculationSuccess {
  const { ipValue, prefix } = parseInput(input, fallbackPrefix);
  const addressCount = getAddressCount(prefix);
  const maskValue = maskFromPrefix(prefix);
  const networkValue = Math.floor(ipValue / addressCount) * addressCount;
  const broadcastValue = networkValue + addressCount - 1;
  const { firstHostValue, lastHostValue } = getHostRange(prefix, networkValue, broadcastValue);

  return {
    normalizedInput: `${formatIpv4(ipValue)}/${prefix}`,
    result: {
      ipValue,
      prefix,
      maskValue,
      networkValue,
      broadcastValue,
      firstHostValue,
      lastHostValue,
      addressCount,
      usableHostCount: getUsableHostCount(prefix),
      ipClass: getIpClass(ipValue),
      addressType: getAddressType(ipValue),
    },
  };
}

function buildSubnetOptions(prefix: number) {
  const options: SplitOption[] = [];

  for (let nextPrefix = prefix + 1; nextPrefix <= 32; nextPrefix += 1) {
    const subnetCount = 2 ** (nextPrefix - prefix);
    options.push({
      prefix: nextPrefix,
      label: `${formatNumber(subnetCount)} 个子网 · /${nextPrefix}`,
    });
  }

  return options;
}

function buildHostOptions(prefix: number) {
  const options: SplitOption[] = [];

  for (let nextPrefix = prefix + 1; nextPrefix <= 32; nextPrefix += 1) {
    const usableHosts = getUsableHostCount(nextPrefix);
    const unit = nextPrefix >= 31 ? '个地址' : '台主机';

    options.push({
      prefix: nextPrefix,
      label: `${formatNumber(usableHosts)} ${unit} / 子网 · /${nextPrefix}`,
    });
  }

  return options;
}

function createSplitPreview(result: CalculationResult, targetPrefix: number): SplitPreview {
  const addressCount = getAddressCount(targetPrefix);
  const totalSubnets = 2 ** (targetPrefix - result.prefix);
  const targetMask = maskFromPrefix(targetPrefix);
  const usableHostCount = getUsableHostCount(targetPrefix);
  const displayCount = Math.min(totalSubnets, MAX_SUBNET_RESULTS);
  const subnets = Array.from({ length: displayCount }, (_, index) => {
    const networkValue = result.networkValue + index * addressCount;
    const broadcastValue = networkValue + addressCount - 1;
    const { firstHostValue, lastHostValue } = getHostRange(
      targetPrefix,
      networkValue,
      broadcastValue,
    );

    return {
      index: index + 1,
      networkValue,
      broadcastValue,
      firstHostValue,
      lastHostValue,
    };
  });

  return {
    targetPrefix,
    targetMask,
    totalSubnets,
    addressCount,
    usableHostCount,
    displayCount,
    note:
      totalSubnets > displayCount
        ? `仅展示前 ${formatNumber(displayCount)} 个子网，完整结果共 ${formatNumber(totalSubnets)} 个。`
        : `已生成 ${formatNumber(totalSubnets)} 个子网。`,
    subnets,
  };
}

function replacePrefixInInput(input: string, prefix: number) {
  const base = input.trim().split('/')[0]?.trim() ?? '';
  return base ? `${base}/${prefix}` : '';
}

function formatHostRange(result: Pick<CalculationResult, 'prefix' | 'firstHostValue' | 'lastHostValue'>) {
  if (result.prefix === 32) {
    return formatIpv4(result.firstHostValue);
  }

  return `${formatIpv4(result.firstHostValue)} - ${formatIpv4(result.lastHostValue)}`;
}

function buildBinarySegments(value: number, prefix: number) {
  const segments: Array<{ text: string; kind: 'network' | 'host' | 'separator' }> = [];
  let bitIndex = 0;

  getOctets(value).forEach((octet, octetIndex) => {
    octet
      .toString(2)
      .padStart(8, '0')
      .split('')
      .forEach((bit) => {
        segments.push({
          text: bit,
          kind: bitIndex < prefix ? 'network' : 'host',
        });
        bitIndex += 1;
      });

    if (octetIndex < 3) {
      segments.push({
        text: '.',
        kind: 'separator',
      });
    }
  });

  return segments;
}

function BinaryAddress({
  label,
  value,
  prefix,
}: {
  label: string;
  value: number;
  prefix: number;
}) {
  const segments = buildBinarySegments(value, prefix);

  return (
    <div className="subnet-binary-row">
      <span className="subnet-binary-label">{label}</span>
      <code className="subnet-binary-value">
        {segments.map((segment, index) => (
          <span
            key={`${label}-${index}`}
            className={`subnet-binary-bit ${
              segment.kind === 'separator'
                ? 'is-separator'
                : segment.kind === 'network'
                  ? 'is-network'
                  : 'is-host'
            }`}
          >
            {segment.text}
          </span>
        ))}
      </code>
    </div>
  );
}

function createInitialState() {
  const { normalizedInput, result } = calculateSubnet(INITIAL_INPUT, INITIAL_PREFIX);
  const defaultOption = buildSubnetOptions(result.prefix)[0];

  return {
    cidrInput: normalizedInput,
    prefix: result.prefix,
    splitMode: 'subnets' as SplitMode,
    selectedSplitPrefix: defaultOption?.prefix ?? null,
    result,
    splitPreview: defaultOption ? createSplitPreview(result, defaultOption.prefix) : null,
  };
}

const INITIAL_STATE = createInitialState();

export function IPv4SubnettingModal({ isOpen, onClose }: IPv4SubnettingModalProps) {
  const [cidrInput, setCidrInput] = useState(INITIAL_STATE.cidrInput);
  const [prefix, setPrefix] = useState(INITIAL_STATE.prefix);
  const [splitMode, setSplitMode] = useState<SplitMode>(INITIAL_STATE.splitMode);
  const [selectedSplitPrefix, setSelectedSplitPrefix] = useState<number | null>(
    INITIAL_STATE.selectedSplitPrefix,
  );
  const [result, setResult] = useState<CalculationResult | null>(INITIAL_STATE.result);
  const [splitPreview, setSplitPreview] = useState<SplitPreview | null>(INITIAL_STATE.splitPreview);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const subnetOptions = result ? buildSubnetOptions(result.prefix) : [];
  const hostOptions = result ? buildHostOptions(result.prefix) : [];
  const activeSplitOptions = splitMode === 'subnets' ? subnetOptions : hostOptions;

  const runCalculation = (nextInput = cidrInput, nextPrefix = prefix, nextMode = splitMode) => {
    try {
      const { normalizedInput, result: nextResult } = calculateSubnet(nextInput, nextPrefix);
      const nextOptions =
        nextMode === 'subnets'
          ? buildSubnetOptions(nextResult.prefix)
          : buildHostOptions(nextResult.prefix);
      const nextSelectedPrefix = nextOptions[0]?.prefix ?? null;

      setCidrInput(normalizedInput);
      setPrefix(nextResult.prefix);
      setResult(nextResult);
      setSelectedSplitPrefix(nextSelectedPrefix);
      setSplitPreview(
        nextSelectedPrefix === null ? null : createSplitPreview(nextResult, nextSelectedPrefix),
      );
      setError(null);
    } catch (calculationError) {
      setResult(null);
      setSplitPreview(null);
      setSelectedSplitPrefix(null);
      setError(
        calculationError instanceof Error ? calculationError.message : 'IPv4 计算失败，请检查输入。',
      );
    }
  };

  const handleExampleClick = (example: string) => {
    setSplitMode('subnets');
    runCalculation(example, INITIAL_PREFIX, 'subnets');
  };

  const handlePrefixChange = (value: string) => {
    const nextPrefix = clampPrefix(Number.parseInt(value, 10));
    setPrefix(nextPrefix);
    setCidrInput((current) => replacePrefixInInput(current, nextPrefix));
  };

  const handleSplitModeChange = (nextMode: SplitMode) => {
    setSplitMode(nextMode);

    if (!result) {
      setSelectedSplitPrefix(null);
      setSplitPreview(null);
      return;
    }

    const nextOptions =
      nextMode === 'subnets' ? buildSubnetOptions(result.prefix) : buildHostOptions(result.prefix);
    const nextSelectedPrefix = nextOptions[0]?.prefix ?? null;

    setSelectedSplitPrefix(nextSelectedPrefix);
    setSplitPreview(
      nextSelectedPrefix === null ? null : createSplitPreview(result, nextSelectedPrefix),
    );
  };

  const handleSplitPrefixChange = (value: string) => {
    const nextPrefix = Number.parseInt(value, 10);
    setSelectedSplitPrefix(nextPrefix);

    if (result) {
      setSplitPreview(createSplitPreview(result, nextPrefix));
    }
  };

  const handleSplit = () => {
    if (!result || selectedSplitPrefix === null) {
      return;
    }

    setSplitPreview(createSplitPreview(result, selectedSplitPrefix));
  };

  const handleReset = () => {
    setCidrInput(INITIAL_STATE.cidrInput);
    setPrefix(INITIAL_STATE.prefix);
    setSplitMode(INITIAL_STATE.splitMode);
    setSelectedSplitPrefix(INITIAL_STATE.selectedSplitPrefix);
    setResult(INITIAL_STATE.result);
    setSplitPreview(INITIAL_STATE.splitPreview);
    setError(null);
  };

  return (
    <div
      className="tool-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="subnet-modal panel" role="dialog" aria-modal="true" aria-label="IPv4 子网划分">
        <div className="subnet-modal-head">
          <div>
            <h2>IPv4 子网划分</h2>
            <p>支持 CIDR 计算、二进制展示，以及按子网数量或按主机数量进行快速划分。</p>
          </div>
          <div>
          <button
            type="button"
            className="subnet-modal-close"
            onClick={onClose}
            aria-label="关闭 IPv4 子网划分"
          >
            ×
          </button>
          </div>
        </div>

        <div className="subnet-modal-body">
          <section className="subnet-section">
            <div className="subnet-section-head">
              <h3>子网计算器</h3>
              <p>点击示例后会直接带入并计算。</p>
            </div>

            <div className="subnet-example-row">
              {QUICK_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  className="subnet-example-chip"
                  onClick={() => handleExampleClick(example)}
                >
                  {example}
                </button>
              ))}
            </div>

            <div className="subnet-form-grid">
              <label className="subnet-field subnet-field-wide">
                <span>IP 地址 / CIDR</span>
                <input
                  type="text"
                  value={cidrInput}
                  onChange={(event) => setCidrInput(event.target.value)}
                  placeholder="例如 192.168.1.0/24"
                />
              </label>

              <label className="subnet-field">
                <span>子网掩码</span>
                <select value={prefix} onChange={(event) => handlePrefixChange(event.target.value)}>
                  {Array.from({ length: 33 }, (_, index) => {
                    const optionPrefix = index;
                    return (
                      <option key={optionPrefix} value={optionPrefix}>
                        /{optionPrefix} ({formatIpv4(maskFromPrefix(optionPrefix))})
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            <div className="subnet-action-row">
              <button type="button" className="subnet-primary-btn" onClick={() => runCalculation()}>
                计算
              </button>
              <button type="button" className="subnet-secondary-btn" onClick={handleReset}>
                清空
              </button>
            </div>

            {error ? <p className="subnet-error-text">{error}</p> : null}
          </section>

          {result ? (
            <section className="subnet-section">
              <div className="subnet-section-head">
                <h3>计算结果</h3>
                <p>当前地址块共 {formatNumber(result.addressCount)} 个地址。</p>
              </div>

              <div className="subnet-result-grid">
                <div className="subnet-result-card">
                  <span>IP 地址</span>
                  <strong>{formatIpv4(result.ipValue)}</strong>
                </div>
                <div className="subnet-result-card">
                  <span>子网掩码</span>
                  <strong>{formatIpv4(result.maskValue)}</strong>
                </div>
                <div className="subnet-result-card">
                  <span>网络地址</span>
                  <strong>{`${formatIpv4(result.networkValue)}/${result.prefix}`}</strong>
                </div>
                <div className="subnet-result-card">
                  <span>广播地址</span>
                  <strong>{formatIpv4(result.broadcastValue)}</strong>
                </div>
                <div className="subnet-result-card">
                  <span>可用主机范围</span>
                  <strong>{formatHostRange(result)}</strong>
                </div>
                <div className="subnet-result-card">
                  <span>可用主机数</span>
                  <strong>{formatNumber(result.usableHostCount)}</strong>
                </div>
                <div className="subnet-result-card">
                  <span>IP 类型</span>
                  <strong>{result.ipClass}</strong>
                </div>
                <div className="subnet-result-card">
                  <span>地址类型</span>
                  <strong>{result.addressType}</strong>
                </div>
              </div>

              <div className="subnet-binary-panel">
                <div className="subnet-section-head is-compact">
                  <h3>二进制表示</h3>
                  <p>绿色为网络位，红色为主机位。</p>
                </div>

                <BinaryAddress label="IP 地址" value={result.ipValue} prefix={result.prefix} />
                <BinaryAddress label="子网掩码" value={result.maskValue} prefix={result.prefix} />
                <BinaryAddress label="网络地址" value={result.networkValue} prefix={result.prefix} />
                <BinaryAddress
                  label="广播地址"
                  value={result.broadcastValue}
                  prefix={result.prefix}
                />
              </div>
            </section>
          ) : null}

          {result ? (
            <section className="subnet-section">
              <div className="subnet-section-head">
                <h3>IPv4 子网划分</h3>
                <p>基于 {formatIpv4(result.networkValue)}/{result.prefix} 继续细分。</p>
              </div>

              <div className="subnet-mode-row">
                <button
                  type="button"
                  className={`subnet-mode-btn ${splitMode === 'subnets' ? 'is-active' : ''}`}
                  onClick={() => handleSplitModeChange('subnets')}
                >
                  按子网数量
                </button>
                <button
                  type="button"
                  className={`subnet-mode-btn ${splitMode === 'hosts' ? 'is-active' : ''}`}
                  onClick={() => handleSplitModeChange('hosts')}
                >
                  按主机数量
                </button>
              </div>

              <div className="subnet-split-controls">
                <label className="subnet-field subnet-field-wide">
                  <span>{splitMode === 'subnets' ? '划分子网数量' : '每个子网主机数'}</span>
                  <select
                    value={selectedSplitPrefix ?? ''}
                    onChange={(event) => handleSplitPrefixChange(event.target.value)}
                    disabled={!activeSplitOptions.length}
                  >
                    {activeSplitOptions.length ? (
                      activeSplitOptions.map((option) => (
                        <option key={option.prefix} value={option.prefix}>
                          {option.label}
                        </option>
                      ))
                    ) : (
                      <option value="">当前前缀不能继续划分</option>
                    )}
                  </select>
                </label>

                <button
                  type="button"
                  className="subnet-primary-btn subnet-split-btn"
                  onClick={handleSplit}
                  disabled={!activeSplitOptions.length}
                >
                  划分
                </button>
              </div>

              {splitPreview ? (
                <div className="subnet-split-preview">
                  <div className="subnet-split-summary">
                    <div className="subnet-summary-pill">
                      <span>目标前缀</span>
                      <strong>/{splitPreview.targetPrefix}</strong>
                    </div>
                    <div className="subnet-summary-pill">
                      <span>子网掩码</span>
                      <strong>{formatIpv4(splitPreview.targetMask)}</strong>
                    </div>
                    <div className="subnet-summary-pill">
                      <span>总子网数</span>
                      <strong>{formatNumber(splitPreview.totalSubnets)}</strong>
                    </div>
                    <div className="subnet-summary-pill">
                      <span>每个子网可用主机</span>
                      <strong>{formatNumber(splitPreview.usableHostCount)}</strong>
                    </div>
                  </div>

                  <p className="subnet-split-note">{splitPreview.note}</p>

                  <div className="subnet-table">
                    <div className="subnet-table-head">
                      <span>#</span>
                      <span>网络地址</span>
                      <span>可用主机范围</span>
                      <span>广播地址</span>
                    </div>

                    <div className="subnet-table-body">
                      {splitPreview.subnets.map((subnet) => (
                        <div key={subnet.index} className="subnet-table-row">
                          <span>{subnet.index}</span>
                          <span>{`${formatIpv4(subnet.networkValue)}/${splitPreview.targetPrefix}`}</span>
                          <span>
                            {splitPreview.targetPrefix === 32
                              ? formatIpv4(subnet.firstHostValue)
                              : `${formatIpv4(subnet.firstHostValue)} - ${formatIpv4(
                                  subnet.lastHostValue,
                                )}`}
                          </span>
                          <span>{formatIpv4(subnet.broadcastValue)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
