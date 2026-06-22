# Upload BDP to GitHub — Spec

> Scope: Initial import of `/home/herick/Documents/freebuff/bdp` into a brand-new
> GitHub repository at `ErChulo/bdp-personal-db`, followed by a single direct
> push to `main`. No code changes. No PR. No follow-up GitHub-side setup.

## 1. Goal

Bring the local BDP project into its public GitHub home in one shot so that:

- `git log` on the remote starts with a clean
  `Initial commit: BDP personal database import` commit, authored by
  `herick <herickleninlopezcardona@gmail.com>` and **SSH-signed** by the
  local ed25519 key (so GitHub UI shows a "Verified" badge once the
  matching public key is registered with the Signing key type).
- All 67 source files (excluding `node_modules/`, `dist/`, and the local
  `.git/` that will be created during the run) are versioned.
- The BDP CI workflow (`.github/workflows/ci.yml`) and Dependabot config
  (`.github/dependabot.yml`) ride along in the single commit, ready to gate
  future PRs.
- The README CI badge (already pointing at
  `github.com/ErChulo/bdp-personal-db/actions/workflows/ci.yml`) resolves
  against real workflow history immediately after push.
- Because `ErChulo/bdp-personal-db` is **not empty** (verified via
  unauthenticated REST `GET /repos/ErChulo/bdp-personal-db` on 2026-06-21:
  HTTP 200, `default_branch: main`, last `pushed_at: 2026-06-21T22:39:24Z`,
  owner.login `ErChulo`, public), the push is an **overwrite** of remote
  `main`, not a first-time upload. We use `--force-with-lease` for safety;
  the pre-push `fetch` in §4 step 8 guarantees we only clobber state we
  have actually raced against, not state from an outside contributor.

## 2. Current local state (verified)

| Aspect | Value |
| --- | --- |
| Project path | `/home/herick/Documents/freebuff/bdp` |
| Initialized as git repo? | **No** (no `.git/`, no remotes, no prior commits) |
| File count (excluding `.git/`, `node_modules/`, `dist/`) | 67 |
| Git global identity | `herick <herickleninlopezcardona@gmail.com>` |
| `gh` CLI | Installed (v2.45.0) **but not authenticated** |
| `GITHUB_TOKEN` / `GH_TOKEN` env | Not set |
| SSH key on disk | To be discovered at runtime (e.g. `~/.ssh/id_ed25519` / `id_rsa`) |
| TypeScript strict typecheck | Clean (verified in prior turns) |
| Vitest suite | 34 / 34 passing (verified in prior turns) |
| `commit.gpgsign` global config | Unset; will be set to `true` in §4 step 1a |
| `gpg.format` global config | Unset; will be set to `ssh` in §4 step 1a |
| `user.signingkey` global config | Unset; will be set to `~/.ssh/id_ed25519.pub` |
| SSH pubkey registered for **Signing** at github.com/settings/keys | Unverified at plan time; precondition for the GitHub "Verified" badge to display |
| GitHub repo `ErChulo/bdp-personal-db` | **Exists**; public; default branch `main`; non-empty (last push 2026-06-21) |

## 3. Decisions (from the three interview rounds)

### 3.1 Initialization & repo existence
- **Flow:** `git init` locally, then add an SSH remote.
- **Repo-creation step:** skipped — the repo already exists on GitHub
  (verified at spec-author time via REST API, see §2). We are *not* running
  `gh repo create`. There is no "create-and-push" path; this is an
  *overwrite* of existing state on `main`.
- **Visibility:** Public.
- **Push target:** Direct push to `main`. No feature branch, no PR.
- **Overwrite semantics:** The remote's prior `main` HEAD is discarded by
  the force-push. Mitigation: `--force-with-lease` (vs bare `--force`)
  refuses to clobber any commits that appeared on the remote since the
  most recent local `fetch`. Effectively a no-op in this scenario (no
  outside contributor) but a safety belt against a stale plan.

### 3.2 Authentication & authoring
- **Auth method:** Existing SSH key `~/.ssh/id_ed25519` (public-key comment
  `codebuff-mathweaver`). The remote URL will be:
  ```
  [email protected]:ErChulo/bdp-personal-db.git
  ```
  Pre-flight in §4 step 1 confirms an `ssh -T [email protected]`
  handshake (proves authentication; signing registration is a separate flag
  — see the signing bullet below).
- **Git identity:** Reuse the global `herick <herickleninlopezcardona@gmail.com>`
  already configured. No local override.
- **Co-author trailer:** None. `ErChulo` (GitHub namespace owner, display
  name `lopez.cardona`, created 2018-11-29) and the local committer
  identity resolve to the same person via name+email match.
- **Signing — resolve §6 Q3:** Enable SSH commit signing at the global git
  config level so the import commit lands as a "Verified" commit on
  GitHub. Two side-effects:
  1. We *will* mutate global git config (one-time setup) — see §8 for the
     updated acceptance criterion 7.
  2. The same `~/.ssh/id_ed25519` public key must already be uploaded to
     `github.com/settings/keys` **with the "Signing" key type enabled** —
     a single-purpose "Authentication" upload is not sufficient for SSH
     signing. If only the auth-purpose upload exists, re-upload (or edit)
     the key and tick "Signing". We do not verify this in the runbook
     (would require an authenticated `gh api /user/keys` call); the
     consequence is a "Unverified" badge post-push, not a push failure.
- **Pre-flight gate:** Run `npm run typecheck && npm test` immediately before
  the push. Abort with a clear error if either fails. The last verified run
  was clean, but the gate exists to catch any drift introduced between then
  and now.

### 3.3 Commit shape & exclusions
- **Granularity:** One mega commit. No split between project source and
  `.github/`; both land together.
- **Commit message:** `Initial commit: BDP personal database import`
  (resolved from §6 Q1). Not conventional-commit form; reads as a
  plain-language initial commit and is grep-friendly.
- **File selection:** Full `git add -A`. We trust your local cleanup — no
  pre-commit secret scan, no allowlist filtering. If `.env`, `*.key`, or
  similar artifacts are still sitting in the tree, they will be pushed, so
  pre-flight is your responsibility (see §5 Failure modes).
- **Upstream tracking + force-push:** First push to the clone's upstream
  uses `git push --force-with-lease -u origin main` (resolved from §6 Q5).
  `--force-with-lease` is preferred over bare `--force` because it refuses
  to clobber any commits that appeared on the remote since our last
  `fetch` — a safety belt given that the remote already has content.

### 3.4 Post-push behavior
- **Stop after push.** No `gh repo edit` for topics / description. No branch
  protection. No Pages setup. The final output is the resulting commit SHA,
  the remote URL, and a `git verify-commit HEAD` line confirming the
  signature parsed cleanly (GitHub UI verification depends on the matching
  public key being registered for Signing — see §3.2).

## 4. Step-by-step procedure (the runbook)

Execute these steps in order. Each step has a clear pass / fail criterion.

1. **Discover & verify SSH key.** List `~/.ssh/{id_ed25519,id_rsa,id_ecdsa}`
   and pick the first that exists and is readable. If none exist, abort with
   `ERROR: no SSH key found under ~/.ssh/`. Confirm `ssh -T [email protected]`
   reports a successful auth handshake (this proves authentication; signing
   is a separate flag at github.com/settings/keys).

1a. **Enable SSH signing globally.** Run, in order:
   ```
   git config --global gpg.format ssh
   git config --global user.signingkey ~/.ssh/id_ed25519.pub
   git config --global commit.gpgsign true
   ```
   Idempotent — running twice is fine. Precondition: the same
   `id_ed25519.pub` is uploaded at github.com/settings/keys with the
   Signing key type enabled. If that flag is missing on the remote key,
   the commit still pushes but shows "Unverified" in the GitHub UI.

2. **Sanity-check current branch safety.** Run `git status` to confirm there
   is no `.git/` directory yet (i.e. we are starting clean). Repeat the file
   count check (67, excluding `node_modules/`, `dist/`, `.git/`). Abort if
   anything unexpected is present.

3. **Pre-flight gate.**
   ```
   npm run typecheck && npm test
   ```
   Both must pass. Capture the final exit code.

4. **`git init` + initial branch rename.**
   ```
   git init
   git symbolic-ref HEAD refs/heads/main      # ensure default branch is `main`
   ```
   Skip the default-branch rename if Git 2.28+ honors `init.defaultBranch`
   via env. (Optional: set it locally with `git checkout -b main` if step 2
   already created a `master` branch.)

5. **Stage everything.**
   ```
   git add -A
   ```
   Display `git status --short | head -50` so the staged file count and a
   sample of paths are visible in the run log.

6. **Author commit.**
   ```
   git commit -m "Initial commit: BDP personal database import"
   ```
   No `--no-verify` hook bypass (there are no hooks anyway), no co-author
   trailer (resolved in §6 Q2). With `commit.gpgsign=true` set in step 1a,
   the commit is implicitly signed by the SSH ed25519 key. Verify locally
   with `git verify-commit HEAD` — a clean "Good signature" message
   confirms the signing pipeline is wired correctly before we proceed to
   push.

7. **Add SSH remote.**
   ```
   git remote add origin [email protected]:ErChulo/bdp-personal-db.git
   ```

8. **Push.**
   ```
   git fetch origin
   git push --force-with-lease -u origin main
   ```
   The `fetch` immediately before push gives `--force-with-lease` something
   to compare against; if anyone else has pushed to remote `main` since
   our last fetch, the lease fails and we abort rather than clobber.
   `-u` sets `main`'s upstream so subsequent `git push` calls in this
   clone are unambiguous.

9. **Post-push verification.**
   - Capture the remote `HEAD` SHA reported by `git ls-remote origin HEAD`
     (or rely on the push output).
   - Re-run `git fetch origin` to confirm the remote tracking ref updates.
   - Print the canonical repo URL, the commit SHA, and the count of files
     in the tree.

## 5. Failure modes & rollback

| Failure point | Symptom | Mitigation |
| --- | --- | --- |
| Step 1 (no SSH key) | Aborted before any state change | Add an SSH key with `ssh-keygen`, then re-run. Nothing to roll back. |
| Step 3 (typecheck / tests) | Stderr from `tsc` or `vitest` | Fix the regression locally and re-run the whole procedure. No git state was mutated yet. |
| Step 4 (init) | Directory already had `.git/` | Aborted before mutation. Verify you aren't inside a nested worktree. |
| Step 7 (remote) | `remote origin already exists` | Means step 4 ran twice; drop with `git remote remove origin` and retry. |
| Step 8 (push: 404) | `ERROR: repository … not found` | The GitHub repo doesn't exist yet. Create `ErChulo/bdp-personal-db` (public) on the web, then re-run from step 7. No local commit was lost. |
| Step 8 (push: denied) | `Permission denied (publickey)` | The SSH key isn't registered with GitHub at `github.com/settings/keys`. Run `ssh -T [email protected]` to confirm before re-running. |
| Step 8 (push: non-fast-forward) | `! [rejected] main -> main (non-fast-forward)` | Even with `--force-with-lease`, this can still trigger if a remote ref moved between our `fetch` and our push. Inspect (`git fetch origin && git log -p origin/main`), then either retry after another `fetch` (if the new commits are throwaway) or re-plan. This is now an edge case, not the default path. |
| Step 8 (push: large file rejected) | `remote: error: File … is 100.00 MB` | We did not opt into Git LFS. Abort; the user must either slim the file, gitignore it, or set up LFS in a follow-up spec. |

Because the push is the first one and the local commit is *new*, there is no
state to roll back on the remote. On the local clone, `git reset
--hard HEAD~1` is the worst-case cleanup if the user wants to undo step 6
before step 8 succeeds.

## 6. Resolved decisions (resolved in interview round 4)

The five question items previously parked in §6 are now resolved, including
the critical discovery that the GitHub repo already exists with prior
content:

1. **Repo pre-existence** — `ErChulo/bdp-personal-db` already exists on
   GitHub (verified via unauthenticated REST `GET /repos/...`, HTTP 200,
   `default_branch: main`, last `pushed_at: 2026-06-21T22:39:24Z`, owner
   `ErChulo`, public). Resolution: **force-push** our local `main` over
   the remote `main`, using `--force-with-lease` (§4 step 8) for safety.
   The remote's prior history is discarded. No reconciliation sub-spec
   required.

2. **Commit message** — fixed to
   `Initial commit: BDP personal database import`. Not a
   conventional-commit form; reads as a plain-language initial commit and
   is grep-friendly.

3. **Co-author trailer** — none. Single contributor (`herick` /
   `herickleninlopezcardona@gmail.com` / `ErChulo` — name+email match
   confirms).

4. **Pre-commit signing** — enable SSH signing globally using the existing
   `~/.ssh/id_ed25519` key (§4 step 1a). This *will* mutate global git
   config; §8 acceptance criterion 7 is updated to permit exactly the
   three signing-related writes and nothing else. Precondition for the
   GitHub "Verified" UI badge: the public key must be registered at
   github.com/settings/keys with the **Signing** key type enabled.
   Single-purpose "Authentication" uploads are insufficient.

5. **`.gitignore` audit** — still deferred. The "trust local cleanup"
   choice from §3.3 means we do not re-audit during the run. A small
   follow-up should verify `node_modules/`, `dist/`, `.env`, and editor
   cache files are excluded before the import commit lands.

## 7. Out of scope

- Creating or configuring the GitHub repo itself (visibility, default
  branch, description, topics, social card).
- Branch protection rules requiring the `gates` CI check.
- GitHub Pages configuration.
- Git LFS, code owners (`CODEOWNERS`), pull-request templates, or issue
  templates.
- Adding tags / releases.
- Migrating secrets or rotating tokens. (None should be in the tree to
  begin with — see §3.3 — but if any are discovered post-push, rotate
  immediately out-of-band.)

## 8. Acceptance criteria

The procedure is "done" when **all** of the following are true:

- [ ] Step 3 (`typecheck + test`) exits 0.
- [ ] Step 6 produced exactly one local commit on `main` with message
      `chore: initial import`.
- [ ] Step 8 (`git push -u origin main`) exits 0.
- [ ] Step 9 reports the same commit SHA locally and on the remote.
- [ ] The README CI badge URL (`github.com/ErChulo/bdp-personal-db/actions/workflows/ci.yml/badge.svg`)
      resolves to a 200 (not 404) — i.e. the workflow has at least one run
      history record.
- [ ] Force-push (`--force-with-lease`) was used *only because* the remote
      already had content; covered by §3.1 + §6 Q1. Bare `--force` is not
      acceptable here.
- [ ] `git config` mutations outside the new clone's `.git/config` are
      **exactly** the three global writes needed to enable SSH signing
      (`gpg.format=ssh`, `user.signingkey=~/.ssh/id_ed25519.pub`,
      `commit.gpgsign=true` — see §4 step 1a). Any other global mutation
      is a defect.
- [ ] A local `git verify-commit HEAD` immediately after step 6 prints a
      `Good signature from "SSH signing key id_ed25519"`-style line. If
      GitHub later shows the commit as "Unverified", the precondition
      in §6 Q4 (key registered for Signing) was missed — not a runbook
      defect, just a missing github.com/settings/keys step.

End of spec.
