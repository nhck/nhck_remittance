pragma solidity 0.5.8;

import './SafeMath.sol';
import './Stoppable.sol';

/**
 * @title Remittance of Alice' ethereum for the Blockstars course.
 */
contract Remittance is Stoppable {
    using SafeMath for uint;

    event LogWithdrawn(address indexed sender, uint amount, bytes32 retrievalCodeSecure);
    event LogDeposited(address indexed sender, uint amount, uint expiresTimestamp, bytes32 retrievalCodeSecure, uint feePaid);
    event LogDepositReclaimed(address indexed sender, uint amount, bytes32 retrievalCodeSecure);
    event LogTimestampExtended(address indexed sender, uint expiresTimestamp, bytes32 retrievalCodeSecure);
    event LogFeesWithdrawn(address indexed sender, uint amount);

    struct Payment {
        address sender;
        uint amount;
        uint expiresTimestamp;
    }

    mapping(bytes32 => Payment) public payments;

    uint public expiryLimit;

    uint public feeWei = 29000; //actual deployment is 2 915 986 gas, so this seems fair
    uint public feeThresholdPermille = 10;
    uint public feeBalance;

    constructor(bool startRunning, uint setExpiryLimit) Stoppable(startRunning) public {
        expiryLimit = setExpiryLimit;
    }

    /**
     * Allows to create a retrieval Code for the exchange locally
     */
    function createRetrievalCode(string memory plainCode) public pure returns (bytes32 retrievalCode) {
        return keccak256(abi.encodePacked(plainCode));
    }

    /**
     * Allows to create a retrieval Code for the sender locally
     * @param retrievalCode byte32 code generated by createRetrievalCode()
     * @param exchange adress of the recieving exchange
     */
    function createRetrievalCodeSecure(bytes32 retrievalCode, address exchange) public pure returns (bytes32 retrievalCodeSecure) {
        return keccak256(abi.encodePacked(exchange, retrievalCode));
    }

    /**
     * Allows deposit for a retrievalCodeSecure.
     * A fee {feeWei} is deducted of the deposit if the value of {feeThresholdPermille} per mille of the payAmount is larger than the fee.
     *
     * @param retrievalCodeSecure - a double keccak256 hash generated locally using two string parts and the target address
     *
     * @return true on success
     */
    function deposit(bytes32 retrievalCodeSecure, uint expiresTimestamp) onlyIfRunning public payable returns (bool success) {
        uint paymentAmount = msg.value;

        require(paymentAmount > 0, "Please send value to this contract");
        require(retrievalCodeSecure > 0, "Retrieval code needs to be provided");
        require(payments[retrievalCodeSecure].amount == 0, "Retrieval code already in use");
        require(expiresTimestamp > block.timestamp, "Expiry Timestamp should be greater than now");
        require(expiresTimestamp <= block.timestamp.add(expiryLimit), "Expiry Timestamp too far in the future");


        uint feeLog = 0;

        if(paymentAmount.mul(feeThresholdPermille) > feeWei.mul(1000)) {
            feeLog = feeWei;
            paymentAmount = msg.value.sub(feeWei);
            feeBalance = feeBalance.add(feeWei);
        }

        payments[retrievalCodeSecure] = Payment({
            sender : msg.sender,
            amount : paymentAmount,
            expiresTimestamp : expiresTimestamp
            });

        emit LogDeposited(msg.sender, paymentAmount, expiresTimestamp, retrievalCodeSecure, feeLog);

        return true;
    }

    /**
     * Allows withdrawal by providing to parts of the retrievalCode
     *
     * @param retrievalCode  keccak256 hash generated locally and provided by the sender
     *
     * @return bool true on success
     */
    function withdraw(bytes32 retrievalCode) beyondEndOfLifeOrOnlyIfRunning public returns (bool success) {
        bytes32 retrievalCodeSecure = createRetrievalCodeSecure(retrievalCode, msg.sender);

        require(payments[retrievalCodeSecure].expiresTimestamp >= block.timestamp, "Payment expired");
        uint payout = payments[retrievalCodeSecure].amount;

        require(payout > 0, "Retrieval code does not exist or has been used");

        delete (payments[retrievalCodeSecure]);
        emit LogWithdrawn(msg.sender, payout, retrievalCodeSecure);
        msg.sender.transfer(payout);

        return true;
    }

    /**
    * Allows original provider of deposit to reclaim it
    *
    * @param retrievalCodeSecure - a double keccak256 hash generated locally using two string parts and the target address
    *
    * @return true on success
    */
    function reclaim(bytes32 retrievalCodeSecure) beyondEndOfLifeOrOnlyIfRunning public returns (bool success){
        require(payments[retrievalCodeSecure].sender == msg.sender, "Sender must match the record in the retrieval code.");
        require(payments[retrievalCodeSecure].expiresTimestamp < block.timestamp, "Expiry Times not reached.");

        uint payout = payments[retrievalCodeSecure].amount;

        require(payout > 0, "Retrieval code does not exist or has been used");

        payments[retrievalCodeSecure].amount = 0;

        emit LogDepositReclaimed(msg.sender, payout, retrievalCodeSecure);
        msg.sender.transfer(payout);

        return true;
    }

    /**
     * Extend the expiry time of a payment by the sender
     *
     * @param retrievalCodeSecure - a double keccak256 hash generated locally using two string parts and the target address
     * @param extensionSeconds - seconds to add to the original timestamp
     *
     * @return true on success
     */
    function expireTimeExtend(bytes32 retrievalCodeSecure, uint extensionSeconds) onlyIfRunning public returns (bool success) {
        require(payments[retrievalCodeSecure].sender == msg.sender, "Sender must match the record in the retrieval code.");

        uint expiresTimestamp = payments[retrievalCodeSecure].expiresTimestamp.add(extensionSeconds);
        require(expiresTimestamp <= block.timestamp.add(expiryLimit), "Expiry Timestamp too far in the future.");

        emit LogTimestampExtended(msg.sender, expiresTimestamp, retrievalCodeSecure);
        payments[retrievalCodeSecure].expiresTimestamp = expiresTimestamp;

        return true;
    }

    /**
     * The contract owner can withdraw the collected fees
     *
     * @return true on success
     */
    function withdrawFees() onlyOwner beyondEndOfLifeOrOnlyIfRunning public returns (bool success) {
        uint payoutFeeBalance = feeBalance;

        require(payoutFeeBalance > 0, "No Fees collected.");

        feeBalance = 0;

        emit LogFeesWithdrawn(msg.sender,payoutFeeBalance);
        msg.sender.transfer(payoutFeeBalance);
        return true;
    }

    /**
     * The contract owner can withdraw adjust the Fee collection threshold
     *
     * @param newFeeThresholdPermille - threshold in permille.
     *
     * @return true on success
     */
    function adjustThresholdFee(uint newFeeThresholdPermille) onlyOwner public returns (bool success) {
        require(newFeeThresholdPermille <= 1000," Threshold cannot be greater than 1000");
        require(newFeeThresholdPermille > 0," Threshold cannot be 0");

        feeThresholdPermille = newFeeThresholdPermille;

        return true;
    }

    /**
    * The contract owner can withdraw adjust the Fee collection threshold
    *
    * @param newFeeWei - flat fee in Wei.
    *
    * @return true on success
    */
    function adjustFee(uint newFeeWei) onlyOwner public returns (bool success) {
        require(newFeeWei > 0," Fee cannot be 0. To disable fee set fee threshold to 1000.");

        feeWei = newFeeWei;

        return true;
    }
}