import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import express from 'express';

import { createSafeAssistantResponse, validateAssistantRequest } from './assistant.js';

export const app = express();

const allowedOrigins = new Set([
  'http://localhost:8081',
  ...(process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
]);

app.use((request, response, next) => {
  const origin = request.get('Origin');
  if (!origin || !allowedOrigins.has(origin)) {
    next();
    return;
  }

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json({ limit: '16kb' }));

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/assistant', (request, response) => {
  const validation = validateAssistantRequest(request.body);
  if (!validation.valid) {
    response.status(400).json({ error: validation.error });
    return;
  }

  response.json(createSafeAssistantResponse(validation.message, validation.locale));
});

app.use((error, _request, response, next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    response.status(400).json({ error: 'Request body must be valid JSON.' });
    return;
  }

  next(error);
});

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, '0.0.0.0', () => {
    console.info(`Assistant API listening on port ${port}`);
  });
}
