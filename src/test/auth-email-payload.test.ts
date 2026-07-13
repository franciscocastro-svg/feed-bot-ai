import { describe, expect, it } from 'vitest'
import {
  normalizeAuthEmailPayload,
  readResponseId,
} from '../../supabase/functions/_shared/auth-email-payload'

describe('normalizeAuthEmailPayload', () => {
  it('normalizes the signed Lovable payload shape', () => {
    expect(normalizeAuthEmailPayload({
      data: {
        action_type: 'signup',
        email: 'creator@example.com',
        url: 'https://fluxifeed.com/confirm',
        token: '123456',
      },
    }, true)).toEqual({
      kind: 'lovable',
      emailType: 'signup',
      recipient: 'creator@example.com',
      confirmationUrl: 'https://fluxifeed.com/confirm',
      token: '123456',
      oldEmail: undefined,
      newEmail: undefined,
    })
  })

  it('normalizes the raw Supabase Auth hook payload shape', () => {
    expect(normalizeAuthEmailPayload({
      user: { email: 'creator@example.com', new_email: 'new@example.com' },
      email_data: {
        email_action_type: 'email_change',
        token_hash: 'hash',
        redirect_to: 'https://fluxifeed.com',
      },
    }, false)).toEqual({
      kind: 'supabase',
      emailType: 'email_change',
      recipient: 'creator@example.com',
      token: undefined,
      oldEmail: 'creator@example.com',
      newEmail: 'new@example.com',
      actionLink: undefined,
      redirectTo: 'https://fluxifeed.com',
      tokenHash: 'hash',
    })
  })

  it('rejects unknown payload shapes without throwing', () => {
    expect(normalizeAuthEmailPayload(null, false)).toBeNull()
    expect(normalizeAuthEmailPayload({ data: [] }, true)).toBeNull()
    expect(normalizeAuthEmailPayload({ user: {} }, false)).toBeNull()
  })

  it('reads a provider response id only when it is a non-empty string', () => {
    expect(readResponseId({ id: 'email-1' })).toBe('email-1')
    expect(readResponseId({ id: 123 })).toBeUndefined()
    expect(readResponseId({})).toBeUndefined()
    expect(readResponseId(null)).toBeUndefined()
  })
})
