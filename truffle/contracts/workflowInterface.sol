pragma solidity ^0.8.0;


interface workflowInterface {

    function newInstance(address[] calldata participant) external;
    function orderGoods(uint instanceID) external;
    function orderSupplies(uint instanceID) external;
    function replenishSupplies(uint instanceID) external;
    function deliverGoods(uint instanceID) external;
    function getSupplies() external view returns(uint);
    function getInstances() external view returns(uint);
    function getPendingOrders(address buyer) external view returns(uint);
    function getParticipantsByTask(uint instance, string memory task_name) external view returns(address[] memory);
    // function getCandidate() external returns(address[] memory);
}