pragma solidity 0.5.8;

import './Owned.sol';
import "./Migrations.sol";

contract Stoppable is Owned {
    bool private isRunning;
    bool private isKill;
    bool private isEOL;

    event LogPausedContract(address indexed sender);
    event LogResumedContract(address indexed sender);
    event LogKilledContract(address indexed sender);
    event LogInitializedEndOfLifeOfContract(address indexed sender);
    event LogEndedEndOfLifeOfContract(address indexed sender);

    modifier onlyIfRunning {
        require(isRunning,"Contract must be running.");
        _;
    }

    modifier onlyIfPaused {
        require(!isRunning,"Contract must be paused.");
        _;
    }

    modifier onlyIfAlive {
        require(!isKill,"Contract must be alive.");
        _;
    }

    modifier beyondEndOfLifeOrOnlyIfRunning {
        require(isEOL || isRunning,"Contract must either be running or have a life after pause.");
        _;
    }

    modifier onlyIfEndOfLifeIsReached {
        require(!isEOL,"Contract must not be allowed a life after pause.");
        _;
    }

    /**
     *
     * @param startRunning true to start the contract in running mode, false to start stopped
     */
    constructor(bool startRunning) public {
        isRunning = startRunning;
    }

    function pauseContract() public onlyOwner onlyIfRunning returns (bool success) {
        isRunning = false;
        emit LogPausedContract(msg.sender);
        return true;
    }

    function resumeContract() public onlyOwner onlyIfAlive onlyIfPaused returns (bool success) {
        isRunning = true;
        emit LogResumedContract(msg.sender);
        return true;
    }

    function killContract() public onlyOwner onlyIfPaused onlyIfEndOfLifeIsReached returns (bool success) {
        isKill = true;
        emit LogKilledContract(msg.sender);
        return true;
    }

    function initEndOfLifeContract() public onlyOwner onlyIfAlive onlyIfPaused returns (bool success) {
        isEOL = true;

        emit LogInitializedEndOfLifeOfContract(msg.sender);
        return true;
    }

    function endEndOfLifeContract() public onlyOwner onlyIfAlive onlyIfPaused returns (bool success) {
        isEOL = false;

        emit LogEndedEndOfLifeOfContract(msg.sender);
        return true;
    }
}