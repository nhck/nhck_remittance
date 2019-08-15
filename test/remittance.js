const { BN, soliditySha3 } = web3.utils;
const RemittanceFactory = artifacts.require("Remittance");
const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');

contract("Remittance", accounts => {

    //Sender initates the contract
    //exchange has Part One of the Password
    //receiver has Part Two of the Password
    const [coinbase, sender, exchange, thirdparty] = accounts;

    let remi;

    const retrievalCode =  soliditySha3({type: "string", value: "Part One" + "Part Two"});
    const retrievalCodeWrong =  soliditySha3({type: "string", value: "Wrong" + "Code"});
    const retrievalCodeSecure =  soliditySha3({type: 'address', value: exchange}, {
        type: 'bytes32',
        value: retrievalCode
    });


    const testAmount = new BN(10);

    beforeEach('setup a new contract for each test', async function () {
        remi = await RemittanceFactory.new(true, {from: sender});
    });

    it("should have an owner", async function () {
        assert.strictEqual(await remi.getOwner(), sender, "There should be a contract owner.");
    });

    describe("creating a test deposit", function () {

        let remiDepositTxObj;

        beforeEach('make a deposit', async function () {

            remiDepositTxObj = await remi.deposit(retrievalCodeSecure, exchange, {from: sender, value: testAmount});

        });

        describe("testing the standard functionality", function () {

            it("should accept deposits", async function () {
                let remiPayment = await remi.payments.call(retrievalCodeSecure);

                assert.strictEqual("10", new BN(remiPayment.amount).toString(), "Deposited amount should be 10.");
                assert.strictEqual(exchange, remiPayment.exchange, "Address of exchange should be correct.");
                assert.strictEqual(sender, remiPayment.sender, "Address of sender should be recorded.")

                assert.strictEqual(remiDepositTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

                await truffleAssert.eventEmitted(remiDepositTxObj, "LogDeposited", (ev) => {
                    return ev.sender === sender && testAmount.eq(ev.amount) && ev.retrievalCode === retrievalCodeSecure;
                });
            });

            it("should allow correct withdrawals", async function () {

                let exchangeBalanceBefore = new BN(await web3.eth.getBalance(exchange));

                let remiWithdrawTxObj = await remi.withdraw(retrievalCode, {from: exchange});
                let remiWithdrawTx = await web3.eth.getTransaction(remiWithdrawTxObj.tx);

                let transactionFee = new BN(remiWithdrawTxObj.receipt.gasUsed).mul(new BN(remiWithdrawTx.gasPrice));
                let exchangeBalanceAfter = new BN(await web3.eth.getBalance(exchange));

                assert.strictEqual(exchangeBalanceBefore.add(testAmount).sub(transactionFee).toString(), exchangeBalanceAfter.toString(), "Balance of exchange should be the original balance plus 10 minus the transaction fee.");

                let remiPayment = await remi.payments.call(retrievalCodeSecure);
                assert.strictEqual(new BN(0).toString(), new BN(remiPayment.amount).toString(), "There should be no wei left in the account");

                assert.strictEqual(remiWithdrawTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

                await truffleAssert.eventEmitted(remiWithdrawTxObj, "LogWithdrawn", (ev) => {
                    return ev.sender === exchange && testAmount.eq(ev.amount) && ev.retrievalCode === retrievalCodeSecure;
                });
            });

            it("should allow reclaim", async function () {

                let remiPayment = await remi.payments.call(retrievalCodeSecure);
                assert.strictEqual("10", new BN(remiPayment.amount).toString(), "Target amount should be 10.");

                let senderBalanceBefore = new BN(await web3.eth.getBalance(sender));

                let remiReclaimTxObj = await remi.reclaim(retrievalCodeSecure, {from: sender});
                let remiReclaimTx = await web3.eth.getTransaction(remiReclaimTxObj.tx);

                let transactionFee = new BN(remiReclaimTxObj.receipt.gasUsed).mul(new BN(remiReclaimTx.gasPrice));
                let senderBalanceAfter = new BN(await web3.eth.getBalance(sender));

                assert.strictEqual(senderBalanceBefore.add(testAmount).sub(transactionFee).toString(), senderBalanceAfter.toString(), "Balance of sender should be the original balance plus 10 minus the transaction fee.");

                remiPayment = await remi.payments.call(retrievalCodeSecure);
                assert.strictEqual(new BN(0).toString(), new BN(remiPayment.amount).toString(), "There should be no wei left in the account");

                assert.strictEqual(remiReclaimTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

                await truffleAssert.eventEmitted(remiReclaimTxObj, "LogDepositReclaimed", (ev) => {
                    return ev.sender === sender && testAmount.eq(ev.amount) && ev.retrievalCode === retrievalCodeSecure;
                });
            });

            it("should provide the same retrieval code in web3 and contract for senders", async function () {
                assert.strictEqual(retrievalCodeSecure, await remi.createRetrievalCodeSecure("Part One", "Part Two", exchange), "Secure retrieval code version for sender created by web3 and contract don't match.");
            });

            it("should provide the same retrieval code in web3 and contract for exchanges", async function () {
                assert.strictEqual(retrievalCode, await remi.createRetrievalCode("Part One", "Part Two"), "Retrieval code version for exchange created by web3 and contract don't match.");
            });
        });

        describe("Withdraw fail cases", function () {

            it("should not allow withdrawals without a retrieval code", async function () {
                await truffleAssert.fails(
                    remi.withdraw("", {from: exchange})
                )
            });

            it("should not allow withdrawals from a third party that gained access to both passwords", async function () {
                await truffleAssert.fails(
                    remi.withdraw(retrievalCode, {from: thirdparty})
                )
            });

            it("should not allow withdrawals with a wrong retrieval code", async function () {
                await truffleAssert.reverts(
                    remi.withdraw(retrievalCodeWrong, {from: exchange})
                )
            });
        })
    });

    describe("Deposit fail cases", function () {

        it("should not accept deposits without a recipient", async function () {
            await truffleAssert.fails(
                remi.deposit(retrievalCodeSecure, "0x0", {from: sender, value: testAmount})
            )
        });

        it("should not accept deposits without a retrieval code", async function () {
            await truffleAssert.fails(
                remi.deposit("", exchange, {from: sender, value: testAmount})
            )
        });
    });


});