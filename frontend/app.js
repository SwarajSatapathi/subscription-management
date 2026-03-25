// app.js

// ==========================================
// CONFIGURATION
// CONTRACT_ID is now entered via the UI input field
// ==========================================

const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const RPC_URL = "https://soroban-testnet.stellar.org";
const server = new StellarSdk.SorobanRpc.Server(RPC_URL);

document.addEventListener("DOMContentLoaded", () => {
    const connectBtn = document.getElementById("connect-wallet");
    const overlay = document.getElementById("content-overlay");
    const dashboard = document.getElementById("dashboard");
    const demoBadge = document.getElementById("demo-badge");

    const userAddressEl = document.getElementById("user-address");
    const activityDot = document.getElementById("activity-dot");
    const activityText = document.getElementById("activity-text");
    const userExpiryEl = document.getElementById("user-expiry");

    const subscribeForm = document.getElementById("subscribe-form");
    const durationInput = document.getElementById("duration");
    const presetBtns = document.querySelectorAll(".preset-btn");
    const submitBtn = document.getElementById("submit-btn");

    let currentUser = null;
    let localExpiry = 0;
    let CONTRACT_ID = "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    let isDemoMode = false;

    // Manual wallet input elements
    const walletInput = document.getElementById("wallet-address-input");
    const contractInput = document.getElementById("contract-id-input");
    const submitWalletBtn = document.getElementById("submit-wallet");

    // Manual wallet + contract ID entry
    submitWalletBtn.addEventListener("click", () => {
        const address = walletInput.value.trim();
        const contractId = contractInput.value.trim();

        if (!address || !address.startsWith("G") || address.length !== 56) {
            alert("Please enter a valid Stellar public key (starts with G, 56 characters).");
            return;
        }

        // Update CONTRACT_ID if provided
        if (contractId && contractId.startsWith("C") && contractId.length === 56) {
            CONTRACT_ID = contractId;
        }

        onConnectSuccess(address);
    });

    walletInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submitWalletBtn.click();
        }
    });

    // Check Freighter Availability
    async function checkConnection() {
        if (window.freighterApi && await window.freighterApi.isConnected()) {
            const allowed = await window.freighterApi.isAllowed();
            if (allowed) {
                const publicKey = await window.freighterApi.getPublicKey();
                if (publicKey) onConnectSuccess(publicKey);
            }
        }
    }
    checkConnection();

    // Attempt Connection On Click
    connectBtn.addEventListener("click", async () => {
        try {
            if (window.freighterApi && await window.freighterApi.isConnected()) {
                const publicKey = await window.freighterApi.requestAccess();
                onConnectSuccess(publicKey);
            } else {
                alert("Please install the Freighter browser extension!");
            }
        } catch (error) {
            console.error(error);
            alert("Failed to connect wallet.");
        }
    });

    function isValidStellarKey(key, prefix) {
        try {
            if (prefix === 'G') StellarSdk.Keypair.fromPublicKey(key);
            return true;
        } catch {
            return false;
        }
    }

    function onConnectSuccess(address) {
        currentUser = address;
        userAddressEl.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
        connectBtn.textContent = "Wallet Connected";
        connectBtn.disabled = true;

        // Detect demo mode: placeholder contract or invalid keys
        isDemoMode = CONTRACT_ID.startsWith("CXXX") || !isValidStellarKey(address, 'G');

        if (isDemoMode) {
            demoBadge.textContent = "🧪 Demo Mode";
            demoBadge.classList.remove("hidden");
        } else {
            demoBadge.classList.add("hidden");
        }

        overlay.classList.remove("active");
        overlay.classList.add("hidden");
        dashboard.classList.remove("hidden");

        fetchContractData();
        setInterval(updateDisplay, 1000);
    }

    async function fetchContractData() {
        if (!currentUser) return;

        // Demo mode: load from localStorage
        if (isDemoMode) {
            const saved = localStorage.getItem(`sub_expiry_${currentUser}`);
            localExpiry = saved ? parseInt(saved) : 0;
            updateDisplay();
            return;
        }
        
        try {
            const account = new StellarSdk.Account(currentUser, "0");
            const contract = new StellarSdk.Contract(CONTRACT_ID);
            
            const op = contract.call(
                "get_expiry", 
                StellarSdk.nativeToScVal(currentUser, { type: "address" })
            );

            const tx = new StellarSdk.TransactionBuilder(account, {
                fee: "100",
                networkPassphrase: NETWORK_PASSPHRASE
            })
            .addOperation(op)
            .setTimeout(30)
            .build();

            const sim = await server.simulateTransaction(tx);
            if (sim.result && sim.result.retval) {
                localExpiry = Number(StellarSdk.scValToNative(sim.result.retval));
            } else {
                localExpiry = 0;
            }
        } catch (e) {
            console.error("Error fetching expiry:", e);
        }
        updateDisplay();
    }

    function updateDisplay() {
        if (!currentUser) return;
        
        const currentTime = Math.floor(Date.now() / 1000);
        const isActive = localExpiry > 0 && currentTime < localExpiry;
        
        if (isActive) {
            activityDot.classList.remove("inactive");
            activityDot.classList.add("active");
            activityText.textContent = "Active";
            activityText.style.color = "var(--success)";
            
            const date = new Date(localExpiry * 1000);
            userExpiryEl.textContent = date.toLocaleString();
        } else {
            activityDot.classList.remove("active");
            activityDot.classList.add("inactive");
            activityText.textContent = "Expired";
            activityText.style.color = "var(--danger)";
            userExpiryEl.textContent = localExpiry > 0 ? new Date(localExpiry * 1000).toLocaleString() : "None";
        }
    }

    presetBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            durationInput.value = btn.getAttribute("data-sec");
        });
    });

    subscribeForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const duration = parseInt(durationInput.value);
        if (isNaN(duration) || duration <= 0) return;

        submitBtn.textContent = "Processing...";
        submitBtn.disabled = true;

        // ===== DEMO MODE: simulate locally =====
        if (isDemoMode) {
            await new Promise(res => setTimeout(res, 800)); // simulate delay
            const currentTime = Math.floor(Date.now() / 1000);
            const base = localExpiry > currentTime ? localExpiry : currentTime;
            localExpiry = base + duration;
            localStorage.setItem(`sub_expiry_${currentUser}`, localExpiry.toString());
            updateDisplay();
            submitBtn.textContent = "Subscribe Now";
            submitBtn.disabled = false;
            alert("✅ Demo subscription activated for " + formatDuration(duration) + "!");
            return;
        }

        // ===== LIVE MODE: real Soroban transaction =====
        try {
            submitBtn.textContent = "Signing...";
            const accountResp = await server.getAccount(currentUser);
            const account = new StellarSdk.Account(currentUser, accountResp.sequence);

            const contract = new StellarSdk.Contract(CONTRACT_ID);
            const op = contract.call(
                "subscribe",
                StellarSdk.nativeToScVal(currentUser, { type: "address" }),
                StellarSdk.nativeToScVal(duration, { type: "u64" })
            );

            let tx = new StellarSdk.TransactionBuilder(account, {
                fee: "100",
                networkPassphrase: NETWORK_PASSPHRASE
            })
            .addOperation(op)
            .setTimeout(30)
            .build();

            submitBtn.textContent = "Simulating...";
            const sim = await server.simulateTransaction(tx);
            if (sim.error) throw new Error("Simulation failed: " + sim.error);

            tx = StellarSdk.assembleTransaction(tx, NETWORK_PASSPHRASE, sim).build();

            submitBtn.textContent = "Approve in Wallet...";
            const signedXdr = await window.freighterApi.signTransaction(tx.toXDR(), { network: "TESTNET" });
            const signedTx = StellarSdk.TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

            submitBtn.textContent = "Sending...";
            const response = await server.sendTransaction(signedTx);
            
            submitBtn.textContent = "Waiting for ledger...";
            let status = "PENDING";
            while (status === "PENDING") {
                await new Promise(res => setTimeout(res, 2000));
                const txStatus = await server.getTransaction(response.hash);
                status = txStatus.status;
                if (status === "SUCCESS") {
                    alert("Subscription updated successfully!");
                    fetchContractData();
                    break;
                } else if (status === "FAILED") {
                    throw new Error("Transaction submitted but failed on network.");
                }
            }
        } catch (error) {
            console.error(error);
            alert("Transaction failed: " + error.message);
        } finally {
            submitBtn.textContent = "Subscribe Now";
            submitBtn.disabled = false;
        }
    });

    // Helper: format seconds to readable string
    function formatDuration(seconds) {
        if (seconds >= 86400) return Math.round(seconds / 86400) + " day(s)";
        if (seconds >= 3600) return Math.round(seconds / 3600) + " hour(s)";
        if (seconds >= 60) return Math.round(seconds / 60) + " minute(s)";
        return seconds + " second(s)";
    }
});
