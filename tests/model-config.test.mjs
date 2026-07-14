import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const rootDir = process.cwd();
const tempDir = path.join(rootDir, 'tests', '.tmp-config');

async function loadConfigModule() {
	await mkdir(tempDir, { recursive: true });
	const bundlePath = path.join(tempDir, 'config-bundle.mjs');
	await build({
		entryPoints: [path.join(rootDir, 'src', 'config', 'models.ts')],
		bundle: true,
		format: 'esm',
		platform: 'browser',
		outfile: bundlePath,
		logLevel: 'silent',
	});

	return import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`);
}

test('default registry maps request model ids to Cloudflare model ids', async () => {
	const { MODEL_REGISTRY } = await loadConfigModule();

	assert.equal(MODEL_REGISTRY.getCloudflareModel('kimi-k2.5'), '@cf/moonshotai/kimi-k2.5');
	assert.equal(MODEL_REGISTRY.getCloudflareModel('glm-4.7-flash'), '@cf/zai-org/glm-4.7-flash');
	assert.equal(
		MODEL_REGISTRY.getCloudflareModel('deepseek-r1'),
		'@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
	);
	assert.equal(
		MODEL_REGISTRY.getCloudflareModel('deepseek-r1-qwen32b'),
		'@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'
	);
	assert.equal(MODEL_REGISTRY.getCloudflareModel('unknown-model'), null);
});

test('default registry marks message-native Cloudflare models', async () => {
	const { MODEL_REGISTRY } = await loadConfigModule();

	assert.equal(MODEL_REGISTRY.isMessageNative('@cf/moonshotai/kimi-k2.5'), true);
	assert.equal(MODEL_REGISTRY.isMessageNative('@cf/zai-org/glm-4.7-flash'), true);
	assert.equal(
		MODEL_REGISTRY.isMessageNative('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b'),
		false
	);
	assert.equal(MODEL_REGISTRY.isMessageNative('@cf/unknown/model'), false);
});

test('default registry exposes listed models for /v1/models', async () => {
	const { MODEL_REGISTRY } = await loadConfigModule();

	assert.deepEqual(MODEL_REGISTRY.listedModels, [
		{ id: 'kimi-k2.5', object: 'model', owned_by: 'openai' },
		{ id: 'glm-4.7-flash', object: 'model', owned_by: 'openai' },
		{ id: 'deepseek-r1-qwen32b', object: 'model', owned_by: 'deepseek-ai' },
	]);
});

test('default registry ignores prototype property names', async () => {
	const { MODEL_REGISTRY } = await loadConfigModule();

	assert.equal(MODEL_REGISTRY.getCloudflareModel('__proto__'), null);
	assert.equal(MODEL_REGISTRY.getCloudflareModel('constructor'), null);
	assert.equal(MODEL_REGISTRY.getCloudflareModel('hasOwnProperty'), null);
});

test('validateConfig accepts the default config', async () => {
	const { validateConfig, DEFAULT_MODEL_CONFIG } = await loadConfigModule();

	assert.doesNotThrow(() => validateConfig(DEFAULT_MODEL_CONFIG));
});

test('validateConfig rejects a non-object config', async () => {
	const { validateConfig } = await loadConfigModule();

	assert.throws(() => validateConfig(null), /must be an object/);
	assert.throws(() => validateConfig('config'), /must be an object/);
});

test('validateConfig rejects missing or empty models array', async () => {
	const { validateConfig } = await loadConfigModule();

	assert.throws(() => validateConfig({}), /models.*array/);
	assert.throws(() => validateConfig({ models: [] }), /non-empty.*models|models.*non-empty/);
	assert.throws(() => validateConfig({ models: 'not-array' }), /models.*array/);
});

test('validateConfig rejects missing or empty model ids', async () => {
	const { validateConfig } = await loadConfigModule();

	assert.throws(
		() => validateConfig({ models: [{ cloudflareModelId: '@cf/x/y', messageNative: true }] }),
		/requestModelId/
	);
	assert.throws(
		() => validateConfig({ models: [{ requestModelId: '', cloudflareModelId: '@cf/x/y', messageNative: true }] }),
		/requestModelId/
	);
	assert.throws(
		() => validateConfig({ models: [{ requestModelId: 'x', messageNative: true }] }),
		/cloudflareModelId/
	);
	assert.throws(
		() => validateConfig({ models: [{ requestModelId: 'x', cloudflareModelId: '', messageNative: true }] }),
		/cloudflareModelId/
	);
});

test('validateConfig rejects duplicate request model ids', async () => {
	const { validateConfig } = await loadConfigModule();

	assert.throws(
		() =>
			validateConfig({
				models: [
					{ requestModelId: 'same', cloudflareModelId: '@cf/a/b', messageNative: true },
					{ requestModelId: 'same', cloudflareModelId: '@cf/c/d', messageNative: true },
				],
			}),
		/Duplicate requestModelId/
	);
});

test('validateConfig rejects non-boolean messageNative', async () => {
	const { validateConfig } = await loadConfigModule();

	assert.throws(
		() => validateConfig({ models: [{ requestModelId: 'x', cloudflareModelId: '@cf/x/y', messageNative: 'true' }] }),
		/messageNative/
	);
});

test('validateConfig rejects inconsistent messageNative for the same Cloudflare model', async () => {
	const { validateConfig } = await loadConfigModule();

	assert.throws(
		() =>
			validateConfig({
				models: [
					{ requestModelId: 'a', cloudflareModelId: '@cf/shared/model', messageNative: true },
					{ requestModelId: 'b', cloudflareModelId: '@cf/shared/model', messageNative: false },
				],
			}),
		/inconsistent.*messageNative/i
	);
});

test('validateConfig rejects invalid optional fields', async () => {
	const { validateConfig } = await loadConfigModule();

	assert.throws(
		() =>
			validateConfig({
				models: [
					{ requestModelId: 'x', cloudflareModelId: '@cf/x/y', messageNative: true, listed: 'yes' },
				],
			}),
		/listed/
	);
	assert.throws(
		() =>
			validateConfig({
				models: [
					{ requestModelId: 'x', cloudflareModelId: '@cf/x/y', messageNative: true, ownedBy: 123 },
				],
			}),
		/ownedBy/
	);
});

test('invalid default config throws on module load', async () => {
	await mkdir(tempDir, { recursive: true });
	const invalidSourcePath = path.join(tempDir, 'invalid-models.ts');
	const invalidBundlePath = path.join(tempDir, 'invalid-config-bundle.mjs');

	await writeFile(
		invalidSourcePath,
		`import { createModelRegistry } from '${path.join(rootDir, 'src', 'config', 'models.ts').replace(/\\/g, '/')}';
export const MODEL_REGISTRY = createModelRegistry({ models: [] });`
	);

	await build({
		entryPoints: [invalidSourcePath],
		bundle: true,
		format: 'esm',
		platform: 'browser',
		outfile: invalidBundlePath,
		logLevel: 'silent',
	});

	await assert.rejects(
		async () => import(`${pathToFileURL(invalidBundlePath).href}?t=${Date.now()}`),
		/models.*array|non-empty.*models/i
	);
});

test.after(async () => {
	await rm(tempDir, { recursive: true, force: true });
});
