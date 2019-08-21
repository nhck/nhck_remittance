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

    let testAmount = new BN(10);


    beforeEach('setup a new contract for each test', async function () {
        remi = await RemittanceFactory.new(true, new BN(10000), {from: sender});

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
                let remiPayment = await remi.payments.call(retrievalCodeSecure);

                assert.strictEqual("10", new BN(remiPayment.amount).toString(), "Deposited amount should be 10.");
                assert.strictEqual(sender, remiPayment.sender, "Address of sender should be recorded.");
                assert.strictEqual(testTimestampFuture.toString(), remiPayment.expiresTimestamp.toString(), "Expire timestamp should be set.");

                assert.strictEqual(remiDepositTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

                await truffleAssert.eventEmitted(remiDepositTxObj, "LogDeposited", (ev) => {
                    return ev.sender === sender && testAmount.eq(ev.amount) && testTimestampFuture.eq(ev.expiresTimestamp) && ev.retrievalCodeSecure === retrievalCodeSecure && ev.feePaid.eq(new BN(0));
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
                    return ev.sender === exchange && testAmount.eq(ev.amount) && ev.retrievalCodeSecure === retrievalCodeSecure;
                });
            });

            it("should allow reclaim", async function () {

                //get the timedifference that is left and add 2000ms as grace period
                let timeDiff = testTimestampFuture.mul(new BN(1000)).sub(new BN(Date.now())).add(new BN(2000));
                //If there is a time difference left than we have to wait a bit and then make sure we have a fresh block
                if (timeDiff.gt(new BN(0))) {
                    //wait for the timedifference to pass
                    await new Promise(resolve => {
                        setTimeout(resolve, timeDiff);
                    });

                    let currentBlock = await web3.eth.getBlockNumber();
                    //Wait for the next Block to be mined, after that proceed.
                    while (currentBlock >= await web3.eth.getBlockNumber()) {
                        setTimeout(function () {
                        }, 1000);
                    }
                }

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
                    return ev.sender === sender && testAmount.eq(ev.amount) && ev.retrievalCodeSecure === retrievalCodeSecure;
                });
            });


            it("should allow extension of the expire Timestamp", async function () {
                let remiPayment = await remi.payments.call(retrievalCodeSecure);
                let extensionSeconds = new BN(100);

                let remiExpireTimeTxObj = await remi.expireTimeExtend(retrievalCodeSecure, extensionSeconds, {from: sender});

                let remiPaymentUpdated = await remi.payments.call(retrievalCodeSecure);

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
                let timeDiff = testTimestampFuture.mul(new BN(1000)).sub(new BN(Date.now())).add(new BN(2000));
                if (timeDiff.gt(new BN(0))) {
                    await new Promise(resolve => {
                        setTimeout(resolve, timeDiff);
                    });
                    let currentBlock = await web3.eth.getBlockNumber();

                    while (currentBlock >= await web3.eth.getBlockNumber()) {
                        setTimeout(function () {
                        }, 1000);
                    }
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
                let extensionSeconds = new BN(10100);

                await truffleAssert.fails(
                    remi.expireTimeExtend(retrievalCodeSecure, extensionSeconds, {from: sender})
                )
            });

            it("should not allow extension of the expire Timestamp by the exchange", async function () {
                let extensionSeconds = new BN(100);

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

        let testAmount = new BN(2900001);
        let feePaid = new BN(29000);

        beforeEach('make a deposit', async function () {
            testTimestampNow = new BN(Date.now()).div(new BN(1000));
            testTimestampFuture = testTimestampNow.add(new BN(120));
            remiDepositTxObj = await remi.deposit(retrievalCodeSecure, testTimestampFuture, {
                from: sender,
                value: testAmount
            });

        });

        it("should take a fee if the amount is high enough", async function () {
            let feeBalance = await remi.feeBalance.call();
            let testAmountDeposited = new BN(2871001); //testAmount - feePaid <=> 2900001 - 29000 = 2871001

            assert.strictEqual(feeBalance.toString(), feePaid.toString(), "The paid fee should be exactly the fee balance.");

            await truffleAssert.eventEmitted(remiDepositTxObj, "LogDeposited", (ev) => {
                return ev.sender === sender && testAmountDeposited.eq(ev.amount) && ev.retrievalCodeSecure === retrievalCodeSecure && ev.feePaid.eq(feePaid);
            });

        });

        it("should allow withdrawals of fees by the owner", async function () {
            let senderBalanceBefore = new BN(await web3.eth.getBalance(sender));
            let remiFeeBalance = await remi.feeBalance.call();

            assert.strictEqual(feePaid.toString(), remiFeeBalance.toString(), "Fee balance should equal only one transaction.");

            let remiFeeWithdrawTxObj = await remi.withdrawFees({from: sender});
            let remiFeeWithdrawTx = await web3.eth.getTransaction(remiFeeWithdrawTxObj.tx);

            let transactionFee = new BN(remiFeeWithdrawTxObj.receipt.gasUsed).mul(new BN(remiFeeWithdrawTx.gasPrice));
            let senderBalanceAfter = new BN(await web3.eth.getBalance(sender));

            assert.strictEqual(senderBalanceBefore.add(remiFeeBalance).sub(transactionFee).toString(), senderBalanceAfter.toString(), "Balance of sender should be the original balance plus 29000 minus the transaction fee.");

            remiFeeBalance = await remi.feeBalance.call();
            assert.strictEqual(new BN(0).toString(), remiFeeBalance.toString(), "There should be no wei left in the feeBalance");

            assert.strictEqual(remiFeeWithdrawTxObj.logs.length, 1, "Only one event is allowed in this transaction.");

            await truffleAssert.eventEmitted(remiFeeWithdrawTxObj, "LogFeesWithdrawn", (ev) => {
                return ev.sender === sender && feePaid.eq(ev.amount);
            });

        });

        it("should allow to update the fees by the owner", async function () {
            let newFee = new BN(55555);

            await remi.adjustFee(newFee, {from: sender});

            let setFee = await remi.feeWei.call();

            assert.strictEqual(newFee.toString(), setFee.toString(), "Fee should be set correctly");

        });

        it("should allow to update the fee threshold by the owner", async function () {
            let newThresholdPermille = new BN(5);

            await remi.adjustThresholdFee(newThresholdPermille, {from: sender});

            let setThresholdPermille = await remi.feeThresholdPermille.call();

            assert.strictEqual(newThresholdPermille.toString(), setThresholdPermille.toString(), "Fee Threshold should be set correctly");

        });
    });
});

