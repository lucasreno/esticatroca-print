Esticatroca Print - Pacote portatil
====================================

Conteudo:
  node\              Node.js 20 portatil (nao altera o PATH do sistema)
  node_modules\      Dependencias ja instaladas (inclui binding nativo)
  dist\              Servico compilado
  web\               UI admin (servida em http://localhost:6442)
  data\              data.json persistido (impressoras cadastradas)
  logos\             Coloque aqui os arquivos de logo usados no recibo
  nssm.exe           Gerenciador de servico (https://nssm.cc)
  install.bat        Instala como servico do Windows
  uninstall.bat      Remove o servico
  update.bat         Reinicia o servico apos trocar os arquivos

INSTALACAO:
  1. Extraia este zip em  C:\esticatroca-print\
  2. Clique com o botao direito em install.bat
     -> "Executar como administrador"
  3. Abra http://localhost:6442/ para cadastrar a impressora

ATUALIZACAO:
  1. Baixe o novo zip.
  2. Pare o servico:  sc stop EsticatrocaPrint
  3. Apague as pastas node\, node_modules\, dist\, web\ (preserva data\ e logos\)
  4. Extraia o novo zip por cima.
  5. Rode update.bat como administrador.

DESINSTALACAO:
  1. Rode uninstall.bat como administrador.
  2. Apague a pasta C:\esticatroca-print\ se desejar.

Logs:
  logs\print-*.log          (aplicacao, rotacao diaria)
  logs\service-stdout.log   (stdout do servico, rotacao 10MB)
  logs\service-stderr.log   (stderr do servico, rotacao 10MB)

Portas:
  6441  WebSocket (usado pelo frontend Angular)
  6442  UI admin (apenas loopback 127.0.0.1)

Suporte:  veja SETUP-WINDOWS.md no repositorio para troubleshooting.
