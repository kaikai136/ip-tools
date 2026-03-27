export function validateNetworkSegment(segment: string): string | undefined {
  const trimmed = segment.trim();
  const parts = trimmed.split('.');

  if (parts.length !== 3) {
    return '请输入类似 192.168.1 的前三段地址';
  }

  const isValid = parts.every((part) => {
    if (!/^\d+$/.test(part)) {
      return false;
    }

    const value = Number.parseInt(part, 10);
    return value >= 0 && value <= 255 && String(value) === part;
  });

  if (!isValid) {
    return '每一段都必须是 0-255 之间的整数';
  }

  return undefined;
}

export function parseHostValue(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return Number.parseInt(trimmed, 10);
}

export function validateHostRange(hostStart: string, hostEnd: string): string | undefined {
  const start = parseHostValue(hostStart);
  const end = parseHostValue(hostEnd);

  if (start === null || end === null) {
    return '主机范围必须是整数';
  }

  if (start < 1 || start > 254 || end < 1 || end > 254) {
    return '主机号必须在 1 到 254 之间';
  }

  if (start > end) {
    return '起始主机号不能大于结束主机号';
  }

  return undefined;
}

export function parsePortsInput(input: string): number[] {
  const ports = new Set<number>();
  const tokens = input
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!tokens.length) {
    throw new Error('请至少输入一个端口');
  }

  for (const token of tokens) {
    if (token.includes('-')) {
      const [startText, endText] = token.split('-');
      const start = parsePort(startText);
      const end = parsePort(endText);

      if (start > end) {
        throw new Error(`端口区间起始值不能大于结束值: ${token}`);
      }

      for (let port = start; port <= end; port += 1) {
        ports.add(port);
      }
    } else {
      ports.add(parsePort(token));
    }
  }

  return Array.from(ports).sort((left, right) => left - right);
}

export function validatePortsInput(input: string): string | undefined {
  try {
    parsePortsInput(input);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : '端口列表格式无效';
  }
}

function parsePort(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value.trim())) {
    throw new Error(`无法识别端口: ${value ?? ''}`);
  }

  const port = Number.parseInt(value.trim(), 10);
  if (port < 1 || port > 65535) {
    throw new Error('端口范围必须在 1 到 65535 之间');
  }

  return port;
}

export function getHostNumber(ip: string): number {
  const parts = ip.split('.');
  return Number.parseInt(parts[3], 10);
}
