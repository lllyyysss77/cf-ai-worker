import { MODEL_REGISTRY } from './config/models';
import {
	createOpenAIResponse,
	createResponsesResponse,
} from './responses';
import { createChatStreamResponse, createResponsesStreamResponse } from './streaming';

export interface Env {
	AI: Ai;
	OPENAI_API_KEY?: string;
}

// OpenAI compatible message interface
interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

// OpenAI compatible request body
interface ChatCompletionRequest {
	model: string;
	messages: ChatMessage[];
	temperature?: number;
	max_tokens?: number;
	top_p?: number;
	stream?: boolean;
}

// OpenAI Responses API content item
interface ResponseContentItem {
	type: 'input_text' | 'input_image' | 'output_text';
	text?: string;
}

// OpenAI Responses API input item
interface ResponseInputItem {
	role: 'user' | 'assistant' | 'system';
	content: string | ResponseContentItem[];
}

// OpenAI Responses API request body
interface ResponsesRequest {
	model: string;
	input: string | ResponseInputItem[];
	instructions?: string;
	temperature?: number;
	max_output_tokens?: number;
	top_p?: number;
	stream?: boolean;
	store?: boolean;
}

// Validate API key from Authorization header
function validateApiKey(request: Request, env: Env): Response | null {
	// If OPENAI_API_KEY is not set, skip validation
	if (!env.OPENAI_API_KEY) {
		return null;
	}

	const authHeader = request.headers.get('Authorization');
	if (!authHeader) {
		return new Response(
			JSON.stringify({
				error: {
					message: 'Missing Authorization header',
					type: 'authentication_error',
				},
			}),
			{ status: 401, headers: { 'Content-Type': 'application/json' } }
		);
	}

	// Extract Bearer token
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	if (!match) {
		return new Response(
			JSON.stringify({
				error: {
					message: 'Invalid Authorization header format. Expected: Bearer <token>',
					type: 'authentication_error',
				},
			}),
			{ status: 401, headers: { 'Content-Type': 'application/json' } }
		);
	}

	const token = match[1];
	if (!timingSafeEqual(token, env.OPENAI_API_KEY)) {
		return new Response(
			JSON.stringify({
				error: {
					message: 'Invalid API key',
					type: 'authentication_error',
				},
			}),
			{ status: 401, headers: { 'Content-Type': 'application/json' } }
		);
	}

	return null;
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}

	let result = 0;
	for (let index = 0; index < a.length; index++) {
		result |= a.charCodeAt(index) ^ b.charCodeAt(index);
	}

	return result === 0;
}

function shouldIncludeDebugInfo(request: Request): boolean {
	return request.headers.get('X-Debug-AI-Response') === '1';
}

function withDebugInfo(
	payload: Record<string, unknown>,
	request: Request,
	cfModel: string,
	rawAiResponse: unknown
): Record<string, unknown> {
	if (!shouldIncludeDebugInfo(request)) {
		return payload;
	}

	return {
		...payload,
		debug: {
			cloudflare_model: cfModel,
			raw_ai_response: rawAiResponse,
		},
	};
}

function withCorsHeaders(response: Response, corsHeaders: Record<string, string>): Response {
	const headers = new Headers(response.headers);
	Object.entries(corsHeaders).forEach(([key, value]) => {
		headers.set(key, value);
	});
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function convertMessagesToPrompt(messages: ChatMessage[]): string {
	return messages
		.map((msg) => {
			switch (msg.role) {
				case 'system':
					return `[System]\n${msg.content}`;
				case 'user':
					return `[User]\n${msg.content}`;
				case 'assistant':
					return `[Assistant]\n${msg.content}`;
				default:
					return `${msg.content}`;
			}
		})
		.join('\n\n');
}

function extractAiText(aiResponse: {
	response?: string;
	text?: string;
	choices?: Array<{
		text?: string;
		message?: { content?: string };
	}>;
}): string {
	if (typeof aiResponse.response === 'string' && aiResponse.response.length > 0) {
		return aiResponse.response;
	}

	if (typeof aiResponse.text === 'string' && aiResponse.text.length > 0) {
		return aiResponse.text;
	}

	const firstChoice = aiResponse.choices?.[0];
	if (!firstChoice) {
		return '';
	}

	if (typeof firstChoice.message?.content === 'string' && firstChoice.message.content.length > 0) {
		return firstChoice.message.content;
	}

	if (typeof firstChoice.text === 'string' && firstChoice.text.length > 0) {
		return firstChoice.text;
	}

	return '';
}

function extractTextFromContentItems(items: ResponseContentItem[]): string {
	return items
		.filter((c) => c.type === 'input_text' || c.type === 'output_text')
		.map((c) => c.text || '')
		.join('');
}

// Convert Responses API input to prompt string
function convertInputToPrompt(input: string | ResponseInputItem[]): string {
	if (typeof input === 'string') {
		return `[User]\n${input}`;
	}

	return input
		.map((item) => {
			const role = item.role;
			let content = '';

			if (typeof item.content === 'string') {
				content = item.content;
			} else if (Array.isArray(item.content)) {
				content = extractTextFromContentItems(item.content);
			}

			switch (role) {
				case 'system':
					return `[System]\n${content}`;
				case 'user':
					return `[User]\n${content}`;
				case 'assistant':
					return `[Assistant]\n${content}`;
				default:
					return content;
			}
		})
			.join('\n\n');
}

function convertResponsesInputToMessages(
	input: string | ResponseInputItem[],
	instructions?: string
): ChatMessage[] {
	const messages: ChatMessage[] = [];

	if (instructions) {
		messages.push({ role: 'system', content: instructions });
	}

	if (typeof input === 'string') {
		messages.push({ role: 'user', content: input });
		return messages;
	}

	for (const item of input) {
		let content = '';

		if (typeof item.content === 'string') {
			content = item.content;
		} else if (Array.isArray(item.content)) {
			content = extractTextFromContentItems(item.content);
		}

		messages.push({
			role: item.role,
			content,
		});
	}

	return messages;
}

function buildChatAiOptions(
	cfModel: string,
	messages: ChatMessage[],
	temperature?: number,
	maxTokens?: number
): Record<string, unknown> {
	return {
		...(MODEL_REGISTRY.isMessageNative(cfModel)
			? { messages }
			: { prompt: convertMessagesToPrompt(messages) }),
		...(temperature !== undefined && { temperature }),
		...(maxTokens !== undefined && { max_tokens: maxTokens }),
	};
}

function buildResponsesAiOptions(
	cfModel: string,
	input: string | ResponseInputItem[],
	instructions: string | undefined,
	temperature?: number,
	maxOutputTokens?: number
): Record<string, unknown> {
	let prompt = convertInputToPrompt(input);

	if (instructions) {
		prompt = `[System]\n${instructions}\n\n${prompt}`;
	}

	return {
		...(MODEL_REGISTRY.isMessageNative(cfModel)
			? { messages: convertResponsesInputToMessages(input, instructions) }
			: { prompt }),
		...(temperature !== undefined && { temperature }),
		...(maxOutputTokens !== undefined && { max_tokens: maxOutputTokens }),
	};
}

function createErrorResponse(message: string, status: number, type: string): Response {
	return new Response(
		JSON.stringify({
			error: {
				message,
				type,
			},
		}),
		{
			status,
			headers: { 'Content-Type': 'application/json' },
		}
	);
}

function validateModel(model: unknown): Response | null {
	if (typeof model !== 'string' || model.trim().length === 0) {
		return createErrorResponse('Model is required', 400, 'invalid_request_error');
	}

	if (!MODEL_REGISTRY.getCloudflareModel(model)) {
		return createErrorResponse(
			`Unsupported model: ${model}`,
			400,
			'invalid_request_error'
		);
	}

	return null;
}

function validateUnsupportedParameter(
	value: unknown,
	name: string
): Response | null {
	if (value === undefined || value === null) {
		return null;
	}

	return createErrorResponse(
		`${name} is not supported by this gateway yet`,
		400,
		'invalid_request_error'
	);
}

function validateNumberParameter(
	value: unknown,
	name: string
): Response | null {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return createErrorResponse(
			`${name} must be a number`,
			400,
			'invalid_request_error'
		);
	}

	return null;
}

function isValidMessageRole(role: unknown): role is ChatMessage['role'] {
	return role === 'system' || role === 'user' || role === 'assistant';
}

function validateMessages(messages: unknown): Response | null {
	if (!Array.isArray(messages) || messages.length === 0) {
		return createErrorResponse('Messages array is required', 400, 'invalid_request_error');
	}

	for (const message of messages) {
		if (!message || typeof message !== 'object') {
			return createErrorResponse('Each message must be an object', 400, 'invalid_request_error');
		}

		const { role, content } = message as Record<string, unknown>;
		if (!isValidMessageRole(role)) {
			return createErrorResponse('Invalid message role', 400, 'invalid_request_error');
		}
		if (typeof content !== 'string') {
			return createErrorResponse('Message content must be a string', 400, 'invalid_request_error');
		}
	}

	return null;
}

function isValidResponsesRole(role: unknown): role is ResponseInputItem['role'] {
	return role === 'system' || role === 'user' || role === 'assistant';
}

function validateResponsesInput(input: unknown): Response | null {
	if (input === undefined || input === null) {
		return createErrorResponse('Input is required', 400, 'invalid_request_error');
	}

	if (typeof input === 'string') {
		return null;
	}

	if (!Array.isArray(input)) {
		return createErrorResponse('Input must be a string or an array', 400, 'invalid_request_error');
	}

	for (const item of input) {
		if (!item || typeof item !== 'object') {
			return createErrorResponse('Each input item must be an object', 400, 'invalid_request_error');
		}

		const { role, content } = item as Record<string, unknown>;
		if (!isValidResponsesRole(role)) {
			return createErrorResponse('Invalid input item role', 400, 'invalid_request_error');
		}
		if (typeof content !== 'string' && !Array.isArray(content)) {
			return createErrorResponse('Input item content must be a string or an array', 400, 'invalid_request_error');
		}
	}

	return null;
}

async function handleChatCompletion(
	request: Request,
	env: Env
): Promise<Response> {
	try {
		const body = (await request.json()) as ChatCompletionRequest;
		const { model, messages, temperature, max_tokens, top_p, stream } = body;

		const modelError = validateModel(model);
		if (modelError) {
			return modelError;
		}

		const unsupportedParameterError = validateUnsupportedParameter(top_p, 'top_p');
		if (unsupportedParameterError) {
			return unsupportedParameterError;
		}

		const messagesError = validateMessages(messages);
		if (messagesError) {
			return messagesError;
		}

		const temperatureError = validateNumberParameter(temperature, 'temperature');
		if (temperatureError) {
			return temperatureError;
		}

		const maxTokensError = validateNumberParameter(max_tokens, 'max_tokens');
		if (maxTokensError) {
			return maxTokensError;
		}

		const cfModel = MODEL_REGISTRY.getCloudflareModel(model)!;
		const aiOptions = buildChatAiOptions(cfModel, messages, temperature, max_tokens);

		const aiResponse = (await env.AI.run(cfModel, aiOptions)) as {
			response?: string;
			text?: string;
			choices?: Array<{
				text?: string;
				message?: { content?: string };
			}>;
			usage?: { prompt_tokens?: number; completion_tokens?: number };
		};

		const content = extractAiText(aiResponse);

		if (stream) {
			return createChatStreamResponse(model, content);
		}

		const response = withDebugInfo(
			createOpenAIResponse(model, content, aiResponse.usage),
			request,
			cfModel,
			aiResponse
		);
		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('Chat completion failed:', error);
		return createErrorResponse('Internal server error', 500, 'internal_error');
	}
}

// Handle OpenAI Responses API
async function handleResponses(
	request: Request,
	env: Env
): Promise<Response> {
	try {
		const body = (await request.json()) as ResponsesRequest;
		const { model, input, instructions, temperature, max_output_tokens, top_p, stream } = body;

		const modelError = validateModel(model);
		if (modelError) {
			return modelError;
		}

		const unsupportedParameterError = validateUnsupportedParameter(top_p, 'top_p');
		if (unsupportedParameterError) {
			return unsupportedParameterError;
		}

		const inputError = validateResponsesInput(input);
		if (inputError) {
			return inputError;
		}

		const temperatureError = validateNumberParameter(temperature, 'temperature');
		if (temperatureError) {
			return temperatureError;
		}

		const maxOutputTokensError = validateNumberParameter(max_output_tokens, 'max_output_tokens');
		if (maxOutputTokensError) {
			return maxOutputTokensError;
		}

		const cfModel = MODEL_REGISTRY.getCloudflareModel(model)!;
		const aiOptions = buildResponsesAiOptions(cfModel, input, instructions, temperature, max_output_tokens);

		const aiResponse = (await env.AI.run(cfModel, aiOptions)) as {
			response?: string;
			text?: string;
			choices?: Array<{
				text?: string;
				message?: { content?: string };
			}>;
			usage?: { prompt_tokens?: number; completion_tokens?: number };
		};

		const content = extractAiText(aiResponse);

		if (stream) {
			return createResponsesStreamResponse(model, content, aiResponse.usage);
		}

		const response = withDebugInfo(
			createResponsesResponse(model, content, aiResponse.usage),
			request,
			cfModel,
			aiResponse
		);
		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error) {
		console.error('Responses request failed:', error);
		return createErrorResponse('Internal server error', 500, 'internal_error');
	}
}

// List available models (OpenAI compatible)
function handleListModels(): Response {
	return new Response(
		JSON.stringify({
			object: 'list',
			data: MODEL_REGISTRY.listedModels,
		}),
		{
			headers: { 'Content-Type': 'application/json' },
		}
	);
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// CORS headers
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Debug-AI-Response',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		// Validate API key for protected endpoints
		const protectedEndpoints = ['/v1/chat/completions', '/v1/responses', '/api/ai'];
		if (protectedEndpoints.includes(url.pathname) && request.method === 'POST') {
			const authError = validateApiKey(request, env);
			if (authError) {
				return withCorsHeaders(authError, corsHeaders);
			}
		}

		let response: Response;

		if (url.pathname === '/v1/chat/completions' && request.method === 'POST') {
			response = await handleChatCompletion(request, env);
		} else if (url.pathname === '/v1/responses' && request.method === 'POST') {
			response = await handleResponses(request, env);
		} else if (url.pathname === '/v1/models' && request.method === 'GET') {
			response = handleListModels();
		} else if (url.pathname === '/api/ai' && request.method === 'POST') {
			// Legacy endpoint (redirect to OpenAI compatible)
			response = await handleChatCompletion(request, env);
		} else {
			// Return OpenAI-compatible error for unknown endpoints
			response = new Response(
				JSON.stringify({
					error: {
						message: `Invalid endpoint: ${url.pathname}`,
						type: 'invalid_request_error',
					},
				}),
				{ status: 404, headers: { 'Content-Type': 'application/json' } }
			);
		}

		return withCorsHeaders(response, corsHeaders);
	},
};
