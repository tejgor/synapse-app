import express from 'express';
import { createServer } from 'http';
import handler from './process';
import transcriptHandler from './transcript';

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/api/process', (req, res) => {
  handler(req, res);
});

app.post('/api/transcript', (req, res) => {
  transcriptHandler(req, res);
});

const PORT = process.env.PORT || 8080;
const server = createServer(app);
server.timeout = 180_000; // 3 min safety net — worst case: 150s Supadata retry + 60s Claude
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
