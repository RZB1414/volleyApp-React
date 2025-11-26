import { useEffect, useState } from 'react'
import PageSection from '@/components/PageSection.js'
import { useInterval } from '@/hooks/useInterval.js'
import { api } from '@/services/api.js'

const PendingUploads = () => {
  const [uploads, setUploads] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [cancelingId, setCancelingId] = useState(null)

  const fetchPending = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.upload.pending({ limit: 20 })
      setUploads(response.uploads ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPending()
  }, [])

  useInterval(() => {
    fetchPending()
  }, 10000)

  const handleCancel = async (upload) => {
    if (!upload?.key || !upload?.uploadId) return
    const rowId = `${upload.key}-${upload.uploadId}`
    setCancelingId(rowId)
    setError(null)
    try {
      await api.upload.cancel({
        fileKey: upload.key,
        fileName: upload.key,
        uploadId: upload.uploadId,
      })
      await fetchPending()
    } catch (err) {
      setError(err.message)
    } finally {
      setCancelingId(null)
    }
  }

  return (
    <PageSection title="Pending uploads" description="Sessions awaiting completion or timeout">
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80 text-left uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Started at</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {uploads.map((upload) => {
              const rowId = `${upload.key}-${upload.uploadId}`
              const isCanceling = cancelingId === rowId
              const displayKey = upload.key?.split('/').pop() || upload.key
              return (
                <tr key={rowId}>
                  <td className="px-4 py-2 font-mono text-xs">{displayKey}</td>
                  <td className="px-4 py-2">{new Date(upload.initiatedAt).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      className="btn-secondary text-xs"
                      onClick={() => handleCancel(upload)}
                      disabled={isCanceling}
                    >
                      {isCanceling ? 'Removing...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!uploads.length && !loading && (
          <p className="p-4 text-center text-sm text-slate-400">No pending uploads</p>
        )}
      </div>
      {loading && <p className="mt-3 text-sm text-slate-400">Refreshing list...</p>}
      {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
    </PageSection>
  )
}

export default PendingUploads
