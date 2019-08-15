pragma solidity 0.5.8;

import './Stoppable.sol';

/**
 * @title Remittance of Alice' ethereum for the Blockstars course.
 */
contract Remittance is Stoppable {
    event LogWithdraw(address indexed sender, uint amount, bytes32 retrievalCode);
    event LogDeposit(address indexed sender, uint amount, bytes32 retrievalCode);

    struct Payment {
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
    function withdraw(bytes32 retrievalCode) onlyIfRunning public returns (bool) {
        require(retrievalCode > 0, "Retrieval code must be provided");
        bytes32 retrievalCodeSecure = keccak256(abi.encodePacked(msg.sender, retrievalCode));

        require(payments[retrievalCodeSecure].amount > 0, "Retrieval code does not exist or has been used");
        require(payments[retrievalCodeSecure].exchange == msg.sender, "Retrieval code cannot be collected by this sender");


        uint payout = payments[retrievalCodeSecure].amount;
        payments[retrievalCodeSecure].amount = 0;
        emit LogWithdraw(msg.sender, payout, retrievalCodeSecure);
        msg.sender.transfer(payout);
        return true;
    }

    /**
     * Allows deposit for a retrievalCodeSecure
     *
     * @param retrievalCodeSecure - a keccak256 hash generated off-chain using two string parts and the target address
     *
     * @return true on success
     */
    function deposit(bytes32 retrievalCodeSecure, address exchange) onlyOwner onlyIfRunning public payable returns (bool){
        require(msg.value > 0, "Please send value to this contract");
        require(retrievalCodeSecure > 0, "Retrieval code needs to be provided");
        require(exchange != address(0), "Address needs to be provided");
        require(payments[retrievalCodeSecure].amount == 0, "Retrieval code already in use");


        payments[retrievalCodeSecure].amount = msg.value;
        payments[retrievalCodeSecure].exchange = exchange;

        emit LogDeposit(msg.sender, msg.value, retrievalCodeSecure);

        return true;
    }

}
