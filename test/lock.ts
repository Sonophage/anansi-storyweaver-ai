// ONE TEST RUN AT A TIME, ON THE WHOLE MACHINE, and the run that arrives second WAITS for its turn.
//
// The suites write fixed paths under /tmp (`/tmp/anansi-scope.db` and its siblings) and `scope.ts`
// binds fixed ports. Two checkouts of this repo running them at once — parallel worktrees, a
// pre-commit hook beside an agent's run — overwrite each other's databases and fight for the
// ports, and the loser reports failures the code does not have. 2026-10-14: three agents in three
// worktrees had to be handed a lock by hand, and the wait loops they wrote around it ran for hours.
//
// `serialise()` re-runs this same process under `flock` and exits with its status. The child sees
// ANANSI_TEST_LOCKED and runs normally, as does every suite `all.ts` spawns, so a nested call never
// waits on the lock its own parent holds.
import { spawnSync } from 'node:child_process';

export const LOCK = '/tmp/anansi-tests.lock';

export function serialise(): void {
  if (process.env.ANANSI_TEST_LOCKED) return;
  const r = spawnSync('flock', [LOCK, process.execPath, ...process.execArgv, ...process.argv.slice(1)],
    { stdio: 'inherit', env: { ...process.env, ANANSI_TEST_LOCKED: '1' } });
  process.exit(r.status ?? 1);
}
