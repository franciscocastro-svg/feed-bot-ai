/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import { main, container, brandBar, h1, text, link, button, footer } from './styles.ts'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado(a) para o {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={{ margin: 0, color: '#ffffff', fontSize: '18px', fontWeight: 700 }}>Flux &amp; Feed</Text>
        </Section>
        <Heading style={h1}>Você recebeu um convite</Heading>
        <Text style={text}>
          Você foi convidado(a) para participar do{' '}
          <Link href={siteUrl} style={link}><strong>{siteName}</strong></Link>.
          Clique no botão abaixo para aceitar o convite e criar sua conta.
        </Text>
        <Button style={button} href={confirmationUrl}>Aceitar convite</Button>
        <Text style={text}>
          Se o botão não funcionar, copie e cole este link no navegador:{' '}
          <Link href={confirmationUrl} style={link}>{confirmationUrl}</Link>
        </Text>
        <Text style={footer}>
          Se você não esperava este convite, pode ignorar este e-mail com segurança.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
