// start-server.js
// Production startup script
import { startServer } from './dist/api/index.js';

const port = Number(process.env.PORT) || 3000;
startServer(port).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
