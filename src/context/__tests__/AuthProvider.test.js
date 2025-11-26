import { act, renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AuthProvider } from '@/context/AuthProvider.js'
import { useAuth } from '@/hooks/useAuth.js'

const mockApi = vi.hoisted(() => ({
  auth: {
    login: vi.fn(),
    register: vi.fn(),
    me: vi.fn(),
  },
}))

vi.mock('@/services/api.js', async () => {
  const actual = await vi.importActual('@/services/api.js')
  return {
    ...actual,
    api: mockApi,
    configureAuthObserver: vi.fn(),
  }
})

const wrapper = ({ children }) => createElement(AuthProvider, null, children)

describe('AuthProvider', () => {
  beforeEach(() => {
    mockApi.auth.login.mockReset()
    mockApi.auth.register.mockReset()
    mockApi.auth.me.mockReset()
    mockApi.auth.me.mockResolvedValue({ user: { id: 'shadow', email: 'coach@volley.plus' } })
    window.localStorage.clear()
  })

  it('stores credentials after login', async () => {
    mockApi.auth.login.mockResolvedValue({ user: { id: '123', email: 'coach@volley.plus' }, accessToken: 'token-abc' })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login({ email: 'coach@volley.plus', password: 'secret123' })
    })

    expect(result.current.user.email).toBe('coach@volley.plus')
    expect(window.localStorage.getItem('volleyplus_access_token')).toBe('token-abc')
  })

  it('clears credentials when logout is called', async () => {
    mockApi.auth.login.mockResolvedValue({ user: { id: '1', email: 'a@b.com' }, accessToken: 'token' })

    const { result } = renderHook(() => useAuth(), { wrapper })

    await act(async () => {
      await result.current.login({ email: 'a@b.com', password: 'pass123' })
    })

    await act(async () => {
      result.current.logout()
    })

    expect(result.current.user).toBeNull()
    expect(window.localStorage.getItem('volleyplus_access_token')).toBeNull()
  })
})
