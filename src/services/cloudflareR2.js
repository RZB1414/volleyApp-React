const CF_ACCOUNT_ID = import.meta.env.VITE_CF_ACCOUNT_ID
const CF_BUCKET_NAME = import.meta.env.VITE_CF_R2_BUCKET
const CF_API_TOKEN = import.meta.env.VITE_CF_API_TOKEN
const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

const assertEnv = () => {
  if (!CF_ACCOUNT_ID || !CF_BUCKET_NAME || !CF_API_TOKEN) {
    throw new Error('Missing Cloudflare configuration. Set VITE_CF_ACCOUNT_ID, VITE_CF_R2_BUCKET and VITE_CF_API_TOKEN.')
  }
}

const buildObjectsUrl = ({ prefix, limit = 100 }) => {
  const params = new URLSearchParams()
  if (prefix) params.set('prefix', prefix)
  params.set('limit', String(limit))
  return `${CF_API_BASE}/accounts/${CF_ACCOUNT_ID}/r2/buckets/${CF_BUCKET_NAME}/objects?${params.toString()}`
}

const normalizeObject = ({ key, size, etag, checksums, uploaded }) => ({
  key,
  size,
  etag,
  checksum: checksums?.md5 ?? checksums?.sha1 ?? null,
  uploadedAt: uploaded,
})

export const fetchCompletedUploads = async ({ userId, limit = 100 }) => {
  assertEnv()
  if (!userId) {
    throw new Error('userId is required to fetch completed uploads')
  }

  const response = await fetch(buildObjectsUrl({ prefix: `${userId}/`, limit }), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
    },
  })

  if (!response.ok) {
    let reason = 'Cloudflare request failed'
    try {
      const payload = await response.json()
      reason = payload?.errors?.[0]?.message ?? reason
    } catch {
      reason = `${reason}: ${response.statusText}`
    }
    throw new Error(reason)
  }

  const payload = await response.json()
  if (!payload?.success) {
    throw new Error(payload?.errors?.[0]?.message ?? 'Cloudflare returned an error')
  }

  const objects = payload?.result?.objects ?? []
  return objects.map(normalizeObject)
}
