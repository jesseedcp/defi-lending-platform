/**
 * DeFi Lending Protocol - Wallet Connection Module
 * Handles MetaMask integration and wallet connection
 * COMP5568 Course Project
 */

const Wallet = {
    /**
     * Check if MetaMask is installed
     */
    isMetaMaskInstalled() {
        return typeof window.ethereum !== 'undefined';
    },
    
    /**
     * Connect to MetaMask wallet
     * @returns {Promise<Object>} Connection result with account and chainId
     */
    async connect() {
        try {
            // Check if MetaMask is installed
            if (!this.isMetaMaskInstalled()) {
                throw new Error('MetaMask is not installed. Please install it first.');
            }
            
            // Request account access
            const accounts = await window.ethereum.request({ 
                method: 'eth_requestAccounts' 
            });
            
            // Get chain ID
            const chainId = await window.ethereum.request({ 
                method: 'eth_chainId' 
            });
            
            // Update global state
            AppState.walletConnected = true;
            AppState.currentAccount = accounts[0];
            AppState.chainId = chainId;
            
            // Save to localStorage for persistence
            localStorage.setItem('walletConnected', 'true');
            localStorage.setItem('currentAccount', accounts[0]);
            localStorage.setItem('chainId', chainId);
            
            console.log('✅ Wallet connected:', accounts[0]);
            console.log('🔗 Chain ID:', chainId);
            
            return {
                success: true,
                account: accounts[0],
                chainId: chainId
            };
            
        } catch (error) {
            console.error('❌ Wallet connection failed:', error);
            throw error;
        }
    },
    
    /**
     * Disconnect wallet
     */
    disconnect() {
        AppState.walletConnected = false;
        AppState.currentAccount = null;
        AppState.chainId = null;
        
        localStorage.removeItem('walletConnected');
        localStorage.removeItem('currentAccount');
        localStorage.removeItem('chainId');
        
        console.log('🔌 Wallet disconnected');
    },
    
    /**
     * Check if wallet was previously connected
     * This only checks the localStorage state, does NOT auto-connect
     */
    checkPreviousConnection() {
        const wasConnected = localStorage.getItem('walletConnected') === 'true';
        const account = localStorage.getItem('currentAccount');
        const chainId = localStorage.getItem('chainId');
        
        if (wasConnected && account && chainId) {
            // Only update state for UI display, do NOT auto-connect
            AppState.walletConnected = true;
            AppState.currentAccount = account;
            AppState.chainId = chainId;
            console.log('💾 Previous connection found:', account);
            return true;
        }
        return false;
    },
    
    /**
     * Format chain ID to readable format
     */
    formatChainId(chainId) {
        // Convert hex to decimal
        const decimal = parseInt(chainId, 16);
        
        const chainNames = {
            1: 'Ethereum Mainnet',
            5: 'Goerli Testnet',
            11155111: 'Sepolia Testnet',
            137: 'Polygon',
            42161: 'Arbitrum One',
            10: 'Optimism'
        };
        
        return chainNames[decimal] || `Chain ID: ${decimal}`;
    },
    
    /**
     * Listen for account changes
     */
    onAccountChanged(callback) {
        if (this.isMetaMaskInstalled()) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length > 0) {
                    AppState.currentAccount = accounts[0];
                    localStorage.setItem('currentAccount', accounts[0]);
                    callback(accounts[0]);
                } else {
                    this.disconnect();
                    callback(null);
                }
            });
        }
    },
    
    /**
     * Listen for chain changes
     */
    onChainChanged(callback) {
        if (this.isMetaMaskInstalled()) {
            window.ethereum.on('chainChanged', (chainId) => {
                AppState.chainId = chainId;
                localStorage.setItem('chainId', chainId);
                callback(chainId);
            });
        }
    }
};
