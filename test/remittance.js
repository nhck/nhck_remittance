const {BN} = web3.utils;
const RemittanceFactory = artifacts.require("Remittance");
const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');

contract("Remittance", accounts => {

    //sender initates the contract
    //exchange has Part One of the Password
    //receiver has Part Two of the Password
    const [coinbase, sender, exchange, thirdparty] = accounts;

    let remi;

    let retrievalCode;
    let retrievalCodeWrong;
    let retrievalCodeSecure;

    const testAmount = new BN(10);
    const testFeeAmount = new BN(2900001);

    const initialExpiryLimit = new BN(10000);
    const initialFeeWei = new BN(29000);
    const initialFeeThresholdPerMille = new BN(10);

    beforeEach('setup a new contract for each test', async function () {
        remi = await RemittanceFactory.new(true, initialExpiryLimit, initialFeeWei, initialFeeThresholdPerMille, {from: sender});

        retrievalCode = await remi.createRetrievalCode("Part One" + "Part Two");
        retrievalCodeWrong = await remi.createRetrievalCode("Wrong" + "Code");
        retrievalCodeSecure = await remi.createRetrievalCodeSecure(retrievalCode, exchange);
    });

    it("should have an owner", async function () {
        assert.strictEqual(await remi.getOwner(), sender, "There should be a contract owner.");
    });

    describe("creating a test deposit", function () {

        let remiDepositTxObj;
        let testTimestampNow;
        let testTimestampFuture;

        beforeEach('make a deposit', async function () {
            testTimestampNow = new BN(Date.now()).div(new BN(1000));
            testTimestampFuture = testTimestampNow.add(new BN(120));

            remiDepositTxObj = await remi.deposit(retrievalCodeSecure, testTimestampFuture, {
                from: sender,
                value: testAmount
            });
        });

        describe("testing the standard functionality", function () {

            it("should accept deposits", async function () {
                const remiPayment = await remi.payments.call(retrievalCodeSecure);

                assert.strictEqual("10", new BN(remiPayment.amount).toString(), "Deposited amount should be 10.");
                assert.strictEqual(sender, remiPayment.sender, "Address of sender should be recorded.");
                assert.strictEqual(testTimestampFuture.toString(), remiPayment.expiresTimestamp.toString(), "Expire timestamp should be set.");

                assert.strictEqual(remiDepositTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

                await truffleAssert.eventEmitted(remiDepositTxObj, "LogDeposited", (ev) => {
                    return ev.sender === sender && testAmount.eq(ev.amount) && testTimestampFuture.eq(ev.expiresTimestamp) && ev.retrievalCodeSecure === retrievalCodeSecure && ev.feePaid.eq(new BN(0));
                });
            });

            it("should allow correct withdrawals", async function () {

                const exchangeBalanceBefore = new BN(await web3.eth.getBalance(exchange));

                const remiWithdrawTxObj = await remi.withdraw(retrievalCode, {from: exchange});
                const remiWithdrawTx = await web3.eth.getTransaction(remiWithdrawTxObj.tx);

                const transactionFee = new BN(remiWithdrawTxObj.receipt.gasUsed).mul(new BN(remiWithdrawTx.gasPrice));
                const exchangeBalanceAfter = new BN(await web3.eth.getBalance(exchange));

                assert.strictEqual(exchangeBalanceBefore.add(testAmount).sub(transactionFee).toString(), exchangeBalanceAfter.toString(), "Balance of exchange should be the original balance plus 10 minus the transaction fee.");

                const remiPayment = await remi.payments.call(retrievalCodeSecure);
                assert.strictEqual(new BN(0).toString(), new BN(remiPayment.amount).toString(), "There should be no wei left in the account");

                assert.strictEqual(remiWithdrawTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

                await truffleAssert.eventEmitted(remiWithdrawTxObj, "LogWithdrawn", (ev) => {
                    return ev.sender === exchange && testAmount.eq(ev.amount) && ev.retrievalCodeSecure === retrievalCodeSecure;
                });
            });

            it("should allow reclaim", async function () {

                //get the timedifference that is left and add 2000ms as grace period
                const timeDiff = testTimestampFuture.mul(new BN(1000)).sub(new BN(Date.now())).add(new BN(2000));
                //If there is a time difference left than we have to wait a bit and then make sure we have a fresh block
                if (timeDiff.gt(new BN(0))) {
                    //wait for the timedifference to pass
                    await new Promise(resolve => {
                        setTimeout(resolve, timeDiff);
                    });

                    const remiDummyTxReceipt = await web3.eth.sendTransaction({
                        from: coinbase,
                        to: sender,
                        value: testAmount
                    });
                    assert.isTrue(remiDummyTxReceipt.status, "Dummy transaction failed. We cannot be sure, we are on the next block")
                }

                const remiPaymentBefore = await remi.payments.call(retrievalCodeSecure);
                assert.strictEqual("10", new BN(remiPaymentBefore.amount).toString(), "Target amount should be 10.");

                const senderBalanceBefore = new BN(await web3.eth.getBalance(sender));

                const remiReclaimTxObj = await remi.reclaim(retrievalCodeSecure, {from: sender});
                const remiReclaimTx = await web3.eth.getTransaction(remiReclaimTxObj.tx);

                const transactionFee = new BN(remiReclaimTxObj.receipt.gasUsed).mul(new BN(remiReclaimTx.gasPrice));
                const senderBalanceAfter = new BN(await web3.eth.getBalance(sender));

                assert.strictEqual(senderBalanceBefore.add(testAmount).sub(transactionFee).toString(), senderBalanceAfter.toString(), "Balance of sender should be the original balance plus 10 minus the transaction fee.");

                const remiPaymentAfter = await remi.payments.call(retrievalCodeSecure);
                assert.strictEqual(new BN(0).toString(), new BN(remiPaymentAfter.amount).toString(), "There should be no wei left in the account");

                assert.strictEqual(remiReclaimTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

                await truffleAssert.eventEmitted(remiReclaimTxObj, "LogDepositReclaimed", (ev) => {
                    return ev.sender === sender && testAmount.eq(ev.amount) && ev.retrievalCodeSecure === retrievalCodeSecure;
                });
            });


            it("should allow extension of the expire Timestamp", async function () {
                const remiPayment = await remi.payments.call(retrievalCodeSecure);
                const extensionSeconds = new BN(100);

                const remiExpireTimeTxObj = await remi.expireTimeExtend(retrievalCodeSecure, extensionSeconds, {from: sender});
                const remiPaymentUpdated = await remi.payments.call(retrievalCodeSecure);

                assert.strictEqual(remiPayment.expiresTimestamp.add(extensionSeconds).toString(), remiPaymentUpdated.expiresTimestamp.toString(), "Timestamps should be correctly updated.");
                assert.strictEqual(remiExpireTimeTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

                await truffleAssert.eventEmitted(remiExpireTimeTxObj, "LogTimestampExtended", (ev) => {
                    return ev.sender === sender && remiPaymentUpdated.expiresTimestamp.eq(ev.expiresTimestamp) && ev.retrievalCodeSecure === retrievalCodeSecure;
                });
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

            it("should not allow withdrawals that expired", async function () {
                const timeDiff = testTimestampFuture.mul(new BN(1000)).sub(new BN(Date.now())).add(new BN(2000));
                if (timeDiff.gt(new BN(0))) {
                    await new Promise(resolve => {
                        setTimeout(resolve, timeDiff);
                    });

                    const remiDummyTxReceipt = await web3.eth.sendTransaction({
                        from: coinbase,
                        to: sender,
                        value: testAmount
                    });

                    assert.isTrue(remiDummyTxReceipt.status, "Dummy transaction failed. We cannot be sure, we are on the next block")
                }
                await truffleAssert.fails(
                    remi.withdraw(retrievalCode, {from: exchange})
                )
            });
        });

        describe("Reclaim fail cases", function () {

            it("should not allow reclaims that are not due", async function () {

                assert.isTrue((new BN(Date.now())).div(new BN(1000)).lt(testTimestampFuture), "Test condition not met: Future Timestamp has already expired");
                await truffleAssert.fails(
                    remi.reclaim(retrievalCodeSecure, {from: sender})
                )
            });
        });

        describe("Expired Timestamps fail cases", function () {

            it("should not allow extension of the expire Timestamp beyond the limit", async function () {
                const extensionSeconds = new BN(10100);

                await truffleAssert.fails(
                    remi.expireTimeExtend(retrievalCodeSecure, extensionSeconds, {from: sender})
                )
            });

            it("should not allow extension of the expire Timestamp by the exchange", async function () {
                const extensionSeconds = new BN(100);

                await truffleAssert.fails(
                    remi.expireTimeExtend(retrievalCodeSecure, extensionSeconds, {from: exchange})
                )
            });
        });
    });

    describe("Deposit fail cases", function () {

        it("should not accept deposits without a expiryTime", async function () {
            await truffleAssert.fails(
                remi.deposit(retrievalCodeSecure, "0", {from: sender, value: testAmount})
            )
        });

        it("should not accept deposits without a retrieval code", async function () {
            await truffleAssert.fails(
                remi.deposit("", new BN(Date.now()).div(new BN(1000)).add(new BN(120)), {
                    from: sender,
                    value: testAmount
                })
            )
        });
    });

    describe("Fee management", function () {
        let remiDepositTxObj;
        let testTimestampNow;
        let testTimestampFuture;


        beforeEach('make a deposit', async function () {
            testTimestampNow = new BN(Date.now()).div(new BN(1000));
            testTimestampFuture = testTimestampNow.add(new BN(120));
            remiDepositTxObj = await remi.deposit(retrievalCodeSecure, testTimestampFuture, {
                from: sender,
                value: testFeeAmount
            });
        });

        it("should take a fee if the amount is high enough", async function () {
            const feeBalance = await remi.feeBalance.call(sender);
            const testAmountDeposited = new BN(2871001); //testAmount - initialFeeWei <=> 2900001 - 29000 = 2871001

            assert.strictEqual(feeBalance.toString(), initialFeeWei.toString(), "The paid fee should be exactly the fee balance.");

            await truffleAssert.eventEmitted(remiDepositTxObj, "LogDeposited", (ev) => {
                return ev.sender === sender && testAmountDeposited.eq(ev.amount) && ev.retrievalCodeSecure === retrievalCodeSecure && ev.feePaid.eq(initialFeeWei);
            });
        });

        it("should allow withdrawals of fees by the owner", async function () {
            const senderBalanceBefore = new BN(await web3.eth.getBalance(sender));
            const remiFeeBalanceBefore = await remi.feeBalance.call(sender);

            assert.strictEqual(initialFeeWei.toString(), remiFeeBalanceBefore.toString(), "Fee balance should equal only one transaction.");

            const remiFeeWithdrawTxObj = await remi.withdrawFees({from: sender});
            const remiFeeWithdrawTx = await web3.eth.getTransaction(remiFeeWithdrawTxObj.tx);

            const transactionFee = new BN(remiFeeWithdrawTxObj.receipt.gasUsed).mul(new BN(remiFeeWithdrawTx.gasPrice));
            const senderBalanceAfter = new BN(await web3.eth.getBalance(sender));

            assert.strictEqual(senderBalanceBefore.add(remiFeeBalanceBefore).sub(transactionFee).toString(), senderBalanceAfter.toString(), "Balance of sender should be the original balance plus 29000 minus the transaction fee.");

            const remiFeeBalanceAfter = await remi.feeBalance.call(sender);
            assert.strictEqual(new BN(0).toString(), remiFeeBalanceAfter.toString(), "There should be no wei left in the feeBalance");

            assert.strictEqual(remiFeeWithdrawTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

            await truffleAssert.eventEmitted(remiFeeWithdrawTxObj, "LogFeesWithdrawn", (ev) => {
                return ev.sender === sender && initialFeeWei.eq(ev.amount);
            });
        });

        it("should allow to update the fees by the owner", async function () {
            const newFee = new BN(55555);

            await remi.adjustFee(newFee, {from: sender});

            const setFee = await remi.feeWei.call();

            assert.strictEqual(newFee.toString(), setFee.toString(), "Fee should be set correctly");
        });

        it("should allow to update the fee threshold by the owner", async function () {
            const newThresholdPerMille = new BN(5);

            const remiThresholdTxObj = await remi.adjustThresholdFee(newThresholdPerMille, {from: sender});

            const setThresholdPerMille = await remi.feeThresholdPerMille.call();

            assert.strictEqual(newThresholdPerMille.toString(), setThresholdPerMille.toString(), "Fee Threshold should be set correctly");
        });
    });
});

