import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { trustProxySetting } from './network-policy.js';

// Prueba el comportamiento real de Express con el valor que produce la
// configuración: si el proxy no es confiable, req.secure y req.ip mienten.
async function inspect(
  setting: ReturnType<typeof trustProxySetting>,
  headers: Record<string, string>,
) {
  const app = express();
  app.set('trust proxy', setting);
  app.get('/', (req, res) => {
    res.json({ secure: req.secure, ip: req.ip });
  });
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { headers });
    return (await response.json()) as { secure: boolean; ip: string };
  } finally {
    server.close();
  }
}

describe('trustProxySetting', () => {
  it('usa el número de saltos cuando se configura', () => {
    expect(trustProxySetting([], 1)).toBe(1);
  });
  it('usa los CIDR cuando no hay saltos', () => {
    expect(trustProxySetting(['10.0.0.0/8'], 0)).toEqual(['10.0.0.0/8']);
  });
  it('ignora cabeceras reenviadas si no hay ningún proxy configurado', () => {
    expect(trustProxySetting([], 0)).toBe(false);
  });
});

describe('proxy de confianza con X-Forwarded-*', () => {
  it('marca la petición como HTTPS detrás de un proxy con 1 salto', async () => {
    const result = await inspect(trustProxySetting([], 1), {
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-For': '203.0.113.7',
    });
    expect(result.secure).toBe(true);
  });
  it('toma la IP del cliente del primer salto y no la cabecera falsificada', async () => {
    const result = await inspect(trustProxySetting([], 1), {
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-For': '198.51.100.9, 203.0.113.7',
    });
    expect(result.ip).toBe('203.0.113.7');
  });
  it('no confía en X-Forwarded-Proto sin proxy configurado', async () => {
    const result = await inspect(trustProxySetting([], 0), {
      'X-Forwarded-Proto': 'https',
      'X-Forwarded-For': '203.0.113.7',
    });
    expect(result.secure).toBe(false);
    expect(result.ip).not.toBe('203.0.113.7');
  });
});
