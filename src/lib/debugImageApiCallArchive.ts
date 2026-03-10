import type { ImageApiCallLogRecord } from './imageApiCallLog'

type ArchiveDebugImageApiCallParams = {
  runId?: string
  record: ImageApiCallLogRecord
}

type ArchiveDebugImageApiCallResponse = {
  runId: string
  folder: string
  file: string
  appended: boolean
}

const ENDPOINT = '/api/local-debug/save-image-api-call'

export const archiveDebugImageApiCall = async (
  params: ArchiveDebugImageApiCallParams
): Promise<ArchiveDebugImageApiCallResponse> => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      runId: params.runId,
      record: params.record,
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `保存调用日志失败（${response.status}）`)
  }

  return (await response.json()) as ArchiveDebugImageApiCallResponse
}

