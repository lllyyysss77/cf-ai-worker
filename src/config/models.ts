export interface ModelConfig {
	/** Public model ID used by clients in requests. */
	requestModelId: string;
	/** Cloudflare Workers AI model ID passed to env.AI.run. */
	cloudflareModelId: string;
	/** Whether the model accepts native message arrays instead of a single prompt string. */
	messageNative: boolean;
	/** Whether to include this model in the /v1/models list. Defaults to true. */
	listed?: boolean;
	/** Value returned as owned_by in the /v1/models list. Defaults to 'openai'. */
	ownedBy?: string;
}

export interface AiGatewayConfig {
	models: ModelConfig[];
}

export interface ListedModel {
	id: string;
	object: 'model';
	owned_by: string;
}

export interface ModelRegistry {
	config: AiGatewayConfig;
	mapping: Record<string, string>;
	messageNativeModels: Set<string>;
	listedModels: ListedModel[];
	getCloudflareModel(requestModelId: string): string | null;
	isMessageNative(cloudflareModelId: string): boolean;
}

export const DEFAULT_MODEL_CONFIG: AiGatewayConfig = {
	models: [
		{
			requestModelId: 'kimi-k2.5',
			cloudflareModelId: '@cf/moonshotai/kimi-k2.5',
			messageNative: true,
			listed: true,
			ownedBy: 'openai',
		},
		{
			requestModelId: 'glm-4.7-flash',
			cloudflareModelId: '@cf/zai-org/glm-4.7-flash',
			messageNative: true,
			listed: true,
			ownedBy: 'openai',
		},
		{
			requestModelId: 'deepseek-r1',
			cloudflareModelId: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
			messageNative: false,
			listed: false,
		},
		{
			requestModelId: 'deepseek-r1-qwen32b',
			cloudflareModelId: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
			messageNative: false,
			listed: true,
			ownedBy: 'deepseek-ai',
		},
	],
};

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
	return typeof value === 'boolean';
}

export function validateConfig(config: unknown): asserts config is AiGatewayConfig {
	if (config === null || typeof config !== 'object') {
		throw new Error('Model config must be an object');
	}

	const { models } = config as Record<string, unknown>;
	if (!Array.isArray(models) || models.length === 0) {
		throw new Error('Model config must contain a non-empty "models" array');
	}

	const requestIds = new Set<string>();
	const messageNativeByCloudflareId = new Map<string, boolean>();

	for (let index = 0; index < models.length; index++) {
		const entry = models[index];
		const context = `Model config entry at index ${index}`;

		if (entry === null || typeof entry !== 'object') {
			throw new Error(`${context} must be an object`);
		}

		const {
			requestModelId,
			cloudflareModelId,
			messageNative,
			listed,
			ownedBy,
		} = entry as Record<string, unknown>;

		if (!isNonEmptyString(requestModelId)) {
			throw new Error(`${context} has invalid or missing "requestModelId"`);
		}

		if (!isNonEmptyString(cloudflareModelId)) {
			throw new Error(`${context} (${requestModelId}) has invalid or missing "cloudflareModelId"`);
		}

		if (!isBoolean(messageNative)) {
			throw new Error(`${context} (${requestModelId}) has invalid or missing "messageNative"`);
		}

		if (listed !== undefined && !isBoolean(listed)) {
			throw new Error(`${context} (${requestModelId}) has invalid "listed"`);
		}

		if (ownedBy !== undefined && !isNonEmptyString(ownedBy)) {
			throw new Error(`${context} (${requestModelId}) has invalid "ownedBy"`);
		}

		if (requestIds.has(requestModelId)) {
			throw new Error(`Duplicate requestModelId "${requestModelId}" in model config`);
		}
		requestIds.add(requestModelId);

		const previousMessageNative = messageNativeByCloudflareId.get(cloudflareModelId);
		if (previousMessageNative !== undefined && previousMessageNative !== messageNative) {
			throw new Error(
				`Inconsistent "messageNative" values for cloudflareModelId "${cloudflareModelId}"`
			);
		}
		messageNativeByCloudflareId.set(cloudflareModelId, messageNative);
	}
}

function buildMapping(models: ModelConfig[]): Record<string, string> {
	const mapping = Object.create(null);
	for (const model of models) {
		mapping[model.requestModelId] = model.cloudflareModelId;
	}
	return mapping;
}

function buildMessageNativeModels(models: ModelConfig[]): Set<string> {
	return new Set(
		models.filter((model) => model.messageNative).map((model) => model.cloudflareModelId)
	);
}

function buildListedModels(models: ModelConfig[]): ListedModel[] {
	return models
		.filter((model) => model.listed !== false)
		.map((model) => ({
			id: model.requestModelId,
			object: 'model' as const,
			owned_by: model.ownedBy || 'openai',
		}));
}

export function createModelRegistry(config: AiGatewayConfig): ModelRegistry {
	validateConfig(config);

	const mapping = buildMapping(config.models);
	const messageNativeModels = buildMessageNativeModels(config.models);
	const listedModels = buildListedModels(config.models);

	return {
		config,
		mapping,
		messageNativeModels,
		listedModels,
		getCloudflareModel(requestModelId: string): string | null {
			return Object.prototype.hasOwnProperty.call(mapping, requestModelId)
				? mapping[requestModelId]
				: null;
		},
		isMessageNative(cloudflareModelId: string): boolean {
			return messageNativeModels.has(cloudflareModelId);
		},
	};
}

export const MODEL_REGISTRY = createModelRegistry(DEFAULT_MODEL_CONFIG);
