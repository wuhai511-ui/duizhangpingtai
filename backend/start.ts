import { startServer } from './src/api/index.js';

const port = Number(process.env.PORT) || 3000;
startServer(port).catch(console.error);
