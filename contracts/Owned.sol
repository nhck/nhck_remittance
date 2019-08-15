pragma solidity 0.5.8;

contract Owned {
	address private _owner;
	 
	event LogOwnerChanged(address indexed sender, address indexed newOwner);

	modifier onlyOwner {
		require(msg.sender == _owner, "You are not the owner of this contract.");
		_;
	}
	
	constructor() public {
		
		_owner = msg.sender;
		
	}
	
	function changeOwner(address newOwner) public onlyOwner returns(bool success) {
		require(newOwner != address(0),"Invalid address for new Onwer");
	
		_owner = newOwner;
		emit LogOwnerChanged(msg.sender, newOwner);
		
		return true;
	}
	
	function getOwner() public view returns (address owner){
		return _owner;
	}
}