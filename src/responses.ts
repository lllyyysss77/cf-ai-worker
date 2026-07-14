interface TokenUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
}

export function createOpenAIResponse(
	model: string,
	content: string,
	usage?: TokenUsage
): Record<string, unknown> {
	const promptTokens = usage?.prompt_tokens || 0;
	const completionTokens = usage?.completion_tokens || 0;

	return {
		id: `chatcmpl-${crypto.randomUUID()}`,
		object: 'chat.completion',
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [
			{
				index: 0,
				message: {
					role: 'assistant',
					content,
				},
				finish_reason: 'stop',
			},
		],
		usage: {
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			total_tokens: promptTokens + completionTokens,
		},
	};
}

export function createResponsesResponse(
	model: string,
	content: string,
	usage?: TokenUsage
): Record<string, unknown> {
	const promptTokens = usage?.prompt_tokens || 0;
	const completionTokens = usage?.completion_tokens || 0;

	return {
		id: `resp_${crypto.randomUUID().replace(/-/g, '')}`,
		object: 'response',
		created_at: Math.floor(Date.now() / 1000),
		model,
		output: [
			{
				type: 'message',
				id: `msg_${crypto.randomUUID().replace(/-/g, '')}`,
				role: 'assistant',
				content: [
					{
						type: 'output_text',
						text: content,
					},
				],
			},
		],
		usage: {
			input_tokens: promptTokens,
			output_tokens: completionTokens,
			total_tokens: promptTokens + completionTokens,
		},
	};
}

export function createResponsesCreatedEvent(responseId: string, model: string): string {
	return `data: ${JSON.stringify({
		type: 'response.created',
		response: {
			id: responseId,
			object: 'response',
			created_at: Math.floor(Date.now() / 1000),
			model,
			status: 'in_progress',
			error: null,
			incomplete_details: null,
			instructions: null,
			max_output_tokens: null,
			output: [],
			parallel_tool_calls: true,
			previous_response_id: null,
			reasoning: { effort: 'medium', generate_summary: null },
			store: true,
			temperature: 1.0,
			text: { format: { type: 'text' } },
			tool_choice: 'auto',
			tools: [],
			top_p: 1.0,
			truncation: 'disabled',
			usage: null,
			user: null,
			metadata: {},
		},
	})}\n\n`;
}

export function createResponsesOutputItemAddedEvent(
	_responseId: string,
	itemId: string,
	outputIndex: number
): string {
	return `data: ${JSON.stringify({
		type: 'response.output_item.added',
		output_index: outputIndex,
		item: {
			id: itemId,
			type: 'message',
			role: 'assistant',
			content: [],
			status: 'in_progress',
		},
	})}\n\n`;
}

export function createResponsesContentPartAddedEvent(
	itemId: string,
	outputIndex: number,
	contentIndex: number
): string {
	return `data: ${JSON.stringify({
		type: 'response.content_part.added',
		item_id: itemId,
		output_index: outputIndex,
		content_index: contentIndex,
		part: {
			type: 'output_text',
			text: '',
		},
	})}\n\n`;
}

export function createResponsesOutputTextDeltaEvent(
	itemId: string,
	outputIndex: number,
	contentIndex: number,
	delta: string
): string {
	return `data: ${JSON.stringify({
		type: 'response.output_text.delta',
		item_id: itemId,
		output_index: outputIndex,
		content_index: contentIndex,
		delta,
	})}\n\n`;
}

export function createResponsesOutputTextDoneEvent(
	itemId: string,
	outputIndex: number,
	contentIndex: number,
	text: string
): string {
	return `data: ${JSON.stringify({
		type: 'response.output_text.done',
		item_id: itemId,
		output_index: outputIndex,
		content_index: contentIndex,
		text,
	})}\n\n`;
}

export function createResponsesContentPartDoneEvent(
	itemId: string,
	outputIndex: number,
	contentIndex: number
): string {
	return `data: ${JSON.stringify({
		type: 'response.content_part.done',
		item_id: itemId,
		output_index: outputIndex,
		content_index: contentIndex,
		part: {
			type: 'output_text',
			text: '',
		},
	})}\n\n`;
}

export function createResponsesOutputItemDoneEvent(
	itemId: string,
	outputIndex: number
): string {
	return `data: ${JSON.stringify({
		type: 'response.output_item.done',
		output_index: outputIndex,
		item: {
			id: itemId,
			type: 'message',
			role: 'assistant',
			content: [],
			status: 'completed',
		},
	})}\n\n`;
}

export function createResponsesCompletedEvent(
	responseId: string,
	model: string,
	inputTokens: number,
	outputTokens: number
): string {
	return `data: ${JSON.stringify({
		type: 'response.completed',
		response: {
			id: responseId,
			object: 'response',
			created_at: Math.floor(Date.now() / 1000),
			model,
			status: 'completed',
			error: null,
			incomplete_details: null,
			instructions: null,
			max_output_tokens: null,
			output: [],
			parallel_tool_calls: true,
			previous_response_id: null,
			reasoning: { effort: 'medium', generate_summary: null },
			store: true,
			temperature: 1.0,
			text: { format: { type: 'text' } },
			tool_choice: 'auto',
			tools: [],
			top_p: 1.0,
			truncation: 'disabled',
			usage: {
				input_tokens: inputTokens,
				output_tokens: outputTokens,
				total_tokens: inputTokens + outputTokens,
				input_tokens_details: { cached_tokens: 0 },
				output_tokens_details: { reasoning_tokens: 0 },
			},
			user: null,
			metadata: {},
		},
	})}\n\n`;
}

