import { describe, expect, it, vi } from 'vitest'
import { sliceFileIntoParts, uploadPartsSequentially } from '@/services/multipartHelper.js'

const makeFile = (size) => new File([new Uint8Array(size)], 'sample.bin', { type: 'application/octet-stream' })

describe('multipartHelper', () => {
  it('slices files respecting chunk size', () => {
    const file = makeFile(5 * 1024)
    const parts = sliceFileIntoParts(file, 1024)
    expect(parts).toHaveLength(5)
    expect(parts[0].partNumber).toBe(1)
    expect(parts.at(-1).partNumber).toBe(5)
  })

  it('uploads sequential chunks and collects ETags', async () => {
    const file = makeFile(2 * 1024)
    const urls = [
      { partNumber: 1, url: 'https://storage/1' },
      { partNumber: 2, url: 'https://storage/2' },
    ]

    const fetcher = vi.fn((url) => {
      const tag = url.endsWith('/1') ? 'etag-one' : 'etag-two'
      return Promise.resolve({
        ok: true,
        headers: {
          get: (header) => (header.toLowerCase() === 'etag' ? tag : null),
        },
      })
    })

    const parts = await uploadPartsSequentially({
      file,
      urls,
      chunkSizeBytes: 1024,
      fetcher,
      onProgress: vi.fn(),
    })

    expect(parts).toEqual([
      { partNumber: 1, ETag: 'etag-one', bytes: 1024 },
      { partNumber: 2, ETag: 'etag-two', bytes: 1024 },
    ])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
