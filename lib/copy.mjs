// Drafts classic-carousel copy with Claude.
//
// Structured output via a strict tool rather than "reply with JSON": strict
// tool use validates the shape server-side, so the script never has to regex a
// JSON object out of prose or retry a malformed reply. The tool is never
// executed - it exists purely as the schema.
//
// The slide briefs come from config.json's `script`, not from this file. That
// matters: the whole point of the classic template is that each headline sits
// over a SPECIFIC screenshot, so the model has to be told which screen it is
// writing slide 4 for. Restating the script here would let the prompt and the
// renderer drift apart, and the failure would be silent - the copy would still
// render, over the wrong screen.
//
// Cost is not a reason to downgrade the model. One post is roughly 1.5K input
// and 400 output tokens - a fraction of a cent on claude-opus-5 - and the copy
// IS the product here. Everything else in the pipeline just moves pixels.

import Anthropic from '@anthropic-ai/sdk';

// The house style and its enforcement are shared with the manual path
// (`brief` + `import`), which must load them without the SDK present.
import { systemFor, normalise } from './houserules.mjs';

const SUBMIT_TOOL = {
  name: 'submit_carousel',
  description: 'Submit one finished classic carousel draft.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      hook: {
        type: 'string',
        description: 'Slide 1, over a football photo. Frames the list. Names no feature. No terminal period.',
      },
      features: {
        type: 'array',
        description:
          'One headline per app screenshot, in the order the slides were briefed. 30-60 characters each.',
        items: { type: 'string' },
      },
      caption: {
        type: 'string',
        description:
          'Two to four words for the post caption, before the hashtags. Lowercase-ish, casual, no period.',
      },
    },
    required: ['hook', 'features', 'caption'],
    additionalProperties: false,
  },
};

/**
 * Draft `count` carousels.
 *
 * `recentHooks` are fed back in as a do-not-repeat list. Without it the model
 * converges hard - ask for five carousels across five separate calls and you
 * get five variations on "top 5 apps every footballer needs", which is exactly
 * the drift the queue exists to catch. It matters more on this template than
 * on the other one: the four feature slides are pinned to fixed screenshots,
 * so the hook is most of what actually varies between posts.
 */
export async function draftPosts({ count, briefs, topic, recentHooks, model, effort }) {
  const client = new Anthropic();

  const avoid = recentHooks.length
    ? `\n\nAlready posted or queued - do not repeat these angles, and do not write a near-synonym of one:\n${recentHooks
        .map((h) => `- ${h}`)
        .join('\n')}`
    : '';

  const ask =
    `Draft ${count} distinct carousel${count === 1 ? '' : 's'}. ` +
    (topic ? `Theme: ${topic}. ` : '') +
    `Call submit_carousel once per carousel - ${count} tool call${count === 1 ? '' : 's'} in total, ` +
    `each with exactly ${briefs.length} feature headlines in the briefed order. ` +
    `Vary the hook between them: a list framing, a problem framing and a direct ` +
    `recommendation all read differently in the feed.${avoid}`;

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: systemFor(briefs),
    thinking: { type: 'adaptive' },
    output_config: { effort },
    tools: [SUBMIT_TOOL],
    messages: [{ role: 'user', content: ask }],
  });

  const drafts = response.content
    .filter((block) => block.type === 'tool_use' && block.name === 'submit_carousel')
    .map((block) => block.input);

  if (!drafts.length) {
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    throw new Error(
      `Claude returned no carousels (stop_reason: ${response.stop_reason}).` +
        (text ? `\nIt said: ${text.slice(0, 400)}` : '')
    );
  }

  return drafts.map(normalise);
}
