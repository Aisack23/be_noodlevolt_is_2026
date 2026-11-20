import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'generated') continue;
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}

const isTest = (path) =>
  /\.(?:spec|test|e2e-spec)(?:\.[cm]?[jt]s)?$/.test(path);
const isTestImport = (path) =>
  isTest(path) ||
  /^(?:vitest(?:\/|$)|@vitest\/)/.test(path) ||
  path.includes('/__tests__/');
const failures = [];
for (const path of await files('src')) {
  if (!path.endsWith('.ts') || isTest(path)) continue;
  const ast = ts.createSourceFile(
    path,
    await readFile(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    let value;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      value = node.moduleSpecifier;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(ast) === 'require')
    )
      value = node.arguments[0];
    if (value && ts.isStringLiteralLike(value) && isTestImport(value.text))
      failures.push(`${path} -> ${value.text}`);
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
for (const path of await files('dist')) if (isTest(path)) failures.push(path);
if (failures.length)
  throw new Error(
    `Se detectaron pruebas o imports de Vitest en runtime:\n${failures.join('\n')}`,
  );
process.stdout.write(
  'OK: runtime sin archivos de prueba ni imports de Vitest.\n',
);
