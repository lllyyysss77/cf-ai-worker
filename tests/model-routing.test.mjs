import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'tests', '.tmp');
const bundlePath = path.join(tempDir, 'worker-bundle.mjs');

async function loadWorkerModule() {
	await mkdir(tempDir, { recursive: true });
	await build({
		entryPoints: [path.join(rootDir, 'src', 'index.ts')],
		bundle: true,
		format: 'esm',
		platform: 'browser',
		outfile: bundlePath,
		logLevel: 'silent',
	});

	return import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`);
}

async function callChatCompletion(model) {
	const { default: worker } = await loadWorkerModule();
	const calls = [];
	const request = new Request('https://example.com/v1/chat/completions', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			messages: [{ role: 'user', content: 'hello' }],
		}),
	});

	const response = await worker.fetch(request, {
		AI: {
			async run(cfModel, options) {
				calls.push({ cfModel, options });
				return { response: 'ok', usage: { prompt_tokens: 1, completion_tokens: 1 } };
			},
		},
	});

	assert.equal(response.status, 200);
	assert.equal(calls.length, 1);
	return calls[0];
}

test('routes kimi-k2.5 to the Cloudflare Moonshot model id', async () => {
	const call = await callChatCompletion('kimi-k2.5');
	assert.equal(call.cfModel, '@cf/moonshotai/kimi-k2.5');
});

test('routes glm-4.7-flash to the Cloudflare Z.ai model id', async () => {
	const call = await callChatCompletion('glm-4.7-flash');
	assert.equal(call.cfModel, '@cf/zai-org/glm-4.7-flash');
});

test('lists the model ids exposed by the gateway', async () => {
	const { default: worker } = await loadWorkerModule();
	const response = await worker.fetch(
		new Request('https://example.com/v1/models', { method: 'GET' }),
		{}
	);
	const payload = await response.json();

	assert.deepEqual(
		payload.data.map((model) => model.id),
		['kimi-k2.5', 'glm-4.7-flash', 'deepseek-r1-qwen32b']
	);
});

test.after(async () => {
	await rm(tempDir, { recursive: true, force: true });
});
