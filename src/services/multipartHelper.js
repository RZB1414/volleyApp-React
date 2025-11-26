const DEFAULT_RETRIES = 2
const RETRY_DELAY_BASE_MS = 500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const sanitizeEtag = (etag, fallback) => (etag ? etag.replaceAll('"', '') : fallback)

const createAbortError = () => {
  const error = new Error('Upload aborted')
  error.name = 'AbortError'
  return error
}

export const sliceFileIntoParts = (file, chunkSizeBytes) => {
  if (!file || !chunkSizeBytes) return []
  const parts = []
  let offset = 0
  let partNumber = 1
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + chunkSizeBytes)
    parts.push({ partNumber, chunk })
    offset += chunkSizeBytes
    partNumber += 1
  }
  return parts
}

export const uploadPartsSequentially = async ({
  file,
  urls,
  chunkSizeBytes,
  signal,
  onProgress,
  fetcher = fetch,
  retries = DEFAULT_RETRIES,
  preferXHR = true,
}) => {
  if (!file || !urls?.length) {
    throw new Error('Missing file or upload URLs')
  }

  const totalBytes = file.size
  let uploadedBytes = 0
  const completedParts = []
  const canUseXHR = preferXHR && typeof XMLHttpRequest !== 'undefined' && fetcher === fetch

  const addBytesAndEmit = (delta, partNumber) => {
    if (!delta || Number.isNaN(delta) || !Number.isFinite(delta)) return
    uploadedBytes = Math.min(totalBytes, uploadedBytes + delta)
    const percent = totalBytes === 0 ? 0 : Math.round((uploadedBytes / totalBytes) * 100)
    onProgress?.({
      uploadedBytes,
      totalBytes,
      percent,
      partNumber,
    })
  }

  for (const { partNumber, url } of urls) {
    const start = (partNumber - 1) * chunkSizeBytes
    const chunk = file.slice(start, Math.min(start + chunkSizeBytes, totalBytes))
    let attempt = 0
    let success = false

    while (!success && attempt <= retries) {
      try {
        attempt += 1
        const partResult = canUseXHR
          ? await uploadWithXHR({
              url,
              chunk,
              partNumber,
              file,
              signal,
              onBytes: (delta) => addBytesAndEmit(delta, partNumber),
            })
          : await uploadWithFetch({ url, chunk, partNumber, file, signal, fetcher })

        if (!canUseXHR) {
          addBytesAndEmit(chunk.size, partNumber)
        }

        completedParts.push(partResult)
        success = true
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw error
        }
        if (attempt > retries) {
          throw new Error(`Upload failed for part ${partNumber}`)
        }
        await sleep(RETRY_DELAY_BASE_MS * attempt)
      }
    }
  }

  return completedParts
}

const uploadWithFetch = async ({ url, chunk, partNumber, file, signal, fetcher }) => {
  const response = await fetcher(url, {
    method: 'PUT',
    body: chunk,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Upload failed for part ${partNumber}`)
  }

  const etag = response.headers.get('ETag') || response.headers.get('etag') || `part-${partNumber}`
  return { partNumber, ETag: sanitizeEtag(etag, `part-${partNumber}`), bytes: chunk.size }
}

const uploadWithXHR = ({ url, chunk, partNumber, file, signal, onBytes }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    xhr.responseType = 'text'
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    let partUploaded = 0
    const safeEmit = (loaded) => {
      const delta = loaded - partUploaded
      if (delta <= 0) return
      partUploaded = loaded
      onBytes?.(delta)
    }

    const abortHandler = () => {
      xhr.abort()
    }

    if (signal) {
      if (signal.aborted) {
        reject(createAbortError())
        return
      }
      signal.addEventListener('abort', abortHandler)
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      safeEmit(event.loaded)
    }

    xhr.onerror = () => {
      cleanup()
      reject(new Error(`Upload failed for part ${partNumber}`))
    }

    xhr.onabort = () => {
      cleanup()
      reject(createAbortError())
    }

    xhr.onload = () => {
      cleanup()
      safeEmit(chunk.size)
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || `part-${partNumber}`
        resolve({ partNumber, ETag: sanitizeEtag(etag, `part-${partNumber}`), bytes: chunk.size })
        return
      }
      reject(new Error(`Upload failed for part ${partNumber}`))
    }

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener('abort', abortHandler)
      }
    }

    try {
      xhr.send(chunk)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })

export const formatBytes = (bytes, decimals = 1) => {
  if (!Number.isFinite(bytes)) return '0 B'
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
