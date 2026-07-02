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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-lovable-signature, x-lovable-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const SITE_NAME = 'Flux & Feed'
const PUBLIC_SITE_URL = Deno.env.get('PUBLIC_SITE_URL') || 'https://fluxifeed.com'
const AUTH_EMAIL_FROM =
  Deno.env.get('AUTH_EMAIL_FROM') || 'Flux & Feed <suporte@news.fluxifeed.com>'
const AUTH_EMAIL_REPLY_TO = Deno.env.get('AUTH_EMAIL_REPLY_TO') || 'suporte@fluxifeed.com'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirme seu e-mail no Flux & Feed',
  email_confirm: 'Confirme seu e-mail no Flux & Feed',
  recovery: 'Redefina sua senha no Flux & Feed',
  invite: 'Você foi convidado(a) para o Flux & Feed',
  magiclink: 'Seu link de acesso ao Flux & Feed',
  email_change: 'Confirme seu novo e-mail no Flux & Feed',
  reauthentication: 'Seu código de verificação Flux & Feed',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
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
  signup: { siteName: SITE_NAME, siteUrl: PUBLIC_SITE_URL, recipient: SAMPLE_EMAIL, confirmationUrl: PUBLIC_SITE_URL },
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
}): Promise<{ ok: boolean; status: number; id?: string; error?: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { ok: false, status: 500, error: 'RESEND_API_KEY not configured' }

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
    const body = await res.text().catch(() => '')
    // Do not log the API key; body only contains provider error info.
    return { ok: false, status: res.status, error: body.slice(0, 500) }
  }
  const data = await res.json().catch(() => ({} as any))
  return { ok: true, status: res.status, id: data?.id }
}

async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
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

async function handleWebhook(req: Request): Promise<Response> {
  // Try Lovable-signed webhook first; if it fails, fall back to raw Supabase Auth
  // Send Email Hook payload (JSON body posted directly by GoTrue).
  let payload: any = null
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
        console.error('Lovable webhook verification failed', { code: err.code })
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw err
    }
  }

  if (!payload) {
    try {
      payload = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Normalize: Lovable wraps data in payload.data; Supabase raw hook sends { user, email_data }.
  let emailType: string
  let recipient: string
  let confirmationUrl: string
  let token: string | undefined
  let oldEmail: string | undefined
  let newEmail: string | undefined

  if (usedLovableVerification && payload?.data) {
    emailType = payload.data.action_type
    recipient = payload.data.email
    confirmationUrl = payload.data.url
    token = payload.data.token
    oldEmail = payload.data.old_email
    newEmail = payload.data.new_email
  } else if (payload?.user && payload?.email_data) {
    // Supabase Auth Send Email Hook raw shape
    const ed = payload.email_data
    emailType = ed.email_action_type // signup | recovery | invite | magiclink | email_change | reauthentication
    recipient = payload.user.email
    // Prefer prebuilt action_link; else build from token_hash + redirect
    const redirect = ed.redirect_to || PUBLIC_SITE_URL
    if (ed.action_link) {
      confirmationUrl = ed.action_link
    } else {
      const siteUrl = Deno.env.get('SUPABASE_URL') || ''
      const params = new URLSearchParams({
        token: ed.token_hash,
        type: ed.email_action_type === 'signup' ? 'signup' : ed.email_action_type,
        redirect_to: redirect,
      })
      confirmationUrl = `${siteUrl}/auth/v1/verify?${params.toString()}`
    }
    token = ed.token
    newEmail = payload.user.new_email
    oldEmail = payload.user.email
  } else {
    console.error('Unrecognized auth email payload shape')
    return new Response(JSON.stringify({ error: 'Invalid payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  if (!EmailTemplate) {
    console.error('Unknown email type', { emailType })
    return new Response(JSON.stringify({ error: `Unknown email type: ${emailType}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

  console.log('Sending auth email via Resend', { emailType, recipient })
  const result = await sendViaResend({ to: recipient, subject, html, text })

  if (!result.ok) {
    console.error('Resend send failed', { status: result.status, error: result.error, emailType })
    return new Response(JSON.stringify({ error: 'Failed to send email', status: result.status }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Auth email sent via Resend', { emailType, recipient, id: result.id })
  return new Response(JSON.stringify({ success: true, id: result.id }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (url.pathname.endsWith('/preview')) return handlePreview(req)

  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Webhook handler error:', error instanceof Error ? error.message : error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
