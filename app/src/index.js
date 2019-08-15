import 'bootstrap';
import './scss/app.scss';

import Web3 from "web3";


import remittanceArtifact from "../../build/contracts/Remittance.json";


const App = {
    web3: null,
    account: null,
    remittance: null,

    start: async function () {
        const {web3} = this;

        try {
            // get contract instance
            const networkId = await web3.eth.net.getId();
            const deployedNetwork = remittanceArtifact.networks[networkId];
            this.remittance = new web3.eth.Contract(
                remittanceArtifact.abi,
                deployedNetwork.address,
            );

            // get accounts
            const accounts = await web3.eth.getAccounts();
            this.account = accounts[0];

        } catch (error) {
            console.error("Could not connect to contract or chain.");
        }
    },

    withdraw: async function () {
        const secretPartOne = document.getElementById("inputFirstPart").value;
        const secretPartTwo = document.getElementById("inputSecondPart").value;

        this.setStatus("Initiating transaction... (please wait)");
        const secret = App.web3.utils.soliditySha3({type:'string',value:secretPartOne+secretPartTwo});

        const {withdraw} = this.remittance.methods;

        await withdraw(secret).send({from: this.account});

      this.setStatus("Transaction complete!");
    },

    deposit: async function () {
        const secretPartOne = document.getElementById("inputFirstPart").value;
        const secretPartTwo = document.getElementById("inputSecondPart").value;
        const receiver = document.getElementById("inputToAddress").value;
        const amount = App.web3.utils.toWei(document.getElementById("inputToAddressAmount").value,"ether");

        this.setStatus("Initiating transaction... (please wait)");

        const secretCode = App.web3.utils.soliditySha3({type:'string',value:secretPartOne+secretPartTwo});
        const retrievalCodeSecure = App.web3.utils.soliditySha3({type: 'address', value: receiver},{type:'string',value: secretCode});

        const {deposit} = this.remittance.methods;
        console.info("deposit",retrievalCodeSecure,receiver,this.account,amount);
        await deposit(retrievalCodeSecure, receiver).send({from: this.account, value: amount});

        this.setStatus("Transaction complete!");
    },

    setStatus: function (message) {
        const status = document.getElementById("statusMessage");
        status.innerHTML = message;
        status.classList.remove('d-none');
    },
};

window.App = App;

window.addEventListener("load", function () {
    if (window.ethereum) {
        // use MetaMask's provider
        App.web3 = new Web3(window.ethereum);
        window.ethereum.enable(); // get permission to access accounts
    } else {
        console.warn(
            "No web3 detected. Falling back to http://127.0.0.1:8545. You should remove this fallback when you deploy live",
        );
        // fallback - use your fallback strategy (local node / hosted node + in-dapp id mgmt / fail)
        App.web3 = new Web3(
            new Web3.providers.HttpProvider("http://127.0.0.1:8545"),
        );
    }

    App.start();
});