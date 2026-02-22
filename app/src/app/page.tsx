"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PROGRAM_ID } from "./providers";

type TransitionExample = {
  from: string;
  action: string;
  to: string;
  actor: string;
  enforced: string;
};

type ComparisonRow = {
  aspect: string;
  traditional: string;
  onChain: string;
};

type ProgramInfo = {
  exists: boolean;
  executable: boolean;
  lamports: number;
  owner: string;
};

const styles = {
  container: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "40px 24px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: "#e4e4e7",
  },
  hero: {
    textAlign: "center" as const,
    marginBottom: 60,
    padding: "60px 0",
    background: "linear-gradient(180deg, rgba(99, 102, 241, 0.1) 0%, transparent 100%)",
    borderRadius: 24,
    border: "1px solid rgba(99, 102, 241, 0.2)",
  },
  badge: {
    display: "inline-block",
    padding: "6px 14px",
    background: "rgba(99, 102, 241, 0.15)",
    borderRadius: 20,
    fontSize: 13,
    fontWeight: 500,
    color: "#a5b4fc",
    marginBottom: 20,
    border: "1px solid rgba(99, 102, 241, 0.3)",
  },
  title: {
    fontSize: 48,
    fontWeight: 700,
    margin: "0 0 16px 0",
    background: "linear-gradient(135deg, #fff 0%, #a5b4fc 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subtitle: {
    fontSize: 20,
    color: "#a1a1aa",
    margin: 0,
    maxWidth: 700,
    marginLeft: "auto",
    marginRight: "auto",
    lineHeight: 1.6,
  },
  section: {
    marginBottom: 48,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 20,
    color: "#fafafa",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 20,
  },
  card: {
    background: "rgba(24, 24, 27, 0.8)",
    borderRadius: 16,
    padding: 24,
    border: "1px solid rgba(63, 63, 70, 0.5)",
    backdropFilter: "blur(10px)",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 8,
    color: "#fafafa",
  },
  cardValue: {
    fontSize: 32,
    fontWeight: 700,
    color: "#a5b4fc",
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
    color: "#71717a",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    background: "rgba(24, 24, 27, 0.6)",
    borderRadius: 12,
    overflow: "hidden",
  },
  th: {
    padding: "14px 20px",
    textAlign: "left" as const,
    fontSize: 13,
    fontWeight: 600,
    color: "#a1a1aa",
    borderBottom: "1px solid rgba(63, 63, 70, 0.5)",
    background: "rgba(24, 24, 27, 0.8)",
  },
  td: {
    padding: "14px 20px",
    fontSize: 14,
    borderBottom: "1px solid rgba(63, 63, 70, 0.3)",
    fontFamily: "'JetBrains Mono', monospace",
  },
  statusBadge: (status: string) => ({
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
    background: status === "InProgress" ? "rgba(59, 130, 246, 0.2)" :
      status === "AwaitingApproval" ? "rgba(168, 85, 247, 0.2)" :
        status === "Failed" ? "rgba(239, 68, 68, 0.2)" :
          status === "Escalated" ? "rgba(249, 115, 22, 0.2)" :
            "rgba(34, 197, 94, 0.2)",
    color: status === "InProgress" ? "#60a5fa" :
      status === "AwaitingApproval" ? "#c084fc" :
        status === "Failed" ? "#f87171" :
          status === "Escalated" ? "#fb923c" :
            "#4ade80",
    border: `1px solid ${status === "InProgress" ? "rgba(59, 130, 246, 0.3)" :
      status === "AwaitingApproval" ? "rgba(168, 85, 247, 0.3)" :
        status === "Failed" ? "rgba(239, 68, 68, 0.3)" :
          status === "Escalated" ? "rgba(249, 115, 22, 0.3)" :
            "rgba(34, 197, 94, 0.3)"
      }`,
  }),
  codeBlock: {
    background: "rgba(0, 0, 0, 0.4)",
    borderRadius: 12,
    padding: 20,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 13,
    lineHeight: 1.6,
    overflowX: "auto" as const,
    border: "1px solid rgba(63, 63, 70, 0.5)",
  },
  comparison: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 0,
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid rgba(63, 63, 70, 0.5)",
  },
  comparisonHeader: {
    padding: "16px 20px",
    fontWeight: 600,
    fontSize: 14,
    textAlign: "center" as const,
  },
  comparisonCell: {
    padding: "14px 20px",
    fontSize: 14,
    borderTop: "1px solid rgba(63, 63, 70, 0.3)",
  },
  footer: {
    marginTop: 60,
    padding: "30px 0",
    borderTop: "1px solid rgba(63, 63, 70, 0.3)",
    textAlign: "center" as const,
    color: "#71717a",
    fontSize: 14,
  },
  link: {
    color: "#a5b4fc",
    textDecoration: "none",
  },
};

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [programInfo, setProgramInfo] = useState<ProgramInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const copyToClipboard = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const fetchProgramInfo = useCallback(async () => {
    setLoading(true);
    try {
      const programPubkey = new PublicKey(PROGRAM_ID);
      const accountInfo = await connection.getAccountInfo(programPubkey);
      if (accountInfo) {
        setProgramInfo({
          exists: true,
          executable: accountInfo.executable,
          lamports: accountInfo.lamports,
          owner: accountInfo.owner.toBase58(),
        });
      } else {
        setProgramInfo({ exists: false, executable: false, lamports: 0, owner: "" });
      }
    } catch {
      setProgramInfo(null);
    } finally {
      setLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    setMounted(true);
    fetchProgramInfo();
  }, [fetchProgramInfo]);

  const transitions: TransitionExample[] = [
    { from: "InProgress", action: "submit_task_result(success=true)", to: "AwaitingApproval", actor: "operator/creator", enforced: "deadline + role check" },
    { from: "InProgress", action: "submit_task_result(success=false)", to: "Failed", actor: "operator/creator", enforced: "deadline + role check" },
    { from: "AwaitingApproval", action: "approve_task()", to: "Completed", actor: "admin only", enforced: "has_one = admin" },
    { from: "Failed", action: "retry_task()", to: "InProgress", actor: "admin only", enforced: "retry_count < max" },
    { from: "InProgress/Failed/Awaiting", action: "escalate_task()", to: "Escalated", actor: "anyone (keeper)", enforced: "now > due_at" },
  ];

  const comparisons: ComparisonRow[] = [
    { aspect: "State Storage", traditional: "PostgreSQL / Redis", onChain: "Solana PDAs (Program Derived Addresses)" },
    { aspect: "Authorization", traditional: "JWT + middleware checks", onChain: "Signer verification + account constraints" },
    { aspect: "Audit Trail", traditional: "Application logs (mutable)", onChain: "Blockchain history (immutable)" },
    { aspect: "Deadline Enforcement", traditional: "Cron job with DB query", onChain: "Clock::get() comparison in program" },
    { aspect: "Retry Limits", traditional: "Application-level counter", onChain: "On-chain u8 with require! macro" },
    { aspect: "Trust Model", traditional: "Trust the server operator", onChain: "Trustless - rules in program code" },
  ];

  if (!mounted) {
    return null;
  }

  return (
    <div style={styles.container}>
      <header style={styles.hero}>
        <span style={styles.badge}>Superteam Poland Bounty Submission</span>
        <h1 style={styles.title}>On-Chain Workflow Engine</h1>
        <p style={styles.subtitle}>
          A production backend pattern rebuilt as a Solana Anchor program.
          Role-gated approvals, bounded retries, deadline-triggered escalation,
          and an immutable transition timeline.
        </p>
      </header>

      <section style={{
        background: "linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)",
        border: "1px solid rgba(34, 197, 94, 0.3)",
        borderRadius: 16,
        padding: "24px 32px",
        marginBottom: 48,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        gap: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: "#4ade80" }}>Try it on Devnet</span>
        </div>
        <p style={{ color: "#a1a1aa", margin: 0, textAlign: "center" as const, maxWidth: 500 }}>
          Run the full workflow demo against the deployed program on Solana Devnet
        </p>
        <button
          onClick={() => copyToClipboard("npm run demo:devnet")}
          style={{
            background: "rgba(0, 0, 0, 0.4)",
            borderRadius: 8,
            padding: "12px 20px",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 14,
            color: copied ? "#a5b4fc" : "#4ade80",
            border: `1px solid ${copied ? "rgba(99, 102, 241, 0.5)" : "rgba(34, 197, 94, 0.3)"}`,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 12,
            transition: "all 0.2s ease",
          }}
        >
          <span>npm run demo:devnet</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>{copied ? "✓ Copied!" : "Copy"}</span>
        </button>
        <p style={{ color: "#71717a", margin: 0, fontSize: 13 }}>
          Creates workspace → template → run → submits tasks → approves → retries → escalates
        </p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Program Invariants</h2>
        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Max Stages per Template</div>
            <div style={styles.cardValue}>3</div>
            <div style={styles.cardDesc}>Bounded workflow complexity</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Max Tasks per Run</div>
            <div style={styles.cardValue}>20</div>
            <div style={styles.cardDesc}>Prevents unbounded account growth</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Max Retries per Task</div>
            <div style={styles.cardValue}>3</div>
            <div style={styles.cardDesc}>Enforced by retry_count &lt; max_retries</div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Escalation Policy</div>
            <div style={styles.cardValue}>SLA</div>
            <div style={styles.cardDesc}>Deadline breach → escalated state</div>
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>State Machine Transitions</h2>
        <div style={{ overflowX: "auto", borderRadius: 12 }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>From State</th>
                <th style={styles.th}>Instruction</th>
                <th style={styles.th}>To State</th>
                <th style={styles.th}>Actor</th>
                <th style={styles.th}>On-Chain Enforcement</th>
              </tr>
            </thead>
            <tbody>
              {transitions.map((t, i) => (
                <tr key={i}>
                  <td style={styles.td}>
                    <span style={styles.statusBadge(t.from.split("/")[0])}>{t.from}</span>
                  </td>
                  <td style={{ ...styles.td, color: "#a5b4fc" }}>{t.action}</td>
                  <td style={styles.td}>
                    <span style={styles.statusBadge(t.to)}>{t.to}</span>
                  </td>
                  <td style={{ ...styles.td, color: "#a1a1aa" }}>{t.actor}</td>
                  <td style={{ ...styles.td, color: "#71717a", fontFamily: "'Inter', sans-serif" }}>{t.enforced}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Traditional Backend → On-Chain</h2>
        <div style={styles.comparison}>
          <div style={{ ...styles.comparisonHeader, background: "rgba(239, 68, 68, 0.1)", color: "#f87171" }}>
            Traditional Backend
          </div>
          <div style={{ ...styles.comparisonHeader, background: "rgba(34, 197, 94, 0.1)", color: "#4ade80" }}>
            On-Chain (This Program)
          </div>
          {comparisons.map((row, i) => (
            <Fragment key={i}>
              <div style={{ ...styles.comparisonCell, background: "rgba(239, 68, 68, 0.02)" }}>
                <strong style={{ color: "#a1a1aa" }}>{row.aspect}:</strong>{" "}
                <span style={{ color: "#f87171" }}>{row.traditional}</span>
              </div>
              <div style={{ ...styles.comparisonCell, background: "rgba(34, 197, 94, 0.02)" }}>
                <strong style={{ color: "#a1a1aa" }}>{row.aspect}:</strong>{" "}
                <span style={{ color: "#4ade80" }}>{row.onChain}</span>
              </div>
            </Fragment>
          ))}
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Key On-Chain Enforcement</h2>
        <div style={styles.codeBlock}>
          <pre style={{ margin: 0, color: "#a1a1aa" }}>
            {`// Authorization: Only admin can approve
#[account(
    seeds = [b"workspace", admin.key().as_ref()],
    bump = workspace.bump,
    has_one = admin  // ← Enforced at account validation
)]
pub workspace: Account<'info, Workspace>,

// State transition: Must be in correct state
require!(
    self.task.status == TaskStatus::AwaitingApproval,
    WorkflowError::InvalidTransition
);

// Deadline enforcement: Clock-based SLA check
require!(now > self.task.due_at, WorkflowError::DeadlineNotReached);

// Bounded retries: Prevents infinite retry loops
require!(
    self.task.retry_count < self.task.max_retries,
    WorkflowError::RetryLimitExceeded
);`}
          </pre>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Live on Devnet</h2>
        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Program Status</div>
            {loading ? (
              <div style={{ color: "#71717a" }}>Loading...</div>
            ) : programInfo?.exists ? (
              <>
                <div style={{ ...styles.cardValue, fontSize: 20, color: "#4ade80" }}>Deployed</div>
                <div style={styles.cardDesc}>
                  {programInfo.executable ? "Executable" : "Not executable"} · {(programInfo.lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
                </div>
              </>
            ) : (
              <div style={{ color: "#f87171" }}>Not found</div>
            )}
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Program ID</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#a5b4fc", wordBreak: "break-all" }}>
              {PROGRAM_ID}
            </div>
            <a
              href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...styles.link, fontSize: 13, marginTop: 8, display: "inline-block" }}
            >
              View on Explorer →
            </a>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Your Wallet</div>
            <div style={{ marginTop: 8 }}>
              <WalletMultiButton style={{
                background: "rgba(99, 102, 241, 0.2)",
                border: "1px solid rgba(99, 102, 241, 0.4)",
                borderRadius: 8,
                color: "#a5b4fc",
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
              }} />
            </div>
            {publicKey && (
              <div style={{ ...styles.cardDesc, marginTop: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                {publicKey.toBase58().slice(0, 8)}...{publicKey.toBase58().slice(-8)}
              </div>
            )}
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Network</div>
            <div style={{ ...styles.cardValue, fontSize: 20 }}>Devnet</div>
            <div style={styles.cardDesc}>
              <a href="https://faucet.solana.com" target="_blank" rel="noopener noreferrer" style={styles.link}>
                Get devnet SOL →
              </a>
            </div>
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Run the Demo</h2>
        <div style={styles.codeBlock}>
          <pre style={{ margin: 0, color: "#a1a1aa" }}>
            {`# Clone and install
git clone https://github.com/YOUR_USERNAME/st-poland-bounty
cd st-poland-bounty && npm install

# Run demo against devnet (uses deployed program)
npm run demo:devnet

# Or run locally with solana-test-validator
solana-test-validator  # Terminal 1
anchor deploy          # Terminal 2
npm run demo:local     # Terminal 2`}
          </pre>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Architecture</h2>
        <div style={styles.grid}>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Workspace</div>
            <div style={styles.cardDesc}>
              Administrative boundary. Isolates templates and runs. Admin-controlled.
              PDA: <code style={{ color: "#a5b4fc" }}>[&quot;workspace&quot;, admin]</code>
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>WorkflowTemplate</div>
            <div style={styles.cardDesc}>
              Reusable workflow definition. Up to 3 stages, configurable SLAs.
              PDA: <code style={{ color: "#a5b4fc" }}>[&quot;template&quot;, workspace, index]</code>
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>WorkflowRun</div>
            <div style={styles.cardDesc}>
              Instance of a template execution. Tracks status and timestamps.
              PDA: <code style={{ color: "#a5b4fc" }}>[&quot;run&quot;, workspace, index]</code>
            </div>
          </div>
          <div style={styles.card}>
            <div style={styles.cardTitle}>Task</div>
            <div style={styles.cardDesc}>
              Stateful execution unit. Deadline, retry count, error codes.
              PDA: <code style={{ color: "#a5b4fc" }}>[&quot;task&quot;, run, index]</code>
            </div>
          </div>
        </div>
      </section>

      <footer style={styles.footer}>
        <p>
          Built for{" "}
          <a
            href="https://superteam.fun/earn/listing/rebuild-production-backend-systems-as-on-chain-rust-programs"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.link}
          >
            Superteam Poland Bounty
          </a>
          {" "}— Rebuild production backend systems as on-chain Rust programs
        </p>
        <p style={{ marginTop: 12, color: "#52525b" }}>
          All state transitions enforced on-chain. No off-chain component can bypass program rules.
        </p>
      </footer>
    </div>
  );
}
