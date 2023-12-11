#!/bin/sh


NODES_NB=$1
PORT=30300
parent_path=$( cd "$(dirname "${BASH_SOURCE[0]}")" ; pwd -P )

# git clone https://github.com/Consensys/quorum.git
# cd quorum
# make all

GETH=${parent_path}/quorum/build/bin/geth

rm -r ${parent_path}/QBFT-Network

mkdir ${parent_path}/QBFT-Network

cd ${parent_path}/QBFT-Network

OUTPUT=$(npx quorum-genesis-tool --consensus qbft --chainID 1337 --blockperiod 5 --emptyBlockPeriod 5 --requestTimeout 10 --epochLength 30000 --difficulty 1 --gasLimit '0xFFFFFF' --coinbase '0x0000000000000000000000000000000000000000' --validators ${NODES_NB} --members 0 --bootnodes 0 --outputPath 'artifacts' | grep "artifacts/" | cut -d ' ' -f4)

mv ${OUTPUT}/* artifacts

cd artifacts/goQuorum

sed 's/<HOST>/localhost:/' static-nodes.json >> static-nodes-new.json

mv static-nodes-new.json static-nodes.json

for i in `seq 0 $((NODES_NB-1))`
do
    mkdir -p ${parent_path}/QBFT-Network/Node-${i}/data/keystore  
    awk '/:30303/ && ++count==1{sub(/:30303/,'"$((PORT+i))"')} 1' static-nodes.json >> static-nodes-new.json
    mv static-nodes-new.json static-nodes.json
done

cp static-nodes.json permissioned-nodes.json

# cd ${parent_path}/contracts
# solc --optimize --bin-runtime --evm-version=byzantium --overwrite -o . ValidatorSmartContractAllowList.sol

# cd ${parent_path}/scripts
# npm install
# node createContent.js