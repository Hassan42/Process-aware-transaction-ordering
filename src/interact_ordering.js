const Web3  = require('web3');
const fs = require('fs');
const path = require('path');

const web3 = new Web3('http://localhost:22000');

const workflow_contract_abi = require(path.join("../truffle/build/contracts/", "workflow" + '.json')).abi;
const workflow_contract_json = require("../truffle/build/contracts/workflow.json");
const workflow_contract_address = workflow_contract_json.networks["1337"].address;
const workflow_contract = new web3.eth.Contract(workflow_contract_abi, workflow_contract_address);

const ordering_contract_abi = require(path.join("../truffle/build/contracts/", "ConsensusContract" + '.json')).abi;
const ordering_contract_json = require("../truffle/build/contracts/ConsensusContract.json");
const ordering_contract_address = ordering_contract_json.networks["1337"].address;
const ordering_contract = new web3.eth.Contract(ordering_contract_abi, ordering_contract_address);

const event_log = require("./eventLog.json");

if(!event_log){
    throw("Event log is not found.");
}

web3.eth.handleRevert = true


let buyers = {
    "buyer1":{
        "account": new Web3('http://localhost:22000'),
        "privateKey": fs.readFileSync("../QBFT-Network/Node-0/data/keystore/accountPrivateKey").toString(),
    },
    "buyer2":{
        "account": new Web3('http://localhost:22001'),
        "privateKey": fs.readFileSync("../QBFT-Network/Node-1/data/keystore/accountPrivateKey").toString(),
    },
    "buyer3":{
        "account": new Web3('http://localhost:22002'),
        "privateKey": fs.readFileSync("../QBFT-Network/Node-2/data/keystore/accountPrivateKey").toString(),
    }
}


let shops = {
    "shop1":{
        "account": new Web3('http://localhost:22003'),
        "privateKey": fs.readFileSync("../QBFT-Network/Node-3/data/keystore/accountPrivateKey").toString(),
    }
}
var rounds = {};

var totalGas = 0;

// 1. Initiate Accounts

async function create_accounts(){

    for (const buyer of Object.keys(buyers)) {
        const accounts = await buyers[buyer]["account"].eth.getAccounts();
        buyers[buyer]["account"] = accounts[0];
    }
    for (const shop of Object.keys(shops)) {
        const accounts = await shops[shop]["account"].eth.getAccounts();
        shops[shop]["account"] = accounts[0];
    }

}


// 1. Create Instances

async function create_instances(){
    // For every buyer create a new instance (Buyer + Shop)
    for (const buyer of Object.keys(buyers)) {
        const encodedABI = workflow_contract.methods.newInstance([buyers[buyer]["account"],shops["shop1"]["account"],shops["shop1"]["account"]]).encodeABI();
        const signedTx = await signTx(workflow_contract, encodedABI, buyers[buyer]["account"], buyers[buyer]["privateKey"]);
        const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
        const instanceNumber = await workflow_contract.methods.getInstances().call({from: buyers[buyer]["account"]});
        buyers[buyer].instance = instanceNumber;
    }
}

async function setup(){
    //Initializing
    console.log("Setting up...")
    await create_accounts();
    await create_instances();
    await set_workflow_contract();
    await set_ordering_contract();
}

async function interact(roundBuyers) {

    let buyersTxs = [];

    const buyerKeys = roundBuyers;
    
    //First buyer always win the fair order race
    if (!buyers[buyerKeys[0]].fairOrders){buyers[buyerKeys[0]].fairOrders=0;}
    buyers[buyerKeys[0]].fairOrders += 1;

    console.log("order of arrival:", buyerKeys);
    let delay_round = 0;
    for (const buyer of buyerKeys) {
        const instanceNumber = buyers[buyer]["instance"];
        const encodedABI = ordering_contract.methods.submit_interaction(instanceNumber, "orderGoods").encodeABI();
        const signedTx = await signTx(ordering_contract, encodedABI, buyers[buyer]["account"], buyers[buyer]["privateKey"]);
        const isDelay = Math.round(Math.random());
        
        // try{
        // const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction); //we wait to ditribute txs over a block each
        // console.log("From:" + receipt.from + " | " + "TxHash:" + receipt.transactionHash + " | " + "BlockNb:" + receipt.blockNumber + "|" + "Gas:" + receipt.gasUsed);
        // totalGas += receipt.gasUsed;
        // }catch(error){
        //     console.log(error)
        //     console.log(buyer, instanceNumber)
        // }
       

        buyersTxs.push(web3.eth.sendSignedTransaction(signedTx.rawTransaction).on("receipt", 
        (receipt)=>{console.log("From:" + receipt.from + " | " + "TxHash:" + receipt.transactionHash + " | " + "BlockNb:" + receipt.blockNumber + "|" + "Gas:" + receipt.gasUsed);
        totalGas += receipt.gasUsed;}));
        // if(isDelay == 0 && delay_round < 1){console.log("One block delay....");await delay(5000); delay_round += 1;} //to distribute txs over the buffering blocks only delay once to keep all txs in one round
    }

    try{
    await Promise.all(buyersTxs)
    }catch(error){
        console.log("Buyers Transactions Failed...");
    }

    //Keep Checking If We Can Vote
    let canVote = await ordering_contract.methods.canVote().call({from: shops["shop1"]["account"]});
    while(!canVote){
        canVote = await ordering_contract.methods.canVote().call({from: shops["shop1"]["account"]});
    }
    console.log("Voting....");
    let permittedTxs = await ordering_contract.methods.permitted_interactions(shops["shop1"]["account"]).call({from: shops["shop1"]["account"]});
    //permittedTxs = shuffle(permittedTxs); //Random Ordering By The Shop


    let interactions = [];
    for (const tx of permittedTxs) {
        let interaction = await ordering_contract.methods.get_interaction(tx).call({from: shops["shop1"]["account"]});
        for (const buyer of Object.keys(buyers)) {
            if (buyers[buyer]["account"] == interaction.sender){
                const orders = buyers[buyer]["orders"];
                interactions.push([interaction, orders]);
            }
        }
    }

    interactions = interactions.sort(function(a, b) {
        return a[1] - b[1];
      });

    let sortedInteractions = interactions.map((arr)=>arr[0].id);
    
    console.log("Sorted interactions: ", sortedInteractions);

    const encodedABI = ordering_contract.methods.order_interactions(sortedInteractions).encodeABI();
    const signedTx = await signTx(ordering_contract, encodedABI, shops["shop1"]["account"], shops["shop1"]["privateKey"]);
    try{
    const orderingReceipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    console.log("From:" + orderingReceipt.from + " | " + "TxHash:" + orderingReceipt.transactionHash + " | " + "BlockNb:" + orderingReceipt.blockNumber + "|" + "Gas:" + orderingReceipt.gasUsed);
    totalGas += orderingReceipt.gasUsed;}
    catch(error){
        console.log("Voting Failed...");
        await release(); // in case of isolated txs
    }
    await resetSupply();
}
async function result() {
    let orders = [];
    for (const buyer of Object.keys(buyers)) {
        orders.push(resetOrders(buyer));
    }
    await Promise.all(orders);
}

setup().then(async ()=>{
    
    await resetSupply();
    await result();
    let counter = 0;
    var startTimeGlobal = performance.now()
    const firstBlock = await web3.eth.getBlockNumber();
    for (const event of event_log) {
        var startTime = performance.now()
        console.log("Iteration:", counter );
        console.log("Submitting Orders: ");
        const roundBuyers = event.slice(0,3); 
        await interact(roundBuyers);
        console.log("Supplies Per Buyer: ");
        var endTime = performance.now()
        await result();
        if(event[3] == 0){console.log("One block delay....");await delay(5000);} //Inject random delay equivalent to one block to disrupt deterministic order
        console.log(`Time: ${endTime - startTime} milliseconds`)
        rounds[counter] =
            {
                Round: counter++,
                Orders: [buyers["buyer1"].orders, buyers["buyer2"].orders, buyers["buyer3"].orders],
                Time: endTime - startTime, 
                totalGas: totalGas
            }
        totalGas = 0;
    }
    var endTimeGlobal = performance.now()
    const lastBlock = await web3.eth.getBlockNumber(); 
    console.log(buyers);
    rounds.firstBlock = firstBlock;
    rounds.lastBlock = lastBlock;
    rounds.totalTime = endTimeGlobal - startTimeGlobal;
    const rounds_json = JSON.stringify(rounds);
    fs.writeFileSync('rounds_pac.json', rounds_json);
})







const signTx = async (contract, txData, sender, privateKey) => {
    var tx = {
        from: sender,
        to: contract.options.address,
        gas: 300000000,
        data: txData,
    };
    return await web3.eth.accounts.signTransaction(tx, privateKey);
};

const set_workflow_contract = async () => {
    const encodedABI = ordering_contract.methods.setWorkflow(workflow_contract.options.address).encodeABI();
    const signedTx = await signTx(ordering_contract, encodedABI, buyers["buyer1"]["account"], buyers["buyer1"]["privateKey"]);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    return receipt;
};

const set_ordering_contract = async () => {
    const encodedABI = workflow_contract.methods.setOrderingContract(ordering_contract.options.address).encodeABI();
    const signedTx = await signTx(workflow_contract, encodedABI, buyers["buyer1"]["account"], buyers["buyer1"]["privateKey"]);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    return receipt;
};

const resetSupply = async () => {
    const encodedABI = workflow_contract.methods.setSupplies(1).encodeABI();
    const signedTx = await signTx(workflow_contract, encodedABI, shops["shop1"]["account"], shops["shop1"]["privateKey"]);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
};

const resetOrders = async (buyer) => {
    const orders = await workflow_contract.methods.getPendingOrders(buyers[buyer]["account"]).call({from: buyers[buyer]["account"]});
    if (!buyers[buyer].orders){buyers[buyer].orders=0;}
    buyers[buyer].orders += parseInt(orders);
    console.log(buyer, ":", buyers[buyer].orders);
    //Reset
    const encodedABI = workflow_contract.methods.resetPendingOrders(buyers[buyer]["account"]).encodeABI();
    const signedTx = await signTx(workflow_contract, encodedABI, buyers[buyer]["account"], buyers[buyer]["privateKey"]);
    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
};

const release = async () =>{
    const encodedABI = ordering_contract.methods.release().encodeABI();
    const signedTx = await signTx(ordering_contract, encodedABI, shops["shop1"]["account"], shops["shop1"]["privateKey"]);
    try{
    const releaseReceipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    totalGas += releaseReceipt.gasUsed;
    // console.log("From:" + orderingReceipt.from + " | " + "TxHash:" + orderingReceipt.transactionHash + " | " + "BlockNb:" + orderingReceipt.blockNumber + "|" + "Gas:" + orderingReceipt.gasUsed)
    }
    catch(error){
        console.log("Release Failed...");
    }
}

const shuffle = (array) => { 
    for (let i = array.length - 1; i > 0; i--) { 
      const j = Math.floor(Math.random() * (i + 1)); 
      [array[i], array[j]] = [array[j], array[i]]; 
    } 
    return array; 
  }; 

const delay = (delayInms) => {
return new Promise(resolve => setTimeout(resolve, delayInms));
};