type UnknownRecord = Record<string, unknown>

export type NormalizedAuthEmailPayload = {
  emailType: string
  recipient: string
  token?: string
  oldEmail?: string
  newEmail?: string
} & (
  | {
      kind: 'lovable'
      confirmationUrl: string
    }
  | {
      kind: 'supabase'
      actionLink?: string
      redirectTo?: string
      tokenHash: string
    }
)

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function readString(record: UnknownRecord, key: string): string {
  return typeof record[key] === 'string' ? record[key] : ''
}

function readOptionalString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function readResponseId(value: unknown): string | undefined {
  const record = asRecord(value)
  return record ? readOptionalString(record, 'id') : undefined
}

export function normalizeAuthEmailPayload(
  payload: unknown,
  preferLovablePayload: boolean,
): NormalizedAuthEmailPayload | null {
  const root = asRecord(payload)
  if (!root) return null

  const lovableData = asRecord(root.data)
  if (preferLovablePayload && lovableData) {
    return {
      kind: 'lovable',
      emailType: readString(lovableData, 'action_type'),
      recipient: readString(lovableData, 'email'),
      confirmationUrl: readString(lovableData, 'url'),
      token: readOptionalString(lovableData, 'token'),
      oldEmail: readOptionalString(lovableData, 'old_email'),
      newEmail: readOptionalString(lovableData, 'new_email'),
    }
  }

  const user = asRecord(root.user)
  const emailData = asRecord(root.email_data)
  if (!user || !emailData) return null

  return {
    kind: 'supabase',
    emailType: readString(emailData, 'email_action_type'),
    recipient: readString(user, 'email'),
    token: readOptionalString(emailData, 'token'),
    oldEmail: readOptionalString(user, 'email'),
    newEmail: readOptionalString(user, 'new_email'),
    actionLink: readOptionalString(emailData, 'action_link'),
    redirectTo: readOptionalString(emailData, 'redirect_to'),
    tokenHash: readString(emailData, 'token_hash'),
  }
}
