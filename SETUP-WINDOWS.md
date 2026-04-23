# SETUP-WINDOWS.md

Roteiro passo-a-passo para instalar o **Esticatroca Print** em uma esta&ccedil;&atilde;o Windows (loja ou backoffice) que ter&aacute; a impressora ESC/POS conectada.

> Todo o roteiro sup&otilde;e o caminho `C:\esticatroca-print\`. Ajuste se for diferente.

---

## 1. Pr&eacute;-requisitos

### 1.1 Windows

- Windows 10 (64-bit) ou superior.
- Usu&aacute;rio com permiss&atilde;o de administrador.

### 1.2 Node.js 20 LTS

Baixe em [nodejs.org](https://nodejs.org/) (instalador MSI x64, "LTS"). Confirme:

```powershell
node -v   # v20.x.x
npm -v
```

### 1.3 Build tools (apenas se o `npm install` falhar em m&oacute;dulos nativos)

O pacote [`@grandchef/node-printer`](https://www.npmjs.com/package/@grandchef/node-printer) compila c&oacute;digo nativo. Caso precise:

```powershell
npm install --global --production windows-build-tools
# alternativa moderna: instale "Desktop development with C++" pelo Visual Studio Installer.
```

### 1.4 Impressora

- **Opcao A (recomendada)**: impressora com IP pr&oacute;prio (Ethernet). Descubra o IP no painel da pr&oacute;pria impressora.
- **Opcao B**: impressora USB instalada localmente. Abra `Configura&ccedil;&otilde;es &rarr; Impressoras e scanners` e **anote o nome exato** (ex: `Bematech MP-100S TH`). **N&atilde;o** use compartilhamento SMB — este servi&ccedil;o fala com a impressora **diretamente pelo nome**.

---

## 2. Obter o c&oacute;digo

```powershell
cd C:\
git clone <URL-DO-REPO> esticatroca-print
cd esticatroca-print
```

Se n&atilde;o houver Git no PC, copie a pasta manualmente.

---

## 3. Instalar depend&ecirc;ncias e compilar

```powershell
npm ci
npm run build
```

- `npm ci` instala exatamente o `package-lock.json`.
- `npm run build` gera `dist/` a partir de `src/`.

---

## 4. Primeiro start (modo teste, sem servi&ccedil;o)

```powershell
npm start
```

- Deve imprimir `WebSocket de impressao escutando` e `Admin HTTP escutando`.
- Abra `http://localhost:6442/` no navegador.
- Se n&atilde;o houver erros, pare com `Ctrl+C`.

---

## 5. Configurar a impressora via UI

1. Abra `http://localhost:6442/`.
2. Clique **"Atualizar lista"** para ver as impressoras instaladas no Windows.
3. Clique **"Adicionar"** na impressora desejada.
4. **Alternativa TCP/IP**: expanda "Adicionar impressora de rede" e informe IP/porta (padr&atilde;o 9100).
5. Em "Impressoras configuradas", clique **"Testar impress&atilde;o"**. Deve sair um cupom com cabe&ccedil;alho `== TESTE DE IMPRESSAO ==`.
6. Marque como **"Padr&atilde;o de recibos"** e (se aplic&aacute;vel) **"Usar para volumes"**.

Tudo fica persistido em `data\data.json`.

---

## 6. Instalar como servi&ccedil;o do Windows (com auto-restart)

Execute o PowerShell **como administrador**:

```powershell
cd C:\esticatroca-print
npm run service:install
```

Isso usa [`node-windows`](https://github.com/coreybutler/node-windows) para criar um servi&ccedil;o chamado **"Esticatroca Print"** que:

- Inicia automaticamente com o Windows.
- Reinicia ap&oacute;s crash (at&eacute; 60 reinicia&ccedil;&otilde;es com backoff).
- Roda em background sem janela de console.

Confirme no `services.msc`:

- **Nome**: Esticatroca Print
- **Status**: In Execu&ccedil;&atilde;o (Running)
- **Tipo de Inicializa&ccedil;&atilde;o**: Autom&aacute;tico (Automatic)

Para remover:

```powershell
npm run service:uninstall
```

---

## 7. Liberar o firewall (apenas se necess&aacute;rio)

O servi&ccedil;o ouve em `127.0.0.1` (admin) e `0.0.0.0` (WebSocket). Se o frontend rodar **na mesma m&aacute;quina**, nada a fazer. Se rodar em outra m&aacute;quina da rede local:

```powershell
New-NetFirewallRule -DisplayName "Esticatroca Print WS" -Direction Inbound `
  -Protocol TCP -LocalPort 6441 -Action Allow -Profile Private
```

> **Nunca** exponha as portas 6441/6442 a redes p&uacute;blicas ou internet. N&atilde;o h&aacute; autentica&ccedil;&atilde;o.

---

## 8. Configurar o frontend Angular

Em [../esticatroca-web/src/environments/environment.ts](../esticatroca-web/src/environments/environment.ts), garanta que o host WebSocket aponte para `localhost:6441` (j&aacute; &eacute; o padr&atilde;o em `impressao.service.ts`). O contrato &eacute; compat&iacute;vel: **nada precisa ser alterado no frontend**.

---

## 9. Rotinas operacionais

### 9.1 Impressora parou de imprimir

Antes de reiniciar o PC, tente em ordem:

1. Abra `http://localhost:6442/` e clique **"Checar conex&atilde;o"** na impressora.
2. Clique **"Reiniciar Spooler do Windows"** no topo da p&aacute;gina.
3. Se persistir, reinicie o servi&ccedil;o:
   ```powershell
   Restart-Service "Esticatroca Print"
   ```
4. S&oacute; em &uacute;ltimo caso, reinicie o PC.

### 9.2 Ver logs

```powershell
Get-Content C:\esticatroca-print\logs\print-*.log -Tail 100 -Wait
```

Logs rotacionam automaticamente (10 MB ou 1 arquivo por dia, mantendo 14 dias).

### 9.3 Atualizar o servi&ccedil;o

```powershell
cd C:\esticatroca-print
git pull            # ou copie a nova versao
npm ci
npm run build
Restart-Service "Esticatroca Print"
```

---

## 10. Solu&ccedil;&atilde;o de problemas

| Sintoma | Causa prov&aacute;vel | A&ccedil;&atilde;o |
|---|---|---|
| `npm ci` falha em `@grandchef/node-printer` | Build tools faltando | Instale VS Build Tools (se&ccedil;&atilde;o 1.3) |
| UI abre mas impressora n&atilde;o aparece | Driver n&atilde;o instalado | Instale driver e reinicie o servi&ccedil;o |
| `Timeout de 15000ms excedido` | Impressora offline/sem papel | Verifique impressora; clique "Reiniciar Spooler" |
| `EADDRINUSE :6441` | Outro processo usando a porta | Identifique e encerre o processo concorrente |
| Sem som de impress&atilde;o em cen&aacute;rios antigos | Frontend enviando `type` desconhecido | Ver log; novo tipo precisa ser implementado em `ws-server.ts` |

---

Qualquer d&uacute;vida, consulte [README.md](README.md) e [AGENTS.md](AGENTS.md).
