import { buildApiUrl } from './runtime'

type DebugImageItem = {
  label: string
  url?: string
  mimeType?: string | null
}

type ArchiveDebugImagesParams = {
  runId?: string
  prompt: string
  images: DebugImageItem[]
}

type ArchiveDebugImagesResponse = {
  runId: string
  folder: string
  saved: number
  failed: number
}

const ENDPOINT = buildApiUrl('/api/local-debug/save-image-set')

export const archiveDebugImages = async (
  params: ArchiveDebugImagesParams
): Promise<ArchiveDebugImagesResponse> => {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      runId: params.runId,
      prompt: params.prompt,
      images: params.images,
    }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `保存调试图片失败（${response.status}）`)
  }

  return (await response.json()) as ArchiveDebugImagesResponse
}
