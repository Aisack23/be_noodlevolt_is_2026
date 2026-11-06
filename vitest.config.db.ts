import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['test/db-*.e2e-spec.ts'],
    // Varias suites corren los mismos seeds contra una sola base: en paralelo
    // chocan al insertar las mismas filas si la base está vacía.
    fileParallelism: false,
  },
});
