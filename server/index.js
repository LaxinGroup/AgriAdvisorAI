import 'dotenv/config';

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import express from 'express';
import multer from 'multer';

import { createAssistantResponse, validateAssistantRequest } from './assistant.js';
import { createAuthentication, createCuratorAuthorization } from './auth.js';
import { sourceRepository } from './database.js';
import { SourceIngestionError, createSourceIngestion } from './source-ingestion.js';

const PROFILE_LANGUAGES = new Set(['en', 'afr', 'es', 'fr']);

function validateProfileRequest(body) {
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  if (displayName.length < 1 || displayName.length > 100) {
    return { valid: false, error: 'Display name must be 1 to 100 characters.' };
  }
  if (!PROFILE_LANGUAGES.has(body?.preferredLanguage)) {
    return { valid: false, error: 'Preferred language must be en, afr, es, or fr.' };
  }
  return { valid: true, displayName, preferredLanguage: body.preferredLanguage };
}

export function createApp({
  authUrl,
  verifyToken,
  repository = sourceRepository,
  ingestion,
} = {}) {
  const app = express();
  const authenticate = createAuthentication({ authUrl, verifyToken });
  const requireCurator = createCuratorAuthorization((userId) => repository.isCurator(userId));
  const sourceIngestion = ingestion ?? createSourceIngestion({ repository });
  const uploadPdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }).single('file');
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
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (request.method === 'OPTIONS') {
      response.sendStatus(204);
      return;
    }

    next();
  });

  app.use(express.json({ limit: '128kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.post('/api/assistant', authenticate, async (request, response) => {
    const validation = validateAssistantRequest(request.body);
    if (!validation.valid) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const matches = await repository.searchSources(validation.message, 4);
    response.json(createAssistantResponse(validation.message, validation.locale, matches));
  });

  app.post('/api/profile', authenticate, async (request, response) => {
    const validation = validateProfileRequest(request.body);
    if (!validation.valid) {
      response.status(400).json({ error: validation.error });
      return;
    }

    const profile = await repository.upsertProfile(
      request.auth.userId,
      validation.displayName,
      validation.preferredLanguage,
    );
    response.json({
      profile: {
        displayName: profile.display_name,
        preferredLanguage: profile.preferred_language,
      },
    });
  });

  app.get('/api/sources', authenticate, async (request, response) => {
    const [sources, canManage] = await Promise.all([
      sourceIngestion.list(),
      repository.isCurator(request.auth.userId),
    ]);
    response.json({ sources, canManage });
  });

  app.post('/api/sources', authenticate, requireCurator, (request, response, next) => {
    uploadPdf(request, response, (error) => {
      if (error) {
        next(error);
        return;
      }

      sourceIngestion.ingest({
        body: request.body,
        file: request.file,
        userId: request.auth.userId,
      }).then((source) => response.status(201).json({ source })).catch(next);
    });
  });

  app.patch('/api/sources/:id', authenticate, requireCurator, async (request, response) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.params.id)) {
      response.status(400).json({ error: 'The source ID is invalid.' });
      return;
    }

    const updated = await sourceIngestion.rename(request.params.id, request.body?.title);
    if (!updated) {
      response.status(404).json({ error: 'The source was not found.' });
      return;
    }
    response.json({ success: true });
  });

  app.delete('/api/sources/:id', authenticate, requireCurator, async (request, response) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.params.id)) {
      response.status(400).json({ error: 'The source ID is invalid.' });
      return;
    }

    const deleted = await sourceIngestion.remove(request.params.id);
    if (!deleted) {
      response.status(404).json({ error: 'The source was not found.' });
      return;
    }
    response.sendStatus(204);
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      response.status(400).json({ error: 'Request body must be valid JSON.' });
      return;
    }
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      response.status(413).json({ error: 'PDF files must be 10 MB or smaller.' });
      return;
    }
    if (error instanceof multer.MulterError) {
      response.status(400).json({ error: 'The PDF upload could not be processed.' });
      return;
    }
    if (error instanceof SourceIngestionError) {
      response.status(error.status).json({ error: error.message });
      return;
    }

    console.error('Unhandled API request error.', error);
    response.status(500).json({ error: 'The server could not complete the request.' });
  });

  return app;
}

export const app = createApp();

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
  const port = Number(process.env.PORT ?? 3000);
  app.listen(port, '0.0.0.0', () => {
    console.info(`Assistant API listening on port ${port}`);
  });
}
