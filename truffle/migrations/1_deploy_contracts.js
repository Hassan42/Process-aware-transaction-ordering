const Workflow = artifacts.require("Workflow");
const WorkflowOld = artifacts.require("WorkflowOld");
const StructuredLinkedList = artifacts.require("StructuredLinkedList");
const ConsensusContract = artifacts.require("ConsensusContract");

module.exports = function(deployer) {
  deployer.deploy(Workflow);
  deployer.deploy(WorkflowOld);
  deployer.deploy(StructuredLinkedList);
  deployer.link(StructuredLinkedList, ConsensusContract);
  deployer.deploy(ConsensusContract);
};
