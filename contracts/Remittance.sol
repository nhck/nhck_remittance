pragma solidity 0.5.8;

import './Stoppable.sol';

/**
 * @title Remittance of Alice' ethereum for the Blockstars course.
 */
contract Remittance is Stoppable {
    event LogWithdrawn(address indexed sender, uint amount, bytes32 retrievalCode);
    event LogDeposited(address indexed sender, uint amount, bytes32 retrievalCode);
    event LogDepositReclaimed(address indexed sender, uint amount, bytes32 retrievalCode);

    struct Payment {
        address sender;
        uint amount;
        address exchange;
    }

    mapping(bytes32 => Payment) public payments;

    constructor(bool startRunning) Stoppable(startRunning) public {}

    /**
     * Allows withdrawel by providing to parts of the retrievalCode
     *
     * @param retrievalCode provided by the customer
     *
     * @return bool true on success
     */
    function withdraw(bytes32 retrievalCode) beyondEndOfLifeOrOnlyIfRunning public returns (bool success) {
        require(retrievalCode > 0, "Retrieval code must be provided");
        bytes32 retrievalCodeSecure = keccak256(abi.encodePacked(msg.sender, retrievalCode));

        require(payments[retrievalCodeSecure].amount > 0, "Retrieval code does not exist or has been used");

        uint payout = payments[retrievalCodeSecure].amount;
        payments[retrievalCodeSecure].amount = 0;
        emit LogWithdrawn(msg.sender, payout, retrievalCodeSecure);
        msg.sender.transfer(payout);

        return true;
    }

    /**
     * Allows deposit for a retrievalCodeSecure
     *
     * @param retrievalCodeSecure - a double keccak256 hash generated locally using two string parts and the target address
     *
     * @return true on success
     */
    function deposit(bytes32 retrievalCodeSecure, address exchange) onlyIfRunning public payable returns (bool success){
        require(msg.value > 0, "Please send value to this contract");
        require(retrievalCodeSecure > 0, "Retrieval code needs to be provided");
        require(exchange != address(0), "Address needs to be provided");
        require(payments[retrievalCodeSecure].amount == 0, "Retrieval code already in use");


        payments[retrievalCodeSecure].sender = msg.sender;
        payments[retrievalCodeSecure].amount = msg.value;
        payments[retrievalCodeSecure].exchange = exchange;

        emit LogDeposited(msg.sender, msg.value, retrievalCodeSecure);

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
        require(payments[retrievalCodeSecure].amount > 0, "Retrieval code does not exist or has been used");

        uint payout = payments[retrievalCodeSecure].amount;
        payments[retrievalCodeSecure].amount = 0;
        emit LogDepositReclaimed(msg.sender, payout, retrievalCodeSecure);
        msg.sender.transfer(payout);

        return true;
    }

    /**
     * Allows to create a retrieval Code for the sender locally
     */
    function createRetrievalCodeSecure(string memory partOne, string memory partTwo, address exchange) public pure returns (bytes32 retrievalCodeSecure) {
        return keccak256(abi.encodePacked(exchange, keccak256(abi.encodePacked(partOne, partTwo))));
    }

    /**
    * Allows to create a retrieval Code for the exchange locally
    */
    function createRetrievalCode(string memory partOne, string memory partTwo) public pure returns (bytes32 retrievalCodeSecure) {
        return keccak256(abi.encodePacked(partOne, partTwo));
    }

}
