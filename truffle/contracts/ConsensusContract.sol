pragma solidity ^0.8.0;


import "./StructuredLinkedList.sol";
import "./workflowInterface.sol";

contract ConsensusContract{

    using StructuredLinkedList for StructuredLinkedList.List;
    StructuredLinkedList.List public list;

    workflowInterface public workflow_contract;

    uint public block_interval = 2;
    uint public index_block = 0;

    struct pending_interaction{
        uint instance;
        address sender;
        address receiver;
        string task;
        uint id;
        uint block_number;
        int32 domain; 
        bool removed;
    }

    // mapping(uint=>pending_interaction) public pending_interactions;
    pending_interaction[] public pending_interactions;
    uint public pending_interactions_count = 1;

    address[] public orderers; 

    uint public orderers_count = 0;

    int32 public domain_count = 0;

    int32[] public pending_domains;

    uint public vote_count = 0;

    function submit_interaction(uint instance, string memory task) external{
        if (index_block == 0){
            index_block = block.number;
        }
        
        if (block.number < (index_block + block_interval)){
            address[] memory participants = workflow_contract.getParticipantsByTask(instance, task);
            pending_interactions.push(
            pending_interaction(instance, msg.sender, participants[1], task, pending_interactions_count++, block.number , -1, false));
            get_orderers();
        }

        else{
            revert("Transactions list is locked.");
        }
    }
    
    function generate_domains() internal{
        for (uint i = 0; i<pending_interactions.length; i++){

            if (pending_interactions[i].removed == true){continue;}
            int32 new_domain = pending_interactions[i].domain;
            if (new_domain==-1){
                new_domain = domain_count++;
                pending_interactions[i].domain = new_domain;
            }
            bool matched = false;
            for (uint j = 0; j<pending_interactions.length; j++){
                if (i!=j){
                    
                    pending_interaction memory target_interaction = pending_interactions[i];
                    pending_interaction memory next_interaction = pending_interactions[j];

                    if (next_interaction.removed == true){continue;}

                    address target_interaction_sender = target_interaction.sender;
                    address target_interaction_receiver = target_interaction.receiver;

                    address next_interaction_sender = next_interaction.sender;
                    address next_interaction_receiver = next_interaction.receiver;


                    if (target_interaction_sender == next_interaction_sender || target_interaction_sender == next_interaction_receiver
                        || target_interaction_receiver == next_interaction_sender || target_interaction_receiver == next_interaction_receiver){
                        pending_interactions[j].domain = new_domain;
                        matched = true;
                    }
                }
            }
            if (matched==false){StructuredLinkedList.pushFront(list, pending_interactions[i].id);} //add isolated interactions directly to the list
        }   

    }
    
    function get_orderers() internal{
         for (uint i = 0; i < pending_interactions.length;i++){
            for (uint j = 0; j< pending_interactions.length; j++){
                
                if (pending_interactions[i].removed == true || pending_interactions[j].removed == true){continue;}
                if (i==j){continue;}

                if (pending_interactions[i].sender == pending_interactions[j].sender || pending_interactions[i].sender == pending_interactions[j].receiver){
                    if(!is_oderer(pending_interactions[i].sender)){
                        orderers.push(pending_interactions[i].sender);
                        orderers_count+=1;
                    }
                }
                if (pending_interactions[i].receiver == pending_interactions[j].sender || pending_interactions[i].receiver == pending_interactions[j].receiver){
                    if(!is_oderer(pending_interactions[i].receiver)){
                        orderers.push(pending_interactions[i].receiver);
                        orderers_count+=1;
                    }
                }
            }
        }
    }

    function order_interactions(uint[] memory interactionOrder) external{
   
        if(index_block !=0 && block.number >= index_block + block_interval){
            require(is_oderer(msg.sender));
            vote_count +=1;
            if (domain_count==0){generate_domains();}

            uint anchor_interaction = 0; //always first element by default
            for (uint i=0;i<interactionOrder.length;i++){
                if (!allowed_to_order(msg.sender, interactionOrder[i])){revert("Not Allowed To Order.");}
                (pending_interaction memory interaction, uint index) = fetch_interaction_by_id(interactionOrder[i]);
                if(interaction.removed == true){revert("Invalid Interaction.");}
                if(StructuredLinkedList.nodeExists(list, interactionOrder[i])){
                        if(is_after(anchor_interaction, interactionOrder[i])){
                            anchor_interaction = interactionOrder[i];
                        }
                        else{
                            // revert("Conflict");
                            // remove the conflicting interactions and flag the domain
                            for (uint j=0;j<pending_interactions.length;j++){
                                if(pending_interactions[i].domain == interaction.domain){
                                    StructuredLinkedList.remove(list,pending_interactions[i].id);
                                    // pending_interactions[i].removed = true;
                                    removeInteraction(j);
                                }
                            }
                            uint[2] memory conflicting_interactions = [
                                anchor_interaction,interactionOrder[i]
                            ];
                            pending_domains.push(interaction.domain);
                            emit Conflict(interaction.domain, conflicting_interactions);
                            break;
                        }
                    }
                else{
                        StructuredLinkedList.insertAfter(list, anchor_interaction, interactionOrder[i]);
                        anchor_interaction = interactionOrder[i];
                    }
            }
                if(vote_count==orderers_count){
                    execute_interactions();
                }
        }
        else{
            revert("Can't vote now.");
        }
    }

    function execute_interactions() internal{
        uint size = StructuredLinkedList.sizeOf(list);
        uint anchor_interaction = 0;
        bool found = false;
        (found, anchor_interaction) = StructuredLinkedList.getNextNode(list, anchor_interaction);
        for (uint i=0;i<size;i++){
            (pending_interaction memory interaction, uint index) = fetch_interaction_by_id(anchor_interaction);
             (bool next_found, uint next_anchor_interaction) = StructuredLinkedList.getNextNode(list, anchor_interaction);
            if (interaction.removed == false){
            if(!contains(pending_domains, interaction.domain)){
                //execute function
                // console.log(interaction.id);
                execute(interaction.task, interaction.instance);
                StructuredLinkedList.remove(list, anchor_interaction);
                // pending_interactions[index].removed = true;
                removeInteraction(index);
            }
            else{
                //do nothing
            }
            anchor_interaction = next_anchor_interaction;
            }
        }
        //resetting state
        vote_count = 0;
        orderers_count = 0;
        domain_count = 0;
        delete orderers;
        delete pending_domains;
        index_block = 0;
    }

    function execute(string memory task_name, uint instanceID) internal{
        if(compareStrings(task_name, "orderGoods")){workflow_contract.orderGoods(instanceID);}
    }

    function release() external{
        if(index_block !=0 && block.number >= index_block + block_interval && orderers_count==0){
            if (domain_count==0){generate_domains();}
            execute_interactions();
        }
        else{
            revert("Cannot Release");
        }
    }

    function is_oderer(address orderer) internal view returns(bool){
        for(uint i=0;i<orderers.length;i++){
            if (orderer == orderers[i]){
                return true;
            }
        }
        return false;
    }

    function allowed_to_order(address orderer, uint pending_interaction_index) internal view returns(bool){
        (pending_interaction memory interaction, uint index) = fetch_interaction_by_id(pending_interaction_index);
        if(interaction.sender == orderer || interaction.receiver == orderer){
                return true;
            }
        return false;
    }

    function permitted_interactions(address sender) external view returns(uint[] memory){
        uint interaction_count = 0;
        for (uint i=0;i<pending_interactions.length;i++){
            if (pending_interactions[i].removed == true){continue;}
            if ((pending_interactions[i].sender == sender || pending_interactions[i].receiver == sender)){
                interaction_count +=1;
            }
        }
        uint[] memory my_interactions = new uint[](interaction_count);

        uint index = 0;
        for (uint i=0;i<pending_interactions.length;i++){
            if (pending_interactions[i].removed == true){continue;}
            if ((pending_interactions[i].sender == sender || pending_interactions[i].receiver == sender)){
                my_interactions[index++] = pending_interactions[i].id;
            }
        }
        return my_interactions;
    }

    function fetch_interaction_by_id(uint id) internal view returns(pending_interaction memory, uint){
        for (uint i=0;i<pending_interactions.length;i++){
            if(pending_interactions[i].id == id){
                return (pending_interactions[i], i);
            }
        }
        revert("Interaction not found.");
    }

    function get_interaction(uint id) external view returns(pending_interaction memory){
        (pending_interaction memory interaction, uint index) =  fetch_interaction_by_id(id);
        return interaction;
    }

    function contains(int32[] memory array, int32 element) internal pure returns(bool){
        for (uint i=0;i<array.length;i++){
            if (element == array[i]){
                return true;
            }
        }
        return false;
    }

    function is_after(uint node, uint target) internal returns(bool){

        (bool exists, uint256 nextnode) = StructuredLinkedList.getAdjacent(list, node, true);

        if(exists==false || nextnode==0){
            return false;
        }

        if (nextnode == target){
            return true;
        }

        else{
            return is_after(nextnode, target);
        }
    }

    function list_size() external view returns(uint) {
        return StructuredLinkedList.sizeOf(list);
    }
    
    function canVote() public view returns(bool){
        return index_block !=0 && block.number >= index_block + block_interval;
    }

    function blockNB() public view returns(uint){
        return block.number;
    }

    function setWorkflow(address workflowAddress) public{
        workflow_contract = workflowInterface(workflowAddress);
    }

    function orderers_length() external view returns(uint){
        return orderers.length;
    }

    function removeInteraction(uint _index) internal {
        require(_index < pending_interactions.length, "index out of bound");

        for (uint i = _index; i < pending_interactions.length - 1; i++) {
            pending_interactions[i] = pending_interactions[i + 1];
        }
        pending_interactions.pop();
    }

    function compareStrings(string memory a, string memory b) public view returns (bool) {
    return (keccak256(abi.encodePacked((a))) == keccak256(abi.encodePacked((b))));
    }
    event Conflict(int32 indexed domain, uint[2] transactions);
}