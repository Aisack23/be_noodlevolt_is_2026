# Acceso a GitHub desde el entorno de desarrollo

Probar primero el remoto HTTPS existente: `git ls-remote origin refs/heads/develop`.
El proxy de la plataforma puede autenticar sin variables de token. No cambiar
credenciales si funciona. `git push --dry-run origin HEAD:refs/heads/<rama>`
permite comprobar escritura sin publicar cambios.

Si falla la autenticación, verificar conectividad y usar una sesión oficial nueva;
no reutilizar códigos de dispositivo anteriores ni mostrar tokens.

```bash
git check-ignore .tmp/github-auth/hosts.yml
mkdir -p .tmp/github-auth
chmod 700 .tmp/github-auth
env -u GH_TOKEN -u GITHUB_TOKEN \
  GH_CONFIG_DIR="$PWD/.tmp/github-auth" GH_BROWSER=/bin/true \
  gh auth login --hostname github.com --git-protocol https --web
```

El usuario debe autorizar el código nuevo en https://github.com/login/device.
Solo después de esa autorización:

```bash
find .tmp/github-auth -type d -exec chmod 700 {} +
find .tmp/github-auth -type f -exec chmod 600 {} +
env -u GH_TOKEN -u GITHUB_TOKEN GH_CONFIG_DIR="$PWD/.tmp/github-auth" \
  gh api repos/Aisack23/be_noodlevolt_is_2026 \
  --jq '{repository: .full_name, push: .permissions.push}'
git config --local credential.https://github.com.helper ''
git config --local --add credential.https://github.com.helper \
  '!env -u GH_TOKEN -u GITHUB_TOKEN GH_CONFIG_DIR="$(git rev-parse --show-toplevel)/.tmp/github-auth" gh auth git-credential'
```

La configuración solo afecta este repositorio. `.tmp` debe estar ignorado antes
de guardar credenciales. No publicar ese directorio, modificar el entorno global,
desactivar TLS ni cambiar workflows o protecciones para resolver el acceso.

Actualizar develop preservando cambios locales, y crear una rama desde esa referencia:

```bash
git status --short
git fetch origin develop:refs/remotes/origin/develop
git switch -c <rama> origin/develop
```

Si el checkout solo sigue `main`, añadir el refspec de la rama necesaria sin
reemplazar los existentes. Tras publicar, comparar `git rev-parse HEAD` con
`git ls-remote origin refs/heads/<rama>`. No crear un PR salvo petición expresa.
