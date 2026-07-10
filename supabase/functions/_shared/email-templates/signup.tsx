/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import { main, container, brandBar, h1, text, link, button, footer } from './styles.ts'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  token?: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  token,
}: SignupEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Confirme seu e-mail no {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: 700 }}>
            Flux &amp; Feed
          </Text>
        </Section>
        <Heading style={h1}>Confirme seu e-mail</Heading>
        <Text style={text}>
          Bem-vindo(a) ao{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          ! Para começar a usar sua conta, confirme o e-mail{' '}
          <strong>{recipient}</strong> usando o código abaixo.
        </Text>
        {token ? (
          <Section style={{ textAlign: 'center', margin: '28px 0' }}>
            <Text style={{
              display: 'inline-block',
              margin: 0,
              padding: '16px 24px',
              borderRadius: '8px',
              backgroundColor: '#f4f0f4',
              color: '#180617',
              fontSize: '30px',
              fontWeight: 700,
              letterSpacing: '8px',
            }}>
              {token}
            </Text>
          </Section>
        ) : null}
        <Text style={text}>O código é pessoal e expira em poucos minutos.</Text>
        <Button style={button} href={confirmationUrl}>
          Confirmar pelo navegador
        </Button>
        <Text style={text}>
          Se o botão não funcionar, copie e cole este link no navegador:{' '}
          <Link href={confirmationUrl} style={link}>{confirmationUrl}</Link>
        </Text>
        <Text style={footer}>
          Se você não criou uma conta no Flux &amp; Feed, pode ignorar este e-mail com segurança.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
