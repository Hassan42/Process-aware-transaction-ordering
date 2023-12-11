pragma solidity ^0.8.0;

import './workflowInterface.sol';

contract WorkflowOld is workflowInterface{

    string[] roleList = ["Bulk_Buyer", "Manufacturer", "Supplier"];
    string[] taskList = ["orderGoods", "orderSupplies", "replenishSupplies", "deliverGoods"];
    mapping(string=>string[]) rolesToTask;

    mapping(uint=>address) candidates;
    uint candidatesCount;
    address[] public new_candidates_test;
    uint blockNumber = 0;

    address public orderingContract;

    struct workflowInstance{
        uint workflowID;
        mapping(string=>bool) tasks_state;
        mapping(string=>address) participants;
    }
 
    mapping(uint => workflowInstance) instances;
    uint public instancesCount;

    mapping(address=>uint) pending_orders;
    uint supplies = 100;

    // modifier checkRole(string memory role, uint instanceID){
    //     require(msg.sender == instances[instanceID].participants[role]);
    //     _;
    // }


    constructor() public {
        rolesToTask["orderGoods"] = ["Bulk_Buyer","Manufacturer"];
        rolesToTask["orderSupplies"] = ["Manufacturer","Supplier"];
        rolesToTask["replenishSupplies"] = ["Supplier","Bulk_Buyer"];
        rolesToTask["deliverGoods"] = ["Manufacturer","Bulk_Buyer"];
    }

    function newInstance(address[] calldata participant) override external {

        instancesCount++;
        instances[instancesCount].workflowID = instancesCount;
        instances[instancesCount].participants["Bulk_Buyer"] = participant[0];
        instances[instancesCount].participants["Manufacturer"] = participant[1];
        instances[instancesCount].participants["Supplier"] = participant[2];

        instances[instancesCount].tasks_state["orderGoods"] = true;
        instances[instancesCount].tasks_state["orderSupplies"] = false;
        instances[instancesCount].tasks_state["replenishSupplies"] = false;
        instances[instancesCount].tasks_state["deliverGoods"] = false;
    }


    function orderGoods(uint instanceID) override external 
     {
        require(instances[instanceID].tasks_state["orderGoods"] == true , "Wrong execution order");
       
        if(supplies <= 0){
            // instances[instanceID].tasks_state["orderGoods"] = false;
            instances[instanceID].tasks_state["orderSupplies"] = true;
        }
        else{
            supplies -=1;
            address buyer = instances[instanceID].participants["Bulk_Buyer"];
            pending_orders[buyer] +=1;
            // instances[instanceID].tasks_state["orderGoods"] = false;
            instances[instanceID].tasks_state["deliverGoods"] = true;
        }
    }

    function orderSupplies(uint instanceID) override external 
     {
        require(instances[instanceID].tasks_state["orderSupplies"] == true, "Wrong execution order");
        instances[instanceID].tasks_state["orderSupplies"] = false;
        instances[instanceID].tasks_state["replenishSupplies"] = true;
    }

    function replenishSupplies(uint instanceID) override external 
     {
        require(instances[instanceID].tasks_state["replenishSupplies"] == true, "Wrong execution order");
        supplies +=1;
        instances[instanceID].tasks_state["replenishSupplies"] = false;
        instances[instanceID].tasks_state["deliverGoods"] = true;
    }

    function deliverGoods(uint instanceID) override external 
     {
        require(instances[instanceID].tasks_state["deliverGoods"] == true, "Wrong execution order");
        pending_orders[instances[instanceID].participants["Bulk_Buyer"]] -=1;
        instances[instanceID].tasks_state["deliverGoods"] = false;
        instances[instanceID].tasks_state["orderGoods"] = true;
    }

    function getSupplies() override external  view returns(uint){
        return supplies;
    }

    function getInstances() override external view returns(uint){
        return instancesCount;
    }

    function getPendingOrders(address buyer) override external  view returns(uint){
        return pending_orders[buyer];
    }

    function getParticipantsByTask(uint instance, string memory task_name) override external view returns(address[] memory){
        require(instances[instance].tasks_state[task_name] == true);
        address[] memory participants = new address[](2);
        string[] memory roles = rolesToTask[task_name];
        participants[0] = instances[instance].participants[roles[0]];
        participants[1] = instances[instance].participants[roles[1]];
        return participants;
    }

    function setOrderingContract(address orderingContractAddress) external{
        orderingContract = orderingContractAddress;
    }

    function setSupplies(uint newSupplies) external{
        supplies = newSupplies;
    }

    function resetPendingOrders(address buyer) external{
        pending_orders[buyer] = 0;
    }
}
