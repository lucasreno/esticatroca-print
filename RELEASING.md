# RELEASING.md — esticatroca-print

Guia curto para publicar uma nova versão do pacote portátil Windows.

> TL;DR: edite `package.json`, `git tag print-vX.Y.Z`, `git push --tags`. O GitHub Actions faz o resto.

---

## 1. Quando publicar

Publique um release sempre que alguma destas mudar e precise chegar às máquinas das lojas:

- Código em `src/` (servidor WS, admin HTTP, driver ESC/POS).
- UI admin em `web/`.
- Dependências (`package.json` / `package-lock.json`).
- Scripts `.bat` em `release/` ou o `pack-release.ps1`.

Não precisa publicar para mudanças que só afetam dev (`README.md`, `AGENTS.md`, testes, tooling de lint etc.).

---

## 2. Versionamento

Usamos **SemVer** no `package.json`:

| Mudança | Incremento |
|---|---|
| Bug fix, sem mudar contrato WS nem comportamento observável | PATCH (`0.1.1` → `0.1.2`) |
| Nova funcionalidade, mensagem WS nova, mudança de UI admin | MINOR (`0.1.2` → `0.2.0`) |
| Mudança de contrato WS que quebra frontend antigo, mudança no formato de `data.json`, troca do gerenciador de serviço | MAJOR (`0.2.0` → `1.0.0`) |

A tag git pode usar:

- **`print-vX.Y.Z`** &mdash; convenc&atilde;o do poli-repo (raiz `esticatroca/`), evita colis&atilde;o com tags de `esticatroca-api` e `esticatroca-web`.
- **`vX.Y.Z`** &mdash; tamb&eacute;m aceita pelo workflow; conveni&ecirc;ncia em repo standalone (`lucasreno/esticatroca-print`).

O workflow aceita os dois formatos, ent&atilde;o use o que for mais natural no contexto.

---

## 3. Checklist pré-release

Antes de empurrar a tag:

1. **Builda localmente** e roda o serviço: `npm ci && npm run build && npm start`. Admin abre em http://localhost:6442/ sem erro?
2. **Lint limpo**: `npm run lint`.
3. **Teste manual mínimo**:
   - Abre a UI admin, cadastra/seleciona impressora.
   - Clica "Testar impressão" (deve sair cupom).
   - Frontend Angular em dev consegue imprimir (WS `ws://localhost:6441`)?
4. **Atualiza `progress.txt`** na raiz do workspace com uma linha descrevendo a mudança.
5. Se a mudança afeta **contrato WS**, atualiza também `esticatroca-web/src/app/services/impressao.service.ts` no mesmo PR/branch.

---

## 4. Publicação (fluxo padrão)

```powershell
cd C:\oneway\esticatroca\esticatroca-print

# 4.1 Bump da versao (edita package.json e package-lock.json, SEM criar tag git)
npm version patch --no-git-tag-version    # ou: minor / major / 0.2.0 explicito

# 4.2 Commit do bump
git add package.json package-lock.json
git commit -m "chore(print): v$(node -p "require('./package.json').version")"

# 4.3 Tag com prefixo print-v
$ver = node -p "require('./package.json').version"
git tag "print-v$ver"

# 4.4 Push commit + tag
git push
git push origin "print-v$ver"
```

Em ~5-8 minutos o workflow **Release (esticatroca-print)** termina e o zip aparece em:

`https://github.com/<owner>/<repo>/releases/latest`

URL estável para o manual da loja (sempre aponta para a última):

```
https://github.com/<owner>/<repo>/releases/latest/download/esticatroca-print-win-x64.zip
```

---

## 5. Publicação manual (sem criar tag)

Útil para gerar um zip de teste sem virar release oficial.

**Via GitHub Actions (recomendado):**

1. Abra *Actions → Release (esticatroca-print) → Run workflow*.
2. Selecione a branch e, opcionalmente, preencha "Versao".
3. Clique em *Run workflow*. O zip fica disponível como **build artifact** por 30 dias (não vira release público).

**Localmente (máquina com Node + VS Build Tools):**

```powershell
cd C:\oneway\esticatroca\esticatroca-print
npm run pack:release
# saida: dist-release\esticatroca-print-vX.Y.Z-win-x64.zip
```

---

## 6. Pós-release: comunicar as lojas

Após o release publicar, avise as lojas com algo como:

> Nova versão do Esticatroca Print disponível (vX.Y.Z).
>
> Para atualizar:
>
> 1. Baixe `https://github.com/<owner>/<repo>/releases/latest/download/esticatroca-print-win-x64.zip`.
> 2. Pare o serviço: abra PowerShell admin e rode `sc.exe stop EsticatrocaPrint`.
> 3. Apague `C:\esticatroca-print\node\`, `node_modules\`, `dist\`, `web\` (mantenha `data\` e `logos\`).
> 4. Extraia o zip novo em `C:\esticatroca-print\`.
> 5. Botão direito em `update.bat` → "Executar como administrador".
>
> Verifique em http://localhost:6442/ se a impressora ainda está cadastrada.

Se o release tiver **breaking change** (ex.: formato de `data.json`), adicione nota de migração nas release notes e instruções no email.

---

## 7. Rollback

Se uma versão quebrar na loja:

1. **Reinstalar a versão anterior**: baixe o zip da release anterior em `https://github.com/<owner>/<repo>/releases`, extraia por cima, rode `update.bat` (ou `install.bat` se o serviço sumiu).
2. **Marcar o release como pre-release** na UI do GitHub para que `/releases/latest/download/...` volte a apontar para a versão estável (o GitHub pula pre-releases no `/latest`).
3. Abrir issue no repo com repro e logs de `C:\esticatroca-print\logs\`.

---

## 8. Problemas comuns do workflow

| Sintoma no Actions | Causa | Correção |
|---|---|---|
| `Resource not accessible by integration` no step de criar release | `Settings → Actions → Workflow permissions` está em "Read only" | Mudar para "Read and write permissions" |
| `npm ci` falha em `@grandchef/node-printer` no runner | Node-gyp / Python / MSBuild faltando no `windows-latest` (raro) | Fixe imagem: `runs-on: windows-2022`. Se persistir, rode local e publique o zip manualmente em *Releases → Edit* |
| `softprops/action-gh-release` erra com 422 | Tag já existia com outro commit | Apague a tag remota (`git push origin :print-vX.Y.Z`) e recrie |
| Zip gerado sem `node_modules/` | `npm ci --omit=dev` falhou silenciosamente no stage | Veja log do step "Pack release"; normalmente é peer dep quebrada |
| `503` ao baixar NSSM no workflow | `nssm.cc` fora do ar (frequente) | J&aacute; mitigado: o bin&aacute;rio est&aacute; comitado em `release/bin/nssm.exe` e o script prioriza ele. Se precisar trocar de vers&atilde;o, veja `release/bin/README.txt`. |

---

## 9. Referências

- Workflow: [.github/workflows/release.yml](.github/workflows/release.yml)
- Empacotador: [scripts/pack-release.ps1](scripts/pack-release.ps1)
- Instaladores: [release/install.bat](release/install.bat), [release/update.bat](release/update.bat), [release/uninstall.bat](release/uninstall.bat)
- Manual da loja: [SETUP-WINDOWS.md](SETUP-WINDOWS.md)
