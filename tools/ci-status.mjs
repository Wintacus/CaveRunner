/**
 * Compact CI status. Exists to keep a coding agent's context small.
 *
 * The GitHub MCP tools return the *whole* run or job object — 30-60KB of JSON for a
 * question whose answer is "green". An agent that polls a deploy five times has spent
 * a quarter of a megabyte of context to learn five booleans, and in one session that was
 * measurably the single largest source of waste.
 *
 * The fix is not to fetch less; it is to filter before it reaches the transcript. curl
 * downloads the same 30KB here, but only the handful of lines this prints ever costs
 * anything. Same information, roughly a thousandth of the context.
 *
 * Usage:
 *   node tools/ci-status.mjs            latest run, one line
 *   node tools/ci-status.mjs --watch    poll until it finishes, then print one line
 *   node tools/ci-status.mjs --jobs     add per-job status (only useful when red)
 *
 * Unauthenticated works fine on a public repo (60 requests/hour). GITHUB_TOKEN is used if
 * it happens to be set.
 */
const REPO = process.env.CI_REPO || 'Wintacus/CaveRunner';
const API = `https://api.github.com/repos/${REPO}`;
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const wantJobs = args.includes('--jobs');

const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();

/**
 * Via curl rather than `fetch`, because in this sandbox outbound HTTPS goes through an
 * agent proxy that curl honours and Node's undici does not without an experimental flag —
 * which reaches the proxy and then 502s. curl is the boring option that works.
 *
 * GitHub's edge also throws the occasional genuine 502, so: three tries.
 */
async function get(url) {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const curlArgs = ['-sS', '--fail', '-H', 'Accept: application/vnd.github+json'];
  if (token) curlArgs.push('-H', `Authorization: Bearer ${token}`);
  for (let i = 0; i < 3; i++) {
    try {
      const { stdout } = await run('curl', [...curlArgs, url], { maxBuffer: 32 * 1024 * 1024 });
      return JSON.parse(stdout);
    } catch {
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`GitHub API unreachable: ${url}`);
}

const latest = async () => (await get(`${API}/actions/runs?per_page=1`)).workflow_runs[0];

async function jobLines(runId) {
  const { jobs } = await get(`${API}/actions/runs/${runId}/jobs`);
  return jobs.map((j) => {
    const failed = (j.steps || []).find((s) => s.conclusion === 'failure');
    return `    ${j.name}: ${j.conclusion || j.status}${failed ? ` (failed at "${failed.name}")` : ''}`;
  });
}

let run = await latest();

if (watch) {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (run.status !== 'completed' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15000));
    run = await latest();
  }
}

const age = Math.round((Date.now() - new Date(run.created_at)) / 1000);
console.log(`${run.status}/${run.conclusion ?? '-'}  run ${run.id}  ${run.head_branch}  ${age}s ago`);

// Job detail only when it is actually informative: a red run, or explicitly asked for.
if (wantJobs || run.conclusion === 'failure') {
  for (const line of await jobLines(run.id)) console.log(line);
}
