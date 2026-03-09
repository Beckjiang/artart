import type { ServerResponse } from 'node:http'
import type { AgentStreamEvent } from '../../src/lib/agentChatTypes'

type Subscriber = {
  id: string
  response: ServerResponse
}

const subscribers = new Map<string, Map<string, Subscriber>>()

export const addSubscriber = (boardId: string, id: string, response: ServerResponse) => {
  const boardSubscribers = subscribers.get(boardId) ?? new Map<string, Subscriber>()
  boardSubscribers.set(id, {
    id,
    response,
  })
  subscribers.set(boardId, boardSubscribers)
}

export const removeSubscriber = (boardId: string, id: string) => {
  const boardSubscribers = subscribers.get(boardId)
  if (!boardSubscribers) return

  boardSubscribers.delete(id)
  if (boardSubscribers.size === 0) {
    subscribers.delete(boardId)
  }
}

export const publishEvent = (boardId: string, event: AgentStreamEvent) => {
  const boardSubscribers = subscribers.get(boardId)
  if (!boardSubscribers) return

  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const subscriber of boardSubscribers.values()) {
    subscriber.response.write(payload)
  }
}
