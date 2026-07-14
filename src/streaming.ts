import {
	createResponsesCompletedEvent,
	createResponsesContentPartAddedEvent,
	createResponsesContentPartDoneEvent,
	createResponsesCreatedEvent,
	createResponsesOutputItemAddedEvent,
	createResponsesOutputItemDoneEvent,
	createResponsesOutputTextDeltaEvent,
	createResponsesOutputTextDoneEvent,
} from './responses';

interface TokenUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
}

export function createChatStreamResponse(model: string, content: string): Response {
	const encoder = new TextEncoder();
	const streamContent = content;
	let index = 0;

	const readableStream = new ReadableStream({
		start(controller) {
			const sendChunk = () => {
				if (index < streamContent.length) {
					const chunk = streamContent.slice(index, index + 4);
					controller.enqueue(
						encoder.encode(createChatStreamChunk(model, chunk))
					);
					index += 4;
					setTimeout(sendChunk, 20);
				} else {
					controller.enqueue(encoder.encode(createChatStreamChunk(model, '', true)));
					controller.enqueue(encoder.encode('data: [DONE]\n\n'));
					controller.close();
				}
			};
			sendChunk();
		},
	});

	return new Response(readableStream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
}

function createChatStreamChunk(model: string, content: string, isDone: boolean = false): string {
	const chunk = {
		id: `chatcmpl-${crypto.randomUUID()}`,
		object: 'chat.completion.chunk',
		created: Math.floor(Date.now() / 1000),
		model,
		choices: [
			{
				index: 0,
				delta: isDone ? {} : { content },
				finish_reason: isDone ? 'stop' : null,
			},
		],
	};
	return `data: ${JSON.stringify(chunk)}\n\n`;
}

export function createResponsesStreamResponse(
	model: string,
	content: string,
	usage?: TokenUsage
): Response {
	const encoder = new TextEncoder();
	const streamContent = content;
	const responseId = `resp_${crypto.randomUUID().replace(/-/g, '')}`;
	const itemId = `msg_${crypto.randomUUID().replace(/-/g, '')}`;
	const outputIndex = 0;
	const contentIndex = 0;
	let index = 0;

	const readableStream = new ReadableStream({
		start(controller) {
			controller.enqueue(
				encoder.encode(createResponsesCreatedEvent(responseId, model))
			);
			controller.enqueue(
				encoder.encode(createResponsesOutputItemAddedEvent(responseId, itemId, outputIndex))
			);
			controller.enqueue(
				encoder.encode(createResponsesContentPartAddedEvent(itemId, outputIndex, contentIndex))
			);

			const sendChunk = () => {
				if (index < streamContent.length) {
					const chunk = streamContent.slice(index, index + 4);
					controller.enqueue(
						encoder.encode(
							createResponsesOutputTextDeltaEvent(itemId, outputIndex, contentIndex, chunk)
						)
					);
					index += 4;
					setTimeout(sendChunk, 20);
				} else {
					controller.enqueue(
						encoder.encode(
							createResponsesOutputTextDoneEvent(itemId, outputIndex, contentIndex, streamContent)
						)
					);
					controller.enqueue(
						encoder.encode(createResponsesContentPartDoneEvent(itemId, outputIndex, contentIndex))
					);
					controller.enqueue(
						encoder.encode(createResponsesOutputItemDoneEvent(itemId, outputIndex))
					);
					controller.enqueue(
						encoder.encode(
							createResponsesCompletedEvent(
								responseId,
								model,
								usage?.prompt_tokens ?? 0,
								usage?.completion_tokens ?? Math.ceil(streamContent.length / 4)
							)
						)
					);
					controller.close();
				}
			};
			sendChunk();
		},
	});

	return new Response(readableStream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		},
	});
}
