NSSM (Non-Sucking Service Manager) - binario comitado no repositorio
====================================================================

Arquivo: nssm.exe (win64)
Versao:  2.24-101-g897c7ad
SHA-256: eee9c44c29c2be011f1f1e43bb8c3fca888cb81053022ec5a0060035de16d848
Tamanho: 368.640 bytes
Licenca: Public Domain (veja https://nssm.cc/license)

Por que esta comitado?
----------------------
O site oficial https://nssm.cc fica 503 com frequencia (sem CDN, servidor
antigo). Commitar o binario garante que `scripts/pack-release.ps1` e o
workflow do GitHub Actions consigam gerar releases mesmo com o site fora
do ar. O script prioriza este arquivo; so faz download se ele nao existir.

Como atualizar
--------------
Para trocar por uma versao nova do NSSM, baixe o zip oficial:

  https://nssm.cc/release/nssm-<versao>.zip

extraia e copie o `win64\nssm.exe` para este diretorio, atualizando este
README com o novo hash:

  Get-FileHash -Algorithm SHA256 nssm.exe

Este binario nao cria dependencia de runtime nem de build: eh apenas
empacotado dentro do zip final que vai para cada maquina da loja.
