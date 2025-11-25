import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { BotOrchestrator } from '../bot/orchestrator.js';
import { logger } from '../utils/logger.js';
import { BotState } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let orchestrator: BotOrchestrator | null = null;

// Initialize orchestrator
app.post('/api/init', async (req, res) => {
  try {
    orchestrator = new BotOrchestrator();
    await orchestrator.initialize();
    res.json({ success: true, message: 'Orchestrator initialized' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start bot execution
app.post('/api/start', async (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(400).json({ success: false, error: 'Orchestrator not initialized' });
    }

    const tokenConfig = req.body;
    orchestrator.execute(tokenConfig).catch((error) => {
      logger.error(`Bot execution error: ${error}`);
      broadcast({ type: 'error', message: error.message });
    });

    res.json({ success: true, message: 'Bot started' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get bot state
app.get('/api/state', (req, res) => {
  if (!orchestrator) {
    return res.json({ phase: 'idle' });
  }

  const state = orchestrator.getState();
  res.json(state);
});

// Trigger recovery
app.post('/api/recovery', async (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(400).json({ success: false, error: 'Orchestrator not initialized' });
    }

    const expectedDemand = req.body.expectedDemand || 0;
    await orchestrator.triggerRecovery(expectedDemand);
    res.json({ success: true, message: 'Recovery triggered' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop bot
app.post('/api/stop', async (req, res) => {
  try {
    if (!orchestrator) {
      return res.status(400).json({ success: false, error: 'Orchestrator not initialized' });
    }

    await orchestrator.stop();
    res.json({ success: true, message: 'Bot stopped' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// WebSocket for real-time updates
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}

// Broadcast state updates periodically
setInterval(() => {
  if (orchestrator) {
    const state = orchestrator.getState();
    broadcast({ type: 'state', data: state });
  }
}, 5000);

wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`GUI server running on http://localhost:${PORT}`);
});

