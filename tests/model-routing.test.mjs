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

async function createChatCompletionResponse(model, aiResult) {
	const { default: worker } = await loadWorkerModule();
	const request = new Request('https://example.com/v1/chat/completions', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model,
			messages: [{ role: 'user', content: 'hello' }],
		}),
	});

	return worker.fetch(request, {
		AI: {
			async run() {
				return aiResult;
			},
		},
	});
}

async function createChatCompletionRequest(body, headers = {}) {
	const { default: worker } = await loadWorkerModule();
	const request = new Request('https://example.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			...headers,
		},
		body: JSON.stringify(body),
	});

	return worker.fetch(request, {
		AI: {
			async run() {
				return { response: 'ok', usage: { prompt_tokens: 1, completion_tokens: 1 } };
			},
		},
	});
}

async function createResponsesRequest(body) {
	const { default: worker } = await loadWorkerModule();
	const calls = [];
	const request = new Request('https://example.com/v1/responses', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	const response = await worker.fetch(request, {
		AI: {
			async run(cfModel, options) {
				calls.push({ cfModel, options });
				return { response: 'ok', usage: { prompt_tokens: 1, completion_tokens: 1 } };
			},
		},
	});

	return { response, calls };
}

test('routes kimi-k2.5 to the Cloudflare Moonshot model id', async () => {
	const call = await callChatCompletion('kimi-k2.5');
	assert.equal(call.cfModel, '@cf/moonshotai/kimi-k2.5');
});

test('routes glm-4.7-flash to the Cloudflare Z.ai model id', async () => {
	const call = await callChatCompletion('glm-4.7-flash');
	assert.equal(call.cfModel, '@cf/zai-org/glm-4.7-flash');
	assert.deepEqual(call.options.messages, [{ role: 'user', content: 'hello' }]);
	assert.equal(call.options.prompt, undefined);
});

test('extracts glm text output from choices[0].text', async () => {
	const response = await createChatCompletionResponse('glm-4.7-flash', {
		choices: [{ text: 'GLM_OK' }],
		usage: { prompt_tokens: 1, completion_tokens: 2 },
	});
	const payload = await response.json();

	assert.equal(payload.choices[0].message.content, 'GLM_OK');
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

test('includes raw AI response when debug header is enabled', async () => {
	const { default: worker } = await loadWorkerModule();
	const request = new Request('https://example.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Debug-AI-Response': '1',
		},
		body: JSON.stringify({
			model: 'glm-4.7-flash',
			messages: [{ role: 'user', content: 'hello' }],
		}),
	});

	const rawAiResponse = {
		result: {
			response: 'debug-value',
		},
		usage: {
			prompt_tokens: 2,
			completion_tokens: 3,
		},
	};

	const response = await worker.fetch(request, {
		AI: {
			async run() {
				return rawAiResponse;
			},
		},
	});

	assert.equal(response.status, 200);
	const payload = await response.json();
	assert.deepEqual(payload.debug.raw_ai_response, rawAiResponse);
	assert.equal(payload.debug.cloudflare_model, '@cf/zai-org/glm-4.7-flash');
});

test('rejects unknown chat completion models with a 400 error', async () => {
	const response = await createChatCompletionRequest({
		model: 'unknown-model',
		messages: [{ role: 'user', content: 'hello' }],
	});
	const payload = await response.json();

	assert.equal(response.status, 400);
	assert.equal(payload.error.type, 'invalid_request_error');
	assert.match(payload.error.message, /unsupported model/i);
});

test('requires model for chat completions requests', async () => {
	const response = await createChatCompletionRequest({
		messages: [{ role: 'user', content: 'hello' }],
	});
	const payload = await response.json();

	assert.equal(response.status, 400);
	assert.equal(payload.error.type, 'invalid_request_error');
	assert.match(payload.error.message, /model is required/i);
});

test('rejects top_p for chat completions until it is implemented', async () => {
	const response = await createChatCompletionRequest({
		model: 'glm-4.7-flash',
		top_p: 0.5,
		messages: [{ role: 'user', content: 'hello' }],
	});
	const payload = await response.json();

	assert.equal(response.status, 400);
	assert.equal(payload.error.type, 'invalid_request_error');
	assert.match(payload.error.message, /top_p is not supported/i);
});

test('rejects top_p for responses requests until it is implemented', async () => {
	const { response } = await createResponsesRequest({
		model: 'kimi-k2.5',
		top_p: 0.5,
		input: 'hello',
	});
	const payload = await response.json();

	assert.equal(response.status, 400);
	assert.equal(payload.error.type, 'invalid_request_error');
	assert.match(payload.error.message, /top_p is not supported/i);
});

test('requires model for responses requests', async () => {
	const { response } = await createResponsesRequest({
		input: 'hello',
	});
	const payload = await response.json();

	assert.equal(response.status, 400);
	assert.equal(payload.error.type, 'invalid_request_error');
	assert.match(payload.error.message, /model is required/i);
});

test('rejects unknown responses models with a 400 error', async () => {
	const { response } = await createResponsesRequest({
		model: 'unknown-model',
		input: 'hello',
	});
	const payload = await response.json();

	assert.equal(response.status, 400);
	assert.equal(payload.error.type, 'invalid_request_error');
	assert.match(payload.error.message, /unsupported model/i);
});

test('routes responses requests through native message models when supported', async () => {
	const { response, calls } = await createResponsesRequest({
		model: 'glm-4.7-flash',
		input: [
			{ role: 'system', content: 'Be concise' },
			{ role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
		],
		instructions: 'Answer in Chinese',
	});

	assert.equal(response.status, 200);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].cfModel, '@cf/zai-org/glm-4.7-flash');
	assert.deepEqual(calls[0].options.messages, [
		{ role: 'system', content: 'Answer in Chinese' },
		{ role: 'system', content: 'Be concise' },
		{ role: 'user', content: 'hello' },
	]);
	assert.equal(calls[0].options.prompt, undefined);
});

test('allows X-Debug-AI-Response in CORS preflight requests', async () => {
	const { default: worker } = await loadWorkerModule();
	const response = await worker.fetch(
		new Request('https://example.com/v1/chat/completions', {
			method: 'OPTIONS',
			headers: {
				'Access-Control-Request-Method': 'POST',
				'Access-Control-Request-Headers': 'content-type,x-debug-ai-response',
			},
		}),
		{}
	);

	assert.equal(response.status, 200);
	assert.match(
		response.headers.get('Access-Control-Allow-Headers') || '',
		/X-Debug-AI-Response/i
	);
});

test.after(async () => {
	await rm(tempDir, { recursive: true, force: true });
});
