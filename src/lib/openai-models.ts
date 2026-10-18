// Configuracao compartilhada dos modelos OpenAI usados pelo backend.
// Variaveis especificas herdam o modelo geral quando nao estao definidas.
export const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL?.trim() || 'gpt-5.4-mini'
export const OPENAI_VISION_MODEL = process.env.OPENAI_VISION_MODEL?.trim() || OPENAI_TEXT_MODEL
export const WHATSAPP_OPENAI_MODEL = process.env.WHATSAPP_AI_OPENAI_MODEL?.trim() || OPENAI_TEXT_MODEL
export const WHATSAPP_OPENAI_ORDER_HANDOFF_MODEL =
  process.env.WHATSAPP_AI_OPENAI_ORDER_HANDOFF_MODEL?.trim() || WHATSAPP_OPENAI_MODEL
export const WHATSAPP_OPENAI_CLASSIFICATION_MODEL =
  process.env.WHATSAPP_AI_OPENAI_CLASSIFICATION_MODEL?.trim() || WHATSAPP_OPENAI_MODEL
export const WHATSAPP_OPENAI_ORDER_STATUS_MODEL =
  process.env.WHATSAPP_AI_OPENAI_ORDER_STATUS_MODEL?.trim() || WHATSAPP_OPENAI_MODEL
export const DAILY_STORE_HEALTH_OPENAI_MODEL =
  process.env.DAILY_STORE_HEALTH_OPENAI_MODEL?.trim() || OPENAI_TEXT_MODEL

// Alternativas opcionais, em ordem, separadas por virgula.
export const OPENAI_TEXT_FALLBACK_MODELS = (process.env.OPENAI_TEXT_FALLBACK_MODELS || '')
  .split(',')
  .map(model => model.trim())
  .filter(Boolean)
