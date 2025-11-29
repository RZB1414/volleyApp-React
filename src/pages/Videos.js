import { useState } from 'react'
import UploadManager from '@/pages/UploadManager.js'
import PendingUploads from '@/pages/PendingUploads.js'
import DownloadTokens from '@/pages/DownloadTokens.js'

const videoLinks = [
    { to: '/upload', label: 'Upload', description: 'Envie novos relatórios de partidas e gerencie filas.' },
    { to: '/pending', label: 'Pending Uploads', description: 'Acompanhe o status das partidas enviadas.' },
    { to: '/download', label: 'Download', description: 'Recupere tokens para baixar as partidas processadas.' },
]

const componentMap = {
    '/upload': UploadManager,
    '/pending': PendingUploads,
    '/download': DownloadTokens,
}

const Videos = () => {
    const [activePath, setActivePath] = useState('/download')
    const ActiveComponent = componentMap[activePath] ?? DownloadTokens

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-2">
                {videoLinks.map((link) => (
                    <button
                        key={link.to}
                        type="button"
                        onClick={() => setActivePath(link.to)}
                        className={`flex-1 min-w-[120px] rounded-2xl px-4 py-2 text-center text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 ${activePath === link.to
                            ? 'bg-emerald-400/10 text-white'
                            : 'text-slate-300 hover:text-white'
                            }`}
                    >
                        {link.label}
                    </button>
                ))}
            </div>
            <ActiveComponent />
        </div>
    )
}

export default Videos
