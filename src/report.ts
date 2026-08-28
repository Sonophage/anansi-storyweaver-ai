// Reporting a bug from inside the app.
//
// Filed with the `gh` CLI rather than an HTTP call, for the same reason the router is driven with
// `systemctl`: the credential stays where it already lives. Anansi holds no token, learns nothing
// about GitHub, and an operator who revokes `gh` revokes this. execFile with an argument array, so
// there is no shell for a bug report to reach.
//
// What this exists to fix is not typing. Every round of bug reports so far has cost a round trip
// establishing which build was running — round three's reports "started with a server older than
// HEAD" — and no writer should have to know that. The report carries it.
//
// WHAT IT DOES NOT CARRY: the prose. Not a passage, not a premise, not an entry body. The story is
// named by id and nothing else, because a bug report is not a reason for somebody's book to leave
// the machine. `test/report.ts` asserts that against a fixture full of prose.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const REPO = process.env.ANANSI_REPO ?? 'Sonophage/anansi-storyweaver-ai';

export interface BugContext {
  said: string;
  who: string;                     // the account, so a second writer's report is attributable
  storyId?: string | null;
  chapterIndex?: number | null;
  agent?: string | null;           // the browser's own words, for a phone-only bug
  model?: string | null;
  slot?: { global: number; slots: number; perSlot: number } | null;
  lastError?: string | null;
}

/** git facts about the build that is actually running, or nulls if this is not a checkout. */
export async function build(): Promise<{ head: string | null; subject: string | null;
                                        committed: number | null; dirty: boolean | null }> {
  const at = new URL('..', import.meta.url).pathname;
  const git = async (args: string[]) =>
    (await run('git', args, { cwd: at, timeout: 4000 })).stdout.trim();
  try {
    const [head, subject, iso, status] = await Promise.all([
      git(['rev-parse', '--short', 'HEAD']),
      git(['log', '-1', '--format=%s']),
      git(['log', '-1', '--format=%cI']),
      git(['status', '--porcelain']),
    ]);
    return { head, subject, committed: Date.parse(iso), dirty: status.length > 0 };
  } catch { return { head: null, subject: null, committed: null, dirty: null }; }
}

/** The commits themselves, newest first: subject and body, for the release notes to be written FROM.
 *
 *  Raw material, not the notes. Anansi turns these into something a writer can read — the two are
 *  kept apart so the generated half can be regenerated without going back to git, and so this can
 *  be tested without a model.
 *
 *  `%x00` between fields and `%x01` between commits: a commit body contains blank lines, bullet
 *  lists and prose, so any newline-based delimiter splits a message in half. NUL and SOH cannot
 *  appear in a commit message. */
export async function commits(o: { since?: string | null; days?: number; limit?: number } = {}):
    Promise<{ sha: string; subject: string; body: string; at: number }[]> {
  const at = new URL('..', import.meta.url).pathname;
  // SINCE A COMMIT once there is one, and a window of days before that. The notes accumulate, so
  // each run only has to read what has happened since the last run read anything — and the first
  // run has no previous sha, so it takes a window wide enough to cover the work already done.
  //
  // `since` is passed as `<sha>..HEAD` rather than as `--since`, because a commit range is exact
  // where a date is a guess about clocks. It is validated as a short sha here and never reaches a
  // shell — `run` takes an argument array — but a range built from a stored value is still a value
  // reaching git, so it is checked rather than trusted.
  const safe = typeof o.since === 'string' && /^[0-9a-f]{6,40}$/i.test(o.since) ? o.since : null;
  const args = ['log', '--no-merges', '--format=%h%x00%s%x00%cI%x00%b%x01',
    `-${Math.max(1, Math.min(200, o.limit ?? 60))}`];
  if (safe) args.push(`${safe}..HEAD`);
  else args.push(`--since=${Math.max(1, Math.min(60, o.days ?? 3))} days ago`);
  try {
    const { stdout } = await run('git', args, { cwd: at, timeout: 8000 });
    return stdout.split('\x01').map((chunk) => chunk.trim()).filter(Boolean).map((chunk) => {
      const [sha, subject, iso, ...rest] = chunk.split('\x00');
      return { sha, subject, at: Date.parse(iso), body: rest.join('\x00').trim() };
    }).filter((c) => c.sha && c.subject);
  } catch { return []; }
}

/** The report, as markdown. Pure: everything it knows arrives as arguments, so a test can read the
 *  whole thing without a git checkout, a browser or a network. */
export function compose(c: BugContext, b: Awaited<ReturnType<typeof build>>, startedAt: number): string {
  const when = (t: number) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
  // The line that pays for this feature. A server older than the commit it is being judged against
  // has cost a round trip on every round of reports so far, and the writer cannot be expected to
  // know it — so the report says it rather than asking.
  const stale = b.committed != null && b.committed > startedAt;
  return [
    c.said.trim(),
    '',
    '---',
    '',
    `| | |`,
    `|---|---|`,
    `| reported by | \`${c.who}\` |`,
    `| build | ${b.head ? `\`${b.head}\` — ${b.subject}` : 'not a checkout'}${b.dirty ? ' **(uncommitted changes in the tree)**' : ''} |`,
    `| server started | ${when(startedAt)} |`,
    // null for "leave this row out", never '' — an empty string is a blank LINE here, and markdown
    // needs one before the table. Filtering '' as a skip marker collapsed the whole report into one
    // paragraph with an unrendered table in it.
    b.committed != null ? `| HEAD committed | ${when(b.committed)} |` : null,
    stale ? '| **stale server** | **HEAD is newer than the running server — this report may be against code that is not loaded** |' : null,
    c.model ? `| model | \`${c.model}\` |` : null,
    c.slot ? `| context | ${c.slot.global} / ${c.slot.slots} slots = ${c.slot.perSlot} per slot |` : null,
    c.storyId ? `| story | \`${c.storyId}\`${c.chapterIndex != null ? `, chapter ${c.chapterIndex}` : ''} |` : null,
    c.agent ? `| surface | ${c.agent} |` : null,
    c.lastError ? `| last error on screen | \`${c.lastError}\` |` : null,
    '',
    '<sub>Filed from inside Anansi. No prose, premise or ledger text is included — the story is named',
    'by id only.</sub>',
  ].filter((l) => l !== null).join('\n');
}

/** File it. Returns the issue url, or the composed body so nothing a writer typed is lost when
 *  `gh` is missing, unauthenticated or offline. */
/** The runner, injectable so a test can assert the argv without filing anything. It is not a nicety:
 *  the first version of test/report.ts passed a fake to a function that did not take one, the real
 *  gh ran, and it opened a real issue on the repo. */
export type Exec = (cmd: string, args: string[], opts?: any) => Promise<{ stdout: string }>;

export async function fileBug(c: BugContext, exec: Exec = run as any):
    Promise<{ url?: string; body: string; error?: string }> {
  const said = String(c.said ?? '').trim();
  if (!said) return { body: '', error: 'say what went wrong first' };
  const b = await build();
  const body = compose({ ...c, said }, b, Date.now() - process.uptime() * 1000);
  // First line as the title, trimmed — a title is a title, and a paragraph in the list of issues
  // is unreadable.
  const title = said.split('\n')[0].slice(0, 90) + (said.split('\n')[0].length > 90 ? '…' : '');
  try {
    const { stdout } = await exec('gh', ['issue', 'create', '--repo', REPO,
      '--title', title, '--body', body, '--label', 'from-the-app'], { timeout: 20_000 });
    const url = stdout.trim().split('\n').pop() ?? '';
    return { url, body };
  } catch (e: any) {
    // The label is the likeliest failure and it is not worth losing a report over: retry once
    // without it. `gh` refuses a label that does not exist on the repo.
    try {
      const { stdout } = await exec('gh', ['issue', 'create', '--repo', REPO,
        '--title', title, '--body', body], { timeout: 20_000 });
      return { url: stdout.trim().split('\n').pop() ?? '', body };
    } catch (e2: any) {
      return { body, error: (e2?.stderr || e2?.message || String(e2)).trim().slice(0, 300) };
    }
  }
}
