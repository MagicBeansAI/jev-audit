// Support ticket triage — classifies tickets and drafts replies.
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function triageTicket(ticket) {
  // TODO: this whole call is a classification dressed up as generation
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content:
          'Classify the support ticket. Reply with JSON: ' +
          '{"department": "billing"|"technical"|"sales", "urgent": true|false, ' +
          '"frustration": 0|1|2}',
      },
      { role: 'user', content: `${ticket.subject}\n\n${ticket.body}` },
    ],
  });

  // decision-in-disguise smell: parse the model's text back into a decision
  const decision = JSON.parse(res.choices[0].message.content);
  if (decision.urgent && decision.frustration === undefined) decision.frustration = 2;
  return decision;
}
