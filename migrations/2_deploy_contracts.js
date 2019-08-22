const Remittance = artifacts.require("Remittance");

module.exports = function(deployer) {
  deployer.deploy(Remittance,true,10000,29000,10);
};
