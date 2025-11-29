import { useEffect, useMemo, useState } from 'react'
import PageSection from '@/components/PageSection.js'
import { api } from '@/services/api.js'
import { useAuth } from '@/hooks/useAuth.js'
import { formatBytes } from '@/services/multipartHelper.js'
import { listCompletedUploads } from '@/utils/completedUploadsStorage.js'

const normalizeBaseUrl = () => (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const buildDownloadUrl = ({ token, path } = {}) => {
  const incomingPath = path ?? (token ? `/download/use/${token}` : null)
  if (!incomingPath) return null
  if (incomingPath.startsWith('http')) {
    return incomingPath
  }
  const baseUrl = normalizeBaseUrl()
  return baseUrl ? `${baseUrl}${incomingPath}` : incomingPath
}
const triggerBrowserDownload = (url, suggestedName) => {
  if (!url || typeof window === 'undefined') return
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  if (suggestedName) {
    anchor.download = suggestedName
  }
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

const DownloadTokens = () => {
  const { userId } = useAuth()
  const [uploads, setUploads] = useState([])
  const [error, setError] = useState(null)
  const [loadingId, setLoadingId] = useState(null)
  const [listLoading, setListLoading] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const completedUploadIndex = useMemo(() => {
    if (!userId) return new Map()
    const entries = listCompletedUploads(userId)
    const index = new Map()
    entries.forEach((entry) => {
      if (entry.fileKey) {
        index.set(entry.fileKey, entry)
      }
    })
    return index
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setUploads([])
      return
    }

    let active = true
    const load = async () => {
      setListLoading(true)
      setError(null)
      try {
        const response = await api.upload.completed({ userId })
        if (!active) return
        const mapped = (response?.uploads ?? [])
          .map((item, index) => {
          const fileKey = item.fileKey ?? item.key ?? item.path ?? item.fileName ?? ''
          const display = item.displayName ?? item.originalFileName ?? item.fileName ?? fileKey
          const stored = completedUploadIndex.get(fileKey)
          const rawName = display || stored?.displayName || fileKey
          const plainName = rawName?.split('/').pop() || rawName
          return {
            id: item.id ?? item.uploadId ?? (fileKey || `${index}`),
            fileKey,
            displayName: plainName,
            originalFileName: rawName,
            size: item.size ?? item.sizeBytes ?? item.bytes ?? 0,
            uploadedAt:
              item.completedAt ??
              item.uploadedAt ??
              item.updatedAt ??
              item.createdAt ??
              stored?.uploadedAt ??
              null,
          }
        })
          .filter((entry) => Boolean(entry.fileKey))
          .sort((a, b) => {
            const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0
            const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0
            return dateB - dateA
          })
        setUploads(mapped)
      } catch (err) {
        if (!active) return
        setError(err.message)
        setUploads([])
      } finally {
        if (active) {
          setListLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [userId, completedUploadIndex])

  const handleDownload = async (entry) => {
    setLoadingId(entry.id)
    setError(null)
    try {
      const response = await api.download.generateToken({
        fileName: entry.fileKey,
        uploadedAt: entry.uploadedAt,
      })
      const downloadUrl = buildDownloadUrl({ token: response?.token, path: response?.url })
      if (downloadUrl) {
        const downloadName = entry.originalFileName || entry.displayName || entry.fileKey
        triggerBrowserDownload(downloadUrl, downloadName)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingId(null)
    }
  }

  const handleDeleteRequest = (entry) => {
    if (!entry?.id) return
    setPendingDeleteId(entry.id)
  }

  const handleConfirmDelete = (entryId) => {
    if (!entryId) return
    setUploads((prev) => prev.filter((item) => item.id !== entryId))
    setPendingDeleteId(null)
  }

  const handleCancelDelete = () => {
    setPendingDeleteId(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageSection title="Available files" description="Select a file to start a download">
        {!userId && <p className="text-sm text-rose-300">You must be authenticated to list uploads.</p>}
        {userId && listLoading && <p className="text-sm text-slate-400">Loading completed uploads...</p>}
        {userId && !listLoading && uploads.length === 0 ? (
          <p className="text-sm text-slate-400">No completed uploads found for this user.</p>
        ) : null}
        {userId && uploads.length > 0 && (
          <ul className="flex flex-col gap-3">
            {uploads.map((entry) => {
              const isLoading = loadingId === entry.id
              const uploadedAtLabel = entry.uploadedAt ? new Date(entry.uploadedAt).toLocaleString() : 'Date unavailable'
              const fileLabel = entry.displayName || entry.originalFileName || entry.fileKey
              return (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <div className="flex flex-col text-sm text-slate-200">
                    <span className="text-base font-semibold text-slate-100 md:text-lg">{fileLabel}</span>
                    <span className="text-xs text-slate-400">
                      {formatBytes(entry.size ?? 0)} • {uploadedAtLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn-primary" onClick={() => handleDownload(entry)} disabled={Boolean(loadingId)}>
                      {isLoading ? 'Preparing...' : 'Download file'}
                    </button>
                    {pendingDeleteId === entry.id ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-rose-300">Delete this item?</span>
                        <button type="button" className="btn-secondary px-3 py-1" onClick={() => handleConfirmDelete(entry.id)}>
                          Yes
                        </button>
                        <button type="button" className="btn-ghost px-3 py-1 text-slate-300" onClick={handleCancelDelete}>
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => handleDeleteRequest(entry)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      </PageSection>
    </div>
  )
}

export default DownloadTokens
