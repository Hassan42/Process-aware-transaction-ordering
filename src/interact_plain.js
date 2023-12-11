const Web3  = require('web3'); 
const fs = require('fs');
const path = require('path');

const web3 = new Web3('http://localhost:22000');

const workflow_contract_abi = require(path.join("../truffle/build/contracts/", "workflowOld" + '.json')).abi;
const workflow_contract_json = require("../truffle/build/contracts/WorkflowOld.json");
const workflow_contract_address = workflow_contract_json.networks["1337"].address;
const workflow_contract = new web3.eth.Contract(workflow_contract_abi, workflow_contract_address);

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
        const encodedABI = workflow_contract.methods.newInstance([buyers[buyer]["account"],buyers[buyer]["account"],buyers[buyer]["account"]]).encodeABI();
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
}

async function interact(roundBuyers) {
    let buyersTxs = [];
    //Submit Order Goods Interactions From Two Buyers 

    const buyerKeys = roundBuyers;
    
    if (!buyers[buyerKeys[0]].fairOrders){buyers[buyerKeys[0]].fairOrders=0;}
    buyers[buyerKeys[0]].fairOrders += 1;

    console.log("order of arrival:", buyerKeys);
    for (const buyer of buyerKeys) {
        const instanceNumber = buyers[buyer]["instance"];
        const encodedABI = workflow_contract.methods.orderGoods(instanceNumber).encodeABI();
        const signedTx = await signTx(workflow_contract, encodedABI, buyers[buyer]["account"], buyers[buyer]["privateKey"]);
        buyersTxs.push(web3.eth.sendSignedTransaction(signedTx.rawTransaction).on("receipt", (receipt)=>{console.log("From:" + receipt.from + " | " + "TxHash:" + receipt.transactionHash + " | " + "BlockNb:" + receipt.blockNumber);
        totalGas+=receipt.gasUsed;}));
    }

    try{
    await Promise.all(buyersTxs)
    }catch(error){
        console.log("Buyers Transactions Failed...");
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
        console.log("Submitting Orders: ")
        const roundBuyers = event.slice(0,3); 
        await interact(roundBuyers);
        console.log("Supplies Per Buyer: ")
        var endTime = performance.now()
        await result();
        if(event[3] == 0){console.log("One block delay....");await delay(5000);} //Inject random delay equivalent to one block to disrupt deterministic order
        console.log(`Time: ${endTime - startTime} milliseconds`);
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
    fs.writeFileSync('rounds_plain.json', rounds_json);
})


const signTx = async (contract, txData, sender, privateKey) => {
    // var encodedABI = workflow_contract.methods.newInstance([buyers[0],shops[0],shops[0]]).encodeABI();
    var tx = {
        from: sender,
        to: contract.options.address,
        gas: 3000000,
        data: txData,
    };
    return await web3.eth.accounts.signTransaction(tx, privateKey);
    
    // .then(signed => {
    //     web3.eth.sendSignedTransaction(signed.rawTransaction).on('receipt', console.log)
    // })
}

const resetSupply = async () => {
    const encodedABI = workflow_contract.methods.setSupplies(1).encodeABI();
    const signedTx = await signTx(workflow_contract, encodedABI, shops["shop1"]["account"], shops["shop1"]["privateKey"]);
    const receipt = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

const resetOrders = async (buyer) => {
    const orders = await workflow_contract.methods.getPendingOrders(buyers[buyer]["account"]).call({from: buyers[buyer]["account"]});
    if (!buyers[buyer].orders){buyers[buyer].orders=0;}
    buyers[buyer].orders += parseInt(orders);
    console.log(buyer, ":", buyers[buyer].orders);
    //Reset
    const encodedABI = workflow_contract.methods.resetPendingOrders(buyers[buyer]["account"]).encodeABI();
    const signedTx = await signTx(workflow_contract, encodedABI, buyers[buyer]["account"], buyers[buyer]["privateKey"]);
    return web3.eth.sendSignedTransaction(signedTx.rawTransaction);
}

const shuffle = (array) => { 
    for (let i = array.length - 1; i > 0; i--) { 
      const j = Math.floor(Math.random() * (i + 1)); 
      [array[i], array[j]] = [array[j], array[i]]; 
    } 
    return array; 
}

const delay = (delayInms) => {
    return new Promise(resolve => setTimeout(resolve, delayInms));
  };
