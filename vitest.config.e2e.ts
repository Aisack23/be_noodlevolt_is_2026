import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Incluye las suites db-*, que corren los mismos seeds contra una sola base:
    // en paralelo chocan al insertar las mismas filas si la base está vacía.
    fileParallelism: false,
  },
});
