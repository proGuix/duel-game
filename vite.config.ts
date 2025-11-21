// @ts-nocheck
/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const behaviorsFile = path.resolve(projectRoot, 'enemy-behaviors.json');

function ensureBehaviorFile() {
  if (fs.existsSync(behaviorsFile)) return;
  fs.writeFileSync(behaviorsFile, '[]', 'utf-8');
}

function readBehaviorFile() {
  ensureBehaviorFile();
  return fs.readFileSync(behaviorsFile, 'utf-8');
}

function writeBehaviorFile(payload: string) {
  ensureBehaviorFile();
  fs.writeFileSync(behaviorsFile, payload, 'utf-8');
}

async function readRequestBody(req: import('node:http').IncomingMessage): Promise<string> {
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default defineConfig({
  root: projectRoot,
  plugins: [
    {
      name: 'bt-behavior-api',
      configureServer(server) {
        ensureBehaviorFile();
        server.watcher.unwatch(behaviorsFile);
        server.middlewares.use('/api/behaviors', async (req, res, next) => {
          if (!req.url) return next();
          if (req.method === 'GET') {
            try {
              const json = readBehaviorFile();
              res.setHeader('Content-Type', 'application/json');
              res.end(json);
              return;
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
              return;
            }
          }
          if (req.method === 'POST') {
            try {
              const body = await readRequestBody(req);
              writeBehaviorFile(body);
              res.statusCode = 204;
              res.end();
              return;
            } catch (err) {
              res.statusCode = 500;
              res.end(String(err));
              return;
            }
          }
          next();
        });
      },
      generateBundle() {
        ensureBehaviorFile();
        this.emitFile({
          type: 'asset',
          fileName: 'enemy-behaviors.json',
          source: readBehaviorFile()
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(projectRoot, 'index.html'),
        editor: path.resolve(projectRoot, 'editor.html')
      }
    }
  },
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@game': fileURLToPath(new URL('./src/game', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@types': fileURLToPath(new URL('./src/types.ts', import.meta.url)),
      '@ai': fileURLToPath(new URL('./src/game/ai', import.meta.url))
    }
  }
});
