// Drafts the actual email reply — genuine generation, stays on the LLM.
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function draftReply(ticket, decision) {
  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Write an empathetic reply to this ${decision.department} ticket. Urgent: ${decision.urgent}.`,
      },
    ],
  });
  return res.content[0].text;
}
