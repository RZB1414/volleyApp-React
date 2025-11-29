import { useRef, useState } from 'react'
import PageSection from '@/components/PageSection.js'
import { api } from '@/services/api.js'
import { formatBytes, uploadPartsSequentially } from '@/services/multipartHelper.js'
import { useAuth } from '@/hooks/useAuth.js'
import { recordCompletedUpload } from '@/utils/completedUploadsStorage.js'

const getTimestamp = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())

const splitFileName = (fileName = '') => {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
    return { base: fileName, extension: '' }
  }
  return {
    base: fileName.slice(0, lastDotIndex),
    extension: fileName.slice(lastDotIndex),
  }
}

const UploadManager = () => {
  const [file, setFile] = useState(null)
  const [customFileBase, setCustomFileBase] = useState('')
  const [fileExtension, setFileExtension] = useState('')
  const [session, setSession] = useState(null)
  const [parts, setParts] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [uploadSpeed, setUploadSpeed] = useState(0)
  const [recentSuccess, setRecentSuccess] = useState(null)
  const controllerRef = useRef(null)
  const fileInputRef = useRef(null)
  const uploadStartTimeRef = useRef(null)
  const renameInputRef = useRef(null)
  const { userId } = useAuth()

  const reset = ({ preserveSuccess = false } = {}) => {
    setSession(null)
    setParts([])
    setStatus('idle')
    setError(null)
    setProgress(0)
    setUploadedBytes(0)
    setUploadSpeed(0)
    uploadStartTimeRef.current = null
    setCustomFileBase('')
    setFileExtension('')
    setFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (!preserveSuccess) {
      setRecentSuccess(null)
    }
  }

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0]
    reset()
    setFile(selected ?? null)
    if (selected) {
      const { base, extension } = splitFileName(selected.name)
      setCustomFileBase(base)
      setFileExtension(extension)
      requestAnimationFrame(() => {
        renameInputRef.current?.focus()
      })
    } else {
      setCustomFileBase('')
      setFileExtension('')
    }
  }

  const createSession = async () => {
    const baseName = customFileBase.trim()
    const effectiveFileName = baseName ? `${baseName}${fileExtension}` : ''
    if (!file || !effectiveFileName) return
    setStatus('creating')
    setError(null)
    try {
      const sessionResponse = await api.upload.createSession({
        fileName: effectiveFileName,
        contentType: file.type,
        fileSizeBytes: file.size,
      })
      
      const normalizedSession = {
        ...sessionResponse,
        originalFileName: sessionResponse.originalFileName ?? effectiveFileName,
      }
      setSession(normalizedSession)
      await uploadChunks(normalizedSession)
    } catch (err) {
      setError(err.message)
      setStatus('error')      
    }
  }

  const uploadChunks = async (sessionResponse) => {
    if (!sessionResponse) return
    controllerRef.current = new AbortController()
    setStatus('uploading')
    uploadStartTimeRef.current = getTimestamp()
    try {
      const completed = await uploadPartsSequentially({
        file,
        urls: sessionResponse.urls,
        chunkSizeBytes: sessionResponse.chunkSizeBytes,
        signal: controllerRef.current.signal,
        onProgress: ({ percent, uploadedBytes: bytes }) => {
          setProgress(percent)
          setUploadedBytes(bytes)
          const startTime = uploadStartTimeRef.current
          const now = getTimestamp()
          if (startTime) {
            const elapsedMs = Math.max(1, now - startTime)
            const bytesPerSecond = bytes / (elapsedMs / 1000)
            setUploadSpeed(bytesPerSecond)
          }
        },
      })
      
      setParts(completed)
      setStatus('awaiting-finalize')
      await finalizeUpload(sessionResponse, completed)
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('idle')
        return
      }
      throw err
    }
  }

  const finalizeUpload = async (sessionOverride, partsOverride) => {
    const activeSession = sessionOverride ?? session
    const activeParts = partsOverride ?? parts
    if (!activeSession || activeParts.length === 0) return
    const resolvedFileName = customFileBase.trim()
      ? `${customFileBase.trim()}${fileExtension}`
      : activeSession.originalFileName || file?.name || activeSession.fileKey
    try {
      setStatus('finalizing')
      const uploadCompletedResponse = await api.upload.complete({
        fileKey: activeSession.fileKey,
        fileName: resolvedFileName,
        uploadId: activeSession.uploadId,
        parts: activeParts.map(({ partNumber, ETag }) => ({ partNumber, ETag })),
      })
      
      setUploadSpeed(0)
      recordCompletedUpload(userId, {
        fileKey: uploadCompletedResponse?.key ?? activeSession.fileKey,
        displayName: resolvedFileName,
        originalFileName: resolvedFileName,
        bucket: uploadCompletedResponse?.bucket,
        size: file?.size ?? activeSession.fileSizeBytes,
        contentType: file?.type ?? activeSession.contentType,
      })
      setRecentSuccess(`"${resolvedFileName}" uploaded.`)
      reset({ preserveSuccess: true })
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const cancelUpload = async () => {
    controllerRef.current?.abort()
    if (session) {
      try {
        const resolvedFileName = customFileBase.trim()
          ? `${customFileBase.trim()}${fileExtension}`
          : session.originalFileName || file?.name || session.fileKey
        await api.upload.cancel({
          fileKey: session.fileKey,
          fileName: resolvedFileName,
          uploadId: session.uploadId,
        })
      } catch (err) {
        console.error('Failed to cancel session', err)
      }
    }
    reset()
  }

  const busyStatuses = ['creating', 'uploading', 'finalizing']
  const trimmedBaseName = customFileBase.trim()
  const effectiveFileName = trimmedBaseName ? `${trimmedBaseName}${fileExtension}` : ''
  const disableStart = !file || busyStatuses.includes(status) || !trimmedBaseName

  return (
      <PageSection title="Upload your video" description="Upload large videos with real-time progress tracking">
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm font-semibold text-slate-200">
            File
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Select file
              </button>
              <span className="text-xs font-normal text-slate-400">
                {file ? file.name : 'No file selected yet'}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
          {file && (
            <label className="flex flex-col gap-2 text-sm font-semibold text-slate-200">
              Opponent Team
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  ref={renameInputRef}
                  className="flex-1 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm font-normal text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
                  placeholder="Enter file name"
                  value={customFileBase}
                  onChange={(event) => {
                    const rawValue = event.target.value
                    const maybeStripped = fileExtension && rawValue.endsWith(fileExtension)
                      ? rawValue.slice(0, -fileExtension.length)
                      : rawValue
                    setCustomFileBase(maybeStripped)
                  }}
                  disabled={busyStatuses.includes(status)}
                />
                {fileExtension && (
                  <span className="text-sm font-normal text-slate-400">
                    {fileExtension}
                  </span>
                )}
              </div>
              <span className="text-xs font-normal text-slate-500">
                Extension stays locked to the original format.
              </span>
            </label>
          )}
          {file && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
              <p>{effectiveFileName}</p>
              <p>{formatBytes(file.size)}</p>
            </div>
          )}
          {status === 'uploading' && (
            <div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="h-full bg-emerald-400" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {progress}% • {formatBytes(uploadedBytes)} uploaded of {file ? formatBytes(file.size) : '0 B'}
                {uploadSpeed > 0 && ` • ${formatBytes(uploadSpeed)}/s`}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={createSession} disabled={disableStart}>
              {status === 'creating' ? 'Preparing...' : 'Start upload'}
            </button>
            {file && (
              <button type="button" className="btn-secondary" onClick={cancelUpload}>
                Cancel
              </button>
            )}
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {recentSuccess && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
              <span>{recentSuccess}</span>
              <button
                type="button"
                className="text-emerald-200 transition hover:text-white"
                onClick={() => setRecentSuccess(null)}
                aria-label="Dismiss success banner"
              >
                ×
              </button>
            </div>
          )}
        </div>
      </PageSection>
  )
}

export default UploadManager
