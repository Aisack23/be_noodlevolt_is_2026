import ipaddr from 'ipaddr.js';

export function parseCidrs(value: unknown, trustedProxy = false): string[] {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string')
    throw new Error('La política IP debe ser una lista de CIDR.');
  return value.split(',').map((entry) => {
    try {
      const [address, prefix] = ipaddr.parseCIDR(entry.trim());
      if (trustedProxy && prefix === 0) throw new Error('Proxy universal');
      return `${address.toString()}/${prefix}`;
    } catch {
      throw new Error(
        'La política IP contiene un CIDR inválido o un proxy universal.',
      );
    }
  });
}

export function isAllowedIp(
  ip: string | undefined,
  cidrs: readonly string[],
): boolean {
  if (cidrs.length === 0) return true;
  if (!ip) return false;
  try {
    const address = ipaddr.process(ip);
    return cidrs.some((cidr) => {
      const [network, prefix] = ipaddr.parseCIDR(cidr);
      return (
        address.kind() === network.kind() && address.match(network, prefix)
      );
    });
  } catch {
    return false;
  }
}

export function parseOrigins(value: unknown): string[] {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string')
    throw new Error('CORS_ORIGINS debe ser una lista de orígenes.');
  return [
    ...new Set(
      value.split(',').map((entry) => {
        try {
          const origin = new URL(entry.trim());
          if (
            !['http:', 'https:'].includes(origin.protocol) ||
            origin.hostname.includes('*') ||
            origin.username ||
            origin.password ||
            origin.search ||
            origin.hash ||
            origin.pathname !== '/'
          )
            throw new Error('Origen inválido');
          return origin.origin;
        } catch {
          throw new Error(
            'CORS_ORIGINS solo admite orígenes HTTP/HTTPS exactos, sin comodines ni rutas.',
          );
        }
      }),
    ),
  ];
}
