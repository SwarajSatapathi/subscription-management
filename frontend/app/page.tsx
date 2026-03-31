"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Networks,
  Keypair,
  Account,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  Transaction,
  rpc,
} from "@stellar/stellar-sdk";

const { Server, Api, assembleTransaction } = rpc;
import {
  requestAccess,
  isConnected,
  isAllowed,
  getAddress,
  signTransaction,
} from "@stellar/freighter-api";

const NETWORK_PASSPHRASE = Networks.TESTNET;
const RPC_URL = "https://soroban-testnet.stellar.org";

function formatDuration(seconds: number): string {
  if (seconds >= 86400) return Math.round(seconds / 86400) + " day(s)";
  if (seconds >= 3600) return Math.round(seconds / 3600) + " hour(s)";
  if (seconds >= 60) return Math.round(seconds / 60) + " minute(s)";
  return seconds + " second(s)";
}

function isValidStellarKey(key: string): boolean {
  try {
    Keypair.fromPublicKey(key);
    return true;
  } catch {
    return false;
  }
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [contractId, setContractId] = useState(
    "CCRD6PDVBWGHGLB7LKJNNES33U6O4X56JR2VJYDDAIZO764GS7DFORWI"
  );
  const [localExpiry, setLocalExpiry] = useState(0);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [duration, setDuration] = useState("");
  const [submitText, setSubmitText] = useState("Subscribe Now");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);

  const [walletInput, setWalletInput] = useState("");
  const [contractInput, setContractInput] = useState("");

  const localExpiryRef = useRef(localExpiry);
  const contractIdRef = useRef(contractId);

  useEffect(() => {
    localExpiryRef.current = localExpiry;
  }, [localExpiry]);

  useEffect(() => {
    contractIdRef.current = contractId;
  }, [contractId]);

  // Determine active status
  const currentTime = Math.floor(Date.now() / 1000);
  const isActive = localExpiry > 0 && currentTime < localExpiry;

  // Auto-refresh the display every second for the countdown
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!showDashboard) return;
    const interval = setInterval(() => setTick((t: number) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [showDashboard]);

  // Check Freighter on mount
  useEffect(() => {
    async function checkConnection() {
      try {
        const { isConnected: connected } = await isConnected();
        if (connected) {
          const { isAllowed: allowed } = await isAllowed();
          if (allowed) {
            const { address } = await getAddress();
            if (address) {
              onConnectSuccess(address);
            }
          }
        }
      } catch {
        // Freighter not installed
      }
    }
    checkConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchContractData = useCallback(
    async (user: string, demo: boolean) => {
      if (!user) return;

      if (demo) {
        const saved = localStorage.getItem(`sub_expiry_${user}`);
        setLocalExpiry(saved ? parseInt(saved) : 0);
        return;
      }

      try {
        const server = new Server(RPC_URL);
        const account = new Account(user, "0");
        const contract = new Contract(contractIdRef.current);

        const op = contract.call(
          "get_expiry",
          nativeToScVal(user, { type: "address" })
        );

        const tx = new TransactionBuilder(account, {
          fee: "100",
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(op)
          .setTimeout(30)
          .build();

        const sim = await server.simulateTransaction(tx);
        if (Api.isSimulationSuccess(sim) && sim.result) {
          setLocalExpiry(Number(scValToNative(sim.result.retval)));
        } else {
          setLocalExpiry(0);
        }
      } catch (e) {
        console.error("Error fetching expiry:", e);
      }
    },
    []
  );

  function onConnectSuccess(address: string) {
    setCurrentUser(address);
    setWalletConnected(true);

    const demo =
      contractIdRef.current.startsWith("CXXX") || !isValidStellarKey(address);
    setIsDemoMode(demo);
    setShowDashboard(true);
    fetchContractData(address, demo);
  }

  async function handleFreighterConnect() {
    try {
      const { isConnected: connected } = await isConnected();
      if (connected) {
        const { address } = await requestAccess();
        if (address) {
          onConnectSuccess(address);
        }
      } else {
        alert("Please install the Freighter browser extension!");
      }
    } catch (error) {
      console.error(error);
      alert("Failed to connect wallet.");
    }
  }

  function handleManualConnect() {
    const address = walletInput.trim();
    const cId = contractInput.trim();

    if (!address || !address.startsWith("G") || address.length !== 56) {
      alert(
        "Please enter a valid Stellar public key (starts with G, 56 characters)."
      );
      return;
    }

    if (cId && cId.startsWith("C") && cId.length === 56) {
      setContractId(cId);
      contractIdRef.current = cId;
    }

    onConnectSuccess(address);
  }

  async function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    const dur = parseInt(duration);
    if (isNaN(dur) || dur <= 0) return;
    if (!currentUser) return;

    setIsSubmitting(true);
    setSubmitText("Processing...");

    // DEMO MODE
    if (isDemoMode) {
      await new Promise((res) => setTimeout(res, 800));
      const now = Math.floor(Date.now() / 1000);
      const base = localExpiryRef.current > now ? localExpiryRef.current : now;
      const newExpiry = base + dur;
      setLocalExpiry(newExpiry);
      localStorage.setItem(`sub_expiry_${currentUser}`, newExpiry.toString());
      setSubmitText("Subscribe Now");
      setIsSubmitting(false);
      alert("✅ Demo subscription activated for " + formatDuration(dur) + "!");
      return;
    }

    // LIVE MODE
    try {
      setSubmitText("Signing...");
      const server = new Server(RPC_URL);
      const account = await server.getAccount(currentUser);

      const contract = new Contract(contractIdRef.current);
      const op = contract.call(
        "subscribe",
        nativeToScVal(currentUser, { type: "address" }),
        nativeToScVal(dur, { type: "u64" })
      );

      let tx = new TransactionBuilder(account, {
        fee: "100",
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(op)
        .setTimeout(30)
        .build();

      setSubmitText("Simulating...");
      const sim = await server.simulateTransaction(tx);
      if (Api.isSimulationError(sim)) {
        throw new Error("Simulation failed");
      }

      tx = assembleTransaction(
        tx,
        sim as rpc.Api.SimulateTransactionSuccessResponse
      ).build();

      setSubmitText("Approve in Wallet...");
      const { signedTxXdr } = await signTransaction(tx.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      const signedTx = TransactionBuilder.fromXDR(
        signedTxXdr,
        NETWORK_PASSPHRASE
      );

      setSubmitText("Sending...");
      const response = await server.sendTransaction(
        signedTx as Transaction
      );

      setSubmitText("Waiting for ledger...");
      let status: string = "PENDING";
      while (status === "PENDING") {
        await new Promise((res) => setTimeout(res, 2000));
        const txStatus = await server.getTransaction(response.hash);
        status = txStatus.status;
        if (status === "SUCCESS") {
          alert("Subscription updated successfully!");
          fetchContractData(currentUser, false);
          break;
        } else if (status === "FAILED") {
          throw new Error("Transaction submitted but failed on network.");
        }
      }
    } catch (error: unknown) {
      console.error(error);
      alert(
        "Transaction failed: " +
          (error instanceof Error ? error.message : String(error))
      );
    } finally {
      setSubmitText("Subscribe Now");
      setIsSubmitting(false);
    }
  }

  const expiryDate =
    localExpiry > 0 ? new Date(localExpiry * 1000).toLocaleString() : "None";

  return (
    <>
      <div className="background-effects">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div className="container glass-panel">
        <header>
          <div className="logo-area">
            <div className="logo-icon" />
            <h1>Subscription Manager</h1>
          </div>
          <button
            id="connect-wallet"
            className="btn primary-btn"
            onClick={handleFreighterConnect}
            disabled={walletConnected}
          >
            {walletConnected ? "Wallet Connected" : "Connect Wallet"}
          </button>
        </header>

        <main>
          {!showDashboard && (
            <div id="content-overlay" className="overlay">
              <div className="connect-section">
                <div className="input-group">
                  <label htmlFor="contract-id-input">Contract ID</label>
                  <input
                    type="text"
                    id="contract-id-input"
                    placeholder="Paste deployed Contract ID (C...)"
                    spellCheck={false}
                    autoComplete="off"
                    value={contractInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContractInput(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="wallet-address-input">Wallet Address</label>
                  <input
                    type="text"
                    id="wallet-address-input"
                    placeholder="Paste your Stellar public key (G...)"
                    spellCheck={false}
                    autoComplete="off"
                    value={walletInput}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWalletInput(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleManualConnect();
                      }
                    }}
                  />
                </div>
                <button
                  id="submit-wallet"
                  className="btn action-btn"
                  onClick={handleManualConnect}
                >
                  Connect &amp; Enter
                </button>
              </div>
              <div className="divider-text">
                <span>or use Freighter extension</span>
              </div>
              <p className="hint-text">
                Click &quot;Connect Wallet&quot; above if Freighter is
                installed.
              </p>
            </div>
          )}

          {showDashboard && (
            <div id="dashboard" className="dashboard">
              <section className="status-card glass-panel">
                <h2>Your Status</h2>
                <div className="status-indicator">
                  <span
                    id="activity-dot"
                    className={`dot ${isActive ? "active" : "inactive"}`}
                  />
                  <span
                    id="activity-text"
                    style={{
                      color: isActive ? "var(--success)" : "var(--danger)",
                    }}
                  >
                    {isActive ? "Active" : "Expired"}
                  </span>
                </div>
                <div className="address-display">
                  <span className="label">Address:</span>
                  <span id="user-address" className="mono">
                    {currentUser
                      ? `${currentUser.slice(0, 6)}...${currentUser.slice(-4)}`
                      : "..."}
                  </span>
                </div>
                <div className="expiry-display">
                  <span className="label">Expires At:</span>
                  <span id="user-expiry">{expiryDate}</span>
                </div>
              </section>

              <section className="action-card glass-panel">
                <h2>Manage Subscription</h2>
                <p className="subtitle">
                  Extend or activate your subscription using Testnet XLM.
                </p>

                <form id="subscribe-form" onSubmit={handleSubscribe}>
                  <div className="form-group">
                    <label htmlFor="duration">Duration</label>
                    <div className="presets">
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => setDuration("3600")}
                      >
                        1 Hour
                      </button>
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => setDuration("86400")}
                      >
                        1 Day
                      </button>
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => setDuration("2592000")}
                      >
                        30 Days
                      </button>
                    </div>
                    <input
                      type="number"
                      id="duration"
                      placeholder="Seconds"
                      required
                      min={1}
                      value={duration}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDuration(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn action-btn"
                    id="submit-btn"
                    disabled={isSubmitting}
                  >
                    {submitText}
                  </button>
                </form>
              </section>
            </div>
          )}
        </main>

        <footer>
          <p>Powered by Stellar Soroban Ecosystem</p>
          <span
            id="demo-badge"
            className={`badge warning ${!isDemoMode || !showDashboard ? "hidden" : ""}`}
          >
            🧪 Demo Mode
          </span>
        </footer>
      </div>
    </>
  );
}
