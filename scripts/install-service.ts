/* eslint-disable @typescript-eslint/no-var-requires */
// Installs esticatroca-print as a Windows service using node-windows.
// Run once with admin privileges: `npm run service:install`.
import path from 'node:path';

function main() {
  const { Service } = require('node-windows');

  const svc = new Service({
    name: 'Esticatroca Print',
    description:
      'Servico local de impressao ESC/POS do Esticatroca. Expoe WebSocket em ws://localhost:6441 e UI admin em http://localhost:6442.',
    script: path.resolve(__dirname, '..', 'server.js'),
    nodeOptions: [],
    // Auto-restart behavior
    wait: 2,
    grow: 0.5,
    maxRestarts: 60,
    env: [
      { name: 'NODE_ENV', value: 'production' },
      { name: 'PRINT_LOG_LEVEL', value: 'info' },
    ],
  });

  svc.on('install', () => {
    console.log('Servico instalado. Iniciando...');
    svc.start();
  });
  svc.on('start', () => console.log('Servico iniciado.'));
  svc.on('alreadyinstalled', () => console.log('Servico ja estava instalado.'));
  svc.on('error', (err: Error) => console.error('Erro:', err.message));

  svc.install();
}

main();
