/* eslint-disable @typescript-eslint/no-var-requires */
import path from 'node:path';

function main() {
  const { Service } = require('node-windows');

  const svc = new Service({
    name: 'Esticatroca Print',
    script: path.resolve(__dirname, '..', 'server.js'),
  });

  svc.on('uninstall', () => console.log('Servico desinstalado.'));
  svc.on('error', (err: Error) => console.error('Erro:', err.message));

  svc.uninstall();
}

main();
