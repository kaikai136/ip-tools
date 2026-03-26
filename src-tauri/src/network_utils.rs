use std::collections::BTreeSet;
use std::net::{IpAddr, Ipv4Addr};

use crate::error::AppError;

pub fn validate_network_segment(segment: &str) -> Result<(), AppError> {
    let parts: Vec<&str> = segment.split('.').collect();
    if parts.len() != 3 {
        return Err(AppError::InvalidNetworkSegment(
            "请输入类似 192.168.1 的前三段地址".to_string(),
        ));
    }

    for part in parts {
        match part.parse::<u8>() {
            Ok(_) => {}
            Err(_) => {
                return Err(AppError::InvalidNetworkSegment(format!(
                    "存在无效的地址段: {}",
                    part
                )))
            }
        }
    }

    Ok(())
}

pub fn validate_host_range(host_start: u16, host_end: u16) -> Result<(), AppError> {
    if !(1..=254).contains(&host_start) || !(1..=254).contains(&host_end) {
        return Err(AppError::InvalidHostRange(
            "主机号必须在 1 到 254 之间".to_string(),
        ));
    }

    if host_start > host_end {
        return Err(AppError::InvalidHostRange(
            "起始主机号不能大于结束主机号".to_string(),
        ));
    }

    Ok(())
}

pub fn generate_ip_range(
    network_segment: &str,
    host_start: u16,
    host_end: u16,
) -> Result<Vec<IpAddr>, AppError> {
    validate_network_segment(network_segment)?;
    validate_host_range(host_start, host_end)?;

    let mut ips = Vec::new();
    for host in host_start..=host_end {
        let ip_str = format!("{}.{}", network_segment, host);
        if let Ok(ip) = ip_str.parse::<Ipv4Addr>() {
            ips.push(IpAddr::V4(ip));
        }
    }

    Ok(ips)
}

pub fn parse_ports_input(input: &str) -> Result<Vec<u16>, AppError> {
    let mut ports = BTreeSet::new();

    for part in input.split(|ch: char| ch == ',' || ch.is_whitespace()) {
        let token = part.trim();
        if token.is_empty() {
            continue;
        }

        if let Some((start, end)) = token.split_once('-') {
            let start = parse_port(start)?;
            let end = parse_port(end)?;

            if start > end {
                return Err(AppError::InvalidPortInput(format!(
                    "端口区间起始值不能大于结束值: {}",
                    token
                )));
            }

            for port in start..=end {
                ports.insert(port);
            }
        } else {
            ports.insert(parse_port(token)?);
        }
    }

    if ports.is_empty() {
        return Err(AppError::InvalidPortInput(
            "请至少输入一个端口".to_string(),
        ));
    }

    Ok(ports.into_iter().collect())
}

fn parse_port(value: &str) -> Result<u16, AppError> {
    let port = value
        .trim()
        .parse::<u16>()
        .map_err(|_| AppError::InvalidPortInput(format!("无法识别端口: {}", value)))?;

    if port == 0 {
        return Err(AppError::InvalidPortInput(
            "端口范围必须在 1 到 65535 之间".to_string(),
        ));
    }

    Ok(port)
}

pub fn get_local_ip() -> Result<String, AppError> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| AppError::NetworkError(format!("无法获取本机 IP: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_network_segment() {
        assert!(validate_network_segment("192.168.1").is_ok());
        assert!(validate_network_segment("10.0.0").is_ok());
        assert!(validate_network_segment("256.1.1").is_err());
        assert!(validate_network_segment("192.168").is_err());
    }

    #[test]
    fn test_validate_host_range() {
        assert!(validate_host_range(1, 254).is_ok());
        assert!(validate_host_range(0, 10).is_err());
        assert!(validate_host_range(20, 10).is_err());
    }

    #[test]
    fn test_generate_ip_range() {
        let ips = generate_ip_range("192.168.1", 252, 254).unwrap();
        assert_eq!(ips.len(), 3);
        assert_eq!(ips[0].to_string(), "192.168.1.252");
        assert_eq!(ips[2].to_string(), "192.168.1.254");
    }

    #[test]
    fn test_parse_ports_input() {
        let ports = parse_ports_input("80, 443, 8000-8002").unwrap();
        assert_eq!(ports, vec![80, 443, 8000, 8001, 8002]);
        assert!(parse_ports_input("").is_err());
        assert!(parse_ports_input("90-80").is_err());
    }

    #[test]
    fn test_parse_full_port_range() {
        let ports = parse_ports_input("1-65535").unwrap();
        assert_eq!(ports.len(), 65_535);
        assert_eq!(ports.first(), Some(&1));
        assert_eq!(ports.last(), Some(&65_535));
    }
}
