import {
  planWhatsAppToolAgent,
  writeWhatsAppToolAgentReply,
  type WhatsAppAiResult,
  type WhatsAppToolAgentInput,
  type WhatsAppToolName,
} from './ai'

export type WhatsAppToolCall = {
  name: WhatsAppToolName
  rating?: number | null
}

export type WhatsAppToolResult = {
  tool: WhatsAppToolName
  ok: boolean
  data: Record<string, unknown>
}

export type WhatsAppToolAgentOutcome = {
  success: boolean
  replyText: string | null
  toolCalls: WhatsAppToolCall[]
  toolResults: WhatsAppToolResult[]
  aiResults: Array<WhatsAppAiResult<unknown>>
  aiResultTasks: Array<'tool_agent_plan' | 'tool_agent_reply'>
  error?: string
}

export async function runWhatsAppToolAgent(input: {
  assistant: WhatsAppToolAgentInput
  executeTool: (call: WhatsAppToolCall) => Promise<WhatsAppToolResult>
  forcedToolCalls?: WhatsAppToolCall[]
  deferReplyWhen?: (calls: WhatsAppToolCall[], results: WhatsAppToolResult[]) => boolean
  writeReply?: typeof writeWhatsAppToolAgentReply
}): Promise<WhatsAppToolAgentOutcome> {
  const aiResults: Array<WhatsAppAiResult<unknown>> = []
  const aiResultTasks: Array<'tool_agent_plan' | 'tool_agent_reply'> = []
  let toolCalls: WhatsAppToolCall[]

  if (input.forcedToolCalls) {
    toolCalls = input.forcedToolCalls.map((call) => ({ name: call.name, rating: call.rating ?? null }))
  } else {
    const plan = await planWhatsAppToolAgent(input.assistant)
    aiResults.push(plan)
    aiResultTasks.push('tool_agent_plan')

    if (!plan.success) {
      return {
        success: false,
        replyText: null,
        toolCalls: [],
        toolResults: [],
        aiResults,
        aiResultTasks,
        error: plan.error,
      }
    }

    toolCalls = plan.data.tool_calls.map((call) => ({
      name: call.name,
      rating: call.rating ?? null,
    }))

    if (toolCalls.length === 0) {
      return {
        success: Boolean(plan.data.reply_text),
        replyText: plan.data.reply_text,
        toolCalls,
        toolResults: [],
        aiResults,
        aiResultTasks,
        ...(plan.data.reply_text ? {} : { error: 'A IA nao retornou resposta nem consulta.' }),
      }
    }
  }

  const toolResults: WhatsAppToolResult[] = []
  for (const call of toolCalls) {
    try {
      toolResults.push(await input.executeTool(call))
    } catch (error) {
      toolResults.push({
        tool: call.name,
        ok: false,
        data: {
          code: 'tool_execution_failed',
          message: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  if (input.deferReplyWhen?.(toolCalls, toolResults)) {
    return { success: true, replyText: null, toolCalls, toolResults, aiResults, aiResultTasks }
  }

  const reply = await (input.writeReply ?? writeWhatsAppToolAgentReply)(input.assistant, toolResults)
  aiResults.push(reply)
  aiResultTasks.push('tool_agent_reply')
  if (!reply.success) {
    return {
      success: false,
      replyText: null,
      toolCalls,
      toolResults,
      aiResults,
      aiResultTasks,
      error: reply.error,
    }
  }

  return {
    success: true,
    replyText: reply.data.reply_text,
    toolCalls,
    toolResults,
    aiResults,
    aiResultTasks,
  }
}
