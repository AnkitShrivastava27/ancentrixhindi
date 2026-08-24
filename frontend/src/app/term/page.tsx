'use client'
import Link from 'next/link'

export default function TermsPage() {
  return <main style={{maxWidth:900,margin:'0 auto',padding:'60px 24px',color:'#e8e9ee',fontFamily:'Inter,system-ui,sans-serif'}}>
    <Link href="/register" style={{color:'#aaa'}}>← Back to registration</Link>
    <h1 style={{fontSize:32,marginTop:28}}>Terms and Conditions</h1>
    <p style={{color:'#aaa'}}>Please read these terms before using Ancentrix Voice.</p>
    <h2>1. Service</h2><p>Ancentrix Voice provides AI-assisted calling, lead management, scheduling and call-record management tools. You are responsible for configuring your company, products, campaigns and calling practices accurately.</p>
    <h2>2. AI-generated communication</h2><p>AI responses are generated from the information configured by you and may require human verification. Do not rely on the system to invent or independently verify business facts, availability or appointments.</p>
    <h2>3. Calls and consent</h2><p>You are responsible for complying with applicable telemarketing, privacy, recording, consent and communication laws in the jurisdictions where you operate.</p>
    <h2>4. Customer data</h2><p>You are responsible for the accuracy and lawful use of lead/customer information entered into the service. Do not enter information you are not authorized to process.</p>
    <h2>5. Support</h2><p>For service issues or questions, contact support@astric.business.</p>
    <h2>6. Changes</h2><p>We may update these terms as the service evolves. Continued use after an update constitutes acceptance of the revised terms.</p>
  </main>
}
