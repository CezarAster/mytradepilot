// Entry point: `npm start` (or `node src/server/main.ts`). Needs Node 22.18+ (type stripping) or 24.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigStore, dataDir } from './config.ts';
import { RefereeHttp } from './http.ts';
import { Logger } from './log.ts';
import { Referee, VERSION } from './referee.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes('--help') || args.includes('-h')) {
  console.log(`MyTradePilot Referee ${VERSION}
Usage: node src/server/main.ts [--port 4242] [--data-dir ~/.mytradepilot] [--verbose]
Environment: APCA_API_KEY_ID, APCA_API_SECRET_KEY, ALPACA_MODE=paper|live, MYTRADEPILOT_HOME, PORT`);
  process.exit(0);
}
if (flag('--data-dir')) process.env.MYTRADEPILOT_HOME = flag('--data-dir');
if (flag('--port')) process.env.PORT = flag('--port');

const here = dirname(fileURLToPath(import.meta.url));
const staticDir = join(here, '..', '..', 'dist-app');
const log = new Logger(dataDir(), args.includes('--verbose') ? 'debug' : 'info');

async function main(): Promise<void> {
  const config = new ConfigStore();
  const referee = new Referee({ config, log });
  await referee.start();
  const http = new RefereeHttp(referee, { port: config.get().port, staticDir: existsSync(staticDir) ? staticDir : null, log });
  const port = await http.listen();
  log.info(`MyTradePilot Referee ${VERSION} listening on http://127.0.0.1:${port}${existsSync(staticDir) ? '' : ' (UI not built: run npm run build:app)'}`);
  const enf = config.get().enforcement;
  log.info(`enforcement ${enf.enabled ? (enf.dryRun ? 'on, DRY RUN (nothing is sent to the broker)' : 'ON, LIVE: breaches are flattened') : 'off'}`);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    log.info(`${signal}: shutting down`);
    await http.close();
    await referee.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => log.error('uncaught exception', err));
  process.on('unhandledRejection', (err) => log.error('unhandled rejection', err));
}

main().catch((err) => {
  log.error('failed to start', err);
  process.exit(1);
});
