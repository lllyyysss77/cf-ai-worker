# Workers AI Model Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deprecated Kimi K2.5 backend with Kimi K2.6, preserve the old request ID as a hidden compatibility alias, and expose GPT-OSS 120B.

**Architecture:** Keep model selection data-driven in `src/config/models.ts`; no routing code changes are required. Update registry and endpoint tests first so the old configuration fails, then make the minimum configuration change and synchronize README documentation.

**Tech Stack:** TypeScript, Cloudflare Workers AI binding, Node.js test runner, esbuild.

---

### Task 1: Define refreshed registry and routing behavior

**Files:**
- Modify: `tests/model-config.test.mjs`
- Modify: `tests/model-routing.test.mjs`
- Modify: `src/config/models.ts`

- [ ] **Step 1: Write failing registry tests**

Update expected mappings to include:

```js
assert.equal(MODEL_REGISTRY.getCloudflareModel('kimi-k2.6'), '@cf/moonshotai/kimi-k2.6');
assert.equal(MODEL_REGISTRY.getCloudflareModel('kimi-k2.5'), '@cf/moonshotai/kimi-k2.6');
assert.equal(MODEL_REGISTRY.getCloudflareModel('gpt-oss-120b'), '@cf/openai/gpt-oss-120b');
```

Assert Kimi K2.6 and GPT-OSS are message-native and expect the listed IDs to be `kimi-k2.6`, `glm-4.7-flash`, `deepseek-r1-qwen32b`, and `gpt-oss-120b`.

- [ ] **Step 2: Write failing routing tests**

Add table-driven checks for `kimi-k2.6`, hidden `kimi-k2.5`, and `gpt-oss-120b` on `/v1/chat/completions` and `/v1/responses`. For each call assert the expected Cloudflare model, a `messages` array, and no `prompt`. Update `/v1/models` expectations.

For the hidden K2.5 alias, assert that ordinary Chat Completions and Responses payloads both retain `model: 'kimi-k2.5'`, while debug metadata exposes `@cf/moonshotai/kimi-k2.6`.

- [ ] **Step 3: Verify RED**

Run: `node --test tests/model-config.test.mjs tests/model-routing.test.mjs`

Expected: FAIL because the new mappings, routing targets and public list do not exist.

- [ ] **Step 4: Implement the minimum registry change**

In `DEFAULT_MODEL_CONFIG`, add public `kimi-k2.6`, convert `kimi-k2.5` to a hidden alias targeting the K2.6 Cloudflare ID, and add public `gpt-oss-120b`. Set all three entries to `messageNative: true`.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/model-config.test.mjs tests/model-routing.test.mjs`

Expected: all model configuration and routing tests pass.

### Task 2: Synchronize user documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update model documentation**

Document Kimi K2.6 and GPT-OSS 120B, mark Kimi K2.5 as a hidden compatibility alias, update `/v1/models`, native-message behavior and request examples, and state that default model changes require synchronized tests and README edits.

- [ ] **Step 2: Check documentation consistency**

Run: `rg -n "kimi-k2\\.5|kimi-k2\\.6|gpt-oss-120b" README.md src/config/models.ts tests`

Expected: K2.5 appears only where compatibility behavior is intentional; all new model IDs appear in configuration, tests, and README.

### Task 3: Verify and deliver

**Files:**
- Verify: `src/config/models.ts`
- Verify: `tests/model-config.test.mjs`
- Verify: `tests/model-routing.test.mjs`
- Verify: `README.md`
- Verify: `docs/superpowers/specs/2026-08-02-model-refresh-design.md`
- Verify: `docs/superpowers/plans/2026-08-02-model-refresh.md`

- [ ] **Step 1: Run complete verification**

Run: `npm test`

Expected: all tests pass with zero failures.

Run: `git diff --check`

Expected: exit code 0 with no output.

- [ ] **Step 2: Review intended changes**

Run: `git status --short && git diff --stat && git diff`

Expected: only the files listed above are changed or newly added.

- [ ] **Step 3: Commit implementation**

```bash
git add src/config/models.ts tests/model-config.test.mjs tests/model-routing.test.mjs README.md docs/superpowers/plans/2026-08-02-model-refresh.md
git commit -m "feat: refresh Workers AI model lineup"
```

- [ ] **Step 4: Push and verify remote state**

Run: `git push origin docs/readme-model-update`

Then run this executable equality check and confirm the worktree is clean:

```bash
test "$(git rev-parse HEAD)" = "$(git ls-remote origin refs/heads/docs/readme-model-update | awk '{print $1}')"
git status --short
```

Expected: `test` exits 0 and `git status --short` produces no output.
