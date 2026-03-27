import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import handler from './process';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/api/process', (req, res) => {
  handler(req as any, res as any);
});

const PORT = process.env.PORT || 3000;
const server = createServer(app);
server.listen(PORT, () => {
  console.log(`Dev server running on http://localhost:${PORT}`);
});
