import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createPrismaTestSchema } from '../../../test-support/disposable-prisma-schema.js';

const API_PORT = 3100;
const WEB_PORT = 3101;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

type ManagedChild = {
  label: string;
  process: ChildProcess;
};

const children: ManagedChild[] = [];
let disposeSchema: (() => Promise<void>) | null = null;
let shuttingDown = false;

function spawnProcess(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): ManagedChild {
  const child = spawn(command, args, {
    env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(
        `[playwright-stack] ${label} exited with code ${code ?? 'null'} signal ${signal ?? 'none'}.`,
      );
      void shutdown(1);
    }
  });

  return {
    label,
    process: child,
  };
}

async function runCommand(
  label: string,
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) {
  const child = spawn(command, args, {
    env,
    stdio: 'inherit',
  });

  const [code, signal] = (await once(child, 'exit')) as [
    number | null,
    NodeJS.Signals | null,
  ];
  if (code !== 0) {
    throw new Error(
      `${label} exited with code ${code ?? 'null'} signal ${signal ?? 'none'}.`,
    );
  }
}

async function waitForUrl(url: string, label: string) {
  const startedAt = Date.now();
  let lastStatus: number | null = null;
  let lastError: string | null = null;

  while (Date.now() - startedAt < 120_000) {
    try {
      const response = await fetch(url, { method: 'GET' });
      lastStatus = response.status;
      lastError = null;
      if (response.ok || response.status < 500) {
        return;
      }
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : 'Unknown fetch error.';
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `${label} did not become ready at ${url}. Last status: ${lastStatus ?? 'none'}. Last error: ${lastError ?? 'none'}.`,
  );
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (child.process.exitCode === null && !child.process.killed) {
      child.process.kill('SIGTERM');
    }
  }

  await Promise.all(
    children.map(async (child) => {
      if (child.process.exitCode !== null) {
        return;
      }

      await Promise.race([
        once(child.process, 'exit'),
        new Promise((resolve) => setTimeout(resolve, 10_000)),
      ]);

      if (child.process.exitCode === null && !child.process.killed) {
        child.process.kill('SIGKILL');
        await once(child.process, 'exit').catch(() => undefined);
      }
    }),
  );

  children.length = 0;

  if (disposeSchema) {
    await disposeSchema();
    disposeSchema = null;
  }

  process.exit(exitCode);
}

async function main() {
  const schema = await createPrismaTestSchema('playwright');
  disposeSchema = async () => schema.dispose();

  const sharedEnv = {
    ...process.env,
    DATABASE_URL: schema.databaseUrl,
    AUTH_MODE: 'local',
    API_ALLOWED_ORIGINS: `${WEB_URL},http://localhost:${WEB_PORT}`,
    LOCAL_DEV_OWNER_ID: 'local-dev',
  };

  await runCommand(
    'api build',
    'pnpm',
    ['--filter', 'api', 'build'],
    sharedEnv,
  );

  children.push(
    spawnProcess(
      'api',
      'pnpm',
      ['--filter', 'api', 'exec', 'node', 'dist/main'],
      {
        ...sharedEnv,
        PORT: String(API_PORT),
      },
    ),
  );

  await waitForUrl(`${API_URL}/health`, 'API');

  children.push(
    spawnProcess(
      'web',
      'pnpm',
      [
        '--filter',
        'web',
        'exec',
        'next',
        'dev',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(WEB_PORT),
      ],
      {
        ...sharedEnv,
        NEXT_DIST_DIR: '.next-playwright',
        NEXT_PUBLIC_API_URL: API_URL,
      },
    ),
  );

  await waitForUrl(WEB_URL, 'Web app');
  console.log('[playwright-stack] Isolated stack is ready.');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(0);
  });
}

process.on('uncaughtException', (error) => {
  console.error(error);
  void shutdown(1);
});

process.on('unhandledRejection', (error) => {
  console.error(error);
  void shutdown(1);
});

void main().catch((error) => {
  console.error(error);
  void shutdown(1);
});
