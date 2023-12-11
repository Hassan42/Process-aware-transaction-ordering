# Procress-aware-transaction-ordering

The dataset used in the paper is found in the folder paper_dataset under the format: setup_maliciousNodes_bufferingLength_epochs_attackType

## Dependencies 

```sh
npm install -g truffle
cd src | npm install
```

## Setup the network

```sh
./setup-network.sh [Number of nodes]
```
A new network will be initialized with the QBFT consensus protocol. 
## Start a node

Each node is correspondent to a buyer.

quorum: honest node |
quorumal: displacement node |
quorumal_del: suppression node

In a new terminal:
```sh
./start-member.sh [Node-0, Node-1, ...] [quorum | quorumal | quorumal_del]
```

## Deploy contracts

Nodes need to be started before deploying contracts

```sh
./deploy-contract.sh
```

## Interaction
```sh
cd src
```
### Generate Event Log

```sh
node event_generate.js
```

### Plain Interaction
```sh
node interact_plain.js
```

### OC Interaction

```sh
node interact_ordering.js
```

### Paper Dataset 



### References

Solditiy linked list: https://github.com/vittominacori/solidity-linked-list/blob/master/contracts/StructuredLinkedList.sol