import { defineAgent } from 'eve'

export default defineAgent({
  model: 'anthropic/claude-sonnet-4-5',
  // Escape hatch: skip the AI Gateway model catalog lookup (needs `eve link`)
  // by declaring the context window explicitly. Sonnet 4.5 = 200k tokens.
  modelContextWindowTokens: 200_000,
})
