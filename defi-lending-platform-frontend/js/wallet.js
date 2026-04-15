const Wallet = {
    isMetaMaskInstalled() {
        return typeof window.ethereum !== 'undefined';
    },

    async connect() {
        return Protocol.connectWallet();
    },

    disconnect() {
        Protocol.disconnectWallet();
    },

    async checkPreviousConnection() {
        return Protocol.restoreWalletSession();
    },

    formatChainId(chainId) {
        return Utils.getChainLabel(chainId);
    },

    onAccountChanged(callback) {
        document.addEventListener('wallet:account-changed', (event) => callback(event.detail));
    },

    onChainChanged(callback) {
        document.addEventListener('wallet:chain-changed', (event) => callback(event.detail));
    }
};

window.Wallet = Wallet;
