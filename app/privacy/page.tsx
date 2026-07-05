export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#07071a',
      color: '#f8f8ff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
      WebkitFontSmoothing: 'antialiased',
      padding: '60px 24px 80px',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <a href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 40 }}>
            <div style={{
              width: 36, height: 36, background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
              borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 800, color: 'white',
            }}>M</div>
            <span style={{
              fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px',
              background: 'linear-gradient(135deg, #c4b5fd, #a78bfa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>MASLO</span>
          </a>
          <h1 style={{ margin: '0 0 8px', fontSize: 34, fontWeight: 800, letterSpacing: '-0.5px' }}>Privacy Policy</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
            Effective Date: July 5, 2026 · Last Updated: July 5, 2026
          </p>
        </div>

        {/* Intro */}
        <p style={prose}>
          Maslo Finance, Inc. ("Maslo," "we," "us," or "our") respects your privacy. This Privacy Policy explains how we collect, use, share, and protect your information when you use the Maslo application and related services (the "Service").
        </p>
        <p style={prose}>By using Maslo, you agree to the collection and use of information in accordance with this policy.</p>

        <Divider />

        {/* About Maslo */}
        <Section title="About Maslo">
          <p style={prose}>
            Maslo is not a financial advisor. Maslo is a financial accountability tool — built for people who want to get out of debt, stop living paycheck to paycheck, and take control of their financial life. All budgeting rules, spending limits, and savings goals within Maslo are set entirely by the user. Maslo's job is simple: hold you to the standards you set for yourself.
          </p>
          <p style={prose}>
            Maslo does not provide financial advice, investment recommendations, credit decisions, or tax guidance. All parameters, goals, spending limits, and vault allocations within Maslo are defined entirely by you. Banking and card services are provided by Stripe's FDIC-member bank partners.
          </p>
        </Section>

        <Divider />

        {/* 1. Information We Collect */}
        <Section title="1. Information We Collect">
          <SubSection title="1.1 Information You Provide Directly">
            <BulletList items={[
              'Account information: name, email address, phone number',
              'Onboarding information: income, fixed expenses, financial goals, debt details, and budgeting preferences you choose to share with Maslo',
              'Budget rules and vault configurations you define yourself',
              'Communications: messages you send to Maslo support or through in-app chat features',
            ]} />
          </SubSection>

          <SubSection title="1.2 Financial Account Information (via Stripe Financial Connections)">
            <p style={prose}>With your explicit consent, Maslo uses Stripe Financial Connections to access:</p>
            <BulletList items={[
              'Account and routing numbers (tokenized) — used to link your bank account to your Maslo card',
              'Account balances — used to power your budget "vaults" and spending insights',
              'Transaction history — used to categorize spending, detect recurring bills, and update your vaults in real time',
              'Account ownership details (name and address on the account) — used to verify your identity and reduce fraud',
            ]} />
            <p style={prose}>
              You control which accounts are linked and can revoke access at any time through your account settings. Maslo uses this data solely to execute the budget rules you define — never to advise you on financial decisions.
            </p>
          </SubSection>

          <SubSection title="1.3 Card and Payment Information (via Stripe Issuing & Treasury)">
            <p style={prose}>If you choose to use a Maslo virtual or physical card, Maslo uses Stripe Issuing and Stripe Treasury to:</p>
            <BulletList items={[
              'Issue a card linked to your connected bank account',
              'Process real-time transaction authorizations (approve/decline) based solely on your own configured budget rules',
              'Record transaction details (merchant name, amount, category, date) for your dashboard',
            ]} />
            <p style={prose}>
              All approve/decline decisions are made automatically based on rules you set. Maslo does not make judgment calls about your spending — it only enforces your own decisions.
            </p>
          </SubSection>

          <SubSection title="1.4 Automatically Collected Information">
            <BulletList items={[
              'Device information (device type, operating system, browser type)',
              'Usage data (features used, pages visited, session length)',
              'Log data (IP address, access times, app crashes)',
            ]} />
          </SubSection>

          <SubSection title="1.5 Information from the Maslo Exchange (Optional Social Features)">
            <p style={prose}>If you opt in to the Maslo Exchange, you may choose to share:</p>
            <BulletList items={[
              'Savings goal progress percentages',
              'Milestone achievements',
              'A "Financial Fitness Score"',
            ]} />
            <p style={prose}>
              We never share specific account balances, debt amounts, income figures, or transaction details with other users. All sharing is opt-in and user-controlled.
            </p>
          </SubSection>
        </Section>

        <Divider />

        {/* 2. How We Use */}
        <Section title="2. How We Use Your Information">
          <p style={prose}>We use the information we collect to:</p>
          <BulletList items={[
            'Provide, operate, and maintain the Service',
            'Automatically categorize and allocate your funds into budgeting "vaults" according to rules you define',
            'Process card transactions and make real-time approve/decline decisions based on your own configured budget rules',
            'Send push notifications about your spending, vault status, and upcoming bills',
            'Surface spending patterns and recurring transactions for your own awareness',
            'Improve and personalize the Service',
            'Detect and prevent fraud, unauthorized transactions, and security incidents',
            'Comply with legal and regulatory obligations',
          ]} />
          <p style={prose}>
            Maslo does not use your financial data to make recommendations about how you should manage your money. All insights and coaching points within the app are based on rules and goals you configured yourself.
          </p>
        </Section>

        <Divider />

        {/* 3. How We Share */}
        <Section title="3. How We Share Your Information">
          <p style={prose}>Maslo does <strong style={{ color: '#f8f8ff' }}>not sell</strong> your personal or financial information.</p>
          <p style={prose}>We share information only as follows:</p>

          <SubSection title="3.1 Service Providers">
            <BulletList items={[
              'Stripe (Financial Connections, Issuing, Treasury, Billing) — to link accounts, issue cards, process transactions, and handle subscription billing. Stripe\'s FDIC-member bank partners maintain their own privacy notices and regulatory compliance obligations.',
              'Supabase — secure database hosting for your account and vault data',
              'Vercel — application hosting infrastructure',
              'Other vendors that help us operate the Service (e.g., push notification providers), bound by confidentiality obligations',
            ]} />
          </SubSection>

          <SubSection title="3.2 Legal Requirements">
            <p style={prose}>We may disclose information if required by law, subpoena, or other legal process, or to protect the rights, property, or safety of Maslo, our users, or others.</p>
          </SubSection>

          <SubSection title="3.3 Business Transfers">
            <p style={prose}>If Maslo is involved in a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction. We will notify you of any such change.</p>
          </SubSection>

          <SubSection title="3.4 With Your Consent">
            <p style={prose}>We share information with other users only when you explicitly opt in via the Maslo Exchange, and only the limited data described in Section 1.5.</p>
          </SubSection>
        </Section>

        <Divider />

        {/* 4. Data Security */}
        <Section title="4. Data Security">
          <BulletList items={[
            'All data in transit is encrypted using TLS 1.2 or higher',
            'All data at rest is encrypted using AES-256 (via our infrastructure providers)',
            'Maslo never stores your banking login credentials — account linking is handled entirely through Stripe Financial Connections\' secure, bank-grade authentication flow',
            'API keys and secrets are stored server-side only and are never exposed to client applications',
            'Access to production systems is limited to authorized personnel on a least-privilege basis',
          ]} />
          <p style={prose}>While we take reasonable steps to protect your information, no method of transmission or storage is 100% secure.</p>
        </Section>

        <Divider />

        {/* 5. Your Rights */}
        <Section title="5. Your Rights and Choices">
          <BulletList items={[
            'Access and correction: You can review and update your account information at any time within the app',
            'Disconnecting accounts: You can unlink any financial account at any time through account settings',
            'Notifications: You can adjust notification preferences (tone, frequency, type) in settings',
            'Maslo Exchange: Participation is fully opt-in and can be disabled at any time',
            'Account deletion: You may request deletion of your account and associated data by contacting us at the email below. Some information may be retained as required by law or for legitimate business purposes (e.g., fraud prevention, financial recordkeeping).',
          ]} />
          <p style={prose}>
            Depending on your state of residence, you may have additional rights under laws such as the California Consumer Privacy Act (CCPA/CPRA), including the right to know, delete, and opt out of certain data practices. To exercise these rights, contact us using the information below.
          </p>
        </Section>

        <Divider />

        {/* 6. GLBA */}
        <Section title="6. Not a Financial Advisor — GLBA Notice">
          <p style={prose}>
            Maslo Finance, Inc. is not a bank and does not offer loans, credit, investment advice, or financial recommendations of any kind. Maslo is a personal financial accountability tool — built for people who want to get out of debt, stop living paycheck to paycheck, and build financial fitness.
          </p>
          <p style={prose}>
            All budget parameters, spending limits, savings goals, and vault rules within Maslo are defined entirely by the user. Maslo does not advise users on how to allocate their money — it only automates and enforces the rules the user sets for themselves.
          </p>
          <p style={prose}>
            Banking and card services are provided by Stripe's FDIC-member bank partners, who maintain their own GLBA privacy notices and regulatory compliance obligations.
          </p>
        </Section>

        <Divider />

        {/* 7. Data Retention */}
        <Section title="7. Data Retention">
          <p style={prose}>
            We retain your information for as long as your account is active or as needed to provide the Service. We may retain certain information after account closure as required for legal, tax, fraud prevention, or recordkeeping purposes.
          </p>
        </Section>

        <Divider />

        {/* 8. Children */}
        <Section title="8. Children's Privacy">
          <p style={prose}>
            Maslo is not intended for individuals under the age of 18. We do not knowingly collect information from children. If we become aware that we have collected information from a child under 18, we will take steps to delete it promptly.
          </p>
        </Section>

        <Divider />

        {/* 9. Changes */}
        <Section title="9. Changes to This Policy">
          <p style={prose}>
            We may update this Privacy Policy from time to time. We will notify you of material changes by email or through the Service prior to the change becoming effective. Continued use of the Service after changes become effective constitutes your acceptance of the updated policy.
          </p>
        </Section>

        <Divider />

        {/* 10. Contact */}
        <Section title="10. Contact Us">
          <p style={prose}>If you have questions about this Privacy Policy or wish to exercise your privacy rights, contact us at:</p>
          <div style={{
            background: '#0d0d24',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            padding: '20px 24px',
            marginTop: 16,
          }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700, color: '#f8f8ff', fontSize: 15 }}>Maslo Finance, Inc.</p>
            <p style={{ margin: '0 0 4px', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>105 McCabe Avenue, Apt 212</p>
            <p style={{ margin: '0 0 12px', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>Bradley Beach, NJ 07720</p>
            <a
              href="mailto:privacy@maslofinance.com"
              style={{ color: '#a78bfa', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}
            >
              privacy@maslofinance.com
            </a>
          </div>
        </Section>

        {/* Footer */}
        <p style={{ marginTop: 60, fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
          This Privacy Policy was last reviewed on July 5, 2026.
        </p>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const prose: React.CSSProperties = {
  margin: '0 0 14px',
  fontSize: 15,
  lineHeight: 1.75,
  color: 'rgba(255,255,255,0.65)',
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '36px 0' }} />
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <h2 style={{ margin: '0 0 18px', fontSize: 20, fontWeight: 700, color: '#f8f8ff', letterSpacing: '-0.3px' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.03em' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '0 0 14px', paddingLeft: 0, listStyle: 'none' }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 15, lineHeight: 1.65, color: 'rgba(255,255,255,0.6)' }}>
          <span style={{ color: '#7c3aed', flexShrink: 0, marginTop: 2 }}>›</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
