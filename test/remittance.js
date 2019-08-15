const BN = web3.utils.BN;

const RemittanceFactory = artifacts.require("Remittance");
const assert = require("chai").assert;
const truffleAssert = require('truffle-assertions');

contract("Remittance", accounts => {

    //Sender initates the contract
    //exchange has Part One of the Password
    //receiver has Part Two of the Password
    const [sender, exchange, receiver, thirdparty] = accounts;

    let remi;

    const retrievalCode = web3.utils.soliditySha3({type: "string", value: "Part One" + "Part Two"});
    const retrievalCodeWrong = web3.utils.soliditySha3({type: "string", value: "Wrong" + "Code"});
    const retrievalCodeSecure = web3.utils.soliditySha3({type: 'address', value: exchange}, {
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

        let remiDepositReceipt;

        beforeEach('make a deposit', async function () {

            remiDepositReceipt = await remi.deposit(retrievalCodeSecure, exchange, {from: sender, value: testAmount});

        });

        describe("testing the standard functionality", function () {

            it("should accept deposits", async function () {
                let remiPayment = await remi.payments.call(retrievalCodeSecure);

                assert.strictEqual("10", new BN(remiPayment.amount).toString(), "Deposited amount should be 10.");
                assert.strictEqual(exchange, remiPayment.exchange, "Address of exchange should be correct.");

//            event LogDeposit(address indexed sender, uint amount, bytes32 retrievalCode);
                assert.strictEqual(remiDepositReceipt.logs.length, 1, "Only one event is allowed in this transaction.");

                //   event LogDeposit(address indexed sender, uint amount, bytes32 retrievalCode)
                await truffleAssert.eventEmitted(remiDepositReceipt, "LogDeposit", (ev) => {
                    return ev.sender === sender && testAmount.eq(ev.amount) && ev.retrievalCode === retrievalCodeSecure;
                });
            });

            it("should allow correct withdrawals", async function () {

                let exchangeBalanceBefore = new BN(await web3.eth.getBalance(exchange));

                let remiWithdrawReceipt = await remi.withdraw(retrievalCode, {from: exchange});
                let remiWithdrawTransaction = await web3.eth.getTransaction(remiWithdrawReceipt.tx);

                let transactionFee = new BN(remiWithdrawReceipt.receipt.gasUsed).mul(new BN(remiWithdrawTransaction.gasPrice));
                let exchangeBalanceAfter = new BN(await web3.eth.getBalance(exchange));

                assert.strictEqual(exchangeBalanceBefore.add(testAmount).sub(transactionFee).toString(), exchangeBalanceAfter.toString(), "Balance of exchange should be the original balance plus 10 minus the transaction fee.");

                let remiPayment = await remi.payments.call(retrievalCodeSecure);
                assert.strictEqual(new BN(0).toString(), new BN(remiPayment.amount).toString(), "There should be no wei left in the account");

                assert.strictEqual(remiWithdrawReceipt.logs.length, 1, "Only one event is allowed in this transaction.");

                //  event LogWithdraw(address indexed sender, uint amount, bytes32 retrievalCode)
                await truffleAssert.eventEmitted(remiWithdrawReceipt, "LogWithdraw", (ev) => {
                    return ev.sender === exchange && testAmount.eq(ev.amount) && ev.retrievalCode === retrievalCodeSecure;
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