import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { parseEmailWebhookPayload } from 'npm:@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from 'npm:@lovable.dev/webhooks-js'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'
import { normalizeAuthEmailPayload, readResponseId } from '../_shared/auth-email-payload.ts'
import { classifyError, createLogger, type Logger } from '../_shared/observability.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-auth-email-hook-secret, x-supabase-hook-secret, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Expose-Headers': 'x-request-id',
}

const SITE_NAME = 'Flux & Feed'
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://fluxifeed.com'
const AUTH_EMAIL_FROM =
  Deno.env.get('AUTH_EMAIL_FROM') || 'Flux & Feed <suporte@news.fluxifeed.com>'
const AUTH_EMAIL_REPLY_TO = Deno.env.get('AUTH_EMAIL_REPLY_TO') || 'suporte@fluxifeed.com'
const AUTH_EMAIL_HOOK_SECRET = Deno.env.get('AUTH_EMAIL_HOOK_SECRET') || ''

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirme seu e-mail no Flux & Feed',
  email_confirm: 'Confirme seu e-mail no Flux & Feed',
  recovery: 'Redefina sua senha no Flux & Feed',
  invite: 'Você foi convidado(a) para o Flux & Feed',
  magiclink: 'Seu link de acesso ao Flux & Feed',
  email_change: 'Confirme seu novo e-mail no Flux & Feed',
  reauthentication: 'Seu código de verificação Flux & Feed',
}

const EMAIL_TEMPLATES: Record<string, React.ElementType> = {
  signup: SignupEmail,
  email_confirm: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SAMPLE_EMAIL = 'user@example.test'
const SAMPLE_DATA: Record<string, object> = {
  signup: { siteName: SITE_NAME, siteUrl: PUBLIC_SITE_URL, recipient: SAMPLE_EMAIL, confirmationUrl: PUBLIC_SITE_URL, token: '123456' },
  email_confirm: { siteName: SITE_NAME, siteUrl: PUBLIC_SITE_URL, recipient: SAMPLE_EMAIL, confirmationUrl: PUBLIC_SITE_URL, token: '123456' },
  magiclink: { siteName: SITE_NAME, confirmationUrl: PUBLIC_SITE_URL },
  recovery: { siteName: SITE_NAME, confirmationUrl: PUBLIC_SITE_URL },
  invite: { siteName: SITE_NAME, siteUrl: PUBLIC_SITE_URL, confirmationUrl: PUBLIC_SITE_URL },
  email_change: { siteName: SITE_NAME, oldEmail: SAMPLE_EMAIL, email: SAMPLE_EMAIL, newEmail: SAMPLE_EMAIL, confirmationUrl: PUBLIC_SITE_URL },
  reauthentication: { token: '123456' },
}

async function sendViaResend(params: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<{ ok: boolean; status: number; id?: string; error_code?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { ok: false, status: 500, error_code: 'resend_not_configured' }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: AUTH_EMAIL_FROM,
      to: [params.to],
      reply_to: AUTH_EMAIL_REPLY_TO,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  })

  if (!res.ok) {
    // Drain body without logging its content (may contain recipient/email metadata).
    await res.text().catch(() => '')
    return { ok: false, status: res.status, error_code: 'resend_send_failed' }
  }
  const data: unknown = await res.json().catch(() => null)
  return { ok: true, status: res.status, id: readResponseId(data) }
}

async function handlePreview(req: Request): Promise<Response> {
  const previewLog = createLogger('auth-email-hook')
  const previewRequestId = previewLog.requestId
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Expose-Headers': 'x-request-id',
    'x-request-id': previewRequestId,
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: previewCorsHeaders })

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const authHeader = req.headers.get('Authorization')
  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type: string
  try {
    const body = await req.json()
    type = body.type
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]
  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const sampleData = SAMPLE_DATA[type] || {}
  const html = await renderAsync(React.createElement(EmailTemplate, sampleData))
  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function handleWebhook(req: Request, log: Logger): Promise<Response> {
  const requestId = log.requestId
  const respHeaders = { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': requestId }

  let payload: unknown = null
  let usedLovableVerification = false

  const lovableKey = Deno.env.get('LOVABLE_API_KEY')
  if (lovableKey && req.headers.get('x-lovable-signature')) {
    try {
      const verified = await verifyWebhookRequest({
        req: req.clone(),
        secret: lovableKey,
        parser: parseEmailWebhookPayload,
      })
      payload = verified.payload
      usedLovableVerification = true
    } catch (err) {
      if (err instanceof WebhookError) {
        log.error('lovable_signature_verification_failed', { error_code: err.code })
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: respHeaders,
        })
      }
      throw err
    }
  }

  if (!payload) {
    const authorization = req.headers.get('authorization') || ''
    const providedSecret =
      req.headers.get('x-auth-email-hook-secret') ||
      req.headers.get('x-supabase-hook-secret') ||
      (authorization.startsWith('Bearer ') ? authorization.slice(7) : '')
    if (!AUTH_EMAIL_HOOK_SECRET || providedSecret !== AUTH_EMAIL_HOOK_SECRET) {
      log.error('raw_hook_unauthorized', { error_code: 'invalid_secret' })
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: respHeaders,
      })
    }
    try {
      payload = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: respHeaders,
      })
    }
  }

  const normalized = normalizeAuthEmailPayload(payload, usedLovableVerification)
  if (!normalized) {
    log.error('invalid_payload_shape', { error_code: 'invalid_payload' })
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: respHeaders,
    })
  }

  const emailType = normalized.emailType
  const recipient = normalized.recipient
  let confirmationUrl: string
  const token = normalized.token
  const oldEmail = normalized.oldEmail
  const newEmail = normalized.newEmail

  if (normalized.kind === 'lovable') {
    confirmationUrl = normalized.confirmationUrl
  } else {
    const redirect = normalized.redirectTo || PUBLIC_SITE_URL
    if (normalized.actionLink) {
      confirmationUrl = normalized.actionLink
    } else {
      const siteUrl = Deno.env.get('SUPABASE_URL') || ''
      const params = new URLSearchParams({
        token: normalized.tokenHash,
        type: emailType === 'signup' ? 'signup' : emailType,
        redirect_to: redirect,
      })
      confirmationUrl = `${siteUrl}/auth/v1/verify?${params.toString()}`
    }
  }

  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return new Response(JSON.stringify({ error: 'Invalid recipient' }), {
      status: 400,
      headers: respHeaders,
    })
  }
  try {
    const target = new URL(confirmationUrl)
    const allowedOrigins = new Set([
      new URL(PUBLIC_SITE_URL).origin,
      new URL(Deno.env.get('SUPABASE_URL') || PUBLIC_SITE_URL).origin,
    ])
    if (!allowedOrigins.has(target.origin)) throw new Error('origin not allowed')
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid confirmation URL' }), {
      status: 400,
      headers: respHeaders,
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    log.error('unknown_email_type', { event_type: emailType, error_code: 'unknown_email_type' })
    return new Response(JSON.stringify({ error: `Unknown email type: ${emailType}` }), {
      status: 400,
      headers: respHeaders,
    })
  }

  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: PUBLIC_SITE_URL,
    recipient,
    confirmationUrl,
    token,
    email: recipient,
    oldEmail,
    newEmail,
  }

  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
    plainText: true,
  })

  const subject = EMAIL_SUBJECTS[emailType] || 'Flux & Feed'

  const started = Date.now()
  const result = await sendViaResend({ to: recipient, subject, html, text })

  if (!result.ok) {
    log.error('resend_failed', {
      event_type: emailType,
      provider_status: result.status,
      error_code: result.error_code ?? 'resend_send_failed',
      duration_ms: Date.now() - started,
      status: 'failed',
    })
    return new Response(JSON.stringify({ error: 'Failed to send email' }), {
      status: 502,
      headers: respHeaders,
    })
  }

  log.info('auth_email_sent', {
    event_type: emailType,
    provider_status: result.status,
    status: 'sent',
    duration_ms: Date.now() - started,
  })
  return new Response(JSON.stringify({ success: true, id: result.id }), {
    status: 200,
    headers: respHeaders,
  })
}

Deno.serve(async (req) => {
  const log = createLogger('auth-email-hook')
  const requestId = log.requestId
  const url = new URL(req.url)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { ...corsHeaders, 'x-request-id': requestId } })
  }
  if (url.pathname.endsWith('/preview')) return handlePreview(req)
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': requestId },
    })
  }

  try {
    return await handleWebhook(req, log)
  } catch (error) {
    const { error_code } = classifyError(error)
    log.error('handler_error', { error_code, status: 'failed' })
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'x-request-id': requestId },
    })
  }
})
