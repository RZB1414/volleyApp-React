import { formatBytes } from '@/services/multipartHelper.js'

const UploadProgressList = ({ parts = [], fileSize }) => {
  if (!parts.length) return null

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800">
      <table className="min-w-full divide-y divide-slate-800 text-sm">
        <thead className="bg-slate-900/80 text-left uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Part</th>
            <th className="px-4 py-3">ETag</th>
            <th className="px-4 py-3">Bytes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {parts.map((part) => (
            <tr key={part.partNumber} className="bg-slate-900/40 text-slate-200">
              <td className="px-4 py-2 font-mono text-xs">{part.partNumber}</td>
              <td className="px-4 py-2 font-mono text-xs">{part.ETag}</td>
              <td className="px-4 py-2">{formatBytes(part.bytes ?? fileSize / parts.length)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default UploadProgressList
